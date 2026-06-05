"use client";

import { useState, useRef } from "react";
import type { Business } from "@/lib/businesses";
import type { Todo, Lead, Note, ChatMessage, BusinessResource, TeamMember, BrandContact } from "@/lib/types";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { ResourcesPanel } from "@/components/resources-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { TeamPanel } from "@/components/team-panel";
import { BrandsPanel } from "@/components/brands-panel";
import { Link2, Check, Pencil } from "lucide-react";

const TABS = [
  { id: "todos",     label: "Todos" },
  { id: "pipeline",  label: "Pipeline" },
  { id: "brands",    label: "CRM" },
  { id: "resources", label: "Resources" },
  { id: "notes",     label: "Notes" },
  { id: "chat",      label: "Chat" },
  { id: "team",      label: "Team" },
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
  initialBrands,
  shareToken,
  initialTagline,
}: {
  business: Business;
  initialTab: string;
  initialTodos: Todo[];
  initialLeads: Lead[];
  initialResources: BusinessResource[];
  initialNotes: Note[];
  initialChat: ChatMessage[];
  initialMembers: TeamMember[];
  initialBrands: BrandContact[];
  shareToken: string;
  initialTagline: string;
}) {
  const [tab, setTab] = useState<TabId>(
    (TABS.find((t) => t.id === initialTab)?.id ?? "todos") as TabId
  );
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [tagline, setTagline] = useState(initialTagline);
  const [editingTagline, setEditingTagline] = useState(false);
  const [taglineDraft, setTaglineDraft] = useState(initialTagline);
  const taglineRef = useRef<HTMLInputElement>(null);

  async function saveTagline() {
    const val = taglineDraft.trim();
    if (!val || val === tagline) { setEditingTagline(false); return; }
    setTagline(val);
    setEditingTagline(false);
    await fetch(`/api/businesses/${business.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagline: val }),
    });
  }

  function copyShareLink() {
    const url = `${window.location.origin}/s/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-5 sm:p-8 lg:p-10 max-w-5xl">
      {/* ── Header ── */}
      <header className="mb-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Brand badge */}
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold mb-2.5 ${business.accentBg} ${business.accent} ring-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${business.dot}`} />
              {business.fullName}
            </div>
            {/* Name */}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">
              {business.name}
            </h1>
            {/* Tagline (editable) */}
            {editingTagline ? (
              <input
                ref={taglineRef}
                value={taglineDraft}
                onChange={(e) => setTaglineDraft(e.target.value)}
                onBlur={saveTagline}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTagline();
                  if (e.key === "Escape") { setEditingTagline(false); setTaglineDraft(tagline); }
                }}
                autoFocus
                className="text-sm text-zinc-500 bg-transparent border-b border-zinc-300 dark:border-zinc-700 outline-none w-full max-w-md"
              />
            ) : (
              <button
                onClick={() => { setTaglineDraft(tagline); setEditingTagline(true); }}
                className="group flex items-center gap-1.5 text-left"
              >
                <p className="text-sm text-zinc-500">{tagline}</p>
                <Pencil size={11} className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
          </div>

          {/* Share button */}
          <button
            onClick={copyShareLink}
            className="shrink-0 mt-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Link2 size={12} />}
            <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
          </button>
        </div>
      </header>

      {/* ── Pill tabs ── */}
      <div className="flex items-center gap-1.5 mb-7 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab panels ── */}
      {tab === "todos"     && <TodosPanel businessId={business.id} initial={initialTodos} members={members} />}
      {tab === "pipeline"  && <PipelinePanel businessId={business.id} initial={initialLeads} />}
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
  );
}
