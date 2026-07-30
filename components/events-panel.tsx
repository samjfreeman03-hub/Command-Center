"use client";

import { useState } from "react";
import type { BizEvent } from "@/lib/types";
import { EVENT_STATUSES } from "@/lib/types";
import {
  Plus, Trash2, X, CalendarDays, Clock, MapPin, ExternalLink, Users, Handshake, Gem,
} from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";

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

export function EventsPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: BizEvent[];
}) {
  const [events, setEvents] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const shareHeaders = useShareHeaders();

  async function add(form: EventForm) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, ...formToPayload(form) }),
    });
    if (res.ok) {
      const created: BizEvent = await res.json();
      setEvents((prev) => [...prev, created]);
      setShowAdd(false);
    }
  }

  async function update(id: number, form: EventForm) {
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify(formToPayload(form)),
    });
    if (res.ok) {
      const updated: BizEvent = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this event?")) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setEditingId(null);
    await fetch(`/api/events/${id}`, { method: "DELETE", headers: shareHeaders });
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

  return (
    <div className="space-y-6">
      {/* Summary + add */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="text-zinc-900 dark:text-zinc-100 font-medium">{upcoming.length}</span> upcoming
          {next?.date && (
            <>
              <span className="mx-2 text-zinc-300 dark:text-zinc-700">·</span>
              next: <span className="text-zinc-900 dark:text-zinc-100 font-medium">{next.name}</span>{" "}
              <span className="text-zinc-400">({countdownLabel(next.date)?.toLowerCase()})</span>
            </>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> New event
        </button>
      </div>

      {showAdd && (
        <EventFormCard
          initial={EMPTY_FORM}
          submitLabel="Create event"
          onSubmit={add}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Upcoming */}
      <Section title="Upcoming" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
              <CalendarDays size={20} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No upcoming events</div>
              <div className="text-xs text-zinc-400">Click &ldquo;New event&rdquo; to start planning.</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {upcoming.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                isEditing={editingId === e.id}
                onStartEdit={() => setEditingId(e.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(form) => update(e.id, form)}
                onDelete={() => remove(e.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Past / done */}
      {past.length > 0 && (
        <Section title="Past & closed" count={past.length} muted>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {past.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                isEditing={editingId === e.id}
                onStartEdit={() => setEditingId(e.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(form) => update(e.id, form)}
                onDelete={() => remove(e.id)}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Event row + edit modal ────────────────────────────────────────────────────

function EventRow({
  event, isEditing, onStartEdit, onCancelEdit, onSave, onDelete,
}: {
  event: BizEvent;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (form: EventForm) => void;
  onDelete: () => void;
}) {
  const status = EVENT_STATUSES.find((s) => s.value === event.status)!;
  const countdown = event.date && event.status !== "completed" && event.status !== "cancelled"
    ? countdownLabel(event.date)
    : null;
  const dateLabel = event.date
    ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "Date TBD";

  return (
    <>
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center bg-black/50 sm:p-8 overflow-y-auto">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-xl shadow-2xl sm:mt-4 sm:mb-8 safe-bottom">
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit event</h2>
              <button onClick={onCancelEdit} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 pt-2">
              <EventFormCard
                initial={eventToForm(event)}
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
      <button
        onClick={onStartEdit}
        className="block w-full text-left px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{event.name}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
              {countdown && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
                  {countdown}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
              <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {dateLabel}</span>
              {event.time && <span className="inline-flex items-center gap-1"><Clock size={11} /> {event.time}</span>}
              {(event.venue || event.city) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {[event.venue, event.city].filter(Boolean).join(", ")}
                </span>
              )}
              {event.expected_attendance != null && (
                <span className="inline-flex items-center gap-1"><Users size={11} /> {event.expected_attendance.toLocaleString()}</span>
              )}
            </div>
            {(event.partners.length > 0 || event.sponsors.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {event.partners.map((p) => (
                  <span key={`p-${p}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
                    <Handshake size={9} /> {p}
                  </span>
                ))}
                {event.sponsors.map((s) => (
                  <span key={`s-${s}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                    <Gem size={9} /> {s}
                  </span>
                ))}
              </div>
            )}
            {event.notes && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1 line-clamp-1">{event.notes}</p>
            )}
          </div>
          {event.event_link && (
            <a
              href={event.event_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              className="shrink-0 p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Open event link"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </button>
    </>
  );
}

// ── Add/edit form ─────────────────────────────────────────────────────────────

function EventFormCard({
  initial, submitLabel, onSubmit, onCancel, onDelete, bare,
}: {
  initial: EventForm;
  submitLabel: string;
  onSubmit: (form: EventForm) => void;
  onCancel: () => void;
  onDelete?: () => void;
  bare?: boolean;
}) {
  const [form, setForm] = useState<EventForm>(initial);
  function set<K extends keyof EventForm>(key: K, val: EventForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        onSubmit(form);
      }}
      className={bare ? "space-y-3" : "rounded-lg border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 space-y-3"}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Event name *" full>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="Required" autoFocus />
        </Field>
        <Field label="Date">
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Time">
          <input value={form.time} onChange={(e) => set("time", e.target.value)} className={inputCls} placeholder="e.g. 8pm–2am" />
        </Field>
        <Field label="Venue">
          <input value={form.venue} onChange={(e) => set("venue", e.target.value)} className={inputCls} placeholder="e.g. Yamashiro" />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} placeholder="e.g. Los Angeles" />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set("status", e.target.value as BizEvent["status"])} className={inputCls}>
            {EVENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Expected attendance">
          <input type="number" min={0} value={form.expected_attendance} onChange={(e) => set("expected_attendance", e.target.value)} className={inputCls} placeholder="e.g. 500" />
        </Field>
        <Field label="Event link" full>
          <input type="url" value={form.event_link} onChange={(e) => set("event_link", e.target.value)} className={inputCls} placeholder="https://… (tickets, RSVP, Partiful, etc.)" />
        </Field>
        <Field label="Partners" full>
          <ChipsInput values={form.partners} onChange={(v) => set("partners", v)} placeholder="Type a partner and press Enter" chipClass="bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300" />
        </Field>
        <Field label="Sponsors" full>
          <ChipsInput values={form.sponsors} onChange={(v) => set("sponsors", v)} placeholder="Type a sponsor and press Enter" chipClass="bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300" />
        </Field>
        <Field label="Notes" full>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} min-h-16 resize-y`} placeholder="Run of show, open items, vendor details…" />
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
          <button type="submit" disabled={!form.name.trim()} className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40">
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Text input that turns Enter/comma into removable chips. */
function ChipsInput({
  values, onChange, placeholder, chipClass,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  chipClass: string;
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
    <div className={`${inputCls} flex flex-wrap items-center gap-1.5 py-1.5 cursor-text`}>
      {values.map((v) => (
        <span key={v} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${chipClass}`}>
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="hover:text-rose-600 dark:hover:text-rose-400">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          if (e.key === "Backspace" && !draft && values.length > 0) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
      />
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function Section({
  title, count, muted, children,
}: { title: string; count: number; muted?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${muted ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-500"}`}>
          {title}
        </h2>
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
