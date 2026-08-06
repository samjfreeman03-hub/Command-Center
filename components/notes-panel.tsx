"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { Plus, Trash2, FileText, ArrowLeft, Check, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useShareHeaders } from "@/lib/share-context";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function NotesPanel({ businessId, initial }: { businessId: string; initial: Note[] }) {
  const [notes, setNotes] = useState(initial);
  const [selected, setSelected] = useState<Note | null>(initial[0] ?? null);
  const [draftTitle, setDraftTitle] = useState(initial[0]?.title ?? "");
  const [draftContent, setDraftContent] = useState(initial[0]?.content ?? "");
  const [isNew, setIsNew] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Mobile: "list" | "editor"
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");
  const shareHeaders = useShareHeaders();

  // ── Autosave machinery (scratchpad-style) ──────────────────────────
  // Latest draft + what's already persisted, readable from stable callbacks.
  const latest = useRef({ title: draftTitle, content: draftContent });
  latest.current = { title: draftTitle, content: draftContent };
  const lastSaved = useRef({ title: initial[0]?.title ?? "", content: initial[0]?.content ?? "" });
  const selectedRef = useRef<Note | null>(selected);
  selectedRef.current = selected;
  const isNewRef = useRef(isNew);
  isNewRef.current = isNew;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const runAgain = useRef(false);

  const saveNow = useCallback(async () => {
    const { title, content } = latest.current;
    const unchanged = title === lastSaved.current.title && content === lastSaved.current.content;
    if (unchanged) return;
    // Nothing to create from a completely empty new note.
    if (isNewRef.current && !selectedRef.current && !title.trim() && !content.trim()) return;
    if (inFlight.current) {
      runAgain.current = true; // another pass once the current save lands
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    try {
      if (isNewRef.current || !selectedRef.current) {
        // First save of a new note → create it, then future saves PATCH it.
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "content-type": "application/json", ...shareHeaders },
          body: JSON.stringify({
            business_id: businessId,
            title: title.trim() || "Untitled",
            content,
          }),
          keepalive: true,
        });
        if (!res.ok) throw new Error("create failed");
        const created: Note = await res.json();
        lastSaved.current = { title, content };
        setNotes((prev) => [created, ...prev]);
        setSelected(created);
        setIsNew(false);
        setStatus("saved");
      } else {
        const id = selectedRef.current.id;
        const res = await fetch(`/api/notes/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", ...shareHeaders },
          body: JSON.stringify({ title: title.trim() || "Untitled", content }),
          keepalive: true,
        });
        if (!res.ok) throw new Error("save failed");
        const updated: Note = await res.json();
        lastSaved.current = { title, content };
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        setSelected((cur) => (cur && cur.id === updated.id ? updated : cur));
        setStatus("saved");
      }
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
      if (runAgain.current) {
        runAgain.current = false;
        saveNow();
      }
    }
  }, [businessId, shareHeaders]);

  // Debounce: save ~800ms after typing stops
  useEffect(() => {
    const unchanged =
      draftTitle === lastSaved.current.title && draftContent === lastSaved.current.content;
    if (unchanged) return;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNow(), 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draftTitle, draftContent, saveNow]);

  // Flush pending edits when the tab hides / page unloads
  useEffect(() => {
    function flush() {
      if (timer.current) clearTimeout(timer.current);
      saveNow();
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

  /** Flush pending changes before switching context (pick/new/back). */
  function flushPending() {
    if (timer.current) clearTimeout(timer.current);
    saveNow();
  }

  function pick(n: Note) {
    flushPending();
    setSelected(n);
    setDraftTitle(n.title);
    setDraftContent(n.content);
    lastSaved.current = { title: n.title, content: n.content };
    setIsNew(false);
    setStatus("idle");
    setMobileView("editor");
  }

  function startNew() {
    flushPending();
    setSelected(null);
    setDraftTitle("");
    setDraftContent("");
    lastSaved.current = { title: "", content: "" };
    setIsNew(true);
    setStatus("idle");
    setMobileView("editor");
  }

  function backToList() {
    flushPending();
    setMobileView("list");
  }

  async function remove(id: number) {
    if (!confirm("Delete this note?")) return;
    if (timer.current) clearTimeout(timer.current);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selected?.id === id) {
      setSelected(null);
      setDraftTitle("");
      setDraftContent("");
      lastSaved.current = { title: "", content: "" };
      setStatus("idle");
    }
    await fetch(`/api/notes/${id}`, { method: "DELETE", headers: shareHeaders });
    setMobileView("list");
  }

  // ── MOBILE: single-column toggle view ──────────────────────────────
  const listPane = (
    <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden h-full">
      <div className="px-3 pt-3 pb-2.5 border-b border-zinc-100 dark:border-zinc-900 shrink-0">
        <button
          onClick={startNew}
          className="w-full h-11 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Plus size={15} /> New note
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scroll-touch">
        {notes.length === 0 ? (
          <div className="text-xs text-zinc-400 dark:text-zinc-600 px-3 py-5 text-center leading-relaxed">
            Notes feed your AI context — paste meeting recaps, research, briefs.
          </div>
        ) : (
          notes.map((n) => (
            <button
              key={n.id}
              onClick={() => pick(n)}
              className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                selected?.id === n.id
                  ? "bg-zinc-100 dark:bg-zinc-900"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 active:bg-zinc-100 dark:active:bg-zinc-900"
              }`}
            >
              <div className="flex items-start gap-2">
                <FileText size={13} className={`mt-0.5 shrink-0 ${selected?.id === n.id ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-600"}`} />
                <div className="min-w-0">
                  <div className={`text-sm truncate font-medium ${selected?.id === n.id ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
                    {n.title || "Untitled"}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {format(new Date(n.updated_at), "MMM d, yyyy")}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const editorPane = (
    <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden h-full">
      {selected || isNew ? (
        <>
          <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-900 shrink-0">
            {/* Back button (mobile only) */}
            <button
              onClick={backToList}
              className="md:hidden flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-3 -ml-1 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              <ArrowLeft size={13} /> All notes
            </button>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Note title"
              className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder="Start writing — saves automatically…"
            className="flex-1 px-4 py-4 bg-transparent text-sm leading-7 outline-none resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-800 dark:text-zinc-200 min-h-[200px] scroll-touch"
          />
          <div className="flex items-center justify-between px-4 pt-3 pb-safe-3 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20 shrink-0">
            <div className="text-xs text-zinc-400 inline-flex items-center gap-1.5" aria-live="polite">
              {status === "saving" && (<><Loader2 size={11} className="animate-spin" /> Saving…</>)}
              {status === "dirty" && "…"}
              {status === "saved" && (<><Check size={11} className="text-emerald-600" /> Saved</>)}
              {status === "error" && (
                <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
                  <AlertTriangle size={11} /> Not saved — check connection
                </span>
              )}
              {status === "idle" && (
                selected
                  ? `Saved ${format(new Date(selected.updated_at), "MMM d 'at' h:mm a")}`
                  : "New note — saves as you type"
              )}
            </div>
            {selected && (
              <button
                onClick={() => remove(selected.id)}
                className="h-9 px-3 text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
            <FileText size={22} className="text-zinc-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No note selected</div>
            <div className="text-xs text-zinc-400">Pick one from the list or create a new one.</div>
          </div>
          <button
            onClick={startNew}
            className="h-10 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors inline-flex items-center gap-1.5 mt-1"
          >
            <Plus size={13} /> New note
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* MOBILE: toggle between list and editor */}
      <div className="md:hidden h-[calc(100dvh-8rem)]">
        {mobileView === "list" ? listPane : editorPane}
      </div>

      {/* DESKTOP: side-by-side */}
      <div className="hidden md:grid grid-cols-[240px_1fr] gap-4" style={{ height: "calc(100dvh - 10rem)" }}>
        {listPane}
        {editorPane}
      </div>
    </>
  );
}
