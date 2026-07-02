"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, Lock, ShieldCheck, Tag, X } from "lucide-react";
import { PixDisplay } from "./pix-display";
import { CardForm } from "./card-form";
import { BillingForm } from "./billing-form";
import { validateBilling, formatCpf, formatCep, type BillingDetails } from "@/lib/br";
import type { InstallmentOption } from "@/lib/pagbank/types";

const EMPTY_BILLING: BillingDetails = {
  firstName: "",
  lastName: "",
  cpf: "",
  cep: "",
  address: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  phone: "",
};

function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

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
  compareAtPriceLabel: string | null;  // struck-through original when the turma is on sale
  amountCents: number;
  isLoggedIn: boolean;
  userEmail: string;
  userName: string;
  alreadyMember: boolean;
  pagbankPublicKey: string;
  initialInstallments: InstallmentOption[];
  initialBilling: Partial<BillingDetails> | null;
  // Prefill from a magnet/drip CTA: the lead's email (powers the §6.5 lead→order
  // match) and a coupon code to auto-apply (the turma welcome code, e.g. REVALIDA5).
  initialEmail?: string;
  initialCoupon?: string | null;
  // A still-valid pending Pix order to resume (buyer generated a QR, then returned).
  initialPixResult: {
    orderId: string;
    chargeId: string;
    pixQrText: string;
    pixQrImageUrl: string | null;
    pixExpiresAt: string | null;
  } | null;
}

type AccountMode = "signup" | "login";
type Step = "account" | "billing" | "payment";

