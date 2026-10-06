"use client";

import { useState } from "react";
import { Plus, Check, Wallet, ChevronDown } from "lucide-react";
import type { Iou } from "@/lib/types";
import { BUSINESSES, getBusiness } from "@/lib/businesses";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select, PrefixInput, Field, FieldGroup, textareaClass } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Badge, BrandTile, Card, EmptyState, SectionHeader } from "@/components/ui/display";
import { confirmDialog, toast } from "@/components/ui/host";
import { RichTextarea } from "@/components/rich-textarea";
import { FormattedText } from "@/components/formatted-text";
import { cn } from "@/lib/cn";

const DIRECTIONS = [
  { value: "owe", label: "I owe them" },
  { value: "owed", label: "They owe me" },
] as const;

const money = (cents: number | null) =>
  cents == null ? null : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;

const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Form = { direction: Iou["direction"]; party: string; business_id: string; amount: string; due_date: string; note: string };
const EMPTY: Form = { direction: "owed", party: "", business_id: "personal", amount: "", due_date: "", note: "" };

function toForm(i: Iou): Form {
  return {
    direction: i.direction,
    party: i.party,
    business_id: i.business_id,
    amount: i.amount_cents == null ? "" : String(i.amount_cents / 100),
    due_date: i.due_date ?? "",
    note: i.note ?? "",
  };
}

function toBody(f: Form) {
  const amount = Number(f.amount.replace(/[$,\s]/g, ""));
  return {
    direction: f.direction,
    party: f.party.trim(),
    business_id: f.business_id,
    amount_cents: f.amount.trim() && Number.isFinite(amount) ? Math.round(amount * 100) : null,
    due_date: f.due_date || null,
    note: f.note.trim() || null,
  };
}

