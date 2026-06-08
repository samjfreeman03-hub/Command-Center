import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { getEmailAccounts, GMAIL_IMAP } from "@/lib/email-config";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { account: targetAccount } = await req.json().catch(() => ({}));
  const accounts = getEmailAccounts().filter(
    (a) => !targetAccount || a.address === targetAccount
  );

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No email accounts configured" }, { status: 400 });
  }

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const results: { account: string; fetched: number; error?: string }[] = [];

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

      let fetched = 0;
      await client.mailboxOpen("INBOX");

      // Fetch last 100 messages
      const messages = [];
      for await (const msg of client.fetch("1:*", {
        uid: true, flags: true, envelope: true, bodyStructure: true, source: true,
      }, { uid: false })) {
        messages.push(msg);
      }

      // Process newest first, up to 100
      const toProcess = messages.slice(-100).reverse();

      for (const msg of toProcess) {
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const flags = msg.flags as Set<string>;
          const isRead = flags.has("\\Seen");

          const fromAddr = parsed.from?.value?.[0]?.address ?? "";
          const fromName = parsed.from?.value?.[0]?.name ?? "";
          const toList = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
            .flatMap((a) => a.value ?? [])
            .map((v) => v.address ?? "")
            .filter(Boolean);
          const ccList = (parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [])
            .flatMap((a) => a.value ?? [])
            .map((v) => v.address ?? "")
            .filter(Boolean);

          const bodyText = parsed.text ?? "";
          const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ").trim();

          db.upsertEmail({
            account_address: account.address,
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
          fetched++;
        } catch {
          // skip malformed messages
        }
      }

      await client.logout();
      results.push({ account: account.address, fetched });
    } catch (err) {
      results.push({
        account: account.address,
        fetched: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
