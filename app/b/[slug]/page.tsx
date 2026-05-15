import { notFound } from "next/navigation";
import { getBusiness } from "@/lib/businesses";
import { db } from "@/lib/db";
import { BusinessView } from "./business-view";

export const dynamic = "force-dynamic";

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const business = getBusiness(slug);
  if (!business) notFound();

  const [todos, leads, resources, notes, chat] = await Promise.all([
    Promise.resolve(db.listTodos({ businessId: slug })),
    Promise.resolve(db.listLeads({ businessId: slug })),
    Promise.resolve(db.listBusinessResources(slug)),
    Promise.resolve(db.listNotes({ businessId: slug })),
    Promise.resolve(db.listChat(slug)),
  ]);

  const shareToken = db.getOrCreateShareToken(slug);

  return (
    <BusinessView
      business={business}
      initialTab={tab ?? "todos"}
      initialTodos={todos}
      initialLeads={leads}
      initialResources={resources}
      initialNotes={notes}
      initialChat={chat}
      shareToken={shareToken}
    />
  );
}
