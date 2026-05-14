"use client";

import { useState } from "react";
import type { Lead } from "@/lib/types";
import { LEAD_STAGES } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

const STAGE_LABELS: Record<Lead["stage"], string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

function money(cents: number | null) {
  if (!cents) return "";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function PipelinePanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: Lead[];
}) {
  const [leads, setLeads] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function add(form: NewLeadForm) {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: Lead = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    }
  }

  async function remove(id: number) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setEditingId(null);
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  const totalPipeline = leads
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .reduce((s, l) => s + (l.value_cents ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-zinc-900 dark:text-zinc-100 font-medium">{leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length}</span> active
          <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
          <span className="text-zinc-900 dark:text-zinc-100 font-medium">{money(totalPipeline)}</span> pipeline
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white inline-flex items-center gap-1.5"
        >
          <Plus size={14} />
          New lead
        </button>
      </div>

      {showAdd && <NewLeadCard onCreate={add} onCancel={() => setShowAdd(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {LEAD_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage);
          return (
            <div key={stage} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/60 dark:bg-zinc-950/60 p-3 min-h-[200px]">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  {STAGE_LABELS[stage]}
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-600">{stageLeads.length}</div>
              </div>
              <div className="space-y-2">
                {stageLeads.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    isEditing={editingId === l.id}
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
};

function NewLeadCard({
  onCreate,
  onCancel,
}: {
  onCreate: (form: NewLeadForm) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Lead["stage"]>("new");
  const [value, setValue] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");

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
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  lead: Lead;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (patch: Partial<Lead>) => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <EditLeadCard lead={lead} onSave={(patch) => { onUpdate(patch); onCancelEdit(); }} onCancel={onCancelEdit} onDelete={onDelete} />
    );
  }
  return (
    <button
      onClick={onStartEdit}
      className="block w-full text-left rounded-md border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-800 p-3 transition-colors"
    >
      <div className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{lead.name}</div>
      {lead.company && <div className="text-xs text-zinc-500 truncate mt-0.5">{lead.company}</div>}
      <div className="flex items-center justify-between mt-2">
        {lead.value_cents ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">{money(lead.value_cents)}</span>
        ) : (
          <span />
        )}
        {lead.next_action && (
          <span className="text-[10px] text-zinc-500 truncate ml-2">{lead.next_action}</span>
        )}
      </div>
    </button>
  );
}

function EditLeadCard({
  lead,
  onSave,
  onCancel,
  onDelete,
}: {
  lead: Lead;
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
        });
      }}
      className="rounded-md border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 space-y-2"
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
      <input value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} placeholder="Value ($)" />
      <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={inputCls} placeholder="Next action" />
      <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={inputCls} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} min-h-16`} placeholder="Notes" />
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
