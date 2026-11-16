/**
 * FLAIR OS record shapes as the Command Center uses them, plus tolerant
 * normalizers. Tyler's MCP returns its own field names (field contract,
 * section 9 still has four to confirm), so each normalizer accepts the
 * spellings we expect and the camelCase variants, and returns null for a
 * record without an id rather than guessing.
 */

export type FlairOsStage = { slug: string; name: string; color: string | null; order: number; isWon: boolean | null; isLost: boolean | null; isLifecycle: boolean | null };

export type FlairOsDeal = {
  id: string;
  company: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  salesStatus: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextAction: string | null;
  /** YYYY-MM-DD when FLAIR OS gives a date or datetime. */
  nextActionDate: string | null;
  valueCents: number | null;
  notes: string | null;
  clientId: string | null;
  /** FLAIR OS "opportunityName", when it names the deal beyond the company. */
  opportunityName: string | null;
  website: string | null;
  lastContactedMs: number | null;
  updatedMs: number | null;
  createdMs: number | null;
};

export type FlairOsTask = {
  id: string;
  dealId: string | null;
  title: string;
  notes: string | null;
  blocker: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  done: boolean;
  completedMs: number | null;
  updatedMs: number | null;
};

export type FlairOsClientRecord = {
  id: string;
  name: string;
  website: string | null;
  status: string | null;
  updatedMs: number | null;
};

export type FlairOsActivity = {
  id: string;
  dealId: string;
  kind: string;
  body: string | null;
  actor: string | null;
  occurredMs: number | null;
};

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function pick(raw: Raw, keys: string[]): unknown {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k];
  return null;
}

function ms(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function ymd(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function cents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Owner can arrive as a name, an id, or a nested profile object. */
function person(raw: Raw, idKeys: string[], nameKeys: string[], objKeys: string[]): { id: string | null; name: string | null } {
  let id = str(pick(raw, idKeys));
  let name = str(pick(raw, nameKeys));
  const obj = pick(raw, objKeys);
  if (obj && typeof obj === "object") {
    const o = obj as Raw;
    id = id ?? str(pick(o, ["id", "profile_id", "profileId"]));
    name = name ?? str(pick(o, ["name", "full_name", "fullName", "display_name", "displayName", "email"]));
  }
  return { id, name };
}

function flag(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "true") return true;
  if (v === 0 || v === "false") return false;
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeStage(raw: unknown, index: number): FlairOsStage | null {
  if (typeof raw === "string") return { slug: raw, name: raw, color: null, order: index, isWon: null, isLost: null, isLifecycle: null };
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const slug = str(pick(r, ["slug", "key", "value", "id"]));
  if (!slug) return null;
  return {
    slug,
    name: str(pick(r, ["label", "name", "title"])) ?? slug,
    color: str(pick(r, ["color", "colour"])),
    order: Number(pick(r, ["sortOrder", "sort_order", "order", "position"]) ?? index),
    isWon: flag(pick(r, ["isWon", "is_won"])),
    isLost: flag(pick(r, ["isLost", "is_lost"])),
    isLifecycle: flag(pick(r, ["isLifecycle", "is_lifecycle"])),
  };
}

export function normalizeDeal(raw: unknown): FlairOsDeal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const id = str(pick(r, ["id", "deal_id", "dealId", "uuid"]));
  if (!id) return null;
  // The list gives `assignedTo` as a display name ("Sam"); the detail gives
  // `assignee_id` plus a joined `profiles` row. Accept all of them.
  const owner = person(r, ["owner_id", "ownerId", "assignee_id", "assigneeId"], ["owner_name", "ownerName", "assignee_name", "assigneeName"], ["owner", "assignee", "owner_profile", "profile", "profiles"]);
  const assignedTo = str(pick(r, ["assignedTo", "assigned_to"]));
  if (assignedTo) {
    if (UUID.test(assignedTo)) owner.id = owner.id ?? assignedTo;
    else owner.name = owner.name ?? assignedTo;
  }
  // Prefer the slug; `stage` on the list is the display label ("Proposal Sent").
  const stageObj = pick(r, ["pipeline_stages", "pipeline_stage", "stageObject"]);
  const stage =
    str(pick(r, ["stageSlug", "stage_slug", "lifecycle_stage"])) ??
    (stageObj && typeof stageObj === "object" ? str(pick(stageObj as Raw, ["slug", "id", "name"])) : null) ??
    (typeof r.stage === "object" && r.stage ? str(pick(r.stage as Raw, ["slug", "id", "name"])) : str(r.stage));
  return {
    id,
    company: str(pick(r, ["company", "brand", "company_name", "companyName", "name", "title"])),
    contactName: str(pick(r, ["contact_name", "contactName", "contact"])),
    email: str(pick(r, ["email", "contact_email", "contactEmail"]))?.toLowerCase() ?? null,
    phone: str(pick(r, ["phone", "contact_phone", "contactPhone"])),
    stage,
    salesStatus: str(pick(r, ["sales_status", "salesStatus", "status_flag"]))?.toLowerCase() ?? null,
    ownerId: owner.id,
    ownerName: typeof owner.name === "string" && owner.name !== owner.id ? owner.name : owner.name,
    nextAction: str(pick(r, ["waitingOn", "waiting_on", "next_action", "nextAction", "next_step", "nextStep"])),
    nextActionDate: ymd(pick(r, ["nextCheckInAt", "next_check_in_at", "followUpDate", "follow_up_date", "next_action_at", "nextActionAt", "next_action_date", "nextActionDate"])),
    valueCents: cents(pick(r, ["value_cents", "valueCents"])) ?? (pick(r, ["value_cents", "valueCents"]) === null ? cents(pick(r, ["dealValue", "deal_value", "value", "amount", "estimated_value"])) : null),
    notes: str(pick(r, ["notes", "note", "description"])),
    clientId: str(pick(r, ["client_id", "clientId"])),
    opportunityName: str(pick(r, ["opportunityName", "opportunity_name"])),
    website: str(pick(r, ["website", "domain"])),
    lastContactedMs: ms(pick(r, ["lastContacted", "last_contacted_at", "lastContactedAt", "last_contacted"])),
    updatedMs: ms(pick(r, ["updated_at", "updatedAt", "modified_at", "modifiedAt"])),
    createdMs: ms(pick(r, ["created_at", "createdAt"])),
  };
}

export function normalizeTask(raw: unknown): FlairOsTask | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const id = str(pick(r, ["id", "task_id", "taskId"]));
  const title = str(pick(r, ["title", "name", "summary"]));
  if (!id || !title) return null;
  const assignee = person(r, ["assignee_id", "assigneeId", "assigned_to", "owner_id"], ["assignee_name", "assigneeName", "assignee"], ["assignee", "owner", "profile"]);
  const status = str(pick(r, ["status", "state"]))?.toLowerCase() ?? null;
  const completed = ms(pick(r, ["completed_at", "completedAt", "done_at"]));
  const doneFlag = pick(r, ["done", "completed", "is_done", "isDone"]);
  return {
    id,
    dealId: str(pick(r, ["deal_id", "dealId"])),
    title,
    notes: str(pick(r, ["notes", "description"])),
    blocker: str(pick(r, ["blocker", "blocked_reason"])),
    dueDate: ymd(pick(r, ["due_at", "dueAt", "due_date", "dueDate", "due"])),
    assigneeId: assignee.id,
    assigneeName: assignee.name,
    done: doneFlag === true || status === "done" || status === "completed" || status === "complete" || status === "cancelled" || status === "canceled" || (!!completed && status !== "open" && status !== "snoozed"),
    completedMs: completed,
    updatedMs: ms(pick(r, ["updated_at", "updatedAt", "modified_at"])),
  };
}

