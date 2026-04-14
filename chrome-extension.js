// ═══════════════════════════════════════════════════════════════
// FILE: extension/manifest.json
// ═══════════════════════════════════════════════════════════════
/*
{
  "manifest_version": 3,
  "name": "Scribe AI Recorder",
  "version": "1.0.0",
  "description": "Record any workflow and auto-generate step-by-step documentation.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon48.png"
  },
  "background": {
    "service_worker": "background/worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/recorder.js"],
      "run_at": "document_idle"
    }
  ],
  "permissions": [
    "storage",
    "tabs",
    "scripting",
    "activeTab"
  ],
  "host_permissions": ["<all_urls>"],
  "web_accessible_resources": [
    {
      "resources": ["content/overlay.css"],
      "matches": ["<all_urls>"]
    }
  ]
}
*/


// ═══════════════════════════════════════════════════════════════
// FILE: extension/content/recorder.js
// Content script — injected into every page
// ═══════════════════════════════════════════════════════════════

(function ScribeRecorder() {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  let isRecording = false;
  let sessionId = null;
  let sequence = 0;
  let lastUrl = location.href;
  let overlay = null;

  // ── Sensitive field detection ───────────────────────────────
  const SENSITIVE_TYPES = new Set(['password', 'credit-card', 'card-number', 'cvv', 'ssn']);
  const SENSITIVE_LABELS = /password|passwd|secret|credit.?card|card.?number|cvv|ssn|social.?security/i;

  function isSensitiveField(el) {
    if (el.type === 'password') return true;
    const label = getElementLabel(el);
    if (SENSITIVE_LABELS.test(label)) return true;
    const autocomplete = el.getAttribute('autocomplete') || '';
    if (SENSITIVE_TYPES.has(autocomplete)) return true;
    return false;
  }

  // ── Element helpers ─────────────────────────────────────────
  function getElementLabel(el) {
    // 1. aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    // 2. associated <label>
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim();
    }
    // 3. placeholder
    if (el.placeholder) return el.placeholder;
    // 4. visible text (buttons, links)
    if (el.textContent) return el.textContent.trim().slice(0, 80);
    // 5. title
    if (el.title) return el.title;
    return '';
  }

  function getCssSelector(el) {
    try {
      const parts = [];
      let curr = el;
      while (curr && curr !== document.body) {
        let sel = curr.tagName.toLowerCase();
        if (curr.id) {
          sel += '#' + CSS.escape(curr.id);
          parts.unshift(sel);
          break;
        }
        if (curr.className) {
          sel += '.' + [...curr.classList].slice(0, 2).map(c => CSS.escape(c)).join('.');
        }
        const siblings = curr.parentElement
          ? [...curr.parentElement.children].filter(c => c.tagName === curr.tagName)
          : [];
        if (siblings.length > 1) {
          sel += `:nth-of-type(${siblings.indexOf(curr) + 1})`;
        }
        parts.unshift(sel);
        curr = curr.parentElement;
      }
      return parts.join(' > ').slice(0, 200);
    } catch {
      return '';
    }
  }

  // ── Screenshot capture ──────────────────────────────────────
  async function captureScreenshot() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, response => {
        resolve(response?.dataUrl || null);
      });
    });
  }

  // ── Event dispatching ───────────────────────────────────────
  async function dispatchEvent(eventData) {
    if (!isRecording || !sessionId) return;
    const screenshot = await captureScreenshot();
    const payload = {
      type: 'RECORDING_EVENT',
      sessionId,
      event: {
        sequence: sequence++,
        timestamp: Date.now(),
        url: location.href,
        pageTitle: document.title,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        screenshotDataUrl: screenshot,
        ...eventData,
      },
    };
    chrome.runtime.sendMessage(payload);
  }

  // ── Click listener ──────────────────────────────────────────
  function handleClick(e) {
    if (!isRecording) return;
    const el = e.target;
    const label = getElementLabel(el);
    const selector = getCssSelector(el);
    dispatchEvent({
      type: 'CLICK',
      elementTag: el.tagName.toLowerCase(),
      elementLabel: label,
      elementRole: el.getAttribute('role') || el.tagName.toLowerCase(),
      selector,
      clickX: e.clientX,
      clickY: e.clientY,
      isSensitive: false,
    });
  }

  // ── Input listener (debounced, label only — never value) ────
  let inputDebounce = null;
  function handleInput(e) {
    if (!isRecording) return;
    const el = e.target;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    const sensitive = isSensitiveField(el);
    clearTimeout(inputDebounce);
    inputDebounce = setTimeout(() => {
      dispatchEvent({
        type: sensitive ? 'INPUT' : 'INPUT',
        elementTag: el.tagName.toLowerCase(),
        inputLabel: getElementLabel(el),
        elementRole: 'textbox',
        selector: getCssSelector(el),
        isSensitive: sensitive,
        // value is NEVER captured — only label
      });
    }, 600);
  }

  // ── URL change detection (SPA navigation) ──────────────────
  function checkNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      dispatchEvent({
        type: 'PAGE_VISIT',
        elementLabel: document.title,
      });
    }
  }

  // ── Overlay indicator ───────────────────────────────────────
  function showOverlay() {
    overlay = document.createElement('div');
    overlay.id = '__scribe_overlay';
    overlay.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      background: rgba(239,68,68,0.92); color: #fff;
      font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600;
      padding: 6px 14px; border-radius: 20px;
      display: flex; align-items: center; gap: 7px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.25);
      pointer-events: none;
    `;
    const dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;animation:scribe-blink 1.2s infinite';
    const style = document.createElement('style');
    style.textContent = '@keyframes scribe-blink{0%,100%{opacity:1}50%{opacity:0.3}}';
    document.head.appendChild(style);
    overlay.appendChild(dot);
    overlay.appendChild(document.createTextNode('Scribe is recording'));
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    overlay?.remove();
    overlay = null;
  }

  // ── Message handler ─────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'START_RECORDING') {
      isRecording = true;
      sessionId = msg.sessionId;
      sequence = 0;
      lastUrl = location.href;
      showOverlay();
      // Capture initial page
      dispatchEvent({ type: 'PAGE_VISIT', elementLabel: document.title });
      // Set up nav polling
      window.__scribeNavInterval = setInterval(checkNavigation, 500);
      sendResponse({ ok: true });
    }
    if (msg.type === 'STOP_RECORDING') {
      isRecording = false;
      sessionId = null;
      clearInterval(window.__scribeNavInterval);
      removeOverlay();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ── Attach listeners ────────────────────────────────────────
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleInput, true);

})();


// ═══════════════════════════════════════════════════════════════
// FILE: extension/background/worker.js
// Service Worker — manages session state and relays to API
// ═══════════════════════════════════════════════════════════════

const API_BASE = 'https://your-app.vercel.app/api';

let activeSession = null;
let eventQueue = [];
let flushInterval = null;

// ── Screenshot capture ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 70 }, dataUrl => {
      sendResponse({ dataUrl: dataUrl || null });
    });
    return true; // async
  }

  if (msg.type === 'RECORDING_EVENT') {
    if (activeSession) {
      eventQueue.push(msg.event);
    }
    return false;
  }

  if (msg.type === 'START_SESSION') {
    startSession(msg.authToken).then(session => sendResponse(session));
    return true;
  }

  if (msg.type === 'STOP_SESSION') {
    stopSession().then(guide => sendResponse(guide));
    return true;
  }
});

async function startSession(authToken) {
  const res = await fetch(`${API_BASE}/recordings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ status: 'RECORDING' }),
  });
  const recording = await res.json();
  activeSession = { id: recording.id, authToken };
  eventQueue = [];
  // Flush events every 3 seconds
  flushInterval = setInterval(flushEvents, 3000);
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', sessionId: recording.id })
      .catch(() => {}); // ignore tabs without content script
  });
  return recording;
}

