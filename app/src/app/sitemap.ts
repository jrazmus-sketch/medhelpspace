import type { MetadataRoute } from "next";

// www is the canonical host — the apex 308s to it and the Search Console property is
// https://www.medhelpspace.com.br/ (Karina 2026-10-13). Never list a URL that redirects.
const SITE = "https://www.medhelpspace.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      // The MedHelpSpace home page — the two-product chooser (Karina 2026-11-05).
      url: SITE,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      // The Revalida sales page (was "/" until 2026-11-05).
      url: `${SITE}/revalida`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      // The ClinAct sales page.
      url: `${SITE}/clinact`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE}/loja`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      // Free lead magnet — indexable SEO landing for "questões revalida".
      url: `${SITE}/questoes-revalida`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      // Free-50 flashcards — THE indexable landing for "flashcards revalida". The open deck
      // at /flashcards-gratis stays live for the e-mail links but is noindex (Karina 2026-10-13).
      url: `${SITE}/flashcards-revalida`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      // Free 100-question simulado — indexable SEO landing for "simulado revalida".
      url: `${SITE}/simulado-revalida`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE}/termos`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE}/privacidade`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    // /login and /signup are deliberately absent — access pages, noindex (Karina 2026-10-14).
  ];
}
