import { db } from "@/lib/db";
import { AskView } from "@/components/ask-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ask AI · Command Center" };

/** Global assistant: sees every business, can act in any of them. Admin only (middleware). */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <AskView initialMessages={db.listAsk()} initialQuery={q ?? ""} />;
}
