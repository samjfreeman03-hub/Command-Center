import type Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { leadCategoriesEnabled } from "./pipeline-config";
import { eventsEnabled } from "./events-config";

/**
 * Action tools for the per-business AI chat. The chat can create and update
 * records in the other tabs (CRM, pipeline, todos, notes) on the user's behalf
 * — e.g. "add this list of 30 companies to the CRM".
 *
 * Safety model:
 * - business_id is injected server-side from the authenticated request; the
 *   model can only ever touch the business whose chat it is.
 * - Update tools verify the row belongs to this business before writing.
 * - No delete tools — the chat can add and edit, never destroy.
 */

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "add_crm_contacts",
    description:
      "Add one or more contacts/partners to this business's CRM. Use for bulk imports ('add these companies to the CRM') as well as single adds. Duplicates (same brand + contact name already in the CRM) are skipped automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              brand_name: { type: "string", description: "Company/brand/person name (required)" },
              contact_name: { type: "string" },
              contact_title: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              website: { type: "string" },
              status: { type: "string", enum: ["prospect", "in_network", "active_partner", "past_partner"], description: "Default prospect" },
              notes: { type: "string" },
              categories: { type: "array", items: { type: "string" }, description: "Category tags — only names from the AVAILABLE CATEGORIES list; omit otherwise" },
            },
            required: ["brand_name"],
          },
        },
      },
      required: ["contacts"],
    },
  },
  {
    name: "update_crm_contact",
    description: "Update fields on an existing CRM contact by its id (ids are shown in the CRM CONTACTS context). Only include fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number" },
        brand_name: { type: "string" },
        contact_name: { type: "string" },
        contact_title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
        status: { type: "string", enum: ["prospect", "in_network", "active_partner", "past_partner"] },
        notes: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "add_leads",
    description:
      "Add one or more leads to this business's pipeline. Use for bulk imports as well as single adds. Duplicates (same lead name + company already in the pipeline) are skipped automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        leads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Lead/contact name (required)" },
              company: { type: "string" },
              contact_email: { type: "string" },
              stage: { type: "string", enum: ["new", "contacted", "qualified", "proposal", "won", "lost"], description: "Default new" },
              value_dollars: { type: "number", description: "Deal value in dollars (not cents)" },
              next_action: { type: "string" },
              next_action_date: { type: "string", description: "YYYY-MM-DD" },
              notes: { type: "string" },
              categories: { type: "array", items: { type: "string" }, description: "Category tags — only names from the AVAILABLE CATEGORIES list; omit otherwise" },
            },
            required: ["name"],
          },
        },
      },
      required: ["leads"],
    },
  },
  {
    name: "update_lead",
    description: "Update fields on an existing pipeline lead by its id (ids are shown in the PIPELINE context). Use to move stages, set values, next actions, etc. Only include fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        company: { type: "string" },
        contact_email: { type: "string" },
        stage: { type: "string", enum: ["new", "contacted", "qualified", "proposal", "won", "lost"] },
        value_dollars: { type: "number" },
        next_action: { type: "string" },
        next_action_date: { type: "string" },
        notes: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "add_todos",
    description: "Add one or more todos for this business.",
    input_schema: {
      type: "object" as const,
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Default medium" },
              due_date: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["title"],
          },
        },
      },
      required: ["todos"],
    },
  },
  {
    name: "complete_todo",
    description: "Mark an open todo as done by its id (ids are shown in the OPEN TODOS context).",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "add_events",
    description:
      "Add one or more events to this business's Events tab (only available when the business has events enabled). Use for planning hosted events — date, venue, partners, sponsors, links.",
    input_schema: {
      type: "object" as const,
      properties: {
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Event name (required)" },
              date: { type: "string", description: "YYYY-MM-DD" },
              time: { type: "string", description: "Free text, e.g. 8pm-2am" },
              venue: { type: "string" },
              city: { type: "string" },
              status: { type: "string", enum: ["planning", "confirmed", "completed", "cancelled"], description: "Default planning" },
              event_link: { type: "string", description: "Tickets/RSVP URL" },
              expected_attendance: { type: "number" },
              partners: { type: "array", items: { type: "string" } },
              sponsors: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["events"],
    },
  },
  {
    name: "update_event",
    description: "Update fields on an existing event by its id (ids are shown in the EVENTS context). partners/sponsors arrays REPLACE the existing lists — include the full desired list.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        venue: { type: "string" },
        city: { type: "string" },
        status: { type: "string", enum: ["planning", "confirmed", "completed", "cancelled"] },
        event_link: { type: "string" },
        expected_attendance: { type: "number" },
        partners: { type: "array", items: { type: "string" } },
        sponsors: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description: "Create a note for this business (meeting recaps, research, briefs — notes feed future chat context).",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
];

/** Tools available for a given business (event tools only where events are enabled). */
export function chatToolsForBusiness(businessId: string): Anthropic.Tool[] {
  return eventsEnabled(businessId)
    ? CHAT_TOOLS
    : CHAT_TOOLS.filter((t) => t.name !== "add_events" && t.name !== "update_event");
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Match requested category names to the business's canonical set (case-insensitive); drop unknowns. */
function normalizeCategories(businessId: string, requested: unknown): { valid: string[]; dropped: string[] } {
  if (!Array.isArray(requested) || requested.length === 0) return { valid: [], dropped: [] };
  if (!leadCategoriesEnabled(businessId)) return { valid: [], dropped: requested.map(String) };
  const canonical = db.listLeadCategories(businessId).map((c) => c.name);
  const valid: string[] = [];
  const dropped: string[] = [];
  for (const raw of requested) {
    const match = canonical.find((c) => c.toLowerCase() === String(raw).toLowerCase());
    if (match && !valid.includes(match)) valid.push(match);
    else if (!match) dropped.push(String(raw));
  }
  return { valid, dropped };
}

const CRM_PATCH_FIELDS = ["brand_name", "contact_name", "contact_title", "email", "phone", "website", "status", "notes"] as const;
const LEAD_PATCH_FIELDS = ["name", "company", "contact_email", "stage", "next_action", "next_action_date", "notes"] as const;

/** Execute one chat tool call, scoped to businessId. Returns a JSON-able result for the model. */
export function executeChatTool(businessId: string, name: string, input: any): Record<string, unknown> {
  try {
    switch (name) {
      case "add_crm_contacts": {
        const contacts: any[] = Array.isArray(input?.contacts) ? input.contacts : [];
        const existing = db.listBrandContacts(businessId);
        const seen = new Set(
          existing.map((b) => `${b.brand_name.toLowerCase()}|${(b.contact_name ?? "").toLowerCase()}`)
        );
        let created = 0, skipped = 0;
        const droppedCats = new Set<string>();
        for (const c of contacts) {
          const brandName = String(c?.brand_name ?? "").trim();
          if (!brandName) { skipped++; continue; }
          const key = `${brandName.toLowerCase()}|${String(c?.contact_name ?? "").trim().toLowerCase()}`;
          if (seen.has(key)) { skipped++; continue; }
          const cats = normalizeCategories(businessId, c?.categories);
          cats.dropped.forEach((d) => droppedCats.add(d));
          db.createBrandContact({
            business_id: businessId,
            brand_name: brandName,
            contact_name: c?.contact_name,
            contact_title: c?.contact_title,
            email: c?.email,
            phone: c?.phone,
            website: c?.website,
            status: c?.status,
            notes: c?.notes,
            categories: cats.valid,
          });
          seen.add(key);
          created++;
        }
        return {
          ok: true, created, skipped_duplicates_or_invalid: skipped,
          ...(droppedCats.size ? { dropped_unknown_categories: [...droppedCats] } : {}),
        };
      }

      case "update_crm_contact": {
        const id = Number(input?.id);
        if (!id || db.getBrandBizId(id) !== businessId) return { ok: false, error: "No CRM contact with that id in this business" };
        const patch: Record<string, unknown> = {};
        for (const f of CRM_PATCH_FIELDS) if (f in (input ?? {})) patch[f] = input[f];
        if ("categories" in (input ?? {})) patch.categories = normalizeCategories(businessId, input.categories).valid;
        const updated = db.updateBrandContact(id, patch);
        return { ok: true, updated: { id: updated.id, brand_name: updated.brand_name } };
      }

      case "add_leads": {
        const leads: any[] = Array.isArray(input?.leads) ? input.leads : [];
        const existing = db.listLeads({ businessId });
        const seen = new Set(
          existing.map((l) => `${l.name.toLowerCase()}|${(l.company ?? "").toLowerCase()}`)
        );
        let created = 0, skipped = 0;
        const droppedCats = new Set<string>();
        for (const l of leads) {
          const leadName = String(l?.name ?? "").trim();
          if (!leadName) { skipped++; continue; }
          const key = `${leadName.toLowerCase()}|${String(l?.company ?? "").trim().toLowerCase()}`;
          if (seen.has(key)) { skipped++; continue; }
          const cats = normalizeCategories(businessId, l?.categories);
          cats.dropped.forEach((d) => droppedCats.add(d));
          db.createLead({
            business_id: businessId,
            name: leadName,
            company: l?.company,
            contact_email: l?.contact_email,
            stage: l?.stage,
            value_cents: typeof l?.value_dollars === "number" ? Math.round(l.value_dollars * 100) : undefined,
            next_action: l?.next_action,
            next_action_date: l?.next_action_date,
            notes: l?.notes,
            categories: cats.valid,
          });
          seen.add(key);
          created++;
        }
        return {
          ok: true, created, skipped_duplicates_or_invalid: skipped,
          ...(droppedCats.size ? { dropped_unknown_categories: [...droppedCats] } : {}),
        };
      }

      case "update_lead": {
        const id = Number(input?.id);
        if (!id || db.getLeadBizId(id) !== businessId) return { ok: false, error: "No lead with that id in this business" };
        const patch: Record<string, unknown> = {};
        for (const f of LEAD_PATCH_FIELDS) if (f in (input ?? {})) patch[f] = input[f];
        if (typeof input?.value_dollars === "number") patch.value_cents = Math.round(input.value_dollars * 100);
        if ("categories" in (input ?? {})) patch.categories = normalizeCategories(businessId, input.categories).valid;
        const updated = db.updateLead(id, patch);
        return { ok: true, updated: { id: updated.id, name: updated.name, stage: updated.stage } };
      }

      case "add_todos": {
        const todos: any[] = Array.isArray(input?.todos) ? input.todos : [];
        let created = 0;
        for (const t of todos) {
          const title = String(t?.title ?? "").trim();
          if (!title) continue;
          db.createTodo({ business_id: businessId, title, priority: t?.priority, due_date: t?.due_date });
          created++;
        }
        return { ok: true, created };
      }

      case "complete_todo": {
        const id = Number(input?.id);
        const todo = db.listTodos({ businessId }).find((t) => t.id === id);
        if (!todo) return { ok: false, error: "No todo with that id in this business" };
        if (todo.status === "done") return { ok: true, note: "Already done" };
        const updated = db.toggleTodo(id);
        return { ok: true, completed: { id: updated.id, title: updated.title } };
      }

      case "add_events": {
        if (!eventsEnabled(businessId)) return { ok: false, error: "Events are not enabled for this business" };
        const items: any[] = Array.isArray(input?.events) ? input.events : [];
        const existing = db.listEvents(businessId);
        const seen = new Set(existing.map((e) => `${e.name.toLowerCase()}|${e.date ?? ""}`));
        let created = 0, skipped = 0;
        for (const ev of items) {
          const evName = String(ev?.name ?? "").trim();
          if (!evName) { skipped++; continue; }
          const key = `${evName.toLowerCase()}|${ev?.date ?? ""}`;
          if (seen.has(key)) { skipped++; continue; }
          db.createEvent({
            business_id: businessId,
            name: evName,
            date: ev?.date,
            time: ev?.time,
            venue: ev?.venue,
            city: ev?.city,
            status: ev?.status,
            event_link: ev?.event_link,
            expected_attendance: typeof ev?.expected_attendance === "number" ? ev.expected_attendance : null,
            partners: Array.isArray(ev?.partners) ? ev.partners.map(String) : [],
            sponsors: Array.isArray(ev?.sponsors) ? ev.sponsors.map(String) : [],
            notes: ev?.notes,
          });
          seen.add(key);
          created++;
        }
        return { ok: true, created, skipped_duplicates_or_invalid: skipped };
      }

      case "update_event": {
        if (!eventsEnabled(businessId)) return { ok: false, error: "Events are not enabled for this business" };
        const id = Number(input?.id);
        if (!id || db.getEventBizId(id) !== businessId) return { ok: false, error: "No event with that id in this business" };
        const patch: Record<string, unknown> = {};
        for (const f of ["name", "date", "time", "venue", "city", "status", "event_link", "notes"] as const) {
          if (f in (input ?? {})) patch[f] = input[f];
        }
        if (typeof input?.expected_attendance === "number") patch.expected_attendance = input.expected_attendance;
        for (const arr of ["partners", "sponsors"] as const) {
          if (Array.isArray(input?.[arr])) patch[arr] = input[arr].map(String);
        }
        const updated = db.updateEvent(id, patch);
        return { ok: true, updated: { id: updated.id, name: updated.name, status: updated.status } };
      }

      case "create_note": {
        const title = String(input?.title ?? "").trim();
        const content = String(input?.content ?? "");
        if (!title || !content) return { ok: false, error: "title and content required" };
        const note = db.createNote({ business_id: businessId, title, content });
        return { ok: true, created: { id: note.id, title: note.title } };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}
