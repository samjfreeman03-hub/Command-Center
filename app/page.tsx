import Link from "next/link";
import { db } from "@/lib/db";
import { BUSINESSES, getBusiness } from "@/lib/businesses";
import { ArrowUpRight, Circle } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";

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

  const todayTodos = openTodos.filter(
    (t) => t.due_date && (isToday(parseISO(t.due_date)) || isPast(parseISO(t.due_date)))
  );
  const upcomingTodos = openTodos.filter(
    (t) =>
      !t.due_date || (!isToday(parseISO(t.due_date)) && !isPast(parseISO(t.due_date)))
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-1">Today</div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {format(new Date(), "EEEE, MMMM d")}
        </h1>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
        {BUSINESSES.map((b) => {
          const pipe = pipelineByBusiness.get(b.id);
          const open = todosByBusiness.get(b.id) ?? 0;
          return (
            <Link
              key={b.id}
              href={`/b/${b.id}`}
              className="group rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-800 transition-colors p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                  <div className={`font-medium ${b.accent}`}>{b.name}</div>
                </div>
                <ArrowUpRight size={16} className="text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors" />
              </div>
              <div className="text-xs text-zinc-500 mb-4 leading-relaxed">{b.tagline}</div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Todos" value={open.toString()} />
                <Stat label="Leads" value={(pipe?.open_count ?? 0).toString()} />
                <Stat label="Pipeline" value={money(pipe?.pipeline_cents ?? 0)} />
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Today / Overdue" count={todayTodos.length}>
          {todayTodos.length === 0 ? (
            <Empty text="Nothing scheduled for today." />
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
              {todayTodos.map((t) => {
                const biz = getBusiness(t.business_id);
                const overdue = t.due_date ? isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) : false;
                return (
                  <li key={t.id} className="py-2.5 flex items-center gap-3">
                    <Circle size={14} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm break-all text-zinc-900 dark:text-zinc-100">{t.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                        {biz && <span className={biz.accent}>{biz.name}</span>}
                        {t.due_date && (
                          <span className={overdue ? "text-red-600 dark:text-red-400" : ""}>
                            {overdue ? "overdue · " : ""}
                            {format(parseISO(t.due_date), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming" count={upcomingTodos.length}>
          {upcomingTodos.length === 0 ? (
            <Empty text="No open todos." />
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
              {upcomingTodos.map((t) => {
                const biz = getBusiness(t.business_id);
                return (
                  <li key={t.id} className="py-2.5 flex items-center gap-3">
                    <Circle size={14} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm break-all text-zinc-900 dark:text-zinc-100">{t.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                        {biz && <span className={biz.accent}>{biz.name}</span>}
                        {t.due_date && <span>{format(parseISO(t.due_date), "MMM d")}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Recent notes" count={recentNotes.length}>
          {recentNotes.length === 0 ? (
            <Empty text="No notes yet. Drop notes into a business to give your AI context." />
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
              {recentNotes.map((n) => {
                const biz = getBusiness(n.business_id);
                return (
                  <li key={n.id} className="py-2.5">
                    <Link
                      href={`/b/${n.business_id}?tab=notes`}
                      className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/40 -mx-2 px-2 py-1 rounded"
                    >
                      <div className="text-sm truncate text-zinc-900 dark:text-zinc-100">{n.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                        {biz && <span className={biz.accent}>{biz.name}</span>}
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
          title="Pipeline by business"
          count={pipelineSummary.reduce((s, p) => s + p.open_count, 0)}
        >
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-900">
            {BUSINESSES.map((b) => {
              const p = pipelineByBusiness.get(b.id);
              return (
                <li key={b.id} className="py-2.5 flex items-center justify-between">
                  <Link
                    href={`/b/${b.id}?tab=pipeline`}
                    className="flex items-center gap-2 text-sm hover:text-zinc-950 dark:hover:text-zinc-50"
                  >
                    <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                    <span className={b.accent}>{b.name}</span>
                  </Link>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>{p?.open_count ?? 0} active</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{money(p?.pipeline_cents ?? 0)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-zinc-900 dark:text-zinc-100 mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</h2>
        {count !== undefined && <span className="text-xs text-zinc-500">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-zinc-500 py-6 text-center">{text}</div>;
}
