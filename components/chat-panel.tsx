"use client";

import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/businesses";
import type { ChatMessage } from "@/lib/types";
import { Send, Trash2, Paperclip, X, FileText } from "lucide-react";
import { useShareHeaders } from "@/lib/share-context";

type PendingFile = { id: string; file: File; preview: string | null };

export function ChatPanel({
  business,
  initialMessages,
}: {
  business: Business;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareHeaders = useShareHeaders();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const MAX = 10 * 1024 * 1024;
    Array.from(fileList).forEach((file) => {
      if (file.size > MAX) {
        setError(`${file.name} is too large (max 10 MB)`);
        return;
      }
      const id = Math.random().toString(36).slice(2);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPendingFiles((prev) => [...prev, { id, file, preview: e.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      } else {
        setPendingFiles((prev) => [...prev, { id, file, preview: null }]);
      }
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if ((!content && pendingFiles.length === 0) || sending) return;
    setError(null);
    setSending(true);

    const fileNames = pendingFiles.map((f) => f.file.name);
    const displayContent =
      content + (fileNames.length > 0 ? `\n\n[Attachments: ${fileNames.join(", ")}]` : "");

    const optimisticUser: ChatMessage = {
      id: Date.now(),
      business_id: business.id,
      role: "user",
      content: displayContent,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");
    const sentFiles = [...pendingFiles];
    setPendingFiles([]);

    try {
      let fetchBody: FormData | string;
      const fetchHeaders: Record<string, string> = { ...shareHeaders };

      if (sentFiles.length > 0) {
        const form = new FormData();
        form.append("business_id", business.id);
        form.append("content", content);
        sentFiles.forEach((pf) => form.append("files", pf.file));
        fetchBody = form;
      } else {
        fetchBody = JSON.stringify({ business_id: business.id, content });
        fetchHeaders["content-type"] = "application/json";
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: fetchHeaders,
        body: fetchBody,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data: { user: ChatMessage; assistant: ChatMessage } = await res.json();
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimisticUser.id);
        return [...without, data.user, data.assistant];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setInput(content);
      setPendingFiles(sentFiles);
    } finally {
      setSending(false);
    }
  }

  async function clearAll() {
    if (!confirm("Clear all chat history for this business?")) return;
    setMessages([]);
    await fetch(`/api/chat?business_id=${business.id}`, { method: "DELETE", headers: shareHeaders });
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 flex flex-col h-[calc(100svh-180px)] sm:h-[70vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-900">
        <div className="text-sm">
          <span className="text-zinc-500">Chat with</span>{" "}
          <span className={business.accent}>{business.name}</span>{" "}
          <span className="text-zinc-500">— grounded in your notes, pipeline, and attachments.</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-zinc-500 hover:text-red-500 dark:hover:text-red-400 inline-flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-500 max-w-md mx-auto text-center mt-12">
            Ask anything about <span className={business.accent}>{business.name}</span>.
            <div className="mt-2 text-zinc-400 dark:text-zinc-600">
              Examples: &ldquo;What&apos;s in our pipeline right now?&rdquo; &middot; &ldquo;Draft a follow-up to last week&apos;s sponsor meeting&rdquo; &middot; &ldquo;Summarize what I know about [client]&rdquo;
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 ring-1 ring-zinc-200 dark:ring-zinc-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 text-zinc-500 dark:bg-zinc-900 text-sm rounded-lg px-4 py-2.5 ring-1 ring-zinc-200 dark:ring-zinc-800">
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900/50">
          {error}
        </div>
      )}

      {/* Pending file chips */}
      {pendingFiles.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-2 border-t border-zinc-100 dark:border-zinc-900">
          {pendingFiles.map((pf) => (
            <div
              key={pf.id}
              className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md pl-1.5 pr-1 py-1"
            >
              {pf.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pf.preview} alt="" className="w-6 h-6 rounded object-cover" />
              ) : (
                <FileText size={14} className="text-zinc-400" />
              )}
              <span className="text-xs text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">
                {pf.file.name}
              </span>
              <button
                type="button"
                onClick={() => setPendingFiles((prev) => prev.filter((f) => f.id !== pf.id))}
                className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={send} className="border-t border-zinc-200 dark:border-zinc-900 p-3 flex gap-2 items-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          title="Attach file or image"
        >
          <Paperclip size={16} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${business.name}…`}
          className="flex-1 bg-zinc-100 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md outline-none focus:bg-zinc-200/60 dark:focus:bg-zinc-900/80 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={sending || (!input.trim() && pendingFiles.length === 0)}
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Send size={14} />
          Send
        </button>
      </form>
    </div>
  );
}
