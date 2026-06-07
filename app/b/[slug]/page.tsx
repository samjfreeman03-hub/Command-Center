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

  const [todos, leads, resources, notes, chat, members, brands, outreach] = await Promise.all([
    Promise.resolve(db.listTodos({ businessId: slug })),
    Promise.resolve(db.listLeads({ businessId: slug })),
    Promise.resolve(db.listBusinessResources(slug)),
    Promise.resolve(db.listNotes({ businessId: slug })),
    Promise.resolve(db.listChat(slug)),
    Promise.resolve(db.listTeamMembers(slug)),
    Promise.resolve(db.listBrandContacts(slug)),
    Promise.resolve(db.listOutreach({ businessId: slug })),
  ]);

  const shareToken = db.getOrCreateShareToken(slug);
  const customTagline = db.getBusinessTagline(slug);

  return (
    <BusinessView
      business={business}
      initialTab={tab ?? "todos"}
      initialTodos={todos}
      initialLeads={leads}
      initialResources={resources}
      initialNotes={notes}
      initialChat={chat}
      initialMembers={members}
      initialBrands={brands}
      initialOutreach={outreach}
      shareToken={shareToken}
      initialTagline={customTagline ?? business.tagline}
    />
  );
}
