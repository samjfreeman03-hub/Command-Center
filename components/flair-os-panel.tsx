"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Pause, Play, Link2, Info, Pencil, MessageSquarePlus, CalendarPlus } from "lucide-react";
import type { Lead } from "@/lib/types";
import { useShareHeaders } from "@/lib/share-context";
import { cn } from "@/lib/cn";
import { flairOsStageLabel, FLAIR_OS_WRITABLE_STAGES } from "@/lib/flair-os/stage-map";
import type { FlairOsStageMeta } from "@/components/pipeline-panel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/host";
import { Badge, Card } from "@/components/ui/display";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { FormattedText } from "@/components/formatted-text";

import type { Reconciliation, PipelineCounts, StageMeta, YourSide } from "@/lib/flair-os/store";

/**
 * FLAIR OS mirror UI for the FLAIR pipeline tab (read-only toward FLAIR OS):
 * the status hook, the one-line connection status (with an owner-only Details
 * dialog), the card badge, and the read-only deal dialog. The page body is
 * `components/flair-os-board.tsx`.
 */

export type FlairOsStatus = {
  enabled: boolean;
  canSync?: boolean;
  dryRunDefault?: boolean;
  /** Two-way mode: FLAIR_OS_WRITE_ENABLED is on and dry run is off. */
  writeEnabled?: boolean;
  inFlight?: boolean;
  scheduler?: { running: boolean; intervalMinutes: number };
  state?: {
    pull_paused: boolean;
    last_run_at: number | null;
    last_ok_at: number | null;
    last_error: string | null;
    last_summary: {
      ok: boolean;
      dry_run: boolean;
      duration_ms: number;
      calls: number;
      deals: { seen: number; created: number; updated: number; unchanged: number; missing: number; unknown_stage: number };
      tasks: { seen: number; created: number; updated: number; unchanged: number };
      clients: { seen: number; created: number; updated: number; unchanged: number };
      unknown_stages: string[];
      warnings?: string[];
    } | null;
    counts?: PipelineCounts | null;
  };
  stages?: StageMeta[];
  reconciliation?: Reconciliation;
  your_side?: YourSide;
  drift?: {
    leads_mirrored: number;
    leads_missing: number;
    leads_unknown_stage: number;
    leads_local_only: number;
    todos_mirrored: number;
    clients_mirrored: number;
    missing: { id: number; name: string; company: string | null; missing_at: number }[];
    local_only: { id: number; name: string; company: string | null; stage: string }[];
  };
  log?: { id: number; at: number; record_kind: string; action: string; result: string; message: string | null; changes: { field: string; from: unknown; to: unknown }[] | null }[];
};

export function ago(ms: number | null | undefined): string {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function when(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dateOnly(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: y !== new Date().getFullYear() ? "numeric" : undefined });
}

/** Polls `/api/flair-os/status` once a minute; shared by the strip and the board. */
export function useFlairOsStatus(enabled: boolean): { status: FlairOsStatus | null; reload: () => void } {
  const shareHeaders = useShareHeaders();
  const [status, setStatus] = useState<FlairOsStatus | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/flair-os/status", { headers: shareHeaders, cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      /* keep the last status */
    }
  }, [shareHeaders, enabled]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);

  return { status, reload };
}

