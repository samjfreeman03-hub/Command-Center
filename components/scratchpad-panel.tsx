"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, AlertTriangle, Sparkles, Undo2, Send } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { BUSINESSES } from "@/lib/businesses";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge, Card, SectionHeader } from "@/components/ui/display";
import { confirmDialog, toast } from "@/components/ui/host";
import { refreshNav } from "@/lib/ui-events";
import { cn } from "@/lib/cn";

type Proposal = {
  line_index: number;
  type: "todo" | "lead" | "initiative";
  business_id: string | null;
  title: string;
  priority: "low" | "medium" | "high" | null;
  due_date: string | null;
  company: string | null;
};
type ReviewItem = Proposal & { checked: boolean };

/**
 * Dashboard scratchpad: free-form quick notes/todos. Persisted server-side
 * (app_state table) so it follows the user across devices and survives
 * refreshes. Autosaves ~600ms after typing stops; flushes immediately when
 * the tab is hidden/closed so fast exits don't lose the last keystrokes.
 *
 * Two AI actions, both preview-first (nothing changes until you confirm):
 *  - Organize: regroup the text itself.
 *  - File: turn lines into real todos / leads / initiatives in the right business.
 */
export function ScratchpadPanel({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [organizing, setOrganizing] = useState(false);
  const [preview, setPreview] = useState<{ original: string; organized: string } | null>(null);
  const [undo, setUndo] = useState<{ original: string; organized: string } | null>(null);
  const [filing, setFiling] = useState(false);
  const [review, setReview] = useState<{ original: string; items: ReviewItem[] } | null>(null);
  const [applying, setApplying] = useState(false);
  const busyRef = useRef(false);
  const previewRef = useRef<HTMLElement>(null);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const lastSaved = useRef(initialValue);
  latest.current = value;

  const saveNow = useCallback(async (text: string) => {
    if (saving.current || text === lastSaved.current) return;
    saving.current = true;
    try {
      // Serialize saves, draining the latest edit after each response. An older
      // autosave must not land after Apply or Undo and overwrite it.
      while (text !== lastSaved.current) {
        setStatus("saving");
        const res = await fetch("/api/scratchpad", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: text }),
          keepalive: true,
        });
        if (!res.ok) throw new Error("Save failed");
        lastSaved.current = text;
        text = latest.current;
      }
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      saving.current = false;
    }
  }, []);

  // Debounced autosave
  useEffect(() => {
    if (value === lastSaved.current) return;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNow(latest.current), 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, saveNow]);

  // Flush pending edits when the tab hides or the page unloads
  useEffect(() => {
    function flush() {
      if (latest.current !== lastSaved.current) saveNow(latest.current);
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [saveNow]);

  // Bring the preview into view when it arrives: with a tall scratchpad it
  // renders below the fold and is otherwise easy to miss entirely.
  useEffect(() => {
    if (preview) previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [preview]);

  function changeValue(text: string) {
    latest.current = text;
    setValue(text);
  }

  // ── Organize ──────────────────────────────────────────────────────────────

  async function organize() {
    if (busyRef.current || !latest.current.trim()) return;
    const original = latest.current;
    busyRef.current = true;
    setOrganizing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/scratchpad/organize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: original }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok || typeof data.value !== "string" || !data.value.trim()) {
        throw new Error(data.error || "Could not organize. Your notes are unchanged.");
      }
      setPreview({ original, organized: data.value });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not organize. Please try again.", { tone: "error" });
    } finally {
      busyRef.current = false;
      setOrganizing(false);
    }
  }

  function applyPreview() {
    if (!preview || latest.current !== preview.original) return;
    setUndo(preview);
    changeValue(preview.organized);
    setPreview(null);
    void saveNow(preview.organized);
  }

  function undoOrganize() {
    if (!undo || latest.current !== undo.organized) return;
    changeValue(undo.original);
    void saveNow(undo.original);
    setUndo(null);
  }

  // ── File to tabs ──────────────────────────────────────────────────────────

  async function proposeFiling() {
    if (busyRef.current || !latest.current.trim()) return;
    const original = latest.current;
    busyRef.current = true;
    setFiling(true);
    try {
      const res = await fetch("/api/scratchpad/file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: original }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.items)) throw new Error(data.error || "Could not read the scratchpad.");
      if (data.items.length === 0) {
        toast("Nothing here looks like a task, deal or initiative yet");
        return;
      }
      // Pre-check only what the AI was certain about; the rest waits for a business.
      setReview({ original, items: (data.items as Proposal[]).map((p) => ({ ...p, checked: p.business_id !== null })) });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not read the scratchpad.", { tone: "error" });
    } finally {
      busyRef.current = false;
      setFiling(false);
    }
  }

  function patchItem(index: number, patch: Partial<ReviewItem>) {
    setReview((r) => (r ? { ...r, items: r.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) } : r));
  }

  async function applyFiling() {
    if (!review) return;
    if (latest.current !== review.original) {
      toast("The scratchpad changed since this was prepared. Run File again.", { tone: "error" });
      setReview(null);
      return;
    }
    const chosen = review.items.filter((it) => it.checked && it.business_id && it.title.trim());
    if (chosen.length === 0) return;
    setApplying(true);
    const filed: number[] = [];
    for (const it of chosen) {
      const base = { business_id: it.business_id, title: it.title.trim() };
      const request =
        it.type === "todo"
          ? { url: "/api/todos", body: { ...base, priority: it.priority ?? undefined, due_date: it.due_date ?? undefined } }
          : it.type === "lead"
            ? { url: "/api/leads", body: { business_id: it.business_id, name: it.title.trim(), company: it.company ?? undefined, next_action_date: it.due_date ?? undefined } }
            : { url: "/api/initiatives", body: { ...base, horizon: "next", target_date: it.due_date ?? undefined } };
      try {
        const res = await fetch(request.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
        });
        if (res.ok) filed.push(it.line_index);
      } catch {
        /* counted as not filed below */
      }
    }
    // Remove exactly the lines that made it into a tab; everything else stays put.
    if (filed.length > 0) {
      const drop = new Set(filed);
      const remaining = review.original
        .split("\n")
        .filter((_, i) => !drop.has(i))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      changeValue(remaining);
      void saveNow(remaining);
      setUndo(null);
      refreshNav();
      router.refresh();
    }
    setApplying(false);
    setReview(null);
    const failed = chosen.length - filed.length;
    toast(
      failed === 0 ? `Filed ${filed.length} item${filed.length === 1 ? "" : "s"}` : `Filed ${filed.length}, ${failed} failed and stayed in the scratchpad`,
      { tone: failed === 0 ? "success" : "error" }
    );
  }

  async function clearAll() {
    if (!value.trim()) return;
    if (!(await confirmDialog({ title: "Clear the scratchpad?", description: "This removes everything in it.", confirmLabel: "Clear", destructive: true }))) return;
    changeValue("");
    setPreview(null);
    setUndo(null);
  }

  const readyCount = review?.items.filter((it) => it.checked && it.business_id && it.title.trim()).length ?? 0;
  const busy = organizing || filing;

  return (
    <div>
      <SectionHeader
        title="Scratchpad"
        action={
          <span className="inline-flex items-center gap-1 text-xs text-ink-3" aria-live="polite">
            {status === "saving" && (<><Loader2 size={11} className="animate-spin" /> Saving</>)}
            {status === "saved" && (<><Check size={11} className="text-emerald-600 dark:text-emerald-400" /> Saved</>)}
            {status === "error" && (
              <button onClick={() => void saveNow(latest.current)} className="inline-flex items-center gap-1 text-amber-700 hover:underline dark:text-amber-400">
                <AlertTriangle size={11} /> Not saved. Retry
              </button>
            )}
          </span>
        }
      />
      <Card className="transition-[border-color,box-shadow] focus-within:border-line-strong focus-within:shadow-lift">
        <AutoTextarea
          value={value}
          onChange={(e) => changeValue(e.target.value)}
          aria-label="Scratchpad"
          minRows={7}
          maxHeightPx={520}
          placeholder={"Dump anything here. It saves as you type.\n\n- call the venue back\n- flair: send method the renewal proposal friday\n- idea: rooftop for TechWeek closing"}
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-4"
        />
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-sunken/50 px-2.5 py-2">
          <Button size="sm" variant="brand" onClick={proposeFiling} disabled={busy || !value.trim()} loading={filing} title="Turn lines into real todos, deals and initiatives in the right business">
            {!filing && <Send size={12} />} File to tabs
          </Button>
          <Button size="sm" variant="ghost" onClick={organize} disabled={busy || !value.trim()} loading={organizing} title="Regroup and tidy the text without losing anything">
            {!organizing && <Sparkles size={12} />} Organize
          </Button>
          {undo && value === undo.organized && (
            <Button size="sm" variant="ghost" onClick={undoOrganize}>
              <Undo2 size={12} /> Undo organize
            </Button>
          )}
          <span className="flex-1" />
          {value.trim() && (
            <IconButton size="sm" label="Clear scratchpad" onClick={clearAll}>
              <Trash2 size={13} />
            </IconButton>
          )}
        </div>

        {preview && (
          <section ref={previewRef} aria-label="Organized preview" className="scroll-mt-4 border-t border-line p-4">
            <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Sparkles size={13} /> Organized preview
            </h3>
            <p className="mt-0.5 text-xs text-ink-3">Review before applying. Your original stays unchanged until you apply. Refreshing discards this preview.</p>
            <pre className="my-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-sunken p-4 font-sans text-sm leading-relaxed text-ink ring-1 ring-inset ring-line">{preview.organized}</pre>
            {value !== preview.original && (
              <p role="status" className="mb-2 text-xs text-amber-700 dark:text-amber-400">You edited the scratchpad after organizing. Organize again to include your latest changes.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={applyPreview} disabled={value !== preview.original}>Apply cleanup</Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>Discard</Button>
            </div>
          </section>
        )}
      </Card>

      {/* Review what will be filed, and where, before anything is created */}
      <Modal
        open={review !== null}
        onClose={() => !applying && setReview(null)}
        title="File to tabs"
        description="Checked items become real records and leave the scratchpad. Anything without a clear business is left unchecked for you to place."
        size="lg"
        footer={
          <>
            <span className="text-xs text-ink-3">{readyCount} of {review?.items.length ?? 0} selected</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setReview(null)} disabled={applying}>Cancel</Button>
              <Button variant="primary" onClick={applyFiling} disabled={readyCount === 0} loading={applying}>
                File {readyCount || ""} item{readyCount === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        }
      >
        <div className="space-y-2">
          {review?.items.map((it, i) => {
            const needsBusiness = !it.business_id;
            return (
              <div key={it.line_index} className={cn("rounded-xl border border-line p-3 transition-opacity", !it.checked && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={it.checked}
                    onChange={(e) => patchItem(i, { checked: e.target.checked })}
                    aria-label={`File: ${it.title}`}
                    className="mt-2.5 h-4 w-4 shrink-0 accent-[var(--ink)]"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input value={it.title} onChange={(e) => patchItem(i, { title: e.target.value })} aria-label="Title" />
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-36">
                        <Select value={it.type} onChange={(e) => patchItem(i, { type: e.target.value as Proposal["type"] })} aria-label="Type">
                          <option value="todo">Todo</option>
                          <option value="lead">Pipeline deal</option>
                          <option value="initiative">Initiative</option>
                        </Select>
                      </div>
                      <div className="w-44">
                        <Select
                          value={it.business_id ?? ""}
                          onChange={(e) => patchItem(i, { business_id: e.target.value || null, checked: !!e.target.value })}
                          aria-label="Business"
                          className={cn(needsBusiness && "border-amber-500/60")}
                        >
                          <option value="">Choose a business…</option>
                          {BUSINESSES.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </Select>
                      </div>
                      {it.due_date && <Badge>Due {it.due_date}</Badge>}
                      {it.priority === "high" && <Badge tone="amber">High</Badge>}
                      {it.company && it.type === "lead" && <Badge>{it.company}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
