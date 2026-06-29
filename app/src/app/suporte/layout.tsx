import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";

export const metadata = {
  title: { template: "%s | MedHelpSpace", default: "Suporte" },
};

// Standalone chrome — deliberately NOT the full member nav. /suporte lives outside
// the membership-gated /app layout so an expired member (e.g. a billing problem)
// can still reach support; the heavy study nav would just bounce them to /loja.
export default function SuporteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-[52px] max-w-2xl items-center gap-3 px-[10px] sm:px-6">
          <Link href="/app" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-brand text-brand-fg text-[13px] font-bold tracking-tight">
              M
            </div>
            <span className="text-[15px] font-semibold tracking-tight">
              MedHelp <span className="font-normal text-muted-foreground">· Space</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-0.5">
            <Link
              href="/app"
              className="flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Voltar ao painel</span>
              <span className="sm:hidden">Painel</span>
            </Link>
            <Link
              href="/auth/signout"
              aria-label="Sair"
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
