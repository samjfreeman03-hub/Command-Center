"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { Plus, Trash2, FileText, ArrowLeft, Check, Loader2, AlertTriangle, Search } from "lucide-react";
import { format, isSameYear, isToday } from "date-fns";
import { useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { Button, IconButton } from "@/components/ui/button";
import { PrefixInput } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/display";
import { confirmDialog, toast } from "@/components/ui/host";
import { cn } from "@/lib/cn";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** Time for today, "Sep 3" this year, "Sep 3, 2025" otherwise. */
function shortDate(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "h:mm a");
  return format(d, isSameYear(d, new Date()) ? "MMM d" : "MMM d, yyyy");
}

export function NotesPanel({
  businessId,
  initial,
  openId,
  autoNew,
}: {
  businessId: string;
  initial: Note[];
  /** Deep link: select this note on mount and whenever it changes. */
  openId?: number;
  /** Deep link: start a new note on mount. */
  autoNew?: boolean;
}) {
  const [notes, setNotes] = usePanelState("notes", initial);
  // What the editor opens with. Computed once from the cached list (not the
  // server prop) so a tab switch never reopens a stale or deleted note.
  const [boot] = useState<{ note: Note | null; fromLink: boolean }>(() => {
    if (openId != null) {
      const linked = notes.find((n) => n.id === openId);
      if (linked) return { note: linked, fromLink: true };
    }
    if (autoNew) return { note: null, fromLink: true };
    return { note: notes[0] ?? null, fromLink: false };
  });
  const [selected, setSelected] = useState<Note | null>(boot.note);
  const [draftTitle, setDraftTitle] = useState(boot.note?.title ?? "");
  const [draftContent, setDraftContent] = useState(boot.note?.content ?? "");
  const [isNew, setIsNew] = useState(boot.fromLink && !boot.note);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Mobile: "list" | "editor"
  const [mobileView, setMobileView] = useState<"list" | "editor">(boot.fromLink ? "editor" : "list");
  const [query, setQuery] = useState("");
  const shareHeaders = useShareHeaders();

  // ── Autosave machinery (scratchpad-style) ──────────────────────────
  // Latest draft + what's already persisted, readable from stable callbacks.
  const latest = useRef({ title: draftTitle, content: draftContent });
  latest.current = { title: draftTitle, content: draftContent };
  const lastSaved = useRef({ title: boot.note?.title ?? "", content: boot.note?.content ?? "" });
  const selectedRef = useRef<Note | null>(selected);
  selectedRef.current = selected;
  const isNewRef = useRef(isNew);
  isNewRef.current = isNew;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const runAgain = useRef(false);
  // Bumped whenever the editor switches to a different note (pick / new). A
  // save that finishes after a switch must not touch the new note's state.
  const contextEpoch = useRef(0);

  const saveNow = useCallback(async () => {
    const { title, content } = latest.current;
    const epoch = contextEpoch.current;
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
        setNotes((prev) => [created, ...prev]);
        if (contextEpoch.current === epoch) {
          lastSaved.current = { title, content };
          // Update the refs now, not on the next render: the queued follow-up
          // save below runs first and would otherwise POST a duplicate note.
          selectedRef.current = created;
          isNewRef.current = false;
          setSelected(created);
          setIsNew(false);
          setStatus("saved");
        }
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
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        if (contextEpoch.current === epoch) {
          lastSaved.current = { title, content };
          setSelected((cur) => (cur && cur.id === updated.id ? updated : cur));
          setStatus("saved");
        }
      }
    } catch {
      if (contextEpoch.current === epoch) setStatus("error");
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
    // Re-picking the open note must not reset the draft to the (possibly
    // older) list copy while a save is still in flight.
    if (!isNewRef.current && selectedRef.current?.id === n.id) {
      setMobileView("editor");
      return;
    }
    contextEpoch.current++;
    // Keep all three refs consistent right away: a queued save may run before
    // the next render and must never pair the old draft with the new note.
    selectedRef.current = n;
    isNewRef.current = false;
    latest.current = { title: n.title, content: n.content };
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
    contextEpoch.current++;
    selectedRef.current = null;
    isNewRef.current = true;
    latest.current = { title: "", content: "" };
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
    const ok = await confirmDialog({
      title: "Delete this note?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (timer.current) clearTimeout(timer.current);
    const removed = notes.find((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selected?.id === id) {
      setSelected(null);
      setDraftTitle("");
      setDraftContent("");
      lastSaved.current = { title: "", content: "" };
      setStatus("idle");
    }
    setMobileView("list");
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE", headers: shareHeaders });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      if (removed) {
        setNotes((prev) =>
          prev.some((n) => n.id === id) ? prev : [...prev, removed].sort((a, b) => b.updated_at - a.updated_at)
        );
      }
      toast("Could not delete note", { tone: "error" });
    }
  }

  // Deep links that arrive while mounted behave exactly like a click.
  const linkReady = useRef(false);
  useEffect(() => {
    if (!linkReady.current) {
      linkReady.current = true; // the mount case is handled by `boot`
      return;
    }
    if (openId != null) {
      const linked = notes.find((n) => n.id === openId);
      if (linked) pick(linked);
    } else if (autoNew) {
      startNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, autoNew]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, query]);


  // Nothing at all yet: one blank slate instead of two empty panes.
  if (notes.length === 0 && !selected && !isNew) {
    return (
      <EmptyState
        className="min-h-[60vh] justify-center"
        icon={<FileText size={18} />}
        title="No notes yet"
        body="Notes feed the AI chat's context. Paste meeting recaps, research, and briefs."
        action={
          <Button variant="primary" onClick={startNew}>
            <Plus size={14} /> New note
          </Button>
        }
      />
    );
  }

  const editing = !!selected || isNew;

  return (
    <div className="min-h-[60vh] md:grid md:grid-cols-[280px_minmax(0,1fr)]">
      {/* List: a plain column on the canvas, hairline on the right */}
      <div className={cn("border-line md:block md:border-r md:pr-4", mobileView === "editor" && "hidden")}>
        <div className="md:sticky md:top-14">
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <PrefixInput
                prefix={<Search size={14} />}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
              />
            </div>
            <Button variant="primary" onClick={startNew} className="md:h-9">
              <Plus size={14} /> New note
            </Button>
          </div>

          <div className="scroll-touch -mx-1 space-y-0.5 px-1 md:max-h-[calc(100dvh-13rem)] md:overflow-y-auto">
            {isNew && !selected && (
              <div className="rounded-lg bg-hover px-3 py-2.5">
                <div className="truncate text-sm font-medium text-ink">{draftTitle.trim() || "New note"}</div>
                <div className="mt-0.5 truncate text-xs text-ink-3">Saves as you type</div>
              </div>
            )}
            {visible.map((n) => {
              const active = selected?.id === n.id;
              const preview = n.content.trim().split("\n").find((l) => l.trim())?.trim();
              return (
                <button
                  key={n.id}
                  onClick={() => pick(n)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                    active ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover"
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title || "Untitled"}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-3">{shortDate(n.updated_at)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-3">{preview || "No content"}</div>
                </button>
              );
            })}
            {visible.length === 0 && notes.length > 0 && (
              <div className="px-3 py-6 text-center text-xs text-ink-3">No notes match your search.</div>
            )}
          </div>

          <p className="mt-4 px-2 text-xs leading-relaxed text-ink-3">
            Notes feed the AI chat&apos;s context. Paste meeting recaps, research, and briefs.
          </p>
        </div>
      </div>

      {/* Editor: no box, just type on the canvas */}
      <div className={cn("min-w-0 flex-col md:flex md:pl-8", mobileView === "list" ? "hidden" : "flex")}>
        {editing ? (
          <div className="flex w-full max-w-[720px] flex-1 flex-col">
            <div className="mb-2 flex min-h-10 items-center justify-between gap-2 md:min-h-8">
              <Button variant="ghost" size="sm" onClick={backToList} className="-ml-2 md:hidden">
                <ArrowLeft size={13} /> All notes
              </Button>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs text-ink-3" aria-live="polite">
                  {status === "saving" && (<><Loader2 size={12} className="animate-spin" /> Saving…</>)}
                  {status === "dirty" && "Editing…"}
                  {status === "saved" && (<><Check size={12} className="text-emerald-600 dark:text-emerald-400" /> Saved</>)}
                  {status === "error" && (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={12} /> Not saved, check your connection
                    </span>
                  )}
                  {status === "idle" &&
                    (selected
                      ? `Saved ${format(new Date(selected.updated_at), "MMM d 'at' h:mm a")}`
                      : "New note, saves as you type")}
                </div>
                {selected && (
                  <IconButton label="Delete note" variant="danger" onClick={() => remove(selected.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </div>
            </div>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Note title"
              aria-label="Note title"
              autoFocus={isNew}
              className="w-full bg-transparent text-xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-4"
            />
            {/* Grows with its content where the browser supports field-sizing; elsewhere it scrolls inside. */}
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Start writing. Saves automatically."
              aria-label="Note content"
              className="scroll-touch mt-3 min-h-[50vh] w-full flex-1 resize-none bg-transparent text-base leading-7 text-ink outline-none [field-sizing:content] placeholder:text-ink-4 md:text-sm md:leading-7"
            />
          </div>
        ) : (
          <EmptyState
            className="flex-1 justify-center"
            icon={<FileText size={18} />}
            title="No note selected"
            body="Pick one from the list or start a new one."
            action={
              <Button onClick={startNew}>
                <Plus size={14} /> New note
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
