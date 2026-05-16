"use client";

import { useState } from "react";
import type { Business } from "@/lib/businesses";
import type { Todo, Lead, Note, ChatMessage, BusinessResource, TeamMember } from "@/lib/types";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { ResourcesPanel } from "@/components/resources-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { TeamPanel } from "@/components/team-panel";
import { Link2, Check } from "lucide-react";

const TABS = [
  { id: "todos", label: "Todos" },
  { id: "pipeline", label: "Pipeline" },
  { id: "resources", label: "Resources" },
  { id: "notes", label: "Notes" },
  { id: "chat", label: "Chat" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function BusinessView({
  business,
  initialTab,
  initialTodos,
  initialLeads,
  initialResources,
  initialNotes,
  initialChat,
  initialMembers,
  shareToken,
}: {
  business: Business;
  initialTab: string;
  initialTodos: Todo[];
  initialLeads: Lead[];
  initialResources: BusinessResource[];
  initialNotes: Note[];
  initialChat: ChatMessage[];
  initialMembers: TeamMember[];
  shareToken: string;
}) {
  const [tab, setTab] = useState<TabId>(
    (TABS.find((t) => t.id === initialTab)?.id ?? "todos") as TabId
  );
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);

  function copyShareLink() {
    const url = `${window.location.origin}/s/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2.5 h-2.5 rounded-full ${business.dot}`} />
          <div className={`text-xs uppercase tracking-[0.2em] ${business.accent}`}>
            {business.fullName}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{business.name}</h1>
            <p className="text-sm text-zinc-500 mt-1">{business.tagline}</p>
          </div>
          <button
            onClick={copyShareLink}
            className="shrink-0 mt-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Link2 size={12} />}
            <span className="hidden sm:inline">{copied ? "Copied!" : "Share page"}</span>
          </button>
        </div>
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
  );
}
