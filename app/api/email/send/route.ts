import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { getEmailAccount, GMAIL_SMTP } from "@/lib/email-config";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { from, to, cc, subject, text, html, inReplyTo, references } = body;

  if (!from || !to || !subject) {
    return NextResponse.json({ error: "from, to, subject required" }, { status: 400 });
  }

  const account = getEmailAccount(from);
  if (!account) {
    return NextResponse.json({ error: "Account not configured" }, { status: 400 });
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: GMAIL_SMTP.host,
    port: GMAIL_SMTP.port,
    secure: GMAIL_SMTP.secure,
    auth: { user: account.address, pass: account.password },
  });

  await transporter.sendMail({
    from: `"${account.name}" <${account.address}>`,
    to,
    cc: cc || undefined,
    subject,
    text: text || undefined,
    html: html || undefined,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
  });

  return NextResponse.json({ ok: true });
}
