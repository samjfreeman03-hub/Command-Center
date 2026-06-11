import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";

/** Per-business favicon for share links — brand initial on brand color. */
export const dynamic = "force-dynamic";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon({
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
          borderRadius: 6,
        }}
      >
        <span style={{ color: "white", fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
          {letter}
        </span>
      </div>
    ),
    { ...size }
  );
}
