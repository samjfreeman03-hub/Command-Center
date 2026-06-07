import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { canAccessBusiness } from "@/lib/server-auth";

const POSITIONING_PATH = path.join(process.cwd(), "lib", "prompts", "flair-positioning-brief.md");

function loadSystemPrompt(): string {
  const positioning = fs.existsSync(POSITIONING_PATH) ? fs.readFileSync(POSITIONING_PATH, "utf-8") : "";
  return `You are FLAIR's outbound research analyst. Your job is to propose a high-quality target list of brands for FLAIR to pitch its college / next-gen marketing services to.

================================================================================
FLAIR POSITIONING BRIEF (this tells you what FLAIR does — match brands to this)
================================================================================
${positioning}

================================================================================
YOUR TASK
================================================================================
Given a target ICP (category + size), propose specific real brands that:
1. Sell to or want to sell to Gen-Z / college-age consumers
2. Are mid-tier in marketing maturity — too small to have a big-agency relationship locked in, too established to be lifestyle-only
3. Are NOT already FLAIR clients (Coca-Cola, method/SC Johnson, Monster Energy, Real American Beer, WOW Media, Vacation, Ulta — skip these and obvious adjacents)
4. Have a real story angle for back-to-school 2026 (apparel for fall, beauty for rush season, beverage for tailgates, EdTech for semester start, etc.)

For each brand suggest 1-3 SPECIFIC decision-maker titles to target (CMO, Head of Brand, Influencer Marketing Manager, Campus Marketing Lead, etc.). DO NOT invent specific names — just titles.

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
      "decision_maker_titles": ["title", "title"],
      "seasonality_hook": "string — back-to-school angle for this brand"
    }
  ]
}

Quality bar: every candidate must pass the sniff test of "would Sam actually want to pitch this brand?" Skip generic enterprise names; favor specific, emerging-to-midsize Gen-Z-relevant brands.`;
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
  const count: number = Math.min(Math.max(Number(body.count ?? 15), 5), 30);
  const focus: string = body.focus ?? "";

  const userPrompt = `Propose ${count} brand candidates for FLAIR to target.

ICP filters:
- Category focus: ${category || "any of FLAIR's core categories (beauty, wellness, lifestyle, fashion, apparel, CPG, beverage, EdTech, DTC-genz)"}
- Size: ${size || "any (mix of enterprise, midsize, emerging)"}
- Additional focus: ${focus || "(none)"}

Return ONLY the JSON object.`;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: loadSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
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
