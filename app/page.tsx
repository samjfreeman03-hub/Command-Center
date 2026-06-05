import Link from "next/link";
import { db } from "@/lib/db";
import { BUSINESSES, getBusiness } from "@/lib/businesses";
import { ArrowUpRight, Circle, TrendingUp, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

function money(cents: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function Dashboard() {
  const openTodos = db.listTodos({ status: "open" });
  const pipelineSummary = db.pipelineSummary();
  const todoCounts = db.todoCounts();
  const recentNotes = db.listNotes({ limit: 5 });

  const pipelineByBusiness = new Map(pipelineSummary.map((p) => [p.business_id, p]));
  const todosByBusiness = new Map(todoCounts.map((t) => [t.business_id, t.open_count]));

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
  const todoGroups = BUSINESSES.map((b) => ({
    business: b,
    todos: openTodos
      .filter((t) => t.business_id === b.id)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  })).filter((g) => g.todos.length > 0);

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      {/* Header */}
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600 mb-1">Dashboard</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {format(new Date(), "EEEE, MMMM d")}
        </h1>
      </header>

      {/* Business cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
        {BUSINESSES.map((b) => {
          const pipe = pipelineByBusiness.get(b.id);
          const open = todosByBusiness.get(b.id) ?? 0;
          return (
            <Link
              key={b.id}
              href={`/b/${b.id}`}
              className="group relative rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md dark:hover:shadow-zinc-900/50 transition-all p-5 overflow-hidden"
            >
              {/* Colored left stripe */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${b.dot}`} />

              <div className="pl-3">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className={`text-base font-bold ${b.accent} mb-0.5`}>{b.name}</div>
                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 max-w-[180px]">{b.tagline}</p>
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
              </div>
            </Link>
          );
        })}
      </section>

      {/* Lower panels */}
      <section className="space-y-5">

        {/* ── All todos, grouped by company ── */}
        <Panel
          title="Open Todos"
          count={openTodos.length}
          icon={<CheckCircle2 size={14} className="text-zinc-400" />}
        >
          {todoGroups.length === 0 ? (
            <Empty text="All clear. 🎉" />
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {todoGroups.map(({ business: b, todos }) => (
                <div key={b.id} className="py-4 first:pt-0 last:pb-0">
                  {/* Company header */}
                  <Link
                    href={`/b/${b.id}?tab=todos`}
                    className="inline-flex items-center gap-1.5 mb-3 group"
                  >
                    <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                    <span className={`text-xs font-semibold ${b.accent} group-hover:opacity-70 transition-opacity`}>
                      {b.name}
                    </span>
                    <span className="text-xs text-zinc-400 ml-0.5">{todos.length}</span>
                  </Link>
                  {/* Todo items */}
                  <div className="space-y-1.5">
                    {todos.map((t) => (
                      <div key={t.id} className="flex items-start gap-2.5">
                        <Circle size={12} className="text-zinc-300 dark:text-zinc-700 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                          <span className={`text-sm leading-snug ${t.priority === "low" ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-800 dark:text-zinc-200"}`}>
                            {t.title}
                          </span>
                          {t.priority === "high" && (
                            <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-md mt-0.5">
                              HIGH
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Recent notes" count={recentNotes.length}>
          {recentNotes.length === 0 ? (
            <Empty text="No notes yet." />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {recentNotes.map((n) => {
                const biz = getBusiness(n.business_id);
                return (
                  <li key={n.id} className="py-2.5">
                    <Link
                      href={`/b/${n.business_id}?tab=notes`}
                      className="block -mx-1 px-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <div className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{n.title}</div>
                      <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                        {biz && <span className={`font-medium ${biz.accent}`}>{biz.name}</span>}
                        <span>{format(new Date(n.updated_at), "MMM d")}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Pipeline"
          count={pipelineSummary.reduce((s, p) => s + p.open_count, 0)}
          icon={<TrendingUp size={14} className="text-emerald-500" />}
        >
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {BUSINESSES.map((b) => {
              const p = pipelineByBusiness.get(b.id);
              const hasPipe = (p?.open_count ?? 0) > 0 || (p?.pipeline_cents ?? 0) > 0;
              return (
                <li key={b.id} className="py-2.5">
                  <Link
                    href={`/b/${b.id}?tab=pipeline`}
                    className="flex items-center justify-between hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      <span className={`text-sm font-medium ${b.accent}`}>{b.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-zinc-400">{p?.open_count ?? 0} active</span>
                      <span className={hasPipe ? "text-zinc-700 dark:text-zinc-300 font-medium" : "text-zinc-400"}>
                        {money(p?.pipeline_cents ?? 0)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
        </div>

      </section>
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
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
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

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-zinc-400 py-6 text-center">{text}</div>;
}
