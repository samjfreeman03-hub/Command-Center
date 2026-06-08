import type { CandidateContact } from "./types";

/**
 * Apollo.io API client (server-side only — never import in client components).
 *
 * Docs: https://docs.apollo.io/reference
 * Requires: Apollo Basic / Pro / Org plan (API access NOT included on Free tier).
 *
 * Endpoints we use:
 *   - POST /api/v1/mixed_companies/search  — find a company by name (free)
 *   - GET  /api/v1/organizations/enrich    — enrich org by domain for disambiguation (free)
 *   - POST /api/v1/mixed_people/api_search — find people at a company, filter by title + seniority (free)
 *   - POST /api/v1/people/match            — unlock a single person's email (1 credit)
 *
 * Note: /api/v1/mixed_people/search is deprecated for API callers (use api_search).
 *
 * Strategy for FLAIR contact discovery:
 *   1. Resolve brand name → org_id via search; if multiple namesake orgs exist
 *      AND brand_category is provided, call /organizations/enrich on each and
 *      pick the one whose industry / keywords match the category.
 *   2. Search people at that org filtered by ICP-relevant titles AND seniority
 *      (manager+) so we only get decision-makers, not entry-level ambassadors.
 *   3. Map results to CandidateContact shape, sorted by role priority.
 *   4. For any returned person missing a LinkedIn URL, call /people/match to
 *      unlock their email (per user preference: LinkedIn-first, email fallback).
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

/**
 * ICP-relevant title keywords for Apollo's `person_titles` filter. Apollo does
 * substring matching, so we cast a wide net and then re-classify on our side.
 */
const ICP_TITLE_KEYWORDS = [
  // Priority 1: college / next-gen
  "college", "campus", "student", "next-gen", "next gen", "gen z", "gen-z",
  // Priority 2: influencer / partnerships
  "influencer", "creator", "partnership", "partnerships", "ambassador", "talent",
  // Priority 3: social / community
  "social media", "community",
  // Priority 4: experiential
  "experiential", "activation", "field marketing", "events",
  // Priority 5: brand exec
  "head of brand", "vp marketing", "vp of marketing", "chief marketing",
  // Broad
  "brand marketing", "marketing manager", "marketing director",
];

type ApolloPerson = {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  linkedin_url?: string | null;
  email?: string | null;
  email_status?: string | null;
  organization?: {
    id?: string;
    name?: string;
    website_url?: string | null;
  };
  departments?: string[];
  seniority?: string;
  city?: string;
  state?: string;
  country?: string;
};

type ApolloOrganization = {
  id: string;
  name?: string;
  website_url?: string | null;
  primary_domain?: string | null;
  estimated_num_employees?: number;
  industry?: string | null;
  keywords?: string[] | null;
  short_description?: string | null;
};

export function apolloIsConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}

