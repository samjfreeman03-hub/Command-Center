"use client";

import { useEffect, useState } from "react";
import type { BizEvent } from "@/lib/types";
import { EVENT_STATUSES } from "@/lib/types";
import {
  Plus, Trash2, X, CalendarDays, Clock, MapPin, ExternalLink, Users, Handshake, Gem,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { cn } from "@/lib/cn";
import { AutoTextarea } from "@/components/auto-textarea";
import { Button } from "@/components/ui/button";
import { Input, Field, textareaClass, FieldGroup } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, Card, EmptyState, SectionHeader, type BadgeTone } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";

const EMPTY_FORM = {
  name: "",
  date: "",
  time: "",
  venue: "",
  city: "",
  status: "planning" as BizEvent["status"],
  event_link: "",
  expected_attendance: "",
  partners: [] as string[],
  sponsors: [] as string[],
  notes: "",
};

type EventForm = typeof EMPTY_FORM;

const STATUS_TONES: Record<BizEvent["status"], BadgeTone> = {
  planning: "amber",
  confirmed: "blue",
  completed: "green",
  cancelled: "red",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const now = new Date(`${todayStr()}T00:00:00`);
  return Math.round((target.getTime() - now.getTime()) / 86400_000);
}

function countdownLabel(date: string): string | null {
  const d = daysUntil(date);
  if (d < 0) return null;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

function formToPayload(form: EventForm) {
  return {
    name: form.name.trim(),
    date: form.date || null,
    time: form.time.trim() || null,
    venue: form.venue.trim() || null,
    city: form.city.trim() || null,
    status: form.status,
    event_link: form.event_link.trim() || null,
    expected_attendance: form.expected_attendance ? Number(form.expected_attendance) : null,
    partners: form.partners,
    sponsors: form.sponsors,
    notes: form.notes.trim() || null,
  };
}

function eventToForm(e: BizEvent): EventForm {
  return {
    name: e.name,
    date: e.date ?? "",
    time: e.time ?? "",
    venue: e.venue ?? "",
    city: e.city ?? "",
    status: e.status,
    event_link: e.event_link ?? "",
    expected_attendance: e.expected_attendance?.toString() ?? "",
    partners: e.partners,
    sponsors: e.sponsors,
    notes: e.notes ?? "",
  };
}

type Editor = { mode: "new" } | { mode: "edit"; id: number } | null;

export function EventsPanel({
  businessId,
  initial,
  openId,
  autoNew,
}: {
  businessId: string;
  initial: BizEvent[];
  openId?: number;
  autoNew?: boolean;
}) {
  const [events, setEvents] = usePanelState("events", initial);
  const [editor, setEditor] = useState<Editor>(null);
  const shareHeaders = useShareHeaders();

  // Deep links: open a record's editor, or the create form
  useEffect(() => {
    if (openId == null) return;
    if (events.some((e) => e.id === openId)) setEditor({ mode: "edit", id: openId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  useEffect(() => {
    if (autoNew) setEditor({ mode: "new" });
  }, [autoNew]);

  async function add(form: EventForm): Promise<boolean> {
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ business_id: businessId, ...formToPayload(form) }),
      });
      if (!res.ok) throw new Error();
      const created: BizEvent = await res.json();
      setEvents((prev) => [...prev, created]);
      return true;
    } catch {
      toast("Could not create event", { tone: "error" });
      return false;
    }
  }

  async function update(id: number, form: EventForm): Promise<boolean> {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify(formToPayload(form)),
      });
      if (!res.ok) throw new Error();
      const updated: BizEvent = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
      return true;
    } catch {
      toast("Could not save event", { tone: "error" });
      return false;
    }
  }

  async function remove(id: number) {
    const target = events.find((e) => e.id === id);
    const ok = await confirmDialog({
      title: "Delete this event?",
      description: target ? `"${target.name}" will be removed for good.` : undefined,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const snapshot = events;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setEditor(null);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE", headers: shareHeaders });
      if (!res.ok) throw new Error();
    } catch {
      setEvents(snapshot);
      toast("Could not delete event", { tone: "error" });
    }
  }

  const today = todayStr();
  const isUpcoming = (e: BizEvent) =>
    e.status !== "completed" && e.status !== "cancelled" && (!e.date || e.date >= today);
  const upcoming = events
    .filter(isUpcoming)
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const past = events
    .filter((e) => !isUpcoming(e))
    .sort((a, b) => (b.date ?? "0000").localeCompare(a.date ?? "0000"));
  const next = upcoming.find((e) => e.date);

  const editing = editor?.mode === "edit" ? events.find((e) => e.id === editor.id) ?? null : null;
  const modalOpen = editor?.mode === "new" || editing != null;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-ink-3">
          <span className="font-medium text-ink tabular-nums">{upcoming.length}</span> upcoming
          {next?.date && (
            <>
              <span className="mx-2 text-ink-4">·</span>
              next: <span className="font-medium text-ink">{next.name}</span>{" "}
              <span>({countdownLabel(next.date)?.toLowerCase()})</span>
            </>
          )}
        </div>
        <Button variant="primary" onClick={() => setEditor({ mode: "new" })}>
          <Plus size={14} /> New event
        </Button>
      </div>

      <div className="space-y-6">
        <section>
          <SectionHeader title="Upcoming" count={upcoming.length} />
          <Card>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={18} />}
                title="No upcoming events"
                body="Add the next show, dinner, or activation to start planning it here."
                action={
                  <Button onClick={() => setEditor({ mode: "new" })}>
                    <Plus size={14} /> New event
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-line">
                {upcoming.map((e) => (
                  <EventRow key={e.id} event={e} onOpen={() => setEditor({ mode: "edit", id: e.id })} />
                ))}
              </div>
            )}
          </Card>
        </section>

        {past.length > 0 && (
          <section>
            <SectionHeader title="Past & closed" count={past.length} />
            <Card>
              <div className="divide-y divide-line">
                {past.map((e) => (
                  <EventRow key={e.id} event={e} muted onOpen={() => setEditor({ mode: "edit", id: e.id })} />
                ))}
              </div>
            </Card>
          </section>
        )}
      </div>

      {modalOpen && (
        <EventModal
          key={editing ? editing.id : "new"}
          event={editing}
          onClose={() => setEditor(null)}
          onSave={(form) => (editing ? update(editing.id, form) : add(form))}
          onDelete={editing ? () => remove(editing.id) : undefined}
        />
      )}
    </div>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

