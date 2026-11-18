/**
 * The only FLAIR OS MCP tools the Command Center may ever name.
 *
 * Two lists. The read list mirrors Tyler's command_center scope as issued
 * (ANSWERS_FOR_SAM.md, P0 item 1). The write list is the two-way scope from
 * docs/integrations/FLAIR_OS_TWO_WAY_PLAN.md section 4.1: the client refuses
 * every write unless FLAIR_OS_WRITE_ENABLED=1, and the real key refuses them
 * until Tyler widens it. scripts/flair-os-mock/test-mirror.mjs fails if a
 * write tool name appears anywhere under lib/flair-os other than this file,
 * write.ts and merge.ts, or if any name outside both lists appears at all.
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

export const FLAIR_OS_WRITE_TOOLS = [
  "create_pipeline_deal",
  "update_pipeline_deal",
  "update_pipeline_deal_contact",
  "add_pipeline_activity",
  "create_pipeline_task",
  "complete_pipeline_task",
  "upsert_meeting_note",
  "check_outreach_eligibility",
] as const;

export type FlairOsReadTool = (typeof FLAIR_OS_READ_TOOLS)[number];
export type FlairOsWriteTool = (typeof FLAIR_OS_WRITE_TOOLS)[number];
export type FlairOsTool = FlairOsReadTool | FlairOsWriteTool;

export function isAllowedReadTool(name: string): name is FlairOsReadTool {
  return (FLAIR_OS_READ_TOOLS as readonly string[]).includes(name);
}

export function isAllowedWriteTool(name: string): name is FlairOsWriteTool {
  return (FLAIR_OS_WRITE_TOOLS as readonly string[]).includes(name);
}

export function isAllowedTool(name: string): name is FlairOsTool {
  return isAllowedReadTool(name) || isAllowedWriteTool(name);
}

/**
 * Also allowed by Tyler's command_center scope (seen 2026-11-15) but not used
 * by the mirror: get_admin_stats. Listed so the status panel can explain it.
 */
export const FLAIR_OS_ALLOWED_UNUSED = ["get_admin_stats"] as const;
