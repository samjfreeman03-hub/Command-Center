/**
 * The only FLAIR OS MCP tools the Command Center may ever name.
 *
 * Mirrors Tyler's command_center scope (ANSWERS_FOR_SAM.md, P0 item 1) and
 * the field contract, section 2. The client refuses anything else at the type
 * level and again at runtime, and scripts/flair-os-mock/test-mirror.mjs
 * fails if a denied name appears anywhere under lib/flair-os.
 */
export const FLAIR_OS_READ_TOOLS = [
  "list_pipeline_stages",
  "get_pipeline_summary",
  "search_pipeline",
  "get_pipeline_counts",
  "get_pipeline_deal",
  "list_pipeline_tasks",
  "list_clients",
  "search_clients",
  "get_client",
] as const;

export type FlairOsReadTool = (typeof FLAIR_OS_READ_TOOLS)[number];

/**
 * Phase 2 write allowlist. Listed so the contract is visible in code, but
 * nothing in phase 1 can call these: `FlairOsClient.call` only accepts a
 * `FlairOsReadTool`.
 */
export const FLAIR_OS_WRITE_TOOLS_PHASE_2 = [
  "create_pipeline_deal",
  "update_pipeline_deal",
  "add_pipeline_activity",
  "create_pipeline_task",
  "complete_pipeline_task",
  "upsert_meeting_note",
] as const;

export function isAllowedReadTool(name: string): name is FlairOsReadTool {
  return (FLAIR_OS_READ_TOOLS as readonly string[]).includes(name);
}

/**
 * Also allowed by Tyler's command_center scope (seen 2026-11-15) but not used
 * by the mirror: get_admin_stats. Listed so the status panel can explain it.
 */
export const FLAIR_OS_ALLOWED_UNUSED = ["get_admin_stats"] as const;