function DateTile({ date }: { date: string | null }) {
  const d = date ? new Date(`${date}T00:00:00`) : null;
  return (
    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-sunken ring-1 ring-inset ring-line">
      {d ? (
        <>
          <span className="text-[11px] font-medium uppercase leading-none text-brand">
            {d.toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span className="mt-0.5 text-base font-semibold leading-none text-ink tabular-nums">{d.getDate()}</span>
        </>
      ) : (
        <CalendarDays size={15} className="text-ink-3" />
      )}
    </div>
  );
}

function EventRow({ event, muted, onOpen }: { event: BizEvent; muted?: boolean; onOpen: () => void }) {
  const status = EVENT_STATUSES.find((s) => s.value === event.status) ?? EVENT_STATUSES[0];
  const countdown = event.date && event.status !== "completed" && event.status !== "cancelled"
    ? countdownLabel(event.date)
    : null;
  const dateLabel = event.date
    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "Date TBD";

  return (
    <div className="group flex items-start transition-colors hover:bg-hover">
      {/* Click to edit. The external link is a sibling so it never triggers this. */}
      <button
        type="button"
        onClick={onOpen}
        className={cn("flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left", muted && "opacity-75")}
      >
        <DateTile date={event.date} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-ink">{event.name}</span>
            <Badge tone={STATUS_TONES[event.status] ?? "neutral"}>{status.label}</Badge>
            {countdown && <Badge tone="inverse">{countdown}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {dateLabel}</span>
            {event.time && <span className="inline-flex items-center gap-1"><Clock size={13} /> {event.time}</span>}
            {(event.venue || event.city) && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} /> {[event.venue, event.city].filter(Boolean).join(", ")}
              </span>
            )}
            {event.expected_attendance != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users size={13} /> {event.expected_attendance.toLocaleString()}
              </span>
            )}
          </div>
          {(event.partners.length > 0 || event.sponsors.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {event.partners.map((p) => (
                <Badge key={`p-${p}`} tone="violet"><Handshake size={11} /> {p}</Badge>
              ))}
              {event.sponsors.map((s) => (
                <Badge key={`s-${s}`} tone="sky"><Gem size={11} /> {s}</Badge>
              ))}
            </div>
          )}
          {event.notes && <p className="mt-1 line-clamp-1 text-xs text-ink-3">{event.notes}</p>}
        </div>
      </button>
      {event.event_link && (
        <a
          href={event.event_link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open event link"
          title="Open event link"
          className="mr-3 mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink md:h-8 md:w-8"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

// ── Create / edit modal ───────────────────────────────────────────────────────

function EventModal({
  event, onClose, onSave, onDelete,
}: {
  /** null = creating a new event */
  event: BizEvent | null;
  onClose: () => void;
  onSave: (form: EventForm) => Promise<boolean>;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<EventForm>(event ? eventToForm(event) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  function set<K extends keyof EventForm>(key: K, val: EventForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function submit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event ? "Edit event" : "New event"}
      onSubmit={submit}
      footer={
        <>
          {onDelete ? (
            <Button variant="danger" onClick={onDelete}><Trash2 size={13} /> Delete</Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving} disabled={!form.name.trim()}>
              {event ? "Save" : "Create event"}
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Event name" required className="col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rooftop sessions vol. 4" autoFocus />
        </Field>
        <Field label="Date">
          <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Time">
          <Input value={form.time} onChange={(e) => set("time", e.target.value)} placeholder="e.g. 8pm to 2am" />
        </Field>
        <Field label="Venue">
          <Input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="e.g. Yamashiro" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Los Angeles" />
        </Field>
        <FieldGroup label="Status" className="col-span-2">
          <Segmented
            options={EVENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            value={form.status}
            onChange={(v) => set("status", v)}
          />
        </FieldGroup>
        <Field label="Expected attendance">
          <Input type="number" min={0} inputMode="numeric" value={form.expected_attendance} onChange={(e) => set("expected_attendance", e.target.value)} placeholder="e.g. 500" />
        </Field>
        <Field label="Event link" hint="Tickets, RSVP, Partiful, etc.">
          <Input type="url" value={form.event_link} onChange={(e) => set("event_link", e.target.value)} placeholder="https://…" />
        </Field>
        <FieldGroup label="Partners" className="col-span-2">
          <ChipsInput label="Partners" values={form.partners} onChange={(v) => set("partners", v)} placeholder="Type a partner and press Enter" tone="violet" />
        </FieldGroup>
        <FieldGroup label="Sponsors" className="col-span-2">
          <ChipsInput label="Sponsors" values={form.sponsors} onChange={(v) => set("sponsors", v)} placeholder="Type a sponsor and press Enter" tone="sky" />
        </FieldGroup>
        <Field label="Notes" className="col-span-2">
          <AutoTextarea value={form.notes} onChange={(e) => set("notes", e.target.value)} minRows={4} className={textareaClass} placeholder="Run of show, open items, vendor details…" />
        </Field>
      </div>
    </Modal>
  );
}


/** Text input that turns Enter/comma into removable chips. Styled to match `Input`. */
function ChipsInput({
  label, values, onChange, placeholder, tone,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  tone: BadgeTone;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const name = draft.trim().replace(/,+$/, "");
    if (!name) return;
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) {
      onChange([...values, name]);
    }
    setDraft("");
  }

  return (
    <div
      onMouseDown={(e) => {
        // Clicking the padding focuses the text input, like a real input
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.currentTarget.querySelector("input")?.focus();
        }
      }}
      className={cn(
        "flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-2 py-1.5 md:min-h-9",
        "transition-[border-color,box-shadow] duration-150 hover:border-ink-4",
        "focus-within:border-ink-3 focus-within:ring-[3px] focus-within:ring-ink/10"
      )}
    >
      {values.map((v) => (
        <Badge key={v} tone={tone} className="text-xs">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="-mr-0.5 rounded-md opacity-60 transition-opacity hover:opacity-100"
          >
            <X size={11} />
          </button>
        </Badge>
      ))}
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            // Enter with an empty draft falls through and submits the form
            if (e.key === "," || draft.trim()) { e.preventDefault(); commit(); }
          }
          if (e.key === "Backspace" && !draft && values.length > 0) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-ink-4"
      />
    </div>
  );
}
