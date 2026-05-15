import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db, UPLOADS_DIR } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";
import { canAccessBusiness } from "@/lib/server-auth";
import path from "node:path";
import fs from "node:fs";

const CONTENT_CHAR_LIMIT = 6000;
const TOTAL_ATTACH_LIMIT = 60000;

const VISION_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type VisionMime = (typeof VISION_TYPES)[number];

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
    return fs.readFileSync(filePath, "utf-8").slice(0, CONTENT_CHAR_LIMIT);
  }
  if (ext === ".pdf" || mimeType?.includes("pdf")) {
    const buf = fs.readFileSync(filePath);
    return (await extractPdfText(buf)).slice(0, CONTENT_CHAR_LIMIT);
  }
  if (mimeType?.startsWith("image/")) return "(image file — visual content not available in chat)";
  return `(file type not readable in chat: ${ext || (mimeType ?? "unknown")})`;
}

async function extractBufferText(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if ([".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml"].includes(ext)) {
    return buffer.toString("utf-8").slice(0, CONTENT_CHAR_LIMIT);
  }
  if (ext === ".pdf" || mimeType.includes("pdf")) {
    return (await extractPdfText(buffer)).slice(0, CONTENT_CHAR_LIMIT);
  }
  return "";
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let business_id: string;
  let content: string;
  let uploadedFiles: { name: string; type: string; buffer: Buffer }[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    business_id = form.get("business_id") as string;
    content = (form.get("content") as string) ?? "";
    for (const entry of form.getAll("files")) {
      if (typeof entry !== "string") {
        uploadedFiles.push({
          name: entry.name,
          type: entry.type,
          buffer: Buffer.from(await entry.arrayBuffer()),
        });
      }
    }
  } else {
    const body = await req.json();
    business_id = body.business_id;
    content = body.content;
  }

  if (!business_id || (!content && uploadedFiles.length === 0)) {
    return NextResponse.json({ error: "business_id and content or files required" }, { status: 400 });
  }
  const business = getBusiness(business_id);
  if (!business) return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  if (!(await canAccessBusiness(business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Save user message (text + file names for history record)
  const fileNames = uploadedFiles.map((f) => f.name);
  const storedContent =
    content + (fileNames.length > 0 ? `\n\n[Attachments: ${fileNames.join(", ")}]` : "");
  const userMsg = db.appendChat({ business_id, role: "user", content: storedContent });

  // Build context
  const notes = db.listNotes({ businessId: business_id });
  const leads = db.listLeads({ businessId: business_id });
  const todos = db.listTodos({ businessId: business_id, status: "open" });
  const resources = db.listBusinessResources(business_id);
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

  // Business resources context
  let resourcesBlock = "(no resources)";
  if (resources.length > 0) {
    const resolved = await Promise.all(
      resources.map(async (r) => {
        if (r.type === "link" && r.url) {
          const fetched = await fetchLinkContent(r.url);
          return `[${r.label}] (${r.url}):\n${fetched}`;
        }
        if (r.type === "file" && r.stored_name && r.filename) {
          const text = await readFileContent(r.stored_name, r.filename, r.mime_type);
          return `[${r.label}] File "${r.filename}":\n${text}`;
        }
        return null;
      })
    );
    let combined = resolved.filter(Boolean).join("\n\n---\n\n");
    if (combined.length > TOTAL_ATTACH_LIMIT) {
      combined = combined.slice(0, TOTAL_ATTACH_LIMIT) + "\n\n(content truncated)";
    }
    resourcesBlock = combined || "(no readable resources)";
  }

  let attachmentsBlock = "(no attachments)";
  if (attachments.length > 0) {
    const resolved = await Promise.all(
      attachments.map(async (a) => {
        const prefix = `[Lead: ${a.lead_name}]`;
        if (a.type === "link" && a.url) {
          const fetched = await fetchLinkContent(a.url);
          return `${prefix} Link${a.label ? ` "${a.label}"` : ""} (${a.url}):\n${fetched}`;
        }
        if (a.type === "file" && a.stored_name && a.filename) {
          const text = await readFileContent(a.stored_name, a.filename, a.mime_type);
          return `${prefix} File "${a.filename}":\n${text}`;
        }
        return null;
      })
    );
    let combined = resolved.filter(Boolean).join("\n\n---\n\n");
    if (combined.length > TOTAL_ATTACH_LIMIT) {
      combined = combined.slice(0, TOTAL_ATTACH_LIMIT) + "\n\n(attachment content truncated)";
    }
    attachmentsBlock = combined || "(no readable attachments)";
  }

  const system = `You are the chief-of-staff AI for the user's business: ${business.fullName}.
Tagline: ${business.tagline}

You have read-only access to the following information about this business. Use it to ground your answers. Cite specifics when relevant. If something is not present, say so honestly — do not invent.

== NOTES ==
${notesBlock}

== ACTIVE LEADS / PIPELINE ==
${leadsBlock}

== OPEN TODOS ==
${todosBlock}

== BUSINESS RESOURCES (permanent reference materials for this business) ==
${resourcesBlock}

== LEAD ATTACHMENTS (links and documents attached to specific leads) ==
${attachmentsBlock}

Be concise, direct, and operator-minded. The user runs multiple businesses — respect their time. When drafting outputs (emails, briefs, recaps), produce them in clean final form, no preamble.`;

  // Process files uploaded directly to this chat message
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  let inlineFileText = "";

  for (const file of uploadedFiles) {
    if ((VISION_TYPES as readonly string[]).includes(file.type)) {
      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as VisionMime,
          data: file.buffer.toString("base64"),
        },
      });
    } else {
      const text = await extractBufferText(file.buffer, file.name, file.type);
      if (text) inlineFileText += `\n\n[Attached file: ${file.name}]\n${text}`;
    }
  }

  const userTextContent = content + inlineFileText;

  // Build API messages: all history except the last item (current user msg),
  // then add current msg with possible image blocks
  const priorHistory = history.slice(0, -1);
  const apiMessages: Anthropic.MessageParam[] = priorHistory.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  if (imageBlocks.length > 0) {
    const textBlock: Anthropic.TextBlockParam = {
      type: "text",
      text: userTextContent || "(no text — please describe or analyze the attached file(s))",
    };
    apiMessages.push({ role: "user", content: [...imageBlocks, textBlock] });
  } else {
    apiMessages.push({ role: "user", content: userTextContent || storedContent });
  }

  const client = new Anthropic({ apiKey });

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
      { error: err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  db.clearChat(businessId);
  return NextResponse.json({ ok: true });
}
