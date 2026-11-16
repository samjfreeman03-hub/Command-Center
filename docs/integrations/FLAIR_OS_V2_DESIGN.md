# FLAIR OS mirror v2: make the FLAIR page a view of FLAIR OS

Written 2026-11-15 after the first production switch-on. Status: **built the same night** (see `FLAIR_OS_MIRROR_BUILD.md` section 8). Deviations from this text: verdicts are computed on read rather than stored per pull; stage metadata and the lane ride on `GET /api/flair-os/status` and the server-rendered page props instead of separate GET routes; the lane decisions are one `POST /api/flair-os/reconcile` route; Link folds the deal's auto-created mirror row into Sam's lead (nothing of Sam's is deleted, and the deal reappears from FLAIR OS on every pull); Keep separate has an Undo.

## 1. What went wrong with v1 as a product

Phase 1 was built as a data mirror first and a view second. It copies FLAIR OS deals into the Command Center's existing lead table and then shows them on the existing six-column board (New, Contacted, Qualified, Proposal, Won, Lost) plus Parked and Nurture. That decision has three consequences Sam ran into on day one:

1. **It does not look like FLAIR OS.** Tyler's pipeline has thirteen stages with their own meaning (Proposal Owed versus Proposal Sent, Contract, Invoice, Signed, Active, Accounting, Closed, Ambassador Sourcing, Paused). The rollup squashes them into the Command Center's generic stages. Even fully populated, the page is the old Command Center board with more cards, not the FLAIR OS pipeline. Sam's words: the format stayed the same instead of mirroring.
2. **Dry run hides the result.** With `FLAIR_OS_SYNC_DRY_RUN=1` the pull computes everything and writes nothing, so the board stays empty and the only evidence is inside a Details drawer. That is an engineering safety switch presented as a product feature. It read as "not working".
3. **No reconciliation view.** Sam's own FLAIR leads entered in the Command Center before the mirror and Tyler's FLAIR OS deals sit in the same columns, told apart only by a small badge. There is no place that answers "is this already in FLAIR OS?" or "are these two the same company?", which was one of the reasons for the integration.

The data layer underneath is sound and stays: the pull, the allowlist, the field-level log, the locked rows, the missing-deal check, the mock and tests. What changes is what the FLAIR page shows and how dry run behaves.

## 2. Principle

When the FLAIR OS connection is on, the FLAIR page's Pipeline tab **is** FLAIR OS, read-only, in FLAIR OS's own terms. The Command Center adds only what FLAIR OS does not have: Sam's attachments and private notes, the reconciliation of Sam's own leads against it, and later the write-back and meeting handoff.

## 3. The board

- **Columns are FLAIR OS stages**, in FLAIR OS order, with FLAIR OS labels and colors, taken from `list_pipeline_stages` on every pull and stored (slug, label, color, sort order, won/lost/lifecycle flags). Today that is: Engaged, Proposal Owed, Proposal Sent, Contract, Invoice, Signed, Active, Accounting, Closed, Lost, Outreach, Ambassador Sourcing, Paused. If Tyler adds or renames a stage, the board follows on the next pull.
- **Outreach is shown condensed.** Fifty-six of seventy-one deals are outreach-stage. Per Sam's decision they are all mirrored, but the lane opens collapsed: a count, the owner split, and the five most recently contacted, with one click to expand to all. Every other lane shows every card.
- **Paused and Lost sit at the end**, visually separated, since they are not live pipeline. Lost deals only appear once FLAIR OS exposes them (today its list hides them; a deal that moves to lost after being mirrored still shows).
- **Cards show FLAIR OS fields**: company and opportunity name, contact, owner (Tyler or Sam), sales status when not active, last contacted, next check-in, waiting on, deal value when set. No Command Center stage name anywhere on the FLAIR board.
- **Header numbers come from FLAIR OS**: deals by status (active, won, lost), open and booked value from `get_pipeline_counts`, last pull time, and the Command Center-only count from the reconciliation lane. The current "$0 pipeline, 0 won" header, computed from Command Center fields, goes away on this page.
- **Opening a card** shows the full FLAIR OS record read-only, Sam's attachments and private note (kept here, never sent), and the FLAIR OS timeline once Tyler exposes an activity read. The Command Center's own lead editor never opens for a mirrored deal.

The Command Center's internal `stage` column on mirrored rows is still filled (it drives Today-page counts and search), but the FLAIR page stops using it for layout. Other businesses' pipelines are untouched.

## 4. Reconciliation lane: "In Command Center only"

Every FLAIR lead that exists in the Command Center without a `flair_os_id` goes into one lane at the left of the board, with a match verdict against FLAIR OS computed on each pull:

| Verdict | Rule | Shown as |
|---|---|---|
| Same record | contact email equal, or company name equal after normalizing (case, punctuation, "Inc", "The") and contact name equal | "Already in FLAIR OS as <deal>" with **Link** |
| Likely same | email domain equal and company similar, or company equal with no contact to compare | "Probably <deal>" with **Link** and **Keep separate** |
| Not in FLAIR OS | nothing matches | "Not in FLAIR OS" and, in phase 2, **Send to FLAIR OS** |

**Link** records the pairing (`leads.flair_os_id` set, Sam's notes and attachments kept, the row becomes a mirrored row). **Keep separate** remembers the decision so the suggestion stops. Nothing is auto-linked and nothing is ever deleted. Each verdict is logged like any other change.

The same matcher runs **inside FLAIR OS**: two deals with the same normalized company (the live data already has two "Skinny Straws") get a "Possible duplicate in FLAIR OS" marker on both cards, for Tyler to resolve there. The Command Center never merges FLAIR OS records.

## 5. Dry run becomes a preview, not a blank page

- The **Dry run button leaves the UI**. `FLAIR_OS_SYNC_DRY_RUN` stays as an env switch for first contact with a new environment, and while it is on the strip says so in plain words: "Dry run on: FLAIR OS is read, nothing is saved. Set FLAIR_OS_SYNC_DRY_RUN=0 to mirror." with the would-be counts right in the strip.
- **Sync now** stays for admins. **Pause** stays.
- The strip's Details keep the last pull, drift (missing, unknown stages, Command Center-only count), and recent field-level changes.

## 6. What this changes in code

| Area | Change |
|---|---|
| `lib/flair-os/store.ts` | Persist stage metadata (new table `flair_os_stages`: slug, label, color, sort order, flags, seen_at). Keep `flair_os_stage` on leads as the layout key. Matcher over local FLAIR leads and over mirrored deals; `flair_os_links` decisions (linked, kept separate). |
| `lib/flair-os/sync.ts` | Store stages; run the matcher after upserts; persist counts from `get_pipeline_counts` in sync state for the header. |
| `app/api/flair-os/*` | `GET stages`, `GET reconciliation`, `POST link`, `POST keep-separate`. |
| `components/flair-os-board.tsx` (new) | The FLAIR OS board: stage columns from metadata, condensed Outreach lane, Paused and Lost at the end, reconciliation lane, FLAIR OS header, card with FLAIR OS fields. Replaces the pipeline board on the FLAIR page when the mirror is on. Mobile: stage picker as today. |
| `components/pipeline-panel.tsx` | When `flairOs.enabled`, render `FlairOsBoard` instead of the generic board; Parked and Nurture columns and the rollup-based layout go away for FLAIR. Other businesses unchanged. |
| `components/flair-os-panel.tsx` | Strip loses Dry run; dry-run state explained inline; mirrored lead dialog shows FLAIR OS fields in FLAIR OS order. |
| Tests | Mock seed gets a duplicate company and a few Command Center-only leads; checks for stage metadata, lane membership, matcher verdicts, link and keep-separate, and that linking never deletes. |

Not changed: allowlist, client, normalizers, locked rows, missing check, schedule, share-link rules. Phase 2 (write-back) and phase 3 (meeting handoff) plans stand; the reconciliation lane is where "Send to FLAIR OS" will live.

## 7. Open questions for Sam (defaults built; change on request)

1. Outreach lane condensed by default (proposed) or fully open like the others.
2. Does the Today page keep counting mirrored deals in "active pipeline"? Proposed yes, using FLAIR OS's active status.
3. Should Sam's Command Center-only FLAIR leads be allowed to stay separate indefinitely, or should every one end up either linked or sent to FLAIR OS in phase 2 (proposed: allowed to stay, but the lane keeps them visible).