export function FlairOsConnection({ canSync, status, reload: load }: { canSync: boolean; status: FlairOsStatus | null; reload: () => void }) {
  const shareHeaders = useShareHeaders();
  const [busy, setBusy] = useState<"sync" | "pause" | null>(null);
  const [details, setDetails] = useState(false);

  async function pull() {
    setBusy("sync");
    try {
      const res = await fetch("/api/flair-os/sync", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
      });
      const summary = await res.json().catch(() => null);
      if (res.ok && summary?.ok) {
        const d = summary.deals;
        toast(
          summary.dry_run
            ? `Read ${d.seen} deals from FLAIR OS. Nothing saved while saving is off.`
            : d.created + d.updated === 0
              ? "Up to date with FLAIR OS"
              : `Updated from FLAIR OS: ${d.created} new, ${d.updated} changed`,
          { tone: "success" }
        );
        if (!summary.dry_run && (d.created > 0 || d.updated > 0 || summary.tasks.created > 0 || summary.tasks.updated > 0)) {
          // Mirrored rows changed on the server; a reload is the honest refresh.
          window.location.reload();
          return;
        }
      } else {
        toast(summary?.error ? `Could not reach FLAIR OS: ${summary.error}` : "Could not reach FLAIR OS", { tone: "error" });
      }
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusy(null);
      load();
    }
  }

  async function togglePause() {
    if (!status?.state) return;
    setBusy("pause");
    try {
      const res = await fetch("/api/flair-os/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ pull_paused: !status.state.pull_paused }),
      });
      if (!res.ok) toast("Could not change the setting", { tone: "error" });
    } finally {
      setBusy(null);
      load();
    }
  }

  if (!status) {
    return (
      <div className="mb-5 flex items-center gap-2 text-[13px] text-ink-3">
        <Loader2 size={13} className="animate-spin" /> Checking the FLAIR OS connection
      </div>
    );
  }
  if (!status.enabled) return null;

  const st = status.state;
  const summary = st?.last_summary ?? null;
  const dryRun = !!status.dryRunDefault;
  const paused = !!st?.pull_paused;
  const failing = !!st?.last_error;
  const never = !st?.last_ok_at;

  let dot = "bg-emerald-500";
  let line: React.ReactNode;
  if (paused) {
    dot = "bg-amber-500";
    line = <>Updates from FLAIR OS are paused. Showing what was mirrored {ago(st?.last_ok_at)}.</>;
  } else if (dryRun) {
    dot = "bg-amber-500";
    line = (
      <>
        Reading FLAIR OS but not saving yet, so the pipeline below may be empty.
        {summary?.dry_run ? ` The last read saw ${summary.deals.seen} deals.` : ""}{" "}
        {canSync ? (
          <>
            Saving is turned on in Railway with <code className="rounded bg-sunken px-1 py-0.5 text-xs">FLAIR_OS_SYNC_DRY_RUN=0</code>.
          </>
        ) : (
          "Sam turns saving on."
        )}
      </>
    );
  } else if (failing) {
    dot = "bg-red-500";
    line = <>Could not reach FLAIR OS. Showing what was mirrored {ago(st?.last_ok_at)}.</>;
  } else if (never) {
    dot = "bg-ink-4";
    line = <>Connected to FLAIR OS. Nothing read yet.</>;
  } else {
    line = (
      <>
        Connected to FLAIR OS. Updated <span className="tabular-nums">{ago(st?.last_ok_at)}</span>
        {status.scheduler?.running ? "" : ", refreshed by hand"}.
      </>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
      <span className={cn("min-w-0 flex-1 basis-60", failing || dryRun || paused ? "text-ink-2" : "text-ink-3")}>{line}</span>
      {canSync && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={pull} loading={busy === "sync"} disabled={busy !== null || status.inFlight}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDetails(true)} aria-haspopup="dialog">
            <Info size={13} /> Details
          </Button>
        </div>
      )}
      {details && (
        <Modal
          open
          onClose={() => setDetails(false)}
          title="FLAIR OS connection"
          description="What the last read did and anything that needs a look."
          footer={
            <>
              {canSync ? (
                <Button variant="ghost" onClick={togglePause} loading={busy === "pause"} disabled={busy !== null}>
                  {paused ? <Play size={13} /> : <Pause size={13} />}
                  {paused ? "Resume updates" : "Pause updates"}
                </Button>
              ) : (
                <span />
              )}
              <Button variant="primary" onClick={() => setDetails(false)}>
                Close
              </Button>
            </>
          }
        >
          <ConnectionDetails status={status} />
        </Modal>
      )}
    </div>
  );
}

