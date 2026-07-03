"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteText } from "@/components/landing/site-text";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { USE_MOCK_DATA } from "@/lib/mock-data";

function RecuperarSenhaContent() {
  const searchParams = useSearchParams();
  // Set when a recovery link failed in /auth/confirm (expired, already used, or
  // pre-opened by an email scanner). We bounce the user here — instead of the
  // signup-only /verify page — so the form below actually re-sends a reset link.
  const expired = searchParams.get("error") === "expired";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (USE_MOCK_DATA) {
      await new Promise((r) => setTimeout(r, 500));
      setSent(true);
      setLoading(false);
      return;
    }

    const res = await fetch("/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      setError("Não foi possível enviar o e-mail. Tente novamente.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm border-border/50 bg-surface-1 text-center">
        <CardContent className="py-8">
          <div className="mb-4 text-4xl">📬</div>
          <h2 className="mb-2 text-lg font-semibold">Verifique seu e-mail</h2>
          <p className="text-sm text-muted-foreground">
            Se houver uma conta para{" "}
            <span className="font-medium text-foreground">{email}</span>,
            você receberá um link para redefinir sua senha em breve.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Lembrou a senha?{" "}
            <Link href="/login" className="text-brand hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm border-border/50 bg-surface-1">
      <CardHeader className="pb-4 text-center">
        <CardTitle className="text-xl">
          <SiteText as="span" k="recuperar.title" fallback="Recuperar senha" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="recuperar.subtitle"
            fallback="Digite seu e-mail e enviaremos um link para redefinir sua senha."
          />
        </p>
      </CardHeader>
      <CardContent>
        {expired && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
            Esse link de recuperação expirou ou já foi usado. Cada link funciona
            apenas uma vez. Digite seu e-mail abaixo para receber um novo.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full bg-brand text-brand-fg hover:bg-brand/90"
            disabled={loading}
          >
            {loading ? "Enviando…" : "Enviar link de recuperação"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Lembrou a senha?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function RecuperarSenhaPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" aria-label="MedHelpSpace Revalida — início" className="flex items-center hover:opacity-80">
          <BrandLockup />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Suspense>
          <RecuperarSenhaContent />
        </Suspense>
      </main>
    </div>
  );
}
