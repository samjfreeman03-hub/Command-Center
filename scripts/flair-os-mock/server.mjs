#!/usr/bin/env node
/**
 * Synthetic FLAIR OS MCP server.
 *
 * Shaped on the real server as probed on 2026-11-15 (flair-portal 1.8.0 at
 * portal.theflaircollective.com/api/mcp): an HTTP MCP endpoint at /api/mcp,
 * shared bearer keys, tools/list unfiltered but tools/call refused outside
 * the key's scope with an ordinary `{ ok: false, error }` result, thirteen
 * stages with won/lost/lifecycle flags, `search_pipeline` returning a bare
 * camelCase array (limit max 100, no offset, lost deals never included),
 * `get_pipeline_deal` returning a flat snake_case row with the joined stage
 * and assignee profile and no activities, `list_pipeline_tasks` returning
 * `{ ok, tasks }` (default status open), and `list_clients` returning a bare
 * array (limit max 200).
 *
 * Nothing here is used in production. It exists so the mirror can be built
 * and tested without touching the real system.
 *
 *   PORT=3777 MOCK_TEST_HOOKS=1 node scripts/flair-os-mock/server.mjs
 *
 * Keys (override with env):
 *   FLAIR_OS_MOCK_CC_KEY    scope command_center (Tyler's read allowlist only)
 *   FLAIR_OS_MOCK_FULL_KEY  scope * (every tool, including destructive ones)
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3777);
const TEST_HOOKS = process.env.MOCK_TEST_HOOKS === "1";
const KEYS = {
  [process.env.FLAIR_OS_MOCK_CC_KEY || "cc-mock-key"]: "command_center",
  // The widened key the two-way plan asks Tyler for (TWO_WAY_PLAN.md section 4.1).
  [process.env.FLAIR_OS_MOCK_WRITE_KEY || "cc-write-key"]: "command_center_write",
  [process.env.FLAIR_OS_MOCK_FULL_KEY || "full-mock-key"]: "*",
};

// Tyler's command_center scope as the real server reports it in its refusal.
const COMMAND_CENTER_SCOPE = [
  "list_pipeline_stages",
  "get_pipeline_summary",
  "search_pipeline",
  "get_pipeline_counts",
  "get_pipeline_deal",
  "list_pipeline_tasks",
  "list_clients",
  "search_clients",
  "get_client",
  "get_admin_stats",
];
const SCOPE_SET = new Set(COMMAND_CENTER_SCOPE);
const COMMAND_CENTER_WRITE_SCOPE = [
  ...COMMAND_CENTER_SCOPE,
  "create_pipeline_deal",
  "update_pipeline_deal",
  "update_pipeline_deal_contact",
  "add_pipeline_activity",
  "create_pipeline_task",
  "complete_pipeline_task",
  "upsert_meeting_note",
  "check_outreach_eligibility",
];
const WRITE_SCOPE_SET = new Set(COMMAND_CENTER_WRITE_SCOPE);
// The stageSlug enum create/update_pipeline_deal publish (seen 2026-11-17).
const WRITABLE_STAGE_SLUGS = ["outreach", "engaged", "first-call", "meeting", "proposal", "contract", "invoice", "campaign", "closed", "lost"];

// Real stage list, in the real sort order, with the real flags.
const STAGES = [
  ["engaged", "Engaged", 0, false, false, true],
  ["proposal-owed", "Proposal Owed", 1, false, false, true],
  ["proposal", "Proposal Sent", 2, false, false, true],
  ["contract", "Contract", 3, false, false, true],
  ["invoice", "Invoice", 4, false, false, true],
  ["signed", "Signed", 5, true, false, true],
  ["campaign", "Active", 6, true, false, true],
  ["accounting", "Accounting", 7, true, false, true],
  ["closed", "Closed", 8, true, false, true],
  ["lost", "Lost", 9, false, true, true],
  ["outreach", "Outreach", 10, false, false, true],
  ["ambassador-sourcing", "Ambassador Sourcing", 11, false, false, true],
  ["paused", "Paused", 104, false, false, false],
].map(([slug, label, sortOrder, isWon, isLost, isLifecycle], i) => ({
  id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  slug,
  label,
  color: "#667085",
  sortOrder,
  isWon,
  isLost,
  isLifecycle,
}));
const stageBySlug = (slug) => STAGES.find((s) => s.slug === slug) ?? null;

const PROFILES = {
  tyler: { id: "6f1d2c3e-0000-4000-8000-000000000001", name: "Tyler Rong", email: "tyler@example.test" },
  sam: { id: "6f1d2c3e-0000-4000-8000-000000000002", name: "Sam Freeman", email: "sam@example.test" },
};
const profileById = (id) => Object.values(PROFILES).find((p) => p.id === id) ?? null;

let state;
function seed() {
  const t0 = Date.parse("2026-11-01T17:00:00Z");
  const iso = (daysAgo, h = 0) => new Date(t0 + (14 - daysAgo) * 86400000 + h * 3600000).toISOString();
  const clients = [
    { id: "c1000000-0000-4000-8000-000000000001", name: "SC Johnson", company: "SC Johnson", website: "scjohnson.com", invite_status: "accepted", since: "2026-09-01", created_at: iso(60) },
    { id: "c1000000-0000-4000-8000-000000000002", name: "Disney", company: "Disney", website: "disney.com", invite_status: "accepted", since: "2026-09-15", created_at: iso(50) },
    { id: "c1000000-0000-4000-8000-000000000003", name: "Kraft Heinz", company: "Kraft Heinz", website: "kraftheinz.com", invite_status: "pending", since: "2026-10-01", created_at: iso(40) },
    { id: "c1000000-0000-4000-8000-000000000004", name: "Oakley Meta", company: "Oakley Meta", website: "meta.com", invite_status: "pending", since: "2026-10-10", created_at: iso(30) },
  ];
  // Internal store is snake_case like the FLAIR OS table; the tools shape it.
  const D = (n, company, contact, email, stage, extra = {}) => ({
    id: `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    company,
    opportunity_name: extra.opportunity ?? null,
    contact_name: contact,
    email,
    phone: extra.phone ?? null,
    stage,
    sales_status: extra.sales_status ?? "active",
    assignee_id: extra.owner === "sam" ? PROFILES.sam.id : extra.owner === null ? null : PROFILES.tyler.id,
    waiting_on: extra.next_action ?? null,
    next_check_in_at: extra.next_action_at ?? null,
    follow_up_date: null,
    expected_close_at: null,
    last_contacted_at: extra.last_contacted_at ?? null,
    deal_value: extra.value ?? null,
    notes: extra.notes ?? null,
    client_id: extra.client_id ?? null,
    website: extra.website ?? null,
    source: extra.source ?? null,
    source_agent: null,
    created_at: iso(extra.age ?? 20),
    updated_at: iso(extra.touched ?? 5),
  });
  const deals = [
    D(1, "CBS / Paramount", "Emma Sandoval", "emma.sandoval@example.com", "engaged", { owner: "sam", opportunity: "FLAIR x CBS - Undercover Boss revival", next_action: "Send vetting one-pager and demo video", next_action_at: "2026-11-17", value: 85000, notes: "Undercover Boss revival creator program", touched: 1, last_contacted_at: iso(4) }),
    D(2, "Forever 21", "Dana Kim", "dana.kim@forever21.com", "outreach", { owner: null, touched: 12 }),
    D(3, "Glossier", "Priya Natarajan", "priya@glossier.com", "proposal-owed", { next_action: "Book intro call", next_action_at: "2026-11-18", touched: 3 }),
    D(4, "Celsius", "Marco Alvarez", "marco.alvarez@celsius.com", "ambassador-sourcing", { value: 40000, touched: 2 }),
    D(5, "Duolingo", "Hana Sato", "hana@duolingo.com", "proposal", { value: 60000, next_action: "Proposal owed", next_action_at: "2026-11-14", touched: 4 }),
    D(6, "Liquid Death", "Theo Brandt", "theo@liquiddeath.com", "proposal", { value: 35000, next_action: "Proposal sent, follow up", next_action_at: "2026-11-19", touched: 2 }),
    D(7, "SC Johnson (method)", "Lauren Price", "lauren.price@scj.com", "contract", { value: 120000, client_id: clients[0].id, touched: 6 }),
    D(8, "Disney", "Chris Wu", "chris.wu@disney.com", "invoice", { value: 95000, client_id: clients[1].id, touched: 7 }),
    D(9, "Kraft Heinz", "Ana Lopez", "ana.lopez@kraftheinz.com", "campaign", { value: 150000, client_id: clients[2].id, touched: 8 }),
    D(10, "Oakley Meta", "Jordan Lee", "jordan@meta.com", "closed", { value: 70000, client_id: clients[3].id, touched: 20 }),
    D(11, "Bumble", "Sophie Hart", "sophie@bumble.com", "proposal", { value: 20000, touched: 25 }),
    D(12, "Chipotle", "Ravi Menon", "ravi.menon@chipotle.com", "paused", { touched: 15, notes: "Parked until Q1 budget" }),
    D(13, "Fenty Beauty", "Nia Carter", "nia@fentybeauty.com", "engaged", { sales_status: "nurture", touched: 11 }),
    D(14, "Red Bull", "Max Keller", "max.keller@redbull.com", "outreach", { owner: null, touched: 13, last_contacted_at: iso(9) }),
    // Same company as deal 6 under a second contact: the board marks both as a possible duplicate.
    D(15, "Liquid Death", "Mara Osei", "mara.osei@liquiddeath.com", "outreach", { owner: null, touched: 9, last_contacted_at: iso(6) }),
  ];
  const T = (n, dealIdx, title, due, extra = {}) => ({
    id: `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    deal_id: deals[dealIdx].id,
    title,
    notes: extra.notes ?? null,
    blocker: extra.blocker ?? null,
    due_at: `${due}T17:00:00+00:00`,
    assignee_id: extra.assignee === "sam" ? PROFILES.sam.id : extra.assignee === null ? null : PROFILES.tyler.id,
    action_type: extra.action_type ?? "follow_up",
    status: extra.done ? "done" : "open",
    completed_at: extra.done ? iso(1) : null,
    created_at: iso(10),
    updated_at: iso(extra.touched ?? 3),
  });
  const tasks = [
    T(1, 0, "Send vetting one-pager and demo video", "2026-11-17", { assignee: "sam", touched: 1 }),
    T(2, 0, "Put together creator list once brief lands", "2026-11-24", { assignee: "sam", blocker: "Waiting on CBS brief" }),
    T(3, 2, "Book intro call with Priya", "2026-11-18"),
    T(4, 3, "Send recap deck", "2026-11-16", { done: true }),
    T(5, 4, "Write proposal", "2026-11-14", { notes: "Use campus always-on template" }),
    T(6, 5, "Follow up on proposal", "2026-11-19"),
    T(7, 6, "Collect signed contract", "2026-11-20"),
    T(8, 7, "Send invoice 002", "2026-11-21"),
    T(9, 8, "Campaign kickoff call", "2026-11-22"),
    T(10, 11, "Check back on Q1 budget", "2027-01-15", { assignee: null }),
  ];
  state = { clients, deals, tasks, activities: [], meetings: [], calls: [] };
}
seed();

// ── shaping, as the real tools return records ────────────────────────────────
const toListDeal = (d) => {
  const st = stageBySlug(d.stage);
  const prof = profileById(d.assignee_id);
  return {
    id: d.id,
    notionPageId: null,
    notionUrl: null,
    company: d.company,
    opportunityName: d.opportunity_name,
    logoUrl: null,
    contactName: d.contact_name,
    email: d.email,
    phone: d.phone,
    stage: st?.label ?? d.stage,
    stageSlug: d.stage,
    salesStatus: d.sales_status,
    dealValue: d.deal_value,
    dealTypes: [],
    tags: [],
    assignedTo: prof ? prof.name : null,
    lastContacted: d.last_contacted_at,
    expectedCloseAt: d.expected_close_at,
    nextCheckInAt: d.next_check_in_at,
    waitingOn: d.waiting_on,
    followUpDate: d.follow_up_date,
    notes: d.notes,
    source: d.source,
    campuses: [],
    sourceAgent: d.source_agent,
    createdAt: d.created_at,
  };
};
const toDetailDeal = (d) => {
  const st = stageBySlug(d.stage);
  const prof = profileById(d.assignee_id);
  return {
    id: d.id,
    company: d.company,
    email: d.email,
    phone: d.phone,
    contact_name: d.contact_name,
    stage_id: st?.id ?? null,
    deal_value: d.deal_value,
    deal_types: [],
    assignee_id: d.assignee_id,
    priority: null,
    notes: d.notes,
    expected_close_at: d.expected_close_at,
    last_contacted_at: d.last_contacted_at,
    source: d.source,
    campuses: [],
    logo_url: null,
    notion_page_id: null,
    notion_url: null,
    client_id: d.client_id,
    inbound_brand_lead_id: null,
    created_at: d.created_at,
    updated_at: d.updated_at,
    opportunity_name: d.opportunity_name,
    tags: [],
    next_check_in_at: d.next_check_in_at,
    waiting_on: d.waiting_on,
    sales_status: d.sales_status,
    source_agent: d.source_agent,
    outreach_prospect_id: null,
    website: d.website,
    pipeline_stages: st ? { id: st.id, slug: st.slug, color: st.color, label: st.label, is_won: st.isWon, is_lost: st.isLost, sort_order: st.sortOrder, is_lifecycle: st.isLifecycle } : null,
    profiles: prof ? { id: prof.id, name: prof.name, email: prof.email } : null,
  };
};
const toTask = (t) => ({
  id: t.id,
  dealId: t.deal_id,
  company: state.deals.find((d) => d.id === t.deal_id)?.company ?? null,
  title: t.title,
  actionType: t.action_type,
  dueAt: t.due_at,
  status: t.status,
  notes: t.notes,
  blocker: t.blocker,
  assigneeId: t.assignee_id,
});
const toClient = (c) => ({
  id: c.id,
  name: c.name,
  company: c.company,
  email: null,
  industry: null,
  since: c.since,
  invite_status: c.invite_status,
  primary_color: "#121A29",
  accent_color: null,
  logo_url: null,
  notion_page_id: null,
  created_at: c.created_at,
  assigned_to: null,
  rollcall_client_id: null,
  beeper_chat_title_override: null,
});

function limitOf(args, max) {
  if (args.limit === undefined) return max === 200 ? 100 : 50;
  const n = Number(args.limit);
  if (!Number.isInteger(n) || n < 1 || n > max) throw rpcError(-32602, `Input validation error: Invalid arguments: limit: Invalid input`);
  return n;
}
const visibleDeals = () => state.deals.filter((d) => d.stage !== "lost");

// ── tool implementations ─────────────────────────────────────────────────────
const str = (v) => (v === undefined || v === null ? null : String(v).trim() === "" ? null : String(v).trim());
const num = (v) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const tools = {
  list_pipeline_stages: () => ({ ok: true, stages: STAGES }),
  get_pipeline_summary: (args) => visibleDeals().slice(0, limitOf(args, 100)).map(toListDeal),
  get_pipeline_counts: () => {
    const byStage = {};
    const byStatus = {};
    for (const d of state.deals) {
      const label = stageBySlug(d.stage)?.label ?? d.stage;
      byStage[label] = (byStage[label] || 0) + 1;
      const status = d.stage === "lost" ? "lost" : stageBySlug(d.stage)?.isWon ? "won" : "active";
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return { total: state.deals.length, byStage, byStatus, openPipelineValue: 0, bookedPipelineValue: 0, withContactEmail: state.deals.filter((d) => d.email).length, withAssignee: state.deals.filter((d) => d.assignee_id).length, withNextCheckIn: state.deals.filter((d) => d.next_check_in_at).length };
  },
  search_pipeline: (args) => {
    const limit = limitOf(args, 100);
    const q = String(args.query ?? "").trim().toLowerCase();
    let rows = visibleDeals();
    if (q) rows = rows.filter((d) => [d.company, d.contact_name, d.email, d.opportunity_name].some((v) => v?.toLowerCase().includes(q)));
    if (args.stage) {
      const want = String(args.stage).toLowerCase();
      rows = rows.filter((d) => d.stage === want || (stageBySlug(d.stage)?.label ?? "").toLowerCase() === want);
    }
    if (args.owner) {
      const want = String(args.owner).toLowerCase();
      rows = rows.filter((d) => (profileById(d.assignee_id)?.name ?? "").toLowerCase().includes(want));
    }
    rows = [...rows].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return rows.slice(0, limit).map(toListDeal);
  },
  get_pipeline_deal: (args) => {
    const deal = state.deals.find((d) => d.id === args.dealId);
    if (!deal) throw rpcError(-32602, `No pipeline deal found with id ${args.dealId}`);
    return toDetailDeal(deal);
  },
  list_pipeline_tasks: (args) => {
    const limit = limitOf(args, 100);
    let rows = state.tasks;
    if (args.dealId) rows = rows.filter((t) => t.deal_id === args.dealId);
    const status = args.status ?? "open";
    if (status !== "all") rows = rows.filter((t) => t.status === status);
    return { ok: true, tasks: rows.slice(0, limit).map(toTask) };
  },
  list_clients: (args) => state.clients.slice(0, limitOf(args, 200)).map(toClient),
  search_clients: (args) => {
    const q = String(args.query ?? "").toLowerCase();
    return state.clients.filter((c) => c.name.toLowerCase().includes(q)).map(toClient);
  },
  get_client: (args) => {
    const client = state.clients.find((c) => c.id === args.clientId);
    if (!client) throw rpcError(-32602, `No client found with id ${args.clientId}`);
    return toClient(client);
  },
  get_admin_stats: () => ({ totalClients: state.clients.length, activeClients: state.clients.filter((c) => c.invite_status === "accepted").length, totalRevenue: 0, bookedPipelineValue: 0, openPipelineValue: 0, revenueNote: "mock", activeCampaigns: 0, pendingDeliverables: 0 }),
  // Write tools, shaped on the real input schemas (tools/list, 2026-11-17).
  // Response shapes are a guess; the Command Center re-reads with get_pipeline_deal after every write.
  create_pipeline_deal: (args) => {
    const company = str(args.company);
    if (!company) throw rpcError(-32602, "Input validation error: Invalid arguments: company: Required");
    const stageSlug = args.stageSlug === undefined ? "outreach" : String(args.stageSlug);
    if (!WRITABLE_STAGE_SLUGS.includes(stageSlug)) throw rpcError(-32602, `Input validation error: Invalid arguments: stageSlug: Invalid enum value`);
    const email = str(args.email)?.toLowerCase() ?? null;
    if (!args.forceCreate) {
      const dupe = state.deals.find((d) => (email && d.email?.toLowerCase() === email) || d.company.toLowerCase() === company.toLowerCase());
      if (dupe) return { ok: true, deduped: true, existing: true, deal: toDetailDeal(dupe), message: `Existing deal matched by ${email && dupe.email?.toLowerCase() === email ? "email" : "company"}; pass forceCreate to create anyway.` };
    }
    const now = new Date().toISOString();
    const d = {
      id: randomUUID(), company, opportunity_name: str(args.opportunityName), contact_name: str(args.contactName), email, phone: str(args.phone),
      stage: stageSlug, sales_status: stageSlug === "lost" ? "lost" : stageBySlug(stageSlug)?.isWon ? "won" : "active",
      assignee_id: str(args.assigneeId), waiting_on: null, next_check_in_at: str(args.nextCheckInAt), follow_up_date: null, expected_close_at: str(args.expectedCloseAt),
      last_contacted_at: null, deal_value: num(args.dealValue), notes: str(args.notes), client_id: null, website: str(args.website),
      source: args.source === undefined ? "mcp" : String(args.source), source_agent: args.agent === undefined ? "GrokBot" : String(args.agent), created_at: now, updated_at: now,
    };
    state.deals.push(d);
    return { ok: true, deal: toDetailDeal(d) };
  },
  update_pipeline_deal: (args) => {
    const d = state.deals.find((x) => x.id === args.dealId);
    if (!d) throw rpcError(-32602, `No pipeline deal found with id ${args.dealId}`);
    if (args.stageSlug !== undefined && !WRITABLE_STAGE_SLUGS.includes(String(args.stageSlug))) throw rpcError(-32602, "Input validation error: Invalid arguments: stageSlug: Invalid enum value");
    if (args.salesStatus !== undefined && !["active", "nurture", "won", "lost"].includes(String(args.salesStatus))) throw rpcError(-32602, "Input validation error: Invalid arguments: salesStatus: Invalid enum value");
    const map = { company: "company", contactName: "contact_name", email: "email", phone: "phone", website: "website", notes: "notes", dealValue: "deal_value", assigneeId: "assignee_id", opportunityName: "opportunity_name", salesStatus: "sales_status", nextCheckInAt: "next_check_in_at", waitingOn: "waiting_on" };
    const changed = [];
    for (const [arg, col] of Object.entries(map)) {
      if (!(arg in args)) continue;
      const v = arg === "dealValue" ? num(args[arg]) : arg === "email" ? (str(args[arg])?.toLowerCase() ?? null) : str(args[arg]);
      if (d[col] !== v) { d[col] = v; changed.push(col); }
    }
    if (args.stageSlug !== undefined && d.stage !== args.stageSlug) { d.stage = String(args.stageSlug); changed.push("stage"); if (!("salesStatus" in args)) d.sales_status = d.stage === "lost" ? "lost" : stageBySlug(d.stage)?.isWon ? "won" : "active"; }
    else if (args.stageId !== undefined) { const st = STAGES.find((x) => x.id === args.stageId); if (st && d.stage !== st.slug) { d.stage = st.slug; changed.push("stage"); } }
    if (args.agent !== undefined) d.source_agent = String(args.agent);
    d.updated_at = new Date().toISOString();
    return { ok: true, updated: changed, deal: toDetailDeal(d) };
  },
  update_pipeline_deal_contact: (args) => {
    const d = state.deals.find((x) => x.id === args.dealId);
    if (!d) throw rpcError(-32602, `No pipeline deal found with id ${args.dealId}`);
    for (const [arg, col] of Object.entries({ contactName: "contact_name", email: "email", phone: "phone", notes: "notes" })) if (arg in args) d[col] = str(args[arg]);
    d.updated_at = new Date().toISOString();
    return { ok: true, deal: toDetailDeal(d) };
  },
  add_pipeline_activity: (args) => {
    const d = state.deals.find((x) => x.id === args.dealId);
    if (!d) throw rpcError(-32602, `No pipeline deal found with id ${args.dealId}`);
    const body = str(args.body);
    if (!body) throw rpcError(-32602, "Input validation error: Invalid arguments: body: Required");
    const kind = args.kind === undefined ? "note" : String(args.kind);
    if (!["note", "email", "call", "system"].includes(kind)) throw rpcError(-32602, "Input validation error: Invalid arguments: kind: Invalid enum value");
    const a = { id: randomUUID(), deal_id: d.id, kind, body, agent: args.agent === undefined ? "GrokBot" : String(args.agent), created_at: new Date().toISOString() };
    state.activities.push(a);
    if (args.touchContact) { d.last_contacted_at = a.created_at; d.updated_at = a.created_at; }
    return { ok: true, activity: a };
  },
  create_pipeline_task: (args) => {
    const d = state.deals.find((x) => x.id === args.dealId);
    if (!d) throw rpcError(-32602, `No pipeline deal found with id ${args.dealId}`);
    const title = str(args.title);
    const due = str(args.dueAt);
    if (!title || !due) throw rpcError(-32602, "Input validation error: Invalid arguments: title, dueAt: Required");
    if (!/^\d{4}-\d{2}-\d{2}/.test(due)) throw rpcError(-32602, "Input validation error: Invalid arguments: dueAt: Invalid date");
    const now = new Date().toISOString();
    const t = { id: randomUUID(), deal_id: d.id, title, action_type: args.actionType === undefined ? "follow_up" : String(args.actionType), due_at: due.length === 10 ? `${due}T17:00:00.000Z` : due, status: "open", notes: str(args.notes), blocker: str(args.blocker), assignee_id: str(args.assigneeId), agent: args.agent === undefined ? "GrokBot" : String(args.agent), created_at: now, updated_at: now };
    state.tasks.push(t);
    return { ok: true, task: toTask(t) };
  },
  complete_pipeline_task: (args) => {
    const t = state.tasks.find((x) => x.id === args.taskId);
    if (!t) throw rpcError(-32602, `No task found with id ${args.taskId}`);
    t.status = "done"; t.completed_at = new Date().toISOString(); t.updated_at = t.completed_at;
    return { ok: true, task: toTask(t) };
  },
  upsert_meeting_note: (args) => {
    if (!str(args.externalId) || !str(args.title)) throw rpcError(-32602, "Input validation error: Invalid arguments: externalId, title: Required");
    const existing = state.meetings.find((m) => m.external_id === args.externalId);
    const m = existing ?? { id: randomUUID(), external_id: String(args.externalId), created_at: new Date().toISOString() };
    Object.assign(m, { title: String(args.title), summary: str(args.summary), short_summary: str(args.shortSummary), meeting_start_at: str(args.meetingStartAt), external_url: str(args.externalUrl), deal_id: str(args.dealId), recorded_by: args.recordedBy === undefined ? "Sam" : String(args.recordedBy), updated_at: new Date().toISOString() });
    if (!existing) state.meetings.push(m);
    return { ok: true, created: !existing, meeting: m };
  },
  check_outreach_eligibility: (args) => {
    if (!str(args.company)) throw rpcError(-32602, "Input validation error: Invalid arguments: company: Required");
    const email = str(args.email)?.toLowerCase();
    const existing = state.deals.find((d) => (email && d.email?.toLowerCase() === email) || d.company.toLowerCase() === String(args.company).toLowerCase());
    return existing ? { ok: true, eligible: false, reason: "existing_deal", dealId: existing.id } : { ok: true, eligible: true };
  },
  // Destructive and outreach tools exist (full scope only) so denial can be proven.
  cleanup_pipeline_junk: () => { const before = state.deals.length; state.deals = state.deals.filter((d) => d.company); return { ok: true, removed: before - state.deals.length }; },
  send_outreach_email: () => ({ ok: true, sent: true }),
  claim_outreach_lead: () => ({ ok: true, claimed: true }),
  archive_outreach_lead: () => ({ ok: true, archived: true }),
  get_recent_activity: () => ({ ok: true, items: [] }),
};
const TOOL_META = Object.keys(tools).map((name) => ({ name, description: `mock ${name}`, inputSchema: { type: "object", properties: {}, additionalProperties: true } }));

function rpcError(code, message) { const e = new Error(message); e.rpc = { code, message }; return e; }
function inScope(scope, tool) { return scope === "*" || (scope === "command_center" && SCOPE_SET.has(tool)) || (scope === "command_center_write" && WRITE_SCOPE_SET.has(tool)); }

// ── HTTP ─────────────────────────────────────────────────────────────────────
function readBody(req) { return new Promise((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); }); }
function send(res, status, body) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (TEST_HOOKS && url.pathname.startsWith("/__test/")) return testHook(req, res, url);
  if (url.pathname !== "/api/mcp") return send(res, 404, { error: "not found" });
  const auth = req.headers.authorization || "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const scope = KEYS[key];
  if (!scope) return send(res, 401, { error: "Unauthorized" });
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  let msg;
  try { msg = JSON.parse(await readBody(req)); } catch { return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const { id, method, params = {} } = msg;
  if (method === "notifications/initialized") { res.writeHead(202); return res.end(); }
  const reply = (result) => send(res, 200, { jsonrpc: "2.0", id, result });
  const fail = (code, message) => send(res, 200, { jsonrpc: "2.0", id, error: { code, message } });
  // The real server replies as text content (JSON pretty-printed), no structuredContent.
  const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  if (method === "initialize") {
    return reply({ protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "flair-portal-mock", version: "1.8.0" } });
  }
  // Like the real server: the list is not filtered by scope, calls are.
  if (method === "tools/list") return reply({ tools: TOOL_META });
  if (method === "tools/call") {
    const name = params.name;
    state.calls.push({ tool: name, scope, at: new Date().toISOString(), allowed: inScope(scope, name) });
    if (!tools[name]) return fail(-32601, `Unknown tool ${name}`);
    if (!inScope(scope, name)) {
      return reply(asText({ ok: false, error: `Tool "${name}" is not allowed for the Command Center MCP key. Allowed: ${(scope === "command_center_write" ? COMMAND_CENTER_WRITE_SCOPE : COMMAND_CENTER_SCOPE).join(", ")}.` }));
    }
    try {
      return reply(asText(tools[name](params.arguments ?? {})));
    } catch (e) {
      if (e.rpc) return reply({ content: [{ type: "text", text: e.rpc.message }], isError: true });
      return fail(-32603, e.message);
    }
  }
  return fail(-32601, `Unknown method ${method}`);
});

async function testHook(req, res, url) {
  const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : {};
  switch (url.pathname) {
    case "/__test/reset": seed(); return send(res, 200, { ok: true });
    case "/__test/calls": return send(res, 200, { calls: state.calls });
    case "/__test/calls/clear": state.calls = []; return send(res, 200, { ok: true });
    case "/__test/mutate": {
      const d = state.deals.find((x) => x.id === body.dealId);
      if (!d) return send(res, 404, { error: "no deal" });
      Object.assign(d, body.patch ?? {}, { updated_at: new Date().toISOString() });
      return send(res, 200, { deal: d });
    }
    case "/__test/mutate-task": {
      const t = state.tasks.find((x) => x.id === body.taskId);
      if (!t) return send(res, 404, { error: "no task" });
      Object.assign(t, body.patch ?? {}, { updated_at: new Date().toISOString() });
      return send(res, 200, { task: t });
    }
    case "/__test/remove": state.deals = state.deals.filter((d) => d.id !== body.dealId); return send(res, 200, { ok: true });
    case "/__test/add-deal": {
      const d = { id: randomUUID(), stage: "engaged", sales_status: "active", assignee_id: null, waiting_on: null, next_check_in_at: null, follow_up_date: null, expected_close_at: null, last_contacted_at: null, deal_value: null, notes: null, client_id: null, website: null, source: null, source_agent: null, opportunity_name: null, phone: null, email: null, contact_name: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      state.deals.push(d); return send(res, 200, { deal: d });
    }
    case "/__test/state": return send(res, 200, { deals: state.deals.length, tasks: state.tasks.length, clients: state.clients.length, activities: state.activities.length, meetings: state.meetings.length });
    case "/__test/deal": { const d = state.deals.find((x) => x.id === url.searchParams.get("id") || x.id === body.dealId); return d ? send(res, 200, { deal: d }) : send(res, 404, { error: "no deal" }); }
    case "/__test/deals": return send(res, 200, { deals: state.deals.map((d) => ({ id: d.id, company: d.company, stage: d.stage, email: d.email, source: d.source, source_agent: d.source_agent })) });
    case "/__test/activities": return send(res, 200, { activities: url.searchParams.get("dealId") ? state.activities.filter((a) => a.deal_id === url.searchParams.get("dealId")) : state.activities });
    case "/__test/tasks": return send(res, 200, { tasks: url.searchParams.get("dealId") ? state.tasks.filter((t) => t.deal_id === url.searchParams.get("dealId")) : state.tasks });
    default: return send(res, 404, { error: "unknown hook" });
  }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`flair-os-mock listening on http://127.0.0.1:${PORT}/api/mcp (test hooks ${TEST_HOOKS ? "on" : "off"})`);
});
