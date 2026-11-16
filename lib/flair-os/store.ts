import { rawDb } from "@/lib/db";
import type { Lead } from "@/lib/types";
import { FLAIR_OS_BUSINESS_ID } from "./config";
import type { FlairOsActivity, FlairOsClientRecord, FlairOsDeal, FlairOsStage, FlairOsTask } from "./types";
import type { Rollup } from "./stage-map";
import { duplicateGroups, matchLead, type MatchCandidate, type MatchResult } from "./match";

/**
 * SQL for the FLAIR OS mirror. Field contract sections 3 and 7. Every write
 * here is a mirror write (FLAIR OS to Command Center); nothing in phase 1
 * goes the other way.
 */

export type SyncState = {
  pull_paused: boolean;
  push_paused: boolean;
  last_run_at: number | null;
  last_ok_at: number | null;
  last_error: string | null;
  last_summary: CycleSummary | null;
  known_stages: string[];
  /** Last `get_pipeline_counts` result, for the board header. */
  counts: PipelineCounts | null;
};

/** What FLAIR OS reports in `get_pipeline_counts` (kept as given). */
export type PipelineCounts = {
  total: number | null;
  byStage: Record<string, number>;
  byStatus: Record<string, number>;
  openPipelineValue: number | null;
  bookedPipelineValue: number | null;
  fetched_at: number;
};

/** One FLAIR OS stage as stored for the board layout. */
export type StageMeta = {
  slug: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  is_lifecycle: boolean;
};

export type LinkDecision = "linked" | "separate";

/** A FLAIR lead that exists only in the Command Center, with its match verdict. */
export type ReconciliationItem = {
  id: number;
  name: string;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  stage: Lead["stage"];
  updated_at: number;
  decision: LinkDecision | null;
  verdict: MatchResult["verdict"];
  reason: string;
  match: { flair_os_id: string; lead_id: number; company: string | null; contact_name: string | null; stage: string | null } | null;
};

export type Reconciliation = {
  items: ReconciliationItem[];
  /** Mirrored deals that share a company name: deal id to its twins' deal ids. */
  duplicates: Record<string, string[]>;
  counts: { same: number; likely: number; none: number; separate: number };
};

export type FieldChange = { field: string; from: unknown; to: unknown };

export type LogEntry = {
  id: number;
  at: number;
  direction: "pull" | "push";
  trigger: string;
  record_kind: string;
  flair_os_id: string | null;
  local_id: number | null;
  action: string;
  changes: FieldChange[] | null;
  result: string;
  message: string | null;
};

export type DriftReport = {
  leads_mirrored: number;
  leads_missing: number;
  leads_unknown_stage: number;
  leads_local_only: number;
  todos_mirrored: number;
  clients_mirrored: number;
  conflicts_open: number;
  missing: { id: number; name: string; company: string | null; flair_os_id: string; missing_at: number }[];
  local_only: { id: number; name: string; company: string | null; stage: Lead["stage"] }[];
};

export type CycleSummary = {
  ok: boolean;
  trigger: string;
  dry_run: boolean;
  started_at: number;
  finished_at: number;
  duration_ms: number;
  calls: number;
  deals: { seen: number; created: number; updated: number; unchanged: number; missing: number; unknown_stage: number };
  tasks: { seen: number; created: number; updated: number; unchanged: number };
  clients: { seen: number; created: number; updated: number; unchanged: number };
  activities: { fetched: number; deals_checked: number };
  stages: string[];
  unknown_stages: string[];
  warnings: string[];
  error: string | null;
};

type UpsertResult = { localId: number | null; action: "created" | "updated" | "unchanged"; changes: FieldChange[] };

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function diff(existing: Record<string, unknown>, next: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, to] of Object.entries(next)) {
    const from = existing[field] ?? null;
    if ((from ?? null) !== (to ?? null)) changes.push({ field, from, to });
  }
  return changes;
}

