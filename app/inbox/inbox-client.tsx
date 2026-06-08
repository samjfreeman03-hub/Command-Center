"use client";

import { useState, useRef } from "react";
import type { EmailRow } from "@/lib/db";
import { RefreshCw, Send, X, ChevronLeft, Inbox, Pencil } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

type AccountMeta = { index: number; name: string; address: string };

function formatDate(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

const ACCOUNT_COLORS = [
  "bg-violet-500", "bg-emerald-500", "bg-sky-500",
  "bg-amber-500", "bg-rose-500",
];

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
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<EmailRow | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // Compose / reply state
  const [composeFrom, setComposeFrom] = useState(accounts[0]?.address ?? "");
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = activeAccount === "all"
    ? emails
    : emails.filter((e) => e.account_address === activeAccount);

  const unreadCount = (acc: string) =>
    emails.filter((e) => (acc === "all" || e.account_address === acc) && !e.is_read).length;

  async function sync() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const total = data.results?.reduce((s: number, r: { fetched: number }) => s + r.fetched, 0) ?? 0;
      setSyncStatus(`Synced ${total} emails`);
      // Reload emails
      const inbox = await fetch("/api/email/inbox");
      const fresh = await inbox.json();
      setEmails(fresh);
      setTimeout(() => setSyncStatus(null), 3000);
    } catch {
      setSyncStatus("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function openEmail(email: EmailRow) {
    setSelectedEmail({ ...email, is_read: true });
    setMobileView("detail");
    if (!email.is_read) {
      setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_read: true } : e));
      await fetch(`/api/email/${email.id}`);
    }
  }

  function startReply(email: EmailRow) {
    setReplyTo(email);
    setComposeFrom(email.account_address);
    setComposeTo(email.from_address);
    setComposeSubject(email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`);
    setComposeBody(`\n\n---\nOn ${format(new Date(email.date), "PPP")} ${email.from_name || email.from_address} wrote:\n${(email.body_text ?? "").split("\n").map(l => `> ${l}`).join("\n")}`);
    setShowCompose(true);
  }

  function startCompose() {
    setReplyTo(null);
    setComposeTo("");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeFrom(accounts[0]?.address ?? "");
    setShowCompose(true);
  }

  async function sendEmail() {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setSending(true);
    try {
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: composeFrom,
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          text: composeBody,
          inReplyTo: replyTo?.message_id,
          references: replyTo?.message_id,
        }),
      });
      setShowCompose(false);
    } finally {
      setSending(false);
    }
  }

  const accountColor = (addr: string) => {
    const idx = accounts.findIndex((a) => a.address === addr);
    return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] ?? "bg-zinc-500";
  };

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Header */}
      <div className="px-4 sm:px-8 lg:px-10 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Inbox size={20} className="text-zinc-500" />
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Inbox</h1>
            {unreadCount("all") > 0 && (
              <span className="text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-0.5 rounded-full">
                {unreadCount("all")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {syncStatus && (
              <span className="text-xs text-zinc-500">{syncStatus}</span>
            )}
            <button
              onClick={sync}
              disabled={syncing}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync"}</span>
            </button>
            <button
              onClick={startCompose}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              <Pencil size={14} />
              <span className="hidden sm:inline">Compose</span>
            </button>
          </div>
        </div>

        {/* Account filter pills */}
        {accounts.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
            <button
              onClick={() => setActiveAccount("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeAccount === "all"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-800"
              }`}
            >
              All {unreadCount("all") > 0 && <span className="ml-1 opacity-70">{unreadCount("all")}</span>}
            </button>
            {accounts.map((a) => (
              <button
                key={a.address}
                onClick={() => setActiveAccount(a.address)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeAccount === a.address
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-800"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${accountColor(a.address)}`} />
                {a.name}
                {unreadCount(a.address) > 0 && <span className="opacity-70">{unreadCount(a.address)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Email list */}
        <div className={`${selectedEmail && !mobileView.includes("list") ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 lg:w-96 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto`}>
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
              <Inbox size={32} className="text-zinc-300 dark:text-zinc-700" />
              <div className="text-sm text-zinc-500">
                {emails.length === 0 ? "No emails yet — hit Sync to fetch your inbox." : "No emails in this account."}
              </div>
            </div>
          ) : (
            filtered.map((email) => (
              <button
                key={email.id}
                onClick={() => openEmail(email)}
                className={`w-full text-left px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-900 transition-colors ${
                  selectedEmail?.id === email.id
                    ? "bg-zinc-100 dark:bg-zinc-900"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 active:bg-zinc-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full ${accountColor(email.account_address)} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                    {initials(email.from_name || email.from_address)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${!email.is_read ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
                        {email.from_name || email.from_address}
                      </span>
                      <span className="text-[11px] text-zinc-400 shrink-0">{formatDate(email.date)}</span>
                    </div>
                    <div className={`text-xs truncate mb-0.5 ${!email.is_read ? "font-medium text-zinc-800 dark:text-zinc-200" : "text-zinc-600 dark:text-zinc-400"}`}>
                      {email.subject}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">{email.snippet}</div>
                    {/* Account tag */}
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${accountColor(email.account_address)}`} />
                      <span className="text-[10px] text-zinc-400">{accounts.find(a => a.address === email.account_address)?.name ?? email.account_address}</span>
                      {!email.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto" />}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Email detail */}
        <div className={`${!selectedEmail || mobileView === "list" ? "hidden md:flex" : "flex"} flex-col flex-1 overflow-hidden`}>
          {selectedEmail ? (
            <>
              {/* Detail header */}
              <div className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-900 shrink-0">
                <button
                  onClick={() => { setMobileView("list"); }}
                  className="md:hidden flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-3 -ml-1 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <ChevronLeft size={14} /> Back
                </button>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-3 leading-snug">
                  {selectedEmail.subject}
                </h2>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-full ${accountColor(selectedEmail.account_address)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(selectedEmail.from_name || selectedEmail.from_address)}
                  </div>
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedEmail.from_name || selectedEmail.from_address}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {selectedEmail.from_name && selectedEmail.from_address}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      To: {selectedEmail.to_addresses.join(", ")}
                      {selectedEmail.cc_addresses.length > 0 && ` · CC: ${selectedEmail.cc_addresses.join(", ")}`}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {format(new Date(selectedEmail.date), "PPPp")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 scroll-touch">
                {selectedEmail.body_html ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 email-body"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                  />
                ) : (
                  <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">
                    {selectedEmail.body_text || "No content"}
                  </pre>
                )}
              </div>

              {/* Reply button */}
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-900 shrink-0 safe-bottom">
                <button
                  onClick={() => startReply(selectedEmail)}
                  className="h-9 px-4 inline-flex items-center gap-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  <Send size={13} /> Reply
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
              <Inbox size={40} className="text-zinc-200 dark:text-zinc-800" />
              <p className="text-sm text-zinc-400">Select an email to read it</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-xl shadow-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 safe-bottom overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {replyTo ? "Reply" : "New message"}
              </h3>
              <button onClick={() => setShowCompose(false)} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* From */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">From</label>
                <select
                  value={composeFrom}
                  onChange={(e) => setComposeFrom(e.target.value)}
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100"
                >
                  {accounts.map((a) => (
                    <option key={a.address} value={a.address}>{a.name} &lt;{a.address}&gt;</option>
                  ))}
                </select>
              </div>
              {/* To */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">To</label>
                <input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@email.com"
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>
              {/* Subject */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Subject</label>
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>
              {/* Body */}
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                rows={6}
                placeholder="Write your message…"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 py-2.5 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowCompose(false)} className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={sendEmail}
                  disabled={sending || !composeTo.trim() || !composeSubject.trim()}
                  className="h-9 px-4 inline-flex items-center gap-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                >
                  <Send size={13} /> {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
