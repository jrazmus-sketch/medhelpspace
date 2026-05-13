"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA } from "@/lib/mock-data";

function VerifyContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendError(null);
    setLoading(true);

    if (USE_MOCK_DATA) {
      await new Promise((r) => setTimeout(r, 500));
      setSent(true);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (resendErr) {
      setResendError("Não foi possível reenviar. Tente novamente.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm border-border/50 bg-surface-1 text-center">
        <CardContent className="py-8">
          <div className="mb-4 text-4xl">📬</div>
          <h2 className="mb-2 text-lg font-semibold">E-mail reenviado</h2>
          <p className="text-sm text-muted-foreground">
            Enviamos um novo link de confirmação para{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Já confirmou?{" "}
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
      <CardContent className="py-8">
        {error === "invalid_token" ? (
          <>
            <div className="mb-4 text-center text-4xl">⚠️</div>
            <h2 className="mb-2 text-center text-lg font-semibold">
              Link inválido ou expirado
            </h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              O link de confirmação não é mais válido. Digite seu e-mail
              abaixo para receber um novo link.
            </p>
          </>
        ) : (
          <>
            <div className="mb-4 text-center text-4xl">📬</div>
            <h2 className="mb-2 text-center text-lg font-semibold">
              Verifique seu e-mail
            </h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Clique no link que enviamos para ativar sua conta. Não
              recebeu? Reenvie abaixo.
            </p>
          </>
        )}

        <form onSubmit={handleResend} className="space-y-4">
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

          {resendError && (
            <p className="text-sm text-destructive">{resendError}</p>
          )}

          <Button
            type="submit"
            className="w-full bg-brand text-brand-fg hover:bg-brand/90"
            disabled={loading}
          >
            {loading ? "Reenviando…" : "Reenviar e-mail de confirmação"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Já confirmou?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link
          href="/"
          className="font-semibold tracking-tight text-brand hover:opacity-80"
        >
          MedHelpSpace
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Suspense>
          <VerifyContent />
        </Suspense>
      </main>
    </div>
  );
}
