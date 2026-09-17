"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Business } from "@/lib/businesses";
import type { LeadCategory } from "@/lib/types";
import type { TabId } from "@/lib/tabs";
import { OUTREACH_BUSINESS_IDS } from "@/lib/outreach-config";
import { BusinessWorkspace, type WorkspaceData } from "@/components/business-workspace";
import { Button, IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/host";
import { Link2, Pencil, Send, Eye, EyeOff } from "lucide-react";

/** Admin view of a business: the shared workspace plus owner-only controls. */
export function BusinessView({
  business,
  data,
  initialTab,
  openId,
  autoNew,
  shareToken,
  initialTagline,
  leadCategories,
  leadCategoriesEnabled,
  initialHidden,
}: {
  business: Business;
  data: WorkspaceData;
  initialTab: string;
  openId?: number;
  autoNew?: boolean;
  shareToken: string;
  initialTagline: string;
  leadCategories: LeadCategory[];
  leadCategoriesEnabled: boolean;
  initialHidden: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);
  const [tagline, setTagline] = useState(initialTagline);
  const [editingTagline, setEditingTagline] = useState(false);
  const [taglineDraft, setTaglineDraft] = useState(initialTagline);

  // Keep ?tab= in the URL so refresh/back keeps the active tab
  function onTabChange(next: TabId) {
    window.history.replaceState(null, "", `/b/${business.id}?tab=${next}`);
  }

  // Hiding only removes the business from the sidebar + dashboard; its data,
  // URL, and team share links keep working. refresh() re-renders the sidebar.
  async function setBusinessHidden(next: boolean) {
    setHidden(next);
    await fetch(`/api/businesses/${business.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    });
    router.refresh();
    if (next) toast(`${business.name} hidden`, { action: { label: "Undo", onClick: () => setBusinessHidden(false) } });
  }

  async function saveTagline() {
    const val = taglineDraft.trim();
    setEditingTagline(false);
    if (!val || val === tagline) return;
    setTagline(val);
    await fetch(`/api/businesses/${business.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagline: val }),
    });
  }

  function copyLink(path: string, message: string) {
    navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast(message, { tone: "success" });
  }

  const taglineNode = editingTagline ? (
    <input
      value={taglineDraft}
      onChange={(e) => setTaglineDraft(e.target.value)}
      onBlur={saveTagline}
      onKeyDown={(e) => {
        if (e.key === "Enter") saveTagline();
        if (e.key === "Escape") { setEditingTagline(false); setTaglineDraft(tagline); }
      }}
      autoFocus
      className="w-full max-w-md border-b border-line-strong bg-transparent text-[13px] text-ink-2 outline-none"
    />
  ) : (
    <button
      onClick={() => { setTaglineDraft(tagline); setEditingTagline(true); }}
      className="group inline-flex max-w-full items-center gap-1.5 text-left"
      title="Edit tagline"
    >
      <span className="truncate">{tagline}</span>
      <Pencil size={11} className="shrink-0 text-ink-4 opacity-70 transition-opacity md:opacity-0 md:group-hover:opacity-100" />
    </button>
  );

  const actions = (
    <>
      {!hidden && (
        <IconButton label="Hide from sidebar and dashboard (nothing is deleted)" onClick={() => setBusinessHidden(true)}>
          <EyeOff size={15} />
        </IconButton>
      )}
      {OUTREACH_BUSINESS_IDS.includes(business.id) && (
        <Button
          onClick={() => copyLink(`/s/${shareToken}/outreach`, "Outreach link copied")}
          title="Copy a link to just the Outreach tab (same team password)"
        >
          <Send size={13} />
          <span className="hidden sm:inline">Share outreach</span>
        </Button>
      )}
      <Button onClick={() => copyLink(`/s/${shareToken}`, "Team link copied")} title="Copy the full team share link">
        <Link2 size={13} />
        <span className="hidden sm:inline">Share</span>
      </Button>
    </>
  );

  const banner = hidden ? (
    <div className="flex w-full shrink-0 items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 sm:px-8 md:rounded-t-2xl">
      <span className="inline-flex items-center gap-1.5">
        <EyeOff size={12} className="shrink-0" />
        {business.name} is hidden from your sidebar and dashboard. Nothing is deleted, and team share links still work.
      </span>
      <button
        onClick={() => setBusinessHidden(false)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors hover:bg-amber-500/15"
      >
        <Eye size={12} /> Unhide
      </button>
    </div>
  ) : null;

  return (
    <BusinessWorkspace
      business={business}
      data={data}
      initialTab={initialTab}
      openId={openId}
      autoNew={autoNew}
      leadCategories={leadCategories}
      leadCategoriesEnabled={leadCategoriesEnabled}
      tagline={taglineNode}
      actions={actions}
      banner={banner}
      onTabChange={onTabChange}
    />
  );
}
