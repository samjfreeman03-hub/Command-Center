"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { EmailRow } from "@/lib/db";
import {
  RefreshCw, Send, X, ChevronLeft, Inbox, Pencil, Search,
  Reply, ReplyAll, Forward, Trash2, Star, Tag, Check, MoreHorizontal,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

type AccountMeta = { index: number; name: string; address: string };
type ComposeMode = "compose" | "reply" | "replyAll" | "forward";

function formatDate(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

const ACCOUNT_COLORS: Record<number, { bg: string; text: string }> = {
  0: { bg: "bg-violet-100 dark:bg-violet-950", text: "text-violet-600 dark:text-violet-400" },
  1: { bg: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
  2: { bg: "bg-sky-100 dark:bg-sky-950", text: "text-sky-600 dark:text-sky-400" },
  3: { bg: "bg-amber-100 dark:bg-amber-950", text: "text-amber-600 dark:text-amber-400" },
  4: { bg: "bg-rose-100 dark:bg-rose-950", text: "text-rose-600 dark:text-rose-400" },
};

const LABELS = ["Important", "Follow up", "Urgent", "FYI", "Waiting", "Read later"];

export function InboxClient({
  accounts,
  initialEmails,
}: {
  accounts: AccountMeta[];
  initialEmails: EmailRow[];
}) {
  const [emails, setEmails] = useState<EmailRow[]>(initialEmails);
  const [activeAccount, setActiveAccount] = useState<string>("all");
  const [selectedEmail, setSelectedEmail] = useState<EmailRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>("compose");
  const [composeFrom, setComposeFrom] = useState(accounts[0]?.address ?? "");
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeRef, setComposeRef] = useState<EmailRow | null>(null);
  const [sending, setSending] = useState(false);

  // Filter by account and search
  const filtered = emails
    .filter((e) => activeAccount === "all" || e.account_address === activeAccount)
    .filter((e) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.subject.toLowerCase().includes(q) ||
        (e.from_name || "").toLowerCase().includes(q) ||
        e.from_address.toLowerCase().includes(q) ||
        (e.snippet || "").toLowerCase().includes(q)
      );
    });

  const unread = (acc: string) =>
    emails.filter((e) => (acc === "all" || e.account_address === acc) && !e.is_read).length;

  const accountColor = (addr: string) => {
    const idx = accounts.findIndex((a) => a.address === addr);
    return ACCOUNT_COLORS[idx % 5] ?? ACCOUNT_COLORS[0];
  };

  // ── Actions ──────────────────────────────────────────────────────────

  async function sync() {
    setSyncing(true); setSyncStatus(null);
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clean: true }),
      });
      const data = await res.json();
      const total = data.results?.reduce((s: number, r: { fetched: number }) => s + r.fetched, 0) ?? 0;
      const skippedTotal = data.results?.reduce((s: number, r: { skipped?: number }) => s + (r.skipped ?? 0), 0) ?? 0;
      setSyncStatus(`${total} emails synced${skippedTotal > 0 ? ` (${skippedTotal} non-primary filtered)` : ""}`);
      const inbox = await fetch("/api/email/inbox");
      setEmails(await inbox.json());
      setTimeout(() => setSyncStatus(null), 4000);
    } catch { setSyncStatus("Sync failed"); }
    finally { setSyncing(false); }
  }

  async function openEmail(email: EmailRow) {
    const e = { ...email, is_read: true };
    setSelectedEmail(e);
    setMobileView("detail");
    setShowLabelPicker(false);
    if (!email.is_read) {
      setEmails((prev) => prev.map((x) => x.id === email.id ? e : x));
      await fetch(`/api/email/${email.id}`);
    }
  }

  async function deleteEmail(email: EmailRow) {
    if (!confirm(`Delete "${email.subject}"?`)) return;
    setEmails((prev) => prev.filter((e) => e.id !== email.id));
    if (selectedEmail?.id === email.id) { setSelectedEmail(null); setMobileView("list"); }
    await fetch(`/api/email/${email.id}`, { method: "DELETE" });
  }

  async function toggleStar(email: EmailRow) {
    const starred = !email.labels.includes("starred");
    const updated = { ...email, labels: starred ? [...email.labels, "starred"] : email.labels.filter((l) => l !== "starred") };
    setEmails((prev) => prev.map((e) => e.id === email.id ? updated : e));
    if (selectedEmail?.id === email.id) setSelectedEmail(updated);
    await fetch(`/api/email/${email.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ starred }),
    });
  }

  async function applyLabel(email: EmailRow, label: string) {
    const hasLabel = email.labels.includes(`lbl:${label}`);
    const updated = {
      ...email,
      labels: hasLabel
        ? email.labels.filter((l) => l !== `lbl:${label}`)
        : [...email.labels.filter((l) => !l.startsWith("lbl:")), `lbl:${label}`],
    };
    setEmails((prev) => prev.map((e) => e.id === email.id ? updated : e));
    if (selectedEmail?.id === email.id) setSelectedEmail(updated);
    setShowLabelPicker(false);
    await fetch(`/api/email/${email.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: hasLabel ? null : label }),
    });
  }

  function openCompose(mode: ComposeMode, ref?: EmailRow) {
    setComposeMode(mode);
    setComposeRef(ref ?? null);
    setComposeFrom(ref?.account_address ?? accounts[0]?.address ?? "");

    if (mode === "reply" && ref) {
      setComposeTo(ref.from_address);
      setComposeCc("");
      setComposeSubject(ref.subject.startsWith("Re:") ? ref.subject : `Re: ${ref.subject}`);
      setComposeBody(quoteBody(ref));
    } else if (mode === "replyAll" && ref) {
      setComposeTo(ref.from_address);
      const others = [...ref.to_addresses, ...ref.cc_addresses]
        .filter((a) => a !== ref.account_address && a !== ref.from_address);
      setComposeCc(others.join(", "));
      setComposeSubject(ref.subject.startsWith("Re:") ? ref.subject : `Re: ${ref.subject}`);
      setComposeBody(quoteBody(ref));
    } else if (mode === "forward" && ref) {
      setComposeTo("");
      setComposeCc("");
      setComposeSubject(ref.subject.startsWith("Fwd:") ? ref.subject : `Fwd: ${ref.subject}`);
      setComposeBody(`\n\n---------- Forwarded message ----------\nFrom: ${ref.from_name || ref.from_address} <${ref.from_address}>\nDate: ${format(new Date(ref.date), "PPPp")}\nSubject: ${ref.subject}\nTo: ${ref.to_addresses.join(", ")}\n\n${ref.body_text ?? ""}`);
    } else {
      setComposeTo(""); setComposeCc(""); setComposeSubject(""); setComposeBody("");
    }
    setComposeOpen(true);
  }

  function quoteBody(ref: EmailRow) {
    return `\n\n---\nOn ${format(new Date(ref.date), "PPPp")}, ${ref.from_name || ref.from_address} wrote:\n${(ref.body_text ?? "").split("\n").map((l) => `> ${l}`).join("\n")}`;
  }

  async function sendEmail() {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setSending(true);
    try {
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: composeFrom, to: composeTo, cc: composeCc || undefined,
          subject: composeSubject, text: composeBody,
          inReplyTo: composeRef?.message_id,
          references: composeRef?.message_id,
        }),
      });
      setComposeOpen(false);
    } finally { setSending(false); }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  const emailLabel = (email: EmailRow) => email.labels.find((l) => l.startsWith("lbl:"))?.slice(4);
  const isStarred = (email: EmailRow) => email.labels.includes("starred");

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col overflow-hidden inbox-height">

      {/* ── Header ── */}
      <div className="shrink-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        <div className="px-5 sm:px-6 pt-4 pb-3">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Inbox</h1>
              {unread("all") > 0 && (
                <span className="text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-0.5 rounded-full tabular-nums">
                  {unread("all")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {syncStatus && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full hidden sm:inline">
                  {syncStatus}
                </span>
              )}
              <button onClick={() => setShowSearch((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                <Search size={16} />
              </button>
              <button onClick={sync} disabled={syncing}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors disabled:opacity-40">
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => openCompose("compose")}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 text-[13px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                <Pencil size={13} />
                <span className="hidden sm:inline">Compose</span>
              </button>
            </div>
          </div>

          {/* Search bar (collapsible) */}
          {showSearch && (
            <div className="mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by sender, subject, or content..."
                  className="w-full h-9 pl-9 pr-8 bg-zinc-100 dark:bg-zinc-900 text-sm rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 transition-shadow"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-600 rounded-full">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Account pills */}
          {accounts.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
              {[{ address: "all", name: "All", index: -1 }, ...accounts].map((a) => {
                const isActive = activeAccount === a.address;
                const count = a.address === "all" ? emails.length : emails.filter((e) => e.account_address === a.address).length;
                const color = a.address !== "all" ? accountColor(a.address) : null;
                return (
                  <button key={a.address} onClick={() => setActiveAccount(a.address)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}>
                    {color && <span className={`w-2 h-2 rounded-full ${isActive ? "bg-white dark:bg-zinc-900" : color.bg.replace("100", "500").replace("950", "400")}`} />}
                    {a.name}
                    <span className={isActive ? "opacity-70" : "opacity-50"}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Main pane ── */}
      <div className="flex flex-1 min-h-0">

        {/* Email list */}
        <div className={`${mobileView === "detail" ? "hidden md:block" : "block"} w-full md:w-80 lg:w-96 xl:w-[26rem] shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950`}>
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                {searchQuery ? <Search size={20} className="text-zinc-400" /> : <Inbox size={20} className="text-zinc-400" />}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 mb-0.5">
                  {searchQuery ? "No results found" : emails.length === 0 ? "No emails yet" : "No emails in this account"}
                </p>
                <p className="text-xs text-zinc-400">
                  {searchQuery ? "Try a different search term" : emails.length === 0 ? "Hit Sync to fetch your emails" : "Switch accounts or sync again"}
                </p>
              </div>
            </div>
          ) : (
            filtered.map((email) => {
              const color = accountColor(email.account_address);
              const selected = selectedEmail?.id === email.id;
              const starred = isStarred(email);
              const label = emailLabel(email);
              return (
                <button key={email.id} onClick={() => openEmail(email)}
                  className={`block w-full text-left px-4 py-3.5 border-b border-zinc-200/60 dark:border-zinc-800/60 transition-colors ${
                    selected
                      ? "bg-white dark:bg-zinc-900 shadow-[inset_3px_0_0_0_#18181b] dark:shadow-[inset_3px_0_0_0_#fafafa]"
                      : !email.is_read
                        ? "bg-white dark:bg-zinc-900/60 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        : "hover:bg-white dark:hover:bg-zinc-900/40"
                  }`}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full ${color.bg} flex items-center justify-center ${color.text} text-[11px] font-bold shrink-0 mt-0.5`}>
                      {initials(email.from_name || email.from_address)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + date */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-[13px] truncate ${!email.is_read ? "font-semibold text-zinc-900 dark:text-zinc-100" : "font-medium text-zinc-600 dark:text-zinc-400"}`}>
                          {email.from_name || email.from_address.split("@")[0]}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {starred && <Star size={11} className="text-amber-400 fill-amber-400" />}
                          {!email.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                          <span className="text-[11px] text-zinc-400 tabular-nums">{formatDate(email.date)}</span>
                        </div>
                      </div>
                      {/* Row 2: Subject */}
                      <div className={`text-[13px] truncate mb-0.5 ${!email.is_read ? "font-medium text-zinc-800 dark:text-zinc-200" : "text-zinc-500 dark:text-zinc-500"}`}>
                        {email.subject}
                      </div>
                      {/* Row 3: Snippet + metadata */}
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-zinc-400 dark:text-zinc-600 truncate flex-1">{email.snippet}</span>
                        {label && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Email detail */}
        <div className={`${mobileView === "list" ? "hidden md:flex" : "flex"} flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-white dark:bg-zinc-950`}>
          {selectedEmail ? (
            <>
              {/* Detail header */}
              <div className="px-6 pt-5 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                {/* Mobile back */}
                <button onClick={() => { setMobileView("list"); setSelectedEmail(null); }}
                  className="md:hidden flex items-center gap-1 text-[13px] text-zinc-500 mb-4 -ml-1.5 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                  <ChevronLeft size={15} /> Back to inbox
                </button>

                {/* Subject + action buttons */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug flex-1 min-w-0">
                    {selectedEmail.subject}
                  </h2>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => toggleStar(selectedEmail)} title={isStarred(selectedEmail) ? "Unstar" : "Star"}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                        isStarred(selectedEmail) ? "text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20" : "text-zinc-400 hover:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      }`}>
                      <Star size={15} className={isStarred(selectedEmail) ? "fill-amber-400" : ""} />
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowLabelPicker((v) => !v)} title="Label"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                        <Tag size={15} />
                      </button>
                      {showLabelPicker && (
                        <div className="absolute right-0 top-9 z-20 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-1 min-w-[160px]">
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">Labels</div>
                          {LABELS.map((lbl) => {
                            const active = selectedEmail.labels.includes(`lbl:${lbl}`);
                            return (
                              <button key={lbl} onClick={() => applyLabel(selectedEmail, lbl)}
                                className="w-full text-left px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-between gap-2 transition-colors">
                                {lbl}
                                {active && <Check size={13} className="text-emerald-500" />}
                              </button>
                            );
                          })}
                          {emailLabel(selectedEmail) && (
                            <button onClick={() => applyLabel(selectedEmail, emailLabel(selectedEmail)!)}
                              className="w-full text-left px-3 py-2 text-[13px] text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-900 mt-0.5 transition-colors">
                              Remove label
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteEmail(selectedEmail)} title="Delete"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* From / To / CC / Date */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full ${accountColor(selectedEmail.account_address).bg} flex items-center justify-center ${accountColor(selectedEmail.account_address).text} text-xs font-bold shrink-0`}>
                    {initials(selectedEmail.from_name || selectedEmail.from_address)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {selectedEmail.from_name || selectedEmail.from_address}
                      </span>
                      {selectedEmail.from_name && (
                        <span className="text-xs text-zinc-400 truncate">&lt;{selectedEmail.from_address}&gt;</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">
                      To: {selectedEmail.to_addresses.join(", ")}
                      {selectedEmail.cc_addresses.length > 0 && (
                        <span> &middot; CC: {selectedEmail.cc_addresses.join(", ")}</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">{format(new Date(selectedEmail.date), "EEEE, MMMM d, yyyy 'at' h:mm a")}</div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {selectedEmail.body_html ? (
                  <EmailBodyFrame html={selectedEmail.body_html} />
                ) : (
                  <pre className="h-full overflow-y-auto px-6 py-5 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans scroll-touch">
                    {selectedEmail.body_text || "No content"}
                  </pre>
                )}
              </div>

              {/* Reply toolbar */}
              <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0 safe-bottom bg-white dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <button onClick={() => openCompose("reply", selectedEmail)}
                    className="h-9 px-4 inline-flex items-center gap-2 text-[13px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                    <Reply size={14} /> Reply
                  </button>
                  <button onClick={() => openCompose("replyAll", selectedEmail)}
                    className="h-9 px-3 inline-flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                    <ReplyAll size={14} /> <span className="hidden sm:inline">Reply All</span>
                  </button>
                  <button onClick={() => openCompose("forward", selectedEmail)}
                    className="h-9 px-3 inline-flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                    <Forward size={14} /> <span className="hidden sm:inline">Forward</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                <Inbox size={24} className="text-zinc-300 dark:text-zinc-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400 mb-0.5">No email selected</p>
                <p className="text-xs text-zinc-400/70">Choose an email from the list to read it</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Compose modal ── */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-2xl shadow-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 safe-bottom overflow-hidden">
            {/* Compose header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {composeMode === "compose" ? "New message" : composeMode === "replyAll" ? "Reply All" : composeMode === "forward" ? "Forward" : "Reply"}
              </h3>
              <button onClick={() => setComposeOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Compose form */}
            <div className="p-5 space-y-3">
              {/* From */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-10 shrink-0 text-right">From</label>
                <select value={composeFrom} onChange={(e) => setComposeFrom(e.target.value)}
                  className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[13px] px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100">
                  {accounts.map((a) => (
                    <option key={a.address} value={a.address}>{a.name} &lt;{a.address}&gt;</option>
                  ))}
                </select>
              </div>
              {/* To */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-10 shrink-0 text-right">To</label>
                <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@email.com"
                  className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[13px] px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              {/* CC */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-10 shrink-0 text-right">CC</label>
                <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)}
                  placeholder="cc@email.com (optional)"
                  className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[13px] px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              {/* Subject */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 w-10 shrink-0 text-right">Subj</label>
                <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="flex-1 h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[13px] px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              {/* Body */}
              <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)}
                rows={8} placeholder="Write your message..."
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[13px] px-3 py-2.5 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 transition-shadow" />
              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setComposeOpen(false)}
                  className="h-9 px-4 text-[13px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                  Discard
                </button>
                <button onClick={sendEmail} disabled={sending || !composeTo.trim() || !composeSubject.trim()}
                  className="h-9 px-5 inline-flex items-center gap-2 text-[13px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors">
                  <Send size={13} /> {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders HTML email inside a sandboxed iframe to isolate its CSS from the app */
function EmailBodyFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const writeContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const isDark = document.documentElement.classList.contains("dark");

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.65;
    color: ${isDark ? "#d4d4d8" : "#27272a"};
    background: ${isDark ? "#09090b" : "#ffffff"};
    word-break: break-word;
    overflow-wrap: break-word;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100% !important; }
  a { color: ${isDark ? "#7dd3fc" : "#0369a1"}; }
  pre, code { white-space: pre-wrap; max-width: 100%; overflow-x: auto; }
</style>
</head>
<body>${html}</body>
</html>`);
    doc.close();
  }, [html]);

  useEffect(() => {
    writeContent();
  }, [writeContent]);

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full border-0"
      sandbox="allow-same-origin"
      title="Email content"
    />
  );
}
