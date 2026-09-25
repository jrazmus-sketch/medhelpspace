"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

/**
 * Change the card, or cancel. Both act on the signed-in user's own
 * subscription — neither route accepts an id.
 *
 * The new card is encrypted HERE with PagBank's SDK, exactly as at checkout.
 * Unlike checkout, nothing else travels: PUT billing_info takes the encrypted
 * blob alone, so the CVV never reaches our server on this path at all.
 */
export function SubscriptionActions({
  publicKey,
  accessUntil,
}: {
  publicKey: string | null;
  accessUntil: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "card" | "confirm-cancel">("idle");
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const field =
    "min-h-12 w-full rounded-xl border border-border bg-surface-1 px-3 text-base outline-none focus:border-brand";

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Não foi possível concluir agora. Tente novamente.");
        return false;
      }
      setMessage(data.message ?? "Pronto.");
      setMode("idle");
      router.refresh();
      return true;
    } catch {
      setError("A conexão caiu. Atualize a página para ver a situação atual antes de tentar de novo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!publicKey || !sdkReady || !window.PagSeguro) {
      setError("O sistema de pagamento ainda está carregando. Aguarde um instante.");
      return;
    }
    const raw = number.replace(/\s/g, "");
    const [expMonth, yy] = expiry.split("/");
    const expYear = yy?.length === 2 ? `20${yy}` : yy;
    if (raw.length < 13) return setError("Número do cartão inválido.");
    if (!expMonth || expMonth.length !== 2 || !expYear) return setError("Validade inválida.");
    if (cvv.length < 3) return setError("Código de segurança inválido.");
    if (holder.trim().length < 3) return setError("Informe o nome como está no cartão.");

    const { encryptedCard, hasErrors, errors } = window.PagSeguro.encryptCard({
      publicKey,
      holder: holder.trim().toUpperCase(),
      number: raw,
      expMonth,
      expYear,
      securityCode: cvv,
    });
    if (hasErrors) return setError(errors?.[0] ?? "Dados do cartão inválidos.");
    const ok = await post("/api/clinact/assinatura/cartao", { encryptedCard });
    if (ok) {
      setHolder("");
      setNumber("");
      setExpiry("");
      setCvv("");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {publicKey ? (
        <Script
          src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js"
          strategy="afterInteractive"
          onLoad={() => setSdkReady(true)}
        />
      ) : null}

      {message ? (
        <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </p>
      ) : null}

      {mode === "card" ? (
        <form onSubmit={submitCard} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <p className="font-medium">Trocar cartão</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nome como está no cartão</span>
            <input className={field} value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="cc-name" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Número do cartão</span>
            <input
              className={field}
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim())}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Validade</span>
              <input
                className={field}
                value={expiry}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setExpiry(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Código de segurança</span>
              <input
                className={field}
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="CVV"
                required
              />
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={busy} className="min-h-12 flex-1 rounded-xl bg-brand px-4 font-medium text-white disabled:opacity-60">
              {busy ? "Salvando…" : "Salvar cartão"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="min-h-12 flex-1 rounded-xl border border-border px-4 font-medium">
              Voltar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            O cartão é criptografado no seu navegador e enviado direto ao PagBank.
          </p>
        </form>
      ) : null}

      {mode === "confirm-cancel" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 p-4">
          <p className="font-medium">Cancelar a assinatura?</p>
          <p className="text-sm text-muted-foreground">
            Você não será cobrado de novo.{" "}
            {accessUntil
              ? `O acesso continua até ${accessUntil}, que é o período já pago.`
              : "O acesso continua até o fim do período já pago."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => post("/api/clinact/assinatura/cancelar")}
              className="min-h-12 flex-1 rounded-xl bg-destructive px-4 font-medium text-white disabled:opacity-60"
            >
              {busy ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="min-h-12 flex-1 rounded-xl border border-border px-4 font-medium">
              Manter assinatura
            </button>
          </div>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {publicKey ? (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setMode("card");
              }}
              className="min-h-12 flex-1 rounded-xl border border-border px-4 font-medium"
            >
              Trocar cartão
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setMode("confirm-cancel");
            }}
            className="min-h-12 flex-1 rounded-xl border border-destructive/50 px-4 font-medium text-destructive"
          >
            Cancelar assinatura
          </button>
        </div>
      ) : null}
    </div>
  );
}
