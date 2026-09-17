import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { hasSharePasswordAuth } from "@/lib/server-auth";
import { eventsEnabled } from "@/lib/events-config";
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

  const data = {
    initiatives: db.listInitiatives(businessId),
    todos: db.listTodos({ businessId }),
    leads: db.listLeads({ businessId }),
    events: eventsEnabled(businessId) ? db.listEvents(businessId) : [],
    outreach: db.listOutreach({ businessId }),
    brands: db.listBrandContacts(businessId),
    resources: db.listBusinessResources(businessId),
    notes: db.listNotes({ businessId }),
    chat: db.listChat(businessId),
    members: db.listTeamMembers(businessId),
  };

  return (
    <SharedView
      business={business}
      shareToken={token}
      tagline={db.getBusinessTagline(businessId) ?? business.tagline}
      data={data}
    />
  );
}
