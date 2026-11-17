"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Paperclip, CalendarDays, ChevronDown, ChevronUp, Inbox, Users } from "lucide-react";
import type { Lead } from "@/lib/types";
import { useShareHeaders } from "@/lib/share-context";
import { cn } from "@/lib/cn";
import { flairOsStageLabel, FLAIR_OS_STAGE_LABELS } from "@/lib/flair-os/stage-map";
import { duplicateGroups } from "@/lib/flair-os/match";
import type { Reconciliation, ReconciliationItem } from "@/lib/flair-os/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui/display";
import { confirmDialog, toast } from "@/components/ui/host";
import { ago, type FlairOsStatus } from "@/components/flair-os-panel";
import type { FlairOsStageMeta } from "@/components/pipeline-panel";

/**
 * The FLAIR page when the FLAIR OS mirror is on (phase A of the alignment
 * plan, docs/integrations/FLAIR_OS_ALIGNMENT_PLAN.md section 4). Three blocks
 * under the connection line:
 *
 *   Your side          what in FLAIR OS is Sam's or needs eyes
 *   Pipeline           FLAIR OS deals as a list grouped by FLAIR OS stage,
 *                      Outreach collapsed, Lost and Paused folded away
 *   Needs a decision   Sam's own FLAIR leads with a plain verdict and one click
 *
 * Read-only toward FLAIR OS. The only writes are the decisions (merge, keep
 * here), which touch Command Center rows only.
 */

const OTHER = "__other__";
const COLLAPSED_SLUGS = new Set(["outreach"]);
const COLLAPSED_MIN = 9;

type Group = { key: string; label: string; color: string | null; quiet: boolean; won: boolean };

