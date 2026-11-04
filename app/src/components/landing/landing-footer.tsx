import Link from "next/link";
import { SiteText } from "./site-text";
import { FooterAccessLinks } from "./footer-access-links";
import { SocialLinks } from "@/components/marketing/social-links";
import { whatsappUrl } from "@/lib/whatsapp";

// 44px tap target on the phone, where the Contato column stands alone on its row.
const CONTACT_LINK = "inline-flex min-h-11 items-center transition-colors sm:min-h-0";

export function LandingFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--lp-border)", background: "var(--lp-base)" }}>
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        {/* Five columns from lg; on a tablet the brand takes its own row above the four link
            columns. The Contato column is sized by its content (auto) so the e-mail address
            never overflows a narrow equal-width column. */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:gap-x-6 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:gap-x-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div
              className="mb-3 text-xl font-bold"
              style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
            >
              MedHelp<span style={{ color: "var(--brand)" }}>Space</span>
            </div>
            <p className="mb-4 max-w-[200px] text-xs leading-relaxed" style={{ color: "var(--lp-fg-25)" }}>
              <SiteText as="span" multiline k="footer.tagline" fallback="Sistema de aprovação para o Revalida — treino direto ao ponto, do jeito que a prova cobra." />
            </p>
            <SocialLinks color="var(--lp-fg-25)" />
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

          {/* Contato (Karina 2026-11-04) — the same block as the ClinAct footer, on the
              same WhatsApp number as the floating button. Full row on the phone so the
              e-mail address fits on one line. */}
          <div className="col-span-2 md:col-span-1">
            <h4
              className="mb-4 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--lp-fg-25)" }}
            >
              Contato
            </h4>
            <ul className="text-sm sm:space-y-2.5">
              <li>
                <a href={whatsappUrl("revalida")} target="_blank" rel="noopener noreferrer" className={CONTACT_LINK} style={{ color: "var(--lp-fg-40)" }}>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href="mailto:contato@medhelpspace.com.br" className={CONTACT_LINK} style={{ color: "var(--lp-fg-40)" }}>
                  contato@medhelpspace.com.br
                </a>
              </li>
            </ul>
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
