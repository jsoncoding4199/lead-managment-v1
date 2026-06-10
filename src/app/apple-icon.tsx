import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS home-screen icon. Apple ignores rounded corners (the system masks for
 * us) and prefers an opaque background — so we draw flat color rather than
 * the rounded gradient used for Android.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #1f43e6 0%, #3460ff 50%, #5b87ff 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 110,
          fontWeight: 800,
          letterSpacing: -4,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        L
      </div>
    ),
    { ...size }
  );
}
