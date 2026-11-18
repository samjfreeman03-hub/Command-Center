"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Paperclip, Inbox, ChevronRight } from "lucide-react";
import type { Lead } from "@/lib/types";
import { useShareHeaders } from "@/lib/share-context";
import { cn } from "@/lib/cn";
import { flairOsStageLabel, FLAIR_OS_STAGE_LABELS } from "@/lib/flair-os/stage-map";
import { duplicateGroups } from "@/lib/flair-os/match";
import type { Reconciliation, ReconciliationItem } from "@/lib/flair-os/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { toast } from "@/components/ui/host";
import { ago, type FlairOsStatus } from "@/components/flair-os-panel";
import { MergeSheet, AddSheet, type MergeDone } from "@/components/flair-os-merge";
import type { FlairOsStageMeta } from "@/components/pipeline-panel";

/**
 * The FLAIR page over FLAIR OS, v4 (docs/integrations/FLAIR_OS_TWO_WAY_PLAN.md
 * section 2). Shaped on the real data: 71 open deals, 56 of them cold
 * outreach, almost no deal values or next steps, owners on about half.
 *
 *   One line        what in FLAIR OS is Sam's or overdue
 *   Views           Needs my decision / Open deals / Outreach / Won / Lost and paused
 *   Table           36px rows grouped by FLAIR OS stage in FLAIR OS order; blank
 *                   cells stay blank; last contact colored by age; a Next column
 *                   that shows the check-in or what the deal is waiting on
 *
 * Decisions on Sam's own leads go through the merge sheets, which write into
 * FLAIR OS first (when FLAIR_OS_WRITE_ENABLED is on) and then link.
 */

const OTHER = "__other__";
const OUTREACH = new Set(["outreach"]);
const DAY = 86_400_000;

type View = "decide" | "open" | "outreach" | "won" | "closed";
type Group = { key: string; label: string; color: string | null; quiet: boolean; won: boolean; outreach: boolean };
type Decision = "link" | "add" | "separate" | "reset";

