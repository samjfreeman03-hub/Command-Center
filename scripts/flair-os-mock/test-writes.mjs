#!/usr/bin/env node
/**
 * Two-way test: drives a WRITE-ENABLED Command Center against the synthetic
 * FLAIR OS server (write-scoped key) and checks that every change made here
 * lands in FLAIR OS first and is mirrored back. Needs both servers running:
 *
 *   PORT=3777 MOCK_TEST_HOOKS=1 node scripts/flair-os-mock/server.mjs
 *   ADMIN_PASSWORD=cc-ui-preview-2026 PORT=3007 FLAIR_OS_MCP_URL=http://127.0.0.1:3777/api/mcp \
 *     FLAIR_OS_MCP_KEY=cc-write-key FLAIR_OS_WRITE_ENABLED=1 FLAIR_OS_SYNC_INTERVAL_MIN=0 FLAIR_OS_MIN_GAP_MS=50 npm run dev
 *
 *   node scripts/flair-os-mock/test-writes.mjs
 *
 * Writes docs/integrations/results/writes-test-results.json and exits
 * non-zero on any failure. Only ever points at the mock.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const Database = require(path.join(ROOT, "node_modules", "better-sqlite3"));

const CC = process.env.CC_URL || "http://127.0.0.1:3007";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:3777";
const PASSWORD = process.env.CC_PASSWORD || "cc-ui-preview-2026";
const DB_PATH = process.env.CC_DB || path.join(ROOT, "data", "command-center.db");
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(MOCK)) throw new Error("test-writes only runs against the local mock");

const WRITE_NAMES = ["create_pipeline_deal", "update_pipeline_deal", "update_pipeline_deal_contact", "add_pipeline_activity", "create_pipeline_task", "complete_pipeline_task", "upsert_meeting_note", "check_outreach_eligibility"];
const AGENT = "CommandCenter";

const results = [];
let cookie = "";
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`);
}
async function cc(pathname, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (cookie && init.noCookie !== true) headers.cookie = cookie;
  if (init.body && typeof init.body !== "string") { init.body = JSON.stringify(init.body); headers["content-type"] = "application/json"; }
  const res = await fetch(CC + pathname, { ...init, headers, redirect: "manual" });
  let json = null;
  try { json = await res.clone().json(); } catch { /* not json */ }
  return { status: res.status, json };
}
async function mock(pathname, body) {
  const res = await fetch(MOCK + pathname, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}
const db = () => new Database(DB_PATH, { readonly: true, fileMustExist: true });
const one = (sql, ...args) => { const d = db(); try { return d.prepare(sql).get(...args); } finally { d.close(); } };
const all = (sql, ...args) => { const d = db(); try { return d.prepare(sql).all(...args); } finally { d.close(); } };
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
      DELETE FROM leads WHERE business_id = 'flair' AND flair_os_id IS NULL AND notes LIKE 'w2test%';
      UPDATE flair_os_sync_state SET pull_paused = 0, last_run_at = NULL, last_ok_at = NULL, last_error = NULL, last_summary = NULL;`);
  } finally { d.close(); }
}
const writeCalls = async () => (await mock("/__test/calls")).calls.filter((c) => WRITE_NAMES.includes(c.tool));

const DEAL = {
  cbs: "d0000000-0000-4000-8000-000000000001",
  forever21: "d0000000-0000-4000-8000-000000000002",
  glossier: "d0000000-0000-4000-8000-000000000003",
  celsius: "d0000000-0000-4000-8000-000000000004",
  bumble: "d0000000-0000-4000-8000-000000000011",
};

async function main() {
  // 0. Servers up, login, clean slate.
  const ping = await mock("/__test/state").catch(() => null);
  check("mock reachable with test hooks", !!ping && ping.deals === 15, ping);
  const login = await fetch(CC + "/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
  cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  check("admin login", login.ok && cookie.startsWith("cc_session="), login.status);
  await mock("/__test/reset", {});
  await mock("/__test/calls/clear", {});
  resetMirror();

  // 1. Status says two-way is on; a pull fills the mirror.
  let status = await cc("/api/flair-os/status");
  check("status reports writeEnabled true", status.status === 200 && status.json?.writeEnabled === true && status.json?.dryRunDefault === false, { write: status.json?.writeEnabled, dry: status.json?.dryRunDefault });
  const pull = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  check("pull mirrors 15 deals", pull.status === 200 && pull.json?.ok && pull.json.deals.created === 15, pull.json?.deals);
  check("pull made no write calls", (await writeCalls()).length === 0, await writeCalls());
  const leadOf = (dealId) => one("SELECT * FROM leads WHERE flair_os_id = ?", dealId);

  // 2. Edit a deal: FLAIR OS first, mirror after.
  await mock("/__test/calls/clear", {});
  const edit = await cc(`/api/flair-os/deals/${DEAL.forever21}`, { method: "PATCH", body: { patch: { contactName: "Dana Kim-Park", waitingOn: "Intro deck", nextCheckInAt: "2026-12-01", dealValue: 12500 } } });
  const f21 = leadOf(DEAL.forever21);
  const f21Mock = (await mock(`/__test/deal?id=${DEAL.forever21}`)).deal;
  check("edit: route returns the refreshed lead", edit.status === 200 && edit.json?.ok && edit.json.lead?.flair_os_id === DEAL.forever21, edit.json);
  check("edit: FLAIR OS holds the new values", f21Mock?.contact_name === "Dana Kim-Park" && f21Mock?.waiting_on === "Intro deck" && f21Mock?.next_check_in_at === "2026-12-01" && f21Mock?.deal_value === 12500, f21Mock);
  check("edit: mirror row matches FLAIR OS", f21?.contact_name === "Dana Kim-Park" && f21?.next_action === "Intro deck" && f21?.next_action_date === "2026-12-01" && f21?.value_cents === 1250000, f21);
  const editCalls = await writeCalls();
  check("edit: exactly one update_pipeline_deal call, agent CommandCenter", editCalls.length === 1 && editCalls[0].tool === "update_pipeline_deal" && editCalls[0].allowed === true, editCalls);
  check("edit: FLAIR OS recorded the agent", f21Mock?.source_agent === AGENT, f21Mock?.source_agent);
  const editLog = one("SELECT * FROM flair_os_sync_log WHERE direction = 'push' AND record_kind = 'deal' AND action = 'update' AND flair_os_id = ? ORDER BY id DESC", DEAL.forever21);
  check("edit: push log entry with field changes", !!editLog && editLog.result === "ok" && JSON.parse(editLog.changes || "[]").some((c) => c.field === "contact_name"), editLog);

  // 2b. Stage move goes through and the rollup follows.
  const move = await cc(`/api/flair-os/deals/${DEAL.forever21}`, { method: "PATCH", body: { patch: { stageSlug: "engaged" } } });
  const f21b = leadOf(DEAL.forever21);
  check("edit: stage move lands in FLAIR OS and the rollup follows", move.status === 200 && f21b?.flair_os_stage === "engaged" && f21b?.stage === "qualified", { status: move.status, stage: f21b?.flair_os_stage, rollup: f21b?.stage });
  const badStage = await cc(`/api/flair-os/deals/${DEAL.forever21}`, { method: "PATCH", body: { patch: { stageSlug: "proposal-owed" } } });
  check("edit: a slug FLAIR OS rejects comes back as a FLAIR OS error, nothing changed locally", badStage.status === 502 && leadOf(DEAL.forever21).flair_os_stage === "engaged", badStage.json);
  const badValue = await cc(`/api/flair-os/deals/${DEAL.forever21}`, { method: "PATCH", body: { patch: { dealValue: "lots" } } });
  check("edit: non-numeric deal value is a 400 before any call", badValue.status === 400, badValue.status);

  // 3. Note on the timeline.
  await mock("/__test/calls/clear", {});
  const note = await cc(`/api/flair-os/deals/${DEAL.glossier}`, { method: "POST", body: { kind: "note", body: "Spoke with Priya, wants Q1 timing", noteKind: "call", touchContact: true } });
  const acts = (await mock(`/__test/activities?dealId=${DEAL.glossier}`)).activities;
  const glossier = leadOf(DEAL.glossier);
  const localActs = all("SELECT * FROM flair_os_activities WHERE flair_os_deal_id = ?", DEAL.glossier);
  check("note: created in FLAIR OS with kind call and agent CommandCenter", note.status === 201 && acts.length === 1 && acts[0].kind === "call" && acts[0].agent === AGENT && acts[0].body.includes("Priya"), acts);
  check("note: route returns the local timeline including it", Array.isArray(note.json?.activities) && note.json.activities.length === 1, note.json?.activities?.length);
  check("note: kept locally with the FLAIR OS id", localActs.length === 1 && localActs[0].id === acts[0].id, localActs);
  check("note: touchContact refreshed last contacted", typeof glossier?.flair_os_last_contacted_at === "number" && Date.now() - glossier.flair_os_last_contacted_at < 60_000, glossier?.flair_os_last_contacted_at);
  const emptyNote = await cc(`/api/flair-os/deals/${DEAL.glossier}`, { method: "POST", body: { kind: "note", body: "   " } });
  check("note: empty body is a 400", emptyNote.status === 400, emptyNote.status);

  // 4. Task: created in FLAIR OS, mirrored as a todo, completed from here.
  await mock("/__test/calls/clear", {});
  const task = await cc(`/api/flair-os/deals/${DEAL.celsius}`, { method: "POST", body: { kind: "task", title: "Send ambassador brief", dueAt: "2026-11-25", notes: "w2test" } });
  const mockTasks = (await mock(`/__test/tasks?dealId=${DEAL.celsius}`)).tasks;
  const newTask = mockTasks.find((t) => t.title === "Send ambassador brief");
  const todo = task.json?.todoId ? one("SELECT * FROM todos WHERE id = ?", task.json.todoId) : null;
  check("task: created in FLAIR OS on the deal", task.status === 201 && !!newTask && newTask.agent === AGENT, { status: task.status, newTask });
  check("task: mirrored as a todo with the FLAIR OS id and lead", !!todo && todo.flair_os_id === newTask?.id && todo.due_date === "2026-11-25" && todo.lead_id === leadOf(DEAL.celsius)?.id && todo.status === "open", todo);
  const done = await cc(`/api/todos/${task.json?.todoId}`, { method: "PATCH", body: { status: "done" } });
  const doneMock = (await mock(`/__test/tasks?dealId=${DEAL.celsius}`)).tasks.find((t) => t.id === newTask?.id);
  const doneTodo = one("SELECT * FROM todos WHERE id = ?", task.json?.todoId);
  check("task: ticking the todo completes it in FLAIR OS first", done.status === 200 && doneMock?.status === "done" && doneTodo?.status === "done", { status: done.status, mock: doneMock?.status, todo: doneTodo?.status });
  const rename = await cc(`/api/todos/${task.json?.todoId}`, { method: "PATCH", body: { title: "renamed" } });
  check("task: other edits to a mirrored todo still answer 409", rename.status === 409 && rename.json?.code === "flair_os_managed", rename.status);
  const taskCalls = await writeCalls();
  check("task: create_pipeline_task then complete_pipeline_task", taskCalls.map((c) => c.tool).join(",") === "create_pipeline_task,complete_pipeline_task", taskCalls.map((c) => c.tool));

  // 5. Merge: Sam's lead into a FLAIR OS deal, gaps written, conflict kept FLAIR OS's by default.
  await mock("/__test/calls/clear", {});
  const mk = await cc("/api/leads", { method: "POST", body: { business_id: "flair", name: "Marco Alvarez", company: "Celsius", contact_email: "marco.alvarez@celsius.com", stage: "proposal", value_cents: 5500000, next_action: "Send proposal v2", next_action_date: "2026-11-28", notes: "w2test Marco wants campus-first; **budget** confirmed" } });
  check("merge: created a Command Center-only lead", mk.status === 201 || mk.status === 200, mk.status);
  const leadId = mk.json?.id;
  // Make the FLAIR OS side disagree on company casing so there is a conflict, and empty on value.
  await mock("/__test/mutate", { dealId: DEAL.celsius, patch: { company: "CELSIUS Holdings", deal_value: null, waiting_on: null } });
  await cc("/api/flair-os/sync", { method: "POST", body: {} });
  const cmp = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "compare", leadId, dealId: DEAL.celsius } });
  const fields = cmp.json?.comparison?.fields ?? [];
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  check("merge: compare shows company conflict, value gap, email same, stage ahead", cmp.status === 200 && byKey.company?.state === "conflict" && byKey.value_cents?.state === "gap" && byKey.contact_email?.state === "same" && cmp.json.comparison.stage.ccAhead === true && cmp.json.comparison.taskCandidate?.dueAt === "2026-11-28", { byKey: Object.fromEntries(fields.map((f) => [f.key, f.state])), stage: cmp.json?.comparison?.stage });
  check("merge: note preview has the markup stripped", cmp.json?.comparison?.notePreview?.includes("budget confirmed") && !cmp.json.comparison.notePreview.includes("**"), cmp.json?.comparison?.notePreview);
  const merge = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "merge", leadId, dealId: DEAL.celsius, choices: { fields: {}, pushNote: true, pushTask: true, moveStage: false } } });
  const celsiusMock = (await mock(`/__test/deal?id=${DEAL.celsius}`)).deal;
  const celsiusActs = (await mock(`/__test/activities?dealId=${DEAL.celsius}`)).activities;
  const celsiusTasks = (await mock(`/__test/tasks?dealId=${DEAL.celsius}`)).tasks;
  const merged = one("SELECT * FROM leads WHERE id = ?", leadId);
  check("merge: route ok, lead folded onto the deal", merge.status === 200 && merge.json?.ok && merged?.flair_os_id === DEAL.celsius && merge.json.folded !== null, merge.json);
  check("merge: gap written (value, waiting on), conflict kept FLAIR OS's company", celsiusMock?.deal_value === 55000 && celsiusMock?.waiting_on === "Send proposal v2" && celsiusMock?.company === "CELSIUS Holdings" && celsiusMock?.stage === "ambassador-sourcing", celsiusMock);
  check("merge: note posted on the FLAIR OS timeline with the Command Center header", celsiusActs.some((a) => a.body.startsWith("From Command Center (Sam)") && a.body.includes("budget confirmed") && a.agent === AGENT), celsiusActs.map((a) => a.body));
  check("merge: next action became a FLAIR OS task", celsiusTasks.some((t) => t.title === "Send proposal v2" && t.due_at.startsWith("2026-11-28")), celsiusTasks.map((t) => t.title));
  check("merge: mirror row carries FLAIR OS's values and Sam's note stays", merged?.company === "CELSIUS Holdings" && merged?.value_cents === 5500000 && merged?.notes?.startsWith("w2test"), merged);
  check("merge: only one mirror row for the deal", one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id = ?", DEAL.celsius).n === 1, null);
  const mergeLog = one("SELECT * FROM flair_os_sync_log WHERE direction = 'push' AND action = 'merge' AND local_id = ?", leadId);
  check("merge: push log entry", !!mergeLog && mergeLog.message.includes("note posted") && mergeLog.message.includes("task created"), mergeLog?.message);
  const mergeTools = (await writeCalls()).map((c) => c.tool);
  check("merge: update, activity, task in that order", mergeTools.join(",") === "update_pipeline_deal,add_pipeline_activity,create_pipeline_task", mergeTools);

  // 5b. Merge choosing Sam's value for a conflict and moving the stage.
  const mk2 = await cc("/api/leads", { method: "POST", body: { business_id: "flair", name: "Sophie Hart", company: "Bumble Inc", contact_email: "sophie@bumble.com", stage: "won", notes: "w2test won it" } });
  const lead2 = mk2.json?.id;
  await mock("/__test/calls/clear", {});
  const merge2 = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "merge", leadId: lead2, dealId: DEAL.bumble, choices: { fields: { company: "cc" }, pushNote: false, pushTask: false, moveStage: true } } });
  const bumbleMock = (await mock(`/__test/deal?id=${DEAL.bumble}`)).deal;
  const merged2 = one("SELECT * FROM leads WHERE id = ?", lead2);
  check("merge: chosen conflict writes Sam's company and the stage moves to campaign", merge2.status === 200 && bumbleMock?.company === "Bumble Inc" && bumbleMock?.stage === "campaign" && merged2?.flair_os_stage === "campaign" && merged2?.stage === "won", { mock: bumbleMock?.company, stage: bumbleMock?.stage, local: merged2?.stage });
  check("merge: no note or task when unticked", (await writeCalls()).map((c) => c.tool).join(",") === "update_pipeline_deal", (await writeCalls()).map((c) => c.tool));

  // 6. Add to FLAIR OS: new deal born there, then linked; dedupe path links instead.
  await mock("/__test/calls/clear", {});
  const dealsBefore = (await mock("/__test/state")).deals;
  const mk3 = await cc("/api/leads", { method: "POST", body: { business_id: "flair", name: "Taylor Reed", company: "Olipop", contact_email: "taylor@olipop.example", stage: "qualified", next_action: "Book call", next_action_date: "2026-12-03", notes: "w2test " + "x".repeat(450) } });
  const lead3 = mk3.json?.id;
  const add = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "add", leadId: lead3 } });
  const dealsAfter = (await mock("/__test/state")).deals;
  const olipop = (await mock("/__test/deals")).deals.find((d) => d.company === "Olipop");
  const added = one("SELECT * FROM leads WHERE id = ?", lead3);
  check("add: one new deal in FLAIR OS, source command_center, agent CommandCenter", add.status === 200 && add.json?.ok && dealsAfter === dealsBefore + 1 && olipop?.source === "command_center" && olipop?.source_agent === AGENT, { status: add.status, before: dealsBefore, after: dealsAfter, olipop });
  check("add: stage mapped qualified to engaged, lead linked to the new deal", olipop?.stage === "engaged" && added?.flair_os_id === olipop?.id && added?.flair_os_stage === "engaged", { stage: olipop?.stage, linked: added?.flair_os_id === olipop?.id });
  const olipopFull = (await mock(`/__test/deal?id=${olipop?.id}`)).deal;
  const olipopActs = (await mock(`/__test/activities?dealId=${olipop?.id}`)).activities;
  const olipopTasks = (await mock(`/__test/tasks?dealId=${olipop?.id}`)).tasks;
  check("add: long notes went to the timeline, waiting on and task set", olipopFull?.notes === null && olipopActs.length === 1 && olipopFull?.waiting_on === "Book call" && olipopTasks.some((t) => t.title === "Book call"), { notes: olipopFull?.notes, acts: olipopActs.length, waiting: olipopFull?.waiting_on, tasks: olipopTasks.length });
  check("add: contact email and name carried", olipopFull?.email === "taylor@olipop.example" && olipopFull?.contact_name === "Taylor Reed", { email: olipopFull?.email, contact: olipopFull?.contact_name });
  check("add: only one mirror row for the new deal", one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id = ?", olipop?.id).n === 1, null);
  // Dedupe: same company again without forceCreate links to the existing deal.
  const mk4 = await cc("/api/leads", { method: "POST", body: { business_id: "flair", name: "Olipop", stage: "new", notes: "w2test dupe" } });
  const add2 = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "add", leadId: mk4.json?.id } });
  check("add: duplicate company is deduped by FLAIR OS and reported", add2.status === 200 && add2.json?.deduped === true && add2.json.dealId === olipop?.id && (await mock("/__test/state")).deals === dealsAfter, add2.json);
  check("add: the deduped lead is linked, still one mirror row", one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id = ?", olipop?.id).n === 1 && one("SELECT flair_os_id FROM leads WHERE id = ?", mk4.json?.id)?.flair_os_id === olipop?.id, null);
  // forceCreate makes a second one with an opportunity name.
  const mk5 = await cc("/api/leads", { method: "POST", body: { business_id: "flair", name: "Olipop", stage: "proposal", notes: "w2test second deal" } });
  const add3 = await cc("/api/flair-os/reconcile", { method: "POST", body: { action: "add", leadId: mk5.json?.id, forceCreate: true, opportunityName: "Olipop spring sampling" } });
  check("add: forceCreate makes a second Olipop deal with the opportunity name", add3.status === 200 && add3.json?.deduped === false && add3.json.dealId !== olipop?.id && (await mock("/__test/state")).deals === dealsAfter + 1 && (await mock(`/__test/deal?id=${add3.json?.dealId}`)).deal?.opportunity_name === "Olipop spring sampling", add3.json);

  // 7. New deal from the pipeline form path (POST /api/flair-os/deals).
  await mock("/__test/calls/clear", {});
  const create = await cc("/api/flair-os/deals", { method: "POST", body: { company: "Poppi", contactName: "Jordan Blake", email: "jordan@poppi.example", stageSlug: "outreach", notes: "w2test from form" } });
  const poppi = (await mock("/__test/deals")).deals.find((d) => d.company === "Poppi");
  check("new deal: 201, born in FLAIR OS, mirrored as a lead", create.status === 201 && create.json?.lead?.flair_os_id === poppi?.id && one("SELECT COUNT(*) AS n FROM leads WHERE flair_os_id = ?", poppi?.id).n === 1, create.json);
  const noCompany = await cc("/api/flair-os/deals", { method: "POST", body: { contactName: "x" } });
  check("new deal: missing company is a 400", noCompany.status === 400, noCompany.status);

  // 8. The pull after all this is a no-op: both sides agree.
  await mock("/__test/calls/clear", {});
  const pull2 = await cc("/api/flair-os/sync", { method: "POST", body: {} });
  check("pull after writes: nothing changed, nothing missing", pull2.json?.ok && pull2.json.deals.updated === 0 && pull2.json.deals.created === 0 && pull2.json.deals.missing === 0, pull2.json?.deals);
  check("pull after writes: no write calls", (await writeCalls()).length === 0, null);

  // 9. Guards: share token and anonymous cannot write; a non-allowlisted tool never leaves the client.
  const share = one("SELECT token FROM share_tokens WHERE business_id = 'flair' LIMIT 1");
  if (share) {
    const sh = await cc(`/api/flair-os/deals/${DEAL.cbs}`, { method: "PATCH", headers: { "x-share-token": share.token }, body: { patch: { waitingOn: "nope" } }, noCookie: true });
    const sh2 = await cc("/api/flair-os/deals", { method: "POST", headers: { "x-share-token": share.token }, body: { company: "Nope" }, noCookie: true });
    check("share token cannot edit or create", sh.status === 401 && sh2.status === 401, [sh.status, sh2.status]);
  }
  const anon = await cc(`/api/flair-os/deals/${DEAL.cbs}`, { method: "PATCH", body: { patch: { waitingOn: "nope" } }, noCookie: true });
  check("anonymous cannot edit", anon.status === 401, anon.status);
  const unknownDeal = await cc(`/api/flair-os/deals/not-a-deal`, { method: "PATCH", body: { patch: { waitingOn: "x" } } });
  check("unknown deal id is a FLAIR OS not-found, nothing created locally", (unknownDeal.status === 404 || unknownDeal.status === 502) && !one("SELECT id FROM leads WHERE flair_os_id = 'not-a-deal'"), unknownDeal.status);
  const everWrite = (await mock("/__test/calls")).calls.filter((c) => c.allowed === false);
  check("the mock never saw a call outside the write key's scope", everWrite.length === 0, everWrite);

  // 10. Clean up test leads and restore the mock for a browser look.
  const d = new Database(DB_PATH, { fileMustExist: true });
  try { d.exec("DELETE FROM leads WHERE business_id = 'flair' AND notes LIKE 'w2test%'"); } finally { d.close(); }

  const passed = results.filter((r) => r.ok).length;
  const out = { ran_at: new Date().toISOString(), cc: CC, mock: MOCK, passed, failed: results.length - passed, total: results.length, results };
  const dir = path.join(ROOT, "docs", "integrations", "results");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "writes-test-results.json"), JSON.stringify(out, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("test runner crashed:", e);
  process.exit(2);
});
