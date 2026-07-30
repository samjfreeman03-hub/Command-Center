import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db, UPLOADS_DIR } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";
import { canAccessBusiness } from "@/lib/server-auth";
import { chatToolsForBusiness, executeChatTool } from "@/lib/chat-tools";
import { leadCategoriesEnabled } from "@/lib/pipeline-config";
import { eventsEnabled } from "@/lib/events-config";
import path from "node:path";
import fs from "node:fs";

export const maxDuration = 60; // seconds — tool loops on bulk imports take longer than plain chat

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
  const brands = db.listBrandContacts(business_id);
  const resources = db.listBusinessResources(business_id);
  const attachments = db.listLeadAttachmentsForBusiness(business_id);
  const history = db.listChat(business_id).slice(-20);
  const catsEnabled = leadCategoriesEnabled(business_id);
  const categoryNames = catsEnabled ? db.listLeadCategories(business_id).map((c) => c.name) : [];
  const evtsEnabled = eventsEnabled(business_id);
  const events = evtsEnabled ? db.listEvents(business_id) : [];

  const eventsBlock = events.length
    ? events
        .map(
          (e) =>
            `- [id:${e.id}] ${e.name} — ${e.date ?? "date TBD"}${e.time ? ` ${e.time}` : ""}, status: ${e.status}${
              e.venue || e.city ? `, at ${[e.venue, e.city].filter(Boolean).join(", ")}` : ""
            }${e.expected_attendance ? `, ~${e.expected_attendance} expected` : ""}${
              e.partners.length ? `, partners: ${e.partners.join("/")}` : ""
            }${e.sponsors.length ? `, sponsors: ${e.sponsors.join("/")}` : ""}${e.event_link ? `, link: ${e.event_link}` : ""}${e.notes ? `, notes: ${e.notes}` : ""}`
        )
        .join("\n")
    : "(no events yet)";

  const notesBlock = notes.length
    ? notes.map((n) => `# ${n.title}\n${n.content}`).join("\n\n---\n\n")
    : "(no notes yet)";

  const leadsBlock = leads.length
    ? leads
        .map(
          (l) =>
            `- [id:${l.id}] ${l.name}${l.company ? ` (${l.company})` : ""} — stage: ${l.stage}${
              l.value_cents ? `, $${(l.value_cents / 100).toLocaleString()}` : ""
            }${l.categories.length ? `, categories: ${l.categories.join("/")}` : ""}${l.next_action ? `, next: ${l.next_action}` : ""}${l.notes ? `, notes: ${l.notes}` : ""}`
        )
        .join("\n")
    : "(no active leads)";

  const todosBlock = todos.length
    ? todos.map((t) => `- [id:${t.id}] [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n")
    : "(no open todos)";

  const brandsBlock = brands.length
    ? brands
        .map(
          (b) =>
            `- [id:${b.id}] ${b.brand_name}${b.contact_name ? ` — ${b.contact_name}` : ""}${b.contact_title ? ` (${b.contact_title})` : ""} — status: ${b.status}${
              b.email ? `, ${b.email}` : ""
            }${b.categories.length ? `, categories: ${b.categories.join("/")}` : ""}${b.notes ? `, notes: ${b.notes}` : ""}`
        )
        .join("\n")
    : "(no CRM contacts yet)";

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
Today's date: ${new Date().toISOString().slice(0, 10)}

You can BOTH answer questions AND take actions in this workspace using your tools. You can add or update CRM contacts, pipeline leads, and todos, and create notes. When the user asks you to add, import, log, update, or organize data — do it with tools, don't just describe how.

TOOL RULES:
- Use the BULK array tools for lists ("add these 30 companies") — one tool call with all items, not 30 calls.
- When the user pastes a list or file of companies/contacts, parse every entry and map fields sensibly (names, emails, titles, websites). Don't drop entries; don't invent data for missing fields — just leave them out.
- Ids shown as [id:N] in the context below are what update/complete tools take.
- If a request is ambiguous about WHERE data should go (CRM vs pipeline), default: companies/partners/contacts → CRM; deals with a potential dollar value or sales motion → pipeline. Say what you chose.
- Never fabricate contact details. Only use what the user provided or what's in context.
- You cannot delete anything. If the user asks to delete, tell them to do it in the relevant tab.
- After acting, reply with a tight summary of what you did (counts, names, where it went) and mention anything skipped as a duplicate.
${catsEnabled ? `\nAVAILABLE CATEGORIES for this business (usable on CRM contacts and leads): ${categoryNames.length ? categoryNames.join(", ") : "(none defined yet — user can add them in Pipeline → Manage)"}. Only apply these exact category names; never invent new ones.` : ""}

You also have the following read context about this business. Use it to ground your answers. Cite specifics when relevant. If something is not present, say so honestly — do not invent.

== NOTES ==
${notesBlock}

== ACTIVE LEADS / PIPELINE ==
${leadsBlock}

== CRM CONTACTS ==
${brandsBlock}
${evtsEnabled ? `\n== EVENTS (hosted events this business is planning/tracking) ==\n${eventsBlock}\n` : ""}
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
    // Agentic loop: the model may call workspace tools (add/update CRM contacts,
    // leads, todos, notes) before producing its final text reply.
    const MAX_TOOL_ROUNDS = 8;
    const loopMessages: Anthropic.MessageParam[] = [...apiMessages];
    let actionsPerformed = 0;
    let response: Anthropic.Message;

    for (let round = 0; ; round++) {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system,
        tools: chatToolsForBusiness(business_id),
        messages: loopMessages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      if (toolUses.length === 0 || round >= MAX_TOOL_ROUNDS) break;

      loopMessages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
        const result = executeChatTool(business_id, tu.name, tu.input);
        if (result.ok) actionsPerformed++;
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        };
      });
      loopMessages.push({ role: "user", content: results });
    }

    const assistantText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const assistantMsg = db.appendChat({
      business_id,
      role: "assistant",
      content: assistantText || "(no response)",
    });

    return NextResponse.json({
      user: userMsg,
      assistant: assistantMsg,
      actions_performed: actionsPerformed > 0,
    });
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
