# FLAIR OS two-way sync and the FLAIR page, take two

Written 2026-11-17 after the first day of phase A in production. Sam's verdict:
the layout is bad and the integration is one-way when it must be two-way.
Both are right. This document says why, with numbers from the real FLAIR OS,
and lays out the fix. It supersedes section 4 (page layout) of
`FLAIR_OS_ALIGNMENT_PLAN.md` and tightens its phase C into a concrete
two-way design. Everything else in the alignment plan stands.

No deal names, contacts or emails appear here. The repository is public.

---

> **Status, 2026-11-17 night:** A2 (page v4), C1 (write-through, switch,
> mock schemas, tests), C2 (merge sheet, Add to FLAIR OS) and C3 (drawer
> editing, new deal born in FLAIR OS, todo completion) are BUILT and tested
> on the mock (53 write checks + 76 read checks). D (meeting handoff) and B
> (outreach reads) are not. In production writes stay off until Tyler widens
> the key (section 4.1) and `FLAIR_OS_WRITE_ENABLED=1` is set. Build notes:
> `FLAIR_OS_MIRROR_BUILD.md` section 10.

## 1. What the real data looks like

Measured 2026-11-17 with the allowlisted read tools only. Aggregates, no
values recorded.

### 1.1 Open deals by stage

| FLAIR OS stage | Deals | Sales status |
| --- | ---: | --- |
| Outreach | 56 | active |
| Proposal Sent | 8 | active |
| Active (`campaign`) | 4 | won |
| Ambassador Sourcing | 2 | active |
| Engaged | 1 | active |
| Lost | 2 | lost (never returned by the list) |

Seventy-one open deals. Fifty-six of them, 79 percent, are cold outreach.
The deals a human would call "the pipeline" number fifteen.

FLAIR OS flags four stages as won: Signed, Active, Accounting, Closed. So a
deal in Active is won by definition. The page shows a "won" badge next to
every Active deal, which is noise.

### 1.2 How full each field is, across the 71 deals

| Field | Filled | |
| --- | ---: | --- |
| company | 71 | 100% |
| contactName | 58 | 82% |
| notes | 58 | 82% (55 of them under 100 characters) |
| email | 57 | 80% |
| lastContacted | 56 | 79% (21 within 30 days, 35 between 30 and 90) |
| assignedTo | 41 | 58% (40 Tyler, 1 Sam, 30 nobody) |
| opportunityName | 1 | 1% |
| nextCheckInAt | 1 | 1% |
| waitingOn | 1 | 1% |
| followUpDate | 1 | 1% |
| dealValue | 0 | 0% |
| phone | 0 | 0% |
| expectedCloseAt, tags, dealTypes, campuses | 0 | 0% |

Open pipeline tasks in FLAIR OS: zero.

### 1.3 Why that broke the layout

The phase A row was designed on the mock, where every deal had a contact,
a dollar value, a next step and an owner. It reserves a right-hand column
for value, owner and next check-in, and a second line for "Waiting on".
On real data those slots are empty on 99 percent of rows, so each row is a
company name, 50 pixels of air and the word "Unassigned". Sixty-seven of
those in a column is a wall, and the only part Sam acts on, Needs a
decision, sits underneath it.

The four "Your side" cards have the same problem: tasks are always zero
because FLAIR OS has no tasks, and deals you own is one.

---

## 2. The page, redesigned around the data that exists

Principle: a CRM table, dense and aligned, with the actionable list first.
Fields that are empty on most rows get no reserved space.

### 2.1 Views

One row of view switches above the table. Counts live.

| View | Shows | Default when |
| --- | --- | --- |
| Needs my decision | Sam's Command Center leads matched against FLAIR OS | any decisions remain |
| Open deals | every non-won, non-lost deal outside Outreach, grouped by stage | no decisions remain |
| Outreach | the cold-outreach stage on its own, sortable by last contact and owner | |
| Won | won-flag stages, grouped | |
| Lost and paused | | |

