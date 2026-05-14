import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";
import { canAccessBusiness } from "@/lib/server-auth";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing ANTHROPIC_API_KEY. Add it to .env.local at the project root and restart the dev server.",
      },
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

  // Persist user message first
  const userMsg = db.appendChat({ business_id, role: "user", content });

  // Pull context: notes for this business + recent leads + open todos
  const notes = db.listNotes({ businessId: business_id });
  const leads = db.listLeads({ businessId: business_id });
  const todos = db.listTodos({ businessId: business_id, status: "open" });
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
            }${l.next_action ? `, next: ${l.next_action}` : ""}`
        )
        .join("\n")
    : "(no active leads)";

  const todosBlock = todos.length
    ? todos.map((t) => `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n")
    : "(no open todos)";

  const system = `You are the chief-of-staff AI for the user's business: ${business.fullName}.
Tagline: ${business.tagline}

You have read-only access to the following information about this business. Use it to ground your answers. Cite specifics from the data when answering. If something is not present, say so honestly — do not invent.

== NOTES ==
${notesBlock}

== ACTIVE LEADS / PIPELINE ==
${leadsBlock}

== OPEN TODOS ==
${todosBlock}

Be concise, direct, and operator-minded. The user runs multiple businesses — respect their time. When drafting outputs (emails, briefs, recaps), produce them in clean final form, no preamble.`;

  const client = new Anthropic({ apiKey });

  // Map persisted history to API messages, plus current user message (already saved)
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
    // Remove the user message if the call failed so it doesn't dangle
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
