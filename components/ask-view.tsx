"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { confirmDialog, toast } from "@/components/ui/host";
import { refreshNav } from "@/lib/ui-events";
import { cn } from "@/lib/cn";

type Msg = { id: number; role: "user" | "assistant"; content: string; created_at: number };

const SUGGESTIONS = [
  "What needs my attention today?",
  "Plan my week across every business",
  "Which deals have gone quiet?",
  "Summarize where each business stands",
];

/**
 * Global assistant. Unlike the per-business chat tab, it sees every business
 * at once and can create or update records in any of them.
 */
export function AskView({ initialMessages, initialQuery }: { initialMessages: Msg[]; initialQuery: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    inputRef.current?.focus();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setSending(true);
      setDraft("");
      const temp: Msg = { id: -Date.now(), role: "user", content, created_at: Date.now() };
      setMessages((m) => [...m, temp]);
      scrollToEnd();
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        setMessages((m) => [...m.filter((x) => x.id !== temp.id), data.user, data.assistant]);
        if (data.actions_performed) {
          toast("Workspace updated", { tone: "success" });
          refreshNav();
          router.refresh();
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not reach the assistant", { tone: "error" });
        setDraft(content);
      } finally {
        setSending(false);
        scrollToEnd();
        inputRef.current?.focus();
      }
    },
    [sending, router, scrollToEnd]
  );

  // A query handed over from the command palette is sent once, then dropped from the URL
  useEffect(() => {
    if (!initialQuery || sentInitial.current) return;
    sentInitial.current = true;
    window.history.replaceState(null, "", "/ask");
    send(initialQuery);
  }, [initialQuery, send]);

  async function clear() {
    if (!(await confirmDialog({ title: "Clear this conversation?", description: "The assistant will start fresh. Your businesses' data is not affected.", confirmLabel: "Clear", destructive: true }))) return;
    setMessages([]);
    await fetch("/api/ask", { method: "DELETE" });
  }

  // Grow the composer with its content, up to a cap
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  return (
    <div className="flex h-[calc(100dvh-3.25rem-env(safe-area-inset-top,0px))] flex-col md:h-[calc(100dvh-1rem-2px)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-inverse text-on-inverse shadow-card">
            <Sparkles size={15} />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-ink">Ask AI</h1>
            <p className="text-xs text-ink-3">Sees every business. Can add and update anything for you.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <IconButton label="Clear conversation" onClick={clear}>
            <Trash2 size={14} />
          </IconButton>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8">
        <div className="mx-auto w-full max-w-3xl py-6">
          {messages.length === 0 && !sending ? (
            <div className="flex flex-col items-center pt-[12vh] text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-ink-2 ring-1 ring-inset ring-line">
                <Sparkles size={20} />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-ink">What do you want to know or get done?</h2>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">
                Ask across all of your businesses at once, or tell it to add todos, leads, initiatives, contacts, events and notes anywhere.
              </p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <Message key={m.id} msg={m} />
              ))}
              {sending && (
                <div className="flex items-center gap-3 text-[13px] text-ink-3">
                  <Avatar />
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> Thinking…
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pb-safe-4 shrink-0 px-4 pt-2 sm:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-line-strong bg-raised p-2 pl-4 shadow-lift transition-[border-color,box-shadow] focus-within:border-ink-3 focus-within:ring-[3px] focus-within:ring-ink/10"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder="Ask anything, or say what to add…"
            className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-4"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inverse text-on-inverse transition-opacity disabled:opacity-25"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2 ring-1 ring-inset ring-line">
      <Sparkles size={13} />
    </span>
  );
}

function Message({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-inverse px-4 py-2.5 text-sm leading-relaxed text-on-inverse">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-ink">
        <RichText text={msg.content} />
      </div>
    </div>
  );
}

/** Minimal formatter for assistant replies: paragraphs, dash bullets, and **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-4" />
                  <span className="min-w-0 flex-1">{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={cn("whitespace-pre-wrap")}>
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
