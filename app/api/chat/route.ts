import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db, UPLOADS_DIR } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";
import { canAccessBusiness } from "@/lib/server-auth";
import path from "node:path";
import fs from "node:fs";

const CONTENT_CHAR_LIMIT = 6000;
const TOTAL_ATTACH_LIMIT = 60000;

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text?.trim() ?? "";
  } catch {
    return "(could not extract PDF text)";
  }
}

async function fetchLinkContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CCBot/1.0)" },
    });
    clearTimeout(timer);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      const buf = Buffer.from(await res.arrayBuffer());
      return await extractPdfText(buf);
    }
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, CONTENT_CHAR_LIMIT);
  } catch {
    return "(could not fetch content)";
  }
}

async function readFileContent(storedName: string, filename: string, mimeType: string | null): Promise<string> {
  const filePath = path.join(UPLOADS_DIR, storedName);
  if (!fs.existsSync(filePath)) return "(file not found on disk)";
  const ext = path.extname(filename).toLowerCase();
  if ([".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml"].includes(ext)) {
    const text = fs.readFileSync(filePath, "utf-8");
    return text.slice(0, CONTENT_CHAR_LIMIT);
  }
  if (ext === ".pdf" || mimeType?.includes("pdf")) {
    const buf = fs.readFileSync(filePath);
    const text = await extractPdfText(buf);
    return text.slice(0, CONTENT_CHAR_LIMIT);
  }
  if (mimeType?.startsWith("image/")) {
    return "(image file — visual content not available in chat)";
  }
  return `(file type not readable in chat: ${ext || (mimeType ?? "unknown")})`;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY. Add it to .env.local and restart." },
      { status: 500 }
    );
  }

  const { business_id, content } = await req.json();
  if (!business_id || !content) {
    return NextResponse.json({ error: "business_id and content required" }, { status: 400 });
  }
  const business = getBusiness(business_id);
  if (!business) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }
  if (!(await canAccessBusiness(business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userMsg = db.appendChat({ business_id, role: "user", content });

  const notes = db.listNotes({ businessId: business_id });
  const leads = db.listLeads({ businessId: business_id });
  const todos = db.listTodos({ businessId: business_id, status: "open" });
  const attachments = db.listLeadAttachmentsForBusiness(business_id);
  const history = db.listChat(business_id).slice(-20);

  const notesBlock = notes.length
    ? notes.map((n) => `# ${n.title}\n${n.content}`).join("\n\n---\n\n")
    : "(no notes yet)";

  const leadsBlock = leads.length
    ? leads
        .map(
          (l) =>
            `- ${l.name}${l.company ? ` (${l.company})` : ""} — stage: ${l.stage}${
              l.value_cents ? `, $${(l.value_cents / 100).toLocaleString()}` : ""
            }${l.next_action ? `, next: ${l.next_action}` : ""}${l.notes ? `, notes: ${l.notes}` : ""}`
        )
        .join("\n")
    : "(no active leads)";

  const todosBlock = todos.length
    ? todos.map((t) => `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n")
    : "(no open todos)";

  // Build attachment context (fetch link content + read files in parallel)
  let attachmentsBlock = "(no attachments)";
  if (attachments.length > 0) {
    const resolved = await Promise.all(
      attachments.map(async (a) => {
        const prefix = `[Lead: ${a.lead_name}]`;
        if (a.type === "link" && a.url) {
          const fetched = await fetchLinkContent(a.url);
          const label = a.label ? `"${a.label}" ` : "";
          return `${prefix} Link ${label}(${a.url}):\n${fetched}`;
        }
        if (a.type === "file" && a.stored_name && a.filename) {
          const fileContent = await readFileContent(a.stored_name, a.filename, a.mime_type);
          return `${prefix} File "${a.filename}":\n${fileContent}`;
        }
        return null;
      })
    );
    const parts = resolved.filter(Boolean) as string[];
    let combined = parts.join("\n\n---\n\n");
    if (combined.length > TOTAL_ATTACH_LIMIT) {
      combined = combined.slice(0, TOTAL_ATTACH_LIMIT) + "\n\n(attachment content truncated)";
    }
    attachmentsBlock = combined || "(no readable attachments)";
  }

  const system = `You are the chief-of-staff AI for the user's business: ${business.fullName}.
Tagline: ${business.tagline}

You have read-only access to the following information about this business. Use it to ground your answers. Cite specifics from the data when answering. If something is not present, say so honestly — do not invent.

== NOTES ==
${notesBlock}

== ACTIVE LEADS / PIPELINE ==
${leadsBlock}

== OPEN TODOS ==
${todosBlock}

== LEAD ATTACHMENTS (links and documents attached to leads) ==
${attachmentsBlock}

Be concise, direct, and operator-minded. The user runs multiple businesses — respect their time. When drafting outputs (emails, briefs, recaps), produce them in clean final form, no preamble.`;

  const client = new Anthropic({ apiKey });

  const apiMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system,
      messages: apiMessages,
    });

    const assistantText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const assistantMsg = db.appendChat({
      business_id,
      role: "assistant",
      content: assistantText || "(no response)",
    });

    return NextResponse.json({ user: userMsg, assistant: assistantMsg });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Anthropic API error: ${err.message}`
            : "Anthropic API error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  db.clearChat(businessId);
  return NextResponse.json({ ok: true });
}
