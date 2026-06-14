import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identifier so browsers + OSes can recognize the app even if
    // the URL changes (e.g. custom domain swap later). PWABuilder flags
    // its absence.
    id: "/",
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
      // 192x192 needs to be an actual 192px file — PWABuilder verifies
      // the served dimensions match what the manifest declares.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      // 512x512 served by Next's metadata icon at src/app/icon.png.
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable variant with ~10% padding so the funnel logo survives
      // Android's adaptive shape masks (circle, squircle, rounded square)
      // without being cropped.
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Screenshots populate Play Store listings + Chrome's install prompt.
    // Form factors: "wide" = tablet/desktop, "narrow" = phone. Placeholder
    // brand cards for now; swap for actual app captures whenever convenient.
    screenshots: [
      {
        src: "/screenshot-wide.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "Leadboard dashboard",
      },
      {
        src: "/screenshot-narrow.png",
        sizes: "750x1334",
        type: "image/png",
        form_factor: "narrow",
        label: "Leadboard mobile",
      },
    ],
  };
}
