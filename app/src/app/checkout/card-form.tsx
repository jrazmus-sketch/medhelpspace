"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import type { InstallmentOption } from "@/lib/pagbank/types";

// PagBank JS SDK global (loaded via <Script>)
declare global {
  interface Window {
    PagSeguro?: {
      encryptCard: (params: {
        publicKey: string;
        holder: string;
        number: string;
        expMonth: string;
        expYear: string;
        securityCode: string;
      }) => { encryptedCard: string; hasErrors: boolean; errors: string[] };
    };
  }
}

interface Props {
  amountCents: number;
  cohortSlug: string;
  cardHolderDefault: string;
  pagbankPublicKey: string;
  loading: boolean;
  initialInstallments: InstallmentOption[];
  onSubmit: (params: {
    encryptedCard: string;
    cardHolder: string;
    installments: number;
    cpf: string;
    cardBin: string;
  }) => void;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// Brazilian credit card installment display, driven by PagBank's live ladder.
// 1x is always à vista; 2x+ show the per-installment value with the interest-
// inclusive total so the buyer sees exactly what they'll pay.
function formatInstallmentLabel(opt: InstallmentOption): string {
  if (opt.installments === 1) {
    return `1x de R$ ${brl(opt.installmentValue)} (à vista)`;
  }
  if (opt.interestFree) {
    return `${opt.installments}x de R$ ${brl(opt.installmentValue)} sem juros`;
  }
  return `${opt.installments}x de R$ ${brl(opt.installmentValue)} — total R$ ${brl(opt.totalValue)}`;
}

export function CardForm({
  amountCents,
  cohortSlug,
  cardHolderDefault,
  pagbankPublicKey,
  loading,
  initialInstallments,
  onSubmit,
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState(cardHolderDefault);
  const [expiry, setExpiry] = useState(""); // MM/YY
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [installments, setInstallments] = useState(1);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [options, setOptions] = useState<InstallmentOption[]>(
    initialInstallments.length
      ? initialInstallments
      : [{ installments: 1, installmentValue: amountCents, totalValue: amountCents, interestFree: true }],
  );
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  const bin = cardNumber.replace(/\D/g, "").slice(0, 6);

  // PagBank SDK may already be present if page navigated back
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.PagSeguro) setSdkReady(true);
  }, []);

  // Refine the installment ladder once the card BIN is known so rates and the
  // available installment count are brand-accurate (e.g. some cards cap below 12x).
  useEffect(() => {
    if (bin.length < 6) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingInstallments(true);
    fetch(`/api/pagbank/installments?cohortSlug=${encodeURIComponent(cohortSlug)}&bin=${bin}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.options) || data.options.length === 0) return;
        setOptions(data.options as InstallmentOption[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingInstallments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bin, cohortSlug]);

  // Derive the effective selection: if the refined ladder no longer offers the
  // chosen count (e.g. a card that caps below 12x), fall back to the first option.
  const selectedInstallments = options.some((o) => o.installments === installments)
    ? installments
    : options[0]?.installments ?? 1;

  function formatCardNumber(raw: string): string {
    return raw
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  function formatExpiry(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  }

  function formatCpf(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function isValidCpf(raw: string): boolean {
    const d = raw.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
    let r = (sum * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== parseInt(d[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    return r === parseInt(d[10]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    if (!sdkReady || !window.PagSeguro) {
      setFieldError("SDK de pagamento ainda carregando. Aguarde um instante.");
      return;
    }

    const rawNumber = cardNumber.replace(/\s/g, "");
    const [expMonth, expYear20] = expiry.split("/");
    const expYear = expYear20?.length === 2 ? `20${expYear20}` : expYear20;

    if (!rawNumber || rawNumber.length < 13) {
      setFieldError("Número do cartão inválido.");
      return;
    }
    if (!expMonth || !expYear || expMonth.length !== 2) {
      setFieldError("Data de vencimento inválida.");
      return;
    }
    if (!cvv || cvv.length < 3) {
      setFieldError("CVV inválido.");
      return;
    }
    if (!cardHolder.trim()) {
      setFieldError("Nome no cartão é obrigatório.");
      return;
    }

    const rawCpf = cpf.replace(/\D/g, "");
    if (!isValidCpf(rawCpf)) {
      setFieldError("CPF inválido.");
      return;
    }

    const { encryptedCard, hasErrors, errors } = window.PagSeguro.encryptCard({
      publicKey: pagbankPublicKey,
      holder: cardHolder.trim().toUpperCase(),
      number: rawNumber,
      expMonth,
      expYear,
      securityCode: cvv,
    });

    if (hasErrors) {
      setFieldError(errors?.[0] ?? "Dados do cartão inválidos.");
      return;
    }

    onSubmit({
      encryptedCard,
      cardHolder: cardHolder.trim().toUpperCase(),
      installments: selectedInstallments,
      cpf: rawCpf,
      cardBin: rawNumber.slice(0, 6),
    });
  }

  return (
    <>
      <Script
        src="https://assets.pagseguro.com.br/checkout-sdk/js/direct-checkout.js"
        strategy="lazyOnload"
        onLoad={() => setSdkReady(true)}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {fieldError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {fieldError}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground/70">Número do cartão</label>
          <input
            type="text"
            inputMode="numeric"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="0000 0000 0000 0000"
            maxLength={19}
            required
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground/70">Nome impresso no cartão</label>
          <input
            type="text"
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
            placeholder="NOME COMO NO CARTÃO"
            required
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground/70">CPF do titular</label>
          <input
            type="text"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            required
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/70">Vencimento</label>
            <input
              type="text"
              inputMode="numeric"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              placeholder="MM/AA"
              maxLength={5}
              required
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/70">CVV</label>
            <input
              type="text"
              inputMode="numeric"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="123"
              maxLength={4}
              required
              className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground/70">
            Parcelamento
            {loadingInstallments && (
              <span className="ml-2 text-xs font-normal text-foreground/40">calculando…</span>
            )}
          </label>
          <select
            value={selectedInstallments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {options.map((opt) => (
              <option key={opt.installments} value={opt.installments}>
                {formatInstallmentLabel(opt)}
              </option>
            ))}
          </select>
          <p className="text-xs text-foreground/40">
            Parcelas com juros calculados pelo PagBank.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !sdkReady}
          className="mt-2 w-full rounded-xl bg-brand py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
        >
          {loading
            ? "Processando…"
            : !sdkReady
            ? "Carregando…"
            : "Pagar agora"}
        </button>
      </form>
    </>
  );
}
