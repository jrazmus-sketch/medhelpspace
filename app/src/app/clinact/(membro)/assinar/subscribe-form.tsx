"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

type PlanOption = { key: string; label: string; price: string; note: string };

/**
 * The card is encrypted HERE, in the student's browser, with PagBank's SDK —
 * the number never touches our server. Two fields still travel to us:
 *
 *   - the encrypted blob, which only PagBank can read;
 *   - the CVV, because POST /subscriptions refuses the call without it in
 *     plain text. It is forwarded once and never stored or logged.
 *
 * `attemptId` is generated once per mounted form and REUSED on every retry of
 * this attempt. It becomes the idempotency key, which is what makes a second
 * click — or a resubmit after a timeout — safe instead of a second charge.
 */
export function SubscribeForm({ publicKey, plans }: { publicKey: string; plans: PlanOption[] }) {
  const router = useRouter();
  const [attemptId] = useState(() =>
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-zA-Z0-9]/g, ""),
  );
  const [planKey, setPlanKey] = useState(plans[0]?.key ?? "mensal");
  const [holder, setHolder] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function formatCard(raw: string) {
    return raw.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  }
  function formatExpiry(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  }
  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  }
  function formatCpf(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sdkReady || !window.PagSeguro) {
      setError("O sistema de pagamento ainda está carregando. Aguarde um instante.");
      return;
    }
    const rawNumber = number.replace(/\s/g, "");
    const [expMonth, expYear2] = expiry.split("/");
    const expYear = expYear2?.length === 2 ? `20${expYear2}` : expYear2;

    if (rawNumber.length < 13) return setError("Número do cartão inválido.");
    if (!expMonth || expMonth.length !== 2 || !expYear) return setError("Validade inválida.");
    if (cvv.length < 3) return setError("Código de segurança inválido.");
    if (holder.trim().length < 3) return setError("Informe o nome como está no cartão.");
    if (cpf.replace(/\D/g, "").length !== 11) return setError("CPF inválido.");
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return setError("Informe um celular com DDD.");

    const { encryptedCard, hasErrors, errors } = window.PagSeguro.encryptCard({
      publicKey,
      holder: holder.trim().toUpperCase(),
      number: rawNumber,
      expMonth,
      expYear,
      securityCode: cvv,
    });
    if (hasErrors) return setError(errors?.[0] ?? "Dados do cartão inválidos.");

    setBusy(true);
    try {
      const res = await fetch("/api/clinact/assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          encryptedCard,
          securityCode: cvv,
          holderName: holder.trim().toUpperCase(),
          cpf: cpf.replace(/\D/g, ""),
          phone: { area: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) },
          attemptId,
        }),
      });
      const data = (await res.json()) as { error?: string; state?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível concluir a assinatura.");
        return;
      }
      if (data.state === "paid") {
        router.push("/clinact/treinar");
        return;
      }
      setPending(true);
    } catch {
      // The request may still have gone through. Never invite a second attempt
      // blindly: the same attemptId protects a retry, but say what is true.
      setError(
        "A conexão caiu durante o pagamento. Atualize a página em alguns instantes para ver se a assinatura foi criada antes de tentar de novo.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-surface-1 p-4">
        <p className="font-medium">Pagamento em processamento</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A assinatura foi criada e estamos aguardando a confirmação do cartão. Assim que o pagamento
          for aprovado, o seu acesso é liberado automaticamente.
        </p>
      </div>
    );
  }

  const field =
    "min-h-12 w-full rounded-xl border border-border bg-surface-1 px-3 text-base outline-none focus:border-brand";

  return (
    <>
      <Script
        src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onError={() => setError("Não foi possível carregar o sistema de pagamento. Recarregue a página.")}
      />

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plano
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <label
                key={p.key}
                className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border p-3 ${
                  planKey === p.key ? "border-brand bg-brand/10" : "border-border bg-surface-1"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="plano"
                    value={p.key}
                    checked={planKey === p.key}
                    onChange={() => setPlanKey(p.key)}
                    className="h-4 w-4"
                  />
                  <span className="font-medium">{p.label}</span>
                  <span className="ml-auto font-semibold">{p.price}</span>
                </span>
                <span className="mt-1 pl-6 text-xs text-muted-foreground">{p.note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nome como está no cartão</span>
            <input className={field} value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="cc-name" required />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">CPF do titular</span>
            <input
              className={field}
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              inputMode="numeric"
              placeholder="000.000.000-00"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Celular com DDD</span>
            <input
              className={field}
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="(11) 91234-5678"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Número do cartão</span>
            <input
              className={field}
              value={number}
              onChange={(e) => setNumber(formatCard(e.target.value))}
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
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
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
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-xl bg-brand px-4 font-medium text-white disabled:opacity-60"
        >
          {busy ? "Processando…" : "Assinar"}
        </button>

        <p className="text-xs text-muted-foreground">
          Os dados do cartão são criptografados no seu navegador e enviados direto ao PagBank. O
          número do cartão não passa pelos nossos servidores.
        </p>
      </form>
    </>
  );
}
