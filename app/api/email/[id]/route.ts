import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { db } from "@/lib/db";
import { getEmailAccount, GMAIL_IMAP } from "@/lib/email-config";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const email = db.getEmail(Number(id));
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  db.markEmailRead(Number(id));
  return NextResponse.json({ ...email, is_read: true });
}

/** DELETE — move to Gmail Trash + remove from local cache */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const email = db.getEmail(Number(id));
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const account = getEmailAccount(email.account_address);
  if (account) {
    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: GMAIL_IMAP.host, port: GMAIL_IMAP.port, secure: GMAIL_IMAP.secure,
        auth: { user: account.address, pass: account.password },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen("INBOX");
      // Move to Gmail Trash
      await client.messageMove(String(email.uid), "[Gmail]/Trash", { uid: true });
      await client.logout();
    } catch {
      // Still remove locally even if IMAP fails
    }
  }

  db.deleteEmailFromCache(Number(id));
  return NextResponse.json({ ok: true });
}

/** PATCH — toggle star (\\Flagged) */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const email = db.getEmail(Number(id));
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { starred, label } = await req.json().catch(() => ({}));

  const account = getEmailAccount(email.account_address);
  if (account) {
    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: GMAIL_IMAP.host, port: GMAIL_IMAP.port, secure: GMAIL_IMAP.secure,
        auth: { user: account.address, pass: account.password },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen("INBOX");
      if (starred !== undefined) {
        if (starred) {
          await client.messageFlagsAdd(String(email.uid), ["\\Flagged"], { uid: true });
        } else {
          await client.messageFlagsRemove(String(email.uid), ["\\Flagged"], { uid: true });
        }
      }
      await client.logout();
    } catch { /* non-fatal */ }
  }

  if (starred !== undefined) db.setEmailStarred(Number(id), starred);
  if (label !== undefined) db.setEmailLabel(Number(id), label);
  return NextResponse.json(db.getEmail(Number(id)));
}
