import { getBusiness } from "@/lib/businesses";

/** Coerce an IOU body from the client or a tool. Returns null when invalid. */
export function cleanIou(body: Record<string, unknown>) {
  const direction: "owe" | "owed" | null = body.direction === "owe" ? "owe" : body.direction === "owed" ? "owed" : null;
  const party = typeof body.party === "string" ? body.party.trim() : "";
  const businessId = typeof body.business_id === "string" && getBusiness(body.business_id) ? body.business_id : "personal";
  const amount = body.amount_cents == null || body.amount_cents === "" ? null : Number(body.amount_cents);
  return {
    direction,
    party,
    business_id: businessId,
    amount_cents: amount != null && Number.isFinite(amount) ? Math.round(amount) : null,
    note: typeof body.note === "string" && body.note.trim() ? body.note : null,
    due_date: typeof body.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null,
  };
}
