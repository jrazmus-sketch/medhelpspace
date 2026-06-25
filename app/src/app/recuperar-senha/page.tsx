"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteText } from "@/components/landing/site-text";
import { USE_MOCK_DATA } from "@/lib/mock-data";

export default function RecuperarSenhaPage() {
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
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex h-14 items-center border-b border-border/50 px-6">
          <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
            MedHelpSpace
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
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
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
          MedHelpSpace
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
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
      </main>
    </div>
  );
}
