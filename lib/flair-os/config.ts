/**
 * FLAIR OS mirror: per-business flag and server environment.
 *
 * Server-only (reads process.env). Pages compute `flairOsEnabled(slug)` and
 * pass the result to client components as a prop, the same way the other
 * per-business flags are gated in both views and in the API.
 *
 * Environment (Railway only, never in the browser or the repository):
 *   FLAIR_OS_MCP_URL          https://<flair-os host>/api/mcp
 *   FLAIR_OS_MCP_KEY          the Command Center key Tyler issues (scope command_center)
 *   FLAIR_OS_SYNC_ENABLED     "0" turns the whole integration off (default on when URL+KEY exist)
 *   FLAIR_OS_SYNC_DRY_RUN     "1" logs what would change and writes nothing
 *   FLAIR_OS_SYNC_INTERVAL_MIN  minutes between scheduled pulls (default 5, 0 = manual only)
 *   FLAIR_OS_MIN_GAP_MS       minimum gap between MCP calls (default 1000)
 */
export const FLAIR_OS_BUSINESS_ID = "flair";

export function flairOsConfigured(): boolean {
  return !!process.env.FLAIR_OS_MCP_URL && !!process.env.FLAIR_OS_MCP_KEY;
}

export function flairOsEnabled(businessId: string): boolean {
  return (
    businessId === FLAIR_OS_BUSINESS_ID &&
    flairOsConfigured() &&
    process.env.FLAIR_OS_SYNC_ENABLED !== "0"
  );
}

export function flairOsDryRunDefault(): boolean {
  return process.env.FLAIR_OS_SYNC_DRY_RUN === "1";
}

export function flairOsIntervalMinutes(): number {
  const raw = process.env.FLAIR_OS_SYNC_INTERVAL_MIN;
  if (raw === undefined || raw === "") return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}
