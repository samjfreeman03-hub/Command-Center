@AGENTS.md

# Command Center — Project Context for Claude

This file is the canonical context for working on this codebase. Read it first.

If you're Claude (in claude.ai or Claude Code): everything below is the source of
truth for how to think about this project. Prefer this file's guidance over
inferred patterns. When unsure, check `lib/types.ts` and `lib/db.ts` — code wins
over docs.

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Tech Stack](#2-tech-stack)
3. [Architecture & Key Patterns](#3-architecture--key-patterns)
4. [Database Schema](#4-database-schema)
5. [Brand Color System](#5-brand-color-system)
6. [Email System](#6-email-system)
7. [File Upload Pattern](#7-file-upload-pattern)
8. [FLAIR Outreach Module](#8-flair-outreach-module)
9. [Apollo.io Integration](#9-apolloio-integration)
10. [Drafter System](#10-drafter-system)
11. [Signal Enricher](#11-signal-enricher)
12. [Candidate Generator](#12-candidate-generator)
13. [Daily Queue + Follow-up Cadence](#13-daily-queue--follow-up-cadence)
14. [File Structure](#14-file-structure)
15. [UI/UX Conventions](#15-uiux-conventions)
16. [Environment Variables](#16-environment-variables)
17. [Common Commands](#17-common-commands)
18. [Hard-Won Operational Learnings](#18-hard-won-operational-learnings)
19. [Important Gotchas](#19-important-gotchas)
20. [Recent Major Additions](#20-recent-major-additions)
21. [Memory Files](#21-memory-files)
22. [Outstanding Security Items](#22-outstanding-security-items)
23. [Working Conventions](#23-working-conventions)
24. [Pending / In-Progress Work](#24-pending--in-progress-work)

---

## 1. What This Is

**Command Center** is Sam Freeman's unified personal operating system — a single
dashboard to manage all of his businesses and personal life. It lives at
**cc.samfreeman.org** (custom domain via Railway + Squarespace DNS CNAME/TXT).

### Businesses Managed

| ID           | Name                  | Brand Color  | Notes                                      |
| ------------ | --------------------- | ------------ | ------------------------------------------ |
| `mtrnm`      | MTRNM (Metronome)     | `#0B402C`    | Global house music event label             |
| `flair`      | FLAIR                 | `#ED1F24`    | Next-gen marketing, activations, UGC       |
| `campuslink` | CampusLink            | `#ED1F24`    | College marketing & campus activations     |
| `stealth`    | Stealth Labs          | `#18181b`    | AI solutions for underserved industries    |
| `techspace`  | TechSpace             | `#0ea5e9`    | Events + VC at LA TechWeek and beyond      |
| `personal`   | Personal              | `#71717a`    | Life, errands, everything else             |

### Active Workstream: FLAIR Back-to-School 2026 Outreach

The largest recent addition is a complete LinkedIn cold-outreach system for
FLAIR's college/Gen-Z back-to-school 2026 push:

- 10 outreaches/day target through back-to-school season (Aug–Sept 2026)
- **Hybrid model**: AI drafts targeting + messages, Sam (or Tyler) sends
  manually on LinkedIn — no automation against LinkedIn (account-ban risk)
- Wired into `/b/flair` as a new "Outreach" tab between Pipeline and CRM
- Apollo.io powers verified contact discovery; Anthropic powers drafting
  and signal enrichment

Back-to-school season runs roughly **Aug 15 – Sept 30, 2026**. First-touch
outreach window to land Fall '26 budgets is **June–July 2026** — after mid-July
most brands' fall budgets are locked.

---

## 2. Tech Stack

- **Framework:** Next.js App Router (v16.2.6 / Turbopack), React 19.2.4, TypeScript 5
- **Styling:** Tailwind CSS v4 (with `@custom-variant dark` and `@theme inline`)
- **Database:** SQLite via `better-sqlite3` (file-based, single process)
- **Hosting:** Railway with persistent volume at `/app/data` (`RAILWAY_VOLUME_MOUNT_PATH`)
- **Email:** IMAP via `imapflow`, SMTP via `nodemailer`, parsing via `mailparser`
- **AI Chat:** Anthropic Claude API (`@anthropic-ai/sdk`) — per-business AI assistant
- **AI Outreach:** `claude-sonnet-4-6` with ephemeral prompt caching + native web search tool
- **Contact Data:** Apollo.io REST API (Pro plan, master key required — see §9)
- **Fonts:** Geist Sans + Geist Mono (Google Fonts)
- **PWA:** Standalone mode, `viewport-fit: cover`, safe area CSS utilities

### Key Dependencies

```
next@16.2.6, react@19.2.4, better-sqlite3, imapflow, nodemailer, mailparser,
@anthropic-ai/sdk@^0.96, date-fns, lucide-react, pdf-parse
```

All native Node packages are declared in `next.config.ts` → `serverExternalPackages`:

```ts
["better-sqlite3", "pdf-parse", "imapflow", "nodemailer", "mailparser"]
```

**Important**: this repo runs Next.js 16 (Turbopack). APIs / conventions can
differ from earlier versions. When unsure, read `node_modules/next/dist/docs/`
before writing route or page code rather than relying on Next 14/15 patterns.

---

## 3. Architecture & Key Patterns

### Authentication (three layers)

**Admin auth (owner):**
- Cookie-based. `cc_session` cookie = SHA-256 of `ADMIN_PASSWORD + "cc_session_v1"`.
- `lib/server-auth.ts` → `isAdmin()`, `computeSessionToken()`
- `middleware.ts` checks the cookie for all routes except `/login`, `/s/`,
  `/api/auth`, `/api/share-auth`, `/favicon.ico`
- 30-day expiry, secure-flagged in production

**Share tokens (per-business read+write link):**
- `db.getOrCreateShareToken(businessId)` returns a stable token per business
- URL pattern: `/s/<token>`
- `x-share-token` header validated in route handlers via
  `db.verifyShareToken(token, businessId)`
- Client-side: `lib/share-context.tsx` → `ShareTokenContext`, `useShareHeaders()`
  hook automatically adds the header to all fetches inside the provider
- Share views at `/s/[token]` always render in **light mode** (forced via
  `themeInit` script in `layout.tsx` for paths starting with `/s/`)
- Token doesn't expire — rotate by regenerating

**Share passwords (team password gate):**
- Per-business derived password: `${businessName.replace(/\s+/g, "")}team123!`
- Examples:
  - `FLAIRteam123!`
  - `MTRNMteam123!`
  - `CampusLinkteam123!`
  - `StealthLabsteam123!`
  - `TechSpaceteam123!`
  - `Personalteam123!`
- `POST /api/share-auth/[business_id] { password }` validates server-side and
  sets HTTP-only cookie `share_pw_<businessId>=<sha256(ADMIN_PASSWORD + "share_pw_v1_" + businessId)>`
- 30-day expiry
- `app/s/[token]/page.tsx` server-checks the cookie before rendering;
  shows `SharePasswordGate` (client component) if missing/invalid
- **Validation is fully server-side** — password string never appears in
  client JS bundles
- API routes called from a share view authenticate via the `x-share-token`
  header only — they don't check the share_pw cookie. The password gate
  protects only the page load (threat model: "URL accidentally forwarded")

### `canAccessBusiness(businessId)` semantics

Used by every API route. Accepts either:
1. Admin cookie (`cc_session`)
2. Share token header (`x-share-token`)

This is the single function that decides whether a request can touch a
business's data. Don't bypass it; don't reimplement it.

---

## 4. Database Schema

### Storage

- SQLite file at `{DB_DIR}/command-center.db` with WAL mode + foreign keys
- `DB_DIR` = `RAILWAY_VOLUME_MOUNT_PATH` on Railway, or `./data` locally
- `UPLOADS_DIR` = `{DB_DIR}/uploads` for file attachments
- Singleton pattern: `getDb()` in `lib/db.ts` creates once, caches in `_db`

### Tables

| Table                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `businesses`         | Business registry (seeded from BUSINESSES)        |
| `todos`              | Per-business tasks with priority/due dates        |
| `todo_assignees`     | Many-to-many junction (todo ↔ team member)        |
| `leads`              | Pipeline/CRM leads with stages + values           |
| `lead_attachments`   | Files/links per lead                              |
| `notes`              | Per-business rich notes                           |
| `chat_messages`      | AI chat history per business                      |
| `team_members`       | Team roster per business                          |
| `business_resources` | Links/files per business                          |
| `brand_contacts`     | CRM contacts with status tracking                 |
| `brand_attachments`  | Files/links per CRM contact                       |
| `share_tokens`       | Per-business share link tokens                    |
| `emails`             | Cached email messages (IMAP sync)                 |
| `outreach_targets`   | Cold outreach targets + drafts + cadence state    |

### `outreach_targets` (the centerpiece of outreach work)

```sql
CREATE TABLE outreach_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  brand_category TEXT,          -- beauty / wellness / lifestyle / fashion / apparel / CPG / beverage / EdTech / DTC-genz / enterprise
  brand_size TEXT,              -- enterprise / midsize / emerging
  person_name TEXT NOT NULL,
  person_title TEXT,
  linkedin_url TEXT,
  person_email TEXT,            -- ALTER-added; Apollo unlocks via /people/match
  source TEXT DEFAULT 'manual', -- manual / auto-generated / import
  status TEXT NOT NULL DEFAULT 'queued',
    -- queued → drafted → sent → replied → converted | declined | dead
  signals_json TEXT,            -- { signals: [...], summary_for_drafter, fetched_at }
  drafts_json TEXT,             -- { templateA, templateB, reasoning, generated_at }
  sent_history_json TEXT,       -- [{ at, follow_up_n, template?, text }]
  sent_at INTEGER,
  replied_at INTEGER,
  next_followup_at INTEGER,     -- anchored to sent_at + cadence days
  followup_count INTEGER NOT NULL DEFAULT 0,
  converted_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_outreach_business_status ON outreach_targets(business_id, status);
CREATE INDEX idx_outreach_followup ON outreach_targets(next_followup_at);
```

### `emails` table

```sql
CREATE TABLE emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_address TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT,
  subject TEXT NOT NULL DEFAULT '(no subject)',
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses TEXT NOT NULL DEFAULT '[]',   -- JSON array
  cc_addresses TEXT NOT NULL DEFAULT '[]',   -- JSON array
  date INTEGER NOT NULL,
  snippet TEXT,
  body_html TEXT,
  body_text TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  labels TEXT NOT NULL DEFAULT '[]',         -- JSON array
  fetched_at INTEGER NOT NULL,
  UNIQUE(account_address, uid)
);
```

### Migration safety

All migrations use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE … try/catch` for
new columns. Safe to apply against existing prod DBs — no data loss risk.

---

## 5. Brand Color System

Each business in `lib/businesses.ts` has:

- `accent` — Tailwind text color class (e.g. `text-[#0B402C] dark:text-[#4ade80]`)
- `accentBg` — Background + ring for badges
- `dot` — Sidebar dot color class
- `tabActive` — Active tab pill styling (brand bg + white text)
- `hex` — Raw hex string for inline CSS styles

Brand colors are applied via **inline Tailwind arbitrary values** like
`text-[#ED1F24]`, `bg-[#0B402C]`, etc. — NOT via Tailwind config theme extension.

### Header background

The `/b/[slug]` and `/s/[token]` headers use `bg-white dark:bg-zinc-950` + a
hairline border. Brand identity is carried by:

- Small colored pill badge with `business.accentBg + business.accent`
- Colored business name via `business.accent`
- Colored dot in the pill

---

## 6. Email System

- Config: `lib/email-config.ts` reads `EMAIL_1_ADDRESS`, `EMAIL_1_PASSWORD`,
  `EMAIL_1_NAME` through `EMAIL_5_*` env vars
- All accounts are Gmail/Google Workspace using **App Passwords** (not OAuth)
- IMAP: `imap.gmail.com:993` (secure), SMTP: `smtp.gmail.com:587` (STARTTLS)
- Sync: `POST /api/email/sync` fetches last 100 messages per account via
  sequence range (`${Math.max(1, total-99)}:${total}`)
- Inbox: `GET /api/email/inbox` returns cached emails from SQLite
- Send: `POST /api/email/send` via nodemailer, supports `inReplyTo`/`references`
  headers for threading
- Actions: `GET/DELETE/PATCH /api/email/[id]` — read (+ mark read), trash
  (IMAP move to `[Gmail]/Trash` + cache delete), star toggle (IMAP `\Flagged`
  flag), label (local DB)
- Currently connected: FLAIR email + Personal email (2 accounts)

### Email DB methods (lib/db.ts)

- `upsertEmail()` — insert or update on `(account_address, uid)` unique constraint
- `listEmails()` — returns all cached emails, optional account filter, ordered by date DESC
- `getEmail(id)` — single email by ID
- `markEmailRead(id)` — sets `is_read = 1`
- `setEmailStarred(id, starred)` — toggles star flag
- `setEmailLabel(id, label)` — sets label string
- `deleteEmailFromCache(id)` — removes from local cache
- `getLatestEmailUid(account)` — for incremental sync

### Inbox UI (`app/inbox/inbox-client.tsx`)

Full-featured inbox client with:
- Account filter pills at top
- Email list with avatars, unread indicators, star toggles, label badges
- Email detail view with from/to/cc/date, HTML body rendering (via dangerouslySetInnerHTML)
- Action toolbar: Reply, Reply All, Forward, Delete, Star, Label picker
- Compose modal with from-account selector, supports 4 modes:
  compose (new), reply, replyAll, forward
- Mobile: list/detail toggle view

---

## 7. File Upload Pattern

All file uploads use `FormData` with the file stored in `UPLOADS_DIR` with a
UUID-prefixed filename. Download routes serve from disk. Pattern is consistent
across:

- `app/api/resources/` (business resources)
- `app/api/leads/[id]/attachments/` (lead attachments)
- `app/api/brands/[id]/attachments/` (CRM contact attachments)

---

## 8. Outreach Module (FLAIR + MTRNM, multi-business)

The full outreach pipeline lives in `components/outreach-panel.tsx`
(~1800 lines) plus 10+ API routes under `app/api/outreach/`.

### Multi-business architecture (added 2026-06-10)

`lib/outreach-config.ts` is the single source of truth for which businesses
have outreach and how each behaves. Per-business config includes: positioning
+ voice prompt filenames, drafter identity/rules, enrich focus, fit framing,
Apollo ICP title keywords, contact priorities, candidate criteria, categories,
senders, and UI template labels. `OUTREACH_BUSINESS_IDS` gates the Outreach
tab in both `business-view.tsx` and `shared-view.tsx` — currently
**FLAIR + MTRNM only**. All outreach API routes resolve the config from the
target's `business_id` and return 400 for unconfigured businesses.

- **FLAIR prompts:** `lib/prompts/flair-positioning-brief.md` + `flair-voice-samples.md`
- **MTRNM prompts:** `lib/prompts/mtrnm-positioning-brief.md` + `mtrnm-voice-samples.md`
  (synthesized from MTRNM Partnerships Deck 2026, method oasis case study,
  NATM/NATC concept decks). MTRNM Template A = generalized "dream collab" hook;
  Template B = semi-personalized KITH-style DM; voice is lowercase insider.
  MTRNM sender is Sam only (no Tyler toggle).

### Fit-aware drafting (added 2026-06-10)

- Enrich (`/enrich`) outputs `fit_rationale` alongside signals — 2-3 sentences
  on why {brand} × {business} makes sense. Cached signals missing the rationale
  re-enrich once. The drafter weaves the single strongest signal + fit into
  every variant ("insider observation, never scraped research").

### Email outreach (added 2026-06-10)

- Drafts now include `email: { subject, body }` alongside Template A/B.
  Panel renders `EmailDraftBlock` with copy, edit, mailto deep-link (when the
  target has `person_email`), and "Sent this" (template `"Email"`).
- Apollo unlocks emails for **all** found contacts via `/people/match`
  (1 credit each) — not just contacts missing LinkedIn URLs.

### Core flow

```
ADD TARGET → ENRICH (optional) → DRAFT → SEND (manual) → MARK SENT
                                                              ↓
                                                       FOLLOW-UP CADENCE
                                                       (Day 3 / 7 / 14)
                                                              ↓
                                                     REPLY → CONVERT TO LEAD
```

### API routes (outreach)

```
GET   /api/outreach?business_id=&status=          → list
POST  /api/outreach                                → create (409 on dedup)
PATCH /api/outreach/[id]                           → partial update
DELETE /api/outreach/[id]

POST  /api/outreach/[id]/draft                     → Template A + B via Claude
POST  /api/outreach/[id]/enrich                    → signals via web search (14d cache)
POST  /api/outreach/[id]/follow-up                 → Day 3/7/14 follow-up draft
POST  /api/outreach/[id]/find-contacts             → Apollo + web search fallback
POST  /api/outreach/[id]/action                    → { mark-sent | mark-followup-sent | mark-replied | reset-cadence }

POST  /api/outreach/candidates                     → brand list + per-brand contacts
GET   /api/outreach/daily-queue?business_id=       → { newTargets, followups }
GET   /api/outreach/export?business_id=            → CSV download
```

### Dedup behavior

`POST /api/outreach` calls
`db.findActiveDuplicate({business_id, brand_name, person_name})`
case-insensitive, trimmed, excludes `dead`/`declined`/`converted` statuses. On
match returns **HTTP 409** with `{ duplicate: true, existing: target }`. The
`(to research)` placeholder name bypasses dedup (multiple unresearched brands
are legitimate). Bulk-add flows silently skip 409s and show a summary.

### UI architecture (`components/outreach-panel.tsx`)

Sub-components in this file:

- `OutreachPanel` — top-level state container
- `TargetCard` — per-target row with header + expanded body (drafts, signals, found contacts)
- `FollowupCard` — used in Today view's "Follow-ups due" section
- `AddTargetForm` — manual add modal
- `CandidateGenerator` — "Suggest brands" flow
- `CandidateBrandCard` — per-brand result with per-contact checkboxes
- `DraftBlock` + `DraftLine` — editable textareas with copy + Sent this buttons
- `ContactMeta` — role chip + confidence chip + origin badge + LinkedIn + email + source

### View modes (top toggle)

- **Today** — auto-filters to `newTargets` + `followupsDue`. Default view.
- **All targets** — full list with status filter chips + CSV export button

### Critical client patterns

- `useShareHeaders()` from `lib/share-context.tsx` automatically adds the
  `x-share-token` header to fetches — every fetch in the panel uses this
  pattern so the share view works without any other plumbing
- Sender toggle (Sam/Tyler) persists across page loads via
  `localStorage.getItem("flair-outreach-sender")`
- All bulk operations (backfill, candidate add, find-contacts add) handle
  HTTP 409 (dedup) silently and surface a summary alert at the end

### Outreach is on the shared view

`app/s/[token]/shared-view.tsx` includes the Outreach tab between Pipeline and
CRM. Sam's team can use all outreach features (Find Contacts, Draft, Sent this,
Backfill, Export) once they enter the share password.

---

## 9. Apollo.io Integration (`lib/apollo.ts`)

### Plan tier requirement — CRITICAL

Apollo's **Free** plan does **NOT** include API access to the search endpoints.

**Minimum plan**: Basic ($49/mo) or Pro ($79/mo annual / $99/mo monthly).
Sam upgraded to **Pro ($99/mo, 4,000 credits)** for this project.

### Master API key required

Apollo issues two key types:

- **Master API Key** — full endpoint access (this is what we need)
- **Custom / Scoped Key** — restricted; default scopes don't include
  `/mixed_companies/search` and `/mixed_people/api_search`

When creating a key in Apollo settings, **toggle "Set as master key" ON**.
`/v1/auth/health` returns `true` even for restricted keys — use
`scripts/debug-apollo.js` to probe search endpoints.

### Endpoints used

```
POST /api/v1/mixed_companies/search       — find org by name (free per query)
GET  /api/v1/organizations/enrich         — industry + keywords for disambiguation (free)
POST /api/v1/mixed_people/api_search      — people at org (use _api_search, NOT _search)
POST /api/v1/people/match                 — unlock single person's email (1 credit)
```

**Deprecation note**: `/mixed_people/search` (without `_api_`) returns HTTP 422
for API callers — Apollo migrated to `api_search`.

### Disambiguation strategy

When multiple orgs share a name, we:

1. Call `/organizations/enrich?domain=…` per candidate org (up to 5)
2. Pull industry, keywords, short_description
3. Match against category-specific hints (beauty → skincare, cosmetics, etc.)
4. Tie-break to the matching org; fall back to largest by employee count

Hints map by category lives in `lib/apollo.ts`. To extend ICP, add hints there.

### Seniority filter

Filters to: `["c_suite", "founder", "owner", "vp", "head", "director", "manager", "senior"]`
Excludes interns, associates, assistants — keeping only budget-holders.

### Confidence model

- `high` — LinkedIn URL verified by Apollo
- `medium` — Email verified but no LinkedIn URL
- `low` — Neither

`origin: "apollo"` vs `origin: "web_search"` — UI shows sky badge vs zinc badge.

### Web search fallback

If Apollo returns 0 contacts or `APOLLO_API_KEY` is not set, falls back to
Claude's native web search tool. Same output shape, `origin: "web_search"`.

---

## 10. Drafter System

### Model + caching

- `claude-sonnet-4-6` via Anthropic SDK
- **Prompt caching**: system prompt wrapped in
  `{ type: "text", text: <positioning + voice>, cache_control: { type: "ephemeral" } }`
- First call writes ~4,000+ tokens to a 5-minute ephemeral cache; subsequent
  calls hit cache at ~10% of input cost

### System prompt structure

- `lib/prompts/flair-positioning-brief.md` — services, proof points by category
- `lib/prompts/flair-voice-samples.md` — Template A + B verbatim examples

### Output

```json
{
  "templateA": { "connectionNote": "≤300 chars", "firstDM": "≤600 chars" },
  "templateB": { "connectionNote": "≤300 chars", "firstDM": "≤600 chars" },
  "reasoning": "one short sentence"
}
```

Parsed via `lib/extract-json.ts` (handles bare/fenced/embedded JSON). All
LLM-backed routes use this extractor.

### Template A vs B

- **Template A — Sam-style**: Double-bangs. Identity-pitch-close. Brand drop includes Coca-Cola, method, ULTA Beauty, Monster, Vacation.
- **Template B — Tyler-style**: Single-bang. No FLAIR mention. Specific question. Signs off `—Tyler`.

### Hard conventions

- Use **"ULTA Beauty"** — never "ULTA" or "Ulta"
- In Template A's brand drop, ULTA Beauty must immediately follow `method`
- First name only in greeting
- Avoid: "I hope this finds you well", "I came across your profile", calendar links

### Editable drafts

UI shows textareas (not read-only). `sent_history_json` records what was
actually sent, not original AI output.

---

## 11. Signal Enricher (`POST /api/outreach/[id]/enrich`)

Uses **Anthropic's native web search tool**
(`tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }]`).

Returns signals (campaign/hire/funding/launch/partnership/other) with sources.
**Cached 14 days** per target. The drafter reads `signals_json` when present.

---

## 12. Candidate Generator (`POST /api/outreach/candidates`)

Two-step pipeline:

1. **Brand generation** — Claude proposes N brands matching category/size
2. **Per-brand contact discovery** — Apollo primary, web search fallback

Returns per-contact checkboxes grouped under each brand for selective add.

---

## 13. Daily Queue + Follow-up Cadence

### Daily queue (`GET /api/outreach/daily-queue`)

Returns `{ newTargets, followups }`:
- `newTargets` — queued/drafted with no sent_at, limit 10
- `followups` — sent with next_followup_at <= now, followup_count < 3

### Follow-up cadence

```
Send first       → next_followup_at = sent_at + 3 days
Follow-up #1     → next = sent_at + 7 days
Follow-up #2     → next = sent_at + 14 days
Follow-up #3     → next = null (cadence done)
Reply received   → next = null (cadence cancelled)
```

Anchored to `sent_at`, not "today" — taking a day off doesn't slip follow-ups.

### Follow-up drafter

Separate from first-touch drafter. Single message output. `sender` field
(`"Sam"` | `"Tyler"`) controls voice.

---

## 14. File Structure

```
app/
  layout.tsx          — Root layout: Geist fonts, viewport, dark mode script (skips /s/ paths), AdminShell wrapper
  globals.css         — Tailwind import, dark variant, safe area utils, scroll/tap utilities
  page.tsx            — Dashboard: date header, business cards grid, DashboardTodos accordion
  manifest.ts         — PWA manifest (standalone, portrait)
  login/page.tsx      — Admin login form
  inbox/
    page.tsx          — Server component: auth check, load accounts + emails
    inbox-client.tsx  — Full inbox UI: account pills, email list, detail, compose, actions
  b/[slug]/
    page.tsx          — Server component for business view
    business-view.tsx — White header, tab pills, all panels
  s/[token]/
    page.tsx          — Share view entry (checks share password cookie)
    shared-view.tsx   — White header business view for team (includes Outreach tab)
    share-password-gate.tsx — Per-business team password gate
  api/
    auth/             — Login endpoint
    share-auth/[business_id]/ — Share password verification
    todos/            — CRUD + completion
    leads/            — CRUD + stage management
    notes/            — CRUD
    chat/             — AI chat (Anthropic API)
    team/             — Team member CRUD
    resources/        — Business file/link resources
    brands/           — CRM contacts CRUD
    brand-attachments/— CRM contact attachments
    attachments/      — Lead attachments
    businesses/       — Business stats
    email/            — Sync, inbox, send, per-message actions
    outreach/         — Cold outreach module
      route.ts                      — GET/POST list+create
      [id]/route.ts                 — PATCH/DELETE
      [id]/draft/route.ts           — Template A + B drafter
      [id]/enrich/route.ts          — Signal enricher
      [id]/follow-up/route.ts       — Follow-up drafter
      [id]/find-contacts/route.ts   — Apollo + web search fallback
      [id]/action/route.ts          — mark-sent / mark-followup-sent / mark-replied / reset-cadence
      candidates/route.ts           — Brand list + contacts
      daily-queue/route.ts          — Today queue
      export/route.ts               — CSV download

components/
  admin-shell.tsx     — Mobile header + drawer + desktop sidebar layout
  sidebar.tsx         — CC monogram, nav (Dashboard, Inbox, Businesses), theme toggle, logout
  dashboard-todos.tsx — Compact accordion: company rows with dot + count, expandable todo lists
  todos-panel.tsx     — Full todo panel: add form, inline edit, multi-assignee picker
  pipeline-panel.tsx  — Kanban-style lead pipeline + won tracker
  brands-panel.tsx    — CRM: contact cards, detail modal (bottom sheet on mobile), attachments
  notes-panel.tsx     — Notes: list/editor toggle on mobile, side-by-side on desktop
  chat-panel.tsx      — AI chat: 100dvh, message bubbles, bouncing-dot thinking indicator
  team-panel.tsx      — Team member management
  resources-panel.tsx — Business resources (links + files)
  outreach-panel.tsx  — FLAIR cold outreach module (~1700 lines)
  theme-toggle.tsx    — Light/dark mode toggle

lib/
  businesses.ts       — Business type + BUSINESSES array + getBusiness()
  types.ts            — All TypeScript types (Todo, Lead, Note, BrandContact, OutreachTarget, CandidateContact, etc.)
  db.ts               — SQLite database: schema, migrations, all CRUD methods, email methods
  email-config.ts     — Email account config from env vars, IMAP/SMTP constants
  server-auth.ts      — isAdmin(), canAccessBusiness(), share password helpers
  share-context.tsx   — ShareTokenContext + useShareHeaders() hook
  apollo.ts           — Apollo.io REST client (org search + enrich + people api_search + match)
  extract-json.ts     — Robust JSON extractor for LLM responses (bare/fenced/embedded)
  prompts/
    flair-positioning-brief.md     — Drafter cached prefix (services, proof points, voice rules)
    flair-voice-samples.md         — Template A + B verbatim DM samples

data/                 — GITIGNORED (production DB + uploads + reference)
  command-center.db
  positioning-extracted/   — Raw PDF text extractions (reference only)

scripts/
  extract-pdfs.js     — Re-extract FLAIR PDFs to text
  debug-apollo.js     — Direct Apollo probe (diagnostics)

middleware.ts         — Route protection: cookie check, share token passthrough
next.config.ts        — serverExternalPackages, 20mb body size limit
CLAUDE.md             — THIS FILE
```

**Critical**: `/data` is in `.gitignore`. Anything that must ship to production
goes outside `/data` — e.g., positioning prompts moved to `lib/prompts/`.

---

## 15. UI/UX Conventions

### Design System

- **Style:** Clean & modern, minimal chrome, generous whitespace
- **Typography:** Geist Sans variable font, tight tracking on headings
- **Colors:** Zinc palette base + per-business brand colors via inline arbitrary Tailwind values
- **Dark mode:** Class-based (`html.dark`), toggled via sidebar, persisted in localStorage
- **Icons:** Lucide React, size 13–16px typically

### Theme handling (light/dark)

- `<body>` class: `bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`
- Theme detection script in `app/layout.tsx` runs before paint to avoid FOUC
- Detection order: `localStorage.getItem('theme')` → `prefers-color-scheme`
- Sidebar has a theme toggle button (Sun/Moon icons)

### Share view special-case: always light mode

`app/s/*` paths **always render in light mode** regardless of visitor's OS
preference. The theme-init script in `layout.tsx` short-circuits for paths
starting with `/s/`. Rationale: share visitors don't have the sidebar toggle.

### Mobile / PWA

- PWA standalone mode with `viewport-fit: cover`
- Safe area CSS: `.mobile-header`, `.mobile-content-offset`, `.safe-bottom`, `.safe-left`
- 44px minimum touch targets, `touch-action: manipulation` (no double-tap zoom)
- `overscroll-behavior: none` to prevent bounce
- Bottom sheet modals on mobile (CRM detail)
- List/editor toggle views on mobile (Notes, Email)
- Scrollbar hidden on touch, thin custom scrollbar on desktop

### Layout

- 280px sidebar drawer on mobile (with safe area padding), fixed sidebar on desktop
- No max-width constraints on content — fills available width
- Business pages: white header with hairline border
- Brand-colored active tab pills, brand-colored headings

### Component Patterns

- Server components at page level, client components for interactivity
- Panels receive `businessId` + `shareHeaders` props
- Inline editing triggered by pencil icon → edit form
- Add forms hidden behind dashed "+" buttons
- `h-11` inputs, `rounded-2xl` cards/bubbles, `rounded-lg` buttons

---

## 16. Environment Variables

### Required

- `ADMIN_PASSWORD` — Admin login password (also used to derive session tokens
  and share-password cookie hashes)
- `ANTHROPIC_API_KEY` — Claude API key for AI chat, drafter, follow-up,
  enricher, candidate generator

### Highly Recommended

- `APOLLO_API_KEY` — Apollo Pro/Basic master API key. Without it, find-contacts
  + candidates fall back to web search (lower coverage, costlier per query)

### Email (optional, up to 5 accounts)

- `EMAIL_1_ADDRESS`, `EMAIL_1_PASSWORD`, `EMAIL_1_NAME`
- `EMAIL_2_ADDRESS`, `EMAIL_2_PASSWORD`, `EMAIL_2_NAME`
- (through `EMAIL_5_*`)

### Railway (auto-set)

- `RAILWAY_VOLUME_MOUNT_PATH` — Persistent volume mount (typically `/app/data`)
- `NODE_ENV` — controls cookie `secure` flag

### Local dev gotcha — Claude Desktop pollutes ANTHROPIC_API_KEY

When terminal is launched from Claude Desktop, shell env contains
`ANTHROPIC_API_KEY=""` (empty), shadowing `.env.local`.

**Fix baked in**: `package.json` dev script is
`"dev": "env -u ANTHROPIC_API_KEY next dev"` — strips the pollution.

---

## 17. Common Commands

```bash
# Dev server (strips Claude Desktop env pollution)
npm run dev

# Type check
npx tsc --noEmit

# Production build (verify before pushing)
env -u ANTHROPIC_API_KEY -u APOLLO_API_KEY npm run build

# Deploy (push to Railway via git, auto-deploys main)
git push origin main

# Probe Apollo directly when contact data looks wrong
node scripts/debug-apollo.js

# Re-extract FLAIR PDF positioning if decks change
node scripts/extract-pdfs.js
```

### Standard pre-push checklist

1. `npx tsc --noEmit` — clean
2. `env -u ANTHROPIC_API_KEY -u APOLLO_API_KEY npm run build` — clean
3. Smoke test critical paths locally if changes touch them
4. `git add` relevant files + `git commit`
5. `git push origin main`
6. Verify Railway → Deployments shows new commit Active
7. Hard-refresh browser (Cmd+Shift+R) to bypass cached CSS/HTML

---

## 18. Hard-Won Operational Learnings

These came up while debugging and would cost real time to rediscover.

### Apollo

1. **Free plan ≠ API access.** Don't trust "Trial active" badge.
2. **Master key required.** Custom/scoped keys 403 even on paid plans.
3. **`/mixed_people/search` is deprecated** — use `/mixed_people/api_search`.
4. **Disambiguation requires `/organizations/enrich`.** Basic search only
   returns SIC/NAICS codes, not industry names.
5. **Always filter `person_seniorities`.** Otherwise you get campus ambassadors.
6. **`/v1/auth/health` is NOT diagnostic** — returns true for any valid key.

### Next.js 16

7. Dev script needs `env -u ANTHROPIC_API_KEY` to strip Claude Desktop pollution.
8. Dynamic API routes: `ctx: { params: Promise<{ id: string }> }` — await params.
9. Underscore folders (`_debug-env/`) are private and NOT routed.
10. Middleware is deprecated — there's a warning to migrate to `proxy.ts`.
    Existing `middleware.ts` still works.

### Email

11. **IMAP sync fetches last 100 only** — sequence range
    `${Math.max(1, total-99)}:${total}`. Original bug fetched ALL messages
    (`1:*`) causing 5+ minute syncs.
12. **Gmail App Passwords require 2FA** enabled on the Google account.
13. **IMAP messageMove** to `[Gmail]/Trash` for deletion (not EXPUNGE).

### Repo conventions

14. `/data` is gitignored. Anything for production goes outside `/data`.
15. Anthropic SDK prompt caching: `cache_control: { type: "ephemeral" }` field.
16. JSON extraction is via `lib/extract-json.ts` for all LLM responses.
17. **Never automate against Sam's main LinkedIn account.** Hybrid model is
    the deliberate choice.

---

## 19. Important Gotchas

1. **Next.js 16 breaking changes** — Read `node_modules/next/dist/docs/`
   before writing new code. Route params are `Promise<>` (must be awaited).
2. **Tailwind v4** — Uses `@import "tailwindcss"` + `@theme inline` +
   `@custom-variant dark`. No `tailwind.config.ts` file.
3. **SQLite on Railway** — Persistent volume required. Single-process only
   (no serverless/edge).
4. **Gmail App Passwords** — NOT OAuth. Must have 2FA enabled.
5. **Email sync** — Only last 100 messages. Not a full mirror.
6. **Share views force light mode** — `themeInit` script skips dark mode for `/s/`.
7. **Brand colors use inline hex** — Tailwind arbitrary values, NOT theme config.
8. **File uploads stored on disk** — Would break on Vercel/serverless.
9. **No max-width on content** — Content fills available width. Don't add `max-w-*`.
10. **Session token derivation** — `middleware.ts` (edge, `crypto.subtle`) and
    `server-auth.ts` (Node, `createHash`) compute same token via different APIs.
11. **Outreach panel is ~1700 lines** — one file by design (shared state).
12. **Drafter quality is voice-sample-driven** — edit `lib/prompts/flair-voice-samples.md`,
    not the system prompt in route handlers.
13. **Dedup placeholder bypass** — `person_name = "(to research)"` always succeeds.
14. **Headers are white** on both `/b/[slug]` and `/s/[token]`.

---

## 20. Recent Major Additions

In rough order of construction:

1. Core dashboard + per-business views with todos, pipeline, CRM, notes, chat, team, resources
2. Brand color system with per-company hex colors
3. Full-width brand-colored header backgrounds → later simplified to white headers
4. Mobile PWA optimization (safe areas, bottom sheets, list/editor toggles)
5. Custom domain setup (cc.samfreeman.org via Railway + Squarespace DNS)
6. Dashboard redesign: compact accordion todos grouped by company
7. Inline todo editing with multi-assignee support
8. CRM detail modal with per-contact attachments
9. Share links with password gates
10. Unified email inbox (IMAP sync + SMTP send + reply/forward/delete/star/label)
11. **Outreach data model** — `outreach_targets` table + 7-status workflow
12. **Drafter** — Template A/B with prompt caching
13. **Daily queue UI** — Today vs All views, follow-up cadence (Day 3/7/14)
14. **Signal enricher** — Web search via Claude, 14-day cache
15. **Candidate generator** — Brand list + per-brand contact discovery
16. **Apollo integration** — org search, enrich, people api_search, match
17. **CSV export** — Full target download
18. **Share view outreach** — Team can use outreach via share link

### Audit-deferred (intentionally not built)

| ID | What | Why deferred |
|---|---|---|
| C | Follow-up voice validation against real samples | Need Sam's actual follow-up DMs first |
| E | "Convert to Lead" button on replied targets | Wait until first reply lands |
| G | Bulk-draft all of Today's queue | First few weeks Sam wants to review each |
| I | Cache `brand_name → org_id` mapping | Premature; perf isn't painful |
| J | Server-side bulk backfill job | Only matters at 50+ brand batches |
| K | Per-team-member auth on share link | "Anyone with link + password" is fine |

---

## 21. Memory Files

Claude's persistent memory for this user:

```
~/.claude/projects/-Users-samfreeman/memory/
├── MEMORY.md                         # Index of all memories
├── user_businesses.md                # Sam's four businesses
├── project_personal_os.md            # The dashboard itself as a project
└── project_flair_b2s_outreach.md     # The back-to-school 2026 push
```

These files capture cross-session context. They're auto-loaded by the Claude
runtime — don't reference paths inside the prompts intended for the LLM.

---

## 22. Outstanding Security Items

1. **Anthropic API key** — rotate at https://console.anthropic.com/settings/keys.
   Update both Railway Variables and `~/command-center/.env.local`.
2. **GitHub PAT** — consider switching to SSH for permanence:
   ```bash
   git remote set-url origin git@github.com:samjfreeman03-hub/Command-Center.git
   ```

---

## 23. Working Conventions

### When in doubt, read the actual file

Type definitions in `lib/types.ts` and the SQL in `lib/db.ts` are the source of
truth — not this document. If this file disagrees with the code, the code is
right.

### Commit style

```
feat(scope): short summary
fix(scope): short summary
chore(scope): short summary
```

Body with bullet points. No emoji. No "Generated with Claude" footer.

### Don't push without testing

Pattern: typecheck → production build → commit → push. Railway builds take
~5–10 minutes; verify with hard refresh after deploy shows Active.

### Voice samples are the source of truth for drafter quality

To improve message quality, edit `lib/prompts/flair-voice-samples.md` not the
system prompt in the route handler.

### The Apollo lib is the highest-leverage surface

Contact-quality issues trace to:
- Disambiguation (wrong company) → improve category hints in `apollo.ts`
- Seniority (too junior) → tighten `person_seniorities` filter
- Title relevance (miscategorized) → adjust `ICP_TITLE_KEYWORDS`

Use `node scripts/debug-apollo.js` to probe raw Apollo responses.

### Operational checklists

**Adding a target manually:** FLAIR → Outreach → Add target → Fill fields →
Enrich (optional) → Draft → Tweak → Sent this after pasting into LinkedIn

**Bulk-seeding pipeline:** FLAIR → Outreach → All targets → Suggest brands →
Pick category/size/count → Review + select → Add as targets

**Sharing with team:** Get share URL from `/b/[slug]` Share button → share URL
+ password (`[BusinessName]team123!`) → 30 days of access

---

## 24. Pending / In-Progress Work

### Uncommitted Email Actions (as of 2026-06-08)

The following files have uncommitted modifications:

- `app/api/email/[id]/route.ts` — DELETE (IMAP Trash + cache delete), PATCH
  (star toggle via IMAP flags, label via local DB)
- `app/inbox/inbox-client.tsx` — Full rewrite: Reply, Reply All, Forward,
  Delete, Star, Label picker, compose modal with 4 modes (compose/reply/
  replyAll/forward)
- `lib/db.ts` — Added `setEmailStarred()`, `setEmailLabel()`,
  `deleteEmailFromCache()` methods

**Status:** Code is written to disk but needs type-checking (`npx tsc --noEmit`),
then commit + push to deploy.

---

*End of CLAUDE.md.* Update whenever a major architectural change ships.
Last updated: 2026-06-08.
