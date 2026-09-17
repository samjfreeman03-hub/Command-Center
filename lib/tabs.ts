import {
  Target, ListTodo, TrendingUp, CalendarDays, Send, Building2, FolderOpen, StickyNote, MessageSquare, Users,
} from "lucide-react";
import { OUTREACH_BUSINESS_IDS } from "./outreach-config";
import { EVENTS_BUSINESS_IDS } from "./events-config";

/** Single source of truth for business-page tabs (admin view, share view, command palette). */
export const TABS = [
  { id: "initiatives", label: "Initiatives", Icon: Target },
  { id: "todos",       label: "Todos",       Icon: ListTodo },
  { id: "pipeline",    label: "Pipeline",    Icon: TrendingUp },
  { id: "events",      label: "Events",      Icon: CalendarDays },
  { id: "outreach",    label: "Outreach",    Icon: Send },
  { id: "brands",      label: "CRM",         Icon: Building2 },
  { id: "resources",   label: "Resources",   Icon: FolderOpen },
  { id: "notes",       label: "Notes",       Icon: StickyNote },
  { id: "chat",        label: "Chat",        Icon: MessageSquare },
  { id: "team",        label: "Team",        Icon: Users },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** Feature-flagged tabs: Outreach (FLAIR + MTRNM), Events (TechSpace + MTRNM + FLAIR). */
export function tabsForBusiness(businessId: string) {
  return TABS.filter(
    (t) =>
      (t.id !== "outreach" || OUTREACH_BUSINESS_IDS.includes(businessId)) &&
      (t.id !== "events" || EVENTS_BUSINESS_IDS.includes(businessId))
  );
}
