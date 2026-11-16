"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Pause, Play, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import type { Lead } from "@/lib/types";
import { useShareHeaders } from "@/lib/share-context";
import { cn } from "@/lib/cn";
import { flairOsStageLabel } from "@/lib/flair-os/stage-map";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/host";
import { Badge, Card } from "@/components/ui/display";
import { FormattedText } from "@/components/formatted-text";

/**
 * FLAIR OS mirror UI for the FLAIR pipeline tab (phase 1, read-only):
 * the status strip, the card badge, and the read-only lead detail.
 */

type Status = {
  enabled: boolean;
  canSync?: boolean;
  dryRunDefault?: boolean;
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
    } | null;
  };
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

function ago(ms: number | null | undefined): string {
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

export function FlairOsStrip({ canSync }: { canSync: boolean }) {
  const shareHeaders = useShareHeaders();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"sync" | "dry" | "pause" | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/flair-os/status", { headers: shareHeaders, cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      /* keep the last status */
    }
  }, [shareHeaders]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function pull(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "sync");
    try {
      const res = await fetch("/api/flair-os/sync", {
        method: "POST",
        headers: { "content-type": "application/json", ...shareHeaders },
        body: JSON.stringify({ dryRun }),
      });
      const summary = await res.json().catch(() => null);
      if (res.ok && summary?.ok) {
        const d = summary.deals;
        toast(
          dryRun
            ? `Dry run: ${d.created} new, ${d.updated} changed, ${d.missing} missing of ${d.seen} deals. Nothing written.`
            : `Synced ${d.seen} deals: ${d.created} new, ${d.updated} changed`,
          { tone: "success" }
        );
        if (!dryRun && (d.created > 0 || d.updated > 0 || summary.tasks.created > 0 || summary.tasks.updated > 0)) {
          // Mirrored rows changed on the server; a reload is the honest refresh.
          window.location.reload();
          return;
        }
      } else {
        toast(summary?.error ? `Could not sync: ${summary.error}` : "Could not sync with FLAIR OS", { tone: "error" });
      }
    } catch {
      toast("Could not reach the sync route", { tone: "error" });
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
      if (!res.ok) toast("Could not change the pull setting", { tone: "error" });
    } finally {
      setBusy(null);
      load();
    }
  }

  if (!status) {
    return (
      <div className="mb-4 flex items-center gap-2 text-xs text-ink-3">
        <Loader2 size={13} className="animate-spin" /> Checking FLAIR OS mirror
      </div>
    );
  }
  if (!status.enabled) return null;

  const st = status.state;
  const drift = status.drift;
  const summary = st?.last_summary ?? null;
  const healthy = !!st?.last_ok_at && !st.last_error;
  const problems = (drift?.leads_missing ?? 0) + (drift?.leads_unknown_stage ?? 0);

  return (
    <div className="mb-5">
      <Card>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <span className={cn("h-2 w-2 rounded-full", st?.pull_paused ? "bg-amber-500" : healthy ? "bg-emerald-500" : "bg-red-500")} />
              FLAIR OS mirror
            </span>
            <Badge tone={st?.pull_paused ? "amber" : healthy ? "green" : "red"}>
              {st?.pull_paused ? "Paused" : healthy ? "Read-only" : st?.last_error ? "Error" : "Not synced yet"}
            </Badge>
            <span className="text-ink-3">
              Synced <span className="tabular-nums text-ink-2">{ago(st?.last_ok_at)}</span>
              {status.scheduler?.running ? `, every ${status.scheduler.intervalMinutes} min` : ", manual only"}
            </span>
            {drift && (
              <span className="text-ink-3">
                <span className="tabular-nums text-ink-2">{drift.leads_mirrored}</span> deals,{" "}
                <span className="tabular-nums text-ink-2">{drift.todos_mirrored}</span> tasks,{" "}
                <span className="tabular-nums text-ink-2">{drift.clients_mirrored}</span> clients
              </span>
            )}
            {problems > 0 && <Badge tone="amber">{problems} to review</Badge>}
            {st?.last_error && <span className="truncate text-red-600 dark:text-red-400">{st.last_error}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canSync && (
              <>
                <Button size="sm" onClick={() => pull(false)} loading={busy === "sync"} disabled={busy !== null || status.inFlight}>
                  <RefreshCw size={13} /> Sync now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => pull(true)} loading={busy === "dry"} disabled={busy !== null || status.inFlight}>
                  Dry run
                </Button>
                <Button size="sm" variant="ghost" onClick={togglePause} loading={busy === "pause"} disabled={busy !== null}>
                  {st?.pull_paused ? <Play size={13} /> : <Pause size={13} />}
                  {st?.pull_paused ? "Resume" : "Pause"}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Details
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-line px-4 py-3 text-[13px]">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs font-medium text-ink-3">Last pull</div>
                {summary ? (
                  <ul className="mt-1 space-y-0.5 text-ink-2">
                    <li>
                      {summary.dry_run ? "Dry run" : "Pull"} at {when(st?.last_run_at)}, {summary.calls} calls, {summary.duration_ms} ms
                    </li>
                    <li>
                      Deals: {summary.deals.created} new, {summary.deals.updated} changed, {summary.deals.unchanged} unchanged, {summary.deals.missing} missing
                    </li>
                    <li>
                      Tasks: {summary.tasks.created} new, {summary.tasks.updated} changed. Clients: {summary.clients.created} new, {summary.clients.updated} changed
                    </li>
                    {summary.unknown_stages.length > 0 && (
                      <li className="text-amber-700 dark:text-amber-300">Unknown FLAIR OS stages: {summary.unknown_stages.join(", ")}</li>
                    )}
                  </ul>
                ) : (
                  <p className="mt-1 text-ink-3">No pull yet.</p>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3">Drift</div>
                {drift && (
                  <ul className="mt-1 space-y-0.5 text-ink-2">
                    <li>{drift.leads_missing} mirrored deals no longer in FLAIR OS</li>
                    <li>{drift.leads_local_only} FLAIR leads only in the Command Center</li>
                    <li>{drift.leads_unknown_stage} deals with a stage the map does not know</li>
                  </ul>
                )}
                {drift && drift.missing.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-3">
                    {drift.missing.slice(0, 5).map((m) => (
                      <li key={m.id}>
                        {m.company || m.name}, missing since {when(m.missing_at)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-ink-3">Recent changes</div>
                {status.log && status.log.filter((l) => l.record_kind !== "cycle").length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
                    {status.log
                      .filter((l) => l.record_kind !== "cycle")
                      .slice(0, 8)
                      .map((l) => (
                        <li key={l.id} className="truncate">
                          <span className="text-ink-3">{when(l.at)}</span> {l.record_kind} {l.action}
                          {l.message ? `: ${l.message}` : ""}
                          {l.result === "dry_run" ? " (dry run)" : ""}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-ink-3">Nothing changed yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
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

export function MirroredLeadModal({
  lead,
  stageLabel,
  onClose,
  attachments,
}: {
  lead: Lead;
  stageLabel: string;
  onClose: () => void;
  attachments: React.ReactNode;
}) {
  const shareHeaders = useShareHeaders();
  const [activities, setActivities] = useState<Activity[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/flair-os/leads/${lead.id}/activities`, { headers: shareHeaders, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((j) => alive && setActivities(j.activities ?? []))
      .catch(() => alive && setActivities([]));
    return () => {
      alive = false;
    };
  }, [lead.id, shareHeaders]);

  const rows: [string, React.ReactNode][] = [
    ["Company", lead.company],
    ["Contact", lead.contact_name ?? lead.name],
    ["Email", lead.contact_email],
    ["Phone", lead.contact_phone],
    [
      "FLAIR OS stage",
      `${flairOsStageLabel(lead.flair_os_stage ?? null) || lead.flair_os_stage || ""}${lead.flair_os_sales_status ? ` (${lead.flair_os_sales_status})` : ""}`,
    ],
    ["Shown here as", stageLabel],
    ["Owner", lead.flair_os_owner],
    ["Value", lead.value_cents ? `$${(lead.value_cents / 100).toLocaleString()}` : null],
    ["Next action", lead.next_action ? `${lead.next_action}${lead.next_action_date ? `, ${lead.next_action_date}` : ""}` : lead.next_action_date],
    ["Last change in FLAIR OS", lead.flair_os_updated_at ? when(lead.flair_os_updated_at) : null],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={lead.company || lead.name}
      description="Managed in FLAIR OS. This is a read-only mirror; edits arrive with write-back in phase 2."
      size="lg"
      footer={
        <>
          <span />
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {lead.flair_os_missing_at && (
          <div className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
            This deal stopped appearing in FLAIR OS on {when(lead.flair_os_missing_at)}. It is kept here until you decide what to do with it.
          </div>
        )}
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

        {lead.flair_os_notes && (
          <div>
            <div className="text-xs font-medium text-ink-3">Notes in FLAIR OS</div>
            <div className="mt-1 text-[13px] text-ink-2">
              <FormattedText text={lead.flair_os_notes} />
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-ink-3">FLAIR OS timeline</div>
          {activities === null ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
              <Loader2 size={13} className="animate-spin" /> Loading
            </div>
          ) : activities.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-3">No activity mirrored yet.</p>
          ) : (
            <Card className="mt-2">
              <ul className="divide-y divide-line">
                {activities.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-xs text-ink-3">
                      <Badge tone={a.kind === "stage_change" ? "violet" : a.kind === "call" || a.kind === "email" ? "blue" : "neutral"}>
                        {a.kind.replace("_", " ")}
                      </Badge>
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

        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-3">
            <Link2 size={13} /> Attachments (kept here, not in FLAIR OS)
          </div>
          {attachments}
        </div>
      </div>
    </Modal>
  );
}
