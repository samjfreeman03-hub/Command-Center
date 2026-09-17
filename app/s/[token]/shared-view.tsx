"use client";

import type { Business } from "@/lib/businesses";
import { ShareTokenContext } from "@/lib/share-context";
import { BusinessWorkspace, type WorkspaceData } from "@/components/business-workspace";

/** Team share view: the same workspace as the admin page, minus owner controls. */
export function SharedView({
  business,
  shareToken,
  tagline,
  data,
}: {
  business: Business;
  shareToken: string;
  tagline: string;
  data: WorkspaceData;
}) {
  return (
    <ShareTokenContext.Provider value={shareToken}>
      <div className="min-h-dvh bg-canvas">
        <BusinessWorkspace business={business} data={data} tagline={tagline} stickyClass="tabs-sticky-top" />
      </div>
    </ShareTokenContext.Provider>
  );
}
