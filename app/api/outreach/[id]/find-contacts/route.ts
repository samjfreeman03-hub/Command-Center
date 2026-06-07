import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";

const SYSTEM_PROMPT = `You are FLAIR's outbound research analyst. Given a single brand, use the web_search tool to find 2-4 specific named decision-makers whose roles make them the right recipient of FLAIR's college / next-gen marketing pitch.

PRIORITY ORDER (return contacts roughly in this order):
1. College / next-gen / campus marketing roles (exact ICP fit)
2. Influencer marketing, creator partnerships, brand partnerships
3. Social media, community management
4. Experiential / brand activations / field marketing
5. Brand marketing execs (CMO, VP Marketing, Head of Brand) — only if 1-4 turn up nothing

EFFECTIVE QUERIES:
- "{brand} college marketing manager LinkedIn"
- "{brand} influencer marketing LinkedIn"
- "site:linkedin.com/in {brand} partnerships"
- "{brand} team"

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
      "role_category": "college-or-next-gen | influencer-or-partnerships | social-or-community | experiential | brand-marketing-exec | other",
      "source": "URL where you found them",
      "confidence": "high | medium | low"
    }
  ]
}`;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  const { id } = await ctx.params;
  const targetId = Number(id);
  const bizId = db.getOutreachBizId(targetId);
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const target = db.getOutreach(targetId);
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const userPrompt = `Find contacts for this brand:
- Brand: ${target.brand_name}
- Category: ${target.brand_category ?? "(unknown)"}
- Size: ${target.brand_size ?? "(unknown)"}

Search the web (multiple queries), then return ONLY the JSON object.`;

  const client = new Anthropic({ apiKey });
  try {
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
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed: { contacts?: unknown[] };
    try {
      parsed = extractJSON(raw);
    } catch {
      return NextResponse.json({ error: "Finder returned non-JSON", raw }, { status: 502 });
    }

    return NextResponse.json({
      contacts: parsed.contacts ?? [],
      usage: response.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API error" },
      { status: 500 }
    );
  }
}
