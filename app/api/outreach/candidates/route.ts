import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";
import { apolloFindContactsForBrand, apolloIsConfigured } from "@/lib/apollo";
import type { CandidateContact } from "@/lib/types";

const POSITIONING_PATH = path.join(process.cwd(), "lib", "prompts", "flair-positioning-brief.md");

/**
 * Two-step candidate generator:
 *   1. Claude proposes brand list (creative work — no tools, prompt-cached prefix)
 *   2. Apollo finds contacts per brand (verified data — falls back to web search per brand if Apollo returns nothing)
 *
 * Returns the same shape the UI already consumes:
 *   { candidates: [{ brand_name, category, size, why_fit, seasonality_hook, contacts: [...] }] }
 */

function loadBrandSystemPrompt(): string {
  const positioning = fs.existsSync(POSITIONING_PATH) ? fs.readFileSync(POSITIONING_PATH, "utf-8") : "";
  return `You are FLAIR's outbound research analyst. Propose specific real brands for FLAIR to pitch its college / next-gen marketing services to. Output JSON only — DO NOT search the web or find people. Another system will discover contacts for each brand you propose.

================================================================================
FLAIR POSITIONING BRIEF (this tells you what FLAIR does — match brands to this)
================================================================================
${positioning}

================================================================================
BRAND CRITERIA
================================================================================
- Sell to or want to sell to Gen-Z / college-age consumers
- Mid-tier in marketing maturity — too small to have a big-agency lock-in, too established to be lifestyle-only
- NOT already FLAIR clients (Coca-Cola, method/SC Johnson, Monster Energy, Real American Beer, WOW Media, Vacation, ULTA Beauty — skip these and obvious adjacents)
- Have a back-to-school 2026 story angle (apparel for fall, beauty for rush, beverage for tailgates, EdTech for semester start)

================================================================================
OUTPUT FORMAT (strict JSON only, no prose, no markdown fences)
================================================================================
{
  "candidates": [
    {
      "brand_name": "string",
      "category": "string (one of: beauty, wellness, lifestyle, fashion, apparel, CPG, beverage, EdTech, DTC-genz, enterprise)",
      "size": "enterprise | midsize | emerging",
      "why_fit": "1-2 sentence specific reason this brand is a strong FLAIR target",
      "seasonality_hook": "string — back-to-school angle for this brand"
    }
  ]
}

Quality bar: every brand must pass the sniff test of "would Sam actually want to pitch this brand?" Skip generic enterprise names; favor specific, emerging-to-midsize Gen-Z-relevant brands.`;
}

const WEB_SEARCH_CONTACT_SYSTEM = `You are FLAIR's outbound research analyst. Given a single brand, use the web_search tool to find 2-4 specific named decision-makers whose roles make them the right recipient of FLAIR's college / next-gen marketing pitch.

PRIORITY: college/next-gen roles first, then influencer/partnerships, social/community, experiential, brand execs.

ANTI-HALLUCINATION:
- Only include contacts you found via search results — never invent.
- linkedin_url null if unverifiable.
- If zero real contacts, return contacts: [].

OUTPUT (strict JSON):
{
  "contacts": [
    { "name", "title", "linkedin_url": null or URL, "email": null, "role_category", "source": URL, "confidence": "high|medium|low" }
  ]
}`;

async function webSearchContacts(
  client: Anthropic,
  brandName: string,
  brandCategory: string
): Promise<CandidateContact[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    tools: [
      { type: "web_search_20250305" as const, name: "web_search", max_uses: 5 },
    ],
    system: WEB_SEARCH_CONTACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Find contacts for ${brandName} (${brandCategory}). Return ONLY the JSON object.`,
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

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  const body = await req.json();
  if (!body?.business_id) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category: string = body.category ?? "";
  const size: string = body.size ?? "";
  const count: number = Math.min(Math.max(Number(body.count ?? 10), 3), 20);
  const focus: string = body.focus ?? "";

  const client = new Anthropic({ apiKey });

  // Step 1: Generate brand list (Claude, no tools, cached prefix)
  const brandResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: [
      {
        type: "text",
        text: loadBrandSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Propose ${count} brand candidates for FLAIR to target.

ICP filters:
- Category focus: ${category || "any of FLAIR's core categories (beauty, wellness, lifestyle, fashion, apparel, CPG, beverage, EdTech, DTC-genz)"}
- Size: ${size || "any (mix of enterprise, midsize, emerging)"}
- Additional focus: ${focus || "(none)"}

Return ONLY the JSON object.`,
      },
    ],
  });
  const brandRaw = brandResponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  let brandList: Array<{
    brand_name: string;
    category: string;
    size: "enterprise" | "midsize" | "emerging";
    why_fit: string;
    seasonality_hook: string;
  }> = [];
  try {
    const parsed = extractJSON<{ candidates?: typeof brandList }>(brandRaw);
    brandList = parsed.candidates ?? [];
  } catch {
    return NextResponse.json({ error: "Brand generator returned non-JSON", raw: brandRaw }, { status: 502 });
  }
  if (brandList.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Step 2: For each brand, find contacts (Apollo primary, web-search fallback)
  const apolloOK = apolloIsConfigured();
  let apolloHits = 0;
  let webSearchHits = 0;

  const candidates = await Promise.all(
    brandList.map(async (b) => {
      let contacts: CandidateContact[] = [];
      if (apolloOK) {
        try {
          contacts = await apolloFindContactsForBrand(b.brand_name);
          if (contacts.length > 0) apolloHits++;
        } catch {
          contacts = [];
        }
      }
      if (contacts.length === 0) {
        contacts = await webSearchContacts(client, b.brand_name, b.category);
        if (contacts.length > 0) webSearchHits++;
      }
      return { ...b, contacts };
    })
  );

  return NextResponse.json({
    candidates,
    stats: {
      brands: brandList.length,
      apollo_hits: apolloHits,
      web_search_hits: webSearchHits,
      apollo_configured: apolloOK,
    },
  });
}
