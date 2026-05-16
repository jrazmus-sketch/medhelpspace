"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Lock, ShieldCheck } from "lucide-react";
import { PixDisplay } from "./pix-display";
import { CardForm } from "./card-form";

type PaymentMethod = "pix" | "credit_card";

interface ChargeResult {
  orderId: string;
  chargeId: string;
  status: string;
  pixQrText: string | null;
  pixQrImageUrl: string | null;
  pixExpiresAt: string | null;
  ccBrand: string | null;
}

interface Props {
  cohortSlug: string;
  cohortName: string;
  priceLabel: string;
  amountCents: number;
  userEmail: string;
  userName: string;
  alreadyMember: boolean;
  pagbankPublicKey: string;
}

export function CheckoutClient({
  cohortSlug,
  cohortName,
  priceLabel,
  amountCents,
  userEmail,
  userName,
  alreadyMember,
  pagbankPublicKey,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChargeResult | null>(null);
  const [paid, setPaid] = useState(false);

  if (alreadyMember) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
          <Check className="h-8 w-8 text-brand" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">
            Você já tem acesso
          </h2>
          <p className="mt-2 text-foreground/55">
            Sua matrícula na {cohortName} está ativa.
          </p>
        </div>
        <Link
          href="/app"
          className="rounded-xl bg-brand px-8 py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5"
        >
          Ir para o sistema →
        </Link>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
          <Check className="h-8 w-8 text-brand" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">
            Pagamento confirmado!
          </h2>
          <p className="mt-2 text-foreground/55">
            Sua matrícula na {cohortName} foi ativada. Bons estudos!
          </p>
        </div>
        <Link
          href="/app"
          className="rounded-xl bg-brand px-8 py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5"
        >
          Entrar no sistema →
        </Link>
      </div>
    );
  }

  // After a Pix charge is created, show QR screen
  if (result && method === "pix" && result.pixQrText) {
    return (
      <PixDisplay
        chargeId={result.chargeId}
        qrText={result.pixQrText}
        qrImageUrl={result.pixQrImageUrl}
        expiresAt={result.pixExpiresAt}
        onPaid={() => setPaid(true)}
      />
    );
  }

  async function submitPix() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pagbank/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortSlug, paymentMethod: "pix" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao processar pagamento");
      setResult(data as ChargeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function submitCard(params: {
    encryptedCard: string;
    cardHolder: string;
    installments: number;
    cpf: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pagbank/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortSlug,
          paymentMethod: "credit_card",
          encryptedCard: params.encryptedCard,
          cardHolder: params.cardHolder,
          installments: params.installments,
          cpf: params.cpf,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao processar pagamento");
      const chargeResult = data as ChargeResult;
      setResult(chargeResult);
      if (chargeResult.status === "PAID") {
        setPaid(true);
      } else if (chargeResult.status === "DECLINED") {
        setError("Cartão recusado. Verifique os dados e tente novamente.");
      } else {
        setError("Pagamento em análise. Aguarde a confirmação por e-mail.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-5 md:gap-12">

      {/* Left: order summary */}
      <div className="md:col-span-2">
        <div className="sticky top-8 rounded-2xl border border-border bg-background p-6 shadow-sm">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground/40">
            Turma
          </div>
          <h1
            className="text-2xl font-extrabold text-foreground"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            {cohortName}
          </h1>

          <div className="my-5 border-t border-border" />

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-foreground/55">Total</span>
            <span
              className="text-3xl font-extrabold text-foreground"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              {priceLabel}
            </span>
          </div>

          <div className="mt-5 space-y-2">
            {[
              "Acesso ao sistema completo",
              "MedHelp 60D incluso",
              "Acesso em todos os dispositivos",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-foreground/60">
                <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
                {item}
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-foreground/50">
            <ShieldCheck className="h-4 w-4 shrink-0 text-brand/60" />
            Garantia incondicional de 7 dias
          </div>
        </div>
      </div>

      {/* Right: payment form */}
      <div className="md:col-span-3">
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">

          {/* Method tabs */}
          <div className="mb-6 flex rounded-xl border border-border p-1">
            <button
              type="button"
              onClick={() => { setMethod("pix"); setError(null); }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                method === "pix"
                  ? "bg-brand text-white shadow-sm"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Pix
            </button>
            <button
              type="button"
              onClick={() => { setMethod("credit_card"); setError(null); }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                method === "credit_card"
                  ? "bg-brand text-white shadow-sm"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Cartão de crédito
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {method === "pix" && (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-foreground/60">
                Gere o QR code e pague pelo app do seu banco. O acesso é
                liberado automaticamente assim que o pagamento for confirmado.
              </p>
              <div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-brand/80">
                O código Pix expira em <strong>30 minutos</strong>.
              </div>
              <button
                type="button"
                onClick={submitPix}
                disabled={loading}
                className="w-full rounded-xl bg-brand py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
              >
                {loading ? "Gerando QR code…" : "Gerar QR code Pix"}
              </button>
            </div>
          )}

          {method === "credit_card" && (
            <CardForm
              amountCents={amountCents}
              cardHolderDefault={userName}
              pagbankPublicKey={pagbankPublicKey}
              loading={loading}
              onSubmit={submitCard}
            />
          )}

          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-foreground/35">
            <Lock className="h-3 w-3" />
            Pagamento seguro via PagBank
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-foreground/35">
          Logado como <span className="font-medium">{userEmail}</span>.{" "}
          <Link href="/auth/signout" className="underline underline-offset-2 hover:text-foreground/60">
            Sair
          </Link>
        </p>
      </div>
    </div>
  );
}
