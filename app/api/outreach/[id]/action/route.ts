import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

type ActionBody =
  | { action: "mark-sent"; text: string; template: "A" | "B" | "Email" }
  | { action: "mark-followup-sent"; text: string }
  | { action: "mark-replied" }
  | { action: "reset-cadence" };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const targetId = Number(id);
  const bizId = db.getOutreachBizId(targetId);
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as ActionBody;

  try {
    let target;
    switch (body.action) {
      case "mark-sent":
        if (!body.text || !body.template) {
          return NextResponse.json({ error: "text and template required" }, { status: 400 });
        }
        target = db.markOutreachSent(targetId, { text: body.text, template: body.template });
        break;
      case "mark-followup-sent":
        if (!body.text) {
          return NextResponse.json({ error: "text required" }, { status: 400 });
        }
        target = db.markFollowupSent(targetId, { text: body.text });
        break;
      case "mark-replied":
        target = db.markOutreachReplied(targetId);
        break;
      case "reset-cadence":
        target = db.updateOutreach(targetId, {
          status: "queued",
          sent_at: null,
          next_followup_at: null,
          followup_count: 0,
          sent_history_json: null,
        });
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json(target);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
