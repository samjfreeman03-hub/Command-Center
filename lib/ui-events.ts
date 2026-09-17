/** Window events used to coordinate client components that don't share a parent. */

/** Dispatch after creating/completing/deleting todos so the sidebar counts stay live. */
export const NAV_REFRESH_EVENT = "cc:refresh-nav";

/** Dispatch to open the command palette from anywhere. */
export const OPEN_PALETTE_EVENT = "cc:open-palette";

export function refreshNav() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_REFRESH_EVENT));
}
