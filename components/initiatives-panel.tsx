"use client";

import { useState } from "react";
import type { Initiative, InitiativeLink } from "@/lib/types";
import { INITIATIVE_KINDS, INITIATIVE_HORIZONS, INITIATIVE_STATUSES } from "@/lib/types";
import {
  Plus, Trash2, X, Target, CalendarDays, ArrowRight, CircleCheck, Circle, PauseCircle, Link2,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { AutoTextarea } from "@/components/auto-textarea";

const EMPTY_FORM = {
  title: "",
  kind: "project" as Initiative["kind"],
  horizon: "now" as Initiative["horizon"],
  status: "active" as Initiative["status"],
  next_step: "",
  target_date: "",
  notes: "",
  links: [] as InitiativeLink[],
};

type InitiativeForm = typeof EMPTY_FORM;

function formToPayload(form: InitiativeForm) {
  return {
    title: form.title.trim(),
    kind: form.kind,
    horizon: form.horizon,
    status: form.status,
    next_step: form.next_step.trim() || null,
    target_date: form.target_date || null,
    notes: form.notes.trim() || null,
    links: form.links.filter((l) => l.url.trim()),
  };
}

function initiativeToForm(i: Initiative): InitiativeForm {
  return {
    title: i.title,
    kind: i.kind,
    horizon: i.horizon,
    status: i.status,
    next_step: i.next_step ?? "",
    target_date: i.target_date ?? "",
    notes: i.notes ?? "",
    links: i.links,
  };
}

/** Chip text for a link without a label: its hostname, minus "www.". */
function linkLabel(l: InitiativeLink): string {
  if (l.label) return l.label;
  try {
    return new URL(l.url).hostname.replace(/^www\./, "");
  } catch {
    return l.url;
  }
}

function targetLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function InitiativesPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: Initiative[];
}) {
  const [items, setItems] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const shareHeaders = useShareHeaders();

  async function add(form: InitiativeForm) {
    const res = await fetch("/api/initiatives", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, ...formToPayload(form) }),
    });
    if (res.ok) {
      const created: Initiative = await res.json();
      setItems((prev) => [created, ...prev]);
      setShowAdd(false);
    }
  }

  async function update(id: number, patch: Partial<Initiative>) {
    const res = await fetch(`/api/initiatives/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: Initiative = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditingId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this initiative?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setEditingId(null);
    await fetch(`/api/initiatives/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  function toggleDone(i: Initiative) {
    update(i.id, { status: i.status === "done" ? "active" : "done" });
  }

  const active = items.filter((i) => i.status === "active");
  const byHorizon = (h: Initiative["horizon"]) => active.filter((i) => i.horizon === h);
  const onHold = items.filter((i) => i.status === "on_hold");
  const done = items
    .filter((i) => i.status === "done")
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));

  const rowProps = (i: Initiative) => ({
    initiative: i,
    isEditing: editingId === i.id,
    onStartEdit: () => setEditingId(i.id),
    onCancelEdit: () => setEditingId(null),
    onSave: (form: InitiativeForm) => update(i.id, formToPayload(form)),
    onDelete: () => remove(i.id),
    onToggleDone: () => toggleDone(i),
  });

  return (
    <div className="space-y-6">
      {/* Summary + add */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-zinc-900 dark:text-zinc-100 font-medium">{byHorizon("now").length}</span> in focus now
          {active.length > byHorizon("now").length && (
            <>
              <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium">{active.length - byHorizon("now").length}</span> queued
            </>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> New initiative
        </button>
      </div>

      {showAdd && (
        <InitiativeFormCard
          initial={EMPTY_FORM}
          submitLabel="Create initiative"
          onSubmit={add}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {items.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="flex flex-col items-center gap-3 py-12 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
              <Target size={20} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No initiatives yet</div>
              <div className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                Initiatives are the big things — key projects, major clients, and priorities to keep top of mind. Bigger than a todo, tracked over weeks.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {INITIATIVE_HORIZONS.map((h) => {
            const group = byHorizon(h.value);
            if (group.length === 0 && h.value !== "now") return null;
            return (
              <Section key={h.value} title={h.label} hint={h.hint} count={group.length}>
                {group.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-zinc-400">
                    Nothing in focus — promote something from Next, or add a new initiative.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {group.map((i) => <InitiativeRow key={i.id} {...rowProps(i)} />)}
                  </div>
                )}
              </Section>
            );
          })}

          {onHold.length > 0 && (
            <Section title="On hold" count={onHold.length} muted>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {onHold.map((i) => <InitiativeRow key={i.id} {...rowProps(i)} />)}
              </div>
            </Section>
          )}

          {done.length > 0 && (
            <Section title="Done" count={done.length} muted>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {done.map((i) => <InitiativeRow key={i.id} {...rowProps(i)} />)}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ── Row + edit modal ──────────────────────────────────────────────────────────

function InitiativeRow({
  initiative, isEditing, onStartEdit, onCancelEdit, onSave, onDelete, onToggleDone,
}: {
  initiative: Initiative;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (form: InitiativeForm) => void;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  const kind = INITIATIVE_KINDS.find((k) => k.value === initiative.kind) ?? INITIATIVE_KINDS[0];
  const isDone = initiative.status === "done";
  const isHeld = initiative.status === "on_hold";

  return (
    <>
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center bg-black/50 sm:p-8 overflow-y-auto">
          <div className="w-full sm:max-w-xl bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-xl shadow-2xl sm:mt-4 sm:mb-8 safe-bottom">
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit initiative</h2>
              <button onClick={onCancelEdit} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 pt-2">
              <InitiativeFormCard
                initial={initiativeToForm(initiative)}
                submitLabel="Save"
                onSubmit={onSave}
                onCancel={onCancelEdit}
                onDelete={onDelete}
                bare
              />
            </div>
          </div>
        </div>
      )}
      <div className={`flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${isDone ? "opacity-60" : ""}`}>
        {/* Done toggle */}
        <button
          onClick={onToggleDone}
          title={isDone ? "Reopen" : "Mark done"}
          className="shrink-0 mt-0.5 text-zinc-300 dark:text-zinc-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        >
          {isDone ? <CircleCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
            : isHeld ? <PauseCircle size={18} className="text-amber-500/70" />
            : <Circle size={18} />}
        </button>

        {/* Body — click to edit; link chips are real anchors outside the button */}
        <div className="min-w-0 flex-1">
          <button onClick={onStartEdit} className="block w-full text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${isDone ? "line-through decoration-zinc-400" : ""}`}>
                {initiative.title}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${kind.color}`}>{kind.label}</span>
              {initiative.target_date && !isDone && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500">
                  <CalendarDays size={10} /> {targetLabel(initiative.target_date)}
                </span>
              )}
            </div>
            {initiative.next_step && !isDone && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                <ArrowRight size={11} className="shrink-0 text-zinc-400" />
                <span className="truncate">{initiative.next_step}</span>
              </div>
            )}
            {initiative.notes && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1 line-clamp-1">{initiative.notes}</p>
            )}
          </button>
          {initiative.links.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {initiative.links.map((l, idx) => (
                <a
                  key={`${l.url}-${idx}`}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(ev) => ev.stopPropagation()}
                  title={l.url}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors max-w-[220px]"
                >
                  <Link2 size={10} className="shrink-0" />
                  <span className="truncate">{linkLabel(l)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Add/edit form ─────────────────────────────────────────────────────────────

function InitiativeFormCard({
  initial, submitLabel, onSubmit, onCancel, onDelete, bare,
}: {
  initial: InitiativeForm;
  submitLabel: string;
  onSubmit: (form: InitiativeForm) => void;
  onCancel: () => void;
  onDelete?: () => void;
  bare?: boolean;
}) {
  const [form, setForm] = useState<InitiativeForm>(initial);
  function set<K extends keyof InitiativeForm>(key: K, val: InitiativeForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        onSubmit(form);
      }}
      className={bare ? "space-y-3" : "rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 space-y-3"}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title *" full>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="e.g. Land the Red Bull partnership" autoFocus />
        </Field>
        <Field label="Type" full>
          <Segmented
            options={INITIATIVE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            value={form.kind}
            onChange={(v) => set("kind", v as Initiative["kind"])}
          />
        </Field>
        <Field label="Horizon" full>
          <Segmented
            options={INITIATIVE_HORIZONS.map((h) => ({ value: h.value, label: h.label, hint: h.hint }))}
            value={form.horizon}
            onChange={(v) => set("horizon", v as Initiative["horizon"])}
          />
        </Field>
        <Field label="Next step" full>
          <input value={form.next_step} onChange={(e) => set("next_step", e.target.value)} className={inputCls} placeholder="The one next move, e.g. send the deck to Maria" />
        </Field>
        <Field label="Target date">
          <input type="date" value={form.target_date} onChange={(e) => set("target_date", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set("status", e.target.value as Initiative["status"])} className={inputCls}>
            {INITIATIVE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Links" full>
          <LinksEditor links={form.links} onChange={(v) => set("links", v)} />
        </Field>
        <Field label="Notes" full>
          <AutoTextarea value={form.notes} onChange={(e) => set("notes", e.target.value)} minRows={4} className={`${inputCls} resize-none leading-relaxed`} placeholder="Context, why it matters, key people, open questions…" />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <button type="button" onClick={onDelete} className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 inline-flex items-center gap-1">
            <Trash2 size={12} /> Delete
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-3 py-1.5">
            Cancel
          </button>
          <button type="submit" disabled={!form.title.trim()} className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40">
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Editable list of {label, url} link rows. */
function LinksEditor({
  links, onChange,
}: {
  links: InitiativeLink[];
  onChange: (next: InitiativeLink[]) => void;
}) {
  function setLink(idx: number, patch: Partial<InitiativeLink>) {
    onChange(links.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  return (
    <div className="space-y-2">
      {links.map((l, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            value={l.label ?? ""}
            onChange={(e) => setLink(idx, { label: e.target.value })}
            className={`${inputCls} w-32 sm:w-40 shrink-0`}
            placeholder="Label (optional)"
          />
          <input
            value={l.url}
            onChange={(e) => setLink(idx, { url: e.target.value })}
            className={inputCls}
            placeholder="https://…"
            autoFocus={l.url === "" && idx === links.length - 1}
          />
          <button
            type="button"
            onClick={() => onChange(links.filter((_, i) => i !== idx))}
            className="shrink-0 p-1.5 text-zinc-400 hover:text-red-500 rounded"
            title="Remove link"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...links, { label: null, url: "" }])}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
      >
        <Plus size={12} /> Add link
      </button>
    </div>
  );
}

/** Pill-style single-select. */
function Segmented({
  options, value, onChange,
}: {
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.hint}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function Section({
  title, hint, count, muted, children,
}: { title: string; hint?: string; count: number; muted?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${muted ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-500"}`}>
            {title}
          </h2>
          {hint && <span className="text-[11px] text-zinc-400 dark:text-zinc-600 normal-case">{hint}</span>}
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-zinc-500 bg-zinc-100 dark:bg-zinc-900">{count}</span>
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

const inputCls =
  "w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 rounded outline-none focus:border-zinc-500 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600";
