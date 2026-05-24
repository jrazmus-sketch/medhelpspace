import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Admin lesson-audio uploads route through a server action.
    // A typical 1h MP3 at 128 kbps is ~55 MB, so allow generous headroom.
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
