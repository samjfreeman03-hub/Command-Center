import { notFound } from "next/navigation";
import { getBusiness } from "@/lib/businesses";
import { db } from "@/lib/db";
import { leadCategoriesEnabled } from "@/lib/pipeline-config";
import { eventsEnabled } from "@/lib/events-config";
import { BusinessView } from "./business-view";

export const dynamic = "force-dynamic";

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; open?: string; new?: string }>;
}) {
  const { slug } = await params;
  const { tab, open, new: isNew } = await searchParams;
  const business = getBusiness(slug);
  if (!business) notFound();

  const data = {
    initiatives: db.listInitiatives(slug),
    todos: db.listTodos({ businessId: slug }),
    leads: db.listLeads({ businessId: slug }),
    events: eventsEnabled(slug) ? db.listEvents(slug) : [],
    outreach: db.listOutreach({ businessId: slug }),
    brands: db.listBrandContacts(slug),
    resources: db.listBusinessResources(slug),
    notes: db.listNotes({ businessId: slug }),
    chat: db.listChat(slug),
    members: db.listTeamMembers(slug),
  };

  const openId = open ? Number(open) : undefined;

  return (
    <BusinessView
      business={business}
      data={data}
      initialTab={tab ?? "initiatives"}
      openId={Number.isFinite(openId) ? openId : undefined}
      autoNew={isNew === "1"}
      shareToken={db.getOrCreateShareToken(slug)}
      initialTagline={db.getBusinessTagline(slug) ?? business.tagline}
      leadCategories={leadCategoriesEnabled(slug) ? db.listLeadCategories(slug) : []}
      leadCategoriesEnabled={leadCategoriesEnabled(slug)}
      initialHidden={db.hiddenBusinessIds().includes(slug)}
    />
  );
}