function money(cents: number | null | undefined) {
  if (!cents) return "";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** FLAIR OS reports values in dollars; zero means no deal values are filled in, so it is not shown. */
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

/** FLAIR OS order, then Lost, then the non-lifecycle holds (Paused). */
function orderGroups(stages: FlairOsStageMeta[], fallbackSlugs: string[]): Group[] {
  const metas = stages.length
    ? [...stages].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    : fallbackSlugs.map((slug, i) => ({ slug, label: flairOsStageLabel(slug) || slug, color: null, sort_order: i, is_won: false, is_lost: slug === "lost", is_lifecycle: slug !== "paused" }));
  const live = metas.filter((m) => m.is_lifecycle && !m.is_lost);
  const lost = metas.filter((m) => m.is_lost);
  const held = metas.filter((m) => !m.is_lifecycle && !m.is_lost);
  return [...live, ...lost, ...held].map((m) => ({ key: m.slug.toLowerCase(), label: m.label, color: m.color, quiet: m.is_lost || !m.is_lifecycle, won: m.is_won }));
}

type Searchable = { company: string | null; name: string; contact_name?: string | null; flair_os_opportunity?: string | null; flair_os_owner?: string | null; next_action?: string | null };

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
  /** Owner view: may merge and keep here. */
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [closedOpen, setClosedOpen] = useState(false);
  const [keptOpen, setKeptOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const mirrored = useMemo(() => leads.filter((l) => !!l.flair_os_id), [leads]);
  const localOnly = useMemo(() => leads.filter((l) => !l.flair_os_id), [leads]);
  const mirrorEmpty = mirrored.length === 0;
  const dryRun = !!status?.dryRunDefault;
  const q = query.trim().toLowerCase();
  const matches = (l: Searchable) => !q || [l.company, l.name, l.contact_name, l.flair_os_opportunity, l.flair_os_owner, l.next_action].some((v) => v?.toLowerCase().includes(q));

  const groups = useMemo(() => {
    const seen = [...new Set(mirrored.map((l) => l.flair_os_stage?.toLowerCase()).filter((s): s is string => !!s))];
    const gs = orderGroups(stages, seen);
    const known = new Set(gs.map((g) => g.key));
    if (seen.some((s) => !known.has(s))) gs.push({ key: OTHER, label: "Stage not in the list", color: null, quiet: true, won: false });
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
    // Most recently contacted first; never-contacted deals keep update order.
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
    // Leads the panel knows about but the status call has not seen yet (just created) still show.
    return localOnly
      .filter(matches)
      .map((l) => byId.get(l.id) ?? { id: l.id, name: l.name, company: l.company, contact_name: l.contact_name ?? null, contact_email: l.contact_email, stage: l.stage, updated_at: l.updated_at, decision: null, verdict: "none" as const, reason: fromServer ? "Not in FLAIR OS" : "Checking", match: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOnly, status?.reconciliation?.items, q]);

  const rank: Record<string, number> = { same: 0, likely: 1, none: 2 };
  const pending = decisionItems.filter((i) => i.decision !== "separate").sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.updated_at - a.updated_at);
  const kept = decisionItems.filter((i) => i.decision === "separate");

  const counts = status?.state?.counts ?? null;
  const headerCounts = useMemo(() => {
    const byKey = new Map(groups.map((g) => [g.key, g]));
    let active = 0, won = 0, lost = 0;
    for (const l of mirrored) {
      const g = byKey.get(l.flair_os_stage?.toLowerCase() ?? "");
      const st = l.flair_os_sales_status?.toLowerCase();
      if (g?.won || st === "won") won += 1;
      else if (st === "lost" || g?.key === "lost") lost += 1;
      else active += 1;
    }
    return {
      active: counts?.byStatus?.active ?? active,
      won: counts?.byStatus?.won ?? won,
      lost: counts?.byStatus?.lost ?? lost,
      open: dollars(counts?.openPipelineValue),
      booked: dollars(counts?.bookedPipelineValue),
    };
  }, [counts, groups, mirrored]);

  async function decide(item: ReconciliationItem, action: "link" | "separate" | "reset") {
    if (action === "link") {
      if (!item.match) return;
      const ok = await confirmDialog({
        title: `Merge with the FLAIR OS deal for ${item.match.company || "this company"}?`,
        description: `${item.company || item.name} becomes that deal here. Your notes and attachments stay with it. Nothing changes in FLAIR OS.`,
        confirmLabel: "Merge",
      });
      if (!ok) return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch("/api/flair-os/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ action, leadId: item.id, dealId: item.match?.flair_os_id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `Could not save: ${json.error}` : "Could not save the decision", { tone: "error" });
        return;
      }
      if (action === "link" && item.match) {
        onLinked(item.id, item.match.flair_os_id);
        toast(`Merged. ${item.company || item.name} now shows the FLAIR OS deal.`, { tone: "success" });
      } else if (action === "separate") {
        toast("Kept here. It will not be suggested again.", { tone: "success" });
      } else {
        toast("Back in the list.", { tone: "success" });
      }
      onReload();
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const liveGroups = groups.filter((g) => !g.quiet);
  const quietGroups = groups.filter((g) => g.quiet);
  const emptyLive = liveGroups.filter((g) => (byGroup[g.key]?.length ?? 0) === 0);
  const quietCount = quietGroups.reduce((s, g) => s + (byGroup[g.key]?.length ?? 0), 0);
  const nothingMatches = q && liveGroups.every((g) => (byGroup[g.key]?.length ?? 0) === 0) && quietCount === 0;

  const renderRow = (l: Lead) => (
    <DealRow key={l.id} lead={l} twins={l.flair_os_id ? duplicates[l.flair_os_id] : undefined} attachmentCount={attachmentCounts[l.id] ?? l.attachment_count ?? 0} onOpen={() => onOpen(l.id)} />
  );

  const renderGroup = (g: Group) => {
    const all = byGroup[g.key] ?? [];
    if (all.length === 0) return null;
    const collapsible = COLLAPSED_SLUGS.has(g.key) && all.length >= COLLAPSED_MIN && !q;
    const collapsed = collapsible && !expanded[g.key];
    const owners = new Map<string, number>();
    for (const l of all) owners.set(l.flair_os_owner || "Unassigned", (owners.get(l.flair_os_owner || "Unassigned") ?? 0) + 1);
    const total = all.reduce((s, l) => s + (l.value_cents ?? 0), 0);
    const lastTouch = all.reduce<number>((m, l) => Math.max(m, l.flair_os_last_contacted_at ?? 0), 0);
    return (
      <section key={g.key} aria-label={`${g.label} stage`} className={cn(g.quiet && "opacity-80")}>
        <div className="mb-2 flex items-baseline gap-2 px-1">
          <span className="relative top-px inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10" style={{ backgroundColor: g.color ?? "var(--color-ink-4)" }} aria-hidden />
          <h2 className="text-[13px] font-semibold text-ink">{g.label}</h2>
          <span className="text-xs tabular-nums text-ink-3">{all.length}</span>
          {total > 0 && <span className={cn("text-xs tabular-nums", g.won ? "text-emerald-600 dark:text-emerald-400" : "text-ink-3")}>{money(total)}</span>}
        </div>
        <Card>
          {collapsed ? (
            <button type="button" onClick={() => setExpanded((e) => ({ ...e, [g.key]: true }))} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover">
              <Users size={15} className="shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{all.length} brands in cold outreach</div>
                <div className="mt-0.5 text-xs text-ink-3">
                  {[...owners.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${n}`).join(", ")}
                  {lastTouch ? `. Last contact ${ago(lastTouch)}.` : ""}
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-2">
                Show all <ChevronDown size={13} />
              </span>
            </button>
          ) : (
            <div className="divide-y divide-line">
              {all.map(renderRow)}
              {collapsible && (
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [g.key]: false }))} className="flex w-full items-center justify-center gap-1 px-4 py-2 text-xs font-medium text-ink-2 transition-colors hover:bg-hover">
                  Show fewer <ChevronUp size={13} />
                </button>
              )}
            </div>
          )}
        </Card>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      {/* Your side */}
      <section aria-label="Your side">
        <SectionHeader title="Your side" hint={status?.your_side ? `in FLAIR OS, as ${status.your_side.self_name}` : undefined} />
        <YourSideCards status={status} mirrorEmpty={mirrorEmpty} />
      </section>

      {/* Pipeline */}
      <section aria-label="FLAIR OS pipeline">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 md:min-h-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
              <span>
                <span className="font-medium tabular-nums text-ink">{headerCounts.active}</span> active in FLAIR OS
              </span>
              <span>
                <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{headerCounts.won}</span> won
              </span>
              <span>
                <span className="font-medium tabular-nums text-ink">{headerCounts.lost}</span> lost
              </span>
              {headerCounts.open && (
                <span>
                  <span className="font-medium tabular-nums text-ink">{headerCounts.open}</span> open
                </span>
              )}
              {headerCounts.booked && (
                <span>
                  <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{headerCounts.booked}</span> booked
                </span>
              )}
            </div>
            {leads.length > 8 && (
              <div className="relative w-full sm:w-60">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deals" aria-label="Search deals" className="pl-8 md:h-8 md:text-[13px]" />
              </div>
            )}
          </div>
          <Button variant="primary" onClick={onNew}>
            <Plus size={14} /> New lead
          </Button>
        </div>

        {mirrorEmpty ? (
          <Card>
            <EmptyState
              icon={<Inbox size={18} />}
              title="Nothing from FLAIR OS yet"
              body={
                dryRun
                  ? "FLAIR OS is being read but not saved, so its deals cannot be shown. Once saving is on, every deal appears here by stage."
                  : "Refresh to read the pipeline from FLAIR OS."
              }
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {liveGroups.map(renderGroup)}
            {nothingMatches && <p className="py-6 text-center text-[13px] text-ink-3">No deals match.</p>}
            {!q && emptyLive.length > 0 && <p className="px-1 text-xs text-ink-4">Nothing in {emptyLive.map((g) => g.label).join(", ")}.</p>}
            {quietCount > 0 && (
              <div>
                <button type="button" onClick={() => setClosedOpen((o) => !o)} className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-ink-2 hover:text-ink" aria-expanded={closedOpen}>
                  {closedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Lost and paused <span className="text-xs font-normal tabular-nums text-ink-3">{quietCount}</span>
                </button>
                {closedOpen && <div className="mt-3 space-y-6">{quietGroups.map(renderGroup)}</div>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Needs a decision */}
      {decisionItems.length > 0 && (
        <section aria-label="Needs a decision">
          {mirrorEmpty ? (
            <>
              <SectionHeader title="Your leads" count={decisionItems.length} hint="added here, not from FLAIR OS" />
              <p className="mb-2 px-1 text-xs text-ink-3">Once FLAIR OS is saved here, each one is checked against it and you decide what happens.</p>
              <Card>
                <div className="divide-y divide-line">
                  {decisionItems.map((item) => (
                    <DecisionRow key={item.id} item={item} canManage={false} busy={false} plain onOpen={() => onOpen(item.id)} onDecide={() => {}} />
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <>
              <SectionHeader title="Needs a decision" count={pending.length} hint="leads you added here" />
              {pending.length > 0 ? (
                <Card>
                  <div className="divide-y divide-line">
                    {pending.map((item) => (
                      <DecisionRow key={item.id} item={item} canManage={canManage} busy={busyId === item.id} onOpen={() => onOpen(item.id)} onDecide={(a) => decide(item, a)} />
                    ))}
                  </div>
                </Card>
              ) : (
                <p className="px-1 text-[13px] text-ink-3">Nothing waiting. Every lead you added is matched or kept here on purpose.</p>
              )}
              {kept.length > 0 && (
                <div className="mt-3">
                  <button type="button" onClick={() => setKeptOpen((o) => !o)} className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-ink-2 hover:text-ink" aria-expanded={keptOpen}>
                    {keptOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Kept here on purpose <span className="text-xs font-normal tabular-nums text-ink-3">{kept.length}</span>
                  </button>
                  {keptOpen && (
                    <Card className="mt-3">
                      <div className="divide-y divide-line">
                        {kept.map((item) => (
                          <DecisionRow key={item.id} item={item} canManage={canManage} busy={busyId === item.id} onOpen={() => onOpen(item.id)} onDecide={(a) => decide(item, a)} />
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ── Your side ────────────────────────────────────────────────────────────────

function YourSideCards({ status, mirrorEmpty }: { status: FlairOsStatus | null; mirrorEmpty: boolean }) {
  const y = status?.your_side ?? null;
  const loading = !status;
  const quiet = mirrorEmpty ? "once FLAIR OS is saved here" : null;
  const cards: { label: string; value: number | null; sub: string; alert?: boolean }[] = [
    { label: "Deals you own", value: y?.deals_owned ?? null, sub: quiet ?? (y ? `of ${y.active_deals} active` : "") },
    { label: "Your open tasks", value: y?.tasks_open ?? null, sub: quiet ?? (y && y.tasks_overdue > 0 ? `${y.tasks_overdue} past due` : "from FLAIR OS deals"), alert: !!y && y.tasks_overdue > 0 },
    { label: "Check-ins overdue", value: y?.checkins_overdue ?? null, sub: quiet ?? "across the whole pipeline", alert: !!y && y.checkins_overdue > 0 },
    { label: "Moved this week", value: y?.stage_moves_week ?? null, sub: quiet ?? (y ? `${y.contacted_week} contacted` : "") },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="px-4 py-3">
          <div className="text-xs text-ink-3">{c.label}</div>
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", c.alert ? "text-red-600 dark:text-red-400" : "text-ink", (loading || mirrorEmpty) && "text-ink-4")}>
            {loading ? " " : mirrorEmpty ? "0" : c.value ?? 0}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-4">{loading ? "Loading" : c.sub}</div>
        </Card>
      ))}
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function DealRow({ lead, twins, attachmentCount, onOpen }: { lead: Lead; twins?: string[]; attachmentCount: number; onOpen: () => void }) {
  const status = lead.flair_os_sales_status?.toLowerCase();
  const overdue = !!lead.next_action_date && lead.next_action_date < todayKey() && status !== "won" && status !== "lost";
  const meta = [lead.flair_os_opportunity, lead.contact_name].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={onOpen} className="group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-hover sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-ink">{lead.company || lead.name}</span>
          {status && status !== "active" && <Badge tone={status === "won" ? "green" : status === "lost" ? "red" : "amber"}>{lead.flair_os_sales_status}</Badge>}
          {twins && twins.length > 0 && <Badge tone="amber">Possible duplicate in FLAIR OS</Badge>}
          {lead.flair_os_missing_at && <Badge tone="amber">Gone from FLAIR OS</Badge>}
        </div>
        {meta && <div className="mt-0.5 truncate text-xs text-ink-3">{meta}</div>}
        {lead.next_action && <div className="mt-0.5 truncate text-xs text-ink-2">Waiting on: {lead.next_action}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-3 sm:shrink-0 sm:justify-end sm:pt-0.5">
        {lead.value_cents ? <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{money(lead.value_cents)}</span> : null}
        <span className={cn(!lead.flair_os_owner && "text-ink-4")}>{lead.flair_os_owner || "Unassigned"}</span>
        {lead.flair_os_last_contacted_at && <span className="tabular-nums">contacted {ago(lead.flair_os_last_contacted_at)}</span>}
        {lead.next_action_date && (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", overdue && "font-medium text-red-600 dark:text-red-400")}>
            <CalendarDays size={13} />
            {shortDate(lead.next_action_date)}
            {overdue && <span className="sr-only">, overdue</span>}
          </span>
        )}
        {attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums" title="Attachments kept here">
            <Paperclip size={13} />
            {attachmentCount}
          </span>
        )}
      </div>
    </button>
  );
}

function DecisionRow({
  item,
  canManage,
  busy,
  plain = false,
  onOpen,
  onDecide,
}: {
  item: ReconciliationItem;
  canManage: boolean;
  busy: boolean;
  /** No verdict yet (the mirror is empty): name only. */
  plain?: boolean;
  onOpen: () => void;
  onDecide: (action: "link" | "separate" | "reset") => void;
}) {
  const separate = item.decision === "separate";
  const verdict = separate ? "separate" : item.verdict;
  const matchName = item.match?.company || item.match?.contact_name || "a FLAIR OS deal";
  const matchStage = item.match?.stage ? FLAIR_OS_STAGE_LABELS[item.match.stage.toLowerCase()] ?? item.match.stage : null;
  const title = item.company || item.name;
  const sub = item.company && item.name !== item.company ? item.name : item.contact_name;
  let line: string | null = null;
  if (!plain) {
    if (verdict === "separate") line = "Kept here. FLAIR OS is not told about it.";
    else if (item.match) line = `Matches ${matchName} in FLAIR OS${matchStage ? `, ${matchStage}` : ""}. ${item.reason}.`;
    else line = item.reason === "Checking" ? "Checking against FLAIR OS" : "No deal in FLAIR OS looks like this one.";
  }
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ink/10">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-ink">{title}</span>
          {sub && <span className="truncate text-xs text-ink-3">{sub}</span>}
          {!plain && verdict === "same" && <Badge tone="green">Already in FLAIR OS</Badge>}
          {!plain && verdict === "likely" && <Badge tone="amber">Probably in FLAIR OS</Badge>}
          {!plain && verdict === "none" && <Badge tone="neutral">Not in FLAIR OS</Badge>}
        </div>
        {line && <div className="mt-0.5 text-xs text-ink-3">{line}</div>}
      </button>
      {canManage && !plain && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {!separate && item.match && (
            <>
              <Button size="sm" onClick={() => onDecide("link")} loading={busy} disabled={busy}>
                Same deal, merge
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDecide("separate")} disabled={busy}>
                Different deal
              </Button>
            </>
          )}
          {!separate && !item.match && (
            <Button size="sm" variant="ghost" onClick={() => onDecide("separate")} disabled={busy}>
              Keep it here
            </Button>
          )}
          {separate && (
            <Button size="sm" variant="ghost" onClick={() => onDecide("reset")} loading={busy} disabled={busy}>
              Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export type { Reconciliation };
