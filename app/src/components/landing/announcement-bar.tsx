const MSG = "TESTE GRÁTIS DE 7 DIAS SEM RISCOS · GARANTIA DE DEVOLUÇÃO DO DINHEIRO · ACESSO IMEDIATO · ";

export function AnnouncementBar() {
  return (
    <div className="relative z-50 overflow-hidden bg-[var(--brand)] py-2 text-xs font-semibold tracking-widest text-white">
      {/* Mobile: scrolling marquee */}
      <div className="flex md:hidden">
        <div className="lp-marquee-track whitespace-nowrap">
          <span className="px-4">{MSG}{MSG}</span>
          <span className="px-4" aria-hidden>{MSG}{MSG}</span>
        </div>
      </div>
      {/* Desktop: static centered */}
      <div className="hidden md:block text-center">{MSG}</div>
    </div>
  );
}
