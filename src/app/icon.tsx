import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

/**
 * Favicon + manifest small icon, generated at build/request time from JSX.
 * A rounded brand-blue square with a stylized "L" mark.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #1f43e6 0%, #3460ff 50%, #5b87ff 100%)",
          borderRadius: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 120,
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
