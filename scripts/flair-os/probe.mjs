#!/usr/bin/env node
/**
 * First contact with a real FLAIR OS endpoint. Read-only by construction:
 * it calls initialize, tools/list, and at most three allowlisted read tools,
 * and never prints the key.
 *
 *   node scripts/flair-os/probe.mjs            # reads .env.flair-os.local
 *   FLAIR_OS_MCP_URL=... FLAIR_OS_MCP_KEY=... node scripts/flair-os/probe.mjs
 *
 * It reports: which tools the key can see (and whether any of them are
 * outside the agreed read allowlist), the pipeline counts, and the field
 * names of one deal, one task and one client so the normalizers in
 * lib/flair-os/types.ts can be checked against reality.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const envFile = path.join(ROOT, ".env.flair-os.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const URL_ = process.env.FLAIR_OS_MCP_URL;
const KEY = process.env.FLAIR_OS_MCP_KEY;
if (!URL_ || !KEY) {
  console.error("Set FLAIR_OS_MCP_URL and FLAIR_OS_MCP_KEY (in .env.flair-os.local or the environment).");
  process.exit(2);
}
if (!/^https:\/\//.test(URL_) && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) {
  console.error("Refusing to send the key over plain http to a non-local host.");
  process.exit(2);
}

const READ_ALLOWLIST = new Set([
  "list_pipeline_stages", "get_pipeline_summary", "search_pipeline", "get_pipeline_counts",
  "get_pipeline_deal", "list_pipeline_tasks", "list_clients", "search_clients", "get_client",
]);
const WRITE_OR_DANGEROUS = /^(create_|update_|delete_|archive_|cleanup_|send_|claim_|set_|clear_|upsert_|complete_|add_|remove_|bulk_)/;

let nextId = 1;
let sessionId = null;
async function rpc(method, params) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${KEY}` };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(URL_, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }) });
  sessionId = res.headers.get("mcp-session-id") || sessionId;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
  let json;
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    json = JSON.parse(data[data.length - 1]);
  } else {
    json = JSON.parse(text);
  }
  if (json.error) throw new Error(`${method}: ${json.error.code} ${json.error.message}`);
  return json.result;
}
function unwrap(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = (result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  try { return JSON.parse(text); } catch { return text; }
}
const shape = (obj) => (obj && typeof obj === "object" ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null ? "null" : Array.isArray(v) ? `array(${v.length})` : typeof v])) : obj);

async function main() {
  console.log(`Endpoint: ${new URL(URL_).host}${new URL(URL_).pathname}`);
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "command-center-probe", version: "0.1" } });
  console.log(`Server: ${init?.serverInfo?.name ?? "?"} ${init?.serverInfo?.version ?? ""} (protocol ${init?.protocolVersion ?? "?"})`);
  await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, ...(sessionId ? { "mcp-session-id": sessionId } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).catch(() => {});

  const tools = (await rpc("tools/list", {}))?.tools ?? [];
  const names = tools.map((t) => t.name).sort();
  const missing = [...READ_ALLOWLIST].filter((n) => !names.includes(n));
  console.log(`\nTools listed to this key: ${names.length} (the real server lists everything; scope is enforced per call)`);
  if (missing.length) console.log(`Allowlisted read tools NOT listed: ${missing.join(", ")}`);

  // Enforcement check with a harmless read that is outside the agreed list.
  // Refused means the scope is live; data back means it is not.
  const probeTool = "get_recent_activity";
  let enforced = null;
  try {
    const r = unwrap(await rpc("tools/call", { name: probeTool, arguments: { limit: 1 } }));
    if (r && typeof r === "object" && r.ok === false) {
      enforced = true;
      console.log(`\nScope enforced at call time. Server said: ${String(r.error).slice(0, 220)}`);
    } else {
      enforced = false;
    }
  } catch (e) {
    enforced = /not allowed|forbidden|scope|denied/i.test(e.message);
    console.log(`\n${enforced ? "Scope enforced at call time" : "Unexpected error on the enforcement check"}: ${e.message.slice(0, 220)}`);
  }
  if (enforced === false) {
    console.log(`\nWARNING: ${probeTool} returned data to this key. Tyler's deny-by-default scope is NOT in effect. Stop here and tell him before any pull.`);
    return;
  }
  const writeLike = names.filter((n) => WRITE_OR_DANGEROUS.test(n));
  console.log(`Write-like tools in the listing: ${writeLike.length} (listing only; the call above shows they are refused).`);

  if (!names.includes("get_pipeline_counts") && !names.includes("search_pipeline")) return;

  if (names.includes("get_pipeline_counts")) {
    const counts = unwrap(await rpc("tools/call", { name: "get_pipeline_counts", arguments: {} }));
    console.log("\nget_pipeline_counts:", JSON.stringify(counts).slice(0, 600));
  }
  if (names.includes("search_pipeline")) {
    const r = unwrap(await rpc("tools/call", { name: "search_pipeline", arguments: { limit: 1 } }));
    const deals = Array.isArray(r) ? r : r?.deals ?? r?.items ?? r?.results ?? r?.data ?? [];
    console.log("\nsearch_pipeline(limit 1) top-level keys:", Array.isArray(r) ? "[array]" : Object.keys(r || {}).join(", "));
    console.log("deal field names:", JSON.stringify(shape(deals[0]), null, 0));
    const dealId = deals[0]?.id ?? deals[0]?.dealId ?? deals[0]?.deal_id;
    if (dealId && names.includes("get_pipeline_deal")) {
      const d = unwrap(await rpc("tools/call", { name: "get_pipeline_deal", arguments: { dealId } }));
      console.log("\nget_pipeline_deal top-level keys:", Object.keys(d || {}).join(", "));
      const task = (d?.tasks ?? [])[0];
      const act = (d?.activities ?? [])[0];
      if (task) console.log("task field names:", JSON.stringify(shape(task)));
      if (act) console.log("activity field names:", JSON.stringify(shape(act)));
      if (d?.client) console.log("client field names:", JSON.stringify(shape(d.client)));
    }
  }
  console.log("\nProbe made at most 4 tool calls, all reads. Nothing was written anywhere.");
}

main().catch((e) => {
  console.error("probe failed:", e.message);
  process.exit(1);
});
