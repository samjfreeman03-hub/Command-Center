/**
 * Per-business pipeline feature flags.
 *
 * Lead categories (custom, user-defined buckets for pipeline leads) are a
 * test feature scoped to specific businesses. Only businesses listed here get
 * the category UI + API; everyone else's pipeline is unchanged.
 */
export const LEAD_CATEGORY_BUSINESS_IDS = ["stealth"];

export function leadCategoriesEnabled(businessId: string): boolean {
  return LEAD_CATEGORY_BUSINESS_IDS.includes(businessId);
}
