"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";
import { cn } from "@/lib/cn";
import type { Comparison, CompareField } from "@/lib/flair-os/merge";
import type { ReconciliationItem } from "@/lib/flair-os/store";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field, FieldGroup } from "@/components/ui/input";
import { Badge } from "@/components/ui/display";
import { toast } from "@/components/ui/host";

/**
 * The two merge sheets of the two-way design (TWO_WAY_PLAN.md section 3.4):
 *
 *   MergeSheet   Sam's lead against the FLAIR OS deal it matches, side by side.
 *                Gaps are filled into FLAIR OS, conflicts are chosen (FLAIR OS
 *                pre-selected), notes go on the FLAIR OS timeline, the next
 *                action becomes a FLAIR OS task, a stage move is offered when
 *                Sam is further along. Then the lead becomes the mirror row.
 *   AddSheet     a lead FLAIR OS does not have: create the deal there from the
 *                lead, then link. FLAIR OS dedupes by email or company unless
 *                "create anyway" is ticked.
 *
 * With writes off both sheets still show the comparison, say why nothing can
 * be saved, and offer the old link-only merge.
 */

export type MergeDone = { leadId: number; dealId: string; folded: number | null; message: string };

const STATE_LABEL: Record<CompareField["state"], string> = {
  same: "Same",
  gap: "Fills a gap",
  conflict: "Differs",
  os_only: "FLAIR OS only",
  empty: "",
};

function show(f: CompareField, v: string | null): string | null {
  if (v === null) return null;
  if (f.key === "value_cents") {
    const n = Number(v);
    return Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : v;
  }
  return v;
}

function Cell({ v, muted }: { v: string | null; muted?: boolean }) {
  return <span className={cn("block truncate text-[13px]", v === null ? "text-ink-4" : muted ? "text-ink-3" : "text-ink")}>{v ?? "blank"}</span>;
}

