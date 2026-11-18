#!/usr/bin/env node
/**
 * Phase 1 mirror test: drives the Command Center against the synthetic
 * FLAIR OS server and checks the database, the log, the guards, and the
 * allowlist. Needs both servers running:
 *
 *   PORT=3777 MOCK_TEST_HOOKS=1 node scripts/flair-os-mock/server.mjs
 *   ADMIN_PASSWORD=cc-ui-preview-2026 PORT=3006 FLAIR_OS_MCP_URL=http://127.0.0.1:3777/api/mcp \
 *     FLAIR_OS_MCP_KEY=cc-mock-key FLAIR_OS_SYNC_INTERVAL_MIN=0 FLAIR_OS_MIN_GAP_MS=50 npm run dev
 *
 *   node scripts/flair-os-mock/test-mirror.mjs
 *
 * Writes docs/integrations/results/mirror-test-results.json and exits
 * non-zero on any failure.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));

const CC = process.env.CC_URL || "http://127.0.0.1:3006";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:3777";
const PASSWORD = process.env.CC_PASSWORD || "cc-ui-preview-2026";
const DB_PATH = process.env.CC_DB || path.join(ROOT, "data", "command-center.db");
const CC_KEY = process.env.FLAIR_OS_MOCK_CC_KEY || "cc-mock-key";
const FULL_KEY = process.env.FLAIR_OS_MOCK_FULL_KEY || "full-mock-key";

const READ_ALLOWLIST = [
  "list_pipeline_stages", "get_pipeline_summary", "search_pipeline", "get_pipeline_counts",
  "get_pipeline_deal", "list_pipeline_tasks", "list_clients", "search_clients", "get_client",
];
// Allowed by Tyler's scope but never called by the mirror.
const ALLOWED_UNUSED = ["get_admin_stats"];
const DENIED_NAMES = [
  "send_outreach_email", "claim_outreach_lead", "archive_outreach_lead", "cleanup_pipeline_junk",
  "create_pipeline_deals_batch", "set_pipeline_deal_logo", "clear_pipeline_deal_logo",
  "upsert_school_contact", "list_outreach_replies", "search_leads",
];
// The two-way write scope (TWO_WAY_PLAN.md section 4.1). These names may appear only in
// allowlist.ts, write.ts and merge.ts; the client refuses them unless FLAIR_OS_WRITE_ENABLED=1.
const WRITE_NAMES = ["create_pipeline_deal", "update_pipeline_deal", "update_pipeline_deal_contact", "add_pipeline_activity", "create_pipeline_task", "complete_pipeline_task", "upsert_meeting_note", "check_outreach_eligibility"];
const WRITE_FILES = ["allowlist.ts", "write.ts", "merge.ts"];

const results = [];
let cookie = "";
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`);
}
async function cc(pathname, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (cookie && !headers["x-share-token"] && init.noCookie !== true) headers.cookie = cookie;
  if (init.body && typeof init.body !== "string") { init.body = JSON.stringify(init.body); headers["content-type"] = "application/json"; }
  const res = await fetch(CC + pathname, { ...init, headers, redirect: "manual" });
  let json = null;
  try { json = await res.clone().json(); } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers };
}
async function mock(pathname, body) {
  const res = await fetch(MOCK + pathname, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}
async function mcp(key, name, args = {}) {
  const res = await fetch(MOCK + "/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const db = () => new Database(DB_PATH, { readonly: true, fileMustExist: true });
/** Remove everything a previous run mirrored so the checks start from a clean mirror. */
function resetMirror() {
  const d = new Database(DB_PATH, { fileMustExist: true });
  try {
    d.exec(`DELETE FROM flair_os_activities;
      DELETE FROM todos WHERE flair_os_id IS NOT NULL;
      DELETE FROM leads WHERE flair_os_id IS NOT NULL;
      DELETE FROM brand_contacts WHERE flair_os_client_id IS NOT NULL;
      DELETE FROM flair_os_sync_log;
      DELETE FROM flair_os_conflicts;
      DELETE FROM flair_os_links;
      DELETE FROM leads WHERE business_id = 'flair' AND flair_os_id IS NULL AND notes LIKE 'v2test%';
      UPDATE flair_os_sync_state SET pull_paused = 0, last_run_at = NULL, last_ok_at = NULL, last_error = NULL, last_summary = NULL;`);
  } finally { d.close(); }
}
const one = (sql, ...args) => { const d = db(); try { return d.prepare(sql).get(...args); } finally { d.close(); } };
const all = (sql, ...args) => { const d = db(); try { return d.prepare(sql).all(...args); } finally { d.close(); } };

