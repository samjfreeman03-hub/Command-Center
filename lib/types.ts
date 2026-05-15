export type Todo = {
  id: number;
  business_id: string;
  title: string;
  notes: string | null;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
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
