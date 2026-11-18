import type { Lead } from "@/lib/types";

/**
 * FLAIR OS stage slug (+ sales_status, + the stage flags FLAIR OS publishes)
 * to the Command Center display stage. The slug stays on the lead as
 * `flair_os_stage`; this is only the rollup the board shows.
 *
 * Real stage list seen on portal.theflaircollective.com on 2026-11-15:
 * engaged, proposal-owed, proposal (Proposal Sent), contract, invoice,
 * signed (won), campaign (Active, won), accounting (won), closed (won), lost,
 * outreach, ambassador-sourcing, paused (non-lifecycle).
 */
export const FLAIR_OS_STAGE_ROLLUP: Record<string, Lead["stage"]> = {
  outreach: "new",
  engaged: "qualified",
  "first-call": "qualified",
  first_call: "qualified",
  meeting: "qualified",
  "ambassador-sourcing": "qualified",
  "proposal-owed": "proposal",
  proposal: "proposal",
  contract: "proposal",
  invoice: "proposal",
  signed: "won",
  campaign: "won",
  accounting: "won",
  closed: "won",
  active: "won",
  lost: "lost",
  paused: "parked",
};

export const FLAIR_OS_STAGE_LABELS: Record<string, string> = {
  outreach: "Outreach",
  engaged: "Engaged",
  "first-call": "First call",
  first_call: "First call",
  meeting: "Meeting",
  "ambassador-sourcing": "Ambassador sourcing",
  "proposal-owed": "Proposal owed",
  proposal: "Proposal sent",
  contract: "Contract",
  invoice: "Invoice",
  signed: "Signed",
  campaign: "Active",
  accounting: "Accounting",
  closed: "Closed",
  active: "Active",
  lost: "Lost",
  paused: "Paused",
};

/** Command Center stage to the FLAIR OS slug the deal write tools accept (their enum, seen 2026-11-17). */
export const CC_TO_FLAIR_OS_STAGE: Record<Lead["stage"], string> = {
  new: "outreach",
  contacted: "outreach",
  qualified: "engaged",
  proposal: "proposal",
  won: "campaign",
  lost: "lost",
  parked: "outreach",
  nurture: "outreach",
};

/** Slugs the deal create and update tools accept; proposal-owed, ambassador-sourcing and paused are not in their enum. */
export const FLAIR_OS_WRITABLE_STAGES = ["outreach", "engaged", "first-call", "meeting", "proposal", "contract", "invoice", "campaign", "closed", "lost"] as const;

export type StageFlags = { isWon?: boolean | null; isLost?: boolean | null; isLifecycle?: boolean | null };
export type Rollup = { stage: Lead["stage"]; known: boolean };

/**
 * @param hasContact true when FLAIR OS shows any contact with the lead
 *   (`lastContacted` set, or an activity); an `outreach` deal with contact
 *   shows as Contacted instead of New.
 * @param flags the stage's own won/lost/lifecycle flags from
 *   `list_pipeline_stages`, used before guessing for a slug we do not know.
 */
export function rollupStage(slug: string | null, salesStatus: string | null, hasContact: boolean, flags?: StageFlags): Rollup {
  const status = salesStatus?.toLowerCase() ?? null;
  // Parked and nurture are their own states so Sam never reads them as lost.
  if (status === "parked" || status === "paused") return { stage: "parked", known: true };
  if (status === "nurture" || status === "nurturing") return { stage: "nurture", known: true };
  const key = slug?.toLowerCase() ?? "";
  if (key === "outreach") return { stage: hasContact ? "contacted" : "new", known: true };
  const mapped = FLAIR_OS_STAGE_ROLLUP[key];
  if (mapped) return { stage: mapped, known: true };
  if (flags?.isLost) return { stage: "lost", known: true };
  if (flags?.isWon) return { stage: "won", known: true };
  if (flags?.isLifecycle === false) return { stage: "parked", known: true };
  // Unknown slug: keep it visible in the middle of the board and log it.
  return { stage: "qualified", known: false };
}

export function flairOsStageLabel(slug: string | null, serverLabel?: string | null): string {
  if (!slug) return "";
  return FLAIR_OS_STAGE_LABELS[slug.toLowerCase()] ?? serverLabel ?? slug;
}
