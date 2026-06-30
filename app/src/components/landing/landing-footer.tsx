import Link from "next/link";
import { SiteText } from "./site-text";
import { FooterAccessLinks } from "./footer-access-links";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

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
            <div className="flex items-center gap-3">
              {[
                { href: "https://instagram.com/medhelpspace", label: "Instagram", Icon: InstagramIcon },
                { href: "https://tiktok.com/@medhelpspace", label: "TikTok", Icon: TikTokIcon },
                { href: "https://youtube.com/@medhelpspace", label: "YouTube", Icon: YouTubeIcon },
              ].map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="transition-colors"
                  style={{ color: "var(--lp-fg-25)" }}
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
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