function ConnectionDetails({ status }: { status: FlairOsStatus }) {
  const st = status.state;
  const summary = st?.last_summary ?? null;
  const drift = status.drift;
  const rec = status.reconciliation;
  const log = (status.log ?? []).filter((l) => l.record_kind !== "cycle").slice(0, 8);
  return (
    <div className="space-y-5 text-[13px]">
      <div>
        <div className="text-xs font-medium text-ink-3">Last read</div>
        {summary ? (
          <ul className="mt-1 space-y-0.5 text-ink-2">
            <li>
              {when(st?.last_run_at)}, {summary.calls} requests, {summary.dry_run ? "nothing saved (saving is off)" : "saved"}
            </li>
            <li>
              Deals: {summary.deals.seen} seen, {summary.deals.created} new, {summary.deals.updated} changed, {summary.deals.missing} no longer in FLAIR OS
            </li>
            <li>
              Tasks: {summary.tasks.seen} seen, {summary.tasks.created} new, {summary.tasks.updated} changed. Clients: {summary.clients.seen} seen
            </li>
            {summary.unknown_stages.length > 0 && <li className="text-amber-700 dark:text-amber-300">Stages this page does not know yet: {summary.unknown_stages.join(", ")}</li>}
            {(summary.warnings ?? []).map((w) => (
              <li key={w} className="text-amber-700 dark:text-amber-300">{w}</li>
            ))}
            {st?.last_error && <li className="text-red-600 dark:text-red-400">{st.last_error}</li>}
          </ul>
        ) : (
          <p className="mt-1 text-ink-3">Nothing read yet.</p>
        )}
        <p className="mt-1 text-xs text-ink-4">{status.scheduler?.running ? `Reads every ${status.scheduler.intervalMinutes} minutes.` : "Reads only when refreshed by hand."}</p>
      </div>
      {drift && (
        <div>
          <div className="text-xs font-medium text-ink-3">In the mirror</div>
          <ul className="mt-1 space-y-0.5 text-ink-2">
            <li>
              {drift.leads_mirrored} deals, {drift.todos_mirrored} tasks, {drift.clients_mirrored} clients from FLAIR OS
            </li>
            <li>
              {drift.leads_local_only} leads only here
              {rec ? ` (${rec.counts.same} match a deal, ${rec.counts.likely} probably do, ${rec.counts.separate} kept here on purpose)` : ""}
            </li>
            {drift.leads_missing > 0 && <li>{drift.leads_missing} mirrored deals have disappeared from FLAIR OS and are kept here</li>}
            {drift.leads_unknown_stage > 0 && <li>{drift.leads_unknown_stage} deals sit in a stage this page does not know</li>}
          </ul>
          {drift.missing.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-ink-3">
              {drift.missing.slice(0, 5).map((m) => (
                <li key={m.id}>
                  {m.company || m.name}, gone since {when(m.missing_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <div className="text-xs font-medium text-ink-3">Recent changes</div>
        {log.length ? (
          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
            {log.map((l) => (
              <li key={l.id} className="truncate">
                <span className="text-ink-3">{when(l.at)}</span> {l.record_kind} {l.action.replace(/_/g, " ")}
                {l.message ? `: ${l.message}` : ""}
                {l.result === "dry_run" ? " (not saved)" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-ink-3">Nothing changed yet.</p>
        )}
      </div>
    </div>
  );
}

export function FlairOsBadge({ lead }: { lead: Lead }) {
  const label = flairOsStageLabel(lead.flair_os_stage ?? null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="sky">FLAIR OS</Badge>
      {label && (
        <span className="text-xs text-ink-3">
          {label}
          {lead.flair_os_sales_status ? `, ${lead.flair_os_sales_status}` : ""}
        </span>
      )}
      {lead.flair_os_owner && <span className="text-xs text-ink-3">{lead.flair_os_owner}</span>}
      {lead.flair_os_missing_at && <Badge tone="amber">Missing in FLAIR OS</Badge>}
    </div>
  );
}

type Activity = { id: string; kind: string; body: string | null; actor: string | null; occurred_at: number | null };

type EditForm = {
  contactName: string;
  email: string;
  phone: string;
  stageSlug: string;
  salesStatus: string;
  nextCheckInAt: string;
  waitingOn: string;
  dealValue: string;
  opportunityName: string;
};

function formFrom(lead: Lead): EditForm {
  return {
    contactName: lead.contact_name ?? (lead.name !== lead.company ? lead.name : ""),
    email: lead.contact_email ?? "",
    phone: lead.contact_phone ?? "",
    stageSlug: lead.flair_os_stage?.toLowerCase() ?? "",
    salesStatus: lead.flair_os_sales_status?.toLowerCase() ?? "active",
    nextCheckInAt: lead.next_action_date ?? "",
    waitingOn: lead.next_action ?? "",
    dealValue: lead.value_cents ? String(lead.value_cents / 100) : "",
    opportunityName: lead.flair_os_opportunity ?? "",
  };
}

/**
 * The deal dialog. Read-only when writes are off; in two-way mode every FLAIR
 * OS field here is editable and saved to FLAIR OS first (PATCH
 * /api/flair-os/deals/:dealId), with "Add note" and "Add next step" posting to
 * the FLAIR OS timeline and tasks. The mirror row that comes back is what the
 * page then shows.
 */
export function MirroredLeadModal({
  lead,
  stageLabel,
  stages = [],
  canWrite = false,
  onClose,
  onChanged,
  attachments,
}: {
  lead: Lead;
  /** Server label for the FLAIR OS stage, when the board knows it. */
  stageLabel?: string;
  stages?: FlairOsStageMeta[];
  /** Owner view with FLAIR_OS_WRITE_ENABLED on. */
  canWrite?: boolean;
  onClose: () => void;
  /** FLAIR OS accepted a change; this is the refreshed mirror row. */
  onChanged?: (lead: Lead) => void;
  attachments: React.ReactNode;
}) {
  const shareHeaders = useShareHeaders();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "note" | "task">("view");
  const [form, setForm] = useState<EditForm>(() => formFrom(lead));
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "call" | "email">("note");
  const [touch, setTouch] = useState(false);
  const [task, setTask] = useState({ title: "", dueAt: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const dealId = lead.flair_os_id as string;

  const loadActivities = useCallback(() => {
    fetch(`/api/flair-os/leads/${lead.id}/activities`, { headers: shareHeaders, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((j) => setActivities(j.activities ?? []))
      .catch(() => setActivities([]));
  }, [lead.id, shareHeaders]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    if (mode === "view") setForm(formFrom(lead));
  }, [lead, mode]);

  const stageOptions = stages.filter((s) => (FLAIR_OS_WRITABLE_STAGES as readonly string[]).includes(s.slug.toLowerCase())).sort((a, b) => a.sort_order - b.sort_order);
  const currentStageWritable = stageOptions.some((s) => s.slug.toLowerCase() === form.stageSlug);

  async function saveEdit() {
    const before = formFrom(lead);
    const patch: Record<string, unknown> = {};
    if (form.contactName !== before.contactName) patch.contactName = form.contactName || null;
    if (form.email !== before.email) patch.email = form.email || null;
    if (form.phone !== before.phone) patch.phone = form.phone || null;
    if (form.stageSlug !== before.stageSlug && form.stageSlug) patch.stageSlug = form.stageSlug;
    if (form.salesStatus !== before.salesStatus) patch.salesStatus = form.salesStatus;
    if (form.nextCheckInAt !== before.nextCheckInAt) patch.nextCheckInAt = form.nextCheckInAt || null;
    if (form.waitingOn !== before.waitingOn) patch.waitingOn = form.waitingOn || null;
    if (form.opportunityName !== before.opportunityName) patch.opportunityName = form.opportunityName || null;
    if (form.dealValue !== before.dealValue) {
      const raw = form.dealValue.replace(/[$,\s]/g, "");
      const n = parseFloat(raw);
      if (raw === "") patch.dealValue = null;
      else if (Number.isFinite(n)) patch.dealValue = n;
      else {
        toast("Deal value must be a number", { tone: "error" });
        return;
      }
    }
    if (!Object.keys(patch).length) {
      setMode("view");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/flair-os/deals/${dealId}`, { method: "PATCH", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ patch }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `FLAIR OS did not save it: ${json.error}` : "FLAIR OS did not save it", { tone: "error" });
        return;
      }
      onChanged?.(json.lead as Lead);
      toast("Saved in FLAIR OS", { tone: "success" });
      setMode("view");
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function postNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/flair-os/deals/${dealId}`, { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ kind: "note", body: note, noteKind, touchContact: touch }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `FLAIR OS did not take the note: ${json.error}` : "FLAIR OS did not take the note", { tone: "error" });
        return;
      }
      if (Array.isArray(json.activities)) setActivities(json.activities);
      else loadActivities();
      if (touch) {
        const r = await fetch(`/api/flair-os/deals/${dealId}`, { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ kind: "refresh" }) }).catch(() => null);
        const j = r?.ok ? await r.json().catch(() => null) : null;
        if (j?.lead) onChanged?.(j.lead as Lead);
      }
      toast("Posted on the FLAIR OS timeline", { tone: "success" });
      setNote("");
      setTouch(false);
      setMode("view");
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function postTask() {
    if (!task.title.trim() || !task.dueAt) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/flair-os/deals/${dealId}`, { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ kind: "task", title: task.title, dueAt: task.dueAt, notes: task.notes || null }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `FLAIR OS did not create the task: ${json.error}` : "FLAIR OS did not create the task", { tone: "error" });
        return;
      }
      toast("Task created in FLAIR OS. It shows under Todos too.", { tone: "success" });
      setTask({ title: "", dueAt: "", notes: "" });
      setMode("view");
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, React.ReactNode][] = [
    ["Company", lead.company],
    ["Opportunity", lead.flair_os_opportunity],
    ["Contact", lead.contact_name ?? (lead.name !== lead.company ? lead.name : null)],
    ["Email", lead.contact_email],
    ["Phone", lead.contact_phone],
    ["Stage", flairOsStageLabel(lead.flair_os_stage ?? null, stageLabel) || lead.flair_os_stage || ""],
    ["Sales status", lead.flair_os_sales_status],
    ["Owner", lead.flair_os_owner ?? "Unassigned"],
    ["Deal value", lead.value_cents ? `$${(lead.value_cents / 100).toLocaleString()}` : null],
    ["Last contacted", lead.flair_os_last_contacted_at ? when(lead.flair_os_last_contacted_at) : null],
    ["Next check-in", dateOnly(lead.next_action_date)],
    ["Waiting on", lead.next_action],
    ["Last change in FLAIR OS", lead.flair_os_updated_at ? when(lead.flair_os_updated_at) : null],
  ];

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const footer =
    mode === "edit" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={saveEdit} loading={busy} disabled={busy}>
          Save to FLAIR OS
        </Button>
      </>
    ) : mode === "note" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={postNote} loading={busy} disabled={busy || !note.trim()}>
          Post to FLAIR OS
        </Button>
      </>
    ) : mode === "task" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={postTask} loading={busy} disabled={busy || !task.title.trim() || !task.dueAt}>
          Create in FLAIR OS
        </Button>
      </>
    ) : (
      <>
        {canWrite ? (
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setMode("edit")}>
              <Pencil size={13} /> Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode("note")}>
              <MessageSquarePlus size={13} /> Add note
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode("task")}>
              <CalendarPlus size={13} /> Add next step
            </Button>
          </div>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={lead.company || lead.name}
      description={canWrite ? "This deal lives in FLAIR OS. Changes made here are saved there first." : "This deal lives in FLAIR OS. Changes are made there for now."}
      size="lg"
      footer={footer}
    >
      <div className="space-y-5">
        {lead.flair_os_missing_at && (
          <div className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
            This deal disappeared from FLAIR OS on {when(lead.flair_os_missing_at)}. It is kept here until you decide what to do with it.
          </div>
        )}

        {mode === "edit" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact">
              <Input value={form.contactName} onChange={set("contactName")} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="Opportunity name" hint="When the deal is a specific campaign, not just the brand.">
              <Input value={form.opportunityName} onChange={set("opportunityName")} />
            </Field>
            <Field label="Stage" hint={currentStageWritable || !form.stageSlug ? undefined : `FLAIR OS does not accept moves into ${lead.flair_os_stage} from here; it stays unless you pick another.`}>
              <Select value={currentStageWritable ? form.stageSlug : ""} onChange={set("stageSlug")}>
                {!currentStageWritable && <option value="">{flairOsStageLabel(lead.flair_os_stage ?? null, stageLabel) || "Current stage"}</option>}
                {stageOptions.map((s) => (
                  <option key={s.slug} value={s.slug.toLowerCase()}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sales status">
              <Select value={form.salesStatus} onChange={set("salesStatus")}>
                <option value="active">active</option>
                <option value="nurture">nurture</option>
                <option value="won">won</option>
                <option value="lost">lost</option>
              </Select>
            </Field>
            <Field label="Next check-in">
              <Input type="date" value={form.nextCheckInAt} onChange={set("nextCheckInAt")} />
            </Field>
            <Field label="Waiting on">
              <Input value={form.waitingOn} onChange={set("waitingOn")} placeholder="Their legal review" />
            </Field>
            <Field label="Deal value" hint="Dollars">
              <Input inputMode="decimal" value={form.dealValue} onChange={set("dealValue")} placeholder="25000" />
            </Field>
          </div>
        ) : mode === "note" ? (
          <div className="space-y-3">
            <Field label="Note for the FLAIR OS timeline" hint="Everyone with FLAIR OS sees it. Your name and today's date go with it.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} autoFocus />
            </Field>
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <Select value={noteKind} onChange={(e) => setNoteKind(e.target.value as "note" | "call" | "email")} className="w-32">
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
              </Select>
              <label className="flex cursor-pointer items-center gap-2 text-ink-2">
                <input type="checkbox" checked={touch} onChange={(e) => setTouch(e.target.checked)} className="accent-[var(--brand)]" />
                This was contact with them (updates last contacted)
              </label>
            </div>
          </div>
        ) : mode === "task" ? (
          <div className="space-y-3">
            <Field label="Next step" required>
              <Input value={task.title} onChange={(e) => setTask((t) => ({ ...t, title: e.target.value }))} placeholder="Send the proposal" autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Due" required>
                <Input type="date" value={task.dueAt} onChange={(e) => setTask((t) => ({ ...t, dueAt: e.target.value }))} />
              </Field>
            </div>
            <Field label="Details">
              <Textarea value={task.notes} onChange={(e) => setTask((t) => ({ ...t, notes: e.target.value }))} rows={3} />
            </Field>
            <p className="text-xs text-ink-3">Created as a FLAIR OS task on this deal and mirrored under Todos here. Ticking it there completes it in FLAIR OS.</p>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-xs font-medium text-ink-3">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
          </dl>
        )}

        {mode === "view" && lead.notes && (
          <div>
            <div className="text-xs font-medium text-ink-3">Your note (kept here, not in FLAIR OS)</div>
            <div className="mt-1 text-[13px] text-ink-2">
              <FormattedText text={lead.notes} />
            </div>
          </div>
        )}

        {mode === "view" && lead.flair_os_notes && (
          <div>
            <div className="text-xs font-medium text-ink-3">Notes in FLAIR OS</div>
            <div className="mt-1 text-[13px] text-ink-2">
              <FormattedText text={lead.flair_os_notes} />
            </div>
          </div>
        )}

        {mode === "view" && (
          <div>
            <div className="text-xs font-medium text-ink-3">FLAIR OS timeline</div>
            {activities === null ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <Loader2 size={13} className="animate-spin" /> Loading
              </div>
            ) : activities.length === 0 ? (
              <p className="mt-1 text-[13px] text-ink-3">{canWrite ? "Nothing posted from here yet. FLAIR OS does not share its own timeline." : "FLAIR OS does not share deal timelines yet."}</p>
            ) : (
              <Card className="mt-2">
                <ul className="divide-y divide-line">
                  {activities.map((a) => (
                    <li key={a.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-ink-3">
                        <Badge tone={a.kind === "stage_change" ? "violet" : a.kind === "call" || a.kind === "email" ? "blue" : "neutral"}>{a.kind.replace("_", " ")}</Badge>
                        {a.actor && <span>{a.actor}</span>}
                        {a.occurred_at && <span className="tabular-nums">{when(a.occurred_at)}</span>}
                      </div>
                      {a.body && <div className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{a.body}</div>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        {mode === "view" && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <Link2 size={13} /> Attachments (kept here, not in FLAIR OS)
            </div>
            {attachments}
          </div>
        )}
      </div>
    </Modal>
  );
}