async function apolloPost<T = unknown>(pathname: string, body: object): Promise<T> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY not set");
  const res = await fetch(`${APOLLO_BASE}${pathname}`, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "content-type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apollo ${pathname} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function apolloGet<T = unknown>(pathname: string): Promise<T | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY not set");
  const res = await fetch(`${APOLLO_BASE}${pathname}`, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      "content-type": "application/json",
      "Cache-Control": "no-cache",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * Enrich a single org by domain. Returns rich data including industry name,
 * keywords, descriptions, employee count — fields not present in the basic
 * /mixed_companies/search response. Used for disambiguation when multiple
 * orgs share a name.
 */
async function apolloEnrichOrg(domain: string): Promise<ApolloOrganization | null> {
  if (!domain) return null;
  const res = await apolloGet<{ organization?: ApolloOrganization }>(
    `/organizations/enrich?domain=${encodeURIComponent(domain)}`
  );
  return res?.organization ?? null;
}

/**
 * Look up the most likely Apollo organization for a brand name.
 *
 * Disambiguation strategy when multiple companies share a name:
 *   1. Exact case-insensitive name match wins.
 *   2. If brand_category is provided, prefer the org whose domain or name
 *      hints at that category (e.g. "skincare" in the domain for a beauty brand).
 *   3. Otherwise prefer the largest org by employee count.
 *
 * Example: "Bubble" returns bubble.io, hellobubble.com (skincare), joinbubble.com.
 *          With category="beauty" we'd prefer hellobubble.com.
 */
export async function apolloSearchOrg(
  brandName: string,
  brandCategory?: string | null
): Promise<ApolloOrganization | null> {
  try {
    const res = await apolloPost<{ organizations?: ApolloOrganization[] }>(
      "/mixed_companies/search",
      {
        q_organization_name: brandName,
        page: 1,
        per_page: 10,
      }
    );
    const orgs = res.organizations ?? [];
    if (orgs.length === 0) return null;

    const exact = orgs.find(
      (o) => (o.name ?? "").toLowerCase() === brandName.toLowerCase()
    );
    if (exact && orgs.filter((o) => (o.name ?? "").toLowerCase() === brandName.toLowerCase()).length === 1) {
      return exact;
    }

    // Category-aware tie-breaker when multiple orgs share the name.
    // For exact-name collisions, call /organizations/enrich per candidate
    // to fetch industry + keywords + description (not in basic search response).
    const exactMatches = orgs.filter(
      (o) => (o.name ?? "").toLowerCase() === brandName.toLowerCase()
    );
    const needsDisambiguation = exactMatches.length > 1 || (!exact && orgs.length > 1);

    if (brandCategory && needsDisambiguation) {
      const categoryHints: Record<string, string[]> = {
        beauty: ["beauty", "skincare", "skin care", "cosmetics", "makeup", "haircare", "personal care", "fragrance"],
        wellness: ["wellness", "supplement", "vitamin", "health", "fitness", "nutrition"],
        lifestyle: ["lifestyle", "apparel", "fashion", "home"],
        fashion: ["fashion", "apparel", "clothing", "wear"],
        apparel: ["apparel", "clothing", "wear", "fashion", "garment"],
        cpg: ["food", "beverage", "snack", "consumer goods", "consumer packaged"],
        beverage: ["beverage", "drinks", "drink", "energy drink", "soda", "spirits", "alcohol"],
        edtech: ["edu", "education", "learning", "school", "tutoring"],
        "dtc-genz": ["beauty", "wellness", "skincare", "lifestyle"],
        enterprise: ["enterprise"],
      };
      const hints = categoryHints[brandCategory.toLowerCase()] ?? [brandCategory.toLowerCase()];
      // Limit enrich to top 5 candidates to cap API calls
      const candidates = (exactMatches.length > 0 ? exactMatches : orgs).slice(0, 5);
      const enriched = await Promise.all(
        candidates.map(async (o) => {
          const domain = o.primary_domain ?? (o.website_url ? new URL(o.website_url).hostname.replace(/^www\./, "") : null);
          const richer = domain ? await apolloEnrichOrg(domain) : null;
          // Merge — prefer enriched fields when present
          return { ...o, ...(richer ?? {}) };
        })
      );
      const categoryMatch = enriched.find((o) => {
        const fields = [
          o.name,
          o.primary_domain,
          o.website_url,
          o.industry,
          o.short_description,
          ...(o.keywords ?? []),
        ];
        const blob = fields.filter(Boolean).join(" ").toLowerCase();
        return hints.some((h) => blob.includes(h));
      });
      if (categoryMatch) return categoryMatch;
    }

    if (exact) return exact;
    return orgs
      .slice()
      .sort((a, b) => (b.estimated_num_employees ?? 0) - (a.estimated_num_employees ?? 0))[0] ?? null;
  } catch {
    return null;
  }
}

function classifyRoleCategory(title: string): CandidateContact["role_category"] {
  const t = title.toLowerCase();
  if (/\b(campus|college|student|gen[ -]?z|next[ -]?gen)\b/.test(t)) return "college-or-next-gen";
  if (/\b(influencer|creator|partnership|ambassador|talent)\b/.test(t)) return "influencer-or-partnerships";
  if (/\b(social media|community)\b/.test(t)) return "social-or-community";
  if (/\b(experiential|activation|field marketing|events)\b/.test(t)) return "experiential";
  if (/\b(cmo|chief marketing|vp.*marketing|head of brand|head of marketing|director of brand|director of marketing)\b/.test(t)) return "brand-marketing-exec";
  return "other";
}

/** Priority order for role categories — lower number = higher priority. */
const CATEGORY_PRIORITY: Record<CandidateContact["role_category"], number> = {
  "college-or-next-gen": 0,
  "influencer-or-partnerships": 1,
  "social-or-community": 2,
  "experiential": 3,
  "brand-marketing-exec": 4,
  "other": 5,
};

function isUnlockedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  // Apollo returns "email_not_unlocked@domain.com" for masked entries.
  return !/email_not_unlocked@/i.test(email);
}

