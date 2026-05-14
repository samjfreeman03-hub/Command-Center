import { NextResponse } from "next/server";

export async function GET() {
  const pw = process.env.ADMIN_PASSWORD;
  return NextResponse.json({
    set: !!pw,
    length: pw?.length ?? 0,
    chars: pw ? Array.from(pw).map((c) => c.charCodeAt(0)) : [],
  });
}
