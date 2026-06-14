"use client";

import { useState, useEffect, useRef } from "react";
import type { Lead, LeadAttachment, LeadCategory } from "@/lib/types";
import { LEAD_STAGES } from "@/lib/types";
import { Plus, Trash2, Link2, Paperclip, X, Upload, ExternalLink, Download, TrendingUp, Tag, Settings2, Check } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";

const STAGE_LABELS: Record<Lead["stage"], string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

// Distinct, readable badge colors assigned to categories by their position.
const CATEGORY_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
];
const UNCATEGORIZED = "__uncategorized__";

function money(cents: number | null) {
  if (!cents) return "";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function PipelinePanel({
  businessId,
  initial,
  categories: initialCategories = [],
  categoriesEnabled = false,
}: {
  businessId: string;
  initial: Lead[];
  categories?: LeadCategory[];
  categoriesEnabled?: boolean;
}) {
  const [leads, setLeads] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cats, setCats] = useState<LeadCategory[]>(initialCategories);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showManageCats, setShowManageCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const shareHeaders = useShareHeaders();

  const catNames = cats.map((c) => c.name);
  // Map category name → badge color class (by position, stable per list order).
  const catColor = (name: string | null) => {
    if (!name) return "";
    const idx = catNames.indexOf(name);
    return idx >= 0 ? CATEGORY_COLORS[idx % CATEGORY_COLORS.length] : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  };

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    const res = await fetch("/api/lead-categories", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, name }),
    });
    if (res.ok) {
      const created: LeadCategory = await res.json();
      setCats((prev) => [...prev, created]);
      setNewCatName("");
    } else if (res.status === 409) {
      alert("A category with that name already exists.");
    }
  }

  async function deleteCategory(cat: LeadCategory) {
    if (!confirm(`Delete the "${cat.name}" category? Leads tagged with it will become uncategorized.`)) return;
    setCats((prev) => prev.filter((c) => c.id !== cat.id));
    setLeads((prev) => prev.map((l) => (l.categories.includes(cat.name) ? { ...l, categories: l.categories.filter((c) => c !== cat.name) } : l)));
    if (categoryFilter === cat.name) setCategoryFilter("all");
    await fetch(`/api/lead-categories/${cat.id}`, { method: "DELETE", headers: shareHeaders });
  }

  async function add(form: NewLeadForm) {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, ...form }),
    });
    if (res.ok) {
      const created: Lead = await res.json();
      setLeads((prev) => [created, ...prev]);
      setShowAdd(false);
    }
  }

  async function update(id: number, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: Lead = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this lead?")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setEditingId(null);
    await fetch(`/api/leads/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  const totalPipeline = leads
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .reduce((s, l) => s + (l.value_cents ?? 0), 0);
  const totalWon = leads
    .filter((l) => l.stage === "won")
    .reduce((s, l) => s + (l.value_cents ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            <span className="text-zinc-900 dark:text-zinc-100 font-medium">{leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length}</span> active
            <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-900 dark:text-zinc-100 font-medium">{money(totalPipeline) || "$0"}</span> pipeline
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{money(totalWon) || "$0"}</span> closed
          </span>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white inline-flex items-center gap-1.5"
        >
          <Plus size={14} />
          New lead
        </button>
      </div>

      {/* Category filter + management (feature-flagged per business) */}
      {categoriesEnabled && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CatPill active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
              All <span className="opacity-50">{leads.length}</span>
            </CatPill>
            {cats.map((c) => {
              const count = leads.filter((l) => l.categories.includes(c.name)).length;
              return (
                <CatPill
                  key={c.id}
                  active={categoryFilter === c.name}
                  color={catColor(c.name)}
                  onClick={() => setCategoryFilter(c.name)}
                >
                  {c.name} <span className="opacity-60">{count}</span>
                </CatPill>
              );
            })}
            {leads.some((l) => l.categories.length === 0) && (
              <CatPill active={categoryFilter === UNCATEGORIZED} onClick={() => setCategoryFilter(UNCATEGORIZED)}>
                Uncategorized <span className="opacity-50">{leads.filter((l) => l.categories.length === 0).length}</span>
              </CatPill>
            )}
            <button
              onClick={() => setShowManageCats((v) => !v)}
              className={`ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                showManageCats
                  ? "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Settings2 size={12} /> Manage
            </button>
          </div>

          {showManageCats && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3 space-y-2.5">
              <form onSubmit={addCategory} className="flex gap-2">
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category name (e.g. Healthcare, Logistics)"
                  className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                />
                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="shrink-0 inline-flex items-center gap-1.5 bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40"
                >
                  <Plus size={14} /> Add
                </button>
              </form>
              {cats.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {cats.map((c) => (
                    <span key={c.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${catColor(c.name)}`}>
                      {c.name}
                      <button onClick={() => deleteCategory(c)} className="hover:text-rose-600 dark:hover:text-rose-400" title="Delete category">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">No categories yet. Add one above, then tag leads when you create or edit them.</p>
              )}
            </div>
          )}
        </div>
      )}

      {showAdd && <NewLeadCard onCreate={add} onCancel={() => setShowAdd(false)} categories={categoriesEnabled ? catNames : undefined} />}

      <div className="space-y-5">
        {LEAD_STAGES.map((stage) => {
          const stageLeads = leads.filter(
            (l) =>
              l.stage === stage &&
              (categoryFilter === "all" ||
                (categoryFilter === UNCATEGORIZED ? l.categories.length === 0 : l.categories.includes(categoryFilter)))
          );
          if (stageLeads.length === 0) return null;
          return (
            <div key={stage}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{STAGE_LABELS[stage]}</div>
                <div className="text-xs text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded-full">{stageLeads.length}</div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-900 overflow-hidden">
                {stageLeads.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    isEditing={editingId === l.id}
                    categories={categoriesEnabled ? catNames : undefined}
                    catColor={catColor}
                    onStartEdit={() => setEditingId(l.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onUpdate={(patch) => update(l.id, patch)}
                    onDelete={() => remove(l.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {leads.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
              <TrendingUp size={20} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No leads yet</div>
              <div className="text-xs text-zinc-400">Click &ldquo;New lead&rdquo; to start tracking your pipeline.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type NewLeadForm = {
  name: string;
  company?: string;
  contact_email?: string;
  stage: Lead["stage"];
  value_cents?: number;
  next_action?: string;
  next_action_date?: string;
  categories?: string[];
};

function NewLeadCard({
  onCreate,
  onCancel,
  categories,
}: {
  onCreate: (form: NewLeadForm) => void;
  onCancel: () => void;
  categories?: string[];
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Lead["stage"]>("new");
  const [value, setValue] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate({
          name: name.trim(),
          company: company.trim() || undefined,
          contact_email: email.trim() || undefined,
          stage,
          value_cents: value ? Math.round(parseFloat(value) * 100) : undefined,
          next_action: nextAction.trim() || undefined,
          next_action_date: nextDate || undefined,
          categories: categories ? selectedCats : undefined,
        });
      }}
      className="rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 grid grid-cols-2 gap-3"
    >
      <Field label="Name / Lead">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Required" autoFocus />
      </Field>
      <Field label="Company">
        <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Stage">
        <select value={stage} onChange={(e) => setStage(e.target.value as Lead["stage"])} className={inputCls}>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Value ($)">
        <input value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder="e.g. 5000" />
      </Field>
      <Field label="Next action date">
        <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={inputCls} />
      </Field>
      {categories && (
        <Field label="Categories" full>
          <CategoryMultiSelect all={categories} selected={selectedCats} onChange={setSelectedCats} />
        </Field>
      )}
      <Field label="Next action" full>
        <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={inputCls} placeholder="e.g. Send proposal" />
      </Field>
      <div className="col-span-2 flex justify-end gap-2 mt-1">
        <button type="button" onClick={onCancel} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-3 py-1.5">
          Cancel
        </button>
        <button type="submit" className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white">
          Create lead
        </button>
      </div>
    </form>
  );
}

function LeadCard({
  lead,
  isEditing,
  categories,
  catColor,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  lead: Lead;
  isEditing: boolean;
  categories?: string[];
  catColor?: (name: string) => string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (patch: Partial<Lead>) => void;
  onDelete: () => void;
}) {
  return (
    <>
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={onCancelEdit} />
          <div className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl bg-white dark:bg-zinc-950 shadow-xl">
            <EditLeadCard
              lead={lead}
              categories={categories}
              onSave={(patch) => { onUpdate(patch); onCancelEdit(); }}
              onCancel={onCancelEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      )}
      <button
        onClick={onStartEdit}
        className="block w-full text-left bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 px-4 py-3 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{lead.company || lead.name}</div>
            {lead.company && <div className="text-xs text-zinc-500 mt-0.5">{lead.name}</div>}
            {categories && lead.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {lead.categories.map((cat) => (
                  <span key={cat} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${catColor?.(cat) ?? ""}`}>
                    <Tag size={9} /> {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {lead.value_cents ? (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{money(lead.value_cents)}</span>
            ) : null}
            {lead.next_action && (
              <span className="text-xs text-zinc-400 dark:text-zinc-600 text-right max-w-[160px]">{lead.next_action}</span>
            )}
          </div>
        </div>
      </button>
    </>
  );
}

function EditLeadCard({
  lead,
  categories,
  onSave,
  onCancel,
  onDelete,
}: {
  lead: Lead;
  categories?: string[];
  onSave: (patch: Partial<Lead>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(lead.name);
  const [company, setCompany] = useState(lead.company ?? "");
  const [email, setEmail] = useState(lead.contact_email ?? "");
  const [stage, setStage] = useState<Lead["stage"]>(lead.stage);
  const [value, setValue] = useState(lead.value_cents ? (lead.value_cents / 100).toString() : "");
  const [nextAction, setNextAction] = useState(lead.next_action ?? "");
  const [nextDate, setNextDate] = useState(lead.next_action_date ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [selectedCats, setSelectedCats] = useState<string[]>(lead.categories);

  const [attachments, setAttachments] = useState<LeadAttachment[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareHeaders = useShareHeaders();

  useEffect(() => {
    fetch(`/api/leads/${lead.id}/attachments`, { headers: shareHeaders })
      .then((r) => r.ok ? r.json() : [])
      .then(setAttachments);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    const res = await fetch(`/api/leads/${lead.id}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ url, label: linkLabel.trim() || null }),
    });
    if (res.ok) {
      const created = await res.json();
      setAttachments((prev) => [...prev, created]);
      setLinkUrl("");
      setLinkLabel("");
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/leads/${lead.id}/attachments`, {
      method: "POST",
      headers: shareHeaders,
      body: form,
    });
    if (res.ok) {
      const created = await res.json();
      setAttachments((prev) => [...prev, created]);
    }
    setUploading(false);
  }

  async function removeAttachment(id: number) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE", headers: shareHeaders });
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          company: company || null,
          contact_email: email || null,
          stage,
          value_cents: value ? Math.round(parseFloat(value) * 100) : null,
          next_action: nextAction || null,
          next_action_date: nextDate || null,
          notes: notes || null,
          ...(categories ? { categories: selectedCats } : {}),
        });
      }}
      className="bg-white dark:bg-zinc-950 p-5 space-y-3"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Name" />
      <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="Company" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="Email" />
      <select value={stage} onChange={(e) => setStage(e.target.value as Lead["stage"])} className={inputCls}>
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {categories && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
            <Tag size={10} /> Categories
          </div>
          <CategoryMultiSelect
            all={Array.from(new Set([...categories, ...selectedCats]))}
            selected={selectedCats}
            onChange={setSelectedCats}
          />
        </div>
      )}
      <input value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder="Value ($)" />
      <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={inputCls} placeholder="Next action" />
      <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={inputCls} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} min-h-16`} placeholder="Notes" />

      {/* Attachments */}
      <div className="pt-1">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Attachments</div>

        {attachments.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5">
                {a.type === "link" ? (
                  <Link2 size={12} className="text-zinc-400 shrink-0" />
                ) : (
                  <Paperclip size={12} className="text-zinc-400 shrink-0" />
                )}
                <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">
                  {a.label || a.filename || a.url}
                </span>
                {a.file_size && (
                  <span className="text-[10px] text-zinc-400 shrink-0">{formatBytes(a.file_size)}</span>
                )}
                {a.type === "link" ? (
                  <a
                    href={a.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                  >
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <a
                    href={`/api/attachments/${a.id}/file`}
                    download={a.filename ?? undefined}
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 shrink-0"
                  >
                    <Download size={12} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add link */}
        <div className="flex gap-1.5 mb-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Paste a link…"
            className={`${inputCls} flex-1`}
          />
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label"
            className={`${inputCls} w-24`}
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!linkUrl.trim()}
            className="shrink-0 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs px-2.5 py-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Link2 size={11} /> Add
          </button>
        </div>

        {/* Upload file */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md py-2 text-xs text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Upload size={12} />
          {uploading ? "Uploading…" : "Upload file"}
        </button>
      </div>

      <div className="flex justify-between items-center pt-1">
        <button type="button" onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 inline-flex items-center gap-1">
          <Trash2 size={12} /> Delete
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-2 py-1">
            Cancel
          </button>
          <button type="submit" className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium px-2.5 py-1 rounded">
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

const inputCls =
  "w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 rounded outline-none focus:border-zinc-500 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function CategoryMultiSelect({
  all, selected, onChange,
}: { all: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  if (all.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        No categories yet — add some via <span className="font-medium">Manage</span> at the top of the pipeline.
      </p>
    );
  }
  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((name) => {
        const on = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => toggle(name)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
              on
                ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {on ? <Check size={11} /> : <Plus size={11} />}
            {name}
          </button>
        );
      })}
    </div>
  );
}

function CatPill({
  active, color, onClick, children,
}: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? "border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : color
            ? `border-transparent ${color} hover:opacity-80`
            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
