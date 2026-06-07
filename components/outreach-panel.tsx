"use client";

import { useState } from "react";
import type { OutreachTarget, OutreachStatus, OutreachDrafts, OutreachSignals } from "@/lib/types";
import { OUTREACH_STATUSES } from "@/lib/types";
import {
  Plus, Sparkles, Copy, Check, ExternalLink, Trash2, Loader2, Clock, Send, RotateCcw, Search, Wand2,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";

const EMPTY_FORM = {
  brand_name: "",
  brand_category: "",
  brand_size: "" as "" | "enterprise" | "midsize" | "emerging",
  person_name: "",
  person_title: "",
  linkedin_url: "",
  notes: "",
};

const CATEGORY_SUGGESTIONS = [
  "beauty", "wellness", "lifestyle", "fashion", "apparel",
  "CPG", "beverage", "EdTech", "DTC-genz", "enterprise",
];

type ViewMode = "today" | "all";

type Candidate = {
  brand_name: string;
  category: string;
  size: "enterprise" | "midsize" | "emerging";
  why_fit: string;
  decision_maker_titles: string[];
  seasonality_hook: string;
};

export function OutreachPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: OutreachTarget[];
}) {
  const [view, setView] = useState<ViewMode>("today");
  const [targets, setTargets] = useState<OutreachTarget[]>(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState<OutreachStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draftingId, setDraftingId] = useState<number | null>(null);
  const [enrichingId, setEnrichingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [followupDrafts, setFollowupDrafts] = useState<Record<number, { followup_n: number; text: string; reasoning?: string }>>({});
  const [followupSender, setFollowupSender] = useState<"Sam" | "Tyler">("Sam");
  const [showCandidates, setShowCandidates] = useState(false);
  const [candidatesForm, setCandidatesForm] = useState({ category: "", size: "" as "" | "enterprise" | "midsize" | "emerging", count: 15, focus: "" });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [generatingCandidates, setGeneratingCandidates] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const shareHeaders = useShareHeaders();

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, val: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand_name.trim() || !form.person_name.trim()) return;
    const res = await fetch("/api/outreach", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({
        business_id: businessId,
        ...form,
        brand_size: form.brand_size || undefined,
      }),
    });
    if (res.ok) {
      const created: OutreachTarget = await res.json();
      setTargets((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      setExpandedId(created.id);
    }
  }

  async function draft(target: OutreachTarget) {
    setDraftingId(target.id);
    try {
      const res = await fetch(`/api/outreach/${target.id}/draft`, {
        method: "POST",
        headers: shareHeaders,
      });
      if (res.ok) {
        const data: { target: OutreachTarget } = await res.json();
        setTargets((prev) => prev.map((t) => (t.id === target.id ? data.target : t)));
        setExpandedId(target.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Draft failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setDraftingId(null);
    }
  }

  async function enrich(target: OutreachTarget) {
    setEnrichingId(target.id);
    try {
      const res = await fetch(`/api/outreach/${target.id}/enrich`, {
        method: "POST",
        headers: shareHeaders,
      });
      if (res.ok) {
        const data: { target: OutreachTarget } = await res.json();
        setTargets((prev) => prev.map((t) => (t.id === target.id ? data.target : t)));
        setExpandedId(target.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Enrich failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setEnrichingId(null);
    }
  }

  async function generateFollowup(target: OutreachTarget) {
    setDraftingId(target.id);
    try {
      const res = await fetch(`/api/outreach/${target.id}/follow-up`, {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ sender: followupSender }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowupDrafts((prev) => ({ ...prev, [target.id]: data }));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Follow-up draft failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setDraftingId(null);
    }
  }

  async function markSent(target: OutreachTarget, template: "A" | "B") {
    const drafts: OutreachDrafts | null = target.drafts_json ? JSON.parse(target.drafts_json) : null;
    if (!drafts) return;
    const text = template === "A" ? drafts.templateA.firstDM : drafts.templateB.firstDM;
    const res = await fetch(`/api/outreach/${target.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ action: "mark-sent", text, template }),
    });
    if (res.ok) {
      const updated: OutreachTarget = await res.json();
      setTargets((prev) => prev.map((t) => (t.id === target.id ? updated : t)));
    }
  }

  async function markFollowupSent(target: OutreachTarget, text: string) {
    const res = await fetch(`/api/outreach/${target.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ action: "mark-followup-sent", text }),
    });
    if (res.ok) {
      const updated: OutreachTarget = await res.json();
      setTargets((prev) => prev.map((t) => (t.id === target.id ? updated : t)));
      setFollowupDrafts((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
    }
  }

  async function markReplied(id: number) {
    const res = await fetch(`/api/outreach/${id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ action: "mark-replied" }),
    });
    if (res.ok) {
      const updated: OutreachTarget = await res.json();
      setTargets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

  async function markStatusGeneric(id: number, status: OutreachStatus) {
    const res = await fetch(`/api/outreach/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: OutreachTarget = await res.json();
      setTargets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

  async function resetCadence(id: number) {
    if (!confirm("Reset this target's cadence? It'll go back to queued.")) return;
    const res = await fetch(`/api/outreach/${id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ action: "reset-cadence" }),
    });
    if (res.ok) {
      const updated: OutreachTarget = await res.json();
      setTargets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

  async function generateCandidates(e: React.FormEvent) {
    e.preventDefault();
    setGeneratingCandidates(true);
    setSelectedCandidates(new Set());
    try {
      const res = await fetch("/api/outreach/candidates", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({
          business_id: businessId,
          ...candidatesForm,
          size: candidatesForm.size || undefined,
        }),
      });
      if (res.ok) {
        const data: { candidates: Candidate[] } = await res.json();
        setCandidates(data.candidates ?? []);
        setSelectedCandidates(new Set(data.candidates.map((_, i) => i)));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Generate failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setGeneratingCandidates(false);
    }
  }

  async function addSelectedCandidates() {
    if (selectedCandidates.size === 0) return;
    setBulkAdding(true);
    try {
      const newTargets: OutreachTarget[] = [];
      for (const idx of Array.from(selectedCandidates).sort((a, b) => a - b)) {
        const c = candidates[idx];
        if (!c) continue;
        const res = await fetch("/api/outreach", {
          method: "POST",
          headers: { "content-type": "application/json", ...shareHeaders },
          body: JSON.stringify({
            business_id: businessId,
            brand_name: c.brand_name,
            brand_category: c.category,
            brand_size: c.size,
            person_name: "(to research)",
            person_title: c.decision_maker_titles?.[0] ?? null,
            source: "auto-generated",
            notes: `${c.why_fit}\n\nBack-to-school hook: ${c.seasonality_hook}\nDecision-maker targets: ${c.decision_maker_titles?.join(", ")}`,
          }),
        });
        if (res.ok) newTargets.push(await res.json());
      }
      setTargets((prev) => [...newTargets, ...prev]);
      setCandidates([]);
      setSelectedCandidates(new Set());
      setShowCandidates(false);
    } finally {
      setBulkAdding(false);
    }
  }

  function toggleCandidate(idx: number) {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function remove(id: number) {
    if (!confirm("Delete this outreach target?")) return;
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setExpandedId(null);
    await fetch(`/api/outreach/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // Daily queue computation (client-side mirror of server logic)
  const now = Date.now();
  const newTargets = targets
    .filter((t) => (t.status === "queued" || t.status === "drafted") && !t.sent_at)
    .sort((a, b) => a.created_at - b.created_at)
    .slice(0, 10);
  const followupsDue = targets
    .filter(
      (t) =>
        t.status === "sent" &&
        t.next_followup_at !== null &&
        t.next_followup_at <= now &&
        t.followup_count < 3
    )
    .sort((a, b) => (a.next_followup_at ?? 0) - (b.next_followup_at ?? 0));

  const filtered = filter === "all" ? targets : targets.filter((t) => t.status === filter);
  const counts = Object.fromEntries(
    OUTREACH_STATUSES.map((s) => [s.value, targets.filter((t) => t.status === s.value).length])
  );

  return (
    <div className="space-y-5">
      {/* View toggle + Add */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0.5">
          <ViewBtn active={view === "today"} onClick={() => setView("today")}>
            Today {newTargets.length + followupsDue.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300">
                {newTargets.length + followupsDue.length}
              </span>
            )}
          </ViewBtn>
          <ViewBtn active={view === "all"} onClick={() => setView("all")}>
            All targets <span className="ml-1.5 opacity-50 text-xs">{targets.length}</span>
          </ViewBtn>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowCandidates((v) => !v); setShowAdd(false); }}
            className="text-sm font-medium px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5"
          >
            <Wand2 size={14} />
            Suggest brands
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setShowCandidates(false); }}
            className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            Add target
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && <AddTargetForm form={form} setField={setField} onSubmit={add} onCancel={() => { setShowAdd(false); setForm(EMPTY_FORM); }} />}

      {/* Candidate generator */}
      {showCandidates && (
        <CandidateGenerator
          form={candidatesForm}
          setForm={setCandidatesForm}
          onGenerate={generateCandidates}
          generating={generatingCandidates}
          candidates={candidates}
          selected={selectedCandidates}
          onToggleCandidate={toggleCandidate}
          onAddSelected={addSelectedCandidates}
          bulkAdding={bulkAdding}
          onCancel={() => { setShowCandidates(false); setCandidates([]); setSelectedCandidates(new Set()); }}
        />
      )}

      {/* TODAY view */}
      {view === "today" && (
        <div className="space-y-6">
          {newTargets.length === 0 && followupsDue.length === 0 && (
            <div className="text-center py-16 text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
              <div className="text-2xl mb-2">🎯</div>
              <p>Nothing in today's queue.</p>
              <p className="mt-1 opacity-75">Add a target to start, or switch to All targets.</p>
            </div>
          )}

          {newTargets.length > 0 && (
            <section className="space-y-2">
              <SectionHeader
                title="To send today"
                count={newTargets.length}
                hint="Generate drafts, copy, send on LinkedIn, then mark sent."
              />
              {newTargets.map((t) => (
                <TargetCard
                  key={t.id}
                  target={t}
                  expanded={expandedId === t.id}
                  drafting={draftingId === t.id}
                  enriching={enrichingId === t.id}
                  copiedKey={copiedKey}
                  onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  onDraft={() => draft(t)}
                  onEnrich={() => enrich(t)}
                  onMarkSent={(template) => markSent(t, template)}
                  onMarkReplied={() => markReplied(t.id)}
                  onMarkStatus={(s) => markStatusGeneric(t.id, s)}
                  onCopy={copy}
                  onDelete={() => remove(t.id)}
                />
              ))}
            </section>
          )}

          {followupsDue.length > 0 && (
            <section className="space-y-2">
              <SectionHeader
                title="Follow-ups due"
                count={followupsDue.length}
                hint="Day 3 / 7 / 14 cadence — generate a bump and send."
                rightSlot={
                  <div className="inline-flex items-center gap-1 text-xs text-zinc-500">
                    <span>Sign as:</span>
                    <select
                      value={followupSender}
                      onChange={(e) => setFollowupSender(e.target.value as "Sam" | "Tyler")}
                      className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                    >
                      <option value="Sam">Sam</option>
                      <option value="Tyler">Tyler</option>
                    </select>
                  </div>
                }
              />
              {followupsDue.map((t) => (
                <FollowupCard
                  key={t.id}
                  target={t}
                  drafting={draftingId === t.id}
                  draft={followupDrafts[t.id]}
                  copiedKey={copiedKey}
                  onGenerate={() => generateFollowup(t)}
                  onMarkSent={(text) => markFollowupSent(t, text)}
                  onMarkReplied={() => markReplied(t.id)}
                  onMarkStatus={(s) => markStatusGeneric(t.id, s)}
                  onCopy={copy}
                  onResetCadence={() => resetCadence(t.id)}
                />
              ))}
            </section>
          )}
        </div>
      )}

      {/* ALL view */}
      {view === "all" && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="opacity-50">{targets.length}</span>
            </FilterChip>
            {OUTREACH_STATUSES.map((s) => (
              <FilterChip
                key={s.value}
                active={filter === s.value}
                onClick={() => setFilter(s.value)}
              >
                {s.label} <span className="opacity-50">{counts[s.value] ?? 0}</span>
              </FilterChip>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">
              {targets.length === 0 ? "No outreach targets yet. Add one to get started." : "No targets match this filter."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((t) => (
                <TargetCard
                  key={t.id}
                  target={t}
                  expanded={expandedId === t.id}
                  drafting={draftingId === t.id}
                  enriching={enrichingId === t.id}
                  copiedKey={copiedKey}
                  onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  onDraft={() => draft(t)}
                  onEnrich={() => enrich(t)}
                  onMarkSent={(template) => markSent(t, template)}
                  onMarkReplied={() => markReplied(t.id)}
                  onMarkStatus={(s) => markStatusGeneric(t.id, s)}
                  onCopy={copy}
                  onDelete={() => remove(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function SectionHeader({
  title, count, hint, rightSlot,
}: { title: string; count: number; hint?: string; rightSlot?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-1">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
          <span className="ml-2 text-xs font-normal text-zinc-400">{count}</span>
        </h3>
        {hint && <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>}
      </div>
      {rightSlot}
    </div>
  );
}

function ViewBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors inline-flex items-center ${
        active
          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

function AddTargetForm({
  form, setField, onSubmit, onCancel,
}: {
  form: typeof EMPTY_FORM;
  setField: <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-50 dark:bg-zinc-900/50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Brand name *" value={form.brand_name} onChange={(v) => setField("brand_name", v)} placeholder="Bubble" />
        <Input label="Person name *" value={form.person_name} onChange={(v) => setField("person_name", v)} placeholder="Shai Eisenman" />
        <Input label="Person title" value={form.person_title} onChange={(v) => setField("person_title", v)} placeholder="Founder & CEO" />
        <Input label="LinkedIn URL" value={form.linkedin_url} onChange={(v) => setField("linkedin_url", v)} placeholder="https://linkedin.com/in/…" />
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Category</label>
          <input
            list="category-list"
            value={form.brand_category}
            onChange={(e) => setField("brand_category", e.target.value)}
            placeholder="beauty"
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          />
          <datalist id="category-list">
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Size</label>
          <select
            value={form.brand_size}
            onChange={(e) => setField("brand_size", e.target.value as typeof form.brand_size)}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          >
            <option value="">—</option>
            <option value="enterprise">Enterprise</option>
            <option value="midsize">Midsize</option>
            <option value="emerging">Emerging</option>
          </select>
        </div>
      </div>
      <textarea
        value={form.notes}
        onChange={(e) => setField("notes", e.target.value)}
        placeholder="Notes (optional) — anything the drafter should know"
        rows={2}
        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
      />
      <div className="flex items-center gap-2">
        <button type="submit" className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md">
          Add
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-zinc-500 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CandidateGenerator({
  form, setForm, onGenerate, generating, candidates, selected, onToggleCandidate, onAddSelected, bulkAdding, onCancel,
}: {
  form: { category: string; size: "" | "enterprise" | "midsize" | "emerging"; count: number; focus: string };
  setForm: React.Dispatch<React.SetStateAction<{ category: string; size: "" | "enterprise" | "midsize" | "emerging"; count: number; focus: string }>>;
  onGenerate: (e: React.FormEvent) => void;
  generating: boolean;
  candidates: Candidate[];
  selected: Set<number>;
  onToggleCandidate: (idx: number) => void;
  onAddSelected: () => void;
  bulkAdding: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="border border-violet-200 dark:border-violet-900/40 rounded-lg p-4 space-y-3 bg-violet-50/40 dark:bg-violet-950/10">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
        <Wand2 size={14} /> Suggest brand candidates
      </div>
      <form onSubmit={onGenerate} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Category</label>
            <input
              list="category-list"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="any"
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Size</label>
            <select
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value as typeof form.size }))}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <option value="">Any</option>
              <option value="enterprise">Enterprise</option>
              <option value="midsize">Midsize</option>
              <option value="emerging">Emerging</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Count</label>
            <input
              type="number"
              min={5}
              max={30}
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs text-zinc-500 mb-1 block">Extra focus (optional)</label>
            <input
              value={form.focus}
              onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))}
              placeholder="e.g. clean beauty, athleisure"
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {candidates.length > 0 ? "Regenerate" : "Generate candidates"}
          </button>
          <button type="button" onClick={onCancel} className="text-sm text-zinc-500 px-3 py-1.5">
            Close
          </button>
        </div>
      </form>

      {candidates.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-violet-200 dark:border-violet-900/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{selected.size}</span> of {candidates.length} selected
            </div>
            <button
              onClick={onAddSelected}
              disabled={selected.size === 0 || bulkAdding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add {selected.size} as targets
            </button>
          </div>
          <div className="space-y-1.5">
            {candidates.map((c, idx) => {
              const checked = selected.has(idx);
              return (
                <label
                  key={idx}
                  className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    checked
                      ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCandidate(idx)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{c.brand_name}</span>
                      <span className="text-xs text-zinc-500">{c.category}</span>
                      <span className="text-xs text-zinc-400">· {c.size}</span>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{c.why_fit}</div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-baseline gap-2 flex-wrap">
                      <span className="opacity-75">Targets:</span>
                      {(c.decision_maker_titles ?? []).map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]">{t}</span>
                      ))}
                    </div>
                    {c.seasonality_hook && (
                      <div className="text-xs text-zinc-500 mt-1 italic">Hook: {c.seasonality_hook}</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Input({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
      />
    </div>
  );
}

function TargetCard({
  target, expanded, drafting, enriching, copiedKey, onToggle, onDraft, onEnrich, onMarkSent, onMarkReplied, onMarkStatus, onCopy, onDelete,
}: {
  target: OutreachTarget;
  expanded: boolean;
  drafting: boolean;
  enriching: boolean;
  copiedKey: string | null;
  onToggle: () => void;
  onDraft: () => void;
  onEnrich: () => void;
  onMarkSent: (template: "A" | "B") => void;
  onMarkReplied: () => void;
  onMarkStatus: (s: OutreachStatus) => void;
  onCopy: (text: string, key: string) => void;
  onDelete: () => void;
}) {
  const status = OUTREACH_STATUSES.find((s) => s.value === target.status);
  const drafts: OutreachDrafts | null = target.drafts_json ? JSON.parse(target.drafts_json) : null;
  const signals: OutreachSignals | null = target.signals_json ? JSON.parse(target.signals_json) : null;

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{target.brand_name}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
              {target.person_name}{target.person_title ? ` — ${target.person_title}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
            {status && (
              <span className={`px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
            )}
            {target.brand_category && <span>{target.brand_category}</span>}
            {target.brand_size && <span className="opacity-75">· {target.brand_size}</span>}
            {signals && signals.signals.length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Search size={9} /> {signals.signals.length} signal{signals.signals.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </button>
        {target.linkedin_url && (
          <a
            href={target.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Open LinkedIn"
          >
            <ExternalLink size={14} />
          </a>
        )}
        <button
          onClick={onEnrich}
          disabled={enriching || drafting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          title={signals ? "Refresh signals" : "Search web for brand signals"}
        >
          {enriching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {signals ? "Refresh" : "Enrich"}
        </button>
        <button
          onClick={onDraft}
          disabled={drafting || enriching}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {drafts ? "Redraft" : "Draft"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-950/30">
          {signals && (
            <details className="text-xs" open={!drafts}>
              <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium">
                Signals ({signals.signals.length})
                <span className="ml-2 font-normal opacity-60">
                  fetched {new Date(signals.fetched_at).toLocaleDateString()}
                </span>
              </summary>
              <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-emerald-200 dark:border-emerald-900/40">
                {signals.signals.length === 0 ? (
                  <p className="text-zinc-500 italic">No recent public signals found.</p>
                ) : (
                  signals.signals.map((s, i) => (
                    <div key={i}>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 mr-2">
                        {s.type}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300">{s.summary}</span>
                      {s.source && (
                        <a href={s.source} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 inline-flex items-baseline">
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  ))
                )}
                {signals.summary_for_drafter && signals.signals.length > 0 && (
                  <p className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-900/40 italic text-zinc-500">
                    Drafter hook: {signals.summary_for_drafter}
                  </p>
                )}
              </div>
            </details>
          )}
          {!drafts && (
            <div className="text-sm text-zinc-500">
              No drafts yet — {signals ? "" : "click "}
              {!signals && <><span className="inline-flex items-center gap-1 font-medium"><Search size={11} /> Enrich</span> to ground in real signals (optional), then </>}
              click <span className="inline-flex items-center gap-1 font-medium"><Sparkles size={11} /> Draft</span> to generate Template A + B.
            </div>
          )}
          {drafts && (
            <>
              <DraftBlock
                label="Template A — Identity + proof (Sam-style)"
                connectionNote={drafts.templateA.connectionNote}
                firstDM={drafts.templateA.firstDM}
                keyPrefix={`a-${target.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
                onMarkSent={target.status !== "sent" && target.status !== "replied" ? () => onMarkSent("A") : undefined}
              />
              <DraftBlock
                label="Template B — Specific question (Tyler-style)"
                connectionNote={drafts.templateB.connectionNote}
                firstDM={drafts.templateB.firstDM}
                keyPrefix={`b-${target.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
                onMarkSent={target.status !== "sent" && target.status !== "replied" ? () => onMarkSent("B") : undefined}
              />
              {drafts.reasoning && (
                <p className="text-xs text-zinc-500 italic">Why: {drafts.reasoning}</p>
              )}
            </>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 flex-wrap">
            <span className="text-xs text-zinc-500 mr-1">Status:</span>
            <StatusButton onClick={onMarkReplied} disabled={target.status === "replied"}>Replied</StatusButton>
            <StatusButton onClick={() => onMarkStatus("declined")} disabled={target.status === "declined"}>Declined</StatusButton>
            <StatusButton onClick={() => onMarkStatus("dead")} disabled={target.status === "dead"}>Dead</StatusButton>
            <button
              onClick={onDelete}
              className="ml-auto text-zinc-400 hover:text-rose-600 p-1 rounded"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowupCard({
  target, drafting, draft, copiedKey, onGenerate, onMarkSent, onMarkReplied, onMarkStatus, onCopy, onResetCadence,
}: {
  target: OutreachTarget;
  drafting: boolean;
  draft?: { followup_n: number; text: string; reasoning?: string };
  copiedKey: string | null;
  onGenerate: () => void;
  onMarkSent: (text: string) => void;
  onMarkReplied: () => void;
  onMarkStatus: (s: OutreachStatus) => void;
  onCopy: (text: string, key: string) => void;
  onResetCadence: () => void;
}) {
  const [edited, setEdited] = useState<string | null>(null);
  const history = target.sent_history_json ? JSON.parse(target.sent_history_json) : [];
  const nextN = target.followup_count + 1;
  const daysSinceSent = target.sent_at ? Math.floor((Date.now() - target.sent_at) / 86400_000) : 0;
  const text = edited ?? draft?.text ?? "";
  const copyKey = `fu-${target.id}`;

  return (
    <div className="border border-amber-200 dark:border-amber-900/40 rounded-lg bg-amber-50/30 dark:bg-amber-950/10 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-amber-100 dark:border-amber-900/30">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{target.brand_name}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
              {target.person_name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
              <Clock size={10} /> Follow-up #{nextN} due
            </span>
            <span>Day {daysSinceSent} since first send</span>
          </div>
        </div>
        {target.linkedin_url && (
          <a
            href={target.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Open LinkedIn"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Prior sends summary */}
        {history.length > 0 && (
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">
              Prior sends ({history.length})
            </summary>
            <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-zinc-200 dark:border-zinc-800">
              {history.map((h: { at: number; follow_up_n: number; text: string; template?: string }, i: number) => (
                <div key={i} className="text-xs">
                  <div className="font-medium text-zinc-600 dark:text-zinc-400">
                    {h.follow_up_n === 0 ? `First send${h.template ? ` (Template ${h.template})` : ""}` : `Follow-up #${h.follow_up_n}`}
                    <span className="ml-2 opacity-60 font-normal">{new Date(h.at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-zinc-500 italic truncate">{h.text.split("\n")[0]}</div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Draft area */}
        {!draft && (
          <button
            onClick={onGenerate}
            disabled={drafting}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generate follow-up #{nextN}
          </button>
        )}

        {draft && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Follow-up #{draft.followup_n} draft ({text.length} chars)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onCopy(text, copyKey)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {copiedKey === copyKey ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                  {copiedKey === copyKey ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setEdited(e.target.value)}
              rows={Math.max(3, Math.ceil(text.length / 70))}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-800 dark:text-zinc-200"
            />
            {draft.reasoning && (
              <p className="text-xs text-zinc-500 italic">Angle: {draft.reasoning}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onMarkSent(text)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Send size={12} /> Mark follow-up sent
              </button>
              <button
                onClick={onGenerate}
                disabled={drafting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md"
              >
                {drafting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                Regenerate
              </button>
            </div>
          </div>
        )}

        {/* Status actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-amber-100 dark:border-amber-900/30 flex-wrap">
          <span className="text-xs text-zinc-500 mr-1">Or:</span>
          <StatusButton onClick={onMarkReplied}>Mark replied</StatusButton>
          <StatusButton onClick={() => onMarkStatus("declined")}>Declined</StatusButton>
          <StatusButton onClick={() => onMarkStatus("dead")}>Dead</StatusButton>
          <button
            onClick={onResetCadence}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            title="Reset cadence — back to queued"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftBlock({
  label, connectionNote, firstDM, keyPrefix, copiedKey, onCopy, onMarkSent,
}: {
  label: string;
  connectionNote: string;
  firstDM: string;
  keyPrefix: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  onMarkSent?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</div>
        {onMarkSent && (
          <button
            onClick={onMarkSent}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Send size={10} /> Sent this
          </button>
        )}
      </div>
      <DraftLine
        sublabel={`Connection note (${connectionNote.length}/300)`}
        text={connectionNote}
        keyId={`${keyPrefix}-note`}
        copiedKey={copiedKey}
        onCopy={onCopy}
      />
      <DraftLine
        sublabel={`First DM (${firstDM.length}/600)`}
        text={firstDM}
        keyId={`${keyPrefix}-dm`}
        copiedKey={copiedKey}
        onCopy={onCopy}
      />
    </div>
  );
}

function DraftLine({
  sublabel, text, keyId, copiedKey, onCopy,
}: {
  sublabel: string;
  text: string;
  keyId: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const copied = copiedKey === keyId;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{sublabel}</span>
        <button
          onClick={() => onCopy(text, keyId)}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="text-sm whitespace-pre-wrap bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-zinc-800 dark:text-zinc-200">
        {text}
      </div>
    </div>
  );
}

function StatusButton({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
