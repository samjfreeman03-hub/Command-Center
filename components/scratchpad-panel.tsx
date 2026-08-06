"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, Check, Loader2, Trash2, AlertTriangle } from "lucide-react";
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const lastSaved = useRef(initialValue);
  latest.current = value;

  const saveNow = useCallback(async (text: string) => {
    if (text === lastSaved.current) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/scratchpad", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: text }),
        keepalive: true, // lets the request finish even if the page is closing
      });
      if (res.ok) {
        lastSaved.current = text;
        setStatus("saved");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
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

  function clearAll() {
    if (!value.trim()) return;
    if (!confirm("Clear the scratchpad?")) return;
    setValue("");
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
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
      <AutoTextarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        minRows={6}
        maxHeightPx={520}
        placeholder={"Quick to-dos, numbers, names, anything…\n\n- call the venue back\n- $ figure for the method renewal\n- idea: rooftop for TechWeek closing"}
        className="w-full flex-1 bg-transparent text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 outline-none resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
      />
    </div>
  );
}
