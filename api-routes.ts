// ═══════════════════════════════════════════════════════════════
// Scribe AI — API Routes (Next.js App Router)
// All routes under /app/api/
// Auth via Clerk middleware on all protected routes
// ═══════════════════════════════════════════════════════════════

// ─── RECORDINGS ─────────────────────────────────────────────
// POST   /api/recordings              — Start a new recording session
// GET    /api/recordings              — List recordings for org
// GET    /api/recordings/:id          — Get recording + events
// POST   /api/recordings/:id/events   — Append events (batched from extension)
// POST   /api/recordings/:id/complete — Stop recording, trigger AI processing
// DELETE /api/recordings/:id          — Delete recording

// ─── GUIDES ─────────────────────────────────────────────────
// GET    /api/guides                  — List guides (with filters, search, pagination)
// POST   /api/guides                  — Create guide (blank or from recording)
// GET    /api/guides/:id              — Get guide + steps
// PATCH  /api/guides/:id              — Update guide metadata
// DELETE /api/guides/:id              — Delete guide
// POST   /api/guides/:id/duplicate    — Duplicate a guide
// POST   /api/guides/:id/archive      — Archive guide
// POST   /api/guides/:id/publish      — Publish guide
// POST   /api/guides/:id/rewrite-tone — Rewrite with new tone (AI)
// GET    /api/guides/:id/versions     — List versions
// POST   /api/guides/:id/versions     — Create version snapshot
// GET    /api/guides/:id/versions/:vid — Get specific version
// POST   /api/guides/:id/versions/:vid/restore — Restore version

// ─── GUIDE STEPS ────────────────────────────────────────────
// GET    /api/guides/:id/steps        — Get all steps (ordered)
// POST   /api/guides/:id/steps        — Add a step
// PATCH  /api/guides/:id/steps/:sid   — Update step
// DELETE /api/guides/:id/steps/:sid   — Delete step
// POST   /api/guides/:id/steps/reorder — Reorder steps (drag-drop)
// POST   /api/guides/:id/steps/:sid/screenshot — Upload/replace screenshot

// ─── AI ─────────────────────────────────────────────────────
// POST   /api/ai/generate             — Generate guide from recording events
// POST   /api/ai/suggestions          — Get cleanup/improvement suggestions
// POST   /api/ai/group-sections       — Auto-assign section labels
// POST   /api/ai/detect-sensitive     — Detect sensitive content in steps
// POST   /api/ai/master-sop           — Synthesize multiple guides into master SOP

// ─── SHARING ────────────────────────────────────────────────
// GET    /api/guides/:id/shares       — List share links
// POST   /api/guides/:id/shares       — Create share link
// DELETE /api/guides/:id/shares/:sid  — Revoke share link
// GET    /api/share/:token            — Public: get shared guide (no auth)
// POST   /api/guides/:id/export/pdf   — Generate PDF, return signed S3 URL

// ─── FOLDERS ────────────────────────────────────────────────
// GET    /api/folders                 — List folders for org
// POST   /api/folders                 — Create folder
// PATCH  /api/folders/:id             — Update folder
// DELETE /api/folders/:id             — Delete folder
// POST   /api/folders/:id/move        — Move guide into folder

// ─── COMMENTS ───────────────────────────────────────────────
// GET    /api/guides/:id/comments     — Get comments (with replies)
// POST   /api/guides/:id/comments     — Add comment
// PATCH  /api/guides/:id/comments/:cid — Edit comment
// DELETE /api/guides/:id/comments/:cid — Delete comment
// POST   /api/guides/:id/comments/:cid/resolve — Mark resolved

// ─── ANALYTICS ──────────────────────────────────────────────
// GET    /api/analytics               — Org-level analytics summary
// GET    /api/analytics/guides        — Per-guide breakdown
// POST   /api/analytics/track         — Public: track view event (no auth)

// ─── ORGANIZATIONS ──────────────────────────────────────────
// GET    /api/org                     — Get current org settings
// PATCH  /api/org                     — Update org settings
// GET    /api/org/members             — List members
// POST   /api/org/members/invite      — Invite member by email
// PATCH  /api/org/members/:uid        — Update member role
// DELETE /api/org/members/:uid        — Remove member

// ─── FILES ──────────────────────────────────────────────────
// POST   /api/upload/screenshot       — Get presigned S3 URL for screenshot upload

// ═══════════════════════════════════════════════════════════════
// EXAMPLE IMPLEMENTATION: POST /api/recordings/:id/complete
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { generateGuideFromRecording } from '@/lib/ai/pipeline';
import { uploadScreenshots } from '@/lib/storage';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const recording = await prisma.recording.findUnique({
    where: { id: params.id },
    include: { events: { orderBy: { sequence: 'asc' } } },
  });

  if (!recording) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (recording.authorId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Mark as processing
  await prisma.recording.update({
    where: { id: params.id },
    data: { status: 'PROCESSING', endedAt: new Date() },
  });

  // Upload screenshots to S3 (async, don't await here for perf)
  const screenshotMap = await uploadScreenshots(recording.events);

  // Generate guide via AI pipeline
  const aiGuide = await generateGuideFromRecording(recording.events);

  // Create guide + steps in DB
  const guide = await prisma.guide.create({
    data: {
      title: aiGuide.title,
      summary: aiGuide.summary,
      tags: aiGuide.tags,
      organizationId: recording.organizationId,
      authorId: userId,
      recordingId: recording.id,
      status: 'DRAFT',
      steps: {
        create: aiGuide.steps.map((step: any) => ({
          order: step.order,
          title: step.title,
          instruction: step.instruction,
          sectionLabel: step.sectionLabel,
          eventType: step.eventType,
          elementLabel: step.elementLabel,
          url: step.url,
          tip: step.tip,
          screenshotUrl: screenshotMap[step.order] || null,
        })),
      },
    },
    include: { steps: true },
  });

  // Update recording status
  await prisma.recording.update({
    where: { id: params.id },
    data: { status: 'COMPLETED' },
  });

  // Auto-run cleanup suggestions in background
  // (fire-and-forget, delivered via websocket/polling)

  return NextResponse.json({ guideId: guide.id, guide });
}


// ═══════════════════════════════════════════════════════════════
// EXAMPLE IMPLEMENTATION: GET /api/share/:token (public)
// ═══════════════════════════════════════════════════════════════

export async function GET_SHARE(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const share = await prisma.share.findUnique({
    where: { token: params.token },
    include: {
      guide: {
        include: {
          steps: { orderBy: { order: 'asc' } },
          author: { select: { name: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!share || !share.isActive) {
    return NextResponse.json({ error: 'Link not found or expired' }, { status: 404 });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  // Track analytics (fire-and-forget)
  prisma.analyticsEvent.create({
    data: {
      guideId: share.guideId,
      type: 'VIEW',
      shareToken: params.token,
      ip: req.ip,
      userAgent: req.headers.get('user-agent') || undefined,
    },
  }).catch(() => {});

  // Increment view count
  prisma.share.update({
    where: { token: params.token },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  return NextResponse.json({ guide: share.guide });
}
