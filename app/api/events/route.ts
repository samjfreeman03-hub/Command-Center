import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { eventsEnabled } from "@/lib/events-config";

/** GET /api/events?business_id= — list a business's events. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!eventsEnabled(businessId)) {
    return NextResponse.json({ error: "Events are not enabled for this business" }, { status: 400 });
  }
  return NextResponse.json(db.listEvents(businessId));
}

/** POST /api/events — create an event. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.business_id || !body?.name?.trim()) {
    return NextResponse.json({ error: "business_id and name required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!eventsEnabled(body.business_id)) {
    return NextResponse.json({ error: "Events are not enabled for this business" }, { status: 400 });
  }
  const event = db.createEvent({
    business_id: body.business_id,
    name: body.name,
    date: body.date || null,
    time: body.time || null,
    venue: body.venue || null,
    city: body.city || null,
    status: body.status,
    event_link: body.event_link || null,
    expected_attendance: typeof body.expected_attendance === "number" ? body.expected_attendance : null,
    partners: Array.isArray(body.partners) ? body.partners : [],
    sponsors: Array.isArray(body.sponsors) ? body.sponsors : [],
    notes: body.notes || null,
  });
  return NextResponse.json(event);
}
