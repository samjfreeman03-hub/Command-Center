import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { getEmailAccounts } from "@/lib/email-config";

/** Returns connected email account names + addresses (no passwords). */
export async function GET() {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = getEmailAccounts().map(({ name, address }) => ({
    name,
    address,
  }));

  return NextResponse.json(accounts);
}
