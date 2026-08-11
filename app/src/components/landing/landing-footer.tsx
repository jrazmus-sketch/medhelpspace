import Link from "next/link";
import { SiteText } from "./site-text";
import { FooterAccessLinks } from "./footer-access-links";
import { SOCIAL_PROFILES, type SocialProfile } from "@/lib/social";

// Same glyphs the e-mail footer ships as PNG (scripts/build-social-email-icons.js),
// drawn inline here because the web can render SVG. Keyed by SocialProfile.key so
// the list itself lives in one place — lib/social.ts.
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

export function LandingFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--lp-border)", background: "var(--lp-base)" }}>
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div
              className="mb-3 text-xl font-bold"
              style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
            >
              MedHelp<span style={{ color: "var(--brand)" }}>Space</span>
            </div>
            <p className="mb-4 max-w-[200px] text-xs leading-relaxed" style={{ color: "var(--lp-fg-25)" }}>
              <SiteText as="span" multiline k="footer.tagline" fallback="Sistema de aprovação para o Revalida — treino direto ao ponto, do jeito que a prova cobra." />
            </p>
            {/* gap-0 + p-3 rather than gap-3 on a bare 20px glyph: the padding IS
                the 44px tap target (20 + 12 + 12), and it doubles as the spacing
                the gap used to provide. One 20px target was already awkward to
                hit; three side by side would be a row of near-misses. */}
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
                  style={{ color: "var(--lp-fg-25)" }}
                >
                  <Icon className="h-5 w-5" />
                </a>
                );
              })}
            </div>
          </div>

          {/* Product */}
          <div>
            <h4
              className="mb-4 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--lp-fg-25)" }}
            >
              Produto
            </h4>
            <ul className="space-y-2.5 text-sm">
              {/* Root-relative hashes (/#…) so these resolve from any page the
                  footer appears on: on the homepage the browser scrolls in-page;
                  on /loja and /checkout it routes home, then scrolls to the
                  section. Bare "#sistema"/"#faq" only worked on / and the ids
                  changed in the landing v2 rebuild (now #features + #faq). */}
              <li><a href="/#features" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>O Sistema</a></li>
              <li><Link href="/loja" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>Comprar Agora</Link></li>
              <li><a href="/#faq" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>Perguntas Frequentes</a></li>
            </ul>
          </div>

          {/* Acesso */}
          <div>
            <h4
              className="mb-4 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--lp-fg-25)" }}
            >
              Acesso
            </h4>
            <FooterAccessLinks />
          </div>

          {/* Legal */}
          <div>
            <h4
              className="mb-4 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--lp-fg-25)" }}
            >
              Legal
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/termos" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>Termos de Uso</Link></li>
              <li><Link href="/privacidade" className="transition-colors" style={{ color: "var(--lp-fg-40)" }}>Política de Privacidade</Link></li>
            </ul>
            <div className="mt-5">
              <p className="mb-2 text-xs" style={{ color: "var(--lp-fg-25)" }}>Pagamento seguro via</p>
              <div
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5"
                style={{ borderColor: "var(--lp-border)" }}
              >
                <span className="text-xs font-bold" style={{ color: "var(--lp-fg-25)" }}>PagBank</span>
              </div>
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--lp-fg-15)" }}>Pix · Cartão de crédito (12x)</p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="px-5 py-4 text-center text-xs md:px-8"
        style={{ borderTop: "1px solid var(--lp-border)", color: "var(--lp-fg-15)" }}
      >
        <SiteText as="span" k="footer.copyright" fallback="© 2026 MedHelpSpace. Todos os direitos reservados." />
      </div>
    </footer>
  );
}
