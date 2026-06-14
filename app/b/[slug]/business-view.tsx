"use client";

import { useState, useRef } from "react";
import type { Business } from "@/lib/businesses";
import type { Todo, Lead, LeadCategory, Note, ChatMessage, BusinessResource, TeamMember, BrandContact, OutreachTarget } from "@/lib/types";
import { TodosPanel } from "@/components/todos-panel";
import { PipelinePanel } from "@/components/pipeline-panel";
import { ResourcesPanel } from "@/components/resources-panel";
import { NotesPanel } from "@/components/notes-panel";
import { ChatPanel } from "@/components/chat-panel";
import { TeamPanel } from "@/components/team-panel";
import { BrandsPanel } from "@/components/brands-panel";
import { OutreachPanel } from "@/components/outreach-panel";
import { Link2, Check, Pencil, Send } from "lucide-react";
import { OUTREACH_BUSINESS_IDS } from "@/lib/outreach-config";

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

/** Outreach is only enabled for businesses with an outreach config (FLAIR + MTRNM). */
function tabsForBusiness(businessId: string) {
  return TABS.filter((t) => t.id !== "outreach" || OUTREACH_BUSINESS_IDS.includes(businessId));
}

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
  initialOutreach,
  shareToken,
  initialTagline,
  leadCategories,
  leadCategoriesEnabled,
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
  initialOutreach: OutreachTarget[];
  shareToken: string;
  initialTagline: string;
  leadCategories: LeadCategory[];
  leadCategoriesEnabled: boolean;
}) {
  const tabs = tabsForBusiness(business.id);
  const [tab, setTabState] = useState<TabId>(
    (tabs.find((t) => t.id === initialTab)?.id ?? "todos") as TabId
  );

  // Keep ?tab= in the URL so refresh/back keeps the active tab
  function setTab(next: TabId) {
    setTabState(next);
    window.history.replaceState(null, "", `/b/${business.id}?tab=${next}`);
  }
  const [copied, setCopied] = useState(false);
  const [copiedOutreach, setCopiedOutreach] = useState(false);
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

  function copyOutreachShareLink() {
    const url = `${window.location.origin}/s/${shareToken}/outreach`;
    navigator.clipboard.writeText(url);
    setCopiedOutreach(true);
    setTimeout(() => setCopiedOutreach(false), 2000);
  }

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Header — white background, brand identity carried by pill + name color + dot ── */}
      <header className="w-full shrink-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        <div className="px-4 sm:px-8 lg:px-10 pt-5 pb-5 sm:pt-7 sm:pb-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Brand badge */}
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold mb-2.5 ${business.accentBg} ${business.accent} ring-1`}>
                <span className={`w-1.5 h-1.5 rounded-full ${business.dot}`} />
                <span className="truncate max-w-[180px] sm:max-w-none">{business.fullName}</span>
              </div>
              {/* Name — brand colored */}
              <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight mb-1 ${business.accent}`}>
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
                  className="text-sm text-zinc-500 bg-transparent border-b border-zinc-300 dark:border-zinc-700 outline-none w-full max-w-sm sm:max-w-md"
                />
              ) : (
                <button
                  onClick={() => { setTaglineDraft(tagline); setEditingTagline(true); }}
                  className="group flex items-center gap-1.5 text-left"
                >
                  <p className="text-sm text-zinc-500 leading-snug">{tagline}</p>
                  <Pencil size={11} className="text-zinc-400 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}
            </div>

            {/* Share buttons */}
            <div className="shrink-0 flex items-center gap-1.5">
              {OUTREACH_BUSINESS_IDS.includes(business.id) && (
                <button
                  onClick={copyOutreachShareLink}
                  title="Copy a link to just the Outreach tab (same team password)"
                  className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-900 backdrop-blur-sm transition-colors"
                >
                  {copiedOutreach ? <Check size={12} className="text-emerald-600" /> : <Send size={12} />}
                  <span className="hidden sm:inline">{copiedOutreach ? "Copied!" : "Share Outreach"}</span>
                </button>
              )}
              <button
                onClick={copyShareLink}
                title="Copy the full team share link"
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-900 backdrop-blur-sm transition-colors"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Link2 size={12} />}
                <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tabs (sticky while scrolling panels) ── */}
      <div className="tabs-sticky w-full px-4 sm:px-8 lg:px-10 pt-3 pb-2 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.id
                  ? `${business.tabActive} shadow-sm`
                  : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab panels ── */}
      <div className="w-full px-4 sm:px-8 lg:px-10 pt-5 pb-10 safe-bottom flex-1">
        {tab === "todos"     && <TodosPanel businessId={business.id} initial={initialTodos} members={members} />}
        {tab === "pipeline"  && <PipelinePanel businessId={business.id} initial={initialLeads} categories={leadCategories} categoriesEnabled={leadCategoriesEnabled} />}
        {tab === "outreach"  && <OutreachPanel businessId={business.id} initial={initialOutreach} />}
        {tab === "brands"    && <BrandsPanel businessId={business.id} initial={initialBrands} categories={leadCategories} categoriesEnabled={leadCategoriesEnabled} />}
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
  );
}