Search spans all views.

### 2.2 The table

Row height 36 pixels on desktop. Columns:

| Column | Content | Empty shows as |
| --- | --- | --- |
| Company | company, plus opportunity name in muted text when it differs | never empty |
| Contact | contact name; email as the second line in small muted text, or on hover | blank |
| Owner | initials chip (T, S) | blank, never "Unassigned" |
| Last contact | relative, "12 d"; amber past 30 days, red past 60, for stages other than Outreach | blank |
| Next | next check-in date or "waiting on" text, whichever exists | blank |
| Notes | first 60 characters, muted | blank |

Group header rows inside the table: colored stage dot, stage label, count.
FLAIR OS order. No per-stage card wrappers.

Status is shown only when it disagrees with the group: a "nurture" or
"paused" chip on an active-stage row, nothing on a won-stage row.

Outreach, in the Open deals view, is one summary row at the bottom:
"Outreach 56. 35 Tyler, 21 unassigned. 21 contacted in the last 30 days."
Click opens the Outreach view.

Phone width: Company and Contact stack in one cell, Owner and Last contact
in the other. Notes and Next hide.

### 2.3 Your side, as one line

Replace the four cards with one line under the connection status:

"You own 1 of 67 open deals. 1 check-in overdue. Nothing moved this week."

Each number links to a filtered view. Tasks return to the line the day
FLAIR OS has tasks.

### 2.4 Row click

Opens the deal drawer: every FLAIR OS field, the timeline once Tyler
exposes an activity read, tasks, Sam's attachments, and the Command Center
notes that are not in FLAIR OS. In two-way mode (section 3) the fields are
editable there.

---

## 3. Two-way, properly

### 3.1 The rule, restated

FLAIR OS is the single source of truth for every FLAIR sales fact. The
Command Center is a full read and write client of it. Anything Sam enters
about a FLAIR deal in the Command Center is written to FLAIR OS first, and
the Command Center shows what FLAIR OS then holds. The two are never
allowed to disagree about a field FLAIR OS can store.

The only FLAIR data that lives in the Command Center alone is data FLAIR OS
cannot hold: file attachments, Command Center categories, and private notes
Sam marks as his own. Those are labeled "only here" wherever they appear.

### 3.2 Write-through, not a queue

Each edit in the Command Center:

1. calls the FLAIR OS write tool,
2. on success, updates the mirror row from the result (or a follow-up
   `get_pipeline_deal`) and logs a `push` entry with field-level old and
   new values and `agent: "CommandCenter"` so Tyler sees provenance on the
   deal's source chip,
3. on failure, saves nothing locally and tells Sam. There is no local-only
   version of a FLAIR fact, so there is nothing to reconcile later.

The minute-by-minute pull keeps running and remains the referee. If a pull
ever returns a different value for a field the Command Center just pushed,
FLAIR OS wins, the mirror takes it, and the log records the drift.

Transient failures (timeouts, 5xx) retry three times inside the request.
Beyond that the edit fails visibly. No background outbox: a queue is where
"both identical" quietly stops being true.

### 3.3 Which tool writes what

From the FLAIR OS tool schemas as listed on 2026-11-17.

| Command Center action | FLAIR OS tool | Fields |
| --- | --- | --- |
| Edit contact on a deal | `update_pipeline_deal_contact` | contactName, email, phone, notes |
| Move stage, set status, owner, value, next check-in, waiting on, opportunity name, website, tags | `update_pipeline_deal` | stageSlug, salesStatus, assigneeId, dealValue, nextCheckInAt, waitingOn, opportunityName, website, tags, dealTypes |
| Add a note, log a call or an email | `add_pipeline_activity` | body, kind (note, email, call), touchContact |
| Set a dated next action | `create_pipeline_task` | title, dueAt, actionType, notes, assigneeId |
| Tick a next action | `complete_pipeline_task` | taskId |
| New FLAIR lead | `create_pipeline_deal` | company, stageSlug, contact, notes, dealValue, opportunityName, assigneeId, nextCheckInAt, forceCreate |
| Before any cold outreach from the Command Center | `check_outreach_eligibility` | company, email, domain |
| FLAIR meeting note | `upsert_meeting_note` | externalId, title, summary, meetingStartAt, attendees, dealId |

