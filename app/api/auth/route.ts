import { NextResponse } from "next/server";
import { createHash } from "crypto";

function computeSessionToken(): string {
  return createHash("sha256")
    .update((process.env.ADMIN_PASSWORD ?? "") + "cc_session_v1")
    .digest("hex");
}

export async function POST(request: Request) {
  const { password } = await request.json();
  if (!process.env.ADMIN_PASSWORD || password.trim() !== process.env.ADMIN_PASSWORD.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("cc_session", computeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("cc_session");
  return res;
}
