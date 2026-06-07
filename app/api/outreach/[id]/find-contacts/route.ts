import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";
import { apolloFindContactsForBrand, apolloIsConfigured } from "@/lib/apollo";
import type { CandidateContact } from "@/lib/types";

const WEB_SEARCH_SYSTEM = `You are FLAIR's outbound research analyst. Given a single brand, use the web_search tool to find 2-4 specific named decision-makers whose roles make them the right recipient of FLAIR's college / next-gen marketing pitch.

PRIORITY ORDER (return contacts roughly in this order):
1. College / next-gen / campus marketing roles (exact ICP fit)
2. Influencer marketing, creator partnerships, brand partnerships
3. Social media, community management
4. Experiential / brand activations / field marketing
5. Brand marketing execs (CMO, VP Marketing, Head of Brand) — only if 1-4 turn up nothing

ANTI-HALLUCINATION RULES (critical):
1. Only include a contact if you found them via search results — never invent.
2. Only include a LinkedIn URL if you saw it in search results — leave linkedin_url null if you cannot verify. Do not guess URL patterns.
3. Include "source" URL where you found them.
4. Confidence: "high" if you found a LinkedIn profile result directly; "medium" if press / About page; "low" if inferred indirectly.
5. If you find ZERO real contacts, return contacts: []. Do not pad with invented names.

OUTPUT (strict JSON only, no prose, no markdown fences):
{
  "contacts": [
    {
      "name": "First Last",
      "title": "actual title found",
      "linkedin_url": "https://www.linkedin.com/in/... OR null",
      "email": null,
      "role_category": "college-or-next-gen | influencer-or-partnerships | social-or-community | experiential | brand-marketing-exec | other",
      "source": "URL where you found them",
      "confidence": "high | medium | low"
    }
  ]
}`;

async function webSearchFallback(
  brandName: string,
  brandCategory: string | null,
  brandSize: string | null
): Promise<CandidateContact[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search",
        max_uses: 6,
      },
    ],
    system: WEB_SEARCH_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Find contacts for this brand:
- Brand: ${brandName}
- Category: ${brandCategory ?? "(unknown)"}
- Size: ${brandSize ?? "(unknown)"}

Search the web (multiple queries), then return ONLY the JSON object.`,
      },
    ],
  });
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    const parsed = extractJSON<{ contacts?: CandidateContact[] }>(raw);
    return (parsed.contacts ?? []).map((c) => ({ ...c, origin: "web_search" as const }));
  } catch {
    return [];
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const targetId = Number(id);
  const bizId = db.getOutreachBizId(targetId);
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const target = db.getOutreach(targetId);
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  // Step 1: try Apollo
  let contacts: CandidateContact[] = [];
  let used: "apollo" | "web_search" | "apollo+web_search" = "apollo";
  if (apolloIsConfigured()) {
    try {
      contacts = await apolloFindContactsForBrand(target.brand_name, 5, target.brand_category);
    } catch (err) {
      console.warn("[find-contacts] Apollo failed:", err);
      contacts = [];
    }
  }

  // Step 2: fall back to web search if Apollo returned nothing
  if (contacts.length === 0) {
    contacts = await webSearchFallback(
      target.brand_name,
      target.brand_category,
      target.brand_size
    );
    used = apolloIsConfigured() ? "apollo+web_search" : "web_search";
  }

  return NextResponse.json({
    contacts,
    source: used,
    apollo_configured: apolloIsConfigured(),
  });
}
