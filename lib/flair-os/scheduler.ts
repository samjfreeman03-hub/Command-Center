import { flairOsConfigured, flairOsIntervalMinutes } from "./config";

/**
 * In-process scheduler for the FLAIR OS pull. The app is one Node process on
 * Railway with SQLite, so a setInterval here is the durable job runner for
 * now (the AI Brain Phase 1 runner replaces it later). Started once from
 * instrumentation.ts; a global guard survives dev hot reloads.
 */
const KEY = Symbol.for("command-center.flair-os.scheduler");

type Holder = { timer: NodeJS.Timeout | null; startedAt: number };

export function startFlairOsScheduler(): void {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  if (g[KEY]) return;
  if (!flairOsConfigured() || process.env.FLAIR_OS_SYNC_ENABLED === "0") return;
  const minutes = flairOsIntervalMinutes();
  if (minutes <= 0) {
    g[KEY] = { timer: null, startedAt: Date.now() };
    return;
  }
  const tick = async () => {
    try {
      const { runMirrorCycle } = await import("./sync");
      await runMirrorCycle({ trigger: "schedule" });
    } catch (e) {
      console.error("[flair-os] scheduled pull failed:", (e as Error).message);
    }
  };
  const timer = setInterval(tick, minutes * 60_000);
  timer.unref?.();
  g[KEY] = { timer, startedAt: Date.now() };
  // First pull shortly after boot so the page is fresh without waiting a full interval.
  setTimeout(tick, 15_000).unref?.();
}

export function schedulerInfo(): { running: boolean; intervalMinutes: number } {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  return { running: !!g[KEY]?.timer, intervalMinutes: flairOsIntervalMinutes() };
}
