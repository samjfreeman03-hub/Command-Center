# FLAIR OS mirror, phase 1 build notes

Built 2026-11-15 on branch `integrations/flair-os-mirror` (worktree "Sam's Command Center FLAIR OS worktree"). Not committed, not pushed, not deployed. Section 7 records the first contact with the real FLAIR OS the same evening (read-only, local database only).

Companion documents in the main checkout: `docs/integrations/FLAIR_OS_SYNC_PLAN.md` (why), `docs/integrations/FLAIR_OS_FIELD_CONTRACT.md` (what the two systems agreed), `docs/integrations/TYLER_DISCOVERY_BRIEF.md` and Tyler's answers (Desktop, "For Tyler (FLAIR OS)/from-tyler").

## 1. What phase 1 does

Read-only. The Command Center pulls from FLAIR OS on a timer (default 5 minutes, manual "Sync now" always available) and keeps a mirror of:

| FLAIR OS | Command Center | Notes |
|---|---|---|
| pipeline deals | `leads` rows under business `flair` | `flair_os_id` set; stage rolled up per section 4 of the contract; `flair_os_stage` and `flair_os_sales_status` keep the original |
| pipeline tasks | `todos` rows | linked to the mirrored lead through `lead_id`; `status done` when FLAIR OS says done |
| clients | `brand_contacts` rows | `flair_os_client_id` set; active becomes `active_partner`, paused or past becomes `past_partner` |
| deal activities | `flair_os_activities` | shown as the "FLAIR OS timeline" in the lead dialog |

Rules that hold in phase 1:

- FLAIR OS is the source of truth. Mirrored leads and todos cannot be edited or deleted in the Command Center. The API answers 409 with code `flair_os_managed`; the UI explains instead of failing silently.
- Deals that disappear from FLAIR OS are never deleted here. They get `flair_os_missing_at` and show up as "to review" on the strip. They clear themselves if the deal comes back.
- Every change is logged field by field (`flair_os_sync_log`: old value, new value, which pull). Dry runs log too, marked `dry_run`, and write nothing else.
- Only the nine read tools in `lib/flair-os/allowlist.ts` are ever called. The mirror test scans the code for any denied or write tool name and fails if one appears outside the allowlist file.
- Two new Command Center stages exist only for mirrored leads: `parked` and `nurture` (from FLAIR OS `sales_status`). Local leads cannot be moved into them. They do not count as active pipeline.
- One pull at a time (in-process lock). The scheduler is a `setInterval` registered from `instrumentation.ts`; a pause flag in `flair_os_sync_state` stops scheduled pulls but leaves manual ones available.
- Activities are keyed by their FLAIR OS id, and an entry that comes back under a new id with the same deal, kind, body and time is not stored twice (found on a rerun of the test, fixed the same evening).
- Share links for FLAIR can see the strip and the mirrored leads but cannot sync, pause, or change settings. Other businesses never see any of it.

## 2. Where the code is

