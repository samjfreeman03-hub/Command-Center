import { flairOsClientFromEnv, FlairOsError } from "./client";
import { flairOsDryRunDefault } from "./config";
import { flairOsStore, type CycleSummary, type PipelineCounts } from "./store";
import { rollupStage, type StageFlags } from "./stage-map";
import { arrayFrom, mergeDeal, normalizeActivity, normalizeClient, normalizeDeal, normalizeStage, normalizeTask, type FlairOsDeal, type FlairOsStage } from "./types";

/**
 * One pull cycle, FLAIR OS to Command Center (field contract, section 3).
 *
 * What the real server allows (checked 2026-11-15): `search_pipeline` takes
 * query, stage, owner and limit (max 100), has no offset, and never returns
 * lost deals; `list_pipeline_tasks` takes status and limit (max 100);
 * `list_clients` takes limit (max 200); `get_pipeline_deal` returns the
 * joined stage and assignee profile but no activities.
 *
 * Order: stages, deals (one list call, fanned out per stage only when the
 * cap is hit), lead upserts, detail enrichment for changed or never-detailed
 * deals (capped), missing check through `get_pipeline_deal` so a deal that
 * merely moved to lost is shown as lost instead of missing, then tasks and
 * clients. Every created or changed record is logged with field-level old
 * and new values. Dry run computes everything and writes only the log.
 */

const LIST_CAP = 100;
const CLIENT_CAP = 200;
const DETAIL_CAP = 20;
const MISSING_CHECK_CAP = 20;

let inFlight = false;

export function mirrorInFlight(): boolean {
  return inFlight;
}

function isNotFound(e: unknown): boolean {
  return e instanceof FlairOsError && e.code === "tool_error" && /not found|no pipeline deal|unknown deal|does not exist/i.test(e.message);
}

