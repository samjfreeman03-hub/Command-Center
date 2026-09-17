"use client";

import { useEffect, useState } from "react";
import type { Initiative, InitiativeLink } from "@/lib/types";
import { INITIATIVE_KINDS, INITIATIVE_HORIZONS, INITIATIVE_STATUSES } from "@/lib/types";
import {
  Plus, Trash2, X, Target, CalendarDays, ArrowRight, ArrowUp, ArrowDown, CircleCheck, Circle, PauseCircle, Link2,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { cn } from "@/lib/cn";
import { AutoTextarea } from "@/components/auto-textarea";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Field, textareaClass, FieldGroup } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, Card, EmptyState, SectionHeader, type BadgeTone } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";

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

const KIND_TONES: Record<Initiative["kind"], BadgeTone> = {
  project: "violet",
  client: "green",
  idea: "amber",
  watch: "sky",
};

const HORIZON_ORDER: Initiative["horizon"][] = ["now", "next", "later"];

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

function horizonLabel(h: Initiative["horizon"]): string {
  return INITIATIVE_HORIZONS.find((x) => x.value === h)?.label ?? h;
}

type Editor = { mode: "new" } | { mode: "edit"; id: number } | null;

export function InitiativesPanel({
  businessId,
  initial,
  openId,
  autoNew,
}: {
  businessId: string;
  initial: Initiative[];
  openId?: number;
  autoNew?: boolean;
}) {
  const [items, setItems] = usePanelState("initiatives", initial);
  const [editor, setEditor] = useState<Editor>(null);
  const shareHeaders = useShareHeaders();

  // Deep links: open a record's editor, or the create form
  useEffect(() => {
    if (openId == null) return;
    if (items.some((i) => i.id === openId)) setEditor({ mode: "edit", id: openId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  useEffect(() => {
    if (autoNew) setEditor({ mode: "new" });
  }, [autoNew]);

  async function add(form: InitiativeForm): Promise<boolean> {
    try {
      const res = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ business_id: businessId, ...formToPayload(form) }),
      });
      if (!res.ok) throw new Error();
      const created: Initiative = await res.json();
      setItems((prev) => [created, ...prev]);
      return true;
    } catch {
      toast("Could not create initiative", { tone: "error" });
      return false;
    }
  }

  /** PATCH with an optimistic update. Rolls back and toasts `failMessage` on failure. */
  async function update(id: number, patch: Partial<Initiative>, failMessage = "Could not save initiative"): Promise<boolean> {
    const before = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    try {
      const res = await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const updated: Initiative = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      return true;
    } catch {
      if (before) setItems((prev) => prev.map((i) => (i.id === id ? before : i)));
      toast(failMessage, { tone: "error" });
      return false;
    }
  }

  async function remove(id: number) {
    const target = items.find((i) => i.id === id);
    const ok = await confirmDialog({
      title: "Delete this initiative?",
      description: target ? `"${target.title}" will be removed for good.` : undefined,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setEditor(null);
    try {
      const res = await fetch(`/api/initiatives/${id}`, { method: "DELETE", headers: shareHeaders });
      if (!res.ok) throw new Error();
    } catch {
      setItems(snapshot);
      toast("Could not delete initiative", { tone: "error" });
    }
  }

  async function toggleDone(i: Initiative) {
    if (i.status === "done") {
      await update(i.id, { status: "active" }, "Could not reopen initiative");
      return;
    }
    const previous = i.status;
    const ok = await update(i.id, { status: "done" }, "Could not mark done");
    if (ok) {
      toast("Marked done", {
        tone: "success",
        action: { label: "Undo", onClick: () => void update(i.id, { status: previous }, "Could not undo") },
      });
    }
  }

  async function moveTo(i: Initiative, horizon: Initiative["horizon"]) {
    const previous = i.horizon;
    const ok = await update(i.id, { horizon }, "Could not move initiative");
    if (ok) {
      toast(`Moved to ${horizonLabel(horizon)}`, {
        action: { label: "Undo", onClick: () => void update(i.id, { horizon: previous }, "Could not undo") },
      });
    }
  }

  const active = items.filter((i) => i.status === "active");
  const byHorizon = (h: Initiative["horizon"]) => active.filter((i) => i.horizon === h);
  const onHold = items.filter((i) => i.status === "on_hold");
  const done = items
    .filter((i) => i.status === "done")
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
  const nowCount = byHorizon("now").length;

  const rowProps = (i: Initiative) => ({
    initiative: i,
    onOpen: () => setEditor({ mode: "edit" as const, id: i.id }),
    onToggleDone: () => void toggleDone(i),
    onMove: (h: Initiative["horizon"]) => void moveTo(i, h),
  });

  const editing = editor?.mode === "edit" ? items.find((i) => i.id === editor.id) ?? null : null;
  const modalOpen = editor?.mode === "new" || editing != null;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-ink-3">
          <span className="font-medium text-ink tabular-nums">{nowCount}</span> in focus now
          {active.length > nowCount && (
            <>
              <span className="mx-2 text-ink-4">·</span>
              <span className="font-medium text-ink tabular-nums">{active.length - nowCount}</span> queued
            </>
          )}
        </div>
        <Button variant="primary" onClick={() => setEditor({ mode: "new" })}>
          <Plus size={14} /> New initiative
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={18} />}
            title="No initiatives yet"
            body="Initiatives are the big things: key projects, major clients, and priorities to keep top of mind. Bigger than a todo, tracked over weeks."
            action={
              <Button onClick={() => setEditor({ mode: "new" })}>
                <Plus size={14} /> New initiative
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {INITIATIVE_HORIZONS.map((h) => {
            const group = byHorizon(h.value);
            if (group.length === 0 && h.value !== "now") return null;
            return (
              <section key={h.value}>
                <SectionHeader title={h.label} count={group.length} hint={h.hint} />
                <Card>
                  {group.length === 0 ? (
                    <EmptyState
                      className="py-8"
                      icon={<Target size={18} />}
                      title="Nothing in focus"
                      body="Promote something from Next, or add a new initiative."
                      action={
                        <Button size="sm" onClick={() => setEditor({ mode: "new" })}>
                          <Plus size={13} /> New initiative
                        </Button>
                      }
                    />
                  ) : (
                    <div className="divide-y divide-line">
                      {group.map((i) => <InitiativeRow key={i.id} {...rowProps(i)} />)}
                    </div>
                  )}
                </Card>
              </section>
            );
          })}

          {onHold.length > 0 && (
            <section>
              <SectionHeader title="On hold" count={onHold.length} />
              <Card>
                <div className="divide-y divide-line">
                  {onHold.map((i) => <InitiativeRow key={i.id} {...rowProps(i)} />)}
                </div>
              </Card>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <SectionHeader title="Done" count={done.length} />
              <Card>
                <div className="divide-y divide-line">
                  {done.map((i) => <InitiativeRow key={i.id} {...rowProps(i)} />)}
                </div>
              </Card>
            </section>
          )}
        </div>
      )}

      {modalOpen && (
        <InitiativeModal
          key={editing ? editing.id : "new"}
          initiative={editing}
          onClose={() => setEditor(null)}
          onSave={(form) => (editing ? update(editing.id, formToPayload(form)) : add(form))}
          onDelete={editing ? () => remove(editing.id) : undefined}
        />
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function InitiativeRow({
  initiative, onOpen, onToggleDone, onMove,
}: {
  initiative: Initiative;
  onOpen: () => void;
  onToggleDone: () => void;
  onMove: (h: Initiative["horizon"]) => void;
}) {
  const kind = INITIATIVE_KINDS.find((k) => k.value === initiative.kind) ?? INITIATIVE_KINDS[0];
  const isDone = initiative.status === "done";
  const isHeld = initiative.status === "on_hold";
  const isActive = initiative.status === "active";
  const overdue = !!initiative.target_date && !isDone && initiative.target_date < new Date().toISOString().slice(0, 10);

  const idx = HORIZON_ORDER.indexOf(initiative.horizon);
  const sooner = idx > 0 ? HORIZON_ORDER[idx - 1] : null;
  const later = idx >= 0 && idx < HORIZON_ORDER.length - 1 ? HORIZON_ORDER[idx + 1] : null;

  return (
    <div className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hover", isDone && "opacity-60")}>
      {/* Done toggle */}
      <button
        type="button"
        onClick={onToggleDone}
        title={isDone ? "Reopen" : "Mark done"}
        aria-label={isDone ? "Reopen" : "Mark done"}
        className="mt-0.5 shrink-0 rounded-md text-ink-4 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        {isDone ? <CircleCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
          : isHeld ? <PauseCircle size={18} className="text-amber-600 dark:text-amber-400" />
          : <Circle size={18} />}
      </button>

      {/* Body: click to edit. Link chips are real anchors outside the button. */}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("text-sm font-medium text-ink", isDone && "line-through decoration-ink-4")}>
              {initiative.title}
            </span>
            <Badge tone={KIND_TONES[initiative.kind] ?? "neutral"}>{kind.label}</Badge>
            {initiative.target_date && !isDone && (
              <Badge tone={overdue ? "red" : "neutral"}>
                <CalendarDays size={11} /> {targetLabel(initiative.target_date)}
              </Badge>
            )}
          </div>
          {initiative.next_step && !isDone && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
              <ArrowRight size={13} className="shrink-0 text-ink-3" />
              <span className="truncate">{initiative.next_step}</span>
            </div>
          )}
          {initiative.notes && <p className="mt-1 line-clamp-1 text-xs text-ink-3">{initiative.notes}</p>}
        </button>
        {initiative.links.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {initiative.links.map((l, i) => (
              <a
                key={`${l.url}-${i}`}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.url}
                className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-medium leading-4 text-ink-2 ring-1 ring-inset ring-line transition-colors hover:bg-raised hover:text-ink"
              >
                <Link2 size={11} className="shrink-0" />
                <span className="truncate">{linkLabel(l)}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Quick move between horizons, no modal needed */}
      {isActive && (
        <div className="-my-1 -mr-1.5 flex shrink-0 items-center transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          {sooner && (
            <IconButton size="sm" label={`Move to ${horizonLabel(sooner)}`} onClick={() => onMove(sooner)}>
              <ArrowUp size={14} />
            </IconButton>
          )}
          {later && (
            <IconButton size="sm" label={`Move to ${horizonLabel(later)}`} onClick={() => onMove(later)}>
              <ArrowDown size={14} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / edit modal ───────────────────────────────────────────────────────

function InitiativeModal({
  initiative, onClose, onSave, onDelete,
}: {
  /** null = creating a new initiative */
  initiative: Initiative | null;
  onClose: () => void;
  onSave: (form: InitiativeForm) => Promise<boolean>;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<InitiativeForm>(initiative ? initiativeToForm(initiative) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  function set<K extends keyof InitiativeForm>(key: K, val: InitiativeForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function submit() {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initiative ? "Edit initiative" : "New initiative"}
      onSubmit={submit}
      footer={
        <>
          {onDelete ? (
            <Button variant="danger" onClick={onDelete}><Trash2 size={13} /> Delete</Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving} disabled={!form.title.trim()}>
              {initiative ? "Save" : "Create initiative"}
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" required className="col-span-2">
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Land the Red Bull partnership" autoFocus />
        </Field>
        <FieldGroup label="Type" className="col-span-2">
          <Segmented
            options={INITIATIVE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            value={form.kind}
            onChange={(v) => set("kind", v)}
          />
        </FieldGroup>
        <FieldGroup label="Horizon" className="col-span-2 sm:col-span-1">
          <Segmented
            options={INITIATIVE_HORIZONS.map((h) => ({ value: h.value, label: h.label, hint: h.hint }))}
            value={form.horizon}
            onChange={(v) => set("horizon", v)}
          />
        </FieldGroup>
        <FieldGroup label="Status" className="col-span-2 sm:col-span-1">
          <Segmented
            options={INITIATIVE_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            value={form.status}
            onChange={(v) => set("status", v)}
          />
        </FieldGroup>
        <Field label="Next step" className="col-span-2" hint="The one next move that pushes this forward.">
          <Input value={form.next_step} onChange={(e) => set("next_step", e.target.value)} placeholder="e.g. Send the deck to Maria" />
        </Field>
        <Field label="Target date" className="col-span-2 sm:col-span-1">
          <Input type="date" value={form.target_date} onChange={(e) => set("target_date", e.target.value)} />
        </Field>
        <FieldGroup label="Links" className="col-span-2">
          <LinksEditor links={form.links} onChange={(v) => set("links", v)} />
        </FieldGroup>
        <Field label="Notes" className="col-span-2">
          <AutoTextarea value={form.notes} onChange={(e) => set("notes", e.target.value)} minRows={4} className={textareaClass} placeholder="Context, why it matters, key people, open questions…" />
        </Field>
      </div>
    </Modal>
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
          <div className="w-28 shrink-0 sm:w-40">
            <Input
              aria-label={`Link ${idx + 1} label`}
              value={l.label ?? ""}
              onChange={(e) => setLink(idx, { label: e.target.value })}
              placeholder="Label (optional)"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Input
              aria-label={`Link ${idx + 1} URL`}
              value={l.url}
              onChange={(e) => setLink(idx, { url: e.target.value })}
              placeholder="https://…"
              autoFocus={l.url === "" && idx === links.length - 1}
            />
          </div>
          <IconButton label="Remove link" onClick={() => onChange(links.filter((_, i) => i !== idx))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...links, { label: null, url: "" }])}>
        <Plus size={13} /> Add link
      </Button>
    </div>
  );
}
