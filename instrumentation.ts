/**
 * Next.js instrumentation hook: runs once when the server boots.
 * Starts the FLAIR OS mirror scheduler (no-op when the integration is not configured).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFlairOsScheduler } = await import("./lib/flair-os/scheduler");
    startFlairOsScheduler();
  }
}
