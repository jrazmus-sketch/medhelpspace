import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Minimal shell for the ClinAct member area. Deliberately NOT the /app
 * MemberHeader: that header assumes a cohort membership (60D, Estudar, etc.).
 */
export function ClinactShell({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background [overflow-x:clip]">
      <header className="sticky top-0 z-50 border-b border-border bg-surface-1">
        <div className="mx-auto flex h-13 max-w-5xl items-center gap-3 px-4">
          <Link href="/clinact/treinar" className="flex min-h-11 items-center gap-2 font-bold">
            <span className="text-brand">MedHelp</span>
            <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">ClinAct</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/clinact/treinar" className="flex min-h-11 items-center px-2.5 text-muted-foreground hover:text-foreground">Casos</Link>
            <Link href="/clinact/evolucao" className="flex min-h-11 items-center px-2.5 text-muted-foreground hover:text-foreground">Evolução</Link>
            {isAdmin ? <Link href="/admin/clinact" className="flex min-h-11 items-center px-2.5 text-muted-foreground hover:text-foreground">Admin</Link> : null}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {/* Account links live here, not in the header: at 375px the header already
          holds the logo, two links and the theme toggle (plus Admin), and the
          wrapper clips overflow — a fifth item would be silently cut off rather
          than wrap. A subscriber must always be able to reach cancellation. */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-4 py-2 text-sm">
          <Link href="/clinact/assinatura" className="flex min-h-11 items-center text-muted-foreground hover:text-foreground">
            Minha assinatura
          </Link>
        </div>
      </footer>
    </div>
  );
}