export async function runMirrorCycle(opts: { trigger: "manual" | "schedule" | "test"; dryRun?: boolean }): Promise<CycleSummary> {
  const started = Date.now();
  const dryRun = opts.dryRun ?? flairOsDryRunDefault();
  const summary: CycleSummary = {
    ok: false,
    trigger: opts.trigger,
    dry_run: dryRun,
    started_at: started,
    finished_at: started,
    duration_ms: 0,
    calls: 0,
    deals: { seen: 0, created: 0, updated: 0, unchanged: 0, missing: 0, unknown_stage: 0 },
    tasks: { seen: 0, created: 0, updated: 0, unchanged: 0 },
    clients: { seen: 0, created: 0, updated: 0, unchanged: 0 },
    activities: { fetched: 0, deals_checked: 0 },
    stages: [],
    unknown_stages: [],
    warnings: [],
    error: null,
  };
  const finish = (error: string | null) => {
    summary.finished_at = Date.now();
    summary.duration_ms = summary.finished_at - started;
    summary.ok = !error;
    summary.error = error;
    flairOsStore.patchSyncState({
      last_run_at: started,
      ...(error ? { last_error: error } : { last_ok_at: summary.finished_at, last_error: null }),
      last_summary: summary,
    });
    flairOsStore.appendLog({
      direction: "pull",
      trigger: opts.trigger,
      record_kind: "cycle",
      action: dryRun ? "dry_run" : "pull",
      result: error ? "error" : "ok",
      message: error ?? `${summary.deals.seen} deals, ${summary.tasks.seen} tasks, ${summary.clients.seen} clients in ${summary.duration_ms} ms`,
    });
    return summary;
  };

  if (inFlight) return finish("A pull is already running");
  const client = flairOsClientFromEnv();
  if (!client) return finish("FLAIR OS is not configured");
  const state = flairOsStore.getSyncState();
  if (state.pull_paused && opts.trigger !== "manual") return finish("Pull is paused");

  inFlight = true;
  const callsBefore = client.calls.length;
  const log = (entry: Parameters<typeof flairOsStore.appendLog>[0]) => flairOsStore.appendLog({ ...entry, result: dryRun ? "dry_run" : entry.result });
  try {
    // 1. Stages, with their won/lost/lifecycle flags.
    const stagesRaw = await client.call<unknown>("list_pipeline_stages");
    const stages = arrayFrom(stagesRaw, ["stages"]).map(normalizeStage).filter((s): s is FlairOsStage => !!s);
    summary.stages = stages.map((s) => s.slug);
    if (summary.stages.length) {
      flairOsStore.patchSyncState({ known_stages: summary.stages });
      // Labels, colors and order drive the FLAIR OS board layout.
      flairOsStore.upsertStages(stages, { dryRun });
    }
    const flagsBySlug = new Map<string, StageFlags>(stages.map((s) => [s.slug.toLowerCase(), { isWon: s.isWon, isLost: s.isLost, isLifecycle: s.isLifecycle }]));

    // 2. Deals. One list call; if it hits the cap, fan out per stage.
    const dealsById = new Map<string, FlairOsDeal>();
    const first = arrayFrom(await client.call<unknown>("search_pipeline", { limit: LIST_CAP }), ["deals"]).map(normalizeDeal).filter((d): d is FlairOsDeal => !!d);
    for (const d of first) dealsById.set(d.id, d);
    if (first.length >= LIST_CAP) {
      summary.warnings.push(`search_pipeline returned ${LIST_CAP} deals (its cap); pulled per stage instead`);
      for (const s of stages) {
        const batch = arrayFrom(await client.call<unknown>("search_pipeline", { stage: s.slug, limit: LIST_CAP }), ["deals"]).map(normalizeDeal).filter((d): d is FlairOsDeal => !!d);
        if (batch.length >= LIST_CAP) summary.warnings.push(`stage ${s.slug} has ${LIST_CAP}+ deals; some may be unseen until FLAIR OS adds paging`);
        for (const d of batch) dealsById.set(d.id, d);
      }
    }
    const deals = [...dealsById.values()];
    summary.deals.seen = deals.length;

    const seenIds = new Set<string>();
    const changed = new Map<string, { deal: FlairOsDeal; leadId: number | null }>();
    const leadIdByDeal = new Map<string, number | null>();
    const upsertDeal = (deal: FlairOsDeal, quiet: { alreadyLogged?: boolean } = {}) => {
      flairOsStore.rememberProfile(deal.ownerId, deal.ownerName);
      const key = deal.stage?.toLowerCase() ?? "";
      const flags = flagsBySlug.get(key);
      const slugKnown = !deal.stage || flagsBySlug.size === 0 || flagsBySlug.has(key);
      const rollup = rollupStage(deal.stage, deal.salesStatus, deal.lastContactedMs !== null, flags);
      if (!rollup.known || !slugKnown) {
        summary.deals.unknown_stage += 1;
        if (deal.stage && !summary.unknown_stages.includes(deal.stage)) summary.unknown_stages.push(deal.stage);
      }
      const r = flairOsStore.upsertMirroredLead(deal, rollup, { dryRun });
      leadIdByDeal.set(deal.id, r.localId);
      // In a dry run nothing is inserted, so a second pass over the same deal
      // would log "created" twice; log only what the first pass did not.
      if (r.action !== "unchanged" && !(quiet.alreadyLogged && r.action === "created")) {
        log({ direction: "pull", trigger: opts.trigger, record_kind: "deal", flair_os_id: deal.id, local_id: r.localId, action: r.action, changes: r.changes, result: "ok", message: deal.company ?? deal.contactName ?? null });
      }
      return r;
    };
    for (const deal of deals) {
      seenIds.add(deal.id);
      const r = upsertDeal(deal);
      summary.deals[r.action] += 1;
      if (r.action !== "unchanged") changed.set(deal.id, { deal, leadId: r.localId });
    }

    // 3. Detail enrichment: the list omits updated_at, client, website and the
    //    assignee profile. Fetch details for deals that changed this cycle and
    //    for mirrored deals never detailed, a few per cycle.
    const detailQueue: { deal: FlairOsDeal; leadId: number | null }[] = [...changed.values()];
    if (detailQueue.length < DETAIL_CAP) {
      for (const row of flairOsStore.leadsNeedingDetail(DETAIL_CAP - detailQueue.length)) {
        const deal = dealsById.get(row.flair_os_id);
        if (deal && !changed.has(deal.id)) detailQueue.push({ deal, leadId: row.id });
      }
    }
    for (const { deal, leadId } of detailQueue.slice(0, DETAIL_CAP)) {
      try {
        const detailRaw = await client.call<unknown>("get_pipeline_deal", { dealId: deal.id });
        summary.activities.deals_checked += 1;
        const detailDeal = normalizeDeal((detailRaw as { deal?: unknown })?.deal ?? detailRaw);
        if (detailDeal) {
          const merged = mergeDeal(deal, detailDeal);
          dealsById.set(deal.id, merged);
          const r = upsertDeal(merged, { alreadyLogged: changed.has(deal.id) });
          if (r.action === "updated" && !changed.has(deal.id)) summary.deals.updated += 1;
        }
        const acts = arrayFrom(detailRaw, ["activities", "timeline"]).map((a) => normalizeActivity(a, deal.id)).filter((a): a is NonNullable<typeof a> => !!a);
        if (acts.length) {
          summary.activities.fetched += flairOsStore.upsertActivities(deal.id, leadId ?? leadIdByDeal.get(deal.id) ?? null, acts, { dryRun });
          if (!dryRun && deal.stage?.toLowerCase() === "outreach" && deal.lastContactedMs === null) {
            upsertDeal({ ...(dealsById.get(deal.id) ?? deal), lastContactedMs: acts[0].occurredMs ?? Date.now() });
          }
        }
      } catch (e) {
        log({ direction: "pull", trigger: opts.trigger, record_kind: "deal", flair_os_id: deal.id, local_id: leadId, action: "detail", result: "error", message: (e as Error).message });
      }
    }

    // 4. Deals mirrored before that did not come back. The list hides lost
    //    deals, so ask for each by id: found means it still exists (show its
    //    real stage); "not found" means flag it, never delete it.
    const candidates = flairOsStore.missingCandidates(seenIds);
    if (candidates.length > MISSING_CHECK_CAP) summary.warnings.push(`${candidates.length} mirrored deals not in the list; checking ${MISSING_CHECK_CAP} per cycle`);
    for (const m of candidates.slice(0, MISSING_CHECK_CAP)) {
      try {
        const detailRaw = await client.call<unknown>("get_pipeline_deal", { dealId: m.flair_os_id });
        const detailDeal = normalizeDeal((detailRaw as { deal?: unknown })?.deal ?? detailRaw);
        if (detailDeal) {
          seenIds.add(detailDeal.id);
          const r = upsertDeal(detailDeal);
          if (r.action === "updated") summary.deals.updated += 1;
        }
      } catch (e) {
        if (!isNotFound(e)) {
          log({ direction: "pull", trigger: opts.trigger, record_kind: "deal", flair_os_id: m.flair_os_id, local_id: m.id, action: "missing_check", result: "error", message: (e as Error).message });
          continue;
        }
        flairOsStore.markMissing([m.id], { dryRun });
        summary.deals.missing += 1;
        log({ direction: "pull", trigger: opts.trigger, record_kind: "deal", flair_os_id: m.flair_os_id, local_id: m.id, action: "missing", result: "ok", message: "No longer returned by FLAIR OS" });
      }
    }

    // 5. Tasks (open and done, so completions mirror too). No offset exists.
    const tasksRaw = await client.call<unknown>("list_pipeline_tasks", { status: "all", limit: LIST_CAP });
    const tasks = arrayFrom(tasksRaw, ["tasks"]).map(normalizeTask).filter((t): t is NonNullable<typeof t> => !!t);
    if (tasks.length >= LIST_CAP) summary.warnings.push(`list_pipeline_tasks returned ${LIST_CAP} tasks (its cap); older tasks may be unseen`);
    for (const task of tasks) {
      summary.tasks.seen += 1;
      flairOsStore.rememberProfile(task.assigneeId, task.assigneeName);
      const leadId = task.dealId ? (leadIdByDeal.get(task.dealId) ?? flairOsStore.leadIdForDeal(task.dealId)) : null;
      const r = flairOsStore.upsertMirroredTodo(task, leadId ?? null, { dryRun });
      summary.tasks[r.action] += 1;
      if (r.action !== "unchanged") {
        log({ direction: "pull", trigger: opts.trigger, record_kind: "task", flair_os_id: task.id, local_id: r.localId, action: r.action, changes: r.changes, result: "ok", message: task.title });
      }
    }

    // 6. FLAIR OS's own numbers for the board header (deals by status, open
    //    and booked value). Kept as given; a failure here is a warning only.
    try {
      const countsRaw = (await client.call<unknown>("get_pipeline_counts")) as Record<string, unknown> | null;
      if (countsRaw && typeof countsRaw === "object") {
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v != null && Number.isFinite(Number(v)) ? Number(v) : null);
        const rec = (v: unknown): Record<string, number> => {
          if (!v || typeof v !== "object") return {};
          return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, num(n) ?? 0]));
        };
        const counts: PipelineCounts = {
          total: num(countsRaw.total),
          byStage: rec(countsRaw.byStage ?? countsRaw.by_stage),
          byStatus: rec(countsRaw.byStatus ?? countsRaw.by_status),
          openPipelineValue: num(countsRaw.openPipelineValue ?? countsRaw.open_pipeline_value),
          bookedPipelineValue: num(countsRaw.bookedPipelineValue ?? countsRaw.booked_pipeline_value),
          fetched_at: Date.now(),
        };
        if (!dryRun) flairOsStore.patchSyncState({ counts });
      }
    } catch (e) {
      summary.warnings.push(`get_pipeline_counts failed: ${(e as Error).message}`);
    }

    // 7. Clients
    const clientsRaw = await client.call<unknown>("list_clients", { limit: CLIENT_CAP });
    const clients = arrayFrom(clientsRaw, ["clients"]).map(normalizeClient).filter((c): c is NonNullable<typeof c> => !!c);
    if (clients.length >= CLIENT_CAP) summary.warnings.push(`list_clients returned ${CLIENT_CAP} clients (its cap)`);
    for (const c of clients) {
      summary.clients.seen += 1;
      const r = flairOsStore.upsertClient(c, { dryRun });
      summary.clients[r.action] += 1;
      if (r.action !== "unchanged") {
        log({ direction: "pull", trigger: opts.trigger, record_kind: "client", flair_os_id: c.id, local_id: r.localId, action: r.action, changes: r.changes, result: "ok", message: c.name });
      }
    }

    summary.calls = client.calls.length - callsBefore;
    return finish(null);
  } catch (e) {
    summary.calls = client.calls.length - callsBefore;
    const msg = e instanceof FlairOsError ? e.message : (e as Error).message;
    return finish(msg);
  } finally {
    inFlight = false;
  }
}
