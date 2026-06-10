"use client";

import { useState, useRef } from "react";
import type { BusinessResource } from "@/lib/types";
import { Link2, Paperclip, Upload, ExternalLink, Download, Trash2, Plus } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";

export function ResourcesPanel({
  businessId,
  initial,
}: {
  businessId: string;
  initial: BusinessResource[];
}) {
  const [resources, setResources] = useState(initial);
  const [mode, setMode] = useState<"link" | "file">("link");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareHeaders = useShareHeaders();

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setError(null);
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json", ...shareHeaders },
      body: JSON.stringify({ business_id: businessId, label: label.trim(), url: url.trim() }),
    });
    if (res.ok) {
      const created: BusinessResource = await res.json();
      setResources((prev) => [...prev, created]);
      setLabel("");
      setUrl("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add link");
    }
  }

  async function uploadFile(file: File) {
    if (!label.trim()) { setError("Add a label first"); return; }
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("business_id", businessId);
    form.append("label", label.trim());
    form.append("file", file);
    const res = await fetch("/api/resources", { method: "POST", headers: shareHeaders, body: form });
    if (res.ok) {
      const created: BusinessResource = await res.json();
      setResources((prev) => [...prev, created]);
      setLabel("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Upload failed");
    }
    setUploading(false);
  }

  async function remove(id: number) {
    if (!confirm("Delete this resource?")) return;
    setResources((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/resources/${id}`, { method: "DELETE", headers: shareHeaders });
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      {/* Add resource form */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add resource</div>
          <div className="flex rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden ml-auto">
            <button
              type="button"
              onClick={() => setMode("link")}
              className={`px-3 py-1 text-xs inline-flex items-center gap-1.5 transition-colors ${
                mode === "link"
                  ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Link2 size={11} /> Link
            </button>
            <button
              type="button"
              onClick={() => setMode("file")}
              className={`px-3 py-1 text-xs inline-flex items-center gap-1.5 transition-colors ${
                mode === "file"
                  ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Paperclip size={11} /> File
            </button>
          </div>
        </div>

        {mode === "link" ? (
          <form onSubmit={addLink} className="space-y-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Investor Deck)"
              className={inputCls}
            />
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className={`${inputCls} flex-1`}
              />
              <button
                type="submit"
                disabled={!label.trim() || !url.trim()}
                className="shrink-0 bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Q1 Report)"
              className={inputCls}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.csv,.json,.xml,.docx,.xlsx,.pptx,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl py-5 text-sm text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Upload size={14} />
              {uploading ? "Uploading…" : "Choose file to upload"}
            </button>
          </div>
        )}

        {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
      </div>

      {/* Resource list */}
      {resources.length === 0 ? (
        <div className="text-sm text-zinc-500 py-10 text-center">
          No resources yet. Add links or upload files above.
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors"
            >
              <div className="shrink-0 w-8 h-8 rounded-md bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                {r.type === "link" ? (
                  <Link2 size={15} className="text-zinc-500" />
                ) : (
                  <Paperclip size={15} className="text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{r.label}</div>
                <div className="text-xs text-zinc-400 dark:text-zinc-600 truncate mt-0.5">
                  {r.type === "link" ? r.url : `${r.filename}${r.file_size ? ` · ${formatBytes(r.file_size)}` : ""}`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {r.type === "link" ? (
                  <a
                    href={r.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    title="Open link"
                  >
                    <ExternalLink size={14} />
                  </a>
                ) : (
                  <a
                    href={`/api/resources/${r.id}/file`}
                    download={r.filename ?? undefined}
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    title="Download file"
                  >
                    <Download size={14} />
                  </a>
                )}
                <button
                  onClick={() => remove(r.id)}
                  className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-3 h-9 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors";
