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

/** Hard guarantee: no em/en dashes ever reach a draft, regardless of model output. */
function stripDashes(text: string): string {
  return text.replace(/[—–]/g, "-");
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

PUNCTUATION (hard rule):
- ABSOLUTELY NO em dashes (—) or en dashes (–) anywhere, in any variant, ever. Not mid-sentence, not as a sign-off marker, not in the subject line.
- Use a comma, a period, or a plain hyphen with spaces ( - ) instead. Sign-offs use a plain hyphen: "-Tyler" not "—Tyler".

USING THE ENRICHED CONTEXT (this is what separates a good draft from a generic one):
- When ENRICHED CONTEXT is provided below the target, you MUST use it. A draft that ignores provided signals is a failed draft.
- Pick the single most pitchable signal and make it the personalization beat:
  * Template A: reference it in ONE short clause so the brand drop lands as "we already know your world" rather than a cold list.
  * Template B: build the question AROUND the signal. The specific tactic you ask about should clearly connect to what the brand is doing right now.
  * Email: open or close with it. One sentence that proves this isn't a blast.
- Use the FIT RATIONALE to choose WHICH angle to pitch, and let it shape word choice. Do not paste it in.
- Sound like a person who genuinely follows the brand: mention the signal the way a fan would in conversation ("loved the [X] drop", "saw you're going big on [Y] this year"), never like a researcher ("I noticed that your company recently..."). No dates, no statistics from articles, no source names.
- One personalization beat per message maximum. Everything else stays in the template voice.
- If NO enriched context is provided, write from category knowledge only. Never invent campaigns, hires, or launches.

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
  let signalsBlock: string;
  if (signals && (signals.signals?.length > 0 || signals.fit_rationale)) {
    const signalLines = (signals.signals ?? [])
      .map((s: { type: string; summary: string }) => `- [${s.type}] ${s.summary}`)
      .join("\n");
    signalsBlock = `
ENRICHED CONTEXT about ${target.brand_name} (you MUST use this per the system rules):
${signalLines || "- (no individual signals, use the fit rationale)"}
${signals.summary_for_drafter ? `\nMost pitchable hook: ${signals.summary_for_drafter}` : ""}
${signals.fit_rationale ? `\nFIT RATIONALE (why ${target.brand_name} x ${cfg.name} makes sense, let it shape the angle): ${signals.fit_rationale}` : ""}`;
  } else {
    signalsBlock = `\n(No enriched context available. Write from category knowledge only, do not invent specifics about this brand.)`;
  }

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
        templateA: {
          connectionNote: stripDashes(obj.templateA.connectionNote),
          firstDM: stripDashes(obj.templateA.firstDM),
        },
        templateB: {
          connectionNote: stripDashes(obj.templateB.connectionNote),
          firstDM: stripDashes(obj.templateB.firstDM),
        },
        email: obj.email
          ? { subject: stripDashes(obj.email.subject), body: stripDashes(obj.email.body) }
          : undefined,
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
