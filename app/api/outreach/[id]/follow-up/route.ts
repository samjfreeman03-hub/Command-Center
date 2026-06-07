import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { extractJSON } from "@/lib/extract-json";

const POSITIONING_PATH = path.join(process.cwd(), "lib", "prompts", "flair-positioning-brief.md");
const VOICE_PATH = path.join(process.cwd(), "lib", "prompts", "flair-voice-samples.md");

function loadPrefix(): string {
  const positioning = fs.existsSync(POSITIONING_PATH) ? fs.readFileSync(POSITIONING_PATH, "utf-8") : "";
  const voice = fs.existsSync(VOICE_PATH) ? fs.readFileSync(VOICE_PATH, "utf-8") : "";
  return `You are the FLAIR follow-up drafter. You write LinkedIn follow-up messages for Sam Freeman or Tyler Rong. A previous touch has already been sent. Your job is to produce ONE short, low-pressure bump.

CADENCE:
- Follow-up #1 (Day 3): friendly bump, no new pitch. ~40-90 chars. Example tone: "Hey Shai!! Just bumping this up — let me know if you'd like to chat!!"
- Follow-up #2 (Day 7): try a slightly different angle. Reference a specific tactic or proof point not used in the first touch. ~80-150 chars.
- Follow-up #3 (Day 14): final attempt. Soft value-add or "happy to circle back later" tone. ~80-150 chars.

UNIVERSAL RULES:
- First name only, casual greeting.
- NEVER repeat the original pitch verbatim.
- NEVER include calendar links or "looking forward to your response".
- For Sam: double-bang punctuation, no sign-off.
- For Tyler: single-bang, may sign off "—Tyler".

================================================================================
FLAIR POSITIONING BRIEF (proof points + vocabulary you may pull from)
================================================================================
${positioning}

================================================================================
FLAIR VOICE SAMPLES (first-touch reference — match this tone but make follow-up SHORTER)
================================================================================
${voice}

================================================================================
OUTPUT FORMAT (strict JSON, no prose, no markdown fences)
================================================================================
{
  "text": "the follow-up message",
  "reasoning": "one short sentence: what angle this takes and why"
}`;
}

export async function POST(
  req: Request,
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
  if (!target.sent_at) {
    return NextResponse.json({ error: "Cannot draft follow-up before first send" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const sender: "Sam" | "Tyler" = body.sender === "Tyler" ? "Tyler" : "Sam";
  const nextFollowupN = (target.followup_count + 1) as 1 | 2 | 3;
  if (nextFollowupN > 3) {
    return NextResponse.json({ error: "Cadence complete — no more follow-ups" }, { status: 400 });
  }

  const history = target.sent_history_json ? JSON.parse(target.sent_history_json) : [];
  const signals = target.signals_json ? JSON.parse(target.signals_json) : null;
  const historyBlock = history.length
    ? history
        .map(
          (h: { follow_up_n: number; text: string; at: number }) =>
            `- ${h.follow_up_n === 0 ? "Original send" : `Follow-up #${h.follow_up_n}`} (${new Date(h.at).toISOString().slice(0, 10)}):\n  ${h.text}`
        )
        .join("\n")
    : "(no prior sends)";
  const signalsBlock = signals
    ? `Recent signals about ${target.brand_name}:\n${JSON.stringify(signals, null, 2)}`
    : "(no signals enriched)";

  const userPrompt = `TARGET:
- Brand: ${target.brand_name}
- Category: ${target.brand_category ?? "(unknown)"}
- Person: ${target.person_name} (${target.person_title ?? "unknown title"})
- Sender: ${sender}

THIS IS FOLLOW-UP #${nextFollowupN} (Day ${db.outreachCadenceDays(nextFollowupN)} cadence).

PRIOR SENDS:
${historyBlock}

${signalsBlock}

Write follow-up #${nextFollowupN}. Return ONLY the JSON object.`;

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: loadPrefix(),
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
    let parsed: { text: string; reasoning?: string };
    try {
      parsed = extractJSON(raw);
    } catch {
      return NextResponse.json({ error: "Drafter returned non-JSON", raw }, { status: 502 });
    }
    return NextResponse.json({
      followup_n: nextFollowupN,
      text: parsed.text,
      reasoning: parsed.reasoning,
      usage: response.usage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Anthropic API error: ${err.message}` : "Anthropic API error" },
      { status: 500 }
    );
  }
}
