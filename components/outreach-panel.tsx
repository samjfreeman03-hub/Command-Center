"use client";

import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import type { OutreachTarget, OutreachStatus, OutreachDrafts, OutreachSignals, CandidateContact } from "@/lib/types";
import { OUTREACH_STATUSES } from "@/lib/types";
import {
  Plus, Sparkles, Copy, Check, ExternalLink, Trash2, Loader2, Clock, Send, RotateCcw, Search, UserSearch, Users, Mail, ShieldCheck, Download, PenLine, Target, ChevronDown, StickyNote, History,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { getOutreachConfig } from "@/lib/outreach-config";
import { AutoTextarea } from "@/components/auto-textarea";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, Field, textareaClass } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, Card, EmptyState, SectionHeader, type BadgeTone } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";
import { usePanelState } from "@/lib/panel-cache";
import { brandVars, getBusiness } from "@/lib/businesses";
import { cn } from "@/lib/cn";

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

const ROLE_TONES: Record<CandidateContact["role_category"], BadgeTone> = {
  "college-or-next-gen": "green",
  "influencer-or-partnerships": "violet",
  "social-or-community": "blue",
  "experiential": "amber",
  "brand-marketing-exec": "neutral",
  "other": "neutral",
};

const STATUS_TONES: Record<OutreachStatus, BadgeTone> = {
  queued: "neutral",
  drafted: "violet",
  sent: "blue",
  replied: "green",
  converted: "amber",
  declined: "red",
  dead: "neutral",
};

type SentHistoryEntry = { at: number; follow_up_n: number; text: string; template?: string };

