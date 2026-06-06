import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

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
  db.deleteTodo(Number(id));
  return NextResponse.json({ ok: true });
}
