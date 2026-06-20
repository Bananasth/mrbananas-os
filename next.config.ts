import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generate fully static, fast-to-crawl HTML wherever possible.
  // Server-rendered HTML (not client-only JS) is what AI crawlers read.
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Let AI crawlers and search engines cache aggressively.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
