import type { NextConfig } from "next";

// medhelpspace.com.br/<path> → homepage with that network's UTMs (see redirects()).
const SOCIAL_SHORT_LINKS = [
  { path: "/instagram", source: "instagram", medium: "organic_social" },
  { path: "/tiktok", source: "tiktok", medium: "organic_social" },
  { path: "/youtube", source: "youtube", medium: "organic_video" },
] as const;

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
      {
        // Second alias, same page. Reads better in a chat than /simulado, and exists
        // because a link-preview cache is per-URL and cannot be busted any other way:
        // /simulado was first scraped while the card was still 216KB, which WhatsApp
        // renders as the SMALL layout, and that verdict sticks for days. A path it has
        // never seen gets a clean scrape of the fixed card.
        source: "/simulado-gratis",
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
      // Short links for the social profiles (Karina 2026-10-12): the bio shows a clean
      // URL, GA4 + the first-touch cookie still get the UTMs from the landing URL.
      // TEMPORARY (307) on purpose — she wants to change the UTMs later without a
      // browser-cached permanent redirect pinning the old ones.
      ...SOCIAL_SHORT_LINKS.map(({ path, source, medium }) => ({
        source: path,
        destination: `/?utm_source=${source}&utm_medium=${medium}&utm_campaign=perfil_revalida`,
        permanent: false,
      })),
    ];
  },
};

export default nextConfig;
