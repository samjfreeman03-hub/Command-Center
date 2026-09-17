"use client";

import { useEffect, useMemo, useState } from "react";
import { brandVars, type Business } from "@/lib/businesses";
import type {
  Todo, Lead, LeadCategory, BizEvent, Initiative, Note, ChatMessage, BusinessResource, TeamMember, BrandContact, OutreachTarget,
} from "@/lib/types";
import { tabsForBusiness, type TabId } from "@/lib/tabs";
import { PanelCacheProvider, usePanelValue } from "@/lib/panel-cache";
import { BrandTile } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { InitiativesPanel } from "@/components/initiatives-panel";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { EventsPanel } from "@/components/events-panel";
import { OutreachPanel } from "@/components/outreach-panel";
import { BrandsPanel } from "@/components/brands-panel";
import { ResourcesPanel } from "@/components/resources-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { TeamPanel } from "@/components/team-panel";

export type WorkspaceData = {
  initiatives: Initiative[];
  todos: Todo[];
  leads: Lead[];
  events: BizEvent[];
  outreach: OutreachTarget[];
  brands: BrandContact[];
  resources: BusinessResource[];
  notes: Note[];
  chat: ChatMessage[];
  members: TeamMember[];
};

type Props = {
  business: Business;
  data: WorkspaceData;
  initialTab?: string;
  /** Deep link from search: open this record's editor on the active tab. */
  openId?: number;
  /** Deep link from the command palette: open the active tab's "new" form. */
  autoNew?: boolean;
  leadCategories?: LeadCategory[];
  leadCategoriesEnabled?: boolean;
  /** Line under the business name (the admin view passes an editable one). */
  tagline: React.ReactNode;
  /** Buttons on the right of the header. */
  actions?: React.ReactNode;
  /** Full-width strip above the header (e.g. the hidden-business notice). */
  banner?: React.ReactNode;
  /** Called when the user switches tabs (the admin view syncs the URL). */
  onTabChange?: (tab: TabId) => void;
  /** Share pages have no fixed mobile header, so their tabs stick to the very top. */
  stickyClass?: "tabs-sticky" | "tabs-sticky-top";
};

/** Tabs whose content needs the full canvas width instead of the readable column. */
const WIDE_TABS: TabId[] = ["pipeline"];

/**
 * The business page body shared by the admin view (/b/[slug]) and the team
 * share view (/s/[token]): header, tab bar with live counts, and the panels.
 */
