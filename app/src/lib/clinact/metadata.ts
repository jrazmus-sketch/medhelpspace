import type { Metadata } from "next";

/**
 * ClinAct's own title / description / share card. The root layout describes
 * the Revalida platform, and Next.js does NOT deep-merge openGraph or twitter:
 * any ClinAct route that does not spell these out inherits "MedHelpSpace
 * Revalida" + /og-image.png — which is what WhatsApp showed for /clinact until
 * 2026-11-03. Same www-host and no-og:url reasoning as
 * simulado-revalida/page.tsx.
 */
export const CLINACT_OG_TITLE = "ClinAct — raciocínio clínico que termina em uma decisão";
export const CLINACT_DESCRIPTION =
  "Casos clínicos curtos em quatro formatos: Decisão em 30 Segundos, Código Clínico, Ponto de Virada e Clínica em Cena.";
const OG_IMAGE = "https://www.medhelpspace.com.br/og-clinact.jpg";

/** description + openGraph + twitter for any ClinAct route; pass a title alongside. */
export const CLINACT_SHARE_METADATA: Pick<Metadata, "description" | "openGraph" | "twitter"> = {
  description: CLINACT_DESCRIPTION,
  openGraph: {
    siteName: "MedHelpSpace",
    title: CLINACT_OG_TITLE,
    description: CLINACT_DESCRIPTION,
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "MedHelpSpace ClinAct — casos clínicos interativos: Você decidiria certo?",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: CLINACT_OG_TITLE,
    description: CLINACT_DESCRIPTION,
    images: [OG_IMAGE],
  },
};
