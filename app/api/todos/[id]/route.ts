import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness, isAdmin } from "@/lib/server-auth";
import { flairOsWriteEnabled } from "@/lib/flair-os/config";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getTodoBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (db.todoIsMirrored(Number(id))) {
    // Two-way mode: ticking a FLAIR OS task completes it in FLAIR OS first.
    // Everything else about a mirrored task is still edited there.
    const wantsDone = !body || (!("assignee_ids" in body) && !("title" in body) && !("due_date" in body) && !("priority" in body));
    if (wantsDone && flairOsWriteEnabled() && (await isAdmin())) {
      const { completeDealTask } = await import("@/lib/flair-os/write");
      const r = await completeDealTask(Number(id), { trigger: "todo" });
      if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === "not_found" ? 404 : 502 });
      return NextResponse.json(r.value.todo);
    }
    return NextResponse.json(
      { error: flairOsWriteEnabled() ? "Managed in FLAIR OS. Only completion is written back from here." : "Managed in FLAIR OS. Writing back is off.", code: "flair_os_managed" },
      { status: 409 }
    );
  }
  if (body && "assignee_ids" in body) {
    const todo = db.setTodoAssignees(Number(id), Array.isArray(body.assignee_ids) ? body.assignee_ids : []);
    return NextResponse.json(todo);
  }
  if (body && ("title" in body || "due_date" in body || "priority" in body)) {
    const todo = db.updateTodo(Number(id), {
      title: body.title,
      due_date: body.due_date,
      priority: body.priority,
    });
    return NextResponse.json(todo);
  }
  const todo = db.toggleTodo(Number(id));
  return NextResponse.json(todo);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getTodoBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (db.todoIsMirrored(Number(id))) {
    return NextResponse.json(
      { error: "Managed in FLAIR OS. Changes arrive with write-back (phase 2).", code: "flair_os_managed" },
      { status: 409 }
    );
  }
  db.deleteTodo(Number(id));
  return NextResponse.json({ ok: true });
}
