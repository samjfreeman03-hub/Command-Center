import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { isAdmin } from "@/lib/server-auth";
import { eventsEnabled } from "@/lib/events-config";
import { leadCategoriesEnabled } from "@/lib/pipeline-config";
import { globalChatTools, executeGlobalChatTool } from "@/lib/chat-tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const LA_TZ = "America/Los_Angeles";
const clip = (text: string | null | undefined, n: number) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** Compact, id-tagged snapshot of one business for the model's context. */
function businessBlock(id: string, name: string, tagline: string, today: string): string {
  const initiatives = db.listInitiatives(id).filter((i) => i.status !== "done");
  const todos = db.listTodos({ businessId: id, status: "open" });
  const leads = db.listLeads({ businessId: id });
  const brands = db.listBrandContacts(id);
  const notes = db.listNotes({ businessId: id });
  const events = eventsEnabled(id) ? db.listEvents(id).filter((e) => !e.date || e.date >= today) : [];
  const cats = leadCategoriesEnabled(id) ? db.listLeadCategories(id).map((c) => c.name) : [];

  const lines: string[] = [`### ${name} (business_id: ${id})`, tagline];
  if (cats.length) lines.push(`Categories available: ${cats.join(", ")}`);
  lines.push(
    "Initiatives:",
    ...(initiatives.length
      ? initiatives.map(
          (i) =>
            `- [id:${i.id}] ${i.title} (${i.kind}, ${i.horizon}, ${i.status})${i.next_step ? `, next step: ${i.next_step}` : ""}${i.target_date ? `, target ${i.target_date}` : ""}`
        )
      : ["- none"]),
    "Open todos:",
    ...(todos.length
      ? todos.map((t) => `- [id:${t.id}] [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date}${t.due_date < today ? ", OVERDUE" : ""})` : ""}`)
      : ["- none"]),
    "Pipeline:",
    ...(leads.length
      ? leads.map(
          (l) =>
            `- [id:${l.id}] ${l.name}${l.company ? ` (${l.company})` : ""}, stage ${l.stage}${l.value_cents ? `, $${(l.value_cents / 100).toLocaleString()}` : ""}${l.next_action ? `, next: ${l.next_action}${l.next_action_date ? ` by ${l.next_action_date}` : ""}` : ""}${l.notes ? `, notes: ${clip(l.notes, 160)}` : ""}`
        )
      : ["- none"])
  );
  if (events.length) {
    lines.push("Upcoming events:", ...events.map((e) => `- [id:${e.id}] ${e.name}, ${e.date ?? "date TBD"}, ${e.status}${e.city ? `, ${e.city}` : ""}`));
  }
  if (brands.length) {
    lines.push(
      `CRM (${brands.length} contacts):`,
      ...brands.slice(0, 60).map((b) => `- [id:${b.id}] ${b.brand_name}${b.contact_name ? `, ${b.contact_name}` : ""}${b.contact_title ? ` (${b.contact_title})` : ""}, ${b.status}`)
    );
    if (brands.length > 60) lines.push(`- …and ${brands.length - 60} more`);
  }
  if (notes.length) {
    lines.push("Notes:", ...notes.slice(0, 12).map((n) => `- ${n.title}: ${clip(n.content, 280)}`));
  }
  return lines.join("\n");
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ messages: db.listAsk() });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  db.clearAsk();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (content.length > 20000) return NextResponse.json({ error: "That message is too long." }, { status: 413 });

  const userMsg = db.appendAsk("user", content);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: LA_TZ }).format(new Date());
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: LA_TZ }).format(new Date());
  const hidden = new Set(db.hiddenBusinessIds());
  const businessIds = BUSINESSES.map((b) => b.id);
  const blocks = BUSINESSES.map((b) => {
    const block = businessBlock(b.id, b.fullName, db.getBusinessTagline(b.id) ?? b.tagline, today);
    return hidden.has(b.id) ? `${block}\n(This business is currently hidden/paused. Mention it only if asked.)` : block;
  }).join("\n\n");

  const system = `You are Sam Freeman's chief of staff inside his Command Center, the operating system he runs all of his businesses from. Unlike the per-business assistants, you see EVERY business at once and can act in any of them.

Today is ${weekday}, ${today} (Los Angeles).

You can BOTH answer questions AND take actions with your tools: add or update initiatives, todos, pipeline leads, CRM contacts, events and notes. Every tool call must include business_id. When Sam asks you to add, log, move, update or organize something, do it with tools instead of describing how.

RULES
- Pick the business from what Sam says. If it is genuinely ambiguous which business something belongs to, ask one short question instead of guessing.
- Initiatives are high-level priorities tracked over weeks. Todos are single actionable tasks. Deals with a sales motion go in the pipeline; companies and people go in the CRM.
- Ids shown as [id:N] are what update and complete tools take. Ids are only unique within their business and type.
- Use the bulk array tools for lists: one call with all items.
- Never invent contact details, numbers, or dates. If something is not in the context below, say so.
- You cannot delete anything. If asked to, say which tab to do it in.
- After acting, reply with a tight summary of what you did and where it went.
- When asked what needs attention or to plan the day or week, prioritize: overdue items first, then items due today, then the Now initiatives' next steps, then near-term events and deal next actions. Be specific and brief, grouped by business.
- Write plainly and concisely. Never use em dashes or en dashes. Short paragraphs or simple dash bullets only, no tables, no headers larger than a bold line.

== CURRENT STATE OF EVERY BUSINESS ==
${blocks}`;

  // The window may start mid-conversation; the API needs a user turn first.
  const history = db.listAsk(24);
  while (history.length && history[0].role !== "user") history.shift();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  const client = new Anthropic({ timeout: 55000, maxRetries: 0 });
  const tools = globalChatTools(businessIds);

  try {
    let actions = 0;
    const touched = new Set<string>();
    let response: Anthropic.Message;
    for (let round = 0; ; round++) {
      response = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 4096, system, tools, messages });
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0 || round >= 8) break;
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolUses.map((tu) => {
          const result = executeGlobalChatTool(businessIds, tu.name, tu.input);
          if (result.ok) {
            actions++;
            if (typeof result.business_id === "string") touched.add(result.business_id);
          }
          return { type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(result) };
        }),
      });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      // House style: no em/en dashes (or their ASCII stand-in) in anything Sam reads
      .replace(/\s+(?:[—–]|--)\s+/g, ", ")
      .replace(/[—–]/g, "-")
      .trim();

    const assistantMsg = db.appendAsk("assistant", text || "(no response)");
    return NextResponse.json({ user: userMsg, assistant: assistantMsg, actions_performed: actions > 0, touched: [...touched] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `AI error: ${err.message}` : "AI error", user: userMsg },
      { status: 502 }
    );
  }
}