export function OutreachPanel({
  businessId,
  initial,
  openId,
}: {
  businessId: string;
  initial: OutreachTarget[];
  /** Deep link: switch to a view that shows this target, expand it, and scroll to it. */
  openId?: number;
}) {
  const cfg = getOutreachConfig(businessId);
  const categorySuggestions = cfg?.categories ?? [];
  const templateALabel = cfg?.templateALabel ?? "Template A";
  const templateBLabel = cfg?.templateBLabel ?? "Template B";
  const senders = cfg?.senders ?? ["Sam"];
  const [view, setView] = useState<ViewMode>("today");
  const [targets, setTargets] = usePanelState<OutreachTarget[]>("outreach", initial);
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
  // Per-business email signature, appended to Gmail compose links (plain text).
  // Stored in localStorage so it stays out of the DB/repo and survives reloads.
  const signatureStorageKey = `${businessId}-email-signature`;
  const [emailSignature, setEmailSignature] = useState("");
  const [showSignature, setShowSignature] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setEmailSignature(window.localStorage.getItem(signatureStorageKey) ?? "");
  }, [signatureStorageKey]);
  function saveSignature(next: string) {
    setEmailSignature(next);
    if (typeof window !== "undefined") window.localStorage.setItem(signatureStorageKey, next);
  }
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
      toast(
        `Already in your queue: ${form.person_name} at ${form.brand_name}` +
        (data.existing ? ` (status: ${data.existing.status})` : ""),
        { tone: "error" }
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
        toast(`Draft failed: ${err.error ?? res.statusText}`, { tone: "error" });
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
        toast(`Enrich failed: ${err.error ?? res.statusText}`, { tone: "error" });
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
        toast(`Follow-up draft failed: ${err.error ?? res.statusText}`, { tone: "error" });
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

  /**
   * Undo an accidental Replied/Declined/Dead click: revert to the prior
   * logical status and restore the follow-up cadence if it was mid-flight.
   */
  async function unsetStatus(target: OutreachTarget) {
    const CADENCE_DAYS: Record<number, number> = { 1: 3, 2: 7, 3: 14 };
    let patch: Record<string, unknown>;
    if (target.sent_at) {
      const nextN = target.followup_count + 1;
      patch = {
        status: "sent",
        replied_at: null,
        next_followup_at:
          nextN <= 3 ? target.sent_at + CADENCE_DAYS[nextN] * 86400_000 : null,
      };
    } else {
      patch = { status: target.drafts_json ? "drafted" : "queued", replied_at: null };
    }
    const res = await fetch(`/api/outreach/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: OutreachTarget = await res.json();
      setTargets((prev) => prev.map((t) => (t.id === target.id ? updated : t)));
    }
  }

  async function resetCadence(id: number) {
    if (!(await confirmDialog({
      title: "Reset this target's cadence?",
      description: "It will go back to queued.",
      confirmLabel: "Reset",
    }))) return;
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
        toast(`Generate failed: ${err.error ?? res.statusText}`, { tone: "error" });
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
        toast(`Added ${newTargets.length} new target${newTargets.length === 1 ? "" : "s"}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"} already in your queue`, { tone: "success" });
      } else if (newTargets.length > 0) {
        toast(`Added ${newTargets.length} new target${newTargets.length === 1 ? "" : "s"}`, { tone: "success" });
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
        toast(`Find contacts failed: ${err.error ?? res.statusText}`, { tone: "error" });
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
      toast(`Added ${newTargets.length} new contact${newTargets.length === 1 ? "" : "s"}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"} already in your queue`, { tone: "success" });
    } else if (newTargets.length > 0) {
      toast(`Added ${newTargets.length} new contact${newTargets.length === 1 ? "" : "s"}`, { tone: "success" });
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
    if (!(await confirmDialog({
      title: `Backfill contacts for ${placeholders.length} placeholder brand${placeholders.length === 1 ? "" : "s"}?`,
      description:
        `High and medium confidence contacts will be added as new targets, and the placeholders will be marked dead (audit kept in notes). ` +
        `Estimated cost: about $${costEst} in Apollo credits (Pro plan). ` +
        `Runs one brand at a time, about ${placeholders.length * 8}s in total.`,
      confirmLabel: "Backfill",
    }))) return;

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
    if (!(await confirmDialog({
      title: "Delete this outreach target?",
      description: "Its drafts, signals and send history go with it.",
      confirmLabel: "Delete",
      destructive: true,
    }))) return;
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setExpandedId(null);
    await fetch(`/api/outreach/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    toast("Copied");
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

  // Deep link: show the target, expand it, scroll to it, and flash a ring.
  const [highlightId, setHighlightId] = useState<number | null>(null);
  useEffect(() => {
    if (openId == null) return;
    const target = targets.find((t) => t.id === openId);
    if (!target) return;
    const inToday = newTargets.some((t) => t.id === openId);
    if (!(view === "today" && inToday)) {
      setView("all");
      if (filter !== "all" && filter !== target.status) setFilter("all");
    }
    setExpandedId(openId);
    setHighlightId(openId);
    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`outreach-target-${openId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const ringTimer = setTimeout(() => setHighlightId(null), 2200);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(ringTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const todayCount = newTargets.length + followupsDue.length;
  const business = getBusiness(businessId);
  const brandStyle = business ? brandVars(business) : undefined;
  const placeholders = targets.filter((t) => t.person_name === PLACEHOLDER_NAME && t.status !== "dead");

  function openAdd() {
    setShowCandidates(false);
    setShowAdd(true);
  }
  function openCandidates() {
    setShowAdd(false);
    setShowCandidates(true);
  }

  function renderTargetCard(t: OutreachTarget) {
    return (
      <TargetCard
        key={t.id}
        target={t}
        expanded={expandedId === t.id}
        highlighted={highlightId === t.id}
        drafting={draftingId === t.id}
        enriching={enrichingId === t.id}
        findingContacts={findingContactsId === t.id}
        foundContacts={foundContacts[t.id]}
        selectedFound={selectedFound[t.id]}
        copiedKey={copiedKey}
        isPlaceholder={t.person_name === PLACEHOLDER_NAME}
        templateALabel={templateALabel}
        templateBLabel={templateBLabel}
        emailSignature={emailSignature}
        onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
        onDraft={() => draft(t)}
        onEnrich={() => enrich(t)}
        onFindContacts={() => findContacts(t)}
        onToggleFoundContact={(idx) => toggleFoundContact(t.id, idx)}
        onAddFoundContacts={() => addFoundContacts(t)}
        onMarkSent={(template, text) => markSent(t, template, text)}
        onMarkReplied={() => markReplied(t.id)}
        onMarkStatus={(s) => markStatusGeneric(t.id, s)}
        onUnsetStatus={() => unsetStatus(t)}
        onCopy={copy}
        onDelete={() => remove(t.id)}
      />
    );
  }

  return (
    <div>
      {/* Toolbar: view toggle on the left, actions on the right */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented<ViewMode>
          value={view}
          onChange={setView}
          options={[
            {
              value: "today",
              label: (
                <>
                  Today
                  {todayCount > 0 && <span className="text-[11px] tabular-nums text-ink-3">{todayCount}</span>}
                </>
              ),
            },
            {
              value: "all",
              label: (
                <>
                  All targets
                  <span className="text-[11px] tabular-nums text-ink-3">{targets.length}</span>
                </>
              ),
            },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowSignature(true)}
            title="Email signature appended to Gmail drafts"
          >
            <PenLine size={14} />
            Signature{emailSignature.trim() ? "" : " · off"}
          </Button>
          <Button variant="brand" onClick={openCandidates}>
            <Sparkles size={14} />
            Suggest brands
          </Button>
          <Button variant="primary" onClick={openAdd}>
            <Plus size={14} />
            Add target
          </Button>
        </div>
      </div>

      {/* Email signature editor */}
      <Modal
        open={showSignature}
        onClose={() => setShowSignature(false)}
        title="Email signature"
        description={`Appended to the bottom of every Open in Gmail draft for ${cfg?.name ?? "this business"}.`}
        footer={
          <>
            <span className="text-xs text-ink-3">
              {emailSignature.trim() ? "Signature is on." : "Leave empty to turn off."}
            </span>
            <Button variant="primary" onClick={() => setShowSignature(false)}>Done</Button>
          </>
        }
      >
        <Field
          label="Signature"
          hint="Saves automatically on this device. Plain text only, no logos or formatting. Gmail can't add your saved signature when a draft is pre-filled, so this fills the gap."
        >
          <AutoTextarea
            value={emailSignature}
            onChange={(e) => saveSignature(e.target.value)}
            placeholder={"Sam Freeman\nCo-Founder & Managing Partner, MTRNM\nmtrnm.co · @mtrnm_"}
            minRows={4}
            className={cn(textareaClass, "font-mono")}
          />
        </Field>
      </Modal>

      {/* Add target */}
      <AddTargetModal
        open={showAdd}
        form={form}
        setField={setField}
        categories={categorySuggestions}
        onSubmit={add}
        onClose={() => setShowAdd(false)}
        onCancel={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
      />

      {/* Suggest brands */}
      <CandidateGenerator
        open={showCandidates}
        brandStyle={brandStyle}
        categories={categorySuggestions}
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
        onClose={() => setShowCandidates(false)}
      />

      {/* TODAY view */}
      {view === "today" && (
        <div className="space-y-6">
          {newTargets.length === 0 && followupsDue.length === 0 && (
            <Card>
              <EmptyState
                icon={<Target size={18} />}
                title="Nothing in today's queue"
                body="Add a target to start, let AI suggest brands, or switch to All targets."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="brand" onClick={openCandidates}><Sparkles size={14} /> Suggest brands</Button>
                    <Button onClick={openAdd}><Plus size={14} /> Add target</Button>
                  </div>
                }
              />
            </Card>
          )}

          {newTargets.length > 0 && (
            <section>
              <SectionHeader
                title="To send today"
                count={newTargets.length}
                hint="Generate drafts, copy, send on LinkedIn, then mark sent."
              />
              <div className="space-y-2">{newTargets.map(renderTargetCard)}</div>
            </section>
          )}

          {followupsDue.length > 0 && (
            <section>
              <SectionHeader
                title="Follow-ups due"
                count={followupsDue.length}
                hint="Day 3, 7 and 14 cadence. Generate a bump and send."
                action={
                  senders.length > 1 ? (
                    <div className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
                      <span>Sign as</span>
                      <Segmented<"Sam" | "Tyler">
                        size="sm"
                        value={followupSender}
                        onChange={setFollowupSender}
                        options={senders.map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                  ) : undefined
                }
              />
              <div className="space-y-2">
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
              </div>
            </section>
          )}
        </div>
      )}

      {/* ALL view */}
      {view === "all" && (
        <div className="space-y-3">
          {/* Bulk backfill banner */}
          {(placeholders.length > 0 || backfillProgress) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised px-4 py-3 shadow-card">
              <div className="text-[13px] text-ink-2">
                {backfillProgress ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Loader2 size={13} className={cn("text-ink-3", bulkBackfilling && "animate-spin")} />
                    <span className="tabular-nums">
                      Backfilling {backfillProgress.done} / {backfillProgress.total} brands
                    </span>
                    <span className="text-ink-4">·</span>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {backfillProgress.added} contacts added
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Users size={14} className="text-amber-600 dark:text-amber-400" />
                    <span>
                      <span className="font-medium tabular-nums text-ink">{placeholders.length}</span> brand
                      {placeholders.length === 1 ? "" : "s"} added without a contact yet.
                    </span>
                  </span>
                )}
              </div>
              {!backfillProgress && (
                <Button onClick={bulkBackfill} disabled={bulkBackfilling}>
                  <UserSearch size={14} />
                  Backfill all contacts (~${(placeholders.length * 0.15).toFixed(2)})
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <FilterChip active={filter === "all"} count={targets.length} onClick={() => setFilter("all")}>
                All
              </FilterChip>
              {OUTREACH_STATUSES.map((s) => (
                <FilterChip
                  key={s.value}
                  active={filter === s.value}
                  count={counts[s.value] ?? 0}
                  onClick={() => setFilter(s.value)}
                >
                  {s.label}
                </FilterChip>
              ))}
            </div>
            <a
              href={`/api/outreach/export?business_id=${businessId}`}
              download
              className={linkButtonSecondary}
              title="Download all outreach targets as CSV"
            >
              <Download size={13} /> Export CSV
            </a>
          </div>

          {filtered.length === 0 ? (
            <Card>
              {targets.length === 0 ? (
                <EmptyState
                  icon={<Target size={18} />}
                  title="No outreach targets yet"
                  body="Add your first target by hand, or let AI suggest brands and contacts."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button variant="brand" onClick={openCandidates}><Sparkles size={14} /> Suggest brands</Button>
                      <Button onClick={openAdd}><Plus size={14} /> Add target</Button>
                    </div>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Search size={18} />}
                  title="No targets match this filter"
                  action={<Button onClick={() => setFilter("all")}>Show all targets</Button>}
                />
              )}
            </Card>
          ) : (
            <div className="space-y-2">{filtered.map(renderTargetCard)}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Local helpers (candidates for components/ui)
// ─────────────────────────────────────────────────────────────

/** Anchor styled like <Button variant="secondary" size="sm">, for real links and downloads. */
const linkButtonSecondary =
  "inline-flex h-8 md:h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-raised px-2.5 " +
  "text-xs font-medium text-ink shadow-card transition-colors hover:bg-sunken";

/** Anchor styled like a small ghost <IconButton>. */
function IconLink({
  href, label, external, children,
}: { href: string; label: string; external?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink md:h-7 md:w-7"
    >
      {children}
    </a>
  );
}

/** Sub-section label inside an expanded card. */
function SubLabel({
  icon: Icon, children, hint, action,
}: { icon?: LucideIcon; children: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink">
        {Icon && <Icon size={13} className="text-ink-3" />}
        {children}
        {hint && <span className="font-normal text-ink-3">{hint}</span>}
      </div>
      {action}
    </div>
  );
}

function FilterChip({
  active, count, onClick, children,
}: { active: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors md:h-7",
        active ? "bg-inverse text-on-inverse" : "text-ink-3 hover:bg-hover hover:text-ink"
      )}
    >
      {children}
      <span className="text-[11px] tabular-nums opacity-60">{count}</span>
    </button>
  );
}

const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-ink";

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function AddTargetModal({
  open, form, setField, categories, onSubmit, onClose, onCancel,
}: {
  open: boolean;
  /** Esc, backdrop or X: hide but keep what was typed. Cancel clears the form. */
  onClose: () => void;
  form: typeof EMPTY_FORM;
  setField: <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) => void;
  categories: string[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add target"
      description="One person at one brand. You can enrich and draft right after."
      onSubmit={onSubmit}
      footer={
        <>
          <span />
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!form.brand_name.trim() || !form.person_name.trim()}
            >
              Add target
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Brand name" required>
            <Input value={form.brand_name} onChange={(e) => setField("brand_name", e.target.value)} placeholder="Bubble" autoFocus />
          </Field>
          <Field label="Person name" required>
            <Input value={form.person_name} onChange={(e) => setField("person_name", e.target.value)} placeholder="Shai Eisenman" />
          </Field>
          <Field label="Person title">
            <Input value={form.person_title} onChange={(e) => setField("person_title", e.target.value)} placeholder="Founder & CEO" />
          </Field>
          <Field label="LinkedIn URL">
            <Input value={form.linkedin_url} onChange={(e) => setField("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
          </Field>
          <Field label="Category">
            <Input
              list="outreach-add-category-list"
              value={form.brand_category}
              onChange={(e) => setField("brand_category", e.target.value)}
              placeholder={categories[0] ?? "category"}
            />
            <datalist id="outreach-add-category-list">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Size">
            <Select
              value={form.brand_size}
              onChange={(e) => setField("brand_size", e.target.value as typeof form.brand_size)}
            >
              <option value="">Not set</option>
              <option value="enterprise">Enterprise</option>
              <option value="midsize">Midsize</option>
              <option value="emerging">Emerging</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes" hint="Optional. Anything the drafter should know.">
          <AutoTextarea
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            minRows={3}
            className={textareaClass}
          />
        </Field>
      </div>
    </Modal>
  );
}

type CandidatesForm = { category: string; size: "" | "enterprise" | "midsize" | "emerging"; count: number; focus: string };

function CandidateGenerator({
  open, brandStyle, categories, form, setForm, onGenerate, generating, candidates, selectedKeys,
  onToggleKey, onToggleAllBrand, onAddSelected, bulkAdding, onClose,
}: {
  open: boolean;
  /** The modal is portaled outside the workspace's brand scope, so it re-creates one. */
  brandStyle?: React.CSSProperties;
  categories: string[];
  form: CandidatesForm;
  setForm: React.Dispatch<React.SetStateAction<CandidatesForm>>;
  onGenerate: (e: React.FormEvent) => void;
  generating: boolean;
  candidates: Candidate[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onToggleAllBrand: (brandIdx: number, c: Candidate) => void;
  onAddSelected: () => void;
  bulkAdding: boolean;
  onClose: () => void;
}) {
  const totalContactsFound = candidates.reduce((s, c) => s + (c.contacts?.length ?? 0), 0);
  const hasCandidates = candidates.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Suggest brands"
      description="Generates brands, then searches for 2 to 4 specific contacts per brand (college, influencer, social, experiential, brand exec). Takes about 30 to 90 seconds."
      onSubmit={onGenerate}
      footer={
        <div className="brand-scope contents" style={brandStyle}>
          <div className="min-w-0 text-xs text-ink-3">
            {hasCandidates && (
              <span className="tabular-nums">
                <span className="font-medium text-ink">{candidates.length}</span> brand{candidates.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-ink">{totalContactsFound}</span> contact{totalContactsFound === 1 ? "" : "s"} found ·{" "}
                <span className="font-medium text-ink">{selectedKeys.size}</span> selected
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{hasCandidates ? "Close" : "Cancel"}</Button>
            {hasCandidates ? (
              <>
                <Button variant="brand" type="submit" loading={generating}>
                  {!generating && <Sparkles size={13} />}
                  Regenerate
                </Button>
                <Button
                  variant="primary"
                  onClick={onAddSelected}
                  disabled={selectedKeys.size === 0}
                  loading={bulkAdding}
                >
                  {!bulkAdding && <Plus size={14} />}
                  Add {selectedKeys.size} as target{selectedKeys.size === 1 ? "" : "s"}
                </Button>
              </>
            ) : (
              <Button variant="brand" type="submit" loading={generating}>
                {!generating && <Sparkles size={13} />}
                Generate candidates
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Category" hint="Optional">
            <Input
              list="outreach-suggest-category-list"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Any"
            />
            <datalist id="outreach-suggest-category-list">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Size">
            <Select
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value as typeof form.size }))}
            >
              <option value="">Any</option>
              <option value="enterprise">Enterprise</option>
              <option value="midsize">Midsize</option>
              <option value="emerging">Emerging</option>
            </Select>
          </Field>
          <Field label="Number of brands">
            <Input
              type="number"
              min={3}
              max={20}
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <Field label="Describe what you're looking for" hint="Optional. This brief is weighted above the category filter.">
          <AutoTextarea
            value={form.focus}
            onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))}
            placeholder={'Not sure of the exact category? Describe it in your own words, e.g. "brands that sponsor music festivals and would want to reach a wealthy international crowd in their 20s, ideally ones expanding into Europe". The more context, the better the matches.'}
            minRows={3}
            className={textareaClass}
          />
        </Field>

        {generating && (
          <div className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
            <Loader2 size={14} className="animate-spin text-ink-3" />
            Finding brands and contacts. This can take up to 90 seconds.
          </div>
        )}

        {hasCandidates && (
          <div className="border-t border-line pt-4">
            <SectionHeader title="Results" count={candidates.length} hint="Tick the contacts you want to add." />
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
    </Modal>
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
    <div className="overflow-hidden rounded-xl border border-line bg-raised">
      <div className="flex items-start gap-3 border-b border-line bg-sunken/60 px-4 py-3">
        <input
          type="checkbox"
          checked={allBrandSelected}
          ref={(el) => { if (el) el.indeterminate = !allBrandSelected && someBrandSelected; }}
          onChange={onToggleAllBrand}
          className={checkboxClass}
          aria-label={`Select all contacts at ${c.brand_name}`}
          title="Select or deselect all contacts at this brand"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">{c.brand_name}</span>
            {c.category && <Badge>{c.category}</Badge>}
            {c.size && <Badge className="capitalize">{c.size}</Badge>}
            {contacts.length === 0 && <Badge tone="amber">No contacts found</Badge>}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-ink-2">{c.why_fit}</div>
          {c.seasonality_hook && (
            <div className="mt-1 text-xs leading-relaxed text-ink-3">Hook: {c.seasonality_hook}</div>
          )}
        </div>
      </div>

      {contacts.length > 0 ? (
        <div className="divide-y divide-line">
          {contacts.map((contact, ci) => {
            const key = `${brandIdx}:${ci}`;
            const checked = selectedKeys.has(key);
            return (
              <label
                key={ci}
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors",
                  checked ? "bg-sunken/70" : "hover:bg-hover"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleKey(key)}
                  className={checkboxClass}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-ink">{contact.name}</span>
                    <span className="text-xs text-ink-3">{contact.title}</span>
                  </div>
                  <ContactMeta contact={contact} />
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-hover">
          <input
            type="checkbox"
            checked={placeholderSelected}
            onChange={() => onToggleKey(placeholderKey)}
            className={checkboxClass}
          />
          <span className="text-xs text-ink-3">
            Add this brand as a placeholder (you&apos;ll add the contact manually later)
          </span>
        </label>
      )}
    </div>
  );
}

function TargetCard({
  target, expanded, highlighted, drafting, enriching, findingContacts, foundContacts, selectedFound, copiedKey, isPlaceholder,
  templateALabel, templateBLabel, emailSignature,
  onToggle, onDraft, onEnrich, onFindContacts, onToggleFoundContact, onAddFoundContacts,
  onMarkSent, onMarkReplied, onMarkStatus, onUnsetStatus, onCopy, onDelete,
}: {
  target: OutreachTarget;
  expanded: boolean;
  highlighted: boolean;
  drafting: boolean;
  enriching: boolean;
  findingContacts: boolean;
  foundContacts?: CandidateContact[];
  selectedFound?: Set<number>;
  copiedKey: string | null;
  isPlaceholder: boolean;
  templateALabel: string;
  templateBLabel: string;
  emailSignature: string;
  onToggle: () => void;
  onDraft: () => void;
  onEnrich: () => void;
  onFindContacts: () => void;
  onToggleFoundContact: (idx: number) => void;
  onAddFoundContacts: () => void;
  onMarkSent: (template: "A" | "B" | "Email", firstDMText: string) => void;
  onMarkReplied: () => void;
  onMarkStatus: (s: OutreachStatus) => void;
  onUnsetStatus: () => void;
  onCopy: (text: string, key: string) => void;
  onDelete: () => void;
}) {
  const status = OUTREACH_STATUSES.find((s) => s.value === target.status);
  const drafts: OutreachDrafts | null = target.drafts_json ? JSON.parse(target.drafts_json) : null;
  const signals: OutreachSignals | null = target.signals_json ? JSON.parse(target.signals_json) : null;
  const history: SentHistoryEntry[] = target.sent_history_json ? JSON.parse(target.sent_history_json) : [];
  const canMarkSent = target.status !== "sent" && target.status !== "replied";

  return (
    <div
      id={`outreach-target-${target.id}`}
      className={cn(
        "scroll-mt-28 overflow-hidden rounded-xl border bg-raised shadow-card transition-[box-shadow,border-color] duration-300",
        highlighted ? "border-brand ring-[3px] ring-brand/25" : "border-line"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 basis-60 items-start gap-2 text-left"
        >
          <ChevronDown
            size={14}
            className={cn("mt-1 shrink-0 text-ink-4 transition-transform group-hover:text-ink-3", !expanded && "-rotate-90")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("truncate text-sm font-medium", target.status === "dead" ? "text-ink-3" : "text-ink")}>
                {target.brand_name}
              </span>
              {status && (
                <Badge tone={STATUS_TONES[target.status]} className={target.status === "dead" ? "opacity-60" : undefined}>
                  {status.label}
                </Badge>
              )}
              {target.brand_category && <Badge>{target.brand_category}</Badge>}
              {target.brand_size && <Badge className="capitalize">{target.brand_size}</Badge>}
              {signals && signals.signals.length > 0 && (
                <Badge tone="green">
                  <Search size={10} /> {signals.signals.length} signal{signals.signals.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-ink-3">
              {target.person_name}{target.person_title ? ` · ${target.person_title}` : ""}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {target.linkedin_url && (
            <IconLink href={target.linkedin_url} label="Open LinkedIn" external>
              <ExternalLink size={14} />
            </IconLink>
          )}
          {target.person_email && (
            <IconLink href={`mailto:${target.person_email}`} label={`Email: ${target.person_email}`}>
              <Mail size={14} />
            </IconLink>
          )}
          <Button
            size="sm"
            variant={isPlaceholder ? "primary" : "ghost"}
            onClick={onFindContacts}
            disabled={drafting || enriching}
            loading={findingContacts}
            title={isPlaceholder ? "Find real contacts at this brand (placeholder)" : "Find more contacts at this brand"}
          >
            {!findingContacts && <UserSearch size={13} />}
            {isPlaceholder ? "Find contacts" : "Contacts"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEnrich}
            disabled={drafting || findingContacts}
            loading={enriching}
            title={signals ? "Refresh signals" : "Search web for brand signals"}
          >
            {!enriching && <Search size={13} />}
            {signals ? "Refresh" : "Enrich"}
          </Button>
          <Button
            size="sm"
            variant="brand"
            onClick={onDraft}
            disabled={enriching || findingContacts || isPlaceholder}
            loading={drafting}
            title={isPlaceholder ? "Find a real contact first" : undefined}
          >
            {!drafting && <Sparkles size={13} />}
            {drafts ? "Redraft" : "Draft"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-5 border-t border-line bg-sunken/50 p-4">
          {/* Contacts found */}
          {foundContacts && foundContacts.length > 0 && (
            <div>
              <SubLabel
                icon={UserSearch}
                hint={`${foundContacts.length} at ${target.brand_name}`}
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onAddFoundContacts}
                    disabled={!selectedFound || selectedFound.size === 0}
                  >
                    <Plus size={13} /> Add {selectedFound?.size ?? 0} as targets
                    {isPlaceholder && " (retire placeholder)"}
                  </Button>
                }
              >
                Contacts found
              </SubLabel>
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
                {foundContacts.map((c, idx) => {
                  const checked = selectedFound?.has(idx) ?? false;
                  return (
                    <label
                      key={idx}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors",
                        checked ? "bg-sunken/70" : "hover:bg-hover"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleFoundContact(idx)}
                        className={checkboxClass}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium text-ink">{c.name}</span>
                          <span className="text-xs text-ink-3">{c.title}</span>
                        </div>
                        <ContactMeta contact={c} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Signals */}
          {signals && (
            <details className="group/signals text-xs" open={!drafts}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
                <ChevronDown size={13} className="-rotate-90 text-ink-3 transition-transform group-open/signals:rotate-0" />
                Signals
                <span className="font-normal tabular-nums text-ink-3">{signals.signals.length}</span>
                <span className="font-normal text-ink-3">
                  · fetched {new Date(signals.fetched_at).toLocaleDateString()}
                </span>
              </summary>
              <div className="mt-2 space-y-2 rounded-lg border border-line bg-raised p-3">
                {signals.signals.length === 0 ? (
                  <p className="text-ink-3">No recent public signals found.</p>
                ) : (
                  signals.signals.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 leading-relaxed">
                      <Badge tone="green" className="mt-px shrink-0 capitalize">{s.type}</Badge>
                      <span className="text-[13px] text-ink-2">
                        {s.summary}
                        {s.source && (
                          <a
                            href={s.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open source"
                            title="Open source"
                            className="ml-1.5 inline-flex translate-y-px text-ink-3 hover:text-ink"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </span>
                    </div>
                  ))
                )}
                {signals.summary_for_drafter && signals.signals.length > 0 && (
                  <p className="border-t border-line pt-2 leading-relaxed text-ink-3">
                    <span className="font-medium text-ink-2">Drafter hook:</span> {signals.summary_for_drafter}
                  </p>
                )}
                {signals.fit_rationale && (
                  <p className="border-t border-line pt-2 leading-relaxed text-ink-3">
                    <span className="font-medium text-ink-2">Why it&apos;s a fit:</span> {signals.fit_rationale}
                  </p>
                )}
              </div>
            </details>
          )}

          {/* Drafts */}
          {!drafts && (
            <div className="text-[13px] leading-relaxed text-ink-3">
              No drafts yet.{" "}
              {!signals && (
                <>
                  Click <span className="inline-flex items-center gap-1 font-medium text-ink-2"><Search size={12} /> Enrich</span> to ground in real signals (optional), then{" "}
                </>
              )}
              {signals ? "Click" : "click"}{" "}
              <span className="inline-flex items-center gap-1 font-medium text-ink-2"><Sparkles size={12} /> Draft</span> to generate {templateALabel}, {templateBLabel} and a cold email.
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
                onMarkSent={canMarkSent ? (text) => onMarkSent("A", text) : undefined}
              />
              <DraftBlock
                label={templateBLabel}
                connectionNote={drafts.templateB.connectionNote}
                firstDM={drafts.templateB.firstDM}
                keyPrefix={`b-${target.id}`}
                copiedKey={copiedKey}
                onCopy={onCopy}
                onMarkSent={canMarkSent ? (text) => onMarkSent("B", text) : undefined}
              />
              {drafts.email ? (
                <EmailDraftBlock
                  subject={drafts.email.subject}
                  body={drafts.email.body}
                  toEmail={target.person_email}
                  signature={emailSignature}
                  keyPrefix={`e-${target.id}`}
                  copiedKey={copiedKey}
                  onCopy={onCopy}
                  onMarkSent={canMarkSent ? (text) => onMarkSent("Email", text) : undefined}
                />
              ) : (
                <p className="text-xs leading-relaxed text-ink-3">
                  These drafts predate the email variant. Click{" "}
                  <span className="inline-flex items-center gap-1 font-medium text-ink-2"><Sparkles size={12} /> Redraft</span>{" "}
                  to generate both templates and a cold email together.
                </p>
              )}
              {drafts.reasoning && (
                <p className="text-xs leading-relaxed text-ink-3">
                  <span className="font-medium text-ink-2">Why:</span> {drafts.reasoning}
                </p>
              )}
            </>
          )}

          {/* Notes */}
          {target.notes && target.notes.trim() && (
            <div>
              <SubLabel icon={StickyNote}>Notes</SubLabel>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2">{target.notes}</p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <SubLabel icon={History} hint={String(history.length)}>History</SubLabel>
              <SentHistoryList history={history} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="mr-1 text-xs text-ink-3">Status</span>
            <StatusButton
              active={target.status === "replied"}
              onClick={() => (target.status === "replied" ? onUnsetStatus() : onMarkReplied())}
            >
              Replied
            </StatusButton>
            <StatusButton
              active={target.status === "declined"}
              onClick={() => (target.status === "declined" ? onUnsetStatus() : onMarkStatus("declined"))}
            >
              Declined
            </StatusButton>
            <StatusButton
              active={target.status === "dead"}
              onClick={() => (target.status === "dead" ? onUnsetStatus() : onMarkStatus("dead"))}
            >
              Dead
            </StatusButton>
            <IconButton size="sm" variant="danger" label="Delete target" onClick={onDelete} className="ml-auto">
              <Trash2 size={14} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SentHistoryList({ history }: { history: SentHistoryEntry[] }) {
  return (
    <div className="space-y-2 border-l-2 border-line pl-3">
      {history.map((h, i) => (
        <div key={i} className="text-xs">
          <div className="font-medium text-ink-2">
            {h.follow_up_n === 0 ? `First send${h.template ? ` (Template ${h.template})` : ""}` : `Follow-up #${h.follow_up_n}`}
            <span className="ml-2 font-normal tabular-nums text-ink-3">{new Date(h.at).toLocaleDateString()}</span>
          </div>
          <div className="truncate text-ink-3">{h.text.split("\n")[0]}</div>
        </div>
      ))}
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
  const history: SentHistoryEntry[] = target.sent_history_json ? JSON.parse(target.sent_history_json) : [];
  const nextN = target.followup_count + 1;
  const daysSinceSent = target.sent_at ? Math.floor((Date.now() - target.sent_at) / 86400_000) : 0;
  const text = edited ?? draft?.text ?? "";
  const copyKey = `fu-${target.id}`;
  const copied = copiedKey === copyKey;
  const fieldId = `outreach-followup-${target.id}`;

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">{target.brand_name}</span>
            <Badge tone="amber">
              <Clock size={10} /> Follow-up #{nextN} due
            </Badge>
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-3">
            {target.person_name} · <span className="tabular-nums">Day {daysSinceSent}</span> since first send
          </div>
        </div>
        {target.linkedin_url && (
          <IconLink href={target.linkedin_url} label="Open LinkedIn" external>
            <ExternalLink size={14} />
          </IconLink>
        )}
      </div>

      <div className="space-y-4 border-t border-line bg-sunken/50 p-4">
        {/* Prior sends summary */}
        {history.length > 0 && (
          <details className="group/history text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <ChevronDown size={13} className="-rotate-90 text-ink-3 transition-transform group-open/history:rotate-0" />
              Prior sends
              <span className="font-normal tabular-nums text-ink-3">{history.length}</span>
            </summary>
            <div className="mt-2">
              <SentHistoryList history={history} />
            </div>
          </details>
        )}

        {/* Draft area */}
        {!draft && (
          <Button variant="brand" onClick={onGenerate} loading={drafting} className="w-full">
            {!drafting && <Sparkles size={14} />}
            Generate follow-up #{nextN}
          </Button>
        )}

        {draft && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={fieldId} className="text-xs font-medium text-ink-2">
                Follow-up #{draft.followup_n} draft <span className="font-normal tabular-nums text-ink-3">({text.length} chars)</span>
              </label>
              <Button size="sm" variant="ghost" onClick={() => onCopy(text, copyKey)}>
                {copied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <AutoTextarea
              id={fieldId}
              value={text}
              onChange={(e) => setEdited(e.target.value)}
              minRows={3}
              className={textareaClass}
            />
            {draft.reasoning && (
              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                <span className="font-medium text-ink-2">Angle:</span> {draft.reasoning}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => onMarkSent(text)}>
                <Send size={12} /> Mark follow-up sent
              </Button>
              <Button size="sm" variant="ghost" onClick={onGenerate} loading={drafting}>
                {!drafting && <RotateCcw size={12} />}
                Regenerate
              </Button>
            </div>
          </div>
        )}

        {/* Status actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="mr-1 text-xs text-ink-3">Or</span>
          <StatusButton onClick={onMarkReplied}>Mark replied</StatusButton>
          <StatusButton onClick={() => onMarkStatus("declined")}>Declined</StatusButton>
          <StatusButton onClick={() => onMarkStatus("dead")}>Dead</StatusButton>
          <Button
            size="sm"
            variant="ghost"
            onClick={onResetCadence}
            className="ml-auto"
            title="Reset cadence, back to queued"
          >
            Reset
          </Button>
        </div>
      </div>
    </Card>
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
    <div>
      <SubLabel
        icon={Send}
        action={
          onMarkSent && (
            <Button size="sm" variant="primary" onClick={() => onMarkSent(dmText)}>
              <Send size={12} /> Sent this{dmEdited && " (edited)"}
            </Button>
          )
        }
      >
        {label}
      </SubLabel>
      <div className="space-y-3">
        <DraftLine
          sublabel="Connection note"
          counter={`${noteText.length}/300`}
          edited={noteEdited}
          text={noteText}
          onChange={setNoteText}
          keyId={`${keyPrefix}-note`}
          copiedKey={copiedKey}
          onCopy={onCopy}
          minRows={2}
        />
        <DraftLine
          sublabel="First DM"
          counter={`${dmText.length}/600`}
          edited={dmEdited}
          text={dmText}
          onChange={setDmText}
          keyId={`${keyPrefix}-dm`}
          copiedKey={copiedKey}
          onCopy={onCopy}
          minRows={3}
        />
      </div>
    </div>
  );
}

function EmailDraftBlock({
  subject, body, toEmail, signature, keyPrefix, copiedKey, onCopy, onMarkSent,
}: {
  subject: string;
  body: string;
  toEmail: string | null;
  /** Plain-text signature appended to the Gmail compose link (Gmail won't add the saved one to a pre-filled draft). */
  signature: string;
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
  // Gmail compose deep-link: opens a pre-filled draft in whichever Google
  // account is active in the browser (to + subject + body). Gmail does NOT add
  // your saved signature when body is pre-filled, so we append it ourselves.
  const sig = signature.trim();
  const gmailBody = sig ? `${bodyText}\n\n${sig}` : bodyText;
  const gmailHref = toEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(gmailBody)}`
    : null;
  const emailCopied = copiedKey === `${keyPrefix}-addr`;

  return (
    <div>
      <SubLabel
        icon={Mail}
        hint="Cold email variant"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {toEmail && (
              <Button size="sm" onClick={() => onCopy(toEmail, `${keyPrefix}-addr`)} title={toEmail}>
                {emailCopied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
                {emailCopied ? "Copied" : "Copy email"}
              </Button>
            )}
            {gmailHref && (
              <a href={gmailHref} target="_blank" rel="noopener noreferrer" className={linkButtonSecondary}>
                <Mail size={12} /> Open in Gmail
              </a>
            )}
            {onMarkSent && (
              <Button size="sm" variant="primary" onClick={() => onMarkSent(bodyText)}>
                <Send size={12} /> Sent this{bodyEdited && " (edited)"}
              </Button>
            )}
          </div>
        }
      >
        Email
      </SubLabel>
      <div className="space-y-3">
        <DraftLine
          sublabel="Subject"
          counter={`${subjectText.length}/70`}
          edited={subjectEdited}
          text={subjectText}
          onChange={setSubjectText}
          keyId={`${keyPrefix}-subject`}
          copiedKey={copiedKey}
          onCopy={onCopy}
          minRows={1}
        />
        <DraftLine
          sublabel="Body"
          counter={`${bodyText.length}/900`}
          edited={bodyEdited}
          text={bodyText}
          onChange={setBodyText}
          keyId={`${keyPrefix}-body`}
          copiedKey={copiedKey}
          onCopy={onCopy}
          minRows={4}
        />
      </div>
      {sig && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-3">
          <PenLine size={12} /> Your signature is appended to the Gmail draft.
        </p>
      )}
      {!toEmail && (
        <p className="mt-2 text-xs text-ink-3">
          No email on file for this contact. Run Find contacts to pull one, or copy the draft manually.
        </p>
      )}
    </div>
  );
}

function DraftLine({
  sublabel, counter, edited, text, onChange, keyId, copiedKey, onCopy, minRows,
}: {
  sublabel: string;
  counter: string;
  edited: boolean;
  text: string;
  onChange: (next: string) => void;
  keyId: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  minRows?: number;
}) {
  const copied = copiedKey === keyId;
  const fieldId = `outreach-draft-${keyId}`;
  // Not a <Field>: a <label> wrapping the Copy button would click it when the label text is pressed.
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          {sublabel}
          <span className="font-normal tabular-nums text-ink-3">{counter}</span>
          {edited && <Badge>Edited</Badge>}
        </label>
        <Button size="sm" variant="ghost" onClick={() => onCopy(text, keyId)}>
          {copied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <AutoTextarea
        id={fieldId}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        minRows={minRows ?? 2}
        spellCheck
        className={cn(textareaClass, "whitespace-pre-wrap")}
      />
    </div>
  );
}

const CONFIDENCE_TONES: Record<CandidateContact["confidence"], BadgeTone> = {
  high: "green",
  medium: "amber",
  low: "neutral",
};

function ContactMeta({ contact }: { contact: CandidateContact }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <Badge tone={ROLE_TONES[contact.role_category] ?? "neutral"}>
        {ROLE_LABELS[contact.role_category] ?? contact.role_category}
      </Badge>
      <Badge tone={CONFIDENCE_TONES[contact.confidence] ?? "neutral"} className="capitalize">
        {contact.confidence}
      </Badge>
      {contact.origin && (
        <span title={contact.origin === "apollo" ? "Verified via Apollo" : "Discovered via web search"}>
          <Badge tone={contact.origin === "apollo" ? "sky" : "neutral"}>
            {contact.origin === "apollo" ? <ShieldCheck size={10} /> : <Search size={10} />}
            {contact.origin === "apollo" ? "Apollo" : "Web search"}
          </Badge>
        </span>
      )}
      {contact.linkedin_url ? (
        <a
          href={contact.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"
        >
          <ExternalLink size={12} /> LinkedIn
        </a>
      ) : (
        <span className="text-ink-4">No LinkedIn URL</span>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"
          title={contact.email}
        >
          <Mail size={12} /> Email
        </a>
      )}
      {contact.source && (
        <a
          href={contact.source}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"
        >
          Source <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

function StatusButton({
  onClick, active, disabled, children,
}: { onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button
      size="sm"
      variant={active ? "primary" : "secondary"}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={active ? "Click again to undo" : undefined}
    >
      {children}
    </Button>
  );
}
