import Link from "next/link";
import { db } from "@/lib/db";
import { BUSINESSES, getBusiness } from "@/lib/businesses";
import { OUTREACH_BUSINESS_IDS } from "@/lib/outreach-config";
import { eventsEnabled } from "@/lib/events-config";
import { ArrowRight, ChevronRight, ListTodo, Target, TrendingUp, CalendarClock } from "lucide-react";
import { DashboardTodos } from "@/components/dashboard-todos";
import { ScratchpadPanel } from "@/components/scratchpad-panel";
import { TodayAttention, type AttentionItem } from "@/components/today-attention";
import { BrandTile, Card, EmptyState, SectionHeader } from "@/components/ui/display";

export const dynamic = "force-dynamic";

const LA_TZ = "America/Los_Angeles";

function money(cents: number) {
  if (!cents) return "$0";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(dollars % 1_000_000 === 0 ? 0 : 1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}k`;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Everything date-related is computed in Sam's timezone (the server runs UTC on Railway). */
function laNow() {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: LA_TZ }).format(now));
  const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: LA_TZ }).format(now);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: LA_TZ }).format(now); // YYYY-MM-DD
  const greeting = hour < 5 ? "Burning the midnight oil" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return { dateLabel, greeting, today };
}

/** Date-only math on YYYY-MM-DD strings, timezone-free. */
const asUTC = (d: string) => new Date(`${d}T12:00:00Z`);
const addDays = (d: string, n: number) => new Date(asUTC(d).getTime() + n * 86400_000).toISOString().slice(0, 10);
const shortDate = (d: string) => asUTC(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (d: string, today: string) =>
  d === addDays(today, 1)
    ? "Tomorrow"
    : asUTC(d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

type Upcoming = { key: string; date: string; businessId: string; title: string; kind: string; href: string };

export default function Dashboard() {
  const { dateLabel, greeting, today } = laNow();
  const weekOut = addDays(today, 7);
  const twoWeeksOut = addDays(today, 14);

  // Hidden businesses stay out of every dashboard number, not just the cards.
  const hiddenIds = new Set(db.hiddenBusinessIds());
  const shown = <T extends { business_id: string }>(rows: T[]) => rows.filter((r) => !hiddenIds.has(r.business_id));
  const businesses = BUSINESSES.filter((b) => !hiddenIds.has(b.id));
  const hiddenBusinesses = BUSINESSES.filter((b) => hiddenIds.has(b.id));

  const openTodos = shown(db.listTodos({ status: "open" }));
  const leads = shown(db.listLeads()).filter((l) => l.stage !== "won" && l.stage !== "lost");
  const pipelineSummary = shown(db.pipelineSummary());
  const todoCounts = shown(db.todoCounts());
  const scratchpad = db.getAppState("scratchpad") ?? "";
  const initiatives = businesses.flatMap((b) => db.listInitiatives(b.id)).filter((i) => i.status === "active");
  const nowInitiatives = initiatives.filter((i) => i.horizon === "now");
  const events = businesses
    .filter((b) => eventsEnabled(b.id))
    .flatMap((b) => db.listEvents(b.id))
    .filter((e) => e.date && e.status !== "completed" && e.status !== "cancelled");

  // ── Needs attention: overdue or due today ──
  const attention: (AttentionItem & { sort: string })[] = [];
  const when = (d: string) => (d === today ? "Today" : shortDate(d));

  for (const t of openTodos) {
    if (t.due_date && t.due_date <= today) {
      attention.push({
        key: `todo-${t.id}`, kind: "todo", businessId: t.business_id, title: t.title,
        context: t.priority === "high" ? "High priority" : "", when: when(t.due_date), overdue: t.due_date < today,
        href: `/b/${t.business_id}?tab=todos&open=${t.id}`, todoId: t.id, sort: t.due_date,
      });
    }
  }
  for (const l of leads) {
    if (l.next_action_date && l.next_action_date <= today) {
      attention.push({
        key: `lead-${l.id}`, kind: "lead", businessId: l.business_id, title: l.next_action || `Follow up with ${l.name}`,
        context: l.company || l.name, when: when(l.next_action_date), overdue: l.next_action_date < today,
        href: `/b/${l.business_id}?tab=pipeline&open=${l.id}`, sort: l.next_action_date,
      });
    }
  }
  for (const i of initiatives) {
    if (i.target_date && i.target_date <= today) {
      attention.push({
        key: `ini-${i.id}`, kind: "initiative", businessId: i.business_id, title: i.title,
        context: i.next_step ? `Next: ${i.next_step}` : "Target date", when: when(i.target_date), overdue: i.target_date < today,
        href: `/b/${i.business_id}?tab=initiatives&open=${i.id}`, sort: i.target_date,
      });
    }
  }
  for (const e of events) {
    if (e.date === today) {
      attention.push({
        key: `event-${e.id}`, kind: "event", businessId: e.business_id, title: e.name,
        context: [e.time, e.venue].filter(Boolean).join(", "), when: "Today", overdue: false,
        href: `/b/${e.business_id}?tab=events&open=${e.id}`, sort: today,
      });
    }
  }
  for (const id of OUTREACH_BUSINESS_IDS) {
    if (hiddenIds.has(id)) continue;
    const queue = db.listDailyQueue({ businessId: id });
    if (queue.followups.length > 0) {
      attention.push({
        key: `followups-${id}`, kind: "outreach", businessId: id,
        title: `${queue.followups.length} follow-up${queue.followups.length === 1 ? "" : "s"} due`,
        context: "Cadence is waiting on you", when: "Today", overdue: false, href: `/b/${id}?tab=outreach`, sort: today,
      });
    }
    if (queue.newTargets.length > 0) {
      attention.push({
        key: `targets-${id}`, kind: "outreach", businessId: id,
        title: `${queue.newTargets.length} new target${queue.newTargets.length === 1 ? "" : "s"} ready to send`,
        context: "Today's outreach queue", when: "Today", overdue: false, href: `/b/${id}?tab=outreach`, sort: today,
      });
    }
  }
  attention.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.sort.localeCompare(b.sort));

  // ── Coming up: the next 7 days (events: 14) ──
  const upcoming: Upcoming[] = [
    ...openTodos
      .filter((t) => t.due_date && t.due_date > today && t.due_date <= weekOut)
      .map((t) => ({ key: `t${t.id}`, date: t.due_date!, businessId: t.business_id, title: t.title, kind: "Todo", href: `/b/${t.business_id}?tab=todos&open=${t.id}` })),
    ...leads
      .filter((l) => l.next_action_date && l.next_action_date > today && l.next_action_date <= weekOut)
      .map((l) => ({ key: `l${l.id}`, date: l.next_action_date!, businessId: l.business_id, title: l.next_action || `Follow up with ${l.name}`, kind: l.company || "Deal", href: `/b/${l.business_id}?tab=pipeline&open=${l.id}` })),
    ...initiatives
      .filter((i) => i.target_date && i.target_date > today && i.target_date <= weekOut)
      .map((i) => ({ key: `i${i.id}`, date: i.target_date!, businessId: i.business_id, title: i.title, kind: "Initiative target", href: `/b/${i.business_id}?tab=initiatives&open=${i.id}` })),
    ...events
      .filter((e) => e.date! > today && e.date! <= twoWeeksOut)
      .map((e) => ({ key: `e${e.id}`, date: e.date!, businessId: e.business_id, title: e.name, kind: [e.time, e.city].filter(Boolean).join(", ") || "Event", href: `/b/${e.business_id}?tab=events&open=${e.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const upcomingDays = [...new Set(upcoming.map((u) => u.date))];

  const todosByBusiness = new Map(todoCounts.map((t) => [t.business_id, t.open_count]));
  const pipelineByBusiness = new Map(pipelineSummary.map((p) => [p.business_id, p]));
  const totalPipeline = pipelineSummary.reduce((s, p) => s + p.pipeline_cents, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-safe-10 pt-6 sm:px-8 sm:pt-9">
      {/* Header */}
      <header className="mb-8">
        <p className="text-[13px] font-medium text-ink-3">{greeting}, Sam</p>
        <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-3xl">{dateLabel}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
          <Stat icon={<Target size={13} />} value={nowInitiatives.length} label="in focus" />
          <Stat icon={<ListTodo size={13} />} value={openTodos.length} label="open todos" />
          <Stat icon={<TrendingUp size={13} />} value={leads.length} label="active deals" />
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold tabular-nums text-ink">{money(totalPipeline)}</span> pipeline
          </span>
        </p>
      </header>

      {/* Two independent columns on desktop. On phones the wrappers dissolve
          (display: contents) so the order-* classes interleave the sections:
          attention, scratchpad, coming up, businesses, todos. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:items-start lg:gap-x-6">
        <div className="contents lg:col-span-2 lg:block lg:space-y-8">
          {/* Needs attention */}
          <section className="order-1">
            <TodayAttention items={attention.map(({ sort: _sort, ...item }) => item)} />
          </section>

          {/* Scratchpad (second on phones: capture should be one thumb-scroll away) */}
          <section className="order-2">
            <ScratchpadPanel initialValue={scratchpad} />
          </section>

          {/* Businesses */}
          <section className="order-4">
            <SectionHeader title="Businesses" />
            <Card>
              <div className="divide-y divide-line">
                {businesses.map((b) => {
                  const pipe = pipelineByBusiness.get(b.id);
                  const focus = nowInitiatives.filter((i) => i.business_id === b.id);
                  return (
                    <Link key={b.id} href={`/b/${b.id}`} className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-hover">
                      <BrandTile business={b} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink">{b.name}</div>
                        {focus.length > 0 ? (
                          <div className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                            <Target size={11} className="shrink-0" />
                            <span className="truncate">
                              <span className="text-ink-2">{focus[0].title}</span>
                              {focus[0].next_step && (<> <ArrowRight size={10} className="-mt-px inline" /> {focus[0].next_step}</>)}
                            </span>
                            {focus.length > 1 && <span className="shrink-0">+{focus.length - 1}</span>}
                          </div>
                        ) : (
                          <div className="truncate text-xs text-ink-3">{db.getBusinessTagline(b.id) ?? b.tagline}</div>
                        )}
                      </div>
                      <dl className="hidden shrink-0 items-center gap-6 text-right sm:flex">
                        <Metric label="Todos" value={String(todosByBusiness.get(b.id) ?? 0)} />
                        <Metric label="Deals" value={String(pipe?.open_count ?? 0)} />
                        <Metric label="Pipeline" value={money(pipe?.pipeline_cents ?? 0)} wide />
                      </dl>
                      <ChevronRight size={15} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </Card>
            {hiddenBusinesses.length > 0 && (
              <p className="mt-2 px-1 text-xs text-ink-3">
                Hidden:{" "}
                {hiddenBusinesses.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ", "}
                    <Link href={`/b/${b.id}`} className="underline-offset-2 hover:text-ink-2 hover:underline">{b.name}</Link>
                  </span>
                ))}
              </p>
            )}
          </section>
        </div>
        <div className="contents lg:block lg:space-y-8">
          {/* Coming up */}
          <section className="order-3">
            <SectionHeader title="Coming up" hint="Next 7 days" />
            <Card>
              {upcoming.length === 0 ? (
                <EmptyState icon={<CalendarClock size={18} />} title="Nothing scheduled" body="Due dates, deal next steps and events for the week ahead show up here." className="py-10" />
              ) : (
                <div className="divide-y divide-line">
                  {upcomingDays.map((day) => (
                    <div key={day} className="px-4 py-3">
                      <div className="mb-1.5 text-xs font-medium text-ink-2">{dayLabel(day, today)}</div>
                      <div className="space-y-1.5">
                        {upcoming.filter((u) => u.date === day).map((u) => {
                          const b = getBusiness(u.businessId);
                          return (
                            <Link key={u.key} href={u.href} className="group flex items-start gap-2 text-[13px]">
                              {b && <span className="mt-px"><BrandTile business={b} size="xs" /></span>}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-ink group-hover:underline">{u.title}</span>
                                <span className="block truncate text-xs text-ink-3">{u.kind}</span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          {/* All open todos by business */}
          <section className="order-5">
            <SectionHeader title="Open todos" count={openTodos.length || undefined} />
            <Card>
              <DashboardTodos initialTodos={openTodos} />
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink-4">{icon}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span> {label}
    </span>
  );
}

function Metric({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "w-16" : "w-10"}>
      <dd className="text-sm font-semibold tabular-nums text-ink">{value}</dd>
      <dt className="text-[11px] text-ink-3">{label}</dt>
    </div>
  );
}
