"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Paperclip, CalendarDays, ArrowRight, Link2, Users, ChevronDown, ChevronUp } from "lucide-react";
import type { Lead } from "@/lib/types";
import { useShareHeaders } from "@/lib/share-context";
import { cn } from "@/lib/cn";
import { flairOsStageLabel, FLAIR_OS_STAGE_LABELS } from "@/lib/flair-os/stage-map";
import { duplicateGroups } from "@/lib/flair-os/match";
import type { Reconciliation, ReconciliationItem } from "@/lib/flair-os/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";
import { confirmDialog, toast } from "@/components/ui/host";
import { ago, type FlairOsStatus } from "@/components/flair-os-panel";
import type { FlairOsStageMeta } from "@/components/pipeline-panel";

/**
 * The FLAIR page's pipeline when the FLAIR OS mirror is on (v2 design):
 * columns are FLAIR OS stages in FLAIR OS order with FLAIR OS labels and
 * colors, cards show FLAIR OS fields, the header shows FLAIR OS's own
 * numbers, and a lane on the left holds the FLAIR leads that exist only in
 * the Command Center with a match verdict against FLAIR OS.
 *
 * Read-only toward FLAIR OS. The only writes are the lane decisions (link,
 * keep separate), which touch Command Center rows only.
 */

const LANE = "__cc_only__";
const OTHER = "__other__";
const CONDENSED_SLUGS = new Set(["outreach"]);
const CONDENSED_MIN = 9;
const CONDENSED_SHOW = 5;