| Path | Role |
|---|---|
| `lib/flair-os/config.ts` | env switches: `FLAIR_OS_MCP_URL`, `FLAIR_OS_MCP_KEY`, `FLAIR_OS_SYNC_ENABLED`, `FLAIR_OS_SYNC_DRY_RUN`, `FLAIR_OS_SYNC_INTERVAL_MIN` (0 = manual only), `FLAIR_OS_MIN_GAP_MS` |
| `lib/flair-os/allowlist.ts` | the nine read tools, the phase 2 write tools (not called anywhere yet), the always-denied list |
| `lib/flair-os/client.ts` | MCP over HTTP: initialize, tools/call, JSON or SSE replies, bearer key, serialized calls with a minimum gap, retries with backoff, structured or text results |
| `lib/flair-os/types.ts` | tolerant normalizers for deals, tasks, clients, activities, stages (field names are Tyler's best guess until he confirms) |
| `lib/flair-os/stage-map.ts` | FLAIR OS slug + `sales_status` to Command Center stage |
| `lib/flair-os/store.ts` | SQLite side: upserts with field diffs, missing reconciliation, log, state, drift report |
| `lib/flair-os/sync.ts` | one pull cycle: stages, deals (paged), missing check, tasks, clients, activities for changed deals |
| `lib/flair-os/scheduler.ts` + `instrumentation.ts` | interval runner |
| `app/api/flair-os/status`, `sync`, `settings`, `leads/[id]/activities` | status for the strip; manual pull (admin); pause flag (admin); timeline for one lead |
| `app/api/leads/[id]`, `app/api/todos/[id]` | 409 guard for mirrored rows |
| `components/flair-os-panel.tsx` | strip, FLAIR OS badge, read-only lead dialog |
| `components/pipeline-panel.tsx`, `todos-panel.tsx`, `dashboard-todos.tsx` | parked and nurture columns, locked cards, badges, guard toasts |
| `lib/db.ts` `migrateFlairOs` | additive columns and tables (see contract section 7) |
| `scripts/flair-os-mock/server.mjs` | synthetic FLAIR OS with Tyler's tool names, two throwaway keys, scope enforcement, test hooks |
| `scripts/flair-os-mock/test-mirror.mjs` | 42-check integration test; results in `docs/integrations/results/mirror-test-results.json` |

## 3. Verification done 2026-11-15

- `npx tsc --noEmit`: clean.
- `npm run build` (production): clean.
- `node scripts/flair-os-mock/test-mirror.mjs`: 42 of 42 checks pass, twice in a row on the same database. Covers dry run, first pull counts, every stage mapping, task and client fields, idempotent second pull, a stage change arriving with old and new values logged, a removed deal flagged not deleted, task completion arriving, 409 guards, pause and resume, runtime allowlist (every call the Command Center made was an allowlisted read on the `command_center` key), mock scope enforcement, share token limits, anonymous refusal.
- Browser walk-through at phone and desktop width, light and dark: strip with Sync now, Dry run, Pause, Details; board with Parked and Nurture columns; FLAIR OS badge on cards; read-only lead dialog with the timeline; todos with FLAIR OS badges and the explanatory toast on tap.

One thing seen in the browser that is not from this change: at pane widths under about 1000 px the business tab row ("Initiatives, Todos, Pipeline, ...") overflows the page horizontally. Same on `main`.

## 4. Switching from the mock to the real FLAIR OS

No code change. Railway (or local `.env`) gets:

```
FLAIR_OS_MCP_URL=https://<flair-portal host>/api/mcp
FLAIR_OS_MCP_KEY=<the command_center key Tyler issues>
FLAIR_OS_SYNC_ENABLED=1
FLAIR_OS_SYNC_DRY_RUN=1        # first runs only
FLAIR_OS_SYNC_INTERVAL_MIN=5
```

Suggested first contact, in order: `FLAIR_OS_SYNC_DRY_RUN=1` and watch the Details panel for a few pulls (the log shows what would be created); check `flair_os_sync_state.known_stages` matches Tyler's ten slugs; then drop the dry-run flag. Pause is one click if anything looks wrong. The key lives only in Railway env, never in this repo.

Before that can happen (Tyler's side): the `command_center` scope with the read allowlist and scope enforcement (his P0 items 1 and 2), and the key. Field names in `types.ts` are tolerant but should be checked against one real `search_pipeline` response.

## 5. Not in phase 1

- Write-back (Command Center to FLAIR OS). The write tool list is in `allowlist.ts` but nothing calls it; `push_paused` defaults to 1 in `flair_os_sync_state`.
- The Wispr Flow meeting handoff. Table `flair_os_meetings` exists, empty, for it.
- Webhooks.
- `updatedSince`: every pull reads the full deal list (14 deals is 6 calls; a few hundred deals is still under 20).

## 6. Running it locally

```
PORT=3777 MOCK_TEST_HOOKS=1 node scripts/flair-os-mock/server.mjs
```

```
ADMIN_PASSWORD=<local password> PORT=3006 FLAIR_OS_MCP_URL=http://127.0.0.1:3777/api/mcp FLAIR_OS_MCP_KEY=cc-mock-key FLAIR_OS_SYNC_ENABLED=1 FLAIR_OS_SYNC_INTERVAL_MIN=0 FLAIR_OS_MIN_GAP_MS=50 npm run dev
```

```
node scripts/flair-os-mock/test-mirror.mjs
```

The two mock keys (`cc-mock-key`, `full-mock-key`) are throwaway strings for the local mock only.

## 7. First contact with the real FLAIR OS, 2026-11-15 (evening)

Tyler issued the `command_center` key the same evening. Endpoint `https://portal.theflaircollective.com/api/mcp` (flair-portal 1.8.0, MCP protocol 2025-06-18). The key lives only in the gitignored `.env.flair-os.local` in the worktree. Steps and results, in order:

1. **Probe** (`scripts/flair-os/probe.mjs`): tools/list shows all 91 tools to every key, but a harmless read outside the agreed list (`get_recent_activity`) was refused with "not allowed for the Command Center MCP key" and the allowed list: the nine read tools plus `get_admin_stats`. Scope is enforced per call. Tyler's P0 is live.
2. **Real shapes differ from the contract's guesses**, so the normalizers, stage map, sync cycle, mock and test were adapted before any pull:
   - `search_pipeline` returns a bare camelCase array (`stageSlug`, `salesStatus`, `dealValue`, `assignedTo` as a display name, `waitingOn`, `nextCheckInAt`, `lastContacted`, `opportunityName`, `createdAt`, no `updatedAt`, no client id). It takes `query`, `stage`, `owner`, `limit` (max 100). **No offset, and lost deals are never returned.**
   - `get_pipeline_deal` returns a flat snake_case row with `updated_at`, `client_id`, `website`, the joined `pipeline_stages` and the assignee `profiles` row. **No activities.**
   - `list_pipeline_tasks` returns `{ ok, tasks }` camelCase (`dealId`, `dueAt`, `status` open/done/cancelled/snoozed, `assigneeId` only), default status open, limit max 100, no offset.
   - `list_clients` returns a bare array (`name`, `company`, `since`, `invite_status`), limit max 200.
   - Refusals and some failures come back as an ordinary result `{ ok: false, error }`; the client now treats that as an error.
   - Thirteen stages with `isWon`, `isLost`, `isLifecycle` flags: engaged, proposal-owed, proposal (Proposal Sent), contract, invoice, signed, campaign (Active), accounting, closed, lost, outreach, ambassador-sourcing, paused (non-lifecycle). The rollup uses the flags for any slug it does not know.
3. **Consequences built in**: one list call per cycle, fanned out per stage only if the 100 cap is hit; detail enrichment (updated_at, client, website, assignee name) for changed and never-detailed deals, 20 per cycle; a mirrored deal that drops out of the list is looked up by id, so a deal moved to lost shows as lost and only a deal FLAIR OS no longer knows is flagged missing; `lastContacted` on an outreach deal rolls it up to Contacted; mock and test updated (46 of 46, twice).
4. **Dry run** against the real server: 71 deals, 2 tasks, 5 clients, 13 stages all known, 24 calls in 26 s, no errors, zero rows written (the log and the profile-name cache only).
5. **Real pull into the local database only** (`data/live/`, gitignored): 71 leads, 2 todos, 5 clients created; second pull unchanged apart from detail enrichment of the next 20 deals. Nothing on Railway has changed.

What the mirror would show today:

| Command Center stage | Deals | From FLAIR OS stage |
|---|---|---|
| Contacted | 55 | outreach with a last-contacted date |
| New | 1 | outreach, never contacted |
| Qualified | 3 | engaged, ambassador-sourcing |
| Proposal | 8 | proposal |
| Won | 4 | campaign |

Owners: Tyler 40, none 30, Sam 1. Lead names come from the contact (58), the company (12) or the opportunity name (1). Two tasks exist, both done, both on a deal the list does not return. The two lost deals in FLAIR OS are invisible to the mirror.

Asks for Tyler that came out of this: paging (offset or `updatedSince`) on `search_pipeline` and `list_pipeline_tasks`, a way to include lost deals (flag or stage filter), and a read tool for a deal's activities so the timeline can fill. None blocks phase 1.

Sam decided (2026-11-15): mirror all deals, outreach-stage included. The Contacted column carries 55 cards today, and the board is a complete mirror of FLAIR OS.

Running the live-bound server locally (the preview launcher cannot read the env file):

```
cd "<worktree>" && set -a && . ./.env.flair-os.local && set +a && RAILWAY_VOLUME_MOUNT_PATH="$PWD/data/live" ADMIN_PASSWORD=<local password> PORT=3007 npm run dev
```

## 8. v2: the FLAIR page becomes the FLAIR OS board, 2026-11-15 (night)

Why: after the production switch-on Sam saw the strip but no pipeline (dry run was on, so nothing was saved), and the board that would have appeared was still the Command Center's generic six columns. His words: the format stayed the same instead of mirroring FLAIR OS, and there was no way to check for duplicates. Design: `FLAIR_OS_V2_DESIGN.md`. Built the same night.

What changed:

- **Board** (`components/flair-os-board.tsx`, new). When the mirror is on, the FLAIR Pipeline tab lays out by FLAIR OS stage: columns come from `list_pipeline_stages` (slug, label, color, order, won/lost/lifecycle flags, stored in `flair_os_stages` on every pull and server-rendered so there is no flash), in FLAIR OS order, with Lost and the non-lifecycle Paused after a divider. Cards show FLAIR OS fields only: company, opportunity name, contact, owner, sales status when not active, waiting on, last contacted, next check-in, deal value, plus Sam's attachment count. Outreach is condensed when it holds nine or more deals (count, owner split, five most recently contacted, Show all). The header shows FLAIR OS's own numbers from `get_pipeline_counts` (active, won, lost, open and booked value when non-zero) and the Command Center-only count. The Command Center stage name no longer appears anywhere on the FLAIR board. Other businesses' pipelines are untouched.
- **Reconciliation lane** "In Command Center only" at the left: every FLAIR lead without a `flair_os_id`, with a verdict from `lib/flair-os/match.ts` against the mirrored deals. Same record: contact email equal, or normalized company and contact name equal. Likely: same company with no contact to compare or a different contact, or same work email domain with a similar company. Otherwise Not in FLAIR OS. **Link** makes Sam's lead the mirror row for that deal (it keeps its id, notes, categories and attachments; the shell row the sync created is folded into it, with its attachments, tasks and timeline re-pointed; FLAIR OS is not touched). **Keep separate** remembers the decision (`flair_os_links`), **Undo** forgets it. Decisions are logged in `flair_os_sync_log` as `record_kind = link`. Verdicts are computed on read, not stored, so they are always current. The same matcher marks "Possible duplicate in FLAIR OS" on mirrored deals that share a normalized company name (the live data has one such pair today).
- **Dry run** is no longer a button. `FLAIR_OS_SYNC_DRY_RUN=1` stays as the env switch, and while it is on the strip says so in plain words with the counts the last read saw and the exact variable to change. Sync now reads "Read now" in that state.
- **Deal dialog** shows fields in FLAIR OS order (company, opportunity, contact, email, phone, stage, sales status, owner, deal value, last contacted, next check-in, waiting on, last change), Sam's private note, FLAIR OS notes, the timeline (still empty until Tyler exposes an activity read), and attachments.
- **Schema** (additive, `migrateFlairOs`): `leads.flair_os_opportunity`, `leads.flair_os_last_contacted_at`, `flair_os_sync_state.counts`, tables `flair_os_stages` and `flair_os_links`.
- **Sync cycle**: stores stage metadata, calls `get_pipeline_counts` once per cycle (25 calls per cycle now instead of 24), fills the two new lead columns.
- **API**: `/api/flair-os/status` now also returns `stages` and `reconciliation`; new `POST /api/flair-os/reconcile` (admin only) with `{ action: "link" | "separate" | "reset", leadId, dealId? }`. Share links read the lane but cannot decide.

Verification:

- `scripts/flair-os-mock/test-mirror.mjs`: 68 of 68 (the mock seed gained a second Liquid Death deal as the duplicate case; the test creates four Command Center-only leads, checks each verdict, links one with an attachment and a private note, pulls again, keeps one separate and undoes it, and checks that nothing of Sam's is deleted and that a share token cannot link). Results in `docs/integrations/results/mirror-test-results.json`.
- `npx tsc --noEmit` and the production build: clean.
- Browser, mock-bound (port 3006): board, lane with all three verdicts, Link flow end to end (lead left the lane, header count dropped, toast), deal dialog, Lost and Paused after the divider, phone layout with the stage picker including the lane.
- Browser, live-bound (port 3007, local database only, dry run off locally): one real read-only pull, 71 deals, 25 calls in 31 s, 13 stages with Tyler's real colors (engaged #D9730D, proposal #337EA9, lost #C14C8A, and so on), counts total 73 (67 active, 4 won, 2 lost), one duplicate pair marked. Nothing on Railway changed.

What Sam will see on cc.samfreeman.org after this deploys: with `FLAIR_OS_SYNC_DRY_RUN=1` still set, the strip explains the dry run and the board shows only the lane (his pre-mirror FLAIR leads, each with a verdict). Setting it to 0 fills the board on the next pull.

## 9. Phase A of the alignment plan: the FLAIR page becomes readable, 2026-11-17

Context: `FLAIR_OS_ALIGNMENT_PLAN.md`. Sam saw the v2 board in production with
dry run on (13 columns, an empty board, his 41 leads in one "Not in FLAIR OS"
column) and said it was not a good way to show the information. Phase A
replaces the board with four plain blocks and fixes one real bug found on the
way.

- **Connection line** (`FlairOsConnection` in `components/flair-os-panel.tsx`,
  replaces `FlairOsStrip`): one sentence ("Connected to FLAIR OS. Updated 2 min
  ago."), amber when paused or when dry run is on ("Reading FLAIR OS but not
  saving yet, so the pipeline below may be empty. Saving is turned on in
  Railway with FLAIR_OS_SYNC_DRY_RUN=0."), red when the last read failed.
  Owner only: Refresh and a Details dialog (last read, what is in the mirror,
  recent changes, Pause or Resume updates). Share views see the line alone.
- **Your side** (new `flairOsStore.yourSide()`, served as `your_side` on
  `GET /api/flair-os/status`): deals Sam owns (of N active), his open tasks
  (past due in red), check-ins overdue across the pipeline, stage moves this
  week from the field log (plus deals contacted this week). Sam is matched by
  display name, `FLAIR_OS_SELF_NAME` (default "Sam"), case-insensitive contains
  on `flair_os_owner` and `todos.flair_os_assignee`.
- **Pipeline as a list** (`components/flair-os-board.tsx`, rewritten):
  groups in FLAIR OS stage order, each a `Card` of rows (company, opportunity,
  contact, waiting on, value, owner, last contacted, next check-in in red when
  past, attachments). Outreach collapses to one summary row at nine or more
  deals ("56 brands in cold outreach. Tyler 36, Unassigned 20. Last contact 2
  d ago. Show all"). Empty stages are one muted line. Lost and Paused sit
  under a closed "Lost and paused" disclosure. Search filters rows. No
  horizontal board and no stage picker on phones: the list stacks.
- **Needs a decision** (the former lane): rows sorted matches first, with the
  verdict badge, a plain reason line ("Matches Glossier in FLAIR OS, Proposal
  owed. Same contact email.") and buttons "Same deal, merge" / "Different
  deal" for matches, "Keep it here" for the rest; kept rows fold under "Kept
  here on purpose" with Undo. Same `POST /api/flair-os/reconcile` as v2.
- **Empty mirror** (production today): the pipeline shows one empty state that
  says why, the cards read 0 with "once FLAIR OS is saved here", and Sam's
  leads list under "Your leads" with no verdicts or buttons, since every
  verdict would be "none" by construction.
- **Bug fixed**: `POST /api/flair-os/sync` passed `dryRun: false` when the
  body had no flag, so a Refresh from the page saved everything even with
  `FLAIR_OS_SYNC_DRY_RUN=1`. The route now passes `undefined` unless the body
  forces a dry run, so the env switch wins. Verified: with dry run on, a
  Refresh reads 22 mock deals and the mirror stays at 0.
- **Tests**: `scripts/flair-os-mock/test-mirror.mjs` section 19 checks the
  Your side numbers against the database (72 checks). Browser walk-through on
  the mock: list, collapsed outreach, merge, keep here, undo, Details dialog,
  phone width, and the dry-run empty state (user-level launch config
  `command-center-flairos-dry`).

- **Follow-up fix, same day (stale list)**: in production the page showed
  "Connected, updated just now" and the FLAIR OS counts while the pipeline
  below stayed on "Nothing from FLAIR OS yet". Cause: the status polls once a
  minute, but the deals list is page state seeded from server props and
  nothing asked for fresh props after the scheduled pull filled the mirror.
  A Refresh that found nothing new said "Up to date" and left the stale list
  in place. `PipelinePanel` now compares `drift.leads_mirrored` from the
  status with the mirrored rows on the page and calls `router.refresh()`
  once per new count, so the list catches up within a poll in both
  directions. Verified on the mock: rows deleted behind the page emptied the
  list within 70 s; a sync fired outside the page filled it within 65 s.

## 10. Two-way write-through and the v4 page, 2026-11-17 (night)

Built after Sam's review of the phase A page ("why is the source of truth one
way?"). Design in `FLAIR_OS_TWO_WAY_PLAN.md`; this is what landed.

- **Write path** `lib/flair-os/write.ts`: every function calls the FLAIR OS
  write tool first (`agent: "CommandCenter"`), then re-reads the deal with
  `get_pipeline_deal` and mirrors that. Nothing local changes on a failed
  write. Log rows carry `direction = 'push'`. Response shapes of the write
  tools are unknown, so the code tolerates them and trusts the re-read; the
  only guess that matters is the created deal's id (tries `id`, `dealId`,
  nested `deal`/`data`, then falls back to a `search_pipeline` by company).
- **Switch**: `FLAIR_OS_WRITE_ENABLED=1`, and dry run always wins. The client
  refuses write tools with code `writes_off` before any request; routes check
  first and answer 409 `writes_off`. `flairOsClientFromEnv` includes the
  switch in its fingerprint so a flip takes effect without a restart of the
  singleton logic.
- **Merge** `lib/flair-os/merge.ts`: compare (same / gap / conflict / FLAIR OS
  only), merge (gaps written, conflicts default to FLAIR OS, notes posted as
  one timeline note with a "From Command Center (Sam), date" header, next
  action as a task, stage move only when ticked and only forward), add
  (`create_pipeline_deal` from the lead; dedupe by email or company unless
  forceCreate; long notes go to the timeline, short ones into `notes`;
  `waitingOn` set right after since create has no such field). Both end in
  `linkLead`, which folds the shell row the write just mirrored.
- **Routes**: reconcile gains compare/merge/add; `/api/flair-os/deals` (POST),
  `/api/flair-os/deals/[dealId]` (PATCH edit; POST note/task/refresh),
  `/api/flair-os/tasks/[taskId]` (PATCH done). `PATCH /api/todos/[id]`
  with only `status: done` on a mirrored todo completes it in FLAIR OS first;
  other fields still 409.
- **Page v4** `components/flair-os-board.tsx` and `components/flair-os-merge.tsx`,
  editable `MirroredLeadModal` in `flair-os-panel.tsx`, "New deal" in
  `pipeline-panel.tsx` posts to `/api/flair-os/deals` when writes are on.
- **Mock**: `cc-write-key` (scope `command_center_write` = reads + the eight
  writes), write tools rewritten to the real input schemas (flat camelCase,
  stageSlug enum, dedupe, agent recorded as `source_agent`), hooks
  `/__test/deal`, `/__test/deals`, `/__test/activities`, `/__test/tasks`.
- **Tests**: `scripts/flair-os-mock/test-writes.mjs`, 53/53 against the
  write-enabled server (port 3007). `test-mirror.mjs` is now 76/76 on the
  read-only server: the static scan allows write names only in
  `allowlist.ts`, `write.ts`, `merge.ts` (it caught a comment in
  `stage-map.ts` on the first run), and three writes-off guards prove every
  write route 409s and the mock sees no write call. Browser check on the
  write server: merge sheet wrote two fields, posted the note, created the
  task, folded the row (pipeline count 15 to 14); drawer edit saved "Waiting
  on" to the mock and showed the refreshed record.
- **Not built**: meeting handoff (`upsert_meeting_note`, phase D), the
  outreach/people reads (phase B), `assigneeId` from `flair_os_profile_map`
  (owner stays whatever FLAIR OS has).
- **Production state after this ships**: nothing writes. Tyler's key is read
  only and `FLAIR_OS_WRITE_ENABLED` is unset. The page redesign is visible;
  decision rows offer "Link only" in the merge sheet until the switch is on.
  Turning writes on = Tyler widens the key per `TWO_WAY_PLAN.md` section 4.1
  (and rotates it), Sam sets `FLAIR_OS_WRITE_ENABLED=1` in Railway.
