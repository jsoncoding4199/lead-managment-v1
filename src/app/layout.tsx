import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Leadboard — Lead Management",
  description: "A focused lead pipeline for small teams.",
  applicationName: "Leadboard",
  appleWebApp: {
    capable: true,
    title: "Leadboard",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1f43e6",
  // Lets the app draw under the iOS notch / Android cutouts when installed.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/*
          Inline SW registration. Two reasons it lives in <head> instead of
          being delegated to the <ServiceWorkerRegistrar /> React component:
            - PWABuilder's HTML parser scans the response body for any
              `serviceWorker.register('/sw.js')` reference and reports the
              site as "not a PWA" if it can't find one statically. The
              client component's bundled JS isn't visible to that parser.
            - Registering during HTML parse (before React hydrates) gets
              the SW installing milliseconds sooner. Idempotent — the
              ServiceWorkerRegistrar below is harmless defense in depth.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(r){r.update().catch(function(){});}).catch(function(){})}",
          }}
        />
      </head>
      <body className={inter.className}>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
