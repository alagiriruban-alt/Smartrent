import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen shows one landlord's private records. Leave the shared
  // cache shell off so a page is never reused across accounts.
  cacheComponents: false,
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
