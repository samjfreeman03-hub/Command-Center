"use client";

import { useState } from "react";
import type { Business } from "@/lib/businesses";
import type { Todo, Lead, Note, ChatMessage, BusinessResource, TeamMember, BrandContact, OutreachTarget } from "@/lib/types";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { ResourcesPanel } from "@/components/resources-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { TeamPanel } from "@/components/team-panel";
import { BrandsPanel } from "@/components/brands-panel";
import { OutreachPanel } from "@/components/outreach-panel";
import { ShareTokenContext } from "@/lib/share-context";

const TABS = [
  { id: "todos",     label: "Todos" },
  { id: "pipeline",  label: "Pipeline" },
  { id: "outreach",  label: "Outreach" },
  { id: "brands",    label: "CRM" },
  { id: "resources", label: "Resources" },
  { id: "notes",     label: "Notes" },
  { id: "chat",      label: "Chat" },
  { id: "team",      label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SharedView({
  business,
  shareToken,
  tagline,
  initialTodos,
  initialLeads,
  initialResources,
  initialNotes,
  initialChat,
  initialMembers,
  initialBrands,
  initialOutreach,
}: {
  business: Business;
  shareToken: string;
  tagline: string;
  initialTodos: Todo[];
  initialLeads: Lead[];
  initialResources: BusinessResource[];
  initialNotes: Note[];
  initialChat: ChatMessage[];
  initialMembers: TeamMember[];
  initialBrands: BrandContact[];
  initialOutreach: OutreachTarget[];
}) {
  const [tab, setTab] = useState<TabId>("todos");
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);

  return (
    <ShareTokenContext.Provider value={shareToken}>
      <div className="flex flex-col min-h-screen">

        {/* Header — clean white background (no brand tint) for shared/team use */}
        <header className="w-full shrink-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
          <div className="px-4 sm:px-8 lg:px-10 pt-7 pb-7">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold mb-2.5 ${business.accentBg} ${business.accent} ring-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${business.dot}`} />
              <span className="truncate max-w-[180px] sm:max-w-none">{business.fullName}</span>
            </div>
            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight mb-1 ${business.accent}`}>
              {business.name}
            </h1>
            <p className="text-sm text-zinc-500 leading-snug">{tagline}</p>
          </div>
        </header>

        {/* Tabs */}
        <div className="w-full px-4 sm:px-8 lg:px-10 pt-5 pb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? `${business.tabActive} shadow-sm`
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panels */}
        <div className="w-full px-4 sm:px-8 lg:px-10 pt-5 pb-10 safe-bottom flex-1">
          {tab === "todos"     && <TodosPanel businessId={business.id} initial={initialTodos} members={members} />}
          {tab === "pipeline"  && <PipelinePanel businessId={business.id} initial={initialLeads} />}
          {tab === "outreach"  && <OutreachPanel businessId={business.id} initial={initialOutreach} />}
          {tab === "brands"    && <BrandsPanel businessId={business.id} initial={initialBrands} />}
          {tab === "resources" && <ResourcesPanel businessId={business.id} initial={initialResources} />}
          {tab === "notes"     && <NotesPanel businessId={business.id} initial={initialNotes} />}
          {tab === "chat"      && <ChatPanel business={business} initialMessages={initialChat} />}
          {tab === "team"      && (
            <TeamPanel
              businessId={business.id}
              initialMembers={members}
              initialTodos={initialTodos}
              onMembersChange={setMembers}
            />
          )}
        </div>
      </div>
    </ShareTokenContext.Provider>
  );
}
