import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leadboard",
    short_name: "Leadboard",
    description: "A focused lead pipeline for small teams.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // background_color is what Android paints behind the launcher icon on
    // cold-start splash. Matching the dashboard's actual first-paint color
    // (white) makes the splash visually identical to the loaded app — no
    // dark-to-light "flash", so the launch feels instant.
    background_color: "#ffffff",
    theme_color: "#1f43e6",
    categories: ["business", "productivity"],
    icons: [
      // src/app/icon.png is a real PNG (512x512). Android scales it down
      // for the 192-size manifest slot without quality loss. Listed twice
      // so PWA validators see both required sizes.
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable variant with ~10% padding so the funnel logo survives
      // Android's adaptive shape masks (circle, squircle, rounded square)
      // without being cropped.
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
