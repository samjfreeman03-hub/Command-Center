"use client";

import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/businesses";
import type { ChatMessage } from "@/lib/types";
import { Send, Trash2, Paperclip, X, FileText, MessageSquare } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const shareHeaders = useShareHeaders();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const MAX = 10 * 1024 * 1024;
    Array.from(fileList).forEach((file) => {
      if (file.size > MAX) { setError(`${file.name} is too large (max 10 MB)`); return; }
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
    const displayContent = content + (fileNames.length > 0 ? `\n\n[Attachments: ${fileNames.join(", ")}]` : "");

    const optimisticUser: ChatMessage = {
      id: Date.now(), business_id: business.id, role: "user", content: displayContent, created_at: Date.now(),
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

      const res = await fetch("/api/chat", { method: "POST", headers: fetchHeaders, body: fetchBody });
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
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col h-[calc(100svh-200px)] sm:h-[72vh] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-900">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{business.name}</span>
          <span className="text-xs text-zinc-400">— grounded in your notes, pipeline &amp; resources</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <Trash2 size={11} /> Clear history
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center pb-8">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
              <MessageSquare size={20} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Ask anything about {business.name}
              </div>
              <div className="text-xs text-zinc-400 dark:text-zinc-600 space-y-1 max-w-sm">
                <div className="bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 rounded-lg">&ldquo;What&apos;s in our pipeline right now?&rdquo;</div>
                <div className="bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 rounded-lg">&ldquo;Draft a follow-up from last week&apos;s sponsor meeting&rdquo;</div>
                <div className="bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 rounded-lg">&ldquo;Summarize what I know about [client]&rdquo;</div>
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-sm"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-bl-sm border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-5 py-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border-t border-red-100 dark:border-red-900/40 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
        </div>
      )}

      {/* Pending file chips */}
      {pendingFiles.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2 border-t border-zinc-100 dark:border-zinc-900">
          {pendingFiles.map((pf) => (
            <div
              key={pf.id}
              className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-2 pr-1.5 py-1"
            >
              {pf.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pf.preview} alt="" className="w-5 h-5 rounded object-cover" />
              ) : (
                <FileText size={13} className="text-zinc-400" />
              )}
              <span className="text-xs text-zinc-700 dark:text-zinc-300 max-w-[110px] truncate">{pf.file.name}</span>
              <button
                type="button"
                onClick={() => setPendingFiles((prev) => prev.filter((f) => f.id !== pf.id))}
                className="text-zinc-400 hover:text-red-500 ml-0.5"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={send} className="border-t border-zinc-100 dark:border-zinc-900 p-4 flex gap-2 items-center">
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
          className="shrink-0 w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center transition-colors"
          title="Attach file or image"
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${business.name}…`}
          className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3.5 rounded-lg outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-zinc-100 transition-colors"
        />
        <button
          type="submit"
          disabled={sending || (!input.trim() && pendingFiles.length === 0)}
          className="shrink-0 w-9 h-9 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 flex items-center justify-center transition-colors"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
