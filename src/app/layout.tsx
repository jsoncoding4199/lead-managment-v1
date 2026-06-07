import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leadboard — Lead Management",
  description: "A focused lead pipeline for small teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