const DEAL = {
  cbs: "d0000000-0000-4000-8000-000000000001",
  forever21: "d0000000-0000-4000-8000-000000000002",
  glossier: "d0000000-0000-4000-8000-000000000003",
  celsius: "d0000000-0000-4000-8000-000000000004",
  kraft: "d0000000-0000-4000-8000-000000000009",
  bumble: "d0000000-0000-4000-8000-000000000011",
  chipotle: "d0000000-0000-4000-8000-000000000012",
  fenty: "d0000000-0000-4000-8000-000000000013",
  redbull: "d0000000-0000-4000-8000-000000000014",
  liquid1: "d0000000-0000-4000-8000-000000000006",
  liquid2: "d0000000-0000-4000-8000-000000000015",
};
const TASK3 = "a0000000-0000-4000-8000-000000000003";
const TASK1 = "a0000000-0000-4000-8000-000000000001";
const TASK4 = "a0000000-0000-4000-8000-000000000004";

async function main() {
  // 0. Static allowlist scan: no denied or write tool name under lib/flair-os except the documented list in allowlist.ts.
  const files = fs.readdirSync(path.join(ROOT, "lib", "flair-os")).map((f) => path.join(ROOT, "lib", "flair-os", f));
  files.push(path.join(ROOT, "components", "flair-os-panel.tsx"), path.join(ROOT, "components", "flair-os-board.tsx"));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const n of DENIED_NAMES) if (src.includes(n)) offenders.push(`${path.basename(f)}:${n}`);
    if (!WRITE_FILES.some((w) => f.endsWith(w))) for (const n of WRITE_NAMES) if (src.includes(n)) offenders.push(`${path.basename(f)}:${n}`);
  }
  check("static: no denied tool names anywhere; write tool names only in allowlist.ts, write.ts, merge.ts", offenders.length === 0, offenders);
  // Every write name the code uses must be in FLAIR_OS_WRITE_TOOLS, and the client must gate on allowWrites.
  const allowSrc = fs.readFileSync(path.join(ROOT, "lib", "flair-os", "allowlist.ts"), "utf8");
  const clientSrc = fs.readFileSync(path.join(ROOT, "lib", "flair-os", "client.ts"), "utf8");
  check("static: allowlist names all eight write tools and the client refuses writes when off", WRITE_NAMES.every((n) => allowSrc.includes(`"${n}"`)) && clientSrc.includes('"writes_off"') && clientSrc.includes("allowWrites"), null);

  // 1. Servers up, login.
  const ping = await fetch(MOCK + "/__test/state").then((r) => r.json()).catch(() => null);
  check("mock server reachable with test hooks", !!ping && ping.deals === 15, ping);
  const login = await fetch(CC + "/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
  const setCookie = login.headers.get("set-cookie") || "";
  cookie = setCookie.split(";")[0];
  check("admin login", login.ok && cookie.startsWith("cc_session="), login.status);

  await mock("/__test/reset", {});
  await mock("/__test/calls/clear", {});
  resetMirror();

  // 2. Status before any pull.
  let status = await cc("/api/flair-os/status");
  check("status route enabled for admin", status.status === 200 && status.json?.enabled === true && status.json?.canSync === true, status.json);

  // 3. Dry run writes nothing.
  const before = one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id IS NOT NULL").n;
  const dry = await cc("/api/flair-os/sync", { method: "POST", body: { dryRun: true } });
  check("dry run reports 15 deals to create", dry.status === 200 && dry.json?.ok && dry.json.dry_run && dry.json.deals.seen === 15 && dry.json.deals.created === 15, dry.json?.deals);
  const afterDry = one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id IS NOT NULL").n;
  check("dry run wrote no leads", afterDry === before, { before, afterDry });
  const dryLog = all("SELECT result FROM flair_os_sync_log WHERE record_kind = 'deal' ORDER BY id DESC LIMIT 15");
  check("dry run entries are marked dry_run in the log", dryLog.length === 15 && dryLog.every((r) => r.result === "dry_run"), dryLog.slice(0, 3));

  // 4. Real pull.
  const pull = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  check("first pull creates 15 deals, 10 tasks, 4 clients", pull.status === 200 && pull.json?.ok && pull.json.deals.created === 15 && pull.json.tasks.created === 10 && pull.json.clients.created === 4, pull.json && { deals: pull.json.deals, tasks: pull.json.tasks, clients: pull.json.clients, error: pull.json.error });
  check("first pull stays inside the polling budget (under 30 calls)", pull.json?.calls > 0 && pull.json.calls < 30, pull.json?.calls);
  check("first pull raised no cap warnings", Array.isArray(pull.json?.warnings) && pull.json.warnings.length === 0, pull.json?.warnings);
  const leads = all("SELECT id, name, company, stage, flair_os_id, flair_os_stage, flair_os_sales_status, flair_os_owner, value_cents, contact_email, business_id FROM leads WHERE flair_os_id IS NOT NULL");
  check("15 mirrored leads, all under the flair business", leads.length === 15 && leads.every((l) => l.business_id === "flair"), leads.length);
  const by = Object.fromEntries(leads.map((l) => [l.flair_os_id, l]));
  check("stage map: engaged rolls up to qualified (CBS)", by[DEAL.cbs]?.stage === "qualified" && by[DEAL.cbs]?.flair_os_stage === "engaged", by[DEAL.cbs]);
  check("stage map: outreach with no activity rolls up to new (Forever 21)", by[DEAL.forever21]?.stage === "new", by[DEAL.forever21]);
  check("stage map: proposal-owed rolls up to proposal (Glossier)", by[DEAL.glossier]?.stage === "proposal", by[DEAL.glossier]);
  check("stage map: ambassador-sourcing rolls up to qualified (Celsius)", by[DEAL.celsius]?.stage === "qualified", by[DEAL.celsius]);
  check("stage map: outreach with lastContacted rolls up to contacted (Red Bull)", by[DEAL.redbull]?.stage === "contacted", by[DEAL.redbull]);
  check("stage map: campaign rolls up to won (Kraft Heinz)", by[DEAL.kraft]?.stage === "won", by[DEAL.kraft]);
  check("stage map: paused stage becomes parked (Chipotle)", by[DEAL.chipotle]?.stage === "parked" && by[DEAL.chipotle]?.flair_os_stage === "paused", by[DEAL.chipotle]);
  check("stage map: sales_status nurture becomes nurture (Fenty)", by[DEAL.fenty]?.stage === "nurture", by[DEAL.fenty]);
  check("fields: CBS keeps owner, value in cents, contact email", by[DEAL.cbs]?.flair_os_owner === "Sam Freeman" && by[DEAL.cbs]?.value_cents === 8500000 && by[DEAL.cbs]?.contact_email === "emma.sandoval@example.com" && by[DEAL.cbs]?.name === "Emma Sandoval" && by[DEAL.cbs]?.company === "CBS / Paramount", by[DEAL.cbs]);
  const cbsDetail = one("SELECT flair_os_updated_at, flair_os_client_id FROM leads WHERE flair_os_id = ?", DEAL.cbs);
  const kraftDetail = one("SELECT flair_os_updated_at, flair_os_client_id FROM leads WHERE flair_os_id = ?", DEAL.kraft);
  check("detail enrichment fills updated_at and client link on the first pull", !!cbsDetail?.flair_os_updated_at && !!kraftDetail?.flair_os_updated_at && kraftDetail?.flair_os_client_id === "c1000000-0000-4000-8000-000000000003", { cbsDetail, kraftDetail });
  const todos = all("SELECT id, title, status, due_date, lead_id, flair_os_id, flair_os_deal_id, flair_os_assignee, business_id FROM todos WHERE flair_os_id IS NOT NULL");
  check("10 mirrored todos, every one linked to its lead", todos.length === 10 && todos.every((t) => t.lead_id && t.business_id === "flair"), todos.map((t) => [t.title, t.lead_id]));
  const t4 = todos.find((t) => t.flair_os_id === TASK4);
  check("completed FLAIR OS task mirrors as done", t4?.status === "done", t4);
  const t1 = todos.find((t) => t.flair_os_id === TASK1);
  check("task fields: due date, assignee, lead link (CBS task)", t1?.due_date === "2026-11-17" && t1?.flair_os_assignee === "Sam Freeman" && t1?.lead_id === by[DEAL.cbs]?.id, t1);
  const clients = all("SELECT brand_name, website, status, flair_os_client_id FROM brand_contacts WHERE flair_os_client_id IS NOT NULL");
  check("4 clients mirrored into the CRM as partners", clients.length === 4 && clients.every((c) => c.status === "active_partner" || c.status === "past_partner"), clients);
  const activitiesRoute = await cc(`/api/flair-os/leads/${by[DEAL.cbs]?.id}/activities`);
  check("activities route answers (FLAIR OS exposes no activity read yet, so empty)", activitiesRoute.status === 200 && Array.isArray(activitiesRoute.json?.activities) && activitiesRoute.json.activities.length === 0, activitiesRoute.json);

  // 5. Idempotent second pull.
  const again = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  check("second pull changes nothing", again.json?.ok && again.json.deals.created === 0 && again.json.deals.updated === 0 && again.json.deals.unchanged === 15 && again.json.tasks.updated === 0 && again.json.clients.updated === 0, again.json && { deals: again.json.deals, tasks: again.json.tasks });

  // 6. A change in FLAIR OS arrives with a field-level log entry.
  await mock("/__test/mutate", { dealId: DEAL.cbs, patch: { stage: "proposal", deal_value: 90000, waiting_on: "Proposal owed by Friday" } });
  const third = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  const cbsNow = one("SELECT stage, flair_os_stage, value_cents, next_action FROM leads WHERE flair_os_id = ?", DEAL.cbs);
  check("stage change in FLAIR OS updates exactly one lead", third.json?.deals.updated === 1 && cbsNow.stage === "proposal" && cbsNow.flair_os_stage === "proposal" && cbsNow.value_cents === 9000000 && cbsNow.next_action === "Proposal owed by Friday", { summary: third.json?.deals, cbsNow });
  // The list pull logs the stage change; the detail enrichment that follows logs updated_at. Look across both.
  const logRows = all("SELECT changes FROM flair_os_sync_log WHERE record_kind = 'deal' AND flair_os_id = ? AND action = 'updated' ORDER BY id DESC LIMIT 3", DEAL.cbs);
  const changes = logRows.flatMap((r) => (r.changes ? JSON.parse(r.changes) : []));
  const stageChange = changes.find((c) => c.field === "flair_os_stage");
  check("log records old and new values for the change", stageChange?.from === "engaged" && stageChange?.to === "proposal", changes);

  // 7a. A deal moved to lost disappears from the list; the mirror asks for it by id and shows it as lost.
  await mock("/__test/mutate", { dealId: DEAL.bumble, patch: { stage: "lost" } });
  const lostPull = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  const bumbleLost = one("SELECT stage, flair_os_stage, flair_os_missing_at FROM leads WHERE flair_os_id = ?", DEAL.bumble);
  check("deal moved to lost shows as lost, not missing", lostPull.json?.deals.missing === 0 && bumbleLost?.stage === "lost" && bumbleLost?.flair_os_stage === "lost" && !bumbleLost?.flair_os_missing_at, { summary: lostPull.json?.deals, bumbleLost });
  // 7b. A deal removed in FLAIR OS is flagged, never deleted.
  await mock("/__test/remove", { dealId: DEAL.bumble });
  const fourth = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  const bumble = one("SELECT id, flair_os_missing_at FROM leads WHERE flair_os_id = ?", DEAL.bumble);
  check("removed deal is kept and flagged missing", fourth.json?.deals.missing === 1 && !!bumble && !!bumble.flair_os_missing_at, { summary: fourth.json?.deals, bumble });
  status = await cc("/api/flair-os/status");
  check("drift report shows 1 missing", status.json?.drift?.leads_missing === 1 && status.json.drift.leads_mirrored === 15, status.json?.drift);

  // 8. Task completion in FLAIR OS mirrors.
  await mock("/__test/mutate-task", { taskId: TASK1, patch: { status: "done", completed_at: new Date().toISOString() } });
  const fifth = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  const t1Now = one("SELECT status, completed_at FROM todos WHERE flair_os_id = ?", TASK1);
  check("task completed in FLAIR OS becomes a done todo", fifth.json?.tasks.updated === 1 && t1Now.status === "done" && !!t1Now.completed_at, { summary: fifth.json?.tasks, t1Now });

  // 9. Phase 1 guards: mirrored rows cannot be edited or deleted here.
  const cbsId = by[DEAL.cbs]?.id;
  const patchLead = await cc(`/api/leads/${cbsId}`, { method: "PATCH", body: { name: "Should not stick" } });
  const delLead = await cc(`/api/leads/${cbsId}`, { method: "DELETE" });
  const patchTodo = await cc(`/api/todos/${t1.id}`, { method: "PATCH", body: { title: "Should not stick" } });
  const delTodo = await cc(`/api/todos/${t1.id}`, { method: "DELETE" });
  const stillThere = one("SELECT name FROM leads WHERE id = ?", cbsId);
  check("PATCH and DELETE on a mirrored lead return 409 and change nothing", patchLead.status === 409 && delLead.status === 409 && stillThere?.name === "Emma Sandoval", { patch: patchLead.status, del: delLead.status, name: stillThere?.name });
  check("PATCH and DELETE on a mirrored todo return 409", patchTodo.status === 409 && delTodo.status === 409, { patch: patchTodo.status, del: delTodo.status });
  // A local FLAIR lead is still editable.
  const local = await cc("/api/leads", { method: "POST", body: { business_id: "flair", name: "Local only lead", company: "Local Co" } });
  const localPatch = await cc(`/api/leads/${local.json?.id}`, { method: "PATCH", body: { stage: "contacted" } });
  const localDel = await cc(`/api/leads/${local.json?.id}`, { method: "DELETE" });
  check("a local (non-mirrored) FLAIR lead is still editable and deletable", local.status === 200 && localPatch.status === 200 && localDel.status === 200, { local: local.status, patch: localPatch.status, del: localDel.status });


  // 15. v2 board data: FLAIR OS stage metadata, FLAIR OS counts, and the card fields.
  status = await cc("/api/flair-os/status");
  const stageMeta = status.json?.stages ?? [];
  const metaBySlug = Object.fromEntries(stageMeta.map((m) => [m.slug, m]));
  check("stage metadata: 13 FLAIR OS stages stored with label, color and order", stageMeta.length === 13 && metaBySlug.engaged?.label === "Engaged" && metaBySlug.engaged?.color === "#667085" && metaBySlug.engaged?.sort_order === 0 && metaBySlug.proposal?.label === "Proposal Sent", stageMeta.slice(0, 3));
  check("stage metadata: won, lost and non-lifecycle flags survive", metaBySlug.signed?.is_won === true && metaBySlug.lost?.is_lost === true && metaBySlug.paused?.is_lifecycle === false && metaBySlug.outreach?.is_lifecycle === true, { signed: metaBySlug.signed, lost: metaBySlug.lost, paused: metaBySlug.paused });
  const counts = status.json?.state?.counts;
  check("FLAIR OS counts stored for the board header", !!counts && typeof counts.fetched_at === "number" && counts.byStatus && typeof counts.byStatus.active === "number" && counts.total === 14, counts);
  const cbsV2 = one("SELECT flair_os_opportunity, flair_os_last_contacted_at FROM leads WHERE flair_os_id = ?", DEAL.cbs);
  const redbullV2 = one("SELECT flair_os_opportunity, flair_os_last_contacted_at FROM leads WHERE flair_os_id = ?", DEAL.redbull);
  check("card fields: opportunity name and last contacted mirrored", cbsV2?.flair_os_opportunity === "FLAIR x CBS - Undercover Boss revival" && !!cbsV2?.flair_os_last_contacted_at && redbullV2?.flair_os_opportunity === null && !!redbullV2?.flair_os_last_contacted_at, { cbsV2, redbullV2 });
  const dup = status.json?.reconciliation?.duplicates ?? {};
  check("duplicate marker: both Liquid Death deals point at each other", dup[DEAL.liquid1]?.[0] === DEAL.liquid2 && dup[DEAL.liquid2]?.[0] === DEAL.liquid1 && Object.keys(dup).length === 2, dup);

  // 16. Reconciliation lane: Command Center-only FLAIR leads get a verdict against FLAIR OS.
  const mk = async (body) => (await cc("/api/leads", { method: "POST", body: { business_id: "flair", ...body } })).json;
  const leadA = await mk({ name: "Priya Natarajan", company: "Glossier Inc.", contact_email: "PRIYA@glossier.com", notes: "v2test my private note", stage: "contacted" });
  const leadB = await mk({ name: "Someone Else", company: "The Celsius", notes: "v2test" });
  const leadC = await mk({ name: "Nobody", company: "Acme Rockets", notes: "v2test" });
  const leadD = await mk({ name: "Dana Kim", company: "forever 21", notes: "v2test" });
  const attach = await cc(`/api/leads/${leadA.id}/attachments`, { method: "POST", body: { type: "link", url: "https://example.com/deck", label: "Deck" } });
  check("setup: four Command Center-only FLAIR leads and one attachment created", leadA?.id && leadB?.id && leadC?.id && leadD?.id && attach.status === 200, { a: leadA?.id, attach: attach.status });
  status = await cc("/api/flair-os/status");
  const items = Object.fromEntries((status.json?.reconciliation?.items ?? []).map((i) => [i.id, i]));
  check("lane: email match is 'same' (Glossier)", items[leadA.id]?.verdict === "same" && items[leadA.id]?.match?.flair_os_id === DEAL.glossier, items[leadA.id]);
  check("lane: same company, different contact is 'likely' (Celsius)", items[leadB.id]?.verdict === "likely" && items[leadB.id]?.match?.flair_os_id === DEAL.celsius, items[leadB.id]);
  check("lane: no match is 'none' (Acme Rockets)", items[leadC.id]?.verdict === "none" && items[leadC.id]?.match === null, items[leadC.id]);
  check("lane: normalized company plus contact name is 'same' (Forever 21)", items[leadD.id]?.verdict === "same" && items[leadD.id]?.match?.flair_os_id === DEAL.forever21, items[leadD.id]);
  const rc = status.json?.reconciliation?.counts;
  check("lane counts: 2 same, 1 likely, 1 none, 0 separate", rc?.same === 2 && rc?.likely === 1 && rc?.none === 1 && rc?.separate === 0, rc);

  // 17. Link: Sam's lead takes over the deal; nothing of his is lost and the shell row is folded in.
  const shellBefore = one("SELECT id FROM leads WHERE flair_os_id = ?", DEAL.glossier);
  const link = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "link", leadId: leadA.id, dealId: DEAL.glossier } });
  const linked = one("SELECT id, name, company, notes, stage, flair_os_id, flair_os_stage, flair_os_owner, contact_email FROM leads WHERE id = ?", leadA.id);
  const glossierRows = all("SELECT id FROM leads WHERE flair_os_id = ?", DEAL.glossier);
  const attachNow = one("SELECT lead_id FROM lead_attachments WHERE url = 'https://example.com/deck'");
  const todo3 = one("SELECT lead_id FROM todos WHERE flair_os_id = ?", TASK3);
  check("link: lead keeps its id and private note, takes the FLAIR OS fields", link.status === 200 && link.json?.folded === shellBefore?.id && linked?.flair_os_id === DEAL.glossier && linked?.notes === "v2test my private note" && linked?.flair_os_stage === "proposal-owed" && linked?.stage === "proposal" && linked?.company === "Glossier" && linked?.contact_email === "priya@glossier.com", { link: link.json, linked });
  check("link: exactly one row for the deal, and it is Sam's lead", glossierRows.length === 1 && glossierRows[0].id === leadA.id, glossierRows);
  check("link: attachment and the deal's task follow the lead", attachNow?.lead_id === leadA.id && todo3?.lead_id === leadA.id, { attachNow, todo3 });
  const linkLog = one("SELECT action, flair_os_id, local_id FROM flair_os_sync_log WHERE record_kind = 'link' ORDER BY id DESC LIMIT 1");
  check("link: decision is logged", linkLog?.action === "link" && linkLog?.flair_os_id === DEAL.glossier && linkLog?.local_id === leadA.id, linkLog);
  const afterLink = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  const linkedAfterPull = one("SELECT notes, flair_os_id FROM leads WHERE id = ?", leadA.id);
  check("link: the next pull does not recreate the deal and keeps the private note", afterLink.json?.ok && afterLink.json.deals.created === 0 && linkedAfterPull?.notes === "v2test my private note" && linkedAfterPull?.flair_os_id === DEAL.glossier && all("SELECT id FROM leads WHERE flair_os_id = ?", DEAL.glossier).length === 1, afterLink.json?.deals);
  const linkTwice = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "link", leadId: leadA.id, dealId: DEAL.celsius } });
  check("link: a linked lead cannot be linked again (409)", linkTwice.status === 409, linkTwice.status);

  // 18. Keep separate and undo.
  const sep = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "separate", leadId: leadC.id } });
  status = await cc("/api/flair-os/status");
  const cSep = (status.json?.reconciliation?.items ?? []).find((i) => i.id === leadC.id);
  check("keep separate: decision stored and counted", sep.status === 200 && cSep?.decision === "separate" && status.json?.reconciliation?.counts?.separate === 1, { sep: sep.status, cSep, counts: status.json?.reconciliation?.counts });
  const reset = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "reset", leadId: leadC.id } });
  status = await cc("/api/flair-os/status");
  const cReset = (status.json?.reconciliation?.items ?? []).find((i) => i.id === leadC.id);
  check("keep separate: undo clears the decision", reset.status === 200 && cReset?.decision === null && cReset?.verdict === "none", cReset);
  const lanePatch = await cc(`/api/leads/${leadB.id}`, { method: "PATCH", body: { stage: "qualified" } });
  check("lane leads stay ordinary Command Center leads (editable)", lanePatch.status === 200, lanePatch.status);
  const localCount = one("SELECT COUNT(*) AS n FROM leads WHERE business_id = 'flair' AND flair_os_id IS NULL AND notes LIKE 'v2test%'").n;
  check("nothing deleted by linking: the three other lane leads still exist", localCount === 3, localCount);
  for (const l of [leadB, leadC, leadD]) await cc(`/api/leads/${l.id}`, { method: "DELETE" });

  // 19. Phase A page: the "Your side" numbers come from the mirror and agree with the database.
  status = await cc("/api/flair-os/status");
  const ys = status.json?.your_side;
  const numeric = ["deals_owned", "active_deals", "tasks_open", "tasks_overdue", "checkins_overdue", "stage_moves_week", "contacted_week"];
  check("your side: status carries the block with every number", !!ys && ys.self_name === "Sam" && numeric.every((k) => typeof ys[k] === "number"), ys);
  const activeSql = "flair_os_id IS NOT NULL AND flair_os_missing_at IS NULL AND lower(coalesce(flair_os_sales_status, 'active')) NOT IN ('won', 'lost') AND stage NOT IN ('won', 'lost')";
  const dbOwned = one(`SELECT COUNT(*) AS n FROM leads WHERE ${activeSql} AND lower(coalesce(flair_os_owner, '')) LIKE '%sam%'`).n;
  const dbActive = one(`SELECT COUNT(*) AS n FROM leads WHERE ${activeSql}`).n;
  const dbTasks = one("SELECT COUNT(*) AS n FROM todos WHERE flair_os_id IS NOT NULL AND status = 'open' AND lower(coalesce(flair_os_assignee, '')) LIKE '%sam%'").n;
  const dbMoves = one(`SELECT COUNT(*) AS n FROM flair_os_sync_log WHERE at >= ? AND record_kind = 'deal' AND action = 'updated' AND result = 'ok' AND changes LIKE '%"field":"flair_os_stage"%'`, Date.now() - 7 * 86400000).n;
  check("your side: deals you own and active deals match the mirror", ys?.deals_owned === dbOwned && ys?.active_deals === dbActive && dbOwned >= 1 && dbActive > dbOwned, { ys, dbOwned, dbActive });
  check("your side: tasks assigned to Sam match the mirror", ys?.tasks_open === dbTasks && dbTasks >= 1, { tasks: ys?.tasks_open, dbTasks });
  check("your side: stage moves this week come from the field log", ys?.stage_moves_week === dbMoves && dbMoves >= 1, { moves: ys?.stage_moves_week, dbMoves });

  // 10. Pause blocks scheduled pulls, manual still works, resume.
  const pause = await cc("/api/flair-os/settings", { method: "PATCH", body: { pull_paused: true } });
  status = await cc("/api/flair-os/status");
  check("pause flag persists", pause.status === 200 && status.json?.state?.pull_paused === true, status.json?.state);
  const manualWhilePaused = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  check("manual pull still allowed while paused", manualWhilePaused.status === 200 && manualWhilePaused.json?.ok, manualWhilePaused.json?.error);
  await cc("/api/flair-os/settings", { method: "PATCH", body: { pull_paused: false } });
  status = await cc("/api/flair-os/status");
  check("resume clears the flag", status.json?.state?.pull_paused === false, status.json?.state);

  // 11. Runtime allowlist: every call the Command Center made was an allowlisted read.
  const calls = (await mock("/__test/calls")).calls;
  const used = [...new Set(calls.map((c) => c.tool))];
  check("Command Center only called allowlisted read tools", calls.length > 0 && calls.every((c) => c.allowed && c.scope === "command_center" && READ_ALLOWLIST.includes(c.tool)), { used, total: calls.length });
  check("every call carried the command_center key, never the full key", calls.every((c) => c.scope === "command_center"), used);

  // 12. The mock enforces scope like Tyler's P0 (denied tool with the CC key fails, works with the full key).
  const denied = await mcp(CC_KEY, "cleanup_pipeline_junk");
  const allowedFull = await mcp(FULL_KEY, "get_pipeline_counts");
  const noKey = await fetch(MOCK + "/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const deniedText = denied.json?.result?.content?.[0]?.text ?? "";
  check("mock: destructive tool refused for the command_center key", /not allowed for the Command Center MCP key/.test(deniedText), denied.json);
  const unusedCalled = calls.some((c) => ALLOWED_UNUSED.includes(c.tool));
  check("mirror never calls get_admin_stats even though the key allows it", !unusedCalled, used);
  check("mock: full key still works, missing key is 401", allowedFull.json?.result && noKey.status === 401, { full: allowedFull.status, noKey: noKey.status });

  // 13. Share token: read allowed, sync refused.
  await cc("/b/flair"); // ensures the share token exists
  const tokenRow = one("SELECT token FROM share_tokens WHERE business_id = 'flair'");
  if (tokenRow) {
    const shareStatus = await cc("/api/flair-os/status", { headers: { "x-share-token": tokenRow.token }, noCookie: true });
    const shareSync = await cc("/api/flair-os/sync", { method: "POST", body: {}, headers: { "x-share-token": tokenRow.token }, noCookie: true });
    const shareSettings = await cc("/api/flair-os/settings", { method: "PATCH", body: { pull_paused: true }, headers: { "x-share-token": tokenRow.token }, noCookie: true });
    const shareLink = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "separate", leadId: 1 }, headers: { "x-share-token": tokenRow.token }, noCookie: true });
    check("share token can read status but not sync, change settings, or decide links", shareStatus.status === 200 && shareStatus.json?.canSync === false && shareSync.status === 401 && shareSettings.status === 401 && shareLink.status === 401, { status: shareStatus.status, sync: shareSync.status, settings: shareSettings.status, link: shareLink.status });
    check("share status carries stage metadata and the reconciliation lane", Array.isArray(shareStatus.json?.stages) && shareStatus.json.stages.length === 13 && Array.isArray(shareStatus.json?.reconciliation?.items), { stages: shareStatus.json?.stages?.length });
  } else {
    check("share token can read status but not sync or change settings", false, "no share token row");
  }
  // Another business's share token must not read FLAIR OS status.
  const otherToken = one("SELECT token FROM share_tokens WHERE business_id != 'flair' LIMIT 1");
  if (otherToken) {
    const cross = await cc("/api/flair-os/status", { headers: { "x-share-token": otherToken.token }, noCookie: true });
    check("another business's share token is refused", cross.status === 401, cross.status);
  }
  const anon = await cc("/api/flair-os/status", { noCookie: true });
  check("anonymous request is refused", anon.status === 401, anon.status);

  // 13b. Writes are off on this server: every write route answers 409 writes_off and the mock sees no write call.
  await mock("/__test/calls/clear", {});
  status = await cc("/api/flair-os/status");
  check("status reports writeEnabled false on the read-only server", status.json?.writeEnabled === false, status.json?.writeEnabled);
  const offCreate = await cc("/api/flair-os/deals", { method: "POST", body: { company: "Writes Off Test" } });
  const offPatch = await cc(`/api/flair-os/deals/${DEAL.cbs}`, { method: "PATCH", body: { patch: { waitingOn: "nope" } } });
  const offNote = await cc(`/api/flair-os/deals/${DEAL.cbs}`, { method: "POST", body: { kind: "note", body: "nope" } });
  const offMerge = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "merge", leadId: 1, dealId: DEAL.cbs } });
  const offAdd = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "add", leadId: 1 } });
  check("writes off: create, edit, note, merge and add all answer 409 writes_off", [offCreate, offPatch, offNote, offMerge, offAdd].every((r) => r.status === 409 && r.json?.code === "writes_off"), [offCreate.status, offPatch.status, offNote.status, offMerge.status, offAdd.status]);
  const offCalls = (await mock("/__test/calls")).calls.filter((c) => WRITE_NAMES.includes(c.tool));
  check("writes off: the mock saw no write tool call", offCalls.length === 0, offCalls);

  // 14. Restore mock state for the browser walk-through.
  await mock("/__test/reset", {});

  const passed = results.filter((r) => r.ok).length;
  const out = { ran_at: new Date().toISOString(), cc: CC, mock: MOCK, passed, failed: results.length - passed, total: results.length, results };
  const dir = path.join(ROOT, "docs", "integrations", "results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "mirror-test-results.json"), JSON.stringify(out, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("test runner crashed:", e);
  process.exit(2);
});
