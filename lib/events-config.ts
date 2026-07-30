/**
 * Per-business Events feature flag.
 *
 * The Events tab (plan + track hosted events, with partners, sponsors, and
 * links) is enabled per business. Businesses not listed here don't get the
 * tab, the API rejects them, and the chat agent doesn't get event tools.
 */
export const EVENTS_BUSINESS_IDS = ["techspace", "mtrnm", "flair"];

export function eventsEnabled(businessId: string): boolean {
  return EVENTS_BUSINESS_IDS.includes(businessId);
}
