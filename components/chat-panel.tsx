"use client";

import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/businesses";
import type { ChatMessage } from "@/lib/types";
import { Send, Trash2 } from "lucide-react";

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setError(null);
    setSending(true);

    const optimisticUser: ChatMessage = {
      id: Date.now(),
      business_id: business.id,
      role: "user",
      content,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business_id: business.id, content }),
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
    } finally {
      setSending(false);
    }
  }

  async function clearAll() {
    if (!confirm("Clear all chat history for this business?")) return;
    setMessages([]);
    await fetch(`/api/chat?business_id=${business.id}`, { method: "DELETE" });
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 flex flex-col h-[70vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-900">
        <div className="text-sm">
          <span className="text-zinc-500">Chat with</span>{" "}
          <span className={business.accent}>{business.name}</span>{" "}
          <span className="text-zinc-500">— grounded in your notes for this business.</span>
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
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
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

      <form onSubmit={send} className="border-t border-zinc-200 dark:border-zinc-900 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${business.name}…`}
          className="flex-1 bg-zinc-100 dark:bg-zinc-900 text-sm px-3 py-2 rounded-md outline-none focus:bg-zinc-200/60 dark:focus:bg-zinc-900/80 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Send size={14} />
          Send
        </button>
      </form>
    </div>
  );
}
