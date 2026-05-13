import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Minimal header */}
      <header className="flex h-14 items-center justify-between border-b border-border/50 px-6">
        <span className="font-semibold tracking-tight text-brand">
          MedHelpSpace
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Entrar
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Criar conta
          </Link>
        </div>
      </header>

      {/* Hero — placeholder */}
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="max-w-2xl space-y-4">
          <div className="inline-block rounded-full border border-brand/30 bg-brand-muted px-4 py-1 text-sm font-medium text-brand">
            Revalida 2026 e 2027
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Aprovação no{" "}
            <span className="text-gradient-brand">Revalida</span>{" "}
            com método
          </h1>
          <p className="text-lg text-muted-foreground">
            Questões comentadas, resumos, flashcards e áudios para você
            estudar do jeito certo — no seu ritmo.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "bg-brand text-brand-fg hover:bg-brand/90")}>
              Acessar plataforma
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-foreground">12</span>
            <span>especialidades</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-foreground">3.500+</span>
            <span>flashcards</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-foreground">700+</span>
            <span>questões</span>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-4 text-center text-xs text-muted-foreground">
        © 2026 MedHelpSpace. Todos os direitos reservados.
      </footer>
    </div>
  );
}
