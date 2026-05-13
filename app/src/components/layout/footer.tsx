export function MemberFooter({ className }: { className?: string }) {
  return (
    <footer className={`border-t border-border/30 px-[10px] py-4 text-center text-[11px] leading-relaxed text-muted-foreground sm:text-xs ${className ?? ""}`}>
      © 2026 MedHelpSpace. Todos os direitos reservados.
    </footer>
  );
}
