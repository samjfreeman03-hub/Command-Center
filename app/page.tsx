import Link from "next/link";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { ArrowUpRight, CheckCircle2, TrendingUp, Users, ListTodo, Target, ArrowRight } from "lucide-react";
import { DashboardTodos } from "@/components/dashboard-todos";
import { ScratchpadPanel } from "@/components/scratchpad-panel";

export const dynamic = "force-dynamic";

const LA_TZ = "America/Los_Angeles";

function money(cents: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Date + greeting in Sam's timezone (server runs UTC on Railway). */
function laNow() {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: LA_TZ }).format(now)
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: LA_TZ,
  }).format(now);
  const greeting = hour < 5 ? "Burning the midnight oil" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return { dateLabel, greeting };
}

export default function Dashboard() {
  // Hidden businesses stay out of every dashboard number, not just the cards.
  const hiddenIds = new Set(db.hiddenBusinessIds());
  const shown = <T extends { business_id: string }>(rows: T[]) => rows.filter((r) => !hiddenIds.has(r.business_id));
  const businesses = BUSINESSES.filter((b) => !hiddenIds.has(b.id));
  const hiddenBusinesses = BUSINESSES.filter((b) => hiddenIds.has(b.id));

  const openTodos = shown(db.listTodos({ status: "open" }));
  const pipelineSummary = shown(db.pipelineSummary());
  const todoCounts = shown(db.todoCounts());
  const scratchpad = db.getAppState("scratchpad") ?? "";
  const nowInitiatives = shown(db.activeNowInitiatives());

  const todosByBusiness = new Map(todoCounts.map((t) => [t.business_id, t.open_count]));
  const pipelineByBusiness = new Map(pipelineSummary.map((p) => [p.business_id, p]));
  const initiativesByBusiness = new Map<string, typeof nowInitiatives>();
  for (const i of nowInitiatives) {
    const list = initiativesByBusiness.get(i.business_id) ?? [];
    list.push(i);
    initiativesByBusiness.set(i.business_id, list);
  }

  const totalPipeline = pipelineSummary.reduce((s, p) => s + p.pipeline_cents, 0);
  const totalLeads = pipelineSummary.reduce((s, p) => s + p.open_count, 0);
  const { dateLabel, greeting } = laNow();

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600 mb-1">{greeting}, Sam</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {dateLabel}
          </h1>
        </div>
        {/* At-a-glance totals */}
        <div className="flex items-center gap-2 flex-wrap">
          <HeaderStat icon={<Target size={13} />} label="in focus" value={nowInitiatives.length.toString()} />
          <HeaderStat icon={<ListTodo size={13} />} label="open todos" value={openTodos.length.toString()} />
          <HeaderStat icon={<Users size={13} />} label="active leads" value={totalLeads.toString()} />
          <HeaderStat icon={<TrendingUp size={13} />} label="pipeline" value={money(totalPipeline) === "—" ? "$0" : money(totalPipeline)} />
        </div>
      </header>

      {/* Business cards */}
      <section className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ${hiddenBusinesses.length > 0 ? "mb-3" : "mb-10"}`}>
        {businesses.map((b) => {
          const pipe = pipelineByBusiness.get(b.id);
          const open = todosByBusiness.get(b.id) ?? 0;
          const focus = initiativesByBusiness.get(b.id) ?? [];
          return (
            <Link
              key={b.id}
              href={`/b/${b.id}`}
              className="group relative rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg hover:shadow-zinc-200/60 dark:hover:shadow-zinc-900/60 hover:-translate-y-0.5 transition-all duration-200 p-5 overflow-hidden"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Brand monogram */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-bold shadow-sm"
                    style={{ backgroundColor: b.hex }}
                  >
                    {b.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-base font-bold ${b.accent} mb-0.5 truncate`}>{b.name}</div>
                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{b.tagline}</p>
                  </div>
                </div>
                <ArrowUpRight
                  size={16}
                  className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors shrink-0 mt-0.5"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Stat label="Todos" value={open.toString()} />
                <Stat label="Leads" value={(pipe?.open_count ?? 0).toString()} />
                <Stat label="Pipeline" value={money(pipe?.pipeline_cents ?? 0)} />
              </div>

              {/* Focus initiatives (active + Now) */}
              {focus.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-900 space-y-1.5">
                  {focus.slice(0, 2).map((i) => (
                    <div key={i.id} className="flex items-start gap-1.5 text-xs">
                      <Target size={11} className="shrink-0 mt-[3px] text-zinc-400" />
                      <div className="min-w-0">
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium">{i.title}</span>
                        {i.next_step && (
                          <span className="text-zinc-400 dark:text-zinc-600">
                            {" "}<ArrowRight size={9} className="inline -mt-px" /> {i.next_step}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {focus.length > 2 && (
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-600 pl-[22px]">
                      +{focus.length - 2} more in focus
                    </div>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </section>

      {hiddenBusinesses.length > 0 && (
        <p className="mb-10 px-1 text-xs text-zinc-400 dark:text-zinc-600">
          Hidden:{" "}
          {hiddenBusinesses.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <Link href={`/b/${b.id}`} className="underline-offset-2 hover:underline hover:text-zinc-600 dark:hover:text-zinc-400">
                {b.name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {/* Lower panels */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ── Scratchpad (persisted quick notes) ── */}
        <ScratchpadPanel initialValue={scratchpad} />

        {/* ── All todos, grouped by company ── */}
        <Panel
          title="Open Todos"
          count={openTodos.length}
          icon={<CheckCircle2 size={14} className="text-zinc-400" />}
        >
          <DashboardTodos initialTodos={openTodos} />
        </Panel>

      </section>
    </div>
  );
}

function HeaderStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs">
      <span className="text-zinc-400">{icon}</span>
      <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</span>
      <span className="text-zinc-400 dark:text-zinc-600">{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-2.5 py-2">
      <div className="text-[10px] text-zinc-400 dark:text-zinc-600 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function Panel({
  title,
  count,
  icon,
  accent,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h2>
        </div>
        {count !== undefined && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 ${accent ?? "text-zinc-500"}`}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