/** Dashboard money tracker: who owes whom, for which company, settle in place. */
export function MoneyPanel({ initial, today }: { initial: Iou[]; today: string }) {
  const [items, setItems] = useState(initial);
  const [editor, setEditor] = useState<{ mode: "new" } | { mode: "edit"; iou: Iou } | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const open = items.filter((i) => i.status === "open");
  const owe = open.filter((i) => i.direction === "owe");
  const owed = open.filter((i) => i.direction === "owed");
  const settled = items.filter((i) => i.status === "settled").sort((a, b) => (b.settled_at ?? 0) - (a.settled_at ?? 0));
  const sum = (list: Iou[]) => list.reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  async function save(form: Form) {
    const body = toBody(form);
    if (editor?.mode === "edit") {
      const prev = items;
      setItems((list) => list.map((i) => (i.id === editor.iou.id ? { ...i, ...body } : i)));
      setEditor(null);
      const res = await fetch(`/api/ious/${editor.iou.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setItems(prev); toast("Could not save", { tone: "error" }); return; }
      const updated: Iou = await res.json();
      setItems((list) => list.map((i) => (i.id === updated.id ? updated : i)));
    } else {
      const res = await fetch("/api/ious", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { toast("Could not add", { tone: "error" }); return; }
      const created: Iou = await res.json();
      setItems((list) => [created, ...list]);
      setEditor(null);
    }
  }

  async function setStatus(iou: Iou, status: Iou["status"]) {
    const prev = items;
    setItems((list) => list.map((i) => (i.id === iou.id ? { ...i, status, settled_at: status === "settled" ? Date.now() : null } : i)));
    const res = await fetch(`/api/ious/${iou.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) { setItems(prev); toast("Could not update", { tone: "error" }); return; }
    if (status === "settled") {
      toast(iou.direction === "owe" ? `Paid ${iou.party}` : `${iou.party} paid up`, { tone: "success", action: { label: "Undo", onClick: () => setStatus(iou, "open") } });
    }
  }

  async function remove(iou: Iou) {
    if (!(await confirmDialog({ title: "Delete this entry?", description: `${iou.party}${money(iou.amount_cents) ? `, ${money(iou.amount_cents)}` : ""}`, confirmLabel: "Delete", destructive: true }))) return;
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== iou.id));
    setEditor(null);
    const res = await fetch(`/api/ious/${iou.id}`, { method: "DELETE" });
    if (!res.ok) { setItems(prev); toast("Could not delete", { tone: "error" }); }
  }

  const hint = open.length
    ? [owe.length ? `You owe ${money(sum(owe)) ?? "?"}` : null, owed.length ? `Owed to you ${money(sum(owed)) ?? "?"}` : null].filter(Boolean).join(" · ")
    : undefined;

  return (
    <div id="money" className="scroll-mt-16">
      <SectionHeader
        title="Money"
        hint={hint}
        action={
          <Button size="sm" onClick={() => setEditor({ mode: "new" })}>
            <Plus size={13} /> Add
          </Button>
        }
      />
      <Card>
        {open.length === 0 && settled.length === 0 ? (
          <EmptyState
            icon={<Wallet size={18} />}
            title="Nothing outstanding"
            body="Track who owes you and who you owe, for each company or personally."
            action={<Button onClick={() => setEditor({ mode: "new" })}><Plus size={14} /> Add an entry</Button>}
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-line">
            {owed.length > 0 && <Group label="Owed to you" total={money(sum(owed))} tone="green" items={owed} today={today} onEdit={(i) => setEditor({ mode: "edit", iou: i })} onSettle={(i) => setStatus(i, "settled")} />}
            {owe.length > 0 && <Group label="You owe" total={money(sum(owe))} tone="red" items={owe} today={today} onEdit={(i) => setEditor({ mode: "edit", iou: i })} onSettle={(i) => setStatus(i, "settled")} />}
            {open.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-ink-3">All settled up.</div>}
            {settled.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSettled((v) => !v)}
                  aria-expanded={showSettled}
                  className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-ink-3 transition-colors hover:text-ink"
                >
                  <ChevronDown size={13} className={cn("transition-transform", showSettled && "rotate-180")} />
                  {showSettled ? "Hide" : "Show"} {settled.length} settled
                </button>
                {showSettled && (
                  <div className="divide-y divide-line border-t border-line">
                    {settled.map((i) => (
                      <Row key={i.id} iou={i} today={today} settled onEdit={() => setEditor({ mode: "edit", iou: i })} onToggle={() => setStatus(i, "open")} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <IouModal
        open={editor !== null}
        initial={editor?.mode === "edit" ? toForm(editor.iou) : EMPTY}
        editing={editor?.mode === "edit"}
        onClose={() => setEditor(null)}
        onSave={save}
        onDelete={editor?.mode === "edit" ? () => remove(editor.iou) : undefined}
      />
    </div>
  );
}

function Group({ label, total, tone, items, today, onEdit, onSettle }: {
  label: string; total: string | null; tone: "green" | "red"; items: Iou[]; today: string;
  onEdit: (i: Iou) => void; onSettle: (i: Iou) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 bg-sunken/70 px-4 py-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", tone === "green" ? "bg-emerald-500" : "bg-red-500")} />
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <span className="text-xs tabular-nums text-ink-3">{items.length}</span>
        {total && <span className={cn("ml-auto text-xs font-semibold tabular-nums", tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{total}</span>}
      </div>
      <div className="divide-y divide-line">
        {items.map((i) => <Row key={i.id} iou={i} today={today} onEdit={() => onEdit(i)} onToggle={() => onSettle(i)} />)}
      </div>
    </div>
  );
}

function Row({ iou, today, settled, onEdit, onToggle }: { iou: Iou; today: string; settled?: boolean; onEdit: () => void; onToggle: () => void }) {
  const business = getBusiness(iou.business_id);
  const overdue = !settled && !!iou.due_date && iou.due_date < today;
  const amount = money(iou.amount_cents);
  return (
    <div className={cn("group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-hover", settled && "opacity-60")}>
      <button
        onClick={onToggle}
        aria-label={settled ? "Reopen" : iou.direction === "owe" ? "Mark as paid" : "Mark as received"}
        title={settled ? "Reopen" : iou.direction === "owe" ? "Mark as paid" : "Mark as received"}
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
          settled ? "border-transparent bg-ink-4 text-raised" : "border-line-strong text-transparent hover:border-emerald-500 hover:text-emerald-500"
        )}
      >
        <Check size={10} strokeWidth={3} />
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium text-ink", settled && "line-through decoration-ink-4")}>{iou.party}</span>
          {iou.due_date && !settled && <Badge tone={overdue ? "red" : "neutral"}>{overdue ? "Overdue · " : "Due "}{shortDate(iou.due_date)}</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
          {business && iou.business_id !== "personal" ? (
            <><BrandTile business={business} size="xs" /> <span className="truncate">{iou.direction === "owe" ? `${business.name} owes` : `owes ${business.name}`}</span></>
          ) : (
            <span className="truncate">{iou.direction === "owe" ? "You owe personally" : "Owes you personally"}</span>
          )}
          {iou.note && <span className="truncate text-ink-4">· <FormattedText text={iou.note} /></span>}
        </div>
      </button>
      {amount && (
        <span className={cn("shrink-0 pt-0.5 text-sm font-semibold tabular-nums", settled ? "text-ink-3" : iou.direction === "owe" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
          {amount}
        </span>
      )}
    </div>
  );
}

function IouModal({ open, initial, editing, onClose, onSave, onDelete }: {
  open: boolean; initial: Form; editing?: boolean; onClose: () => void; onSave: (f: Form) => void; onDelete?: () => void;
}) {
  const [form, setForm] = useState<Form>(initial);
  const [key, setKey] = useState<Form | null>(null);
  // Reset the draft whenever the modal opens with a new record
  if (open && key !== initial) { setKey(initial); setForm(initial); }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.party.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit entry" : "Add money entry"}
      onSubmit={() => valid && onSave(form)}
      footer={
        <>
          {onDelete ? <Button variant="danger" onClick={onDelete}>Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!valid}>{editing ? "Save" : "Add"}</Button>
          </div>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="Direction" className="sm:col-span-2">
          <Segmented options={DIRECTIONS} value={form.direction} onChange={(v) => set("direction", v)} />
        </FieldGroup>
        <Field label="Who" required>
          <Input value={form.party} onChange={(e) => set("party", e.target.value)} placeholder="Person or company" autoFocus />
        </Field>
        <Field label="Amount">
          <PrefixInput prefix="$" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
        </Field>
        <Field label={form.direction === "owe" ? "Who owes it" : "Owed to"} hint={form.direction === "owe" ? "Which company is on the hook, or you personally" : "Which company they owe, or you personally"}>
          <Select value={form.business_id} onChange={(e) => set("business_id", e.target.value)}>
            {[...BUSINESSES].sort((a, b) => (a.id === "personal" ? -1 : b.id === "personal" ? 1 : 0)).map((b) => (
              <option key={b.id} value={b.id}>{b.id === "personal" ? "Me personally" : b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <RichTextarea value={form.note} onChange={(e) => set("note", e.target.value)} minRows={2} className={textareaClass} placeholder="What it's for, how they'll pay, anything to remember" />
        </Field>
      </div>
    </Modal>
  );
}
