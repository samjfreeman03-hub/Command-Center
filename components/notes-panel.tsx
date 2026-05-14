"use client";

import { useState } from "react";
import type { Note } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useShareHeaders } from "@/lib/share-context";

export function NotesPanel({ businessId, initial }: { businessId: string; initial: Note[] }) {
  const [notes, setNotes] = useState(initial);
  const [selected, setSelected] = useState<Note | null>(initial[0] ?? null);
  const [draftTitle, setDraftTitle] = useState(initial[0]?.title ?? "");
  const [draftContent, setDraftContent] = useState(initial[0]?.content ?? "");
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const shareHeaders = useShareHeaders();

  function pick(n: Note) {
    setSelected(n);
    setDraftTitle(n.title);
    setDraftContent(n.content);
    setIsNew(false);
  }

  function startNew() {
    setSelected(null);
    setDraftTitle("");
    setDraftContent("");
    setIsNew(true);
  }

  async function save() {
    if (!draftTitle.trim() && !draftContent.trim()) return;
    setSaving(true);
    try {
      if (isNew || !selected) {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "content-type": "application/json", ...shareHeaders },
          body: JSON.stringify({
            business_id: businessId,
            title: draftTitle.trim() || "Untitled",
            content: draftContent,
          }),
        });
        if (res.ok) {
          const created: Note = await res.json();
          setNotes((prev) => [created, ...prev]);
          setSelected(created);
          setIsNew(false);
        }
      } else {
        const res = await fetch(`/api/notes/${selected.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", ...shareHeaders },
          body: JSON.stringify({ title: draftTitle, content: draftContent }),
        });
        if (res.ok) {
          const updated: Note = await res.json();
          setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
          setSelected(updated);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this note?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selected?.id === id) {
      setSelected(null);
      setDraftTitle("");
      setDraftContent("");
    }
    await fetch(`/api/notes/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 min-h-[60vh]">
      <aside className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-2 space-y-1 max-h-[70vh] overflow-y-auto">
        <button
          onClick={startNew}
          className="w-full text-left text-sm px-3 py-2 rounded text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 inline-flex items-center gap-2"
        >
          <Plus size={14} />
          New note
        </button>
        <div className="h-px bg-zinc-200 dark:bg-zinc-900 my-1" />
        {notes.length === 0 && (
          <div className="text-xs text-zinc-500 px-3 py-4">
            No notes yet. Notes feed the AI context for this business — meeting recaps, customer briefs, sponsor research, etc.
          </div>
        )}
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => pick(n)}
            className={`w-full text-left px-3 py-2 rounded text-sm ${
              selected?.id === n.id
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
            }`}
          >
            <div className="truncate">{n.title || "Untitled"}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {format(new Date(n.updated_at), "MMM d, yyyy")}
            </div>
          </button>
        ))}
      </aside>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-5 flex flex-col">
        {selected || isNew ? (
          <>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Note title"
              className="bg-transparent text-xl font-medium outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 mb-3 text-zinc-900 dark:text-zinc-100"
            />
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Start writing… paste in meeting notes, briefs, research."
              className="flex-1 bg-transparent text-sm leading-relaxed outline-none resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 min-h-[400px] text-zinc-900 dark:text-zinc-100"
            />
            <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-900 mt-3">
              <div className="text-xs text-zinc-500">
                {selected ? `Updated ${format(new Date(selected.updated_at), "MMM d, h:mm a")}` : "New note"}
              </div>
              <div className="flex items-center gap-2">
                {selected && (
                  <button
                    onClick={() => remove(selected.id)}
                    className="text-xs text-zinc-500 hover:text-red-500 dark:hover:text-red-400 px-2 py-1 inline-flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : selected ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
            Select a note or create a new one.
          </div>
        )}
      </section>
    </div>
  );
}
