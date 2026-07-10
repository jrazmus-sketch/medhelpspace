import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://medhelpspace.com.br",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://medhelpspace.com.br/loja",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      // Free lead magnet — indexable SEO landing for "questões revalida".
      url: "https://medhelpspace.com.br/questoes-revalida",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      // Free flashcard deck — indexable SEO landing for "flashcards revalida".
      url: "https://medhelpspace.com.br/flashcards-gratis",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      // Free 100-question simulado — indexable SEO landing for "simulado revalida".
      url: "https://medhelpspace.com.br/simulado-revalida",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://medhelpspace.com.br/termos",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://medhelpspace.com.br/privacidade",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://medhelpspace.com.br/login",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: "https://medhelpspace.com.br/signup",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
