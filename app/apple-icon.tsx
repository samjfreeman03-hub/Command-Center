import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#09090b",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2px",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-3px",
            lineHeight: 1,
          }}
        >
          CC
        </span>
        <span
          style={{
            color: "#71717a",
            fontSize: 18,
            fontWeight: 400,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          Command
        </span>
      </div>
    ),
    { ...size }
  );
}
