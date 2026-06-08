"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { EmailRow } from "@/lib/db";
import {
  RefreshCw, Send, X, ChevronLeft, Inbox, Pencil,
  Reply, ReplyAll, Forward, Trash2, Star, Tag, Check,
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

const ACCOUNT_COLORS = ["bg-violet-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500"];

const LABELS = ["Work", "Personal", "Follow up", "Urgent", "FYI", "Waiting"];

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

  const filtered = activeAccount === "all"
    ? emails
    : emails.filter((e) => e.account_address === activeAccount);

  const unread = (acc: string) =>
    emails.filter((e) => (acc === "all" || e.account_address === acc) && !e.is_read).length;

  const accountColor = (addr: string) => {
    const idx = accounts.findIndex((a) => a.address === addr);
    return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] ?? "bg-zinc-500";
  };

  // ── Actions ──────────────────────────────────────────────────────────

  async function sync() {
    setSyncing(true); setSyncStatus(null);
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await res.json();
      const total = data.results?.reduce((s: number, r: { fetched: number }) => s + r.fetched, 0) ?? 0;
      setSyncStatus(`Synced ${total} emails`);
      const inbox = await fetch("/api/email/inbox");
      setEmails(await inbox.json());
      setTimeout(() => setSyncStatus(null), 3000);
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

  // ── Render ────────────────────────────────────────────────────────────

  const emailLabel = (email: EmailRow) => email.labels.find((l) => l.startsWith("lbl:"))?.slice(4);
  const isStarred = (email: EmailRow) => email.labels.includes("starred");

  return (
    <div className="flex flex-col overflow-hidden inbox-height">

      {/* ── Top bar ── */}
      <div className="px-4 sm:px-8 pt-5 pb-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Inbox size={18} className="text-zinc-500" />
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Inbox</h1>
            {unread("all") > 0 && (
              <span className="text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-0.5 rounded-full">
                {unread("all")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {syncStatus && <span className="text-xs text-zinc-500">{syncStatus}</span>}
            <button onClick={sync} disabled={syncing}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors disabled:opacity-50">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync"}</span>
            </button>
            <button onClick={() => openCompose("compose")}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
              <Pencil size={14} />
              <span className="hidden sm:inline">Compose</span>
            </button>
          </div>
        </div>

        {/* Account filter */}
        {accounts.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
            {[{ address: "all", name: "All" }, ...accounts].map((a) => (
              <button key={a.address} onClick={() => setActiveAccount(a.address)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeAccount === a.address
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-800"
                }`}>
                {a.address !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${accountColor(a.address)}`} />}
                {a.name}
                {unread(a.address) > 0 && <span className="opacity-70">{unread(a.address)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Main pane ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Email list */}
        <div className={`${mobileView === "detail" ? "hidden md:block" : "block"} w-full md:w-72 lg:w-80 xl:w-96 shrink-0 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto`}>
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 p-8 text-center">
              <Inbox size={32} className="text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm text-zinc-500">
                {emails.length === 0 ? "No emails yet — hit Sync." : "No emails in this account."}
              </p>
            </div>
          ) : (
            filtered.map((email) => (
              <button key={email.id} onClick={() => openEmail(email)}
                className={`block w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 transition-colors ${
                  selectedEmail?.id === email.id ? "bg-zinc-100 dark:bg-zinc-900" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${accountColor(email.account_address)} flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5`}>
                    {initials(email.from_name || email.from_address)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1 mb-0.5">
                      <span className={`text-sm truncate ${!email.is_read ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}>
                        {email.from_name || email.from_address}
                      </span>
                      <span className="text-[10px] text-zinc-400 shrink-0">{formatDate(email.date)}</span>
                    </div>
                    <div className={`text-xs truncate mb-0.5 ${!email.is_read ? "font-medium text-zinc-800 dark:text-zinc-200" : "text-zinc-500"}`}>
                      {email.subject}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">{email.snippet}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${accountColor(email.account_address)}`} />
                      <span className="text-[10px] text-zinc-400">{accounts.find((a) => a.address === email.account_address)?.name}</span>
                      {isStarred(email) && <Star size={10} className="text-amber-400 fill-amber-400" />}
                      {emailLabel(email) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500">{emailLabel(email)}</span>
                      )}
                      {!email.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto" />}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Email detail */}
        <div className={`${mobileView === "list" ? "hidden md:flex" : "flex"} flex-col flex-1 min-h-0 min-w-0 overflow-hidden`}>
          {selectedEmail ? (
            <>
              {/* Detail header */}
              <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-900 shrink-0">
                {/* Mobile back */}
                <button onClick={() => setMobileView("list")}
                  className="md:hidden flex items-center gap-1 text-xs text-zinc-500 mb-3 -ml-1 px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <ChevronLeft size={13} /> Back
                </button>

                {/* Subject + actions */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug flex-1 min-w-0">
                    {selectedEmail.subject}
                  </h2>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleStar(selectedEmail)} title="Star"
                      className={`p-2 rounded-lg transition-colors ${isStarred(selectedEmail) ? "text-amber-400" : "text-zinc-400 hover:text-amber-400"} hover:bg-zinc-100 dark:hover:bg-zinc-900`}>
                      <Star size={15} className={isStarred(selectedEmail) ? "fill-amber-400" : ""} />
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowLabelPicker((v) => !v)} title="Label"
                        className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                        <Tag size={15} />
                      </button>
                      {showLabelPicker && (
                        <div className="absolute right-0 top-9 z-20 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 min-w-[140px]">
                          {LABELS.map((lbl) => {
                            const active = selectedEmail.labels.includes(`lbl:${lbl}`);
                            return (
                              <button key={lbl} onClick={() => applyLabel(selectedEmail, lbl)}
                                className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-between gap-2">
                                {lbl}
                                {active && <Check size={11} className="text-emerald-600" />}
                              </button>
                            );
                          })}
                          {emailLabel(selectedEmail) && (
                            <button onClick={() => applyLabel(selectedEmail, emailLabel(selectedEmail)!)}
                              className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-900 mt-1">
                              Remove label
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteEmail(selectedEmail)} title="Delete"
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* From/To */}
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${accountColor(selectedEmail.account_address)} flex items-center justify-center text-white text-[11px] font-bold shrink-0`}>
                    {initials(selectedEmail.from_name || selectedEmail.from_address)}
                  </div>
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                      {selectedEmail.from_name || selectedEmail.from_address}
                      {selectedEmail.from_name && (
                        <span className="font-normal text-zinc-500 ml-1">&lt;{selectedEmail.from_address}&gt;</span>
                      )}
                    </div>
                    <div className="text-zinc-400 mt-0.5">To: {selectedEmail.to_addresses.join(", ")}</div>
                    {selectedEmail.cc_addresses.length > 0 && (
                      <div className="text-zinc-400">CC: {selectedEmail.cc_addresses.join(", ")}</div>
                    )}
                    <div className="text-zinc-400">{format(new Date(selectedEmail.date), "PPPp")}</div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {selectedEmail.body_html ? (
                  <EmailBodyFrame html={selectedEmail.body_html} />
                ) : (
                  <pre className="h-full overflow-y-auto px-5 py-5 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans scroll-touch">
                    {selectedEmail.body_text || "No content"}
                  </pre>
                )}
              </div>

              {/* Reply toolbar */}
              <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-900 shrink-0 safe-bottom flex items-center gap-2 flex-wrap">
                <button onClick={() => openCompose("reply", selectedEmail)}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                  <Reply size={13} /> Reply
                </button>
                <button onClick={() => openCompose("replyAll", selectedEmail)}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-sm border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <ReplyAll size={13} /> Reply All
                </button>
                <button onClick={() => openCompose("forward", selectedEmail)}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-sm border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <Forward size={13} /> Forward
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
              <Inbox size={40} className="text-zinc-200 dark:text-zinc-800" />
              <p className="text-sm text-zinc-400">Select an email to read</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Compose modal ── */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-950 rounded-t-2xl sm:rounded-xl shadow-2xl border-t sm:border border-zinc-200 dark:border-zinc-800 safe-bottom overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                {composeMode === "replyAll" ? "Reply All" : composeMode}
              </h3>
              <button onClick={() => setComposeOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">From</label>
                <select value={composeFrom} onChange={(e) => setComposeFrom(e.target.value)}
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100">
                  {accounts.map((a) => (
                    <option key={a.address} value={a.address}>{a.name} &lt;{a.address}&gt;</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">To</label>
                <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@email.com"
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">CC</label>
                <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)}
                  placeholder="cc@email.com"
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Subject</label>
                <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
              </div>
              <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)}
                rows={7} placeholder="Write your message…"
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm px-3 py-2.5 rounded-lg outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setComposeOpen(false)}
                  className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                  Cancel
                </button>
                <button onClick={sendEmail} disabled={sending || !composeTo.trim() || !composeSubject.trim()}
                  className="h-9 px-4 inline-flex items-center gap-1.5 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors">
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

/** Renders HTML email inside a sandboxed iframe to isolate its CSS from the app */
function EmailBodyFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const writeContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Detect dark mode
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
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: ${isDark ? "#e4e4e7" : "#27272a"};
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
