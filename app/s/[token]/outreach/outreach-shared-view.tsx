"use client";

import type { Business } from "@/lib/businesses";
import type { OutreachTarget } from "@/lib/types";
import { OutreachPanel } from "@/components/outreach-panel";
import { ShareTokenContext } from "@/lib/share-context";
import { Send } from "lucide-react";

/**
 * Standalone outreach view for team members — same panel the admin sees,
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
  return (
    <ShareTokenContext.Provider value={shareToken}>
      <div className="flex flex-col min-h-screen">

        {/* Header — white background, brand identity via pill + name color */}
        <header className="w-full shrink-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
          <div className="px-4 sm:px-8 lg:px-10 pt-5 pb-5 sm:pt-7 sm:pb-7">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold mb-2.5 ${business.accentBg} ${business.accent} ring-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${business.dot}`} />
              <span className="truncate max-w-[180px] sm:max-w-none">{business.fullName}</span>
            </div>
            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight mb-1 ${business.accent}`}>
              {business.name} Outreach
            </h1>
            <p className="text-sm text-zinc-500 leading-snug flex items-center gap-1.5">
              <Send size={12} /> Team outreach workspace — find contacts, draft, send, track follow-ups
            </p>
          </div>
        </header>

        {/* Panel */}
        <div className="w-full px-4 sm:px-8 lg:px-10 pt-5 pb-10 safe-bottom flex-1">
          <OutreachPanel businessId={business.id} initial={initialOutreach} />
        </div>
      </div>
    </ShareTokenContext.Provider>
  );
}
