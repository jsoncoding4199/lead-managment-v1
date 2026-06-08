import type { NextConfig } from "next";

const config: NextConfig = {
  // Tree-shake icon libraries aggressively. With per-icon imports lucide-react
  // ships hundreds of unused SVGs; this flag tells Next to import only the
  // icons we actually reference, shaving 30-50 KB off the client bundle.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Skip ESLint during build; we don't ship eslint deps anyway and it'd
  // otherwise fail the build on first run.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
