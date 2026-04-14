# Scribe AI — Process Documentation Platform

> **Tagline**: Turn any workflow into a shareable guide.  
> **Subheadline**: Record your screen once. Scribe AI automatically generates step-by-step documentation with screenshots, instructions, and team-ready formatting — in seconds.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Quick Start](#quick-start)
5. [Environment Variables](#environment-variables)
6. [Database Setup](#database-setup)
7. [Chrome Extension](#chrome-extension)
8. [AI Pipeline](#ai-pipeline)
9. [Deployment](#deployment)
10. [Monetization Tiers](#monetization-tiers)
11. [Roadmap](#roadmap)

---

## Overview

Scribe AI is a Scribe.how-style tool for teams. Users install a Chrome extension, click Record, complete a workflow, and the app automatically generates a clean, editable, shareable step-by-step guide.

**Core flow:**
1. User installs Chrome extension
2. Clicks "Start recording" in the popup
3. Completes their workflow in any browser tab
4. Extension sends captured events to the backend in batches
5. User clicks "Stop" — AI processes events into a polished guide
6. User edits, redacts, and shares the guide

---

## Tech Stack

| Layer           | Technology                        |
|-----------------|-----------------------------------|
| Frontend        | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend         | Next.js API Routes + Edge Runtime |
| Database        | PostgreSQL (Neon or Supabase)     |
| ORM             | Prisma 5                          |
| Auth            | Clerk                             |
| File Storage    | AWS S3 + CloudFront               |
| AI              | OpenAI GPT-4o                     |
| PDF Export      | Puppeteer (via Lambda) or react-pdf |
| Browser Extension | Chrome Manifest V3              |
| Deployment      | Vercel (frontend + API)           |
| Email           | Resend                            |
| Analytics       | PostHog (self-hosted optional)    |

---

## Project Structure

```
/
├── app/                          # Next.js App Router pages
│   ├── (marketing)/              # Landing, pricing (public)
│   │   ├── page.tsx              # Landing page
│   │   └── pricing/page.tsx
│   ├── (auth)/                   # Login, signup via Clerk
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (app)/                    # Authenticated app shell
│   │   ├── layout.tsx            # Sidebar + topbar layout
│   │   ├── dashboard/page.tsx
│   │   ├── guides/
│   │   │   ├── page.tsx          # Guide library
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Guide editor
│   │   │       └── preview/page.tsx
│   │   ├── record/page.tsx       # Recording import/review
│   │   ├── analytics/page.tsx
│   │   └── settings/
│   │       ├── workspace/page.tsx
│   │       └── billing/page.tsx
│   ├── share/[token]/page.tsx    # Public share page (no auth)
│   └── api/                      # API routes (see api-routes.ts)
│
├── components/
│   ├── ui/                       # Base components (Button, Input, etc.)
│   ├── guides/
│   │   ├── GuideCard.tsx
│   │   ├── GuideEditor.tsx
│   │   ├── StepCard.tsx
│   │   ├── StepReorder.tsx       # DnD step reordering
│   │   └── RedactionTool.tsx
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   └── GuideGrid.tsx
│   └── recording/
│       ├── RecordingStatus.tsx
│       └── EventTimeline.tsx
│
├── lib/
│   ├── prisma.ts                 # Prisma client singleton
│   ├── ai/
│   │   ├── pipeline.ts           # Main AI orchestration
│   │   └── prompts.ts            # All prompt templates
│   ├── storage/
│   │   ├── s3.ts                 # S3 upload/presign
│   │   └── screenshots.ts
│   └── pdf/
│       └── export.ts
│
├── extension/                    # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background/worker.js
│   ├── content/recorder.js
│   └── popup/
│       ├── popup.html
│       └── popup.js
│
├── prisma/
│   └── schema.prisma
│
└── seed/
    └── seed.ts                   # Sample data seed
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ (or Neon/Supabase connection string)
- OpenAI API key
- Clerk account
- AWS S3 bucket

### 1. Clone and install

```bash
git clone https://github.com/your-org/scribe-ai
cd scribe-ai
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
# Fill in all values (see Environment Variables section)
```

### 3. Set up database

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

### 4. Run development server

```bash
npm run dev
# App runs at http://localhost:3000
```

### 5. Install Chrome extension (development)

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `/extension` folder
5. Pin the Scribe AI extension to your toolbar

---

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/scribeai"

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# OpenAI
OPENAI_API_KEY="sk-..."

# AWS S3
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
AWS_S3_BUCKET="scribeai-screenshots"
AWS_CLOUDFRONT_DOMAIN="https://d1234.cloudfront.net"

# App
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"

# Email (Resend)
RESEND_API_KEY="re_..."

# Analytics (optional)
POSTHOG_KEY="phc_..."
```

---

## Database Setup

The Prisma schema (`prisma/schema.prisma`) defines all models.

Key relationships:
- `User` belongs to many `Organization` via `Membership`
- `Guide` has many `GuideStep`, `Share`, `Comment`, `GuideVersion`
- `Recording` has many `RecordingEvent`, produces one `Guide`
- `AnalyticsEvent` tracks every guide view with optional user attribution

### Seed data

```bash
npx prisma db seed
```

Creates:
- 1 test organization ("Acme Corp")
- 3 users (admin, editor, viewer)
- 5 sample guides with steps
- 2 completed recordings
- Share links for each guide

---

## Chrome Extension

### Development

The extension communicates with the Next.js backend via the API.

**Flow:**
1. User clicks "Start" in popup → popup.js sends `START_SESSION` to background worker
2. Background worker calls `POST /api/recordings` → gets `recordingId`
3. Worker sends `START_RECORDING` message to all tabs
4. Content script (`recorder.js`) attaches click/input/nav listeners
5. Events are queued in memory, flushed to `POST /api/recordings/:id/events` every 3s
6. User clicks "Stop" → worker calls `POST /api/recordings/:id/complete`
7. Backend triggers AI processing, returns `guideId`
8. Popup opens the guide in the app

### Publishing
Build the extension:
```bash
npm run build:extension
# Creates extension.zip ready for Chrome Web Store submission
```

---

## AI Pipeline

See `ai-prompts.md` for full prompt documentation.

**Processing pipeline:**

```
RecordingEvents
      ↓
  sanitize()      — Remove screenshot data URLs, mask sensitive values
      ↓
  generateGuide() — GPT-4o: events → structured guide JSON
      ↓
  groupSections() — GPT-4o: assign section labels
      ↓
  getCleanupSuggestions() — GPT-4o: detect redundancy/issues
      ↓
  detectSensitive() — GPT-4o: flag PII/credentials
      ↓
  Guide saved to DB with all suggestions as metadata
```

**Cost estimate:** ~$0.02–0.04 per recording processed (GPT-4o pricing)

---

## Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel deploy
```

Set all environment variables in the Vercel dashboard.

### Database migration in production

```bash
npx prisma migrate deploy
```

### Screenshot storage

Configure S3 bucket with:
- Public read disabled
- CloudFront distribution for CDN delivery
- CORS policy allowing `POST` from your app domain
- Lifecycle policy to delete screenshots older than 1 year (optional)

---

## Monetization Tiers

### Free
- 5 guides
- 3 recordings/month
- Public sharing only
- Watermark on exports
- 1 team member

### Pro — $15/user/month
- Unlimited guides + recordings
- Private links + password protection
- PDF export (no watermark)
- Version history (90 days)
- Analytics
- AI tone rewriting
- 5 team members

### Team — $12/user/month (billed annually, min 5 seats)
- Everything in Pro
- Unlimited team members
- Folder organization
- Role-based permissions
- Embed in Confluence/Notion/Slack
- Custom domain for share links
- 1 year version history
- Priority support
- SSO (SAML)

### Enterprise — Custom pricing
- Self-hosted option
- Audit logs
- Advanced SSO
- SLA guarantee
- Dedicated success manager
- Custom integrations (Salesforce, ServiceNow, etc.)
- Air-gapped deployment option

---

## Roadmap

### V1 (MVP — 8 weeks)
- [x] Chrome extension with event capture
- [x] AI guide generation from recordings
- [x] Guide editor with step reordering
- [x] Screenshot capture + redaction tool
- [x] Public/private share links
- [x] PDF export
- [x] Team workspaces + role-based access
- [x] Basic analytics dashboard

### V2 (Growth — 12 weeks)
- [ ] Desktop recorder (Electron) for all apps, not just browser
- [ ] Mobile capture (iOS/Android screen recording API)
- [ ] Notion, Confluence, Slack integrations (embed + notify)
- [ ] Template library (SOP templates for common workflows)
- [ ] Comments and feedback on guides
- [ ] Version history with diff view
- [ ] Bulk actions (export, archive, move)
- [ ] Guide collections / "Playbooks"
- [ ] Custom branding (logo, colors) for Pro+

### Enterprise (V3)
- [ ] SSO (SAML, OIDC)
- [ ] Audit logs
- [ ] Advanced analytics (heatmaps on steps, completion funnels)
- [ ] API for programmatic guide creation
- [ ] Webhooks for guide events
- [ ] Self-hosted deployment (Docker)
- [ ] ServiceNow, Salesforce, Zendesk integrations
- [ ] AI-powered guide search ("find the guide that shows how to...")
- [ ] Multi-language guide translation

---

## Sample Generated Guide Data

```json
{
  "title": "How to onboard a new employee in Rippling",
  "summary": "This guide walks HR admins through the complete employee setup process in Rippling — from sending the invitation to configuring payroll, apps access, and first-day permissions. Estimated time: 8–12 minutes.",
  "tags": ["HR", "Onboarding", "Internal"],
  "estimatedTime": "8–12 minutes",
  "prerequisites": [
    "You must have Admin or HR Manager role in Rippling",
    "Have the employee's personal email address ready",
    "Know the employee's start date, role, and department"
  ],
  "steps": [
    {
      "order": 1,
      "title": "Open the Rippling Admin Dashboard",
      "instruction": "Navigate to **app.rippling.com** and sign in with your admin credentials. From the left sidebar, click **People** to access the employee management section.",
      "sectionLabel": "Basic setup",
      "eventType": "PAGE_VISIT",
      "url": "https://app.rippling.com/people",
      "tip": "Bookmark app.rippling.com/people for faster access."
    },
    {
      "order": 2,
      "title": "Click the 'Add employee' button",
      "instruction": "In the top-right corner of the People page, click the **+ Add employee** button. A multi-step setup wizard will open in a slide-over panel on the right side of the screen.",
      "sectionLabel": null,
      "eventType": "CLICK",
      "elementLabel": "+ Add employee"
    }
  ]
}
```

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

Please run `npm run lint && npm run typecheck` before submitting.

---

## License

MIT © Scribe AI
