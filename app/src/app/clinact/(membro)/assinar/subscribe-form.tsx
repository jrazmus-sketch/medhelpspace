"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  UF_OPTIONS,
  formatCep,
  formatCnpj,
  formatCpf,
  isValidCpf,
  normalizeNfseTomador,
  onlyDigits,
  validateNfseTomador,
  type NfseTomador,
  type TomadorType,
} from "@/lib/br";

type PlanOption = { key: string; label: string; price: string; note: string };

const TOMADOR_TYPES: Array<{ value: TomadorType; label: string }> = [
  { value: "aluno", label: "Para mim (aluno)" },
  { value: "pf", label: "Outra pessoa física" },
  { value: "pj", label: "Pessoa jurídica" },
];

const EMPTY_TOMADOR: NfseTomador = {
  type: "aluno",
  name: "",
  document: "",
  email: "",
  phone: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

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
 *
 * "Dados para a nota fiscal" is its own block (Karina 2026-10-27): the nota goes
 * to the student, another Pessoa Física or a Pessoa Jurídica — never, by
 * default, to whoever owns the card. The card block is payment only.
 */
export function SubscribeForm({
  publicKey,
  plans,
  initialPlan,
  student,
}: {
  publicKey: string;
  plans: PlanOption[];
  initialPlan?: string;
  /** The logged-in account — the person who will use ClinAct. */
  student: { name: string; email: string };
}) {
  const router = useRouter();
  const [attemptId] = useState(() =>
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-zA-Z0-9]/g, ""),
  );
  const [planKey, setPlanKey] = useState(initialPlan ?? plans[0]?.key ?? "mensal");
  const [tomador, setTomador] = useState<NfseTomador>({
    ...EMPTY_TOMADOR,
    name: student.name,
    email: student.email,
  });
  const [holder, setHolder] = useState("");
  // The common case — paying with your own card — should not mean typing the
  // same CPF twice. It is an explicit choice, never an assumption.
  const [sameCpf, setSameCpf] = useState(true);
  const [cpf, setCpf] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const lastCepLookup = useRef("");

  const isPj = tomador.type === "pj";
  const cardCpfFromNota = !isPj && sameCpf;

  function patch(p: Partial<NfseTomador>) {
    setTomador((prev) => ({ ...prev, ...p }));
  }

  // Switching who the nota is for clears the identity (a student's CPF must
  // never end up on someone else's nota) but keeps the address.
  function chooseType(type: TomadorType) {
    if (type === tomador.type) return;
    patch({
      type,
      name: type === "aluno" ? student.name : "",
      document: "",
      email: type === "aluno" ? student.email : "",
    });
  }

  // ViaCEP autofill, same as the Revalida checkout. Keyless; degrades silently.
  const cepDigits = onlyDigits(tomador.cep);
  useEffect(() => {
    if (cepDigits.length !== 8 || lastCepLookup.current === cepDigits) return;
    lastCepLookup.current = cepDigits;
    let cancelled = false;
    setCepLoading(true);
    fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      .then((r) => r.json())
      .then((data: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }) => {
        if (cancelled || data.erro) return;
        const p: Partial<NfseTomador> = {};
        if (data.logradouro) p.street = data.logradouro;
        if (data.bairro) p.neighborhood = data.bairro;
        if (data.localidade) p.city = data.localidade;
        if (data.uf) p.state = data.uf;
        if (Object.keys(p).length) setTomador((prev) => ({ ...prev, ...p }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cepDigits]);

  function formatCard(raw: string) {
    return raw.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  }
  function formatExpiry(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sdkReady || !window.PagSeguro) {
      setError("O sistema de pagamento ainda está carregando. Aguarde um instante.");
      return;
    }

    const nota = normalizeNfseTomador(tomador);
    const notaError = validateNfseTomador(nota);
    if (notaError) return setError(`Dados para a nota fiscal: ${notaError}`);

    const rawNumber = number.replace(/\s/g, "");
    const [expMonth, expYear2] = expiry.split("/");
    const expYear = expYear2?.length === 2 ? `20${expYear2}` : expYear2;
    const holderCpf = cardCpfFromNota ? nota.document : onlyDigits(cpf);

    if (holder.trim().length < 3) return setError("Informe o nome como está no cartão.");
    if (!isValidCpf(holderCpf)) return setError("CPF do titular do cartão inválido.");
    if (rawNumber.length < 13) return setError("Número do cartão inválido.");
    if (!expMonth || expMonth.length !== 2 || !expYear) return setError("Validade inválida.");
    if (cvv.length < 3) return setError("Código de segurança inválido.");

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
          cpf: holderCpf,
          tomador: nota,
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
    "min-h-12 w-full min-w-0 rounded-xl border border-border bg-surface-1 px-3 text-base outline-none focus:border-brand";
  const sectionTitle = "text-base font-semibold";
  const optional = <span className="font-normal text-muted-foreground">(opcional)</span>;

  return (
    <>
      <Script
        src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onError={() => setError("Não foi possível carregar o sistema de pagamento. Recarregue a página.")}
      />

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
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

        {/* ── Dados para a nota fiscal ─────────────────────────────────────── */}
        <section className="flex flex-col gap-3" aria-labelledby="nota-title">
          <div>
            <h2 id="nota-title" className={sectionTitle}>
              Dados para a nota fiscal
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A nota fiscal é emitida em nome de quem você indicar aqui.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Emitir a nota para</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {TOMADOR_TYPES.map((o) => (
                <label
                  key={o.value}
                  className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium ${
                    tomador.type === o.value ? "border-brand bg-brand/10" : "border-border bg-surface-1"
                  }`}
                >
                  <input
                    type="radio"
                    name="tomador"
                    value={o.value}
                    checked={tomador.type === o.value}
                    onChange={() => chooseType(o.value)}
                    className="h-4 w-4 shrink-0"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          {tomador.type !== "aluno" && (
            <p className="rounded-xl border border-border bg-surface-1 p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Aluno (quem vai usar o ClinAct):</span>{" "}
              {student.name ? `${student.name} · ` : ""}
              {student.email}. O acesso continua na sua conta.
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{isPj ? "Razão social" : "Nome completo"}</span>
            <input
              className={field}
              value={tomador.name}
              onChange={(e) => patch({ name: e.target.value })}
              autoComplete={isPj ? "organization" : "name"}
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{isPj ? "CNPJ" : "CPF"}</span>
              <input
                className={field}
                value={tomador.document}
                onChange={(e) =>
                  patch({ document: isPj ? formatCnpj(e.target.value) : formatCpf(e.target.value) })
                }
                inputMode="numeric"
                placeholder={isPj ? "00.000.000/0000-00" : "000.000.000-00"}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Telefone com DDD</span>
              <input
                className={field}
                value={tomador.phone}
                onChange={(e) => patch({ phone: formatPhone(e.target.value) })}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(11) 91234-5678"
                required
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">E-mail</span>
            <input
              className={field}
              type="email"
              value={tomador.email}
              onChange={(e) => patch({ email: e.target.value })}
              autoComplete="email"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                CEP
                {cepLoading && <span className="ml-2 font-normal text-muted-foreground">buscando…</span>}
              </span>
              <input
                className={field}
                value={tomador.cep}
                onChange={(e) => patch({ cep: formatCep(e.target.value) })}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                required
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Logradouro</span>
            <input
              className={field}
              value={tomador.street}
              onChange={(e) => patch({ street: e.target.value })}
              autoComplete="address-line1"
              placeholder="Rua, avenida…"
              required
            />
          </label>

          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">Número</span>
              <input
                className={field}
                value={tomador.number}
                onChange={(e) => patch({ number: e.target.value })}
                placeholder="123"
                required
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">Complemento {optional}</span>
              <input
                className={field}
                value={tomador.complement}
                onChange={(e) => patch({ complement: e.target.value })}
                autoComplete="address-line2"
                placeholder="Apto, sala…"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Bairro</span>
            <input
              className={field}
              value={tomador.neighborhood}
              onChange={(e) => patch({ neighborhood: e.target.value })}
              required
            />
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">Município</span>
              <input
                className={field}
                value={tomador.city}
                onChange={(e) => patch({ city: e.target.value })}
                autoComplete="address-level2"
                required
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">UF</span>
              <select
                className={field}
                value={tomador.state}
                onChange={(e) => patch({ state: e.target.value })}
                required
              >
                <option value="">—</option>
                {UF_OPTIONS.map((uf) => (
                  <option key={uf.value} value={uf.value}>
                    {uf.value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* ── Pagamento ───────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3" aria-labelledby="pagamento-title">
          <div>
            <h2 id="pagamento-title" className={sectionTitle}>
              Pagamento
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Os dados do cartão são usados somente para o pagamento.
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nome como está no cartão</span>
            <input className={field} value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="cc-name" required />
          </label>

          {!isPj && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={sameCpf}
                onChange={(e) => setSameCpf(e.target.checked)}
                className="h-5 w-5 shrink-0"
              />
              O titular do cartão tem o mesmo CPF informado na nota fiscal
            </label>
          )}

          {!cardCpfFromNota && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">CPF do titular do cartão</span>
              <input
                className={field}
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                inputMode="numeric"
                placeholder="000.000.000-00"
                required
              />
            </label>
          )}

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
            <label className="flex min-w-0 flex-col gap-1.5">
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
            <label className="flex min-w-0 flex-col gap-1.5">
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
        </section>

        <div className="flex flex-col gap-3">
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
        </div>
      </form>
    </>
  );
}