type Column = { key: string; label: string; color: string | null; quiet: boolean; won: boolean };

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
function orderColumns(stages: FlairOsStageMeta[], fallbackSlugs: string[]): Column[] {
  const metas = stages.length
    ? [...stages].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    : fallbackSlugs.map((slug, i) => ({ slug, label: flairOsStageLabel(slug) || slug, color: null, sort_order: i, is_won: false, is_lost: slug === "lost", is_lifecycle: slug !== "paused" }));
  const live = metas.filter((m) => m.is_lifecycle && !m.is_lost);
  const lost = metas.filter((m) => m.is_lost);
  const held = metas.filter((m) => !m.is_lifecycle && !m.is_lost);
  return [...live, ...lost, ...held].map((m) => ({ key: m.slug.toLowerCase(), label: m.label, color: m.color, quiet: m.is_lost || !m.is_lifecycle, won: m.is_won }));
}

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
  /** Owner view: may link and keep separate. */
  canManage: boolean;
  status: FlairOsStatus | null;
  onReload: () => void;
  onOpen: (leadId: number) => void;
  onNew: () => void;
  /** A Command Center lead was linked to a deal: fold the deal's shell row into it locally. */
  onLinked: (leadId: number, dealId: string) => void;
  attachmentCounts: Record<number, number>;
}) {
  const shareHeaders = useShareHeaders();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [mobileKey, setMobileKey] = useState<string>("");

  const mirrored = useMemo(() => leads.filter((l) => !!l.flair_os_id), [leads]);
  const localOnly = useMemo(() => leads.filter((l) => !l.flair_os_id), [leads]);
  const q = query.trim().toLowerCase();
  const matches = (l: Lead) => !q || [l.company, l.name, l.contact_name, l.flair_os_opportunity, l.flair_os_owner, l.next_action].some((v) => v?.toLowerCase().includes(q));

  const columns = useMemo(() => {
    const seen = [...new Set(mirrored.map((l) => l.flair_os_stage?.toLowerCase()).filter((s): s is string => !!s))];
    const cols = orderColumns(stages, seen);
    const known = new Set(cols.map((c) => c.key));
    if (seen.some((s) => !known.has(s))) cols.push({ key: OTHER, label: "Stage not in the list", color: null, quiet: true, won: false });
    return cols;
  }, [stages, mirrored]);

  const byColumn = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const c of columns) map[c.key] = [];
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
  }, [columns, mirrored, q]);

  const duplicates = useMemo(
    () => status?.reconciliation?.duplicates ?? duplicateGroups(mirrored.map((l) => ({ id: l.flair_os_id as string, company: l.company, contactName: l.contact_name ?? null, email: l.contact_email }))),
    [status?.reconciliation?.duplicates, mirrored]
  );

  const laneItems: ReconciliationItem[] = useMemo(() => {
    const fromServer = status?.reconciliation?.items;
    const byId = new Map((fromServer ?? []).map((i) => [i.id, i]));
    // Leads the panel knows about but the status call has not seen yet (just created) still show.
    return localOnly
      .filter(matches)
      .map((l) => byId.get(l.id) ?? { id: l.id, name: l.name, company: l.company, contact_name: l.contact_name ?? null, contact_email: l.contact_email, stage: l.stage, updated_at: l.updated_at, decision: null, verdict: "none" as const, reason: fromServer ? "Not in FLAIR OS" : "Checking", match: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOnly, status?.reconciliation?.items, q]);

  const counts = status?.state?.counts ?? null;
  const headerCounts = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    let active = 0, won = 0, lost = 0;
    for (const l of mirrored) {
      const c = byKey.get(l.flair_os_stage?.toLowerCase() ?? "");
      const st = l.flair_os_sales_status?.toLowerCase();
      if (c?.won || st === "won") won += 1;
      else if (st === "lost" || (c && c.quiet && !c.won && c.key === "lost")) lost += 1;
      else active += 1;
    }
    return {
      active: counts?.byStatus?.active ?? active,
      won: counts?.byStatus?.won ?? won,
      lost: counts?.byStatus?.lost ?? lost,
      open: dollars(counts?.openPipelineValue),
      booked: dollars(counts?.bookedPipelineValue),
    };
  }, [counts, columns, mirrored]);

  async function decide(item: ReconciliationItem, action: "link" | "separate" | "reset") {
    if (action === "link") {
      if (!item.match) return;
      const ok = await confirmDialog({
        title: `Link to the FLAIR OS deal for ${item.match.company || "this company"}?`,
        description: `${item.company || item.name} becomes the mirror of that deal. Your notes, categories and attachments stay on it. FLAIR OS is not changed.`,
        confirmLabel: "Link",
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
        toast(`Linked to FLAIR OS. ${item.company || item.name} now mirrors that deal.`, { tone: "success" });
      } else if (action === "separate") {
        toast("Kept separate. It stays in this lane without a suggestion.", { tone: "success" });
      }
      onReload();
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const mobileOptions = [
    { value: LANE, label: <span className="whitespace-nowrap">Command Center only <span className="ml-0.5 text-[11px] tabular-nums opacity-60">{laneItems.length}</span></span> },
    ...columns.map((c) => ({ value: c.key, label: <span className="whitespace-nowrap">{c.label} <span className="ml-0.5 text-[11px] tabular-nums opacity-60">{byColumn[c.key]?.length ?? 0}</span></span> })),
  ];
  const firstNonEmpty = columns.find((c) => (byColumn[c.key]?.length ?? 0) > 0)?.key ?? columns[0]?.key ?? LANE;
  const activeMobile = mobileKey || (laneItems.length ? LANE : firstNonEmpty);

  const renderCard = (l: Lead) => (
    <DealCard key={l.id} lead={l} twins={l.flair_os_id ? duplicates[l.flair_os_id] : undefined} attachmentCount={attachmentCounts[l.id] ?? l.attachment_count ?? 0} onOpen={() => onOpen(l.id)} />
  );

  const renderColumn = (c: Column, mobile = false) => {
    const all = byColumn[c.key] ?? [];
    const condensed = !mobile && CONDENSED_SLUGS.has(c.key) && all.length >= CONDENSED_MIN && !expanded[c.key];
    const shown = condensed ? all.slice(0, CONDENSED_SHOW) : all;
    const owners = new Map<string, number>();
    for (const l of all) owners.set(l.flair_os_owner || "Unassigned", (owners.get(l.flair_os_owner || "Unassigned") ?? 0) + 1);
    const total = all.reduce((s, l) => s + (l.value_cents ?? 0), 0);
    const empty = all.length === 0;
    return (
      <section
        key={c.key}
        aria-label={`${c.label} stage`}
        className={cn(
          mobile ? "flex flex-col" : "flex min-h-[420px] shrink-0 flex-col rounded-xl border p-2",
          !mobile && (c.quiet ? "border-dashed border-line bg-transparent" : "border-transparent bg-sunken"),
          !mobile && (empty ? "w-[172px]" : "w-[272px]")
        )}
      >
        {!mobile && (
          <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2.5 pt-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="relative top-px inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10" style={{ backgroundColor: c.color ?? "var(--color-ink-4)" }} aria-hidden />
              <h2 className={cn("truncate text-[13px] font-semibold", c.quiet ? "text-ink-3" : "text-ink")}>{c.label}</h2>
              <span className="text-xs tabular-nums text-ink-3">{all.length}</span>
            </div>
            {total > 0 && <span className={cn("text-xs font-medium tabular-nums", c.won ? "text-emerald-600 dark:text-emerald-400" : "text-ink-2")}>{money(total)}</span>}
          </header>
        )}
        {condensed && (
          <div className="mb-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-ink-2">
            <div className="flex items-center gap-1.5 font-medium text-ink">
              <Users size={13} className="text-ink-3" /> {all.length} in outreach
            </div>
            <div className="mt-1 text-ink-3">
              {[...owners.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${n}`).join(", ")}
            </div>
            <div className="mt-1 text-ink-3">Showing the {CONDENSED_SHOW} most recently contacted.</div>
          </div>
        )}
        <div className={cn("flex flex-1 flex-col gap-2", c.quiet && "opacity-80")}>
          {shown.map(renderCard)}
          {empty && <div className="flex flex-1 items-start justify-center px-2 pt-6 text-center text-xs text-ink-4">{q ? "No matches" : "No deals"}</div>}
        </div>
        {!mobile && CONDENSED_SLUGS.has(c.key) && all.length >= CONDENSED_MIN && (
          <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setExpanded((e) => ({ ...e, [c.key]: !e[c.key] }))}>
            {condensed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            {condensed ? `Show all ${all.length}` : "Show fewer"}
          </Button>
        )}
      </section>
    );
  };

  const renderLane = (mobile = false) => (
    <section
      aria-label="In Command Center only"
      className={cn(mobile ? "flex flex-col" : "flex min-h-[420px] w-[272px] shrink-0 flex-col rounded-xl border border-dashed border-line-strong bg-transparent p-2")}
    >
      {!mobile && (
        <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2.5 pt-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-[13px] font-semibold text-ink">In Command Center only</h2>
            <span className="text-xs tabular-nums text-ink-3">{laneItems.length}</span>
          </div>
        </header>
      )}
      <div className="flex flex-1 flex-col gap-2">
        {laneItems.map((item) => (
          <LaneCard key={item.id} item={item} canManage={canManage} busy={busyId === item.id} onOpen={() => onOpen(item.id)} onDecide={(a) => decide(item, a)} />
        ))}
        {laneItems.length === 0 && (
          <div className="flex flex-1 items-start justify-center px-3 pt-6 text-center text-xs text-ink-4">
            {q ? "No matches" : "Every FLAIR lead here is in FLAIR OS."}
          </div>
        )}
      </div>
      {canManage && !mobile && (
        <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={onNew}>
          <Plus size={13} /> New lead (here only)
        </Button>
      )}
    </section>
  );

  return (
    <div>
      {/* FLAIR OS numbers */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 md:min-h-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span><span className="font-medium tabular-nums text-ink">{headerCounts.active}</span> active</span>
            <span><span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{headerCounts.won}</span> won</span>
            <span><span className="font-medium tabular-nums text-ink">{headerCounts.lost}</span> lost</span>
            {headerCounts.open && <span><span className="font-medium tabular-nums text-ink">{headerCounts.open}</span> open</span>}
            {headerCounts.booked && <span><span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{headerCounts.booked}</span> booked</span>}
            <span><span className="font-medium tabular-nums text-ink">{localOnly.length}</span> here only</span>
            {counts && <span className="text-xs text-ink-4">FLAIR OS numbers, {ago(counts.fetched_at)}</span>}
          </div>
          {leads.length > 8 && (
            <div className="relative w-full sm:w-60">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deals" aria-label="Search deals" className="pl-8 md:h-8 md:text-[13px]" />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" onClick={onNew}>
            <Plus size={14} /> New lead
          </Button>
        </div>
      </div>

      {/* Board (desktop) */}
      <div className="hidden gap-3 overflow-x-auto pb-3 md:flex">
        {renderLane()}
        <div className="w-px shrink-0 self-stretch bg-line" aria-hidden />
        {columns.map((c, i) => {
          const prev = columns[i - 1];
          const divider = prev && !prev.quiet && c.quiet;
          return (
            <div key={c.key} className="contents">
              {divider && <div className="w-px shrink-0 self-stretch bg-line" aria-hidden />}
              {renderColumn(c)}
            </div>
          );
        })}
      </div>

      {/* Stage picker + list (mobile) */}
      <div className="md:hidden">
        <Segmented className="flex-nowrap! w-full overflow-x-auto scrollbar-none" value={activeMobile} onChange={setMobileKey} options={mobileOptions} />
        <div className="mt-3">
          {activeMobile === LANE ? renderLane(true) : (() => {
            const c = columns.find((x) => x.key === activeMobile);
            return c ? renderColumn(c, true) : null;
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

function DealCard({ lead, twins, attachmentCount, onOpen }: { lead: Lead; twins?: string[]; attachmentCount: number; onOpen: () => void }) {
  const status = lead.flair_os_sales_status?.toLowerCase();
  const overdue = !!lead.next_action_date && lead.next_action_date < todayKey() && status !== "won" && status !== "lost";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "cursor-pointer select-none rounded-xl border border-line bg-raised p-3 text-left shadow-card outline-none",
        "transition-[box-shadow,border-color] duration-150 hover:border-line-strong hover:shadow-lift",
        "focus-visible:border-ink-3 focus-visible:ring-[3px] focus-visible:ring-ink/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{lead.company || lead.name}</div>
          {lead.flair_os_opportunity && <div className="mt-0.5 truncate text-xs text-ink-2">{lead.flair_os_opportunity}</div>}
          {lead.contact_name && <div className="mt-0.5 truncate text-xs text-ink-3">{lead.contact_name}</div>}
        </div>
        {lead.value_cents ? <span className="shrink-0 text-[13px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{money(lead.value_cents)}</span> : null}
      </div>

      {(twins?.length || lead.flair_os_missing_at || (status && status !== "active")) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {status && status !== "active" && <Badge tone={status === "won" ? "green" : status === "lost" ? "red" : "amber"}>{lead.flair_os_sales_status}</Badge>}
          {twins && twins.length > 0 && <Badge tone="amber">Possible duplicate in FLAIR OS</Badge>}
          {lead.flair_os_missing_at && <Badge tone="amber">Missing in FLAIR OS</Badge>}
        </div>
      )}

      {lead.next_action && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-ink-2">
          <ArrowRight size={13} className="mt-px shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 break-words">{lead.next_action}</span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-ink-3">
        <span className={cn(!lead.flair_os_owner && "text-ink-4")}>{lead.flair_os_owner || "Unassigned"}</span>
        {lead.flair_os_last_contacted_at && <span className="tabular-nums">contacted {ago(lead.flair_os_last_contacted_at)}</span>}
        {lead.next_action_date && (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", overdue ? "font-medium text-red-600 dark:text-red-400" : "")}>
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
    </div>
  );
}

function LaneCard({ item, canManage, busy, onOpen, onDecide }: { item: ReconciliationItem; canManage: boolean; busy: boolean; onOpen: () => void; onDecide: (action: "link" | "separate" | "reset") => void }) {
  const separate = item.decision === "separate";
  const verdict = separate ? "separate" : item.verdict;
  const matchName = item.match?.company || item.match?.contact_name || "a FLAIR OS deal";
  const matchStage = item.match?.stage ? FLAIR_OS_STAGE_LABELS[item.match.stage.toLowerCase()] ?? item.match.stage : null;
  return (
    <div className="rounded-xl border border-line bg-raised p-3 shadow-card">
      <button type="button" onClick={onOpen} className="block w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ink/10 rounded-md">
        <div className="truncate text-sm font-medium text-ink">{item.company || item.name}</div>
        {item.company && item.name !== item.company && <div className="mt-0.5 truncate text-xs text-ink-3">{item.name}</div>}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {verdict === "same" && <Badge tone="green">Already in FLAIR OS</Badge>}
        {verdict === "likely" && <Badge tone="amber">Probably in FLAIR OS</Badge>}
        {verdict === "none" && <Badge tone="neutral">Not in FLAIR OS</Badge>}
        {verdict === "separate" && <Badge tone="neutral">Kept separate</Badge>}
      </div>
      {item.match && !separate && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-2">
          <Link2 size={13} className="mt-px shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 break-words">
            {matchName}
            {matchStage ? `, ${matchStage}` : ""}
            <span className="text-ink-4">. {item.reason}</span>
          </span>
        </div>
      )}
      {canManage && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!separate && item.match && (
            <Button size="sm" onClick={() => onDecide("link")} loading={busy} disabled={busy}>
              Link
            </Button>
          )}
          {!separate && (
            <Button size="sm" variant="ghost" onClick={() => onDecide("separate")} disabled={busy}>
              Keep separate
            </Button>
          )}
          {separate && (
            <Button size="sm" variant="ghost" onClick={() => onDecide("reset")} disabled={busy}>
              Undo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export type { Reconciliation };
