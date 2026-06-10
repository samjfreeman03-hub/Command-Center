import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";
import { getOutreachConfig, type OutreachConfig } from "@/lib/outreach-config";
import type { OutreachDrafts } from "@/lib/types";

const PROMPTS_DIR = path.join(process.cwd(), "lib", "prompts");

function readPrompt(file: string): string {
  const full = path.join(PROMPTS_DIR, file);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
}

function loadPrefix(cfg: OutreachConfig): string {
  const positioning = readPrompt(cfg.positioningFile);
  const voice = readPrompt(cfg.voiceFile);
  return `You are the ${cfg.name} outreach drafter. ${cfg.drafterIdentity}

Your job: given a single target brand + contact, produce TWO LinkedIn message variants (Template A and Template B per the voice samples below) plus ONE cold email variant. Output strict JSON only.

You MUST follow the voice samples and positioning brief below verbatim in tone, structure, vocabulary, and length. Use real proof-points only — never invent stats.

================================================================================
${cfg.name} POSITIONING BRIEF
================================================================================
${positioning}

================================================================================
${cfg.name} VOICE SAMPLES
================================================================================
${voice}

================================================================================
OUTPUT FORMAT (strict JSON, no prose, no markdown fences)
================================================================================
{
  "templateA": { "connectionNote": "string ≤300 chars", "firstDM": "string ≤600 chars" },
  "templateB": { "connectionNote": "string ≤300 chars", "firstDM": "string ≤600 chars" },
  "email": { "subject": "string ≤70 chars", "body": "string ≤900 chars, plain text" },
  "reasoning": "one short sentence: why these hooks + proof points match this target"
}

Rules:
- connectionNote = the message attached to the LinkedIn connection request (under 300 chars LinkedIn limit).
- firstDM = the follow-up direct message sent right after they accept the connection.
- email = a standalone cold email in the same voice (see email rules in the voice samples). Greeting through sign-off, no subject line inside the body.
- Use ONLY the target's FIRST NAME in greetings.
- NEVER include links or calendar references in any variant.

SIGNALS & FIT (critical):
- When enriched signals and/or a fit rationale are provided for the target, weave the SINGLE strongest hook naturally into the drafts — one specific reference that shows why {brand} × ${cfg.name} makes obvious sense.
- The fit must read like an insider observation, never like scraped research. One specific beat per message, maximum.
- If no signals are provided, write from category knowledge only — do not invent specifics about the brand.

${cfg.draftRules}
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
  const cfg = getOutreachConfig(bizId);
  if (!cfg) {
    return NextResponse.json({ error: `Outreach is not configured for business "${bizId}"` }, { status: 400 });
  }
  const target = db.getOutreach(targetId);
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const signals = target.signals_json ? JSON.parse(target.signals_json) : null;
  const signalsBlock = signals
    ? `\nRecent signals about ${target.brand_name}:\n${JSON.stringify(signals, null, 2)}${
        signals.fit_rationale ? `\n\nFIT RATIONALE (weave this in): ${signals.fit_rationale}` : ""
      }`
    : `\n(No signals enriched yet — write from category knowledge only, do not invent specifics about this brand.)`;

  const userPrompt = `TARGET:
- Brand: ${target.brand_name}
- Category: ${target.brand_category ?? "(unknown — infer from brand)"}
- Size: ${target.brand_size ?? "(unknown)"}
- Person: ${target.person_name}
- Title: ${target.person_title ?? "(unknown)"}
${signalsBlock}

Produce both LinkedIn templates and the email variant now. Return ONLY the JSON object.`;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: loadPrefix(cfg),
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
      const obj = extractJSON<{
        templateA: OutreachDrafts["templateA"];
        templateB: OutreachDrafts["templateB"];
        email?: OutreachDrafts["email"];
        reasoning?: string;
      }>(text);
      parsed = {
        templateA: obj.templateA,
        templateB: obj.templateB,
        email: obj.email,
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
