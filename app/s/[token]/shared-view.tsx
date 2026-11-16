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
  today,
  flairOsEnabled = false,
}: {
  business: Business;
  shareToken: string;
  tagline: string;
  data: WorkspaceData;
  today: string;
  /** FLAIR OS mirror is configured (server flag); share views only read it. */
  flairOsEnabled?: boolean;
}) {
  return (
    <ShareTokenContext.Provider value={shareToken}>
      <div className="min-h-dvh bg-canvas">
        <BusinessWorkspace
          business={business}
          data={data}
          tagline={tagline}
          stickyClass="tabs-sticky-top"
          share
          today={today}
          flairOs={flairOsEnabled ? { enabled: true, canSync: false } : undefined}
        />
      </div>
    </ShareTokenContext.Provider>
  );
}