FLAIR OS prefers `add_pipeline_activity` over overwriting `deal.notes`. The
Command Center follows that: the notes field on a deal is treated as a
short summary; anything longer becomes a timeline entry.

### 3.4 Merge, redone

Today "Same deal, merge" only re-points the local lead at the FLAIR OS deal
and keeps Sam's notes and files on the Command Center side. Sam's objection
is correct: that leaves facts in the Command Center that FLAIR OS never
sees. Merge becomes a compare sheet and a set of writes.

Given a Command Center lead L and a FLAIR OS deal D:

1. **Fill the gaps in FLAIR OS.** For contact name, email, phone, website,
   deal value, next check-in, waiting on and opportunity name: where D is
   empty and L has a value, push L's value. One `update_pipeline_deal` or
   `update_pipeline_deal_contact` call carries all of them.
2. **Show the conflicts.** Where both have a value and they differ, the
   sheet shows them side by side. FLAIR OS is pre-selected. Sam can choose
   the Command Center value, which pushes it. Nothing is silently
   overwritten in either direction.
3. **Carry the history.** L's notes and activity become one
   `add_pipeline_activity` note on D, headed "From Command Center, Sam,
   date", so the deal's timeline holds what Sam knew. D's own notes field
   is not overwritten.
4. **Carry the next step.** If L has a next action with a date, it becomes
   a `create_pipeline_task` on D.
5. **Stage stays FLAIR OS's**, with one exception offered, never assumed:
   if L is further along than D, the sheet says so and offers to move D.
6. **Attachments stay here**, linked to D and labeled "only here", because
   FLAIR OS has no file tool. Categories likewise.
7. **Then fold.** L becomes the mirror row of D, as today. The merge is
   logged as one group of `push` entries so it can be read back and, field
   by field, reversed in FLAIR OS if it was wrong.

"Different deal" and "Keep it here" change meaning:

- **Add to FLAIR OS** replaces both for any lead that really is a FLAIR
  sales lead. It calls `create_pipeline_deal` from L (with `forceCreate`
  and an opportunity name when a same-company deal exists and Sam says this
  is a second opportunity), then folds L into the new deal's mirror row.
  FLAIR OS now holds it; the Command Center shows it.
- **Not a FLAIR deal** remains for leads that were filed under FLAIR by
  mistake. It moves the lead to another business or deletes it. A FLAIR
  sales lead that lives only in the Command Center stops being a state the
  page allows.

### 3.5 After the merge: day-to-day two-way

- New lead on the FLAIR pipeline creates the deal in FLAIR OS directly.
  There are no Command-Center-only FLAIR leads.
- The deal drawer edits write through (3.3).
- The FLAIR CRM tab becomes a people view over FLAIR OS deals and clients.
  Editing a person there writes through `update_pipeline_deal_contact`.
- FLAIR meetings in the Command Center push to FLAIR OS through
  `upsert_meeting_note`, with the deal link. Non-FLAIR meetings never do.
- Todos on mirrored deals create and complete FLAIR OS tasks.

### 3.6 Ownership and identity

`update_pipeline_deal` and `create_pipeline_deal` take `assigneeId`, a FLAIR
OS profile id. The Command Center learns ids from `get_pipeline_deal`
(`assignee_id` plus the joined profile) and keeps them in
`flair_os_profile_map`. Sam's own id is captured the first time a deal he
owns is detailed, or Tyler states it. Until then, owner edits are disabled
in the drawer with a one-line reason.

