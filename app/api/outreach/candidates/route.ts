import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";

const POSITIONING_PATH = path.join(process.cwd(), "lib", "prompts", "flair-positioning-brief.md");

function loadSystemPrompt(): string {
  const positioning = fs.existsSync(POSITIONING_PATH) ? fs.readFileSync(POSITIONING_PATH, "utf-8") : "";
  return `You are FLAIR's outbound research analyst. You have two jobs in one pass:

JOB 1: Propose specific real brands for FLAIR to pitch its college / next-gen marketing services to.

JOB 2: For each brand, use the web_search tool to find 2-4 specific named decision-makers at that brand whose roles make them the right recipient of FLAIR's pitch. Pull real LinkedIn URLs where you can find them via search.

================================================================================
FLAIR POSITIONING BRIEF (this tells you what FLAIR does — match brands AND contacts to this)
================================================================================
${positioning}

================================================================================
BRAND CRITERIA
================================================================================
- Sell to or want to sell to Gen-Z / college-age consumers
- Mid-tier in marketing maturity — too small to have a big-agency lock-in, too established to be lifestyle-only
- NOT already FLAIR clients (Coca-Cola, method/SC Johnson, Monster Energy, Real American Beer, WOW Media, Vacation, Ulta — skip these and obvious adjacents)
- Have a back-to-school 2026 story angle (apparel for fall, beauty for rush, beverage for tailgates, EdTech for semester start)

================================================================================
CONTACT SEARCH STRATEGY
================================================================================
For each brand, search the web (use multiple targeted queries) to find:

Priority 1 — College / next-gen specific roles:
- "College Marketing Manager", "Campus Marketing", "Next-Gen / Gen-Z Lead", "Student Marketing"

Priority 2 — Influencer / partnerships:
- "Influencer Marketing", "Creator Partnerships", "Talent / Influencer Lead", "Brand Partnerships"

Priority 3 — Social / community:
- "Social Media Manager", "Head of Social", "Community Manager"

Priority 4 — Experiential:
- "Experiential Marketing", "Brand Activation", "Events / Field Marketing"

Priority 5 — Brand marketing execs (only if Priorities 1-4 turn up nothing):
- "VP Marketing", "CMO", "Head of Brand"

Effective search queries:
- "{brand name} college marketing manager LinkedIn"
- "{brand name} influencer marketing LinkedIn"
- "site:linkedin.com/in {brand name} partnerships"
- "{brand name} team" (for About pages)

CRITICAL ANTI-HALLUCINATION RULES:
1. Only include a contact if you found them via search results — never invent a person.
2. Only include a LinkedIn URL if you saw it in search results — leave linkedin_url null if you cannot verify, do not guess URL patterns.
3. For each contact, include the "source" URL where you found them (LinkedIn search result, press article, brand About page, etc.).
4. Mark confidence: "high" if you found a LinkedIn profile result directly; "medium" if you found them via press / About page; "low" if you're inferring from indirect evidence.
5. If you find ZERO real contacts for a brand, return contacts: [] for that brand. Do not pad with invented names.

================================================================================
OUTPUT FORMAT (strict JSON only — no prose, no markdown fences)
================================================================================
{
  "candidates": [
    {
      "brand_name": "string",
      "category": "string (one of: beauty, wellness, lifestyle, fashion, apparel, CPG, beverage, EdTech, DTC-genz, enterprise)",
      "size": "enterprise | midsize | emerging",
      "why_fit": "1-2 sentence specific reason this brand is a strong FLAIR target",
      "seasonality_hook": "string — back-to-school angle for this brand",
      "contacts": [
        {
          "name": "First Last",
          "title": "actual title found",
          "linkedin_url": "https://www.linkedin.com/in/... OR null if not verifiable",
          "role_category": "college-or-next-gen | influencer-or-partnerships | social-or-community | experiential | brand-marketing-exec | other",
          "source": "URL where you found them",
          "confidence": "high | medium | low"
        }
      ]
    }
  ]
}

Return the JSON object only — no other text.`;
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

  const userPrompt = `Propose ${count} brand candidates for FLAIR to target, AND find 2-4 real LinkedIn contacts per brand using web search.

ICP filters:
- Category focus: ${category || "any of FLAIR's core categories (beauty, wellness, lifestyle, fashion, apparel, CPG, beverage, EdTech, DTC-genz)"}
- Size: ${size || "any (mix of enterprise, midsize, emerging)"}
- Additional focus: ${focus || "(none)"}

For each brand, do web searches to find specific named people with LinkedIn URLs. Budget your search uses across all brands. Return ONLY the JSON object.`;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
          max_uses: Math.min(count * 3, 40),
        },
      ],
      system: loadSystemPrompt(),
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const raw = textBlocks.map((b) => b.text).join("").trim();

    let parsed: { candidates?: unknown[] };
    try {
      parsed = extractJSON(raw);
    } catch {
      return NextResponse.json({ error: "Generator returned non-JSON", raw }, { status: 502 });
    }

    return NextResponse.json({
      candidates: parsed.candidates ?? [],
      usage: response.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API error" },
      { status: 500 }
    );
  }
}
