import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Keep the deferred Recharts chunk limited to the primitives the chart uses.
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
