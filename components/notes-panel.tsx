"use client";

import { useState } from "react";
import type { Note } from "@/lib/types";
import { Plus, Trash2, FileText } from "lucide-react";
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
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
      {/* ── Sidebar ── */}
      <aside className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden max-h-[45vh] lg:max-h-[72vh]">
        <div className="px-3 pt-3 pb-2.5 border-b border-zinc-100 dark:border-zinc-900">
          <button
            onClick={startNew}
            className="w-full h-9 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Plus size={14} /> New note
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {notes.length === 0 ? (
            <div className="text-xs text-zinc-400 dark:text-zinc-600 px-3 py-5 text-center leading-relaxed">
              Notes feed your AI context — paste meeting recaps, research, briefs.
            </div>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => pick(n)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  selected?.id === n.id
                    ? "bg-zinc-100 dark:bg-zinc-900"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
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
      </aside>

      {/* ── Editor ── */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden min-h-[400px] lg:min-h-0">
        {selected || isNew ? (
          <>
            <div className="px-6 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-900">
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
              placeholder="Start writing… paste in meeting notes, briefs, research."
              className="flex-1 px-6 py-4 bg-transparent text-sm leading-7 outline-none resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-800 dark:text-zinc-200 min-h-[280px]"
            />
            <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/20">
              <div className="text-xs text-zinc-400">
                {selected
                  ? `Saved ${format(new Date(selected.updated_at), "MMM d 'at' h:mm a")}`
                  : "Unsaved draft"}
              </div>
              <div className="flex items-center gap-2">
                {selected && (
                  <button
                    onClick={() => remove(selected.id)}
                    className="h-8 px-3 text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="h-8 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : selected ? "Save" : "Create note"}
                </button>
              </div>
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
              className="h-8 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors inline-flex items-center gap-1.5 mt-1"
            >
              <Plus size={13} /> New note
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
