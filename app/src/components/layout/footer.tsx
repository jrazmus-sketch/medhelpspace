import Link from "next/link";

export function MemberFooter({ className }: { className?: string }) {
  return (
    <footer className={`border-t border-border/30 px-[10px] py-4 text-center text-[11px] leading-relaxed text-muted-foreground sm:text-xs ${className ?? ""}`}>
      <Link href="/app/comecar" className="transition-colors hover:text-foreground">
        Comece por aqui
      </Link>
      <span aria-hidden="true" className="mx-2 opacity-50">·</span>
      <Link href="/suporte" className="transition-colors hover:text-foreground">
        Suporte
      </Link>
      <span aria-hidden="true" className="mx-2 opacity-50">·</span>
      © 2026 MedHelpSpace. Todos os direitos reservados.
    </footer>
  );
}
