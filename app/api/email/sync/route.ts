import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { getEmailAccounts, GMAIL_IMAP } from "@/lib/email-config";
import { db } from "@/lib/db";

export const maxDuration = 60; // seconds

/**
 * Gmail category labels as they appear in X-GM-LABELS.
 * Messages with any of these are NOT Primary-tab emails.
 */
const NON_PRIMARY_LABELS = new Set([
  "\\Promotions", "\\Social", "\\Updates", "\\Forums",
  "\\Category\\Promotions", "\\Category\\Social", "\\Category\\Updates", "\\Category\\Forums",
  "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS",
]);

function isPrimaryEmail(gmLabels?: Set<string>): boolean {
  if (!gmLabels || gmLabels.size === 0) return true;
  for (const label of gmLabels) {
    if (NON_PRIMARY_LABELS.has(label)) return false;
    // Catch-all for any format Gmail might use
    const lower = label.toLowerCase();
    if (
      lower.includes("promotions") ||
      lower.includes("social") ||
      lower.includes("updates") ||
      lower.includes("forums")
    ) return false;
  }
  return true;
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { account: targetAccount, clean } = await req.json().catch(() => ({}));
  const accounts = getEmailAccounts().filter(
    (a) => !targetAccount || a.address === targetAccount
  );

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No email accounts configured" }, { status: 400 });
  }

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const results: { account: string; fetched: number; skipped: number; error?: string }[] = [];

  for (const account of accounts) {
    try {
      const client = new ImapFlow({
        host: GMAIL_IMAP.host,
        port: GMAIL_IMAP.port,
        secure: GMAIL_IMAP.secure,
        auth: { user: account.address, pass: account.password },
        logger: false,
      });

      await client.connect();

      const mailbox = await client.mailboxOpen("INBOX");
      const total = mailbox.exists ?? 0;

      // If clean sync requested, clear the cache first
      if (clean) db.deleteEmailCache(account.address);

      let fetched = 0;
      let skipped = 0;

      if (total > 0) {
        // ── Pass 1: Scan labels to find Primary-only UIDs ──
        // Scan last 500 messages (lightweight — no body download)
        let primaryUids: number[] | null = null;
        try {
          const scanStart = Math.max(1, total - 499);
          const scanRange = `${scanStart}:${total}`;
          primaryUids = [];
          for await (const msg of client.fetch(scanRange, { uid: true, labels: true })) {
            const gmLabels = msg.labels as Set<string> | undefined;
            if (isPrimaryEmail(gmLabels)) {
              primaryUids.push(msg.uid as number);
            } else {
              skipped++;
            }
          }
          // Keep last 100 primary UIDs
          primaryUids = primaryUids.slice(-100);
        } catch {
          // Gmail labels not supported — fall back to sequence range
          primaryUids = null;
        }

        if (primaryUids && primaryUids.length > 0) {
          // ── Pass 2: Fetch full source for primary UIDs only ──
          const uidStr = primaryUids.join(",");
          for await (const msg of client.fetch(uidStr, {
            uid: true,
            flags: true,
            source: true,
          }, { uid: true })) {
            try {
              const parsed = await simpleParser(msg.source as Buffer);
              upsertParsed(account.address, msg, parsed);
              fetched++;
            } catch { /* skip malformed */ }
          }
        } else if (!primaryUids) {
          // ── Fallback: fetch last 100 by sequence (non-Gmail) ──
          const start = Math.max(1, total - 99);
          const range = `${start}:${total}`;
          for await (const msg of client.fetch(range, {
            uid: true,
            flags: true,
            source: true,
          })) {
            try {
              const parsed = await simpleParser(msg.source as Buffer);
              upsertParsed(account.address, msg, parsed);
              fetched++;
            } catch { /* skip malformed */ }
          }
        }
      }

      await client.logout();
      results.push({ account: account.address, fetched, skipped });
    } catch (err) {
      results.push({
        account: account.address,
        fetched: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function upsertParsed(accountAddress: string, msg: any, parsed: any) {
  const flags = msg.flags as Set<string>;
  const isRead = flags.has("\\Seen");

  const fromAddr = parsed.from?.value?.[0]?.address ?? "";
  const fromName = parsed.from?.value?.[0]?.name ?? "";
  const toList = (parsed.to
    ? Array.isArray(parsed.to) ? parsed.to : [parsed.to]
    : []).flatMap((a: any) => a.value ?? []).map((v: any) => v.address ?? "").filter(Boolean);
  const ccList = (parsed.cc
    ? Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]
    : []).flatMap((a: any) => a.value ?? []).map((v: any) => v.address ?? "").filter(Boolean);

  const bodyText = parsed.text ?? "";
  const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ").trim();

  db.upsertEmail({
    account_address: accountAddress,
    uid: msg.uid as number,
    message_id: parsed.messageId ?? undefined,
    subject: parsed.subject ?? "(no subject)",
    from_address: fromAddr,
    from_name: fromName || undefined,
    to_addresses: toList,
    cc_addresses: ccList,
    date: (parsed.date ?? new Date()).getTime(),
    snippet,
    body_html: parsed.html || undefined,
    body_text: bodyText || undefined,
    is_read: isRead,
    labels: [],
  });
}