export function MergeSheet({
  item,
  writeEnabled,
  onClose,
  onDone,
}: {
  item: ReconciliationItem & { match: NonNullable<ReconciliationItem["match"]> };
  writeEnabled: boolean;
  onClose: () => void;
  onDone: (r: MergeDone) => void;
}) {
  const shareHeaders = useShareHeaders();
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, "cc" | "os">>({});
  const [pushNote, setPushNote] = useState(true);
  const [pushTask, setPushTask] = useState(true);
  const [moveStage, setMoveStage] = useState(false);
  const [busy, setBusy] = useState(false);
  const dealId = item.match.flair_os_id;

  useEffect(() => {
    let alive = true;
    fetch("/api/flair-os/reconcile", { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ action: "compare", leadId: item.id, dealId }) })
      .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))
      .then(({ ok, json }) => {
        if (!alive) return;
        if (!ok || !json?.comparison) setError(json?.error ?? "Could not compare");
        else setCmp(json.comparison as Comparison);
      })
      .catch(() => alive && setError("Could not reach the server"));
    return () => {
      alive = false;
    };
  }, [item.id, dealId, shareHeaders]);

  const gaps = cmp?.fields.filter((f) => f.state === "gap") ?? [];
  const conflicts = cmp?.fields.filter((f) => f.state === "conflict") ?? [];
  const visible = cmp?.fields.filter((f) => f.state !== "empty") ?? [];
  const willWrite = gaps.length + conflicts.filter((f) => picks[f.key] === "cc").length + (pushNote && cmp?.notePreview ? 1 : 0) + (pushTask && cmp?.taskCandidate ? 1 : 0) + (moveStage && cmp?.stage.ccAhead ? 1 : 0);

  async function run(mode: "merge" | "link") {
    setBusy(true);
    try {
      const body = mode === "merge" ? { action: "merge", leadId: item.id, dealId, choices: { fields: picks, pushNote, pushTask, moveStage } } : { action: "link", leadId: item.id, dealId };
      const res = await fetch("/api/flair-os/reconcile", { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `Could not merge: ${json.error}` : "Could not merge", { tone: "error" });
        return;
      }
      const written: string[] = json.written ?? [];
      const parts = [written.length ? `wrote ${written.join(", ").toLowerCase()} to FLAIR OS` : null, json.notePosted ? "posted your note" : null, json.taskCreated ? "created the task" : null].filter(Boolean);
      onDone({ leadId: item.id, dealId, folded: json.folded ?? null, message: mode === "merge" ? `Merged${parts.length ? `: ${parts.join(", ")}` : ". FLAIR OS already had everything."}` : "Linked. Nothing was written to FLAIR OS." });
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const title = `Merge ${item.company || item.name} into FLAIR OS`;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={cmp ? `FLAIR OS deal: ${cmp.deal.company || "unnamed"}${cmp.stage.osLabel ? `, ${cmp.stage.osLabel}` : ""}${cmp.deal.owner ? `, ${cmp.deal.owner}` : ""}. After the merge this row shows the FLAIR OS deal.` : "Comparing"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {!writeEnabled && cmp && (
              <Button variant="secondary" onClick={() => run("link")} loading={busy} disabled={busy}>
                Link only
              </Button>
            )}
            <Button variant="primary" onClick={() => run("merge")} loading={busy} disabled={busy || !cmp || !writeEnabled}>
              {willWrite > 0 ? `Merge and write ${willWrite} to FLAIR OS` : "Merge"}
            </Button>
          </div>
        </>
      }
    >
      {error ? (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      ) : !cmp ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-ink-3">
          <Loader2 size={14} className="animate-spin" /> Reading both records
        </div>
      ) : (
        <div className="space-y-5">
          {!writeEnabled && (
            <div className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
              Saving to FLAIR OS is off, so nothing below can be written. Ask Tyler to widen the key, then turn on FLAIR_OS_WRITE_ENABLED. Link only keeps your values here.
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[7rem_1fr_1fr] gap-x-3 bg-sunken px-3 py-1.5 text-[11px] font-medium text-ink-3 sm:grid-cols-[8rem_1fr_1fr_7rem]">
              <span>Field</span>
              <span>Yours</span>
              <span>FLAIR OS</span>
              <span className="hidden sm:block">After merge</span>
            </div>
            <div className="divide-y divide-line">
              {visible.map((f) => {
                const pick = f.state === "conflict" ? picks[f.key] ?? "os" : f.state === "gap" ? "cc" : "os";
                const after = pick === "cc" ? f.cc : f.os;
                return (
                  <div key={f.key} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-x-3 px-3 py-2 sm:grid-cols-[8rem_1fr_1fr_7rem]">
                    <div>
                      <div className="text-xs font-medium text-ink-2">{f.label}</div>
                      {f.state !== "same" && <div className={cn("text-[11px]", f.state === "gap" ? "text-emerald-600 dark:text-emerald-400" : f.state === "conflict" ? "text-amber-600 dark:text-amber-400" : "text-ink-4")}>{STATE_LABEL[f.state]}</div>}
                    </div>
                    {f.state === "conflict" ? (
                      <>
                        <label className="flex min-w-0 cursor-pointer items-center gap-2">
                          <input type="radio" name={`pick-${f.key}`} checked={pick === "cc"} onChange={() => setPicks((p) => ({ ...p, [f.key]: "cc" }))} className="accent-[var(--brand)]" />
                          <Cell v={show(f, f.cc)} />
                        </label>
                        <label className="flex min-w-0 cursor-pointer items-center gap-2">
                          <input type="radio" name={`pick-${f.key}`} checked={pick === "os"} onChange={() => setPicks((p) => ({ ...p, [f.key]: "os" }))} className="accent-[var(--brand)]" />
                          <Cell v={show(f, f.os)} />
                        </label>
                      </>
                    ) : (
                      <>
                        <Cell v={show(f, f.cc)} muted={f.state === "same" || f.state === "os_only"} />
                        <Cell v={show(f, f.os)} muted={f.state === "same"} />
                      </>
                    )}
                    <span className="hidden min-w-0 items-center gap-1 sm:flex">
                      <ArrowRight size={11} className="shrink-0 text-ink-4" />
                      <Cell v={show(f, after)} muted={f.state === "same" || f.state === "os_only"} />
                    </span>
                  </div>
                );
              })}
              {visible.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-3">Neither record has contact or deal details yet.</div>}
            </div>
          </div>

          <div className="space-y-2">
            {cmp.notePreview && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={pushNote} onChange={(e) => setPushNote(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
                <span className="min-w-0 text-[13px]">
                  <span className="text-ink">Post your notes on the FLAIR OS timeline</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">{cmp.notePreview}</span>
                </span>
              </label>
            )}
            {cmp.taskCandidate && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={pushTask} onChange={(e) => setPushTask(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
                <span className="min-w-0 text-[13px]">
                  <span className="text-ink">Create the next step as a FLAIR OS task</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">
                    {cmp.taskCandidate.title}, due {cmp.taskCandidate.dueAt}
                  </span>
                </span>
              </label>
            )}
            {cmp.stage.ccAhead && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={moveStage} onChange={(e) => setMoveStage(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
                <span className="min-w-0 text-[13px]">
                  <span className="text-ink">Move the FLAIR OS deal to {cmp.stage.ccAsSlug}</span>
                  <span className="mt-0.5 block text-xs text-ink-3">
                    You have it at {cmp.stage.ccStage}; FLAIR OS has it at {cmp.stage.osLabel || cmp.stage.osSlug || "an unknown stage"}. Off by default: Tyler owns stages.
                  </span>
                </span>
              </label>
            )}
            {(cmp.attachments > 0 || cmp.categories.length > 0) && (
              <p className="text-xs text-ink-4">
                {[cmp.attachments > 0 ? `${cmp.attachments} attachment${cmp.attachments === 1 ? "" : "s"}` : null, cmp.categories.length ? `${cmp.categories.length} categor${cmp.categories.length === 1 ? "y" : "ies"}` : null].filter(Boolean).join(" and ")} stay only here; FLAIR OS has no field for them.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function AddSheet({
  item,
  writeEnabled,
  onClose,
  onDone,
}: {
  item: ReconciliationItem;
  writeEnabled: boolean;
  onClose: () => void;
  onDone: (r: MergeDone & { deduped: boolean }) => void;
}) {
  const shareHeaders = useShareHeaders();
  const [opportunity, setOpportunity] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = item.company || item.name;

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/flair-os/reconcile", { method: "POST", headers: { "content-type": "application/json", ...shareHeaders }, body: JSON.stringify({ action: "add", leadId: item.id, forceCreate: force, opportunityName: opportunity.trim() || null }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.error ? `Could not add: ${json.error}` : "Could not add to FLAIR OS", { tone: "error" });
        return;
      }
      onDone({ leadId: item.id, dealId: json.dealId, folded: json.folded ?? null, deduped: !!json.deduped, message: json.deduped ? `FLAIR OS already had ${title}. Linked to that deal instead.` : `${title} is now a FLAIR OS deal${json.written?.length ? ` with ${json.written.join(", ").toLowerCase()}` : ""}.` });
    } catch {
      toast("Could not reach the server", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add ${title} to FLAIR OS`}
      description="Creates the deal in FLAIR OS from what you have here, then this row shows that deal. Your attachments stay here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={busy || !writeEnabled}>
            Add to FLAIR OS
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!writeEnabled && <div className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">Saving to FLAIR OS is off. Ask Tyler to widen the key, then turn on FLAIR_OS_WRITE_ENABLED.</div>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{title}</span>
          {item.contact_name && <span>{item.contact_name}</span>}
          {item.contact_email && <span className="text-ink-3">{item.contact_email}</span>}
          <Badge tone="neutral">{item.stage}</Badge>
        </div>
        <Field label="Opportunity name" hint="Optional. For a second deal with a brand FLAIR OS already has, name the campaign so the two can be told apart.">
          <Input value={opportunity} onChange={(e) => setOpportunity(e.target.value)} placeholder="FLAIR x Brand, spring campaign" />
        </Field>
        <FieldGroup label="Duplicates">
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
            <span className="text-ink-2">Create even if FLAIR OS already has this company or email. Leave off to link to the existing deal instead.</span>
          </label>
        </FieldGroup>
      </div>
    </Modal>
  );
}
