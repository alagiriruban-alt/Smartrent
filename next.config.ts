import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen shows one landlord's private records. Leave the shared
  // cache shell off so a page is never reused across accounts.
  cacheComponents: false,
  experimental: {
    // A 10 MB file plus the multipart wrapper needs room above the 1 MB default.
    serverActions: {
      bodySizeLimit: "12mb",
    },
    proxyClientMaxBodySize: "12mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
