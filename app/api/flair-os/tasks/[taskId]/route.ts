import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled, flairOsWriteEnabled } from "@/lib/flair-os/config";
import { completeDealTask } from "@/lib/flair-os/write";

export const dynamic = "force-dynamic";

/** Owner only. `taskId` is the Command Center todo id of a mirrored FLAIR OS task. { done: true } completes it in FLAIR OS first. */
export async function PATCH(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  if (!flairOsWriteEnabled()) return NextResponse.json({ error: "Writing to FLAIR OS is off.", code: "writes_off" }, { status: 409 });
  const { taskId } = await ctx.params;
  const todoId = Number(taskId);
  if (!Number.isInteger(todoId) || todoId <= 0) return NextResponse.json({ error: "Bad task id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { done?: unknown };
  if (body.done !== true) return NextResponse.json({ error: "Only { done: true } is supported; reopen tasks in FLAIR OS." }, { status: 400 });
  const r = await completeDealTask(todoId, { trigger: "todo" });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === "not_found" ? 404 : r.code === "writes_off" ? 409 : 502 });
  return NextResponse.json({ ok: true, todo: r.value.todo });
}
