"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Business } from "@/lib/businesses";
import type { ChatMessage } from "@/lib/types";
import { ArrowUp, Trash2, Paperclip, X, FileText, Sparkles, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { ShareTokenContext, useShareHeaders } from "@/lib/share-context";
import { usePanelState } from "@/lib/panel-cache";
import { Button, IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { confirmDialog, toast } from "@/components/ui/host";
import { cn } from "@/lib/cn";

type PendingFile = { id: string; file: File; preview: string | null };

const SUGGESTIONS = [
  "Add these companies to the CRM: …",
  "Create a lead for [brand], $10k, proposal stage",
  "What's in our pipeline right now?",
  "Draft a follow-up from last week's sponsor meeting",
];

/** Composer growth cap. Past this the textarea scrolls inside. */
const COMPOSER_MAX_PX = 200;

/*
 * Panel height = viewport minus the chrome around it, so the composer stays at
 * the bottom and only the message list scrolls. `--chat-off` is everything
 * that is not the panel (safe-area insets are subtracted separately):
 *
 * Admin shell
 *   phone 217px = top bar 52 + header 68 + gap 16 + tabs 45 + panel top pad 20 + bottom gap 16
 *   sm    229px = same with the header 76 and panel top pad 24
 *   md+   191px = canvas inset and border 18 + header 76 + gap 16 + tabs 41 + top pad 24 + bottom gap 16
 * Share view (no top bar, no canvas inset)
 *   phone 165px, sm 177px, md+ 173px
 *
 * The workspace gives every panel 40px of bottom padding; `-mb-6` hands 24px
 * of it back so 16px is left under the hint line.
 */
const OFFSETS_ADMIN = "[--chat-off:217px] sm:[--chat-off:229px] md:[--chat-off:191px]";
const OFFSETS_SHARE = "[--chat-off:165px] sm:[--chat-off:177px] md:[--chat-off:173px]";

/** Small brand-tinted tile that marks the assistant. */
function SparkleTile({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand-soft text-brand ring-1 ring-inset ring-line",
        size === "lg" ? "h-11 w-11 rounded-xl" : "h-7 w-7 rounded-lg"
      )}
    >
      <Sparkles size={size === "lg" ? 18 : 14} />
    </span>
  );
}

