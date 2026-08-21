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
  async rewrites() {
    return [
      {
        // Short, pasteable alias for the 100-question simulado funnel, added for
        // WhatsApp-group sharing (2026-08-21): medhelpspace.com.br/simulado.
        //
        // A REWRITE, not a redirect, on purpose. The short URL stays in the address
        // bar, and — more importantly — link-preview crawlers scrape it exactly as
        // they scrape the real page, with no redirect hop to mishandle.
        //
        // /simulado-revalida stays the canonical URL: it is what the drip emails, the
        // broadcast magic links, the Google Ads campaign and SIMULADO_PATH all point
        // at, and what the sitemap lists. The page's `alternates.canonical` keeps
        // Google consolidating on it, so this alias adds no duplicate-content cost.
        //
        // Only the funnel's ENTRY point is aliased. Once the form is submitted the
        // user moves on to /simulado-revalida/prova|resultado|turma, which is fine —
        // those are never pasted anywhere by hand.
        source: "/simulado",
        destination: "/simulado-revalida",
      },
    ];
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
