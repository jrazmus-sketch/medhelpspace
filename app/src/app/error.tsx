"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-destructive/30">!</p>
      <h1 className="text-xl font-bold">Algo deu errado</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Você pode tentar novamente ou voltar ao início.
      </p>
      <div className="flex gap-3 pt-2">
        <button
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
        >
          Tentar novamente
        </button>
        <Link
          href="/app"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