export function normalizeClient(raw: unknown): FlairOsClientRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const id = str(pick(r, ["id", "client_id", "clientId"]));
  const name = str(pick(r, ["name", "company", "brand", "client_name"]));
  if (!id || !name) return null;
  return {
    id,
    name,
    website: str(pick(r, ["website", "domain", "url"])),
    // FLAIR OS clients carry `invite_status` (portal access), not a partner
    // status; only an explicit status/state field changes the CRM status.
    status: str(pick(r, ["status", "state"])),
    updatedMs: ms(pick(r, ["updated_at", "updatedAt"])),
  };
}

export function normalizeActivity(raw: unknown, fallbackDealId: string): FlairOsActivity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const id = str(pick(r, ["id", "activity_id"]));
  if (!id) return null;
  const actor = person(r, ["actor_id", "actorId", "author_id"], ["actor_name", "actorName", "author", "agent", "actor"], ["actor", "author", "profile"]);
  return {
    id,
    dealId: str(pick(r, ["deal_id", "dealId"])) ?? fallbackDealId,
    kind: str(pick(r, ["kind", "type"])) ?? "note",
    body: str(pick(r, ["body", "text", "content", "note"])),
    actor: actor.name ?? actor.id,
    occurredMs: ms(pick(r, ["occurred_at", "occurredAt", "created_at", "createdAt"])),
  };
}

/** Pull an array out of a tool result under any of the usual keys. */
export function arrayFrom(result: unknown, keys: string[]): unknown[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  const r = result as Raw;
  for (const k of keys) if (Array.isArray(r[k])) return r[k] as unknown[];
  for (const k of ["items", "results", "data", "rows"]) if (Array.isArray(r[k])) return r[k] as unknown[];
  return [];
}

export function totalFrom(result: unknown, fallback: number): number {
  if (!result || typeof result !== "object") return fallback;
  const t = (result as Raw).total ?? (result as Raw).count;
  return typeof t === "number" ? t : fallback;
}

/** Detail over list: any non-null field from `detail` wins. */
export function mergeDeal(base: FlairOsDeal, detail: FlairOsDeal): FlairOsDeal {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(detail)) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out as FlairOsDeal;
}
