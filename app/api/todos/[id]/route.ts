import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const todo = db.toggleTodo(Number(id));
  return NextResponse.json(todo);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  db.deleteTodo(Number(id));
  return NextResponse.json({ ok: true });
}
