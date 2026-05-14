import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const patch = await req.json();
  const note = db.updateNote(Number(id), { title: patch.title, content: patch.content });
  return NextResponse.json(note);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  db.deleteNote(Number(id));
  return NextResponse.json({ ok: true });
}
