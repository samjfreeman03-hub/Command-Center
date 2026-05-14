"use client";

import { useState } from "react";
import type { Business } from "@/lib/businesses";
import type { Todo, Lead, Note, ChatMessage } from "@/lib/types";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { ShareTokenContext } from "@/lib/share-context";

const TABS = [
  { id: "todos", label: "Todos" },
  { id: "pipeline", label: "Pipeline" },
  { id: "notes", label: "Notes" },
  { id: "chat", label: "Chat" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SharedView({
  business,
  shareToken,
  initialTodos,
  initialLeads,
  initialNotes,
  initialChat,
}: {
  business: Business;
  shareToken: string;
  initialTodos: Todo[];
  initialLeads: Lead[];
  initialNotes: Note[];
  initialChat: ChatMessage[];
}) {
  const [tab, setTab] = useState<TabId>("todos");

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

        <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-900 mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "todos" && <TodosPanel businessId={business.id} initial={initialTodos} />}
        {tab === "pipeline" && <PipelinePanel businessId={business.id} initial={initialLeads} />}
        {tab === "notes" && <NotesPanel businessId={business.id} initial={initialNotes} />}
        {tab === "chat" && <ChatPanel business={business} initialMessages={initialChat} />}
      </div>
    </ShareTokenContext.Provider>
  );
}
