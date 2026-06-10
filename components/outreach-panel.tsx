"use client";

import { useState, useEffect } from "react";
import type { OutreachTarget, OutreachStatus, OutreachDrafts, OutreachSignals, CandidateContact } from "@/lib/types";
import { OUTREACH_STATUSES } from "@/lib/types";
import {
  Plus, Sparkles, Copy, Check, ExternalLink, Trash2, Loader2, Clock, Send, RotateCcw, Search, Wand2, UserSearch, Users, Mail, ShieldCheck, Download,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { getOutreachConfig } from "@/lib/outreach-config";

const EMPTY_FORM = {
  brand_name: "",
  brand_category: "",
  brand_size: "" as "" | "enterprise" | "midsize" | "emerging",
  person_name: "",
  person_title: "",
  linkedin_url: "",
  notes: "",
};

type ViewMode = "today" | "all";

type Candidate = {
  brand_name: string;
  category: string;
  size: "enterprise" | "midsize" | "emerging";
  why_fit: string;
  seasonality_hook: string;
  contacts: CandidateContact[];
};

const ROLE_LABELS: Record<CandidateContact["role_category"], string> = {
  "college-or-next-gen": "College / next-gen",
  "influencer-or-partnerships": "Influencer / partnerships",
  "social-or-community": "Social / community",
  "experiential": "Experiential",
  "brand-marketing-exec": "Brand exec",
  "other": "Other",
};

const ROLE_COLORS: Record<CandidateContact["role_category"], string> = {
  "college-or-next-gen": "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  "influencer-or-partnerships": "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300",
  "social-or-community": "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  "experiential": "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  "brand-marketing-exec": "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  "other": "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400",
};

export function OutreachPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: OutreachTarget[];
}) {
  const cfg = getOutreachConfig(businessId);
  const categorySuggestions = cfg?.categories ?? [];
  const templateALabel = cfg?.templateALabel ?? "Template A";
  const templateBLabel = cfg?.templateBLabel ?? "Template B";
  const senders = cfg?.senders ?? ["Sam"];
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
  // Persist sender choice across page loads (per business)
  const senderStorageKey = `${businessId}-outreach-sender`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(senderStorageKey);
    if ((stored === "Sam" || stored === "Tyler") && senders.includes(stored)) {
      setFollowupSender(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(senderStorageKey, followupSender);
  }, [followupSender, senderStorageKey]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [candidatesForm, setCandidatesForm] = useState({ category: "", size: "" as "" | "enterprise" | "midsize" | "emerging", count: 10, focus: "" });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [generatingCandidates, setGeneratingCandidates] = useState(false);
  // Selection keys: `${brandIdx}:${contactIdx}` for a real contact,
  // or `${brandIdx}:placeholder` for a brand-as-placeholder (no contact yet).
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  // Per-target "Find contacts" state
  const [findingContactsId, setFindingContactsId] = useState<number | null>(null);
  const [foundContacts, setFoundContacts] = useState<Record<number, CandidateContact[]>>({});
  const [selectedFound, setSelectedFound] = useState<Record<number, Set<number>>>({});
  // Bulk backfill state
  const [bulkBackfilling, setBulkBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number; added: number } | null>(null);
  const shareHeaders = useShareHeaders();

  const PLACEHOLDER_NAME = "(to research)";

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
    if (res.status === 409) {
      const data: { existing?: OutreachTarget } = await res.json().catch(() => ({}));
      alert(
        `Already in your queue: ${form.person_name} at ${form.brand_name}` +
        (data.existing ? ` (status: ${data.existing.status})` : "")
      );
      if (data.existing) setExpandedId(data.existing.id);
      return;
    }
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

  async function markSent(target: OutreachTarget, template: "A" | "B" | "Email", text: string) {
    if (!text || !text.trim()) return;
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
    setSelectedKeys(new Set());
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
        const cands = data.candidates ?? [];
        setCandidates(cands);
        // Default: select every contact found (preserve user agency by NOT pre-selecting placeholders)
        const defaults = new Set<string>();
        cands.forEach((c, bi) => {
          (c.contacts ?? []).forEach((_, ci) => defaults.add(`${bi}:${ci}`));
        });
        setSelectedKeys(defaults);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Generate failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setGeneratingCandidates(false);
    }
  }

  async function addSelectedCandidates() {
    if (selectedKeys.size === 0) return;
    setBulkAdding(true);
    let skipped = 0;
    try {
      const newTargets: OutreachTarget[] = [];
      // Group selections by brand for stable ordering
      const sortedKeys = Array.from(selectedKeys).sort();
      for (const key of sortedKeys) {
        const [brandIdxStr, contactIdxStr] = key.split(":");
        const brandIdx = Number(brandIdxStr);
        const c = candidates[brandIdx];
        if (!c) continue;

        let person_name: string;
        let person_title: string | null = null;
        let linkedin_url: string | null = null;
        let person_email: string | null = null;
        let confidence_note = "";

        if (contactIdxStr === "placeholder") {
          person_name = "(to research)";
          confidence_note = "\nNo contacts auto-found — needs manual research.";
        } else {
          const contact = c.contacts?.[Number(contactIdxStr)];
          if (!contact) continue;
          person_name = contact.name;
          person_title = contact.title;
          linkedin_url = contact.linkedin_url;
          person_email = contact.email ?? null;
          confidence_note = `\nContact source: ${contact.source ?? "(none)"} | Confidence: ${contact.confidence} | Role: ${ROLE_LABELS[contact.role_category] ?? contact.role_category}${contact.origin ? ` | Origin: ${contact.origin}` : ""}`;
        }

        const res = await fetch("/api/outreach", {
          method: "POST",
          headers: { "content-type": "application/json", ...shareHeaders },
          body: JSON.stringify({
            business_id: businessId,
            brand_name: c.brand_name,
            brand_category: c.category,
            brand_size: c.size,
            person_name,
            person_title,
            linkedin_url,
            person_email,
            source: "auto-generated",
            notes: `${c.why_fit}\n\nTiming hook: ${c.seasonality_hook}${confidence_note}`,
          }),
        });
        if (res.status === 409) { skipped++; continue; }
        if (res.ok) newTargets.push(await res.json());
      }
      setTargets((prev) => [...newTargets, ...prev]);
      setCandidates([]);
      setSelectedKeys(new Set());
      setShowCandidates(false);
      if (skipped > 0) {
        alert(`Added ${newTargets.length} new target${newTargets.length === 1 ? "" : "s"}. Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"} already in your queue.`);
      }
    } finally {
      setBulkAdding(false);
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAllBrandContacts(brandIdx: number, candidate: Candidate) {
    const keys = (candidate.contacts ?? []).map((_, ci) => `${brandIdx}:${ci}`);
    if (keys.length === 0) {
      // brand has no contacts — toggle the placeholder selection
      toggleKey(`${brandIdx}:placeholder`);
      return;
    }
    const allSelected = keys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  async function findContacts(target: OutreachTarget) {
    setFindingContactsId(target.id);
    try {
      const res = await fetch(`/api/outreach/${target.id}/find-contacts`, {
        method: "POST",
        headers: shareHeaders,
      });
      if (res.ok) {
        const data: { contacts: CandidateContact[] } = await res.json();
        const contacts = data.contacts ?? [];
        setFoundContacts((prev) => ({ ...prev, [target.id]: contacts }));
        // Pre-select high + medium confidence by default
        const presel = new Set<number>();
        contacts.forEach((c, i) => {
          if (c.confidence === "high" || c.confidence === "medium") presel.add(i);
        });
        setSelectedFound((prev) => ({ ...prev, [target.id]: presel }));
        setExpandedId(target.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Find contacts failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setFindingContactsId(null);
    }
  }

  function toggleFoundContact(targetId: number, contactIdx: number) {
    setSelectedFound((prev) => {
      const cur = prev[targetId] ?? new Set<number>();
      const next = new Set(cur);
      if (next.has(contactIdx)) next.delete(contactIdx); else next.add(contactIdx);
      return { ...prev, [targetId]: next };
    });
  }

  async function addFoundContacts(target: OutreachTarget) {
    const contacts = foundContacts[target.id];
    const selected = selectedFound[target.id];
    if (!contacts || !selected || selected.size === 0) return;
    const newTargets: OutreachTarget[] = [];
    let skipped = 0;
    for (const idx of Array.from(selected).sort((a, b) => a - b)) {
      const c = contacts[idx];
      if (!c) continue;
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({
          business_id: target.business_id,
          brand_name: target.brand_name,
          brand_category: target.brand_category,
          brand_size: target.brand_size,
          person_name: c.name,
          person_title: c.title,
          linkedin_url: c.linkedin_url,
          person_email: c.email,
          source: "auto-generated",
          notes: `Backfilled contact for ${target.brand_name}\nRole: ${ROLE_LABELS[c.role_category] ?? c.role_category} | Confidence: ${c.confidence}${c.origin ? ` | Origin: ${c.origin}` : ""}\nSource: ${c.source ?? "(none)"}`,
        }),
      });
      if (res.status === 409) { skipped++; continue; }
      if (res.ok) newTargets.push(await res.json());
    }
    setTargets((prev) => [...newTargets, ...prev]);
    if (skipped > 0) {
      alert(`Added ${newTargets.length} new contact${newTargets.length === 1 ? "" : "s"}. Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"} (already in queue).`);
    }
    // Retire the original placeholder if it was one
    if (target.person_name === PLACEHOLDER_NAME) {
      const res = await fetch(`/api/outreach/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({
          status: "dead",
          notes: `${target.notes ?? ""}\n\n[Retired: backfilled with ${newTargets.length} real contacts]`.trim(),
        }),
      });
      if (res.ok) {
        const updated: OutreachTarget = await res.json();
        setTargets((prev) => prev.map((t) => (t.id === target.id ? updated : t)));
      }
    }
    setFoundContacts((prev) => { const n = { ...prev }; delete n[target.id]; return n; });
    setSelectedFound((prev) => { const n = { ...prev }; delete n[target.id]; return n; });
  }

  async function bulkBackfill() {
    const placeholders = targets.filter(
      (t) => t.person_name === PLACEHOLDER_NAME && t.status !== "dead"
    );
    if (placeholders.length === 0) return;
    // Cost ≈ ~5 Apollo credits per brand (1 org search + 1 enrich + ~5 people unlocks).
    // On Pro plan ($99/4000 credits) that's ~$0.025 × 5 = ~$0.13 per brand.
    const costEst = (placeholders.length * 0.15).toFixed(2);
    if (!confirm(
      `Backfill contacts for ${placeholders.length} placeholder brand${placeholders.length === 1 ? "" : "s"}?\n\n` +
      `• High + medium confidence contacts will be auto-added as new targets\n` +
      `• Placeholders will be marked dead (audit kept in notes)\n` +
      `• Estimated cost: ~$${costEst} in Apollo credits (Pro plan)\n\n` +
      `Runs sequentially, ~${placeholders.length * 8}s total (~8s per brand on Apollo)`
    )) return;

    setBulkBackfilling(true);
    setBackfillProgress({ done: 0, total: placeholders.length, added: 0 });
    let added = 0;
    for (let i = 0; i < placeholders.length; i++) {
      const t = placeholders[i];
      try {
        const findRes = await fetch(`/api/outreach/${t.id}/find-contacts`, {
          method: "POST",
          headers: shareHeaders,
        });
        if (findRes.ok) {
          const { contacts }: { contacts: CandidateContact[] } = await findRes.json();
          const auto = (contacts ?? []).filter(
            (c) => c.confidence === "high" || c.confidence === "medium"
          );
          for (const c of auto) {
            const res = await fetch("/api/outreach", {
              method: "POST",
              headers: { "content-type": "application/json", ...shareHeaders },
              body: JSON.stringify({
                business_id: t.business_id,
                brand_name: t.brand_name,
                brand_category: t.brand_category,
                brand_size: t.brand_size,
                person_name: c.name,
                person_title: c.title,
                linkedin_url: c.linkedin_url,
                person_email: c.email,
                source: "auto-generated",
                notes: `Backfilled contact for ${t.brand_name}\nRole: ${ROLE_LABELS[c.role_category] ?? c.role_category} | Confidence: ${c.confidence}${c.origin ? ` | Origin: ${c.origin}` : ""}\nSource: ${c.source ?? "(none)"}`,
              }),
            });
            // 409 = duplicate already in queue — skip silently
            if (res.status === 409) continue;
            if (res.ok) {
              const created: OutreachTarget = await res.json();
              setTargets((prev) => [created, ...prev]);
              added++;
            }
          }
          const patchRes = await fetch(`/api/outreach/${t.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json", ...shareHeaders },
            body: JSON.stringify({
              status: "dead",
              notes: `${t.notes ?? ""}\n\n[Retired by bulk backfill: ${auto.length} contacts added]`.trim(),
            }),
          });
          if (patchRes.ok) {
            const updated: OutreachTarget = await patchRes.json();
            setTargets((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
          }
        }
      } catch {
        // continue on errors — partial progress is fine
      }
      setBackfillProgress({ done: i + 1, total: placeholders.length, added });
    }
    setBulkBackfilling(false);
    setTimeout(() => setBackfillProgress(null), 8000);
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
      {showAdd && <AddTargetForm form={form} setField={setField} categories={categorySuggestions} onSubmit={add} onCancel={() => { setShowAdd(false); setForm(EMPTY_FORM); }} />}

      {/* Candidate generator */}
      {showCandidates && (
        <CandidateGenerator
          form={candidatesForm}
          setForm={setCandidatesForm}
          onGenerate={generateCandidates}
          generating={generatingCandidates}
          candidates={candidates}
          selectedKeys={selectedKeys}
          onToggleKey={toggleKey}
          onToggleAllBrand={toggleAllBrandContacts}
          onAddSelected={addSelectedCandidates}
          bulkAdding={bulkAdding}
          onCancel={() => { setShowCandidates(false); setCandidates([]); setSelectedKeys(new Set()); }}
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
                  findingContacts={findingContactsId === t.id}
                  foundContacts={foundContacts[t.id]}
                  selectedFound={selectedFound[t.id]}
                  copiedKey={copiedKey}
                  isPlaceholder={t.person_name === PLACEHOLDER_NAME}
                  templateALabel={templateALabel}
                  templateBLabel={templateBLabel}
                  onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  onDraft={() => draft(t)}
                  onEnrich={() => enrich(t)}
                  onFindContacts={() => findContacts(t)}
                  onToggleFoundContact={(idx) => toggleFoundContact(t.id, idx)}
                  onAddFoundContacts={() => addFoundContacts(t)}
                  onMarkSent={(template, text) => markSent(t, template, text)}
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
                  senders.length > 1 ? (
                    <div className="inline-flex items-center gap-1 text-xs text-zinc-500">
                      <span>Sign as:</span>
                      <select
                        value={followupSender}
                        onChange={(e) => setFollowupSender(e.target.value as "Sam" | "Tyler")}
                        className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                      >
                        {senders.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ) : undefined
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
          {/* Bulk backfill banner */}
          {(() => {
            const placeholders = targets.filter(
              (t) => t.person_name === PLACEHOLDER_NAME && t.status !== "dead"
            );
            if (placeholders.length === 0 && !backfillProgress) return null;
            return (
              <div className="border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 bg-amber-50/40 dark:bg-amber-950/15 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                  {backfillProgress ? (
                    <span>
                      <Loader2 size={12} className="inline animate-spin mr-1.5" />
                      Backfilling {backfillProgress.done} / {backfillProgress.total} brands ·{" "}
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {backfillProgress.added} contacts added
                      </span>
                    </span>
                  ) : (
                    <span>
                      <Users size={13} className="inline mr-1.5 text-amber-700 dark:text-amber-400" />
                      <span className="font-medium">{placeholders.length}</span> brand
                      {placeholders.length === 1 ? "" : "s"} added without a contact yet.
                    </span>
                  )}
                </div>
                {!backfillProgress && (
                  <button
                    onClick={bulkBackfill}
                    disabled={bulkBackfilling}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <UserSearch size={13} />
                    Backfill all contacts (~${(placeholders.length * 0.15).toFixed(2)})
                  </button>
                )}
              </div>
            );
          })()}

          <div className="flex items-center justify-between gap-3 flex-wrap">
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
            <a
              href={`/api/outreach/export?business_id=${businessId}`}
              download
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
              title="Download all outreach targets as CSV"
            >
              <Download size={11} /> Export CSV
            </a>
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
                  findingContacts={findingContactsId === t.id}
                  foundContacts={foundContacts[t.id]}
                  selectedFound={selectedFound[t.id]}
                  copiedKey={copiedKey}
                  isPlaceholder={t.person_name === PLACEHOLDER_NAME}
                  templateALabel={templateALabel}
                  templateBLabel={templateBLabel}
                  onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                  onDraft={() => draft(t)}
                  onEnrich={() => enrich(t)}
                  onFindContacts={() => findContacts(t)}
                  onToggleFoundContact={(idx) => toggleFoundContact(t.id, idx)}
                  onAddFoundContacts={() => addFoundContacts(t)}
                  onMarkSent={(template, text) => markSent(t, template, text)}
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
  form, setField, categories, onSubmit, onCancel,
}: {
  form: typeof EMPTY_FORM;
  setField: <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) => void;
  categories: string[];
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
            placeholder={categories[0] ?? "category"}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          />
          <datalist id="category-list">
            {categories.map((c) => <option key={c} value={c} />)}
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
  form, setForm, onGenerate, generating, candidates, selectedKeys, onToggleKey, onToggleAllBrand, onAddSelected, bulkAdding, onCancel,
}: {
  form: { category: string; size: "" | "enterprise" | "midsize" | "emerging"; count: number; focus: string };
  setForm: React.Dispatch<React.SetStateAction<{ category: string; size: "" | "enterprise" | "midsize" | "emerging"; count: number; focus: string }>>;
  onGenerate: (e: React.FormEvent) => void;
  generating: boolean;
  candidates: Candidate[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onToggleAllBrand: (brandIdx: number, c: Candidate) => void;
  onAddSelected: () => void;
  bulkAdding: boolean;
  onCancel: () => void;
}) {
  const totalContactsFound = candidates.reduce((s, c) => s + (c.contacts?.length ?? 0), 0);

  return (
    <div className="border border-violet-200 dark:border-violet-900/40 rounded-lg p-4 space-y-3 bg-violet-50/40 dark:bg-violet-950/10">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200">
        <Wand2 size={14} /> Suggest brand candidates + contacts
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 -mt-1">
        Generates brands AND web-searches for 2–4 specific LinkedIn contacts per brand (college / influencer / social / experiential / brand exec). Takes ~30–90 seconds.
      </p>
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
            <label className="text-xs text-zinc-500 mb-1 block"># of brands</label>
            <input
              type="number"
              min={3}
              max={20}
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{candidates.length}</span> brand{candidates.length === 1 ? "" : "s"} ·{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{totalContactsFound}</span> contact{totalContactsFound === 1 ? "" : "s"} found ·{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">{selectedKeys.size}</span> selected
            </div>
            <button
              onClick={onAddSelected}
              disabled={selectedKeys.size === 0 || bulkAdding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add {selectedKeys.size} as target{selectedKeys.size === 1 ? "" : "s"}
            </button>
          </div>
          <div className="space-y-3">
            {candidates.map((c, brandIdx) => (
              <CandidateBrandCard
                key={brandIdx}
                brandIdx={brandIdx}
                candidate={c}
                selectedKeys={selectedKeys}
                onToggleKey={onToggleKey}
                onToggleAllBrand={() => onToggleAllBrand(brandIdx, c)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateBrandCard({
  brandIdx, candidate, selectedKeys, onToggleKey, onToggleAllBrand,
}: {
  brandIdx: number;
  candidate: Candidate;
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onToggleAllBrand: () => void;
}) {
  const c = candidate;
  const contacts = c.contacts ?? [];
  const brandContactKeys = contacts.map((_, ci) => `${brandIdx}:${ci}`);
  const allBrandSelected = brandContactKeys.length > 0 && brandContactKeys.every((k) => selectedKeys.has(k));
  const someBrandSelected = brandContactKeys.some((k) => selectedKeys.has(k));
  const placeholderKey = `${brandIdx}:placeholder`;
  const placeholderSelected = selectedKeys.has(placeholderKey);

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-2">
        <input
          type="checkbox"
          checked={allBrandSelected}
          ref={(el) => { if (el) el.indeterminate = !allBrandSelected && someBrandSelected; }}
          onChange={onToggleAllBrand}
          className="mt-1"
          title="Select / deselect all contacts at this brand"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{c.brand_name}</span>
            <span className="text-xs text-zinc-500">{c.category}</span>
            <span className="text-xs text-zinc-400">· {c.size}</span>
            {contacts.length === 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400 italic">No contacts found</span>
            )}
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{c.why_fit}</div>
          {c.seasonality_hook && (
            <div className="text-xs text-zinc-500 mt-1 italic">Hook: {c.seasonality_hook}</div>
          )}
        </div>
      </div>

      {contacts.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {contacts.map((contact, ci) => {
            const key = `${brandIdx}:${ci}`;
            const checked = selectedKeys.has(key);
            return (
              <label
                key={ci}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  checked ? "bg-emerald-50/40 dark:bg-emerald-950/15" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleKey(key)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{contact.name}</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{contact.title}</span>
                  </div>
                  <ContactMeta contact={contact} />
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <label className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
          <input
            type="checkbox"
            checked={placeholderSelected}
            onChange={() => onToggleKey(placeholderKey)}
            className="mt-1"
          />
          <span className="text-xs text-zinc-500">
            Add this brand as a placeholder (you&apos;ll add the contact manually later)
          </span>
        </label>
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
  target, expanded, drafting, enriching, findingContacts, foundContacts, selectedFound, copiedKey, isPlaceholder,
  templateALabel, templateBLabel,
  onToggle, onDraft, onEnrich, onFindContacts, onToggleFoundContact, onAddFoundContacts,
  onMarkSent, onMarkReplied, onMarkStatus, onCopy, onDelete,
}: {
  target: OutreachTarget;
  expanded: boolean;
  drafting: boolean;
  enriching: boolean;
  findingContacts: boolean;
  foundContacts?: CandidateContact[];
  selectedFound?: Set<number>;
  copiedKey: string | null;
  isPlaceholder: boolean;
  templateALabel: string;
  templateBLabel: string;
  onToggle: () => void;
  onDraft: () => void;
  onEnrich: () => void;
  onFindContacts: () => void;
  onToggleFoundContact: (idx: number) => void;
  onAddFoundContacts: () => void;
  onMarkSent: (template: "A" | "B" | "Email", firstDMText: string) => void;
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
        {target.person_email && (
          <a
            href={`mailto:${target.person_email}`}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={`Email: ${target.person_email}`}
          >
            <Mail size={14} />
          </a>
        )}
        <button
          onClick={onFindContacts}
          disabled={findingContacts || drafting || enriching}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 ${
            isPlaceholder
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
          title={isPlaceholder ? "Find real contacts at this brand (placeholder)" : "Find more contacts at this brand"}
        >
          {findingContacts ? <Loader2 size={12} className="animate-spin" /> : <UserSearch size={12} />}
          {isPlaceholder ? "Find contacts" : "Contacts"}
        </button>
        <button
          onClick={onEnrich}
          disabled={enriching || drafting || findingContacts}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          title={signals ? "Refresh signals" : "Search web for brand signals"}
        >
          {enriching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {signals ? "Refresh" : "Enrich"}
        </button>
        <button
          onClick={onDraft}
          disabled={drafting || enriching || findingContacts || isPlaceholder}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          title={isPlaceholder ? "Find a real contact first" : undefined}
        >
          {drafting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {drafts ? "Redraft" : "Draft"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-950/30">
          {/* Found contacts section */}
          {foundContacts && foundContacts.length > 0 && (
            <div className="border border-amber-200 dark:border-amber-900/40 rounded-md bg-amber-50/40 dark:bg-amber-950/15 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <UserSearch size={12} className="inline mr-1" /> Found {foundContacts.length} contact{foundContacts.length === 1 ? "" : "s"} at {target.brand_name}
                </div>
                <button
                  onClick={onAddFoundContacts}
                  disabled={!selectedFound || selectedFound.size === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Plus size={12} /> Add {selectedFound?.size ?? 0} as targets
                  {isPlaceholder && " (retire placeholder)"}
                </button>
              </div>
              <div className="space-y-1">
                {foundContacts.map((c, idx) => {
                  const checked = selectedFound?.has(idx) ?? false;
                  return (
                    <label
                      key={idx}
                      className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                          : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleFoundContact(idx)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">{c.title}</span>
                        </div>
                        <ContactMeta contact={c} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

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
                {signals.fit_rationale && (
                  <p className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-900/40 text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold">Why it&apos;s a fit:</span> {signals.fit_rationale}
                  </p>
                )}
              </div>
            </details>
          )}
          {!drafts && (
            <div className="text-sm text-zinc-500">
              No drafts yet — {signals ? "" : "click "}
              {!signals && <><span className="inline-flex items-center gap-1 font-medium"><Search size={11} /> Enrich</span> to ground in real signals (optional), then </>}
              click <span className="inline-flex items-center gap-1 font-medium"><Sparkles size={11} /> Draft</span> to generate Template A + B and a cold email.
            </div>
          )}
          {drafts && (
            <>
              <DraftBlock
                label={templateALabel}
                connectionNote={drafts.templateA.connectionNote}
                firstDM={drafts.templateA.firstDM}
                keyPrefix={`a-${target.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
                onMarkSent={target.status !== "sent" && target.status !== "replied" ? (text) => onMarkSent("A", text) : undefined}
              />
              <DraftBlock
                label={templateBLabel}
                connectionNote={drafts.templateB.connectionNote}
                firstDM={drafts.templateB.firstDM}
                keyPrefix={`b-${target.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
                onMarkSent={target.status !== "sent" && target.status !== "replied" ? (text) => onMarkSent("B", text) : undefined}
              />
              {drafts.email ? (
                <EmailDraftBlock
                  subject={drafts.email.subject}
                  body={drafts.email.body}
                  toEmail={target.person_email}
                  keyPrefix={`e-${target.id}`}
                  copiedKey={copiedKey}
                  onCopy={onCopy}
                  onMarkSent={target.status !== "sent" && target.status !== "replied" ? (text) => onMarkSent("Email", text) : undefined}
                />
              ) : (
                <p className="text-[11px] text-zinc-400 italic">
                  These drafts predate the email variant. Click <span className="inline-flex items-center gap-0.5 font-medium not-italic"><Sparkles size={10} /> Redraft</span> to generate Template A + B and a cold email together.
                </p>
              )}
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
  /** Receives the (possibly edited) firstDM text so sent_history reflects what was actually sent. */
  onMarkSent?: (firstDMText: string) => void;
}) {
  const [noteText, setNoteText] = useState(connectionNote);
  const [dmText, setDmText] = useState(firstDM);
  // Reset edits if the underlying drafts change (e.g. user clicks Redraft)
  useEffect(() => { setNoteText(connectionNote); }, [connectionNote]);
  useEffect(() => { setDmText(firstDM); }, [firstDM]);

  const noteEdited = noteText !== connectionNote;
  const dmEdited = dmText !== firstDM;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</div>
        {onMarkSent && (
          <button
            onClick={() => onMarkSent(dmText)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Send size={10} /> Sent this{dmEdited && " (edited)"}
          </button>
        )}
      </div>
      <DraftLine
        sublabel={`Connection note (${noteText.length}/300)${noteEdited ? " · edited" : ""}`}
        text={noteText}
        onChange={setNoteText}
        keyId={`${keyPrefix}-note`}
        copiedKey={copiedKey}
        onCopy={onCopy}
        maxRows={3}
      />
      <DraftLine
        sublabel={`First DM (${dmText.length}/600)${dmEdited ? " · edited" : ""}`}
        text={dmText}
        onChange={setDmText}
        keyId={`${keyPrefix}-dm`}
        copiedKey={copiedKey}
        onCopy={onCopy}
        maxRows={6}
      />
    </div>
  );
}

function EmailDraftBlock({
  subject, body, toEmail, keyPrefix, copiedKey, onCopy, onMarkSent,
}: {
  subject: string;
  body: string;
  toEmail: string | null;
  keyPrefix: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  /** Receives the (possibly edited) body so sent_history reflects what was actually sent. */
  onMarkSent?: (bodyText: string) => void;
}) {
  const [subjectText, setSubjectText] = useState(subject);
  const [bodyText, setBodyText] = useState(body);
  // Reset edits if the underlying drafts change (e.g. user clicks Redraft)
  useEffect(() => { setSubjectText(subject); }, [subject]);
  useEffect(() => { setBodyText(body); }, [body]);

  const subjectEdited = subjectText !== subject;
  const bodyEdited = bodyText !== body;
  const mailtoHref = toEmail
    ? `mailto:${toEmail}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5">
          <Mail size={11} /> Email — Cold email variant
        </div>
        <div className="flex items-center gap-1.5">
          {mailtoHref && (
            <a
              href={mailtoHref}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-sky-600 text-white hover:bg-sky-700"
            >
              <Mail size={10} /> Open in mail
            </a>
          )}
          {onMarkSent && (
            <button
              onClick={() => onMarkSent(bodyText)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Send size={10} /> Sent this{bodyEdited && " (edited)"}
            </button>
          )}
        </div>
      </div>
      <DraftLine
        sublabel={`Subject (${subjectText.length}/70)${subjectEdited ? " · edited" : ""}`}
        text={subjectText}
        onChange={setSubjectText}
        keyId={`${keyPrefix}-subject`}
        copiedKey={copiedKey}
        onCopy={onCopy}
        maxRows={1}
      />
      <DraftLine
        sublabel={`Body (${bodyText.length}/900)${bodyEdited ? " · edited" : ""}`}
        text={bodyText}
        onChange={setBodyText}
        keyId={`${keyPrefix}-body`}
        copiedKey={copiedKey}
        onCopy={onCopy}
        maxRows={8}
      />
      {!toEmail && (
        <p className="text-[11px] text-zinc-400 italic">
          No email on file for this contact — run Find Contacts to pull one, or copy the draft manually.
        </p>
      )}
    </div>
  );
}

function DraftLine({
  sublabel, text, onChange, keyId, copiedKey, onCopy, maxRows,
}: {
  sublabel: string;
  text: string;
  onChange: (next: string) => void;
  keyId: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  maxRows?: number;
}) {
  const copied = copiedKey === keyId;
  const rows = Math.min(maxRows ?? 6, Math.max(2, Math.ceil(text.length / 70)));
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
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck
        className="w-full text-sm whitespace-pre-wrap bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-zinc-800 dark:text-zinc-200 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
    </div>
  );
}

function ContactMeta({ contact }: { contact: CandidateContact }) {
  return (
    <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
      <span className={`px-1.5 py-0.5 rounded text-[10px] ${ROLE_COLORS[contact.role_category] ?? ROLE_COLORS.other}`}>
        {ROLE_LABELS[contact.role_category] ?? contact.role_category}
      </span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
        contact.confidence === "high" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
        : contact.confidence === "medium" ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
        : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
      }`}>
        {contact.confidence}
      </span>
      {contact.origin && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 ${
            contact.origin === "apollo"
              ? "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
          }`}
          title={contact.origin === "apollo" ? "Verified via Apollo" : "Discovered via web search"}
        >
          {contact.origin === "apollo" ? <ShieldCheck size={9} /> : <Search size={9} />}
          {contact.origin}
        </span>
      )}
      {contact.linkedin_url ? (
        <a
          href={contact.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ExternalLink size={10} /> LinkedIn
        </a>
      ) : (
        <span className="text-zinc-400 italic">no LinkedIn URL</span>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          title={contact.email}
        >
          <Mail size={10} /> email
        </a>
      )}
      {contact.source && (
        <a
          href={contact.source}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          title="Source"
        >
          source ↗
        </a>
      )}
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
