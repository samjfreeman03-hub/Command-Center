# FLAIR OS and Command Center: full alignment plan

Written 2026-11-17 for Sam, after he said the integration so far ("copy Tyler's
pipeline onto a page") is not alignment, and that his CRM, leads, outreach and
meeting notes must line up with FLAIR OS across the board.

Grounded in two inventories taken today, both read-only:

- FLAIR OS exposes 92 MCP tools (names and descriptions listed, none called).
- The Command Center's FLAIR records: 41 leads (production only, on Railway),
  a CRM of brand contacts, one drafted outreach target, no FLAIR notes or events.

No code was changed for this plan. Nothing here is built until Sam says go.

---

## 1. The one-sentence rule

**FLAIR OS is the only place FLAIR sales facts live. The Command Center is Sam's
window and his pen.** Every FLAIR record Sam sees in the Command Center is a
FLAIR OS record, and everything Sam adds or changes is written into FLAIR OS
first and shown back. Nothing of Sam's is deleted; it is either matched to a
FLAIR OS record, sent into FLAIR OS, or kept as a private Command Center note.

---

## 2. What each system actually holds

### FLAIR OS (from the tool list)

| Area | What it holds | Read tools | Write tools |
|---|---|---|---|
| Pipeline deals | company, opportunity, contact (name, email, phone), stage (13), sales status, owner, value, waiting on, next check-in, last contacted, notes, logo, linked client | get_pipeline_summary, search_pipeline, get_pipeline_deal, get_pipeline_counts, list_pipeline_stages | create_pipeline_deal(s_batch), update_pipeline_deal, update_pipeline_deal_contact, set/clear logo, cleanup_pipeline_junk |
| Deal timeline | append-only notes, calls, emails per deal | none (gap) | add_pipeline_activity |
| Deal tasks | title, due, assignee, blocker, status | list_pipeline_tasks | create_pipeline_task, complete_pipeline_task |
| Outreach prospects (the cold-outreach desk) | brand, contact, title, email, hook, source URL, cadence (opener, FU1, FU2), touches, replies, bounces, claims, do-not-contact | search_leads, find_outreach_leads, list_outreach_activity, list_outreach_replies, list_outreach_followups, get_outreach_summary, get_outreach_analytics, get_outreach_brand_notes, list_outreach_drafts, templates, experiments, quota, settings | add_outreach_lead, update_outreach_lead, archive_outreach_lead, merge_outreach_leads, claim, record_outreach_touch, start_outreach_cadence, send_outreach_email, drafts, templates, follow-up triage, confirm_linkedin_sent, attach_gmail_thread |
| Eligibility | "REQUIRED before cold messaging": has this brand or person already been contacted by anyone | check_outreach_eligibility, get_pipeline_exclusions | |
| Clients | portal clients, invite status, branding, campaigns, deliverables | list_clients, search_clients, get_client, list_campaigns, list_deliverables, get_recent_activity | link_sampling_campaign_client |
| Meeting notes | Client Meetings inbox, source=command_center, optional deal link | none | upsert_meeting_note (Tyler built it) |
| Team attention | Overview action items for the team | list_action_items | float_action_item, resolve_action_item |
| Schools, sampling, ambassadors, Equinox, College Fit | campus side of FLAIR | several | several |

Two things matter most for Sam's question:

1. **FLAIR OS has no standalone "contacts" book.** People live in three places:
   the contact on a deal, the prospect on the outreach desk, and the client
   record. So "integrating Sam's CRM" means mapping each Command Center CRM
   contact to one of those three, not to a fourth list.
2. **FLAIR OS already runs a full cold-outreach desk** (26 tools, Dispatch
   sending, cadences, quotas, A/B tests, a shared eligibility check). The
   Command Center's FLAIR Outreach tab is a second, disconnected desk that Sam
   barely uses. Two desks means two people can cold-contact the same brand
   without knowing. That is the biggest alignment risk in the whole picture.

### Command Center (FLAIR business)

| Tab | Records | Today |
|---|---|---|
| Pipeline | 41 leads (Sam's), plus the mirror once dry run is off | Mirror built; lane shows 41 as "Not in FLAIR OS" only because the mirror is empty under dry run |
| CRM | brand contacts: brand, person, title, email, phone, status, notes, categories, attachments | Not connected to FLAIR OS at all |
| Outreach | targets with drafts and a 3/7/14 cadence | One drafted target; unused |
| Todos | FLAIR todos | Tyler's 2 deal tasks mirror in as locked todos |
| Notes, Events, Initiatives, Money | 0 FLAIR notes and events | Stay Sam's; never synced |
| Meetings (Wispr Flow) | all of Sam's meetings | Not yet surfaced in the Command Center |

---

## 3. Entity by entity: source of truth and direction

| Entity | Source of truth | FLAIR OS to Command Center | Command Center to FLAIR OS | Sam's existing records |
|---|---|---|---|---|
| Deals | FLAIR OS | Full mirror (built) | New lead = create_pipeline_deal (never forceCreate, stage engaged, owner Sam); edits = update_pipeline_deal restricted to company, contact, next step, and stages up to proposal (Tyler's policy); notes = add_pipeline_activity | 41 leads: matched by the lane (email, company+person, domain). Same = merge into the mirror row. Not in FLAIR OS = Sam picks "Send to FLAIR OS" or "Keep here as private" |
| Deal contacts | FLAIR OS | Shown on the deal and in the CRM people view | update_pipeline_deal_contact | CRM contacts whose company has a deal link to that deal's contact |
| Outreach prospects | FLAIR OS | Read view: replies, follow-ups due, who contacted whom | add_outreach_lead for a brand Sam wants worked; check_outreach_eligibility before anyone reaches out | CRM contacts with no deal: "Send to FLAIR OS outreach" or "Keep here" |
| Clients | FLAIR OS | Mirror as CRM status "client" (built, 5 clients) plus their campaigns and deliverables | none | none |
| Deal tasks | FLAIR OS | Mirror into todos (built) | create_pipeline_task, complete_pipeline_task; Sam's own FLAIR todos stay his unless he attaches them to a deal | Sam's FLAIR todos stay local |
| Deal timeline | FLAIR OS | Blocked: no read tool (ask Tyler) | add_pipeline_activity for Sam's notes | Sam's lead notes stay private unless he sends one |
| Meeting notes | Wispr Flow (recorded by Sam), delivered to FLAIR OS | n/a | upsert_meeting_note with source=command_center plus a one-line add_pipeline_activity pointer; per-meeting Send, never blanket | none yet |
| Private notes, events, initiatives, money, non-FLAIR meetings | Command Center | never | never | untouched |

Rule for Sam's 41 leads and his CRM contacts: the Command Center proposes the
match, Sam clicks once, and only then does anything move. Nothing is auto-merged
and nothing is auto-created in FLAIR OS.

---

## 4. The FLAIR page, redesigned

The page people see today is 13 columns, a status strip full of engineering
words, and a lane of 41 identical cards. Replace it with four plain blocks,
top to bottom:

1. **Connection line.** "Connected to FLAIR OS. Updated 2 minutes ago." Or
   while dry run is on: "Reading FLAIR OS but not saving yet. Ask to turn on
   saving." One line, one Refresh button, nothing else.
2. **Your side.** Three or four cards: deals you own, tasks assigned to you,
   replies waiting, moved this week. Numbers from FLAIR OS. Empty cards say why.
3. **Pipeline as a list grouped by stage**, in FLAIR OS order, with Outreach
   (56 deals) collapsed to one row with a count and "Show all". Each row:
   company, opportunity, contact, owner, last contacted, next check-in. Click
   opens the deal dialog (built). Lost and Paused at the bottom, collapsed.
4. **Needs a decision.** A compact table, matches first, with plain buttons:
   "Same deal, merge" / "Different deal" / "Send to FLAIR OS" / "Keep it here".
   Shows a count in the tab when non-empty and disappears when empty.

The CRM tab for FLAIR becomes a **people view over FLAIR OS**: every contact
shows where they live (On deal X / Being prospected / Client / Only here) and
the same one-click actions. The Outreach tab for FLAIR becomes a **read view of
the FLAIR OS desk** (replies, follow-ups due, this week's sends) with one action:
"Add a brand to FLAIR OS outreach", which runs the eligibility check first.
Sam's own drafting desk stays for MTRNM, untouched.

Today's dashboard: FLAIR rows count mirrored active deals and Sam's assigned
FLAIR OS tasks. Ask AI reads the same mirror.

---

## 5. Phases

| Phase | What Sam gets | Needs from Tyler | Size |
|---|---|---|---|
| A. Make it readable (now) | Dry run off so the mirror fills; the redesigned FLAIR page from section 4; the 41 leads reconciled by Sam in one sitting | Nothing (10 read tools already scoped) | **Built 2026-11-17** (`FLAIR_OS_MIRROR_BUILD.md` section 9); the dry-run flip and the 41 decisions are Sam's |
| B. People and outreach in view | CRM people view; Outreach tab as a FLAIR OS read view; clients with campaigns and deliverables; replies waiting in Your side | Read scope: search_leads, list_outreach_replies, list_outreach_followups, list_outreach_activity, get_outreach_summary, list_campaigns, list_deliverables, list_action_items | 2 to 3 days |
| C. Sam's pen | Add or edit a deal, a contact, a next step, a note or a task in the Command Center and it lands in FLAIR OS first; "Send to FLAIR OS" on the 41 leads and CRM contacts; "Add to outreach" with eligibility check | Write scope: create_pipeline_deal, update_pipeline_deal (restricted fields), update_pipeline_deal_contact, add_pipeline_activity, create_pipeline_task, complete_pipeline_task, check_outreach_eligibility, add_outreach_lead | 3 to 4 days |
| D. Meeting handoff | FLAIR meetings from Wispr Flow listed on the FLAIR page, matched to deals, one-click Send to Tyler's Client Meetings inbox (new deal created if none) | upsert_meeting_note (exists), plus the create tools from C | 2 days after C |
| E. Finishing | Deal timeline in the dialog; lost deals; paging past 100 | Tyler: activity read tool, includeLost, offset or updatedSince | small, when he ships them |

Every write in C and D goes through FLAIR OS's own dedupe and never uses
forceCreate. Every call stays inside the allowlist and the static test keeps
failing the build if a tool outside it appears.

---

## 6. Decisions Sam needs to make

1. **Approve the direction** in sections 1, 3 and 4. The big one: FLAIR cold
   outreach lives in FLAIR OS only, and the Command Center's FLAIR Outreach tab
   turns into a view of Tyler's desk. (MTRNM outreach is unaffected.)
2. **Turn saving on**: set FLAIR_OS_SYNC_DRY_RUN=0 on Railway. Only Sam can.
   Until then every lane verdict is "Not in FLAIR OS" by construction.
3. **Send Tyler the scope request** (draft in section 7). Phases B, C and D
   wait on it; phase A does not.
4. **Default for his 41 leads** that truly are not in FLAIR OS: send them in as
   engaged deals owned by Sam, or keep them private. Recommendation: Sam decides
   per row in "Needs a decision"; no bulk default.

---

## 7. Draft note to Tyler (for Sam to send)

> Tyler, the Command Center mirror is live on my side and I want to take it
> from "read Tyler's board" to real alignment: my CRM, my leads and my meeting
> notes all landing in FLAIR OS so you never get a verbal recap again. Could
> you widen the command_center key in two steps?
>
> Reads now: search_leads, list_outreach_replies, list_outreach_followups,
> list_outreach_activity, get_outreach_summary, list_campaigns,
> list_deliverables, list_action_items.
>
> Writes after we have looked at the reads together: create_pipeline_deal,
> update_pipeline_deal (I will only ever send company, contact, next step, and
> stage moves up to proposal, per your policy), update_pipeline_deal_contact,
> add_pipeline_activity, create_pipeline_task, complete_pipeline_task,
> check_outreach_eligibility, add_outreach_lead, upsert_meeting_note.
>
> Still open from before: paging or updatedSince on search_pipeline and
> list_pipeline_tasks, an includeLost flag, and a read tool for one deal's
> activities. Also please rotate the key at some point since it has moved
> between machines on my side.

---

## 8. What is not in this plan, on purpose

- Schools, sampling, ambassadors, Equinox and College Fit stay in FLAIR OS
  only; Sam has no Command Center surface for them and asked for none.
- Sending outreach email from the Command Center. FLAIR OS has quotas, a kill
  switch and copy checks; sending goes through Tyler's desk.
- Any automated merge or automated create in FLAIR OS. Every change to a FLAIR
  OS record starts with a click by Sam.
- Deleting anything of Sam's. "Keep it here" always exists.