export const flairOsStore = {
  getSyncState(): SyncState {
    const row = rawDb().prepare("SELECT * FROM flair_os_sync_state WHERE id = 1").get() as Record<string, unknown>;
    return {
      pull_paused: row.pull_paused === 1,
      push_paused: row.push_paused === 1,
      last_run_at: (row.last_run_at as number | null) ?? null,
      last_ok_at: (row.last_ok_at as number | null) ?? null,
      last_error: (row.last_error as string | null) ?? null,
      last_summary: parseJson<CycleSummary | null>(row.last_summary, null),
      known_stages: parseJson<string[]>(row.known_stages, []),
      counts: parseJson<PipelineCounts | null>(row.counts, null),
    };
  },

  patchSyncState(patch: Partial<{ pull_paused: boolean; push_paused: boolean; last_run_at: number | null; last_ok_at: number | null; last_error: string | null; last_summary: CycleSummary | null; known_stages: string[]; counts: PipelineCounts | null }>) {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.pull_paused !== undefined) { sets.push("pull_paused = ?"); args.push(patch.pull_paused ? 1 : 0); }
    if (patch.push_paused !== undefined) { sets.push("push_paused = ?"); args.push(patch.push_paused ? 1 : 0); }
    if ("last_run_at" in patch) { sets.push("last_run_at = ?"); args.push(patch.last_run_at ?? null); }
    if ("last_ok_at" in patch) { sets.push("last_ok_at = ?"); args.push(patch.last_ok_at ?? null); }
    if ("last_error" in patch) { sets.push("last_error = ?"); args.push(patch.last_error ?? null); }
    if ("last_summary" in patch) { sets.push("last_summary = ?"); args.push(patch.last_summary ? JSON.stringify(patch.last_summary) : null); }
    if (patch.known_stages) { sets.push("known_stages = ?"); args.push(JSON.stringify(patch.known_stages)); }
    if ("counts" in patch) { sets.push("counts = ?"); args.push(patch.counts ? JSON.stringify(patch.counts) : null); }
    if (!sets.length) return;
    sets.push("updated_at = ?");
    args.push(Date.now());
    rawDb().prepare(`UPDATE flair_os_sync_state SET ${sets.join(", ")} WHERE id = 1`).run(...args);
  },

  /** Store the stage list FLAIR OS publishes (label, color, order, flags). Dry run skips the write. */
  upsertStages(stages: FlairOsStage[], opts: { dryRun: boolean }) {
    if (opts.dryRun || !stages.length) return;
    const db = rawDb();
    const stmt = db.prepare(`INSERT INTO flair_os_stages (slug, label, color, sort_order, is_won, is_lost, is_lifecycle, seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET label = excluded.label, color = excluded.color, sort_order = excluded.sort_order,
        is_won = excluded.is_won, is_lost = excluded.is_lost, is_lifecycle = excluded.is_lifecycle, seen_at = excluded.seen_at`);
    const now = Date.now();
    const flag = (v: boolean | null) => (v === null ? null : v ? 1 : 0);
    db.transaction(() => {
      for (const s of stages) stmt.run(s.slug, s.name, s.color, s.order, flag(s.isWon), flag(s.isLost), flag(s.isLifecycle), now);
    })();
  },

  /** Stages in FLAIR OS order. Empty until the first real pull. */
  listStages(): StageMeta[] {
    const rows = rawDb().prepare("SELECT slug, label, color, sort_order, is_won, is_lost, is_lifecycle FROM flair_os_stages ORDER BY sort_order, slug").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      slug: r.slug as string,
      label: r.label as string,
      color: (r.color as string | null) ?? null,
      sort_order: Number(r.sort_order ?? 0),
      is_won: r.is_won === 1,
      is_lost: r.is_lost === 1,
      // Unknown means lifecycle; only an explicit 0 parks the stage.
      is_lifecycle: r.is_lifecycle !== 0,
    }));
  },

  appendLog(entry: { direction: "pull" | "push"; trigger: string; record_kind: string; flair_os_id?: string | null; local_id?: number | null; action: string; changes?: FieldChange[] | null; result: string; message?: string | null }) {
    rawDb()
      .prepare(`INSERT INTO flair_os_sync_log (at, direction, trigger, record_kind, flair_os_id, local_id, action, changes, result, message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(Date.now(), entry.direction, entry.trigger, entry.record_kind, entry.flair_os_id ?? null, entry.local_id ?? null, entry.action, entry.changes?.length ? JSON.stringify(entry.changes) : null, entry.result, entry.message ?? null);
  },

  listLog(limit = 25): LogEntry[] {
    const rows = rawDb().prepare("SELECT * FROM flair_os_sync_log ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({ ...(r as unknown as LogEntry), changes: parseJson<FieldChange[] | null>(r.changes, null) }));
  },

  countLog(): number {
    return (rawDb().prepare("SELECT COUNT(*) AS n FROM flair_os_sync_log").get() as { n: number }).n;
  },

  /** Mirror one deal into `leads`. Returns what happened and the field-level changes. */
  upsertMirroredLead(deal: FlairOsDeal, rollup: Rollup, opts: { dryRun: boolean }): UpsertResult {
    const db = rawDb();
    const opportunity = deal.opportunityName && deal.opportunityName.toLowerCase() !== (deal.company ?? "").toLowerCase() ? deal.opportunityName : null;
    const ownerName = deal.ownerName ?? this.profileName(deal.ownerId) ?? deal.ownerId;
    const next: Record<string, unknown> = {
      name: deal.contactName ?? opportunity ?? deal.company ?? "Untitled deal",
      company: deal.company,
      contact_name: deal.contactName,
      contact_email: deal.email,
      contact_phone: deal.phone,
      stage: rollup.stage,
      flair_os_stage: deal.stage,
      flair_os_sales_status: deal.salesStatus,
      flair_os_owner: ownerName,
      next_action: deal.nextAction,
      next_action_date: deal.nextActionDate,
      value_cents: deal.valueCents,
      flair_os_notes: deal.notes,
      flair_os_opportunity: opportunity,
      flair_os_last_contacted_at: deal.lastContactedMs,
      flair_os_missing_at: null,
    };
    // The list call omits these; only overwrite them when the record has them,
    // so a detail-enriched row is not blanked by the next list pull.
    if (deal.clientId !== null) next.flair_os_client_id = deal.clientId;
    if (deal.updatedMs !== null) next.flair_os_updated_at = deal.updatedMs;
    const existing = db.prepare("SELECT * FROM leads WHERE flair_os_id = ?").get(deal.id) as Record<string, unknown> | undefined;
    if (existing) {
      const changes = diff(existing, next);
      if (!changes.length) return { localId: existing.id as number, action: "unchanged", changes };
      if (!opts.dryRun) {
        const sets = Object.keys(next).map((k) => `${k} = ?`).join(", ");
        db.prepare(`UPDATE leads SET ${sets}, updated_at = ? WHERE id = ?`).run(...Object.values(next), Date.now(), existing.id);
      }
      return { localId: existing.id as number, action: "updated", changes };
    }
    const changes = diff({}, next);
    if (opts.dryRun) return { localId: null, action: "created", changes };
    const now = Date.now();
    const cols = ["business_id", "flair_os_id", ...Object.keys(next), "categories", "created_at", "updated_at"];
    const vals = [FLAIR_OS_BUSINESS_ID, deal.id, ...Object.values(next), "[]", deal.createdMs ?? now, now];
    const res = db.prepare(`INSERT INTO leads (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...vals);
    return { localId: Number(res.lastInsertRowid), action: "created", changes };
  },

  profileName(profileId: string | null): string | null {
    if (!profileId) return null;
    const row = rawDb().prepare("SELECT display_name FROM flair_os_profile_map WHERE profile_id = ?").get(profileId) as { display_name: string } | undefined;
    return row?.display_name ?? null;
  },

  /** Mirrored leads the detail call has not enriched yet (no FLAIR OS updated_at). */
  leadsNeedingDetail(limit: number): { id: number; flair_os_id: string }[] {
    if (limit <= 0) return [];
    return rawDb()
      .prepare("SELECT id, flair_os_id FROM leads WHERE flair_os_id IS NOT NULL AND flair_os_missing_at IS NULL AND flair_os_updated_at IS NULL ORDER BY id LIMIT ?")
      .all(limit) as { id: number; flair_os_id: string }[];
  },

  leadIdForDeal(flairOsId: string): number | null {
    const row = rawDb().prepare("SELECT id FROM leads WHERE flair_os_id = ?").get(flairOsId) as { id: number } | undefined;
    return row?.id ?? null;
  },

  /** Deals mirrored before that did not come back in this cycle's list and are not flagged yet. */
  missingCandidates(seenIds: Set<string>): { id: number; flair_os_id: string }[] {
    const rows = rawDb().prepare("SELECT id, flair_os_id FROM leads WHERE flair_os_id IS NOT NULL AND flair_os_missing_at IS NULL").all() as { id: number; flair_os_id: string }[];
    return rows.filter((r) => !seenIds.has(r.flair_os_id));
  },

  /** Flag, never delete. */
  markMissing(ids: number[], opts: { dryRun: boolean }) {
    if (opts.dryRun || !ids.length) return;
    const db = rawDb();
    const stmt = db.prepare("UPDATE leads SET flair_os_missing_at = ? WHERE id = ?");
    const now = Date.now();
    db.transaction(() => { for (const id of ids) stmt.run(now, id); })();
  },

  upsertMirroredTodo(task: FlairOsTask, leadId: number | null, opts: { dryRun: boolean }): UpsertResult {
    const db = rawDb();
    const notes = [task.notes, task.blocker ? `Blocker: ${task.blocker}` : null].filter(Boolean).join("\n") || null;
    const next: Record<string, unknown> = {
      title: task.title,
      notes,
      status: task.done ? "done" : "open",
      due_date: task.dueDate,
      completed_at: task.done ? task.completedMs ?? Date.now() : null,
      lead_id: leadId,
      flair_os_deal_id: task.dealId,
      flair_os_assignee: task.assigneeName ?? this.profileName(task.assigneeId) ?? task.assigneeId,
      flair_os_updated_at: task.updatedMs,
    };
    const existing = db.prepare("SELECT * FROM todos WHERE flair_os_id = ?").get(task.id) as Record<string, unknown> | undefined;
    if (existing) {
      // completed_at drifts by the fallback clock; compare status instead.
      const { completed_at: _c, ...comparable } = next; // eslint-disable-line @typescript-eslint/no-unused-vars
      const changes = diff(existing, comparable);
      if (!changes.length) return { localId: existing.id as number, action: "unchanged", changes };
      if (!opts.dryRun) {
        const sets = Object.keys(next).map((k) => `${k} = ?`).join(", ");
        db.prepare(`UPDATE todos SET ${sets} WHERE id = ?`).run(...Object.values(next), existing.id);
      }
      return { localId: existing.id as number, action: "updated", changes };
    }
    const changes = diff({}, next);
    if (opts.dryRun) return { localId: null, action: "created", changes };
    const cols = ["business_id", "flair_os_id", ...Object.keys(next), "priority", "created_at"];
    const vals = [FLAIR_OS_BUSINESS_ID, task.id, ...Object.values(next), "medium", Date.now()];
    const res = db.prepare(`INSERT INTO todos (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...vals);
    return { localId: Number(res.lastInsertRowid), action: "created", changes };
  },

  upsertClient(client: FlairOsClientRecord, opts: { dryRun: boolean }): UpsertResult {
    const db = rawDb();
    const status = client.status === "active" ? "active_partner" : client.status === "paused" || client.status === "past" ? "past_partner" : "active_partner";
    const next: Record<string, unknown> = { brand_name: client.name, website: client.website, status };
    const existing = db.prepare("SELECT * FROM brand_contacts WHERE flair_os_client_id = ?").get(client.id) as Record<string, unknown> | undefined;
    if (existing) {
      const changes = diff(existing, next);
      if (!changes.length) return { localId: existing.id as number, action: "unchanged", changes };
      if (!opts.dryRun) {
        db.prepare("UPDATE brand_contacts SET brand_name = ?, website = ?, status = ?, updated_at = ? WHERE id = ?").run(next.brand_name, next.website, next.status, Date.now(), existing.id);
      }
      return { localId: existing.id as number, action: "updated", changes };
    }
    const changes = diff({}, next);
    if (opts.dryRun) return { localId: null, action: "created", changes };
    const now = Date.now();
    const res = db
      .prepare("INSERT INTO brand_contacts (business_id, brand_name, website, status, categories, flair_os_client_id, created_at, updated_at) VALUES (?, ?, ?, ?, '[]', ?, ?, ?)")
      .run(FLAIR_OS_BUSINESS_ID, next.brand_name, next.website, next.status, client.id, now, now);
    return { localId: Number(res.lastInsertRowid), action: "created", changes };
  },

  upsertActivities(dealId: string, leadId: number | null, activities: FlairOsActivity[], opts: { dryRun: boolean }): number {
    if (opts.dryRun) return activities.length;
    const db = rawDb();
    const stmt = db.prepare(`INSERT INTO flair_os_activities (id, flair_os_deal_id, lead_id, kind, body, actor, occurred_at, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET lead_id = excluded.lead_id, kind = excluded.kind, body = excluded.body, actor = excluded.actor, occurred_at = excluded.occurred_at, fetched_at = excluded.fetched_at`);
    // Same entry under a new id (re-imported history, replayed seed): keep one row.
    const twin = db.prepare(`SELECT id FROM flair_os_activities
      WHERE flair_os_deal_id = ? AND id != ? AND kind IS ? AND body IS ? AND occurred_at IS ? LIMIT 1`);
    const now = Date.now();
    let written = 0;
    const run = db.transaction(() => {
      for (const a of activities) {
        if (twin.get(dealId, a.id, a.kind, a.body, a.occurredMs)) continue;
        stmt.run(a.id, dealId, leadId, a.kind, a.body, a.actor, a.occurredMs, now);
        written += 1;
      }
    });
    run();
    return written;
  },

  listActivitiesForLead(leadId: number): { id: string; kind: string; body: string | null; actor: string | null; occurred_at: number | null }[] {
    return rawDb()
      .prepare("SELECT id, kind, body, actor, occurred_at FROM flair_os_activities WHERE lead_id = ? ORDER BY COALESCE(occurred_at, 0) DESC, fetched_at DESC LIMIT 100")
      .all(leadId) as { id: string; kind: string; body: string | null; actor: string | null; occurred_at: number | null }[];
  },

  rememberProfile(profileId: string | null, displayName: string | null) {
    if (!profileId || !displayName || profileId === displayName) return;
    rawDb()
      .prepare("INSERT INTO flair_os_profile_map (profile_id, display_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(profile_id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at")
      .run(profileId, displayName, Date.now());
  },

  /** Decisions Sam made in the reconciliation lane. */
  linkDecisions(): Map<number, { decision: LinkDecision; flair_os_id: string | null }> {
    const rows = rawDb().prepare("SELECT lead_id, decision, flair_os_id FROM flair_os_links").all() as { lead_id: number; decision: LinkDecision; flair_os_id: string | null }[];
    return new Map(rows.map((r) => [r.lead_id, { decision: r.decision, flair_os_id: r.flair_os_id }]));
  },

  mirroredCandidates(): (MatchCandidate & { leadId: number; stage: string | null })[] {
    const rows = rawDb()
      .prepare("SELECT id, flair_os_id, company, contact_name, contact_email, flair_os_stage FROM leads WHERE business_id = ? AND flair_os_id IS NOT NULL AND flair_os_missing_at IS NULL")
      .all(FLAIR_OS_BUSINESS_ID) as { id: number; flair_os_id: string; company: string | null; contact_name: string | null; contact_email: string | null; flair_os_stage: string | null }[];
    return rows.map((r) => ({ id: r.flair_os_id, leadId: r.id, company: r.company, contactName: r.contact_name, email: r.contact_email, stage: r.flair_os_stage }));
  },

  /**
   * The "In Command Center only" lane: every FLAIR lead without a FLAIR OS id,
   * matched against the mirrored deals, plus duplicate groups inside FLAIR OS.
   * Computed on read (a few dozen rows), so it is always current.
   */
  reconciliation(): Reconciliation {
    const candidates = this.mirroredCandidates();
    const byDealId = new Map(candidates.map((c) => [c.id, c]));
    const decisions = this.linkDecisions();
    const locals = rawDb()
      .prepare("SELECT id, name, company, contact_name, contact_email, stage, updated_at FROM leads WHERE business_id = ? AND flair_os_id IS NULL ORDER BY updated_at DESC")
      .all(FLAIR_OS_BUSINESS_ID) as { id: number; name: string; company: string | null; contact_name: string | null; contact_email: string | null; stage: Lead["stage"]; updated_at: number }[];
    const counts = { same: 0, likely: 0, none: 0, separate: 0 };
    const items: ReconciliationItem[] = locals.map((l) => {
      const decision = decisions.get(l.id)?.decision ?? null;
      const m = matchLead({ company: l.company, contactName: l.contact_name ?? l.name, email: l.contact_email }, candidates);
      if (decision === "separate") counts.separate += 1;
      else counts[m.verdict] += 1;
      const c = m.candidate ? byDealId.get(m.candidate.id) : null;
      return {
        ...l,
        decision,
        verdict: m.verdict,
        reason: m.reason,
        match: c ? { flair_os_id: c.id, lead_id: c.leadId, company: c.company, contact_name: c.contactName, stage: c.stage } : null,
      };
    });
    return { items, duplicates: duplicateGroups(candidates), counts };
  },

  /**
   * Link a Command Center lead to a FLAIR OS deal. The lead keeps its id,
   * notes, categories and attachments and takes over the deal's mirror fields;
   * the shell row the sync created for that deal (which holds nothing of Sam's
   * once its attachments, tasks and timeline are moved) is folded into it.
   * Returns the field changes for the log.
   */
  linkLead(leadId: number, dealId: string): { ok: true; folded: number | null; changes: FieldChange[] } | { ok: false; error: string } {
    const db = rawDb();
    const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND business_id = ?").get(leadId, FLAIR_OS_BUSINESS_ID) as Record<string, unknown> | undefined;
    if (!lead) return { ok: false, error: "Lead not found" };
    if (lead.flair_os_id) return { ok: false, error: "That lead is already linked to FLAIR OS" };
    const shell = db.prepare("SELECT * FROM leads WHERE flair_os_id = ?").get(dealId) as Record<string, unknown> | undefined;
    if (!shell) return { ok: false, error: "That FLAIR OS deal is not mirrored here yet" };
    const mirrorFields = [
      "company", "contact_name", "contact_email", "contact_phone", "stage", "value_cents", "next_action", "next_action_date",
      "flair_os_id", "flair_os_stage", "flair_os_sales_status", "flair_os_owner", "flair_os_updated_at", "flair_os_notes",
      "flair_os_client_id", "flair_os_missing_at", "flair_os_opportunity", "flair_os_last_contacted_at",
    ];
    const next: Record<string, unknown> = {};
    for (const f of mirrorFields) next[f] = shell[f] ?? null;
    // Sam's own values win where FLAIR OS has none.
    for (const f of ["company", "contact_name", "contact_email", "contact_phone", "value_cents", "next_action", "next_action_date"]) {
      if (next[f] === null && lead[f] != null) next[f] = lead[f];
    }
    next.name = shell.name ?? lead.name;
    const changes = diff(lead, next);
    const shellId = shell.id as number;
    db.transaction(() => {
      db.prepare("UPDATE lead_attachments SET lead_id = ? WHERE lead_id = ?").run(leadId, shellId);
      db.prepare("UPDATE todos SET lead_id = ? WHERE lead_id = ?").run(leadId, shellId);
      db.prepare("UPDATE flair_os_activities SET lead_id = ? WHERE lead_id = ?").run(leadId, shellId);
      db.prepare("DELETE FROM leads WHERE id = ?").run(shellId);
      const sets = Object.keys(next).map((k) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE leads SET ${sets}, updated_at = ? WHERE id = ?`).run(...Object.values(next), Date.now(), leadId);
      db.prepare("INSERT INTO flair_os_links (lead_id, decision, flair_os_id, decided_at) VALUES (?, 'linked', ?, ?) ON CONFLICT(lead_id) DO UPDATE SET decision = 'linked', flair_os_id = excluded.flair_os_id, decided_at = excluded.decided_at")
        .run(leadId, dealId, Date.now());
    })();
    return { ok: true, folded: shellId, changes };
  },

  /** Remember that a Command Center-only lead is deliberately not a FLAIR OS deal. */
  keepSeparate(leadId: number): boolean {
    const db = rawDb();
    const lead = db.prepare("SELECT id, flair_os_id FROM leads WHERE id = ? AND business_id = ?").get(leadId, FLAIR_OS_BUSINESS_ID) as { id: number; flair_os_id: string | null } | undefined;
    if (!lead || lead.flair_os_id) return false;
    db.prepare("INSERT INTO flair_os_links (lead_id, decision, flair_os_id, decided_at) VALUES (?, 'separate', NULL, ?) ON CONFLICT(lead_id) DO UPDATE SET decision = 'separate', flair_os_id = NULL, decided_at = excluded.decided_at")
      .run(leadId, Date.now());
    return true;
  },

  /** Forget a keep-separate decision so the suggestion shows again. */
  resetDecision(leadId: number): boolean {
    const res = rawDb().prepare("DELETE FROM flair_os_links WHERE lead_id = ? AND decision = 'separate'").run(leadId);
    return res.changes > 0;
  },

  driftReport(): DriftReport {
    const db = rawDb();
    const one = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
    const missing = db
      .prepare("SELECT id, name, company, flair_os_id, flair_os_missing_at AS missing_at FROM leads WHERE flair_os_missing_at IS NOT NULL ORDER BY flair_os_missing_at DESC LIMIT 50")
      .all() as DriftReport["missing"];
    const localOnly = db
      .prepare("SELECT id, name, company, stage FROM leads WHERE business_id = ? AND flair_os_id IS NULL ORDER BY updated_at DESC LIMIT 50")
      .all(FLAIR_OS_BUSINESS_ID) as DriftReport["local_only"];
    const knownStages = this.getSyncState().known_stages;
    const unknownStage = knownStages.length
      ? (db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE flair_os_id IS NOT NULL AND flair_os_stage IS NOT NULL AND lower(flair_os_stage) NOT IN (${knownStages.map(() => "?").join(",")})`).get(...knownStages.map((s) => s.toLowerCase())) as { n: number }).n
      : 0;
    return {
      leads_mirrored: one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id IS NOT NULL"),
      leads_missing: missing.length,
      leads_unknown_stage: unknownStage,
      leads_local_only: localOnly.length,
      todos_mirrored: one("SELECT COUNT(*) AS n FROM todos WHERE flair_os_id IS NOT NULL"),
      clients_mirrored: one("SELECT COUNT(*) AS n FROM brand_contacts WHERE flair_os_client_id IS NOT NULL"),
      conflicts_open: one("SELECT COUNT(*) AS n FROM flair_os_conflicts WHERE resolved_at IS NULL"),
      missing,
      local_only: localOnly,
    };
  },
};
