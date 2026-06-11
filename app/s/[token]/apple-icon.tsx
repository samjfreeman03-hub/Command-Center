import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";

/**
 * Per-business apple-touch icon for share links (/s/[token] and nested
 * /outreach). iMessage & friends use this for the compact link-preview
 * icon — white brand initial on the brand color (M on MTRNM green,
 * F on FLAIR red, etc.).
 */
export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const businessId = db.getBusinessByShareToken(token);
  const business = businessId ? getBusiness(businessId) : null;
  const letter = business?.name?.charAt(0).toUpperCase() ?? "C";
  const bg = business?.hex ?? "#09090b";

  return new ImageResponse(
    (
      <div
        style={{
          background: bg,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 112,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-4px",
          }}
        >
          {letter}
        </span>
      </div>
    ),
    { ...size }
  );
}