export function ChatPanel({
  business,
  initialMessages,
}: {
  business: Business;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = usePanelState<ChatMessage[]>("chat", initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  // Ids of assistant messages that performed workspace actions (session-local badge)
  const [actionMsgIds, setActionMsgIds] = useState<Set<number>>(new Set());
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shareHeaders = useShareHeaders();
  const isShare = useContext(ShareTokenContext) !== null;

  // Keep the newest message in view. Scrolls the list itself (not
  // scrollIntoView) so the page or canvas behind it never moves.
  const firstScroll = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstScroll.current ? "auto" : "smooth" });
    firstScroll.current = false;
  }, [messages, sending]);

  // Auto-grow the composer
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_PX ? "auto" : "hidden";
  }, [input]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const MAX = 10 * 1024 * 1024;
    Array.from(fileList).forEach((file) => {
      if (file.size > MAX) { toast(`${file.name} is too large (max 10 MB)`, { tone: "error" }); return; }
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

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
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
      const data: { user: ChatMessage; assistant: ChatMessage; actions_performed?: boolean } = await res.json();
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimisticUser.id);
        return [...without, data.user, data.assistant];
      });
      if (data.actions_performed) {
        setActionMsgIds((prev) => new Set(prev).add(data.assistant.id));
        // Re-fetch server props so other tabs mount with the fresh data
        router.refresh();
      }
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
    const ok = await confirmDialog({
      title: "Clear this chat?",
      description: `All chat history for ${business.name} will be deleted.`,
      confirmLabel: "Clear chat",
      destructive: true,
    });
    if (!ok) return;
    const before = messages;
    setMessages([]);
    setActionMsgIds(new Set());
    try {
      const res = await fetch(`/api/chat?business_id=${business.id}`, { method: "DELETE", headers: shareHeaders });
      if (!res.ok) throw new Error("clear failed");
    } catch {
      setMessages(before);
      toast("Could not clear chat", { tone: "error" });
    }
  }

  function fillComposer(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    send();
  }

  const canSend = !sending && (input.trim().length > 0 || pendingFiles.length > 0);
  const column = "mx-auto w-full max-w-[760px]";

  return (
    <div
      className={cn("-mb-6 flex min-h-[360px] flex-col", isShare ? OFFSETS_SHARE : OFFSETS_ADMIN)}
      style={{
        height: isShare
          ? "calc(100dvh - var(--chat-off) - env(safe-area-inset-bottom, 0px))"
          : "calc(100dvh - var(--chat-off) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Top row: quiet clear action */}
      {messages.length > 0 && (
        <div className={cn(column, "flex shrink-0 items-center justify-between gap-3 pb-2")}>
          <div className="text-xs text-ink-3">
            <span className="tabular-nums">{messages.length}</span> {messages.length === 1 ? "message" : "messages"}
          </div>
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={sending}>
            <Trash2 size={13} /> Clear chat
          </Button>
        </div>
      )}

      {/* Messages: the only thing that scrolls */}
      <div ref={listRef} className="scroll-touch -mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {messages.length === 0 && !sending ? (
          <div className={cn(column, "flex min-h-full flex-col items-center justify-center py-8 text-center")}>
            <SparkleTile size="lg" />
            <div className="mt-4 text-[15px] font-semibold tracking-tight text-ink">Ask anything about {business.name}</div>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">
              It knows this workspace and can make changes for you.
            </p>
            <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => fillComposer(text)}
                  className="rounded-lg border border-line bg-raised px-3 py-2 text-left text-[13px] text-ink-2 shadow-card transition-colors hover:bg-sunken hover:text-ink md:py-1.5"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={cn(column, "space-y-6 pb-4 pt-1")}>
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-inverse px-4 py-2.5 text-sm leading-relaxed text-on-inverse">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-3">
                  <SparkleTile />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{m.content}</div>
                    {actionMsgIds.has(m.id) && (
                      <Badge tone="green" className="mt-2 whitespace-normal">
                        <CheckCircle2 size={11} className="shrink-0" /> Workspace updated. Switch tabs to see the changes.
                      </Badge>
                    )}
                  </div>
                </div>
              )
            )}

            {sending && (
              <div className="flex items-center gap-3" role="status" aria-label="Assistant is thinking">
                <SparkleTile />
                <div className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className={cn(column, "shrink-0 pt-2")}>
        {error && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300" role="alert">
            <AlertTriangle size={13} className="shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <form
          onSubmit={send}
          className="rounded-2xl border border-line-strong bg-raised shadow-lift transition-[border-color] duration-150 focus-within:border-ink-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />

          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {pendingFiles.map((pf) => (
                <div key={pf.id} className="flex items-center gap-1.5 rounded-md border border-line bg-sunken py-1 pl-1.5 pr-1">
                  {pf.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pf.preview} alt="" className="h-5 w-5 rounded-md object-cover" />
                  ) : (
                    <FileText size={13} className="text-ink-3" />
                  )}
                  <span className="max-w-[140px] truncate text-xs text-ink-2">{pf.file.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((f) => f.id !== pf.id))}
                    aria-label={`Remove ${pf.file.name}`}
                    className="flex h-5 w-5 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={`Message ${business.name}…`}
            aria-label={`Message ${business.name}`}
            className="block w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-4 md:text-sm"
          />

          <div className="flex items-center justify-between px-2 pb-2">
            <IconButton label="Attach a file or image" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={15} />
            </IconButton>
            <button
              type="submit"
              disabled={!canSend}
              aria-label={sending ? "Sending" : "Send message"}
              title="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inverse text-on-inverse shadow-card transition-opacity duration-150 hover:opacity-90 disabled:pointer-events-none disabled:opacity-40 md:h-8 md:w-8"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          </div>
        </form>

        <p className="mt-2 truncate text-center text-xs text-ink-3">
          Can read and update your CRM, pipeline, todos, and notes.
          <span className="hidden sm:inline"> Enter to send, Shift+Enter for a new line.</span>
        </p>
      </div>
    </div>
  );
}
