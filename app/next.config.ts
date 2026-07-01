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
  async redirects() {
    return [
      {
        // Free magnet renamed /simulado-honesto → /questoes-revalida (2026-07-01).
        // Keeps live Google Ads clicks, already-sent drip-email links, and indexed
        // SEO URLs working. `:path*` also covers /simulado-honesto/resultado?lead=…
        // (the durable result link in every funnel email). Query strings are
        // preserved automatically.
        source: "/simulado-honesto/:path*",
        destination: "/questoes-revalida/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
