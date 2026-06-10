import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";
import { apolloFindContactsForBrand, apolloIsConfigured } from "@/lib/apollo";
import { getOutreachConfig, type OutreachConfig } from "@/lib/outreach-config";
import type { CandidateContact } from "@/lib/types";

const PROMPTS_DIR = path.join(process.cwd(), "lib", "prompts");

/**
 * Two-step candidate generator:
 *   1. Claude proposes brand list (creative work — no tools, prompt-cached prefix)
 *   2. Apollo finds contacts per brand (verified data — falls back to web search per brand if Apollo returns nothing)
 *
 * Returns the same shape the UI already consumes:
 *   { candidates: [{ brand_name, category, size, why_fit, seasonality_hook, contacts: [...] }] }
 */

function loadBrandSystemPrompt(cfg: OutreachConfig): string {
  const positioningPath = path.join(PROMPTS_DIR, cfg.positioningFile);
  const positioning = fs.existsSync(positioningPath) ? fs.readFileSync(positioningPath, "utf-8") : "";
  return `You are ${cfg.name}'s outbound research analyst. Propose specific real brands for ${cfg.name} to pitch ${cfg.pitch} to. Output JSON only — DO NOT search the web or find people. Another system will discover contacts for each brand you propose.

================================================================================
${cfg.name} POSITIONING BRIEF (this tells you what ${cfg.name} does — match brands to this)
================================================================================
${positioning}

================================================================================
BRAND CRITERIA
================================================================================
${cfg.candidateCriteria}

================================================================================
OUTPUT FORMAT (strict JSON only, no prose, no markdown fences)
================================================================================
{
  "candidates": [
    {
      "brand_name": "string",
      "category": "string (one of: ${cfg.categories.join(", ")})",
      "size": "enterprise | midsize | emerging",
      "why_fit": "1-2 sentence specific reason this brand is a strong ${cfg.name} target",
      "seasonality_hook": "string — the timeliest angle for pitching this brand right now"
    }
  ]
}

Quality bar: every brand must pass the sniff test of "would Sam actually want to pitch this brand?" Skip generic enterprise names; favor specific, well-matched brands.`;
}

const buildWebSearchContactSystem = (cfg: OutreachConfig) => `You are ${cfg.name}'s outbound research analyst. Given a single brand, use the web_search tool to find 2-4 specific named decision-makers whose roles make them the right recipient of ${cfg.pitch}.

PRIORITY ORDER:
${cfg.contactPriority}

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
  cfg: OutreachConfig,
  brandName: string,
  brandCategory: string
): Promise<CandidateContact[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    tools: [
      { type: "web_search_20250305" as const, name: "web_search", max_uses: 5 },
    ],
    system: buildWebSearchContactSystem(cfg),
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
  const cfg = getOutreachConfig(body.business_id);
  if (!cfg) {
    return NextResponse.json({ error: `Outreach is not configured for business "${body.business_id}"` }, { status: 400 });
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
        text: loadBrandSystemPrompt(cfg),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Propose ${count} brand candidates for ${cfg.name} to target.

ICP filters:
- Category focus: ${category || `any of ${cfg.name}'s core categories (${cfg.categories.join(", ")})`}
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
          contacts = await apolloFindContactsForBrand(b.brand_name, 5, b.category, cfg.icpTitleKeywords);
          if (contacts.length > 0) apolloHits++;
        } catch {
          contacts = [];
        }
      }
      if (contacts.length === 0) {
        contacts = await webSearchContacts(client, cfg, b.brand_name, b.category);
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
