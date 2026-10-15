import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/admin/", "/auth/", "/api/"],
    },
    sitemap: "https://www.medhelpspace.com.br/sitemap.xml",
    host: "https://www.medhelpspace.com.br",
  };
}
