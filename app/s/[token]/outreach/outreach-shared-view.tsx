"use client";

import { brandVars, type Business } from "@/lib/businesses";
import type { OutreachTarget } from "@/lib/types";
import { OutreachPanel } from "@/components/outreach-panel";
import { ShareTokenContext } from "@/lib/share-context";
import { BrandTile } from "@/components/ui/display";

/**
 * Standalone outreach view for team members. Same panel the admin sees,
 * wrapped in the share-token context so every API call authenticates via
 * the x-share-token header.
 */
export function OutreachSharedView({
  business,
  shareToken,
  initialOutreach,
}: {
  business: Business;
  shareToken: string;
  initialOutreach: OutreachTarget[];
}) {
  const column = "mx-auto w-full max-w-6xl";
  return (
    <ShareTokenContext.Provider value={shareToken}>
      <div className="brand-scope flex min-h-screen flex-col bg-canvas" style={brandVars(business)}>
        <header className="shrink-0 border-b border-line px-4 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-7">
          <div className={`${column} flex items-center gap-3.5`}>
            <BrandTile business={business} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{business.name}</h1>
              <div className="text-[13px] text-ink-3">Outreach</div>
            </div>
          </div>
        </header>

        <div className="pb-safe-10 w-full flex-1 px-4 pt-5 sm:px-8 sm:pt-6">
          <div className={column}>
            <OutreachPanel businessId={business.id} initial={initialOutreach} />
          </div>
        </div>
      </div>
    </ShareTokenContext.Provider>
  );
}
