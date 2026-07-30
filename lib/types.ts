export type Todo = {
  id: number;
  business_id: string;
  title: string;
  notes: string | null;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  assigned_to: number | null;
  assignee_ids: number[];
  created_at: number;
  completed_at: number | null;
};

export type Lead = {
  id: number;
  business_id: string;
  name: string;
  company: string | null;
  contact_email: string | null;
  stage: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  value_cents: number | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  /** Custom user-defined category names (a lead can belong to several). */
  categories: string[];
  created_at: number;
  updated_at: number;
};

export type LeadCategory = {
  id: number;
  business_id: string;
  name: string;
  color_index: number;
  sort_order: number;
  created_at: number;
};

export type BizEvent = {
  id: number;
  business_id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** Free-text time, e.g. "8pm-2am" or "18:00" */
  time: string | null;
  venue: string | null;
  city: string | null;
  status: "planning" | "confirmed" | "completed" | "cancelled";
  event_link: string | null;
  expected_attendance: number | null;
  partners: string[];
  sponsors: string[];
  notes: string | null;
  created_at: number;
  updated_at: number;
};

export const EVENT_STATUSES = [
  { value: "planning",  label: "Planning",  color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" },
  { value: "completed", label: "Completed", color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" },
  { value: "cancelled", label: "Cancelled", color: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300" },
] as const;

export const LEAD_STAGES: Lead["stage"][] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
];

export type Note = {
  id: number;
  business_id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
};

export type ChatMessage = {
  id: number;
  business_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

export type TeamMember = {
  id: number;
  business_id: string;
  name: string;
  title: string | null;
  color_index: number;
  created_at: number;
};

export type BusinessResource = {
  id: number;
  business_id: string;
  type: "link" | "file";
  label: string;
  url: string | null;
  filename: string | null;
  stored_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: number;
};

export type BrandContact = {
  id: number;
  business_id: string;
  brand_name: string;
  contact_name: string | null;
  contact_title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: "prospect" | "in_network" | "active_partner" | "past_partner";
  notes: string | null;
  /** Custom user-defined category names (shared tag pool with the pipeline). */
  categories: string[];
  created_at: number;
  updated_at: number;
};

export const BRAND_STATUSES = [
  { value: "prospect",       label: "Prospect",        color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400" },
  { value: "in_network",     label: "In Network",      color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" },
  { value: "active_partner", label: "Active Partner",  color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" },
  { value: "past_partner",   label: "Past Partner",    color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" },
] as const;

export type BrandStatus = BrandContact["status"];

export type BrandAttachment = {
  id: number;
  brand_id: number;
  type: "link" | "file";
  label: string | null;
  url: string | null;
  filename: string | null;
  stored_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: number;
};

export type LeadAttachment = {
  id: number;
  lead_id: number;
  type: "link" | "file";
  label: string | null;
  url: string | null;
  filename: string | null;
  stored_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: number;
};

export type OutreachStatus =
  | "queued"
  | "drafted"
  | "sent"
  | "replied"
  | "converted"
  | "declined"
  | "dead";

export const OUTREACH_STATUSES = [
  { value: "queued",    label: "Queued",    color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400" },
  { value: "drafted",   label: "Drafted",   color: "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300" },
  { value: "sent",      label: "Sent",      color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" },
  { value: "replied",   label: "Replied",   color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" },
  { value: "converted", label: "Converted", color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" },
  { value: "declined",  label: "Declined",  color: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300" },
  { value: "dead",      label: "Dead",      color: "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600" },
] as const;

export type OutreachDrafts = {
  templateA: { connectionNote: string; firstDM: string };
  templateB: { connectionNote: string; firstDM: string };
  /** Cold email variant (subject + plain-text body). */
  email?: { subject: string; body: string };
  reasoning?: string;
  generated_at: number;
};

export type OutreachSignal = {
  type: "campaign" | "hire" | "funding" | "launch" | "partnership" | "other";
  summary: string;
  source: string;
};

export type CandidateContact = {
  name: string;
  title: string;
  linkedin_url: string | null;
  email: string | null;
  role_category:
    | "college-or-next-gen"
    | "influencer-or-partnerships"
    | "social-or-community"
    | "experiential"
    | "brand-marketing-exec"
    | "other";
  source: string | null;
  confidence: "high" | "medium" | "low";
  /** "apollo" when the contact came from Apollo's verified DB, "web_search" when from Claude's web search fallback. */
  origin?: "apollo" | "web_search";
};

export type OutreachSignals = {
  signals: OutreachSignal[];
  summary_for_drafter: string;
  /** Why this brand × this business makes sense — drafters weave this into messages. */
  fit_rationale?: string;
  fetched_at: number;
};

export type OutreachTarget = {
  id: number;
  business_id: string;
  brand_name: string;
  brand_category: string | null;
  brand_size: "enterprise" | "midsize" | "emerging" | null;
  person_name: string;
  person_title: string | null;
  linkedin_url: string | null;
  person_email: string | null;
  source: "manual" | "auto-generated" | "import" | null;
  status: OutreachStatus;
  signals_json: string | null;
  drafts_json: string | null;
  sent_history_json: string | null;
  sent_at: number | null;
  replied_at: number | null;
  next_followup_at: number | null;
  followup_count: number;
  converted_lead_id: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};
