import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";
import type { OutreachDrafts } from "@/lib/types";

const POSITIONING_PATH = path.join(process.cwd(), "lib", "prompts", "flair-positioning-brief.md");
const VOICE_PATH = path.join(process.cwd(), "lib", "prompts", "flair-voice-samples.md");

function loadPrefix(): string {
  const positioning = fs.existsSync(POSITIONING_PATH) ? fs.readFileSync(POSITIONING_PATH, "utf-8") : "";
  const voice = fs.existsSync(VOICE_PATH) ? fs.readFileSync(VOICE_PATH, "utf-8") : "";
  return `You are the FLAIR outreach drafter. You write LinkedIn outreach messages for Sam Freeman (Founder) and Tyler Rong (Head of Operations) targeting brand-side decision-makers for FLAIR's college / next-gen marketing services.

Your job: given a single target brand + contact, produce TWO message variants — Template A (identity + proof + soft close, Sam-style) and Template B (specific question, no pitch, Tyler-style). Output strict JSON only.

You MUST follow the voice samples and positioning brief below verbatim in tone, structure, vocabulary, and length. Use real proof-points only — never invent stats. Pick proof brands matched to the target's category.

================================================================================
FLAIR POSITIONING BRIEF
================================================================================
${positioning}

================================================================================
FLAIR VOICE SAMPLES
================================================================================
${voice}

================================================================================
OUTPUT FORMAT (strict JSON, no prose, no markdown fences)
================================================================================
{
  "templateA": { "connectionNote": "string ≤300 chars", "firstDM": "string ≤600 chars" },
  "templateB": { "connectionNote": "string ≤300 chars", "firstDM": "string ≤600 chars" },
  "reasoning": "one short sentence: why these proof points + tactic match this target"
}

Rules:
- connectionNote = the message attached to the LinkedIn connection request (under 300 chars LinkedIn limit).
- firstDM = the follow-up direct message sent right after they accept the connection.
- Template A: Sam-style. "Hey {FirstName}!!", identity pitch sentence, brand-name drop sentence, "Would love to chat!!" close. Double-bangs.
- Template B: Tyler-style. "Hey {FirstName}!", direct question tailored to brand category, optional one-line elaboration, optional "—{FirstName}" sign-off. Single-bang.
- Use ONLY the target's FIRST NAME in the greeting.
- Pick proof brands relevant to target category from the positioning brief — NEVER invent.
- NEVER include links, calendar references, or "looking forward to your response".
- For Template B, do NOT mention FLAIR or list clients — keep it pure ask.
- Use seasonality (Fall '26, back-to-school, rush week) when it fits.
`;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const targetId = Number(id);
  const bizId = db.getOutreachBizId(targetId);
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const target = db.getOutreach(targetId);
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const signals = target.signals_json ? JSON.parse(target.signals_json) : null;
  const signalsBlock = signals
    ? `\nRecent signals about ${target.brand_name}:\n${JSON.stringify(signals, null, 2)}`
    : `\n(No signals enriched yet — write from category knowledge only, do not invent specifics about this brand.)`;

  const userPrompt = `TARGET:
- Brand: ${target.brand_name}
- Category: ${target.brand_category ?? "(unknown — infer from brand)"}
- Size: ${target.brand_size ?? "(unknown)"}
- Person: ${target.person_name}
- Title: ${target.person_title ?? "(unknown)"}
${signalsBlock}

Produce both templates now. Return ONLY the JSON object.`;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: loadPrefix(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed: OutreachDrafts;
    try {
      const obj = extractJSON<{ templateA: OutreachDrafts["templateA"]; templateB: OutreachDrafts["templateB"]; reasoning?: string }>(text);
      parsed = {
        templateA: obj.templateA,
        templateB: obj.templateB,
        reasoning: obj.reasoning,
        generated_at: Date.now(),
      };
    } catch {
      return NextResponse.json(
        { error: "Drafter returned non-JSON output", raw: text },
        { status: 502 }
      );
    }

    const updated = db.updateOutreach(targetId, {
      drafts_json: JSON.stringify(parsed),
      status: target.status === "queued" ? "drafted" : target.status,
    });

    return NextResponse.json({
      target: updated,
      drafts: parsed,
      usage: response.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API error" },
      { status: 500 }
    );
  }
}
