"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, Check, Loader2, Trash2, AlertTriangle, Sparkles, Undo2 } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";

/**
 * Dashboard scratchpad: free-form quick notes/todos. Persisted server-side
 * (app_state table) so it follows the user across devices and survives
 * refreshes. Autosaves ~600ms after typing stops; flushes immediately when
 * the tab is hidden/closed so fast exits don't lose the last keystrokes.
 */
export function ScratchpadPanel({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState("");
  const [preview, setPreview] = useState<{ original: string; organized: string } | null>(null);
  const [undo, setUndo] = useState<{ original: string; organized: string } | null>(null);
  const organizingRef = useRef(false);
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

  function changeValue(text: string) {
    latest.current = text;
    setValue(text);
  }

  async function organize() {
    if (organizingRef.current || !latest.current.trim()) return;
    const original = latest.current;
    organizingRef.current = true;
    setOrganizing(true);
    setOrganizeError("");
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
      setOrganizeError(error instanceof Error ? error.message : "Could not organize. Please try again.");
    } finally {
      organizingRef.current = false;
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

  function clearAll() {
    if (!value.trim()) return;
    if (!confirm("Clear the scratchpad?")) return;
    changeValue("");
    setPreview(null);
    setUndo(null);
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm p-5 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <StickyNote size={14} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Scratchpad</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1" aria-live="polite">
            {status === "saving" && (<><Loader2 size={11} className="animate-spin" /> Saving…</>)}
            {(status === "dirty") && "…"}
            {status === "saved" && (<><Check size={11} className="text-emerald-600" /> Saved</>)}
            {status === "error" && (
              <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                <AlertTriangle size={11} /> Not saved — check connection
              </span>
            )}
          </span>
          {value.trim() && (
            <button
              onClick={clearAll}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              title="Clear scratchpad"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={organize} disabled={organizing || !value.trim()}
          className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed">
          {organizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {organizing ? "Organizing…" : "Organize"}
        </button>
        {undo && value === undo.organized && <button type="button" onClick={undoOrganize}
          className="min-h-11 inline-flex items-center gap-2 px-3 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <Undo2 size={14} /> Undo organize
        </button>}
        {status === "error" && <button type="button" onClick={() => void saveNow(latest.current)} className="min-h-11 px-3 text-sm text-amber-700">Retry save</button>}
      </div>
      {organizeError && <p role="alert" className="mb-3 text-sm text-amber-700 dark:text-amber-400">{organizeError}</p>}
      <AutoTextarea
        value={value}
        onChange={(e) => changeValue(e.target.value)}
        aria-label="Scratchpad"
        minRows={6}
        maxHeightPx={520}
        placeholder={"Quick to-dos, numbers, names, anything…\n\n- call the venue back\n- $ figure for the method renewal\n- idea: rooftop for TechWeek closing"}
        className="w-full bg-transparent text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 outline-none resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
      />
      {preview && <section aria-label="Organized preview" className="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <h3 className="text-sm font-semibold">Organized preview</h3>
        <p className="mt-1 text-xs text-zinc-500">Review before applying. Your original stays unchanged until you apply.</p>
        <pre className="my-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 font-sans text-sm leading-relaxed">{preview.organized}</pre>
        {value !== preview.original && <p role="status" className="mb-2 text-sm text-amber-700 dark:text-amber-400">You edited the scratchpad after organizing. Organize again to include your latest changes.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={applyPreview} disabled={value !== preview.original}
            className="min-h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 text-sm font-medium disabled:opacity-40">Apply cleanup</button>
          <button type="button" onClick={() => setPreview(null)} className="min-h-11 rounded-xl px-4 text-sm text-zinc-500">Discard</button>
        </div>
      </section>}
    </div>
  );
}