export function BusinessWorkspace(props: Props) {
  // A new object whenever the server sends fresh props, so the panel cache
  // drops its copies and panels pick up the new data.
  const resetKey = useMemo(() => ({}), [props.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PanelCacheProvider resetKey={resetKey}>
      <Workspace {...props} />
    </PanelCacheProvider>
  );
}

function Workspace({
  business, data, initialTab, openId, autoNew, leadCategories = [], leadCategoriesEnabled = false,
  tagline, actions, banner, onTabChange, stickyClass = "tabs-sticky",
}: Props) {
  const tabs = tabsForBusiness(business.id);
  const resolve = (t?: string) => (tabs.find((x) => x.id === t)?.id ?? "initiatives") as TabId;
  const [tab, setTabState] = useState<TabId>(resolve(initialTab));
  const [members, setMembers] = useState<TeamMember[]>(data.members);

  // A deep link (search result, palette "New …") is consumed once: it applies
  // to the tab it arrived on and is dropped as soon as the user switches tabs,
  // so coming back later does not reopen the same record.
  const [link, setLink] = useState<{ openId?: number; autoNew?: boolean }>({ openId, autoNew });

  // Deep links arrive as new props while this component stays mounted
  useEffect(() => {
    setTabState(resolve(initialTab));
    setLink({ openId, autoNew });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, openId, autoNew]);

  function setTab(next: TabId) {
    setTabState(next);
    setLink({});
    onTabChange?.(next);
  }

  // Modals, toasts and the palette portal to <body>, outside this subtree, so
  // mirror the brand scope there while a business page is open.
  useEffect(() => {
    const { body } = document;
    body.classList.add("brand-scope");
    body.style.setProperty("--brand-light", business.hex);
    body.style.setProperty("--brand-dark", business.hexDark);
    return () => {
      body.classList.remove("brand-scope");
      body.style.removeProperty("--brand-light");
      body.style.removeProperty("--brand-dark");
    };
  }, [business.hex, business.hexDark]);

  // Live counts: read through the panel cache so they track edits immediately
  const todos = usePanelValue("todos", data.todos);
  const leads = usePanelValue("leads", data.leads);
  const initiatives = usePanelValue("initiatives", data.initiatives);
  const events = usePanelValue("events", data.events);
  const today = new Date().toISOString().slice(0, 10);
  const counts: Partial<Record<TabId, number>> = {
    initiatives: initiatives.filter((i) => i.status === "active" && i.horizon === "now").length,
    todos: todos.filter((t) => t.status === "open").length,
    pipeline: leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length,
    events: events.filter((e) => e.status !== "completed" && e.status !== "cancelled" && (!e.date || e.date >= today)).length,
  };

  const column = "mx-auto w-full max-w-6xl";
  const wide = WIDE_TABS.includes(tab);
  return (
    <div className="brand-scope flex min-h-full flex-col" style={brandVars(business)}>
      {banner}

      <header className="shrink-0 px-4 pt-5 sm:px-8 sm:pt-7">
        <div className={cn(column, "flex items-center gap-3.5")}>
          <BrandTile business={business} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{business.name}</h1>
            <div className="text-[13px] text-ink-3">{tagline}</div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      </header>

      {/* Tabs (sticky while the panel scrolls) */}
      <div className={cn(stickyClass, "mt-4 shrink-0 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-8")}>
        <div className={cn(column, "scrollbar-none -mb-px flex gap-0.5 overflow-x-auto")} role="tablist">
          {tabs.map((t) => {
            const active = tab === t.id;
            const count = counts[t.id];
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] font-medium transition-colors md:h-10",
                  active ? "text-ink" : "text-ink-3 hover:text-ink"
                )}
              >
                <t.Icon size={14} className={active ? "text-brand" : undefined} />
                {t.label}
                {!!count && <span className="text-[11px] tabular-nums text-ink-3">{count}</span>}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel (key remounts + animates on tab switch; data survives via the panel cache) */}
      <div key={tab} className={cn("panel-in pb-safe-10 w-full flex-1 px-4 pt-5 sm:px-8 sm:pt-6", !wide && column)}>
        {tab === "initiatives" && <InitiativesPanel businessId={business.id} initial={data.initiatives} {...link} />}
        {tab === "todos"       && <TodosPanel businessId={business.id} initial={data.todos} members={members} {...link} />}
        {tab === "pipeline"    && <PipelinePanel businessId={business.id} initial={data.leads} categories={leadCategories} categoriesEnabled={leadCategoriesEnabled} {...link} />}
        {tab === "events"      && <EventsPanel businessId={business.id} initial={data.events} {...link} />}
        {tab === "outreach"    && <OutreachPanel businessId={business.id} initial={data.outreach} openId={link.openId} />}
        {tab === "brands"      && <BrandsPanel businessId={business.id} initial={data.brands} categories={leadCategories} categoriesEnabled={leadCategoriesEnabled} {...link} />}
        {tab === "resources"   && <ResourcesPanel businessId={business.id} initial={data.resources} />}
        {tab === "notes"       && <NotesPanel businessId={business.id} initial={data.notes} {...link} />}
        {tab === "chat"        && <ChatPanel business={business} initialMessages={data.chat} />}
        {tab === "team"        && (
          <TeamPanel businessId={business.id} initialMembers={members} initialTodos={data.todos} onMembersChange={setMembers} />
        )}
      </div>
    </div>
  );
}
