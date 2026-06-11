import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BUSINESSES } from "@/lib/businesses";
import { hasSharePasswordAuth } from "@/lib/server-auth";
import { getOutreachConfig } from "@/lib/outreach-config";
import { SharePasswordGate } from "../share-password-gate";
import { OutreachSharedView } from "./outreach-shared-view";

export const dynamic = "force-dynamic";

/**
 * Outreach-only share page: /s/[token]/outreach
 *
 * Same token and same per-business team password as the full share page —
 * the share_pw cookie is path "/" so unlocking either page unlocks both.
 * Only exists for businesses with an outreach config (FLAIR + MTRNM).
 */
export default async function OutreachSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const businessId = db.getBusinessByShareToken(token);
  if (!businessId) notFound();

  const business = BUSINESSES.find((b) => b.id === businessId);
  if (!business) notFound();

  // Outreach-only links exist solely for outreach-enabled businesses.
  if (!getOutreachConfig(businessId)) notFound();

  if (!(await hasSharePasswordAuth(businessId))) {
    return <SharePasswordGate business={business} />;
  }

  const outreach = db.listOutreach({ businessId });

  return (
    <OutreachSharedView
      business={business}
      shareToken={token}
      initialOutreach={outreach}
    />
  );
}