/**
 * Enrich a single person by Apollo ID — unlocks their email (costs 1 credit).
 * Only used when the search-result person lacks a LinkedIn URL, per user pref.
 */
async function apolloMatchPerson(person: ApolloPerson): Promise<ApolloPerson | null> {
  try {
    const body: Record<string, unknown> = {
      reveal_personal_emails: true,
    };
    if (person.id) body.id = person.id;
    if (person.first_name) body.first_name = person.first_name;
    if (person.last_name) body.last_name = person.last_name;
    if (person.organization?.id) body.organization_id = person.organization.id;
    else if (person.organization?.name) body.organization_name = person.organization.name;
    const res = await apolloPost<{ person?: ApolloPerson }>("/people/match", body);
    return res.person ?? null;
  } catch {
    return null;
  }
}

/**
 * Find FLAIR-relevant contacts at a brand using Apollo.
 * Returns up to `maxResults` contacts in priority order (college-or-next-gen first).
 *
 * @param brandName e.g. "Bubble Skincare"
 * @param maxResults default 5
 */
export async function apolloFindContactsForBrand(
  brandName: string,
  maxResults = 5,
  brandCategory?: string | null
): Promise<CandidateContact[]> {
  const org = await apolloSearchOrg(brandName, brandCategory);
  if (!org) return [];

  let peopleResp: { people?: ApolloPerson[] };
  try {
    // /mixed_people/api_search is the API-caller endpoint;
    // /mixed_people/search is deprecated for API access (UI-only).
    // person_seniorities filter excludes ambassadors/interns/associates —
    // we only want decision-makers who control marketing budget.
    peopleResp = await apolloPost<{ people?: ApolloPerson[] }>(
      "/mixed_people/api_search",
      {
        organization_ids: [org.id],
        person_titles: ICP_TITLE_KEYWORDS,
        person_seniorities: ["c_suite", "founder", "owner", "vp", "head", "director", "manager", "senior"],
        page: 1,
        per_page: 25,
      }
    );
  } catch {
    return [];
  }
  const rawPeople = peopleResp.people ?? [];
  if (rawPeople.length === 0) return [];

  // Map + classify + sort by priority
  const ranked = rawPeople
    .map((p) => {
      const name =
        p.name ??
        [p.first_name, p.last_name].filter(Boolean).join(" ") ??
        "Unknown";
      const title = p.title ?? "";
      const cat = classifyRoleCategory(title);
      return { p, name, title, cat };
    })
    .filter((x) => x.title) // skip people with no title
    .sort((a, b) => CATEGORY_PRIORITY[a.cat] - CATEGORY_PRIORITY[b.cat])
    .slice(0, maxResults);

  // For any contact missing a LinkedIn URL, unlock email via /people/match.
  const enriched = await Promise.all(
    ranked.map(async ({ p, name, title, cat }) => {
      let linkedin_url = p.linkedin_url ?? null;
      let email = isUnlockedEmail(p.email) ? p.email! : null;
      if (!linkedin_url) {
        const matched = await apolloMatchPerson(p);
        if (matched) {
          if (matched.linkedin_url) linkedin_url = matched.linkedin_url;
          if (isUnlockedEmail(matched.email)) email = matched.email!;
        }
      }
      const confidence: CandidateContact["confidence"] =
        linkedin_url ? "high" : email ? "medium" : "low";
      const contact: CandidateContact = {
        name,
        title,
        linkedin_url,
        email,
        role_category: cat,
        source: linkedin_url ?? `https://app.apollo.io/#/people/${p.id}`,
        confidence,
        origin: "apollo",
      };
      return contact;
    })
  );

  return enriched;
}