async function flushEvents() {
  if (!activeSession || eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, eventQueue.length);
  try {
    await fetch(`${API_BASE}/recordings/${activeSession.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeSession.authToken}` },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Re-queue on failure
    eventQueue.unshift(...batch);
  }
}

async function stopSession() {
  if (!activeSession) return null;
  clearInterval(flushInterval);
  await flushEvents(); // flush remaining
  const res = await fetch(`${API_BASE}/recordings/${activeSession.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeSession.authToken}` },
  });
  const result = await res.json();
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' }).catch(() => {});
  });
  activeSession = null;
  return result; // returns { guideId } after AI processing
}


// ═══════════════════════════════════════════════════════════════
// FILE: extension/popup/popup.html
// ═══════════════════════════════════════════════════════════════
/*
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 280px; font-family: system-ui, sans-serif; padding: 16px; color: #111; }
    .logo { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .logo-mark { width: 28px; height: 28px; background: #F59E0B; border-radius: 6px; }
    .logo-text { font-weight: 700; font-size: 15px; }
    .status { padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
    .status.idle { background: #f3f4f6; color: #6b7280; }
    .status.recording { background: #fef2f2; color: #ef4444; display: flex; align-items: center; gap: 6px; }
    .rec-dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: blink 1.2s infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    button { width: 100%; padding: 10px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-start { background: #F59E0B; color: #fff; }
    .btn-stop { background: #ef4444; color: #fff; }
    .btn-dash { background: #f3f4f6; color: #374151; margin-top: 8px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-mark"></div>
    <div class="logo-text">Scribe AI</div>
  </div>
  <div class="status idle" id="status">Ready to record</div>
  <button class="btn-start" id="main-btn">Start recording</button>
  <button class="btn-dash" onclick="chrome.tabs.create({url:'https://your-app.vercel.app/dashboard'})">
    Open dashboard ↗
  </button>
  <script src="popup.js"></script>
</body>
</html>
*/
