"use client";

import { useState } from "react";
import type { Business } from "@/lib/businesses";
import type { Todo, Lead, Note, ChatMessage, BusinessResource, TeamMember, BrandContact } from "@/lib/types";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { ResourcesPanel } from "@/components/resources-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { TeamPanel } from "@/components/team-panel";
import { BrandsPanel } from "@/components/brands-panel";
import { ShareTokenContext } from "@/lib/share-context";

const TABS = [
  { id: "todos", label: "Todos" },
  { id: "pipeline", label: "Pipeline" },
  { id: "brands", label: "Brand Partnerships" },
  { id: "resources", label: "Resources" },
  { id: "notes", label: "Notes" },
  { id: "chat", label: "Chat" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SharedView({
  business,
  shareToken,
  initialTodos,
  initialLeads,
  initialResources,
  initialNotes,
  initialChat,
  initialMembers,
  initialBrands,
}: {
  business: Business;
  shareToken: string;
  initialTodos: Todo[];
  initialLeads: Lead[];
  initialResources: BusinessResource[];
  initialNotes: Note[];
  initialChat: ChatMessage[];
  initialMembers: TeamMember[];
  initialBrands: BrandContact[];
}) {
  const [tab, setTab] = useState<TabId>("todos");
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);

  return (
    <ShareTokenContext.Provider value={shareToken}>
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full ${business.dot}`} />
            <div className={`text-xs uppercase tracking-[0.2em] ${business.accent}`}>
              {business.fullName}
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {business.name}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{business.tagline}</p>
        </header>

        <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-900 mb-6 overflow-x-auto scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "todos" && <TodosPanel businessId={business.id} initial={initialTodos} members={members} />}
        {tab === "pipeline" && <PipelinePanel businessId={business.id} initial={initialLeads} />}
        {tab === "brands" && <BrandsPanel businessId={business.id} initial={initialBrands} />}
        {tab === "resources" && <ResourcesPanel businessId={business.id} initial={initialResources} />}
        {tab === "notes" && <NotesPanel businessId={business.id} initial={initialNotes} />}
        {tab === "chat" && <ChatPanel business={business} initialMessages={initialChat} />}
        {tab === "team" && (
          <TeamPanel
            businessId={business.id}
            initialMembers={members}
            initialTodos={initialTodos}
            onMembersChange={setMembers}
          />
        )}
      </div>
    </ShareTokenContext.Provider>
  );
}
