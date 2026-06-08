import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { OUTREACH_STATUSES } from "@/lib/types";
import type { OutreachTarget } from "@/lib/types";

/**
 * CSV export of every outreach target for a business.
 * Useful for sanity-checking data, manual backups, or cross-tool work.
 */

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180: wrap in quotes if value contains comma, quote, or newline.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtTimestamp(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function buildCSV(rows: OutreachTarget[]): string {
  const header = [
    "id",
    "brand_name",
    "brand_category",
    "brand_size",
    "person_name",
    "person_title",
    "linkedin_url",
    "person_email",
    "status",
    "source",
    "sent_at",
    "replied_at",
    "next_followup_at",
    "followup_count",
    "created_at",
    "updated_at",
    "notes",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.brand_name,
        r.brand_category ?? "",
        r.brand_size ?? "",
        r.person_name,
        r.person_title ?? "",
        r.linkedin_url ?? "",
        r.person_email ?? "",
        r.status,
        r.source ?? "",
        fmtTimestamp(r.sent_at),
        fmtTimestamp(r.replied_at),
        fmtTimestamp(r.next_followup_at),
        r.followup_count,
        fmtTimestamp(r.created_at),
        fmtTimestamp(r.updated_at),
        r.notes ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Sort by created_at descending for export so newest first.
  // Pull all statuses, not just active.
  const targets = OUTREACH_STATUSES.flatMap((s) =>
    db.listOutreach({ businessId, status: s.value })
  );
  // listOutreach is ordered by status priority — sort by created_at for export readability
  targets.sort((a, b) => b.created_at - a.created_at);
  const csv = buildCSV(targets);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="outreach-${businessId}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
