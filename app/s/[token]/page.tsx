import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { hasSharePasswordAuth } from "@/lib/server-auth";
import { SharedView } from "./shared-view";
import { SharePasswordGate } from "./share-password-gate";

export const dynamic = "force-dynamic";

/** Link-preview + tab title: "MTRNM Team" / "FLAIR Team". */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const businessId = db.getBusinessByShareToken(token);
  const business = businessId ? BUSINESSES.find((b) => b.id === businessId) : null;
  if (!business) return { title: "Shared workspace" };
  const title = `${business.name} Team`;
  const description = `Team workspace for ${business.name} — todos, pipeline, outreach, CRM`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: business.name },
  };
}

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

  // Password gate — render the gate instead of the SharedView until the
  // visitor enters the team password. Cookie persists 30 days.
  if (!(await hasSharePasswordAuth(businessId))) {
    return <SharePasswordGate business={business} />;
  }

  const [todos, leads, resources, notes, chat, members, brands, outreach] = await Promise.all([
    Promise.resolve(db.listTodos({ businessId })),
    Promise.resolve(db.listLeads({ businessId })),
    Promise.resolve(db.listBusinessResources(businessId)),
    Promise.resolve(db.listNotes({ businessId })),
    Promise.resolve(db.listChat(businessId)),
    Promise.resolve(db.listTeamMembers(businessId)),
    Promise.resolve(db.listBrandContacts(businessId)),
    Promise.resolve(db.listOutreach({ businessId })),
  ]);

  const customTagline = db.getBusinessTagline(businessId);

  return (
    <SharedView
      business={business}
      shareToken={token}
      tagline={customTagline ?? business.tagline}
      initialTodos={todos}
      initialLeads={leads}
      initialResources={resources}
      initialNotes={notes}
      initialChat={chat}
      initialMembers={members}
      initialBrands={brands}
      initialOutreach={outreach}
    />
  );
}
