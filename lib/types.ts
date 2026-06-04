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
  created_at: number;
  updated_at: number;
};

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
