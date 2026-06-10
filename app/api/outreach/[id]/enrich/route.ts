import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";
import { getOutreachConfig, type OutreachConfig } from "@/lib/outreach-config";

const CACHE_TTL_MS = 14 * 86400_000; // 14 days

function buildSystemPrompt(cfg: OutreachConfig): string {
  return `You are a research analyst for ${cfg.name}. ${cfg.aboutForFit}

Given a target brand and a contact at that brand, search the web for the 3–5 most useful signals to ground a personalized outreach message. Useful signals include:

${cfg.enrichFocus}

Skip generic info (founder bio, company size, history). We want *recent and specific* signals an outreach message can hook into.

After gathering signals, write a FIT RATIONALE: 2-3 sentences on why this specific brand × ${cfg.name} is a natural partnership — grounded in what you found (or, if nothing was found, in the brand's category and audience). This rationale is fed to the message drafter so it can argue the collaboration convincingly.

Output strict JSON ONLY (no prose, no markdown fences):
{
  "signals": [
    { "type": "campaign|hire|funding|launch|partnership|other", "summary": "1-2 sentence specific signal", "source": "https://url" }
  ],
  "summary_for_drafter": "2-3 sentence summary of the most pitchable hook",
  "fit_rationale": "2-3 sentences: why ${cfg.name} × this brand makes obvious sense"
}

If no signals found after searching, return signals: [] and summary_for_drafter: "No recent public signals found." — but ALWAYS still write the fit_rationale from category knowledge.`;
}

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
  const cfg = getOutreachConfig(bizId);
  if (!cfg) {
    return NextResponse.json({ error: `Outreach is not configured for business "${bizId}"` }, { status: 400 });
  }
  const target = db.getOutreach(targetId);
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  // Cache check — skip if signals fresh (and already carry a fit rationale)
  if (target.signals_json) {
    try {
      const existing = JSON.parse(target.signals_json);
      if (
        existing.fetched_at &&
        Date.now() - existing.fetched_at < CACHE_TTL_MS &&
        existing.fit_rationale
      ) {
        return NextResponse.json({
          target,
          signals: existing,
          cached: true,
        });
      }
    } catch {
      // fall through to re-enrich
    }
  }

  const userPrompt = `Find signals about this brand and contact:
- Brand: ${target.brand_name}
- Category: ${target.brand_category ?? "(unknown)"}
- Contact: ${target.person_name} (${target.person_title ?? "unknown title"})

Search the web (multiple queries if useful), then return the JSON object including the fit_rationale.`;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
          max_uses: 4,
        },
      ],
      system: buildSystemPrompt(cfg),
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract final text block (assistant's JSON response after tool uses)
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const raw = textBlocks.map((b) => b.text).join("").trim();

    let parsed: { signals: unknown[]; summary_for_drafter: string; fit_rationale?: string };
    try {
      parsed = extractJSON(raw);
    } catch {
      return NextResponse.json({ error: "Enricher returned non-JSON", raw }, { status: 502 });
    }

    const signals = {
      ...parsed,
      fetched_at: Date.now(),
    };

    const updated = db.updateOutreach(targetId, {
      signals_json: JSON.stringify(signals),
    });

    return NextResponse.json({
      target: updated,
      signals,
      cached: false,
      usage: response.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API error" },
      { status: 500 }
    );
  }
}