function money(cents: number | null | undefined) {
  if (!cents) return null;
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function dollars(n: number | null | undefined) {
  if (!n) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

function shortDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initials(name: string | null | undefined) {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").concat(parts.length > 1 ? parts[parts.length - 1][0] : "").toUpperCase() || null;
}

function firstLine(text: string | null | undefined, max = 70) {
  if (!text) return null;
  const line = text.replace(/\*\*|__/g, "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const t = line.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** FLAIR OS order, then Lost, then the non-lifecycle holds (Paused). */
function orderGroups(stages: FlairOsStageMeta[], fallbackSlugs: string[]): Group[] {
  const metas = stages.length
    ? [...stages].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    : fallbackSlugs.map((slug, i) => ({ slug, label: flairOsStageLabel(slug) || slug, color: null, sort_order: i, is_won: false, is_lost: slug === "lost", is_lifecycle: slug !== "paused" }));
  const live = metas.filter((m) => m.is_lifecycle && !m.is_lost);
  const lost = metas.filter((m) => m.is_lost);
  const held = metas.filter((m) => !m.is_lifecycle && !m.is_lost);
  return [...live, ...lost, ...held].map((m) => ({ key: m.slug.toLowerCase(), label: m.label, color: m.color, quiet: m.is_lost || !m.is_lifecycle, won: m.is_won, outreach: OUTREACH.has(m.slug.toLowerCase()) }));
}

type Searchable = { company: string | null; name: string; contact_name?: string | null; contact_email?: string | null; flair_os_opportunity?: string | null; flair_os_owner?: string | null; next_action?: string | null };

export function FlairOsBoard({
  leads,
  stages,
  canManage,
  status,
  onReload,
  onOpen,
  onNew,
  onLinked,
  attachmentCounts,
}: {
  leads: Lead[];
  stages: FlairOsStageMeta[];
  /** Owner view: may merge, add and keep here. */
  canManage: boolean;
  status: FlairOsStatus | null;
  onReload: () => void;
  onOpen: (leadId: number) => void;
  onNew: () => void;
  /** A Command Center lead was merged with a deal: fold the deal's shell row into it locally. */
  onLinked: (leadId: number, dealId: string) => void;
  attachmentCounts: Record<number, number>;
}) {
  const shareHeaders = useShareHeaders();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ kind: "merge" | "add"; item: ReconciliationItem } | null>(null);
  const [keptOpen, setKeptOpen] = useState(false);
  const writeEnabled = !!status?.writeEnabled;

  const mirrored = useMemo(() => leads.filter((l) => !!l.flair_os_id), [leads]);
  const localOnly = useMemo(() => leads.filter((l) => !l.flair_os_id), [leads]);
  const mirrorEmpty = mirrored.length === 0;
  const dryRun = !!status?.dryRunDefault;
  const q = query.trim().toLowerCase();
  const matches = (l: Searchable) => !q || [l.company, l.name, l.contact_name, l.contact_email, l.flair_os_opportunity, l.flair_os_owner, l.next_action].some((v) => v?.toLowerCase().includes(q));

  const groups = useMemo(() => {
    const seen = [...new Set(mirrored.map((l) => l.flair_os_stage?.toLowerCase()).filter((s): s is string => !!s))];
    const gs = orderGroups(stages, seen);
    const known = new Set(gs.map((g) => g.key));
    if (seen.some((s) => !known.has(s))) gs.push({ key: OTHER, label: "Stage not in the list", color: null, quiet: true, won: false, outreach: false });
    return gs;
  }, [stages, mirrored]);

  const byGroup = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const g of groups) map[g.key] = [];
    for (const l of mirrored) {
      if (!matches(l)) continue;
      const key = l.flair_os_stage?.toLowerCase() ?? "";
      (map[key] ?? map[OTHER] ?? (map[OTHER] = [])).push(l);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (b.flair_os_last_contacted_at ?? 0) - (a.flair_os_last_contacted_at ?? 0) || b.updated_at - a.updated_at);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, mirrored, q]);

  const duplicates = useMemo(
    () => status?.reconciliation?.duplicates ?? duplicateGroups(mirrored.map((l) => ({ id: l.flair_os_id as string, company: l.company, contactName: l.contact_name ?? null, email: l.contact_email }))),
    [status?.reconciliation?.duplicates, mirrored]
  );

  const decisionItems: ReconciliationItem[] = useMemo(() => {
    const fromServer = status?.reconciliation?.items;
    const byId = new Map((fromServer ?? []).map((i) => [i.id, i]));
    return localOnly
      .filter(matches)
      .map((l) => byId.get(l.id) ?? { id: l.id, name: l.name, company: l.company, contact_name: l.contact_name ?? null, contact_email: l.contact_email, stage: l.stage, updated_at: l.updated_at, decision: null, verdict: "none" as const, reason: fromServer ? "Not in FLAIR OS" : "Checking", match: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOnly, status?.reconciliation?.items, q]);

  const rank: Record<string, number> = { same: 0, likely: 1, none: 2 };
  const pending = decisionItems.filter((i) => i.decision !== "separate").sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.updated_at - a.updated_at);
  const kept = decisionItems.filter((i) => i.decision === "separate");

  const openGroups = groups.filter((g) => !g.quiet && !g.won && !g.outreach);
  const outreachGroups = groups.filter((g) => g.outreach);
  const wonGroups = groups.filter((g) => g.won && !g.quiet);
  const quietGroups = groups.filter((g) => g.quiet);
  const count = (gs: Group[]) => gs.reduce((s, g) => s + (byGroup[g.key]?.length ?? 0), 0);
  const viewCounts: Record<View, number> = { decide: pending.length, open: count(openGroups), outreach: count(outreachGroups), won: count(wonGroups), closed: count(quietGroups) };

  // Default view: decisions while any wait, else open deals. Only until Sam picks one.
  const activeView: View = view ?? (pending.length > 0 && canManage && !mirrorEmpty ? "decide" : "open");
  useEffect(() => {
    if (view === "decide" && pending.length === 0 && kept.length === 0) setView("open");
  }, [view, pending.length, kept.length]);

  const counts = status?.state?.counts ?? null;
  const header = useMemo(() => {
    let active = 0, won = 0, lost = 0;
    for (const l of mirrored) {
      const g = groups.find((x) => x.key === (l.flair_os_stage?.toLowerCase() ?? ""));
      const st = l.flair_os_sales_status?.toLowerCase();
      if (g?.won || st === "won") won += 1;
      else if (st === "lost" || g?.key === "lost") lost += 1;
      else active += 1;
    }
    return { active: counts?.byStatus?.active ?? active, won: counts?.byStatus?.won ?? won, lost: counts?.byStatus?.lost ?? lost, open: dollars(counts?.openPipelineValue), booked: dollars(counts?.bookedPipelineValue) };
  }, [counts, groups, mirrored]);

  async function decide(item: ReconciliationItem, action: Decision) {
    if (action === "link") {
      if (!item.match) return;
      setSheet({ kind: "merge", item });
      return;
    }
    if (action === "add") {
      setSheet({ kind: "add", item });
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch("/api/flair-os/reconcile", { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ action, leadId: item.id }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `Could not save: ${json.error}` : "Could not save the decision", { tone: "error" });
        return;
      }
      toast(action === "separate" ? "Marked as not a FLAIR deal. It stays here and will not be suggested again." : "Back in the list.", { tone: "success" });
      onReload();
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  function sheetDone(r: MergeDone) {
    setSheet(null);
    onLinked(r.leadId, r.dealId);
    toast(r.message, { tone: "success" });
    onReload();
  }

  const views: { value: View; label: React.ReactNode }[] = [
    ...(canManage && !mirrorEmpty && (pending.length > 0 || kept.length > 0) ? [{ value: "decide" as View, label: <ViewLabel text="Needs my decision" n={viewCounts.decide} alert={viewCounts.decide > 0} /> }] : []),
    { value: "open", label: <ViewLabel text="Open deals" n={viewCounts.open} /> },
    { value: "outreach", label: <ViewLabel text="Outreach" n={viewCounts.outreach} /> },
    { value: "won", label: <ViewLabel text="Won" n={viewCounts.won} /> },
    { value: "closed", label: <ViewLabel text="Lost and paused" n={viewCounts.closed} /> },
  ];

  const renderTable = (gs: Group[], opts: { outreachSummary?: boolean; emptyText: string }) => {
    const rows = gs.filter((g) => (byGroup[g.key]?.length ?? 0) > 0);
    const outreachN = opts.outreachSummary ? count(outreachGroups) : 0;
    if (rows.length === 0 && outreachN === 0) return <p className="px-1 py-8 text-center text-[13px] text-ink-3">{q ? "No deals match." : opts.emptyText}</p>;
    return (
      <Card>
        <div role="table" aria-label="FLAIR OS deals" className="text-[13px]">
          <div role="row" className="hidden h-8 items-center gap-x-3 border-b border-line bg-sunken px-3 text-[11px] font-medium text-ink-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.7fr)_2.25rem_5.5rem_minmax(0,1.5fr)_minmax(0,1.8fr)]">
            <span role="columnheader">Company</span>
            <span role="columnheader">Contact</span>
            <span role="columnheader" title="Owner in FLAIR OS">Own</span>
            <span role="columnheader">Last contact</span>
            <span role="columnheader">Next</span>
            <span role="columnheader">Notes</span>
          </div>
          {rows.map((g) => {
            const all = byGroup[g.key] ?? [];
            const total = all.reduce((s, l) => s + (l.value_cents ?? 0), 0);
            return (
              <div key={g.key} role="rowgroup">
                <div role="row" className="flex h-8 items-center gap-2 border-b border-line bg-raised px-3">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10" style={{ backgroundColor: g.color ?? "var(--color-ink-4)" }} aria-hidden />
                  <span className="text-xs font-semibold text-ink">{g.label}</span>
                  <span className="text-xs tabular-nums text-ink-3">{all.length}</span>
                  {total > 0 && <span className={cn("text-xs tabular-nums", g.won ? "text-emerald-600 dark:text-emerald-400" : "text-ink-3")}>{money(total)}</span>}
                </div>
                {all.map((l) => (
                  <DealRow key={l.id} lead={l} group={g} twins={l.flair_os_id ? duplicates[l.flair_os_id] : undefined} attachmentCount={attachmentCounts[l.id] ?? l.attachment_count ?? 0} onOpen={() => onOpen(l.id)} />
                ))}
              </div>
            );
          })}
          {outreachN > 0 && (
            <button type="button" onClick={() => setView("outreach")} className="flex h-10 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-hover">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10" style={{ backgroundColor: outreachGroups[0]?.color ?? "var(--color-ink-4)" }} aria-hidden />
              <span className="text-xs font-semibold text-ink">Outreach</span>
              <span className="text-xs tabular-nums text-ink-3">{outreachN}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{outreachSummary(outreachGroups.flatMap((g) => byGroup[g.key] ?? []))}</span>
              <ChevronRight size={14} className="shrink-0 text-ink-3" />
            </button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <YourSideLine status={status} mirrorEmpty={mirrorEmpty} header={header} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" wrap={false} options={views} value={activeView} onChange={(v) => setView(v)} className="max-w-full" />
        <div className="flex items-center gap-2">
          {leads.length > 8 && (
            <div className="relative w-44 sm:w-56">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search deals" className="pl-8 md:h-8 md:text-[13px]" />
            </div>
          )}
          <Button variant="primary" size="sm" onClick={onNew}>
            <Plus size={14} /> {writeEnabled ? "New deal" : "New lead"}
          </Button>
        </div>
      </div>

      {mirrorEmpty ? (
        <Card>
          <EmptyState icon={<Inbox size={18} />} title="Nothing from FLAIR OS yet" body={dryRun ? "FLAIR OS is being read but not saved, so its deals cannot be shown. Once saving is on, every deal appears here by stage." : "Refresh to read the pipeline from FLAIR OS."} />
        </Card>
      ) : activeView === "decide" ? (
        <DecisionList pending={pending} kept={kept} keptOpen={keptOpen} onToggleKept={() => setKeptOpen((o) => !o)} busyId={busyId} writeEnabled={writeEnabled} onOpen={onOpen} onDecide={decide} />
      ) : activeView === "open" ? (
        renderTable(openGroups, { outreachSummary: true, emptyText: "No open deals beyond outreach." })
      ) : activeView === "outreach" ? (
        renderTable(outreachGroups, { emptyText: "Nothing in outreach." })
      ) : activeView === "won" ? (
        renderTable(wonGroups, { emptyText: "Nothing won yet." })
      ) : (
        renderTable(quietGroups, { emptyText: "Nothing lost or paused." })
      )}

      {!mirrorEmpty && activeView !== "decide" && pending.length > 0 && canManage && (
        <button type="button" onClick={() => setView("decide")} className="flex items-center gap-1.5 px-1 text-[13px] text-ink-2 hover:text-ink">
          {pending.length} of your leads {pending.length === 1 ? "needs" : "need"} a decision <ChevronRight size={13} />
        </button>
      )}
      {mirrorEmpty && localOnly.length > 0 && (
        <p className="px-1 text-xs text-ink-3">
          {localOnly.length} lead{localOnly.length === 1 ? "" : "s"} added here. Once FLAIR OS is saved here, each one is checked against it and you decide what happens.
        </p>
      )}

      {sheet?.kind === "merge" && sheet.item.match && <MergeSheet item={{ ...sheet.item, match: sheet.item.match }} writeEnabled={writeEnabled} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === "add" && <AddSheet item={sheet.item} writeEnabled={writeEnabled} onClose={() => setSheet(null)} onDone={sheetDone} />}
    </div>
  );
}

function ViewLabel({ text, n, alert }: { text: string; n: number; alert?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <span className={cn("tabular-nums", alert ? "font-semibold text-red-600 dark:text-red-400" : "text-ink-3")}>{n}</span>
    </span>
  );
}

function outreachSummary(rows: Lead[]) {
  const owners = new Map<string, number>();
  let none = 0;
  for (const l of rows) {
    if (l.flair_os_owner) owners.set(l.flair_os_owner, (owners.get(l.flair_os_owner) ?? 0) + 1);
    else none += 1;
  }
  const parts = [...owners.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${n}`);
  if (none) parts.push(`no owner ${none}`);
  const lastTouch = rows.reduce<number>((m, l) => Math.max(m, l.flair_os_last_contacted_at ?? 0), 0);
  return `${parts.join(", ")}${lastTouch ? `. Last contact ${ago(lastTouch)}` : ""}`;
}

// ── Your side, one line ──────────────────────────────────────────────────────

function YourSideLine({ status, mirrorEmpty, header }: { status: FlairOsStatus | null; mirrorEmpty: boolean; header: { active: number; won: number; lost: number; open: string | null; booked: string | null } }) {
  const y = status?.your_side ?? null;
  if (!status) return <p className="text-[13px] text-ink-4">Loading</p>;
  if (mirrorEmpty || !y) {
    return (
      <p className="text-[13px] text-ink-3">
        <span className="font-medium tabular-nums text-ink">{header.active}</span> active in FLAIR OS, <span className="tabular-nums">{header.won}</span> won, <span className="tabular-nums">{header.lost}</span> lost.
      </p>
    );
  }
  const alerts: string[] = [];
  if (y.checkins_overdue > 0) alerts.push(`${y.checkins_overdue} check-in${y.checkins_overdue === 1 ? "" : "s"} overdue`);
  if (y.tasks_overdue > 0) alerts.push(`${y.tasks_overdue} of your tasks past due`);
  const moved = y.stage_moves_week > 0 ? `${y.stage_moves_week} deal${y.stage_moves_week === 1 ? "" : "s"} moved this week` : "Nothing moved this week";
  return (
    <p className="text-[13px] text-ink-3">
      You own <span className="font-medium tabular-nums text-ink">{y.deals_owned}</span> of <span className="tabular-nums">{y.active_deals}</span> open deals
      {y.tasks_open > 0 ? <>, <span className="tabular-nums">{y.tasks_open}</span> open task{y.tasks_open === 1 ? "" : "s"}</> : null}.{" "}
      {alerts.length > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{alerts.join(", ")}.</span> : null} {moved}
      {y.contacted_week > 0 ? `, ${y.contacted_week} contacted` : ""}.
      {header.booked ? <> Booked <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{header.booked}</span>.</> : null}
    </p>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function DealRow({ lead, group, twins, attachmentCount, onOpen }: { lead: Lead; group: Group; twins?: string[]; attachmentCount: number; onOpen: () => void }) {
  const status = lead.flair_os_sales_status?.toLowerCase() ?? null;
  const today = todayKey();
  const overdue = !!lead.next_action_date && lead.next_action_date < today && status !== "won" && status !== "lost";
  const last = lead.flair_os_last_contacted_at ?? null;
  const ageDays = last ? (Date.now() - last) / DAY : null;
  const stale = !group.outreach && !group.won && !group.quiet && ageDays !== null;
  const lastTone = stale && ageDays! > 60 ? "text-red-600 dark:text-red-400" : stale && ageDays! > 30 ? "text-amber-600 dark:text-amber-400" : "text-ink-3";
  // The status chip shows only when it disagrees with the group it sits in.
  const statusOdd = status && status !== "active" && !(status === "won" && group.won) && !(status === "lost" && group.key === "lost");
  const own = initials(lead.flair_os_owner);
  const contact = lead.contact_name ?? (lead.name !== lead.company ? lead.name : null);
  const next = lead.next_action_date ? shortDate(lead.next_action_date) : null;
  const notes = firstLine(lead.flair_os_notes);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-hover md:grid md:min-h-9 md:grid-cols-[minmax(0,2fr)_minmax(0,1.7fr)_2.25rem_5.5rem_minmax(0,1.5fr)_minmax(0,1.8fr)] md:items-center md:gap-x-3 md:gap-y-0 md:py-1.5"
    >
      <span className="flex w-full min-w-0 items-center gap-1.5 md:w-auto">
        <span className="truncate font-medium text-ink">{lead.company || lead.name}</span>
        {lead.flair_os_opportunity && <span className="hidden truncate text-xs text-ink-3 lg:inline">{lead.flair_os_opportunity}</span>}
        {statusOdd && <Badge tone={status === "won" ? "green" : status === "lost" ? "red" : "amber"}>{status}</Badge>}
        {twins && twins.length > 0 && <Badge tone="amber">Dup?</Badge>}
        {lead.flair_os_missing_at && <Badge tone="amber">Gone</Badge>}
        {attachmentCount > 0 && <Paperclip size={12} className="shrink-0 text-ink-4" aria-label={`${attachmentCount} attachments kept here`} />}
      </span>
      <span className="flex w-full min-w-0 flex-wrap items-baseline gap-x-1.5 md:block md:w-auto">
        {contact && <span className="truncate text-ink-2 md:block">{contact}</span>}
        {lead.contact_email && <span className="truncate text-xs text-ink-4 md:block">{lead.contact_email}</span>}
      </span>
      <span className="hidden md:block">
        {own && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-sunken px-1 text-[10px] font-semibold text-ink-2 ring-1 ring-inset ring-line" title={lead.flair_os_owner ?? undefined}>
            {own}
          </span>
        )}
      </span>
      <span className={cn("tabular-nums text-xs md:text-[13px]", lastTone)}>{last ? ago(last) : ""}</span>
      <span className={cn("min-w-0 flex-1 truncate text-xs md:flex-none md:text-[13px]", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-ink-2")}>
        {next && lead.next_action ? `${next}: ${lead.next_action}` : next ?? lead.next_action ?? ""}
      </span>
      <span className="hidden min-w-0 truncate text-ink-3 md:block">{notes ?? ""}</span>
    </button>
  );
}

// ── Needs my decision ────────────────────────────────────────────────────────

function DecisionList({
  pending,
  kept,
  keptOpen,
  onToggleKept,
  busyId,
  writeEnabled,
  onOpen,
  onDecide,
}: {
  pending: ReconciliationItem[];
  kept: ReconciliationItem[];
  keptOpen: boolean;
  onToggleKept: () => void;
  busyId: number | null;
  writeEnabled: boolean;
  onOpen: (id: number) => void;
  onDecide: (item: ReconciliationItem, action: Decision) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-ink-3">
        Leads you added here that FLAIR OS does not have yet. {writeEnabled ? "Merging or adding writes your details into FLAIR OS, then this row shows the FLAIR OS deal." : "Saving to FLAIR OS is off, so merging only links the two records for now."}
      </p>
      {pending.length > 0 ? (
        <Card>
          <div className="divide-y divide-line">
            {pending.map((item) => (
              <DecisionRow key={item.id} item={item} busy={busyId === item.id} onOpen={() => onOpen(item.id)} onDecide={(a) => onDecide(item, a)} />
            ))}
          </div>
        </Card>
      ) : (
        <p className="px-1 text-[13px] text-ink-3">Nothing waiting. Every lead you added is in FLAIR OS or marked as not a FLAIR deal.</p>
      )}
      {kept.length > 0 && (
        <div>
          <button type="button" onClick={onToggleKept} className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-ink-2 hover:text-ink" aria-expanded={keptOpen}>
            <ChevronRight size={14} className={cn("transition-transform", keptOpen && "rotate-90")} />
            Not FLAIR deals <span className="text-xs font-normal tabular-nums text-ink-3">{kept.length}</span>
          </button>
          {keptOpen && (
            <Card className="mt-3">
              <div className="divide-y divide-line">
                {kept.map((item) => (
                  <DecisionRow key={item.id} item={item} busy={busyId === item.id} onOpen={() => onOpen(item.id)} onDecide={(a) => onDecide(item, a)} />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function DecisionRow({ item, busy, onOpen, onDecide }: { item: ReconciliationItem; busy: boolean; onOpen: () => void; onDecide: (action: Decision) => void }) {
  const separate = item.decision === "separate";
  const verdict = separate ? "separate" : item.verdict;
  const matchName = item.match?.company || item.match?.contact_name || "a FLAIR OS deal";
  const matchStage = item.match?.stage ? FLAIR_OS_STAGE_LABELS[item.match.stage.toLowerCase()] ?? item.match.stage : null;
  const title = item.company || item.name;
  const sub = item.company && item.name !== item.company ? item.name : item.contact_name;
  let line: string;
  if (verdict === "separate") line = "Not a FLAIR deal. Stays here; FLAIR OS is not told.";
  else if (item.match) line = `Looks like ${matchName} in FLAIR OS${matchStage ? `, ${matchStage}` : ""}. ${item.reason}.`;
  else line = item.reason === "Checking" ? "Checking against FLAIR OS" : "No deal in FLAIR OS looks like this one.";
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ink/10">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium text-ink">{title}</span>
          {sub && <span className="truncate text-xs text-ink-3">{sub}</span>}
          {verdict === "same" && <Badge tone="green">Already in FLAIR OS</Badge>}
          {verdict === "likely" && <Badge tone="amber">Probably in FLAIR OS</Badge>}
          {verdict === "none" && <Badge tone="neutral">Not in FLAIR OS</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">{line}</div>
      </button>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {!separate && item.match && (
          <Button size="sm" onClick={() => onDecide("link")} disabled={busy}>
            Merge into FLAIR OS
          </Button>
        )}
        {!separate && (
          <Button size="sm" variant={item.match ? "ghost" : "secondary"} onClick={() => onDecide("add")} disabled={busy}>
            {item.match ? "Different deal, add" : "Add to FLAIR OS"}
          </Button>
        )}
        {!separate && (
          <Button size="sm" variant="ghost" onClick={() => onDecide("separate")} loading={busy} disabled={busy}>
            Not a FLAIR deal
          </Button>
        )}
        {separate && (
          <Button size="sm" variant="ghost" onClick={() => onDecide("reset")} loading={busy} disabled={busy}>
            Undo
          </Button>
        )}
      </div>
    </div>
  );
}

export type { Reconciliation };
