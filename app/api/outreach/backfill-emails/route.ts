import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { apolloIsConfigured, apolloMatchEmailForPerson } from "@/lib/apollo";
import type { OutreachTarget } from "@/lib/types";

export const maxDuration = 60; // seconds

const PLACEHOLDER_NAME = "(to research)";
/** Cap per invocation so a single request can't run unbounded; UI re-runs for the rest. */
const MAX_PER_RUN = 60;
const CONCURRENCY = 5;

/**
 * Retroactively unlock + fill emails on outreach targets that don't have one yet.
 * Scoped to a single business. Costs ~1 Apollo credit per contact attempted.
 *
 * POST body: { business_id: string }
 * Returns: { attempted, updated, failed, remaining, targets: OutreachTarget[] }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const businessId: string | undefined = body?.business_id;
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!apolloIsConfigured()) {
    return NextResponse.json(
      { error: "Apollo is not configured — set APOLLO_API_KEY to unlock emails." },
      { status: 400 }
    );
  }

  // Targets in this business that lack an email and have a real (non-placeholder) name.
  const all = db.listOutreach({ businessId });
  const missing = all.filter(
    (t) => !t.person_email && t.person_name && t.person_name !== PLACEHOLDER_NAME
  );
  const batch = missing.slice(0, MAX_PER_RUN);

  let attempted = 0;
  let updated = 0;
  let failed = 0;
  const updatedTargets: OutreachTarget[] = [];

  // Process in small concurrent chunks to stay gentle on Apollo's rate limits.
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (t) => {
        attempted++;
        const match = await apolloMatchEmailForPerson({
          name: t.person_name,
          organizationName: t.brand_name,
          linkedinUrl: t.linkedin_url,
        });
        return { target: t, match };
      })
    );
    for (const { target, match } of results) {
      if (match?.email) {
        const patch: Partial<OutreachTarget> = { person_email: match.email };
        // Fill in a missing LinkedIn URL too while we're here.
        if (!target.linkedin_url && match.linkedin_url) patch.linkedin_url = match.linkedin_url;
        const next = db.updateOutreach(target.id, patch);
        updatedTargets.push(next);
        updated++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({
    attempted,
    updated,
    failed,
    remaining: Math.max(0, missing.length - batch.length),
    targets: updatedTargets,
  });
}
