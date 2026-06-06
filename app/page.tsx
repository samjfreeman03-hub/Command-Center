import Link from "next/link";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { DashboardTodos } from "@/components/dashboard-todos";

export const dynamic = "force-dynamic";

function money(cents: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function Dashboard() {
  const openTodos = db.listTodos({ status: "open" });
  const pipelineSummary = db.pipelineSummary();
  const todoCounts = db.todoCounts();

  const todosByBusiness = new Map(todoCounts.map((t) => [t.business_id, t.open_count]));
  const pipelineByBusiness = new Map(pipelineSummary.map((p) => [p.business_id, p]));


  return (
    <div className="p-4 sm:p-8">
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
          <DashboardTodos initialTodos={openTodos} />
        </Panel>


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
