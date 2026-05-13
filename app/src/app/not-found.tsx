import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
          MedHelpSpace
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-6xl font-bold text-brand/30">404</p>
        <h1 className="text-2xl font-bold">Página não encontrada</h1>
        <p className="max-w-sm text-muted-foreground">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            href="/app"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
          >
            Ir para o início
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Página inicial
          </Link>
        </div>
      </main>
    </div>
  );
}