export function CheckoutClient({
  cohortSlug,
  cohortName,
  priceLabel,
  compareAtPriceLabel,
  amountCents,
  isLoggedIn,
  userEmail,
  userName,
  alreadyMember,
  pagbankPublicKey,
  initialInstallments,
  initialBilling,
  initialPixResult,
  initialEmail,
  initialCoupon,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seed from a resumed pending Pix order so the QR shows immediately on load.
  const [result, setResult] = useState<ChargeResult | null>(
    initialPixResult
      ? {
          orderId: initialPixResult.orderId,
          chargeId: initialPixResult.chargeId,
          status: "WAITING",
          pixQrText: initialPixResult.pixQrText,
          pixQrImageUrl: initialPixResult.pixQrImageUrl,
          pixExpiresAt: initialPixResult.pixExpiresAt,
          ccBrand: null,
        }
      : null,
  );
  const [paid, setPaid] = useState(false);

  // Guest-checkout state (only relevant when !isLoggedIn)
  const [accountMode, setAccountMode] = useState<AccountMode>("signup");
  const [guestEmail, setGuestEmail] = useState(initialEmail ?? "");
  const [guestPassword, setGuestPassword] = useState("");
  const [showGuestPassword, setShowGuestPassword] = useState(false);
  const [guestName, setGuestName] = useState("");

  // Billing details (tax / nota fiscal). Prefilled from the buyer's profile when
  // available so returning customers don't retype. Required for every sale.
  const [billing, setBilling] = useState<BillingDetails>(() => {
    const merged = { ...EMPTY_BILLING, ...(initialBilling ?? {}) };
    // Profile stores CPF/CEP as digits only — mask them for display.
    return { ...merged, cpf: formatCpf(merged.cpf), cep: formatCep(merged.cep) };
  });
  function patchBilling(patch: Partial<BillingDetails>) {
    setBilling((b) => ({ ...b, ...patch }));
  }

  // Flow: account → billing → payment. Logged-in users skip the account step.
  const [step, setStep] = useState<Step>(isLoggedIn ? "billing" : "account");

  const steps: Array<{ key: Step; label: string }> = isLoggedIn
    ? [
        { key: "billing", label: "Cobrança" },
        { key: "payment", label: "Pagamento" },
      ]
    : [
        { key: "account", label: "Conta" },
        { key: "billing", label: "Cobrança" },
        { key: "payment", label: "Pagamento" },
      ];

  // Coupon state: validated server-side via /api/coupons/validate; actually
  // redeemed only when the buyer submits the charge (atomic RPC in the route).
  const [couponInput, setCouponInput] = useState("");
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountCents: number;
    finalAmountCents: number;
    isFullDiscount: boolean;
  } | null>(null);

  const effectiveAmountCents = appliedCoupon?.finalAmountCents ?? amountCents;
  const isFullDiscount = appliedCoupon?.isFullDiscount ?? false;

  async function applyCoupon(codeArg?: string) {
    const code = (codeArg ?? couponInput).trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, cohortSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error ?? "Cupom inválido");
        return;
      }
      setAppliedCoupon({
        code: data.code,
        discountCents: data.discountCents,
        finalAmountCents: data.finalAmountCents,
        isFullDiscount: data.isFullDiscount,
      });
      setCouponInput("");
      setCouponExpanded(false);
    } catch {
      setCouponError("Erro ao validar cupom.");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
  }

  // Auto-apply a coupon arriving from a magnet/drip CTA (?cupom=REVALIDA5).
  // Deferred to a macrotask so the validate fetch's setState isn't called
  // synchronously inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!initialCoupon || appliedCoupon) return;
    const id = setTimeout(() => applyCoupon(initialCoupon), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advanceFromAccount() {
    const err = validateGuestFields();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep("billing");
  }

  function advanceFromBilling() {
    const err = validateBilling(billing);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep("payment");
  }

  function validateGuestFields(): string | null {
    if (isLoggedIn) return null;
    if (!guestEmail.trim()) return "Informe seu e-mail.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) return "E-mail inválido.";
    if (!guestPassword) return "Informe uma senha.";
    if (accountMode === "signup" && guestPassword.length < 8)
      return "A senha deve ter no mínimo 8 caracteres.";
    return null;
  }

  function buildAuthPayload() {
    if (isLoggedIn) return {};
    return accountMode === "signup"
      ? {
          signup: {
            email: guestEmail.trim(),
            password: guestPassword,
            displayName: guestName.trim() || null,
          },
        }
      : {
          login: {
            email: guestEmail.trim(),
            password: guestPassword,
          },
        };
  }

  function buildBasePayload() {
    return {
      ...buildAuthPayload(),
      ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      billing,
    };
  }

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
        cohortSlug={cohortSlug}
        qrText={result.pixQrText}
        qrImageUrl={result.pixQrImageUrl}
        expiresAt={result.pixExpiresAt}
        onPaid={() => setPaid(true)}
      />
    );
  }

  async function submitPix() {
    const guestErr = validateGuestFields() ?? validateBilling(billing);
    if (guestErr) {
      setError(guestErr);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pagbank/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohortSlug,
          paymentMethod: "pix",
          ...buildBasePayload(),
        }),
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
    cardBin: string;
  }) {
    const guestErr = validateGuestFields() ?? validateBilling(billing);
    if (guestErr) {
      setError(guestErr);
      return;
    }
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
          cardBin: params.cardBin,
          ...buildBasePayload(),
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

          {appliedCoupon ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground/55">Subtotal</span>
                <span className="text-foreground/70">{priceLabel}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-brand">Cupom {appliedCoupon.code}</span>
                <span className="text-brand">−{fmtBRL(appliedCoupon.discountCents)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-sm text-foreground/55">Total</span>
                <span
                  className="text-3xl font-extrabold text-foreground"
                  style={{ fontFamily: "var(--font-bricolage)" }}
                >
                  {fmtBRL(effectiveAmountCents)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-foreground/55">Total</span>
              <span className="flex items-baseline gap-2">
                {compareAtPriceLabel && (
                  <span className="text-base font-medium text-foreground/40 line-through">
                    {compareAtPriceLabel}
                  </span>
                )}
                <span
                  className="text-3xl font-extrabold text-foreground"
                  style={{ fontFamily: "var(--font-bricolage)" }}
                >
                  {priceLabel}
                </span>
              </span>
            </div>
          )}

          {/* Coupon input / applied-state */}
          <div className="mt-4">
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 font-semibold text-brand">
                  <Tag className="h-3.5 w-3.5" />
                  {appliedCoupon.code}
                </span>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="flex items-center gap-1 text-xs text-foreground/55 hover:text-foreground"
                  aria-label="Remover cupom"
                >
                  <X className="h-3 w-3" />
                  Remover
                </button>
              </div>
            ) : couponExpanded ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase());
                      setCouponError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); applyCoupon(); }
                    }}
                    placeholder="REVALIDA20"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => applyCoupon()}
                    disabled={couponLoading || !couponInput.trim()}
                    className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand/85 disabled:opacity-50"
                  >
                    {couponLoading ? "…" : "Aplicar"}
                  </button>
                </div>
                {couponError && (
                  <p className="text-xs text-destructive">{couponError}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCouponExpanded(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
              >
                <Tag className="h-3 w-3" />
                Tem um cupom de desconto?
              </button>
            )}
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

          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-3 text-xs font-semibold">
            {steps.map((s, i) => (
              <div key={s.key} className="flex flex-1 items-center gap-3 last:flex-none">
                <div className={`flex items-center gap-2 ${step === s.key ? "text-brand" : "text-foreground/40"}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                    step === s.key ? "bg-brand text-white" : "bg-muted text-foreground/40"
                  }`}>{i + 1}</span>
                  {s.label}
                </div>
                {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: account (guest only) */}
          {step === "account" && !isLoggedIn && (
            <div className="flex flex-col gap-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold text-foreground">
                  {accountMode === "signup" ? "Criar sua conta" : "Entrar"}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setAccountMode((m) => (m === "signup" ? "login" : "signup"));
                    setError(null);
                  }}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  {accountMode === "signup" ? "Já tem conta? Entrar" : "Criar conta"}
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {accountMode === "signup" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground/70">
                      Nome completo
                    </label>
                    <input
                      type="text"
                      autoComplete="name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Dra. Maria Silva"
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground/70">E-mail</label>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground/70">
                    Senha
                    {accountMode === "signup" && (
                      <span className="ml-1.5 font-normal text-foreground/40">
                        (mínimo 8 caracteres)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showGuestPassword ? "text" : "password"}
                      autoComplete={accountMode === "signup" ? "new-password" : "current-password"}
                      value={guestPassword}
                      onChange={(e) => setGuestPassword(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGuestPassword((v) => !v)}
                      aria-label={showGuestPassword ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showGuestPassword}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-foreground/40 transition-colors hover:text-foreground"
                    >
                      {showGuestPassword ? (
                        <EyeOff className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Eye className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={advanceFromAccount}
                className="w-full rounded-xl bg-brand py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Step: billing details (tax / nota fiscal) */}
          {step === "billing" && (
            <div className="flex flex-col gap-6">
              <BillingForm value={billing} onChange={patchBilling} />
              <button
                type="button"
                onClick={advanceFromBilling}
                className="w-full rounded-xl bg-brand py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95"
              >
                Continuar para pagamento →
              </button>
            </div>
          )}

          {/* Step: payment */}
          {step === "payment" && (
            <>
              {/* Account + billing summary with edit links */}
              <div className="mb-5 flex flex-col gap-2">
                {!isLoggedIn && (
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-brand" />
                      <span className="truncate font-medium text-foreground/70">{guestEmail}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setStep("account"); setError(null); }}
                      className="shrink-0 text-xs font-semibold text-brand hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-brand" />
                    <span className="truncate font-medium text-foreground/70">
                      {billing.firstName} {billing.lastName} · CPF {billing.cpf}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStep("billing"); setError(null); }}
                    className="shrink-0 text-xs font-semibold text-brand hover:underline"
                  >
                    Editar
                  </button>
                </div>
              </div>

              {isFullDiscount ? (
                <div className="flex flex-col gap-5">
                  <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-4 text-sm text-foreground/70">
                    Seu cupom cobre 100% do valor. Nenhum pagamento será cobrado.
                  </div>
                  <button
                    type="button"
                    onClick={submitPix /* paymentMethod is irrelevant; charge route short-circuits */}
                    disabled={loading}
                    className="w-full rounded-xl bg-brand py-3.5 text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {loading ? "Confirmando…" : "Confirmar matrícula gratuita"}
                  </button>
                </div>
              ) : (
                <>
                  {/* Method tabs */}
                  <div className="mb-6 flex rounded-xl border border-border p-1">
                    <button
                      type="button"
                      onClick={() => { setMethod("pix"); setError(null); }}
                      className={`flex-1 rounded-lg py-3 min-h-[44px] text-sm font-semibold transition-colors ${
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
                      className={`flex-1 rounded-lg py-3 min-h-[44px] text-sm font-semibold transition-colors ${
                        method === "credit_card"
                          ? "bg-brand text-white shadow-sm"
                          : "text-foreground/60 hover:text-foreground"
                      }`}
                    >
                      Cartão de crédito
                    </button>
                  </div>

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
                      amountCents={effectiveAmountCents}
                      cohortSlug={cohortSlug}
                      cardHolderDefault={isLoggedIn ? userName : guestName}
                      pagbankPublicKey={pagbankPublicKey}
                      loading={loading}
                      initialInstallments={appliedCoupon ? [] : initialInstallments}
                      couponCode={appliedCoupon?.code ?? null}
                      onSubmit={submitCard}
                    />
                  )}

                  <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-foreground/35">
                    <Lock className="h-3 w-3" />
                    Pagamento seguro via PagBank
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {isLoggedIn ? (
          <p className="mt-4 text-center text-xs text-foreground/35">
            Logado como <span className="font-medium">{userEmail}</span>.{" "}
            <Link href="/auth/signout" className="underline underline-offset-2 hover:text-foreground/60">
              Sair
            </Link>
          </p>
        ) : (
          <p className="mt-4 text-center text-xs text-foreground/35">
            Ao continuar, você aceita os{" "}
            <Link href="/termos" className="underline underline-offset-2 hover:text-foreground/60">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground/60">
              Política de privacidade
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
