import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server-auth";
import { getEmailAccounts } from "@/lib/email-config";
import { db } from "@/lib/db";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  if (!(await isAdmin())) redirect("/login");

  const accounts = getEmailAccounts().map(({ index, name, address }) => ({ index, name, address }));
  const initialEmails = db.listEmails(undefined, 200);

  return <InboxClient accounts={accounts} initialEmails={initialEmails} />;
}
