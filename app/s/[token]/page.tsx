import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { SharedView } from "./shared-view";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const businessId = db.getBusinessByShareToken(token);
  if (!businessId) notFound();

  const business = BUSINESSES.find((b) => b.id === businessId);
  if (!business) notFound();

  const [todos, leads, resources, notes, chat, members, brands] = await Promise.all([
    Promise.resolve(db.listTodos({ businessId })),
    Promise.resolve(db.listLeads({ businessId })),
    Promise.resolve(db.listBusinessResources(businessId)),
    Promise.resolve(db.listNotes({ businessId })),
    Promise.resolve(db.listChat(businessId)),
    Promise.resolve(db.listTeamMembers(businessId)),
    Promise.resolve(db.listBrandContacts(businessId)),
  ]);

  return (
    <SharedView
      business={business}
      shareToken={token}
      initialTodos={todos}
      initialLeads={leads}
      initialResources={resources}
      initialNotes={notes}
      initialChat={chat}
      initialMembers={members}
      initialBrands={brands}
    />
  );
}