---

## 4. What stands in the way, and who moves it

### 4.1 The key

The Command Center's FLAIR OS key is scoped to ten read tools. Every write
in section 3 is refused until Tyler widens it. Nothing in the Command
Center can change that, and nothing should try.

Request to Tyler, replacing the note in `FLAIR_OS_ALIGNMENT_PLAN.md`
section 7:

> Please add these tools to the Command Center key.
>
> Writes, all scoped to pipeline deals: `create_pipeline_deal`,
> `update_pipeline_deal`, `update_pipeline_deal_contact`,
> `add_pipeline_activity`, `create_pipeline_task`,
> `complete_pipeline_task`, `upsert_meeting_note`,
> `check_outreach_eligibility`.
>
> Reads: `search_leads`, `list_outreach_replies`,
> `list_outreach_followups`, `list_outreach_activity`,
> `get_outreach_summary`, `list_campaigns`, `list_deliverables`,
> `list_action_items`.
>
> Every write from the Command Center carries `agent: "CommandCenter"` so
> it shows on the deal's source chip, and every one is logged on my side
> with the old and new values.
>
> Three things I noticed that you may want to fix: the `stageSlug` enum on
> `create_pipeline_deal` and `update_pipeline_deal` lists `first-call` and
> `meeting`, which are not stages, and is missing `proposal-owed`,
> `ambassador-sourcing` and `paused`, which are. `search_pipeline` never
> returns lost deals and has no paging past 100. There is no tool to read a
> deal's activity timeline, so I can show what I push but not what you
> write.
>
> And please rotate this key once the scope changes; the current one has
> been through a few environments.

### 4.2 Build order

Everything in sections 2 and 3 can be built and tested now against the
mock, which already implements the full key. The mock's write tools get
updated to the exact schemas listed on 2026-11-17 (they were guessed before
and diverge in field names). The write path sits behind
`FLAIR_OS_WRITE_ENABLED` and the static allowlist test, so none of it can
reach the real FLAIR OS until the key is widened and the switch is flipped.

| Step | Needs Tyler | Size |
| --- | --- | --- |
| A2. Page redesign (section 2) on the data that exists | No | A day |
| C1. Write-through client, push log, `FLAIR_OS_WRITE_ENABLED`, mock schemas, tests | No, to build; yes, to turn on | A day |
| C2. Merge compare sheet with gap fill, conflicts, history, next step, Add to FLAIR OS | Same | A day |
| C3. Deal drawer editing, new lead creates in FLAIR OS, todos as tasks | Same | A day |
| D. Meeting handoff via `upsert_meeting_note` | Same | Half a day |
| B. Outreach read view, people view over FLAIR OS | Yes (reads) | A day |

A2 ships first because it is visible today. C1 and C2 follow immediately so
that the day the key changes, the 41 decisions become real writes rather
than local bookkeeping.

### 4.3 Decisions for Sam

1. Views and default: Needs my decision first while any remain, then Open
   deals. Agree?
2. Merge default: FLAIR OS value wins on conflicts unless Sam picks
   otherwise in the sheet. Agree?
3. "Keep it here" goes away for FLAIR leads; every one either merges or is
   added to FLAIR OS. Agree?
4. Send Tyler the request in 4.1 now, so the key is ready when C1 is.

---

## 5. Not changing

- Nothing is written to the real FLAIR OS until Tyler widens the key and
  Sam flips `FLAIR_OS_WRITE_ENABLED`. The static allowlist test enforces
  the current read-only scope and will be extended, not removed.
- The minute-by-minute pull, the mirror tables, the sync log and the
  reconciliation matcher stay as they are.
- MTRNM, TechSpace, Stealth Labs and personal data never touch FLAIR OS.
- No LinkedIn automation. Cold outreach from the Command Center, if it ever
  happens, goes through `check_outreach_eligibility` first because FLAIR OS
  requires it.
