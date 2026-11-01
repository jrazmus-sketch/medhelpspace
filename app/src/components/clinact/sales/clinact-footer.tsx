import Link from "next/link";
import { ClinactText } from "@/components/clinact/clinact-text";
import { SocialLinks } from "@/components/marketing/social-links";
import { ANCHOR_GRATUITOS, ANCHOR_PLANOS } from "@/components/clinact/sales/sections";
import { whatsappUrl } from "@/lib/whatsapp";

const DISPLAY = { fontFamily: "var(--font-bricolage)" } as const;
const HEADING = "mb-4 text-xs font-bold uppercase tracking-widest text-foreground/55";
const LINK = "inline-flex min-h-11 items-center text-sm text-foreground/75 transition-colors hover:text-foreground sm:min-h-0";

/**
 * Footer of the ClinAct sales page (Karina 2026-10-30, repeated 2026-11-01):
 * the MedHelpSpace social profiles, Termos de Uso, Política de Privacidade —
 * plus the WhatsApp contact, on the same number as the floating button
 * ("vincule também os demais links de contato por WhatsApp do ClinAct").
 *
 * Not a section: it is not orderable or hideable in /admin/clinact/pagina,
 * because a sales page without its legal links is not a choice to offer.
 * Laid out like the Revalida landing footer (brand + socials, then link
 * columns) so the two products read as one company.
 */
export function ClinactFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--lp-border)", background: "var(--lp-base)" }}>
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <p className="text-xl font-bold text-foreground" style={DISPLAY}>
              MedHelpSpace <span className="text-brand-text">ClinAct</span>
            </p>
            <p className="mb-3 mt-2 max-w-[24ch] text-sm leading-relaxed text-foreground/60">
              <ClinactText k="clinact.footer.tagline" multiline />
            </p>
            <SocialLinks color="color-mix(in srgb, var(--foreground) 65%, transparent)" />
          </div>

          <div>
            <h2 className={HEADING}>ClinAct</h2>
            <ul className="sm:space-y-2.5">
              <li>
                <a href={`#${ANCHOR_GRATUITOS}`} className={LINK}>
                  Casos gratuitos
                </a>
              </li>
              <li>
                <a href={`#${ANCHOR_PLANOS}`} className={LINK}>
                  Planos
                </a>
              </li>
              <li>
                <Link href="/login?next=%2Fclinact%2Ftreinar" className={LINK}>
                  Entrar
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className={HEADING}>Legal</h2>
            <ul className="sm:space-y-2.5">
              <li>
                <Link href="/termos" className={LINK}>
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link href="/privacidade" className={LINK}>
                  Política de Privacidade
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-xs text-foreground/55">Pagamento seguro via PagBank</p>
          </div>

          {/* Full row on the phone so the e-mail address fits on one line. */}
          <div className="col-span-2 md:col-span-1">
            <h2 className={HEADING}>Contato</h2>
            <ul className="sm:space-y-2.5">
              <li>
                <a href={whatsappUrl("clinact")} target="_blank" rel="noopener noreferrer" className={LINK}>
                  WhatsApp
                </a>
              </li>
              <li>
                <a href="mailto:contato@medhelpspace.com.br" className={LINK}>
                  contato@medhelpspace.com.br
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* pb on the phone: room for the floating WhatsApp button (56px + 16px gap),
          so at the end of the scroll it sits below the copyright, never on it. */}
      <div className="border-t px-5 pb-24 pt-4 text-center text-xs text-foreground/55 md:px-8 md:pb-4" style={{ borderColor: "var(--lp-border)" }}>
        <ClinactText k="clinact.footer.copyright" />
      </div>
    </footer>
  );
}
