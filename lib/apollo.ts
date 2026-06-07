import type { CandidateContact } from "./types";

/**
 * Apollo.io API client (server-side only — never import in client components).
 *
 * Docs: https://docs.apollo.io/reference
 *
 * Endpoints we use:
 *   - POST /api/v1/mixed_companies/search  — find a company by name
 *   - POST /api/v1/mixed_people/search     — find people at a company, filterable by title
 *   - POST /api/v1/people/match            — enrich a single person (unlocks email — costs credit)
 *
 * Strategy for FLAIR contact discovery:
 *   1. Resolve brand name → org_id (so we don't pull people from unrelated namesake companies).
 *   2. Search people at that org filtered by ICP-relevant titles.
 *   3. Map results to CandidateContact shape.
 *   4. For any returned person missing a LinkedIn URL, call /people/match to enrich (per user preference).
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

/**
 * Look up the most likely Apollo organization for a brand name. Picks the
 * largest match by employee count to disambiguate when multiple companies
 * share a name (e.g. "Bubble" → Bubble Skincare not Bubble.io).
 */
export async function apolloSearchOrg(brandName: string): Promise<ApolloOrganization | null> {
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
    // Prefer exact name match; otherwise largest by employee count
    const exact = orgs.find(
      (o) => (o.name ?? "").toLowerCase() === brandName.toLowerCase()
    );
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
  maxResults = 5
): Promise<CandidateContact[]> {
  const org = await apolloSearchOrg(brandName);
  if (!org) return [];

  let peopleResp: { people?: ApolloPerson[] };
  try {
    peopleResp = await apolloPost<{ people?: ApolloPerson[] }>(
      "/mixed_people/search",
      {
        organization_ids: [org.id],
        person_titles: ICP_TITLE_KEYWORDS,
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
