import type React from "react";
import { SOCIAL_PROFILES, type SocialProfile } from "@/lib/social";

// The row of social icons both sales-page footers show — the Revalida landing
// footer and the ClinAct one (Karina 2026-10-30 / 2026-11-01: "as redes sociais
// da MedHelpSpace"). Same glyphs the e-mail footer ships as PNG
// (scripts/build-social-email-icons.js), drawn inline here because the web can
// render SVG. Keyed by SocialProfile.key so the list itself lives in one place —
// lib/social.ts.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

const SOCIAL_ICONS: Record<SocialProfile["key"], (p: { className?: string }) => React.ReactElement> = {
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
};

/**
 * gap-0 + p-3 rather than gap-3 on a bare 20px glyph: the padding IS the 44px
 * tap target (20 + 12 + 12), and it doubles as the spacing the gap used to
 * provide. The -ml-3 keeps the first glyph aligned with the text above it.
 */
export function SocialLinks({ color }: { color: string }) {
  return (
    <div className="-ml-3 flex items-center">
      {SOCIAL_PROFILES.map(({ key, url, label }) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="p-3 transition-colors"
            style={{ color }}
          >
            <Icon className="h-5 w-5" />
          </a>
        );
      })}
    </div>
  );
}
