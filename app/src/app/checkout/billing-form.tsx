"use client";

import { useEffect, useRef, useState } from "react";
import { formatCpf, formatCep, formatCnpj, onlyDigits, UF_OPTIONS, type BillingDetails, type PersonType } from "@/lib/br";

interface Props {
  value: BillingDetails;
  onChange: (patch: Partial<BillingDetails>) => void;
}

const inputCls =
  "rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const labelCls = "text-sm font-medium text-foreground/70";
const groupCls = "text-xs font-semibold uppercase tracking-wide text-foreground/50";

const PERSON_TYPES: Array<{ value: PersonType; label: string }> = [
  { value: "pf", label: "Pessoa Física" },
  { value: "pj", label: "Pessoa Jurídica" },
];

// Brazilian billing identity required for the nota fiscal. Mirrors the fields the
// old WooCommerce checkout collected. Controlled by the parent CheckoutClient so
// the values can be validated and threaded into the charge request.
export function BillingForm({ value, onChange }: Props) {
  const isPj = value.personType === "pj";
  const [cepLoading, setCepLoading] = useState(false);
  const lastCepLookup = useRef<string>("");

  // ViaCEP autofill: once the CEP has 8 digits, fetch the address and fill
  // Endereço / Bairro / Cidade / Estado. Keyless public API; degrades silently.
  const cepDigits = onlyDigits(value.cep);
  useEffect(() => {
    if (cepDigits.length !== 8 || lastCepLookup.current === cepDigits) return;
    lastCepLookup.current = cepDigits;
    let cancelled = false;
    setCepLoading(true);
    fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
      .then((r) => r.json())
      .then((data: {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      }) => {
        if (cancelled || data.erro) return;
        const patch: Partial<BillingDetails> = {};
        if (data.logradouro) patch.address = data.logradouro;
        if (data.bairro) patch.neighborhood = data.bairro;
        if (data.localidade) patch.city = data.localidade;
        if (data.uf) patch.state = data.uf;
        if (Object.keys(patch).length) onChange(patch);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onChange is stable enough; cepDigits drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepDigits]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Dados de cobrança</h2>
        <p className="mt-1 text-xs text-foreground/45">
          Necessários para emissão da nota fiscal.
        </p>
      </div>

      {/* Pessoa Física (default) / Pessoa Jurídica — who the nota is issued to */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Comprar como</span>
        <div role="radiogroup" aria-label="Comprar como" className="grid grid-cols-2 gap-2">
          {PERSON_TYPES.map((opt) => {
            const active = value.personType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ personType: opt.value })}
                className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border text-foreground/60 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {isPj && (
        <>
          <div>
            <p className={groupCls}>Empresa (tomadora da nota fiscal)</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Razão social</label>
            <input
              type="text"
              autoComplete="organization"
              value={value.companyName}
              onChange={(e) => onChange({ companyName: e.target.value })}
              placeholder="Clínica Exemplo Ltda."
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>CNPJ</label>
              <input
                type="text"
                inputMode="numeric"
                value={value.cnpj}
                onChange={(e) => onChange({ cnpj: formatCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>
                E-mail da empresa <span className="font-normal text-foreground/40">(opcional)</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                value={value.companyEmail}
                onChange={(e) => onChange({ companyEmail: e.target.value })}
                placeholder="financeiro@empresa.com.br"
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-1">
            <p className={groupCls}>Aluno (quem vai acessar o curso)</p>
          </div>
        </>
      )}

      {/* Nome / Sobrenome */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Nome</label>
          <input
            type="text"
            autoComplete="given-name"
            value={value.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="Maria"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Sobrenome</label>
          <input
            type="text"
            autoComplete="family-name"
            value={value.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Silva"
            className={inputCls}
          />
        </div>
      </div>

      {/* CPF / País */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>CPF</label>
          <input
            type="text"
            inputMode="numeric"
            value={value.cpf}
            onChange={(e) => onChange({ cpf: formatCpf(e.target.value) })}
            placeholder="000.000.000-00"
            maxLength={14}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>País</label>
          <input
            type="text"
            value="Brasil"
            disabled
            className={`${inputCls} cursor-not-allowed opacity-60`}
          />
        </div>
      </div>

      {isPj && (
        <div className="mt-1">
          <p className={groupCls}>Endereço da empresa</p>
        </div>
      )}

      {/* CEP */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>
            CEP
            {cepLoading && (
              <span className="ml-2 text-xs font-normal text-foreground/40">buscando…</span>
            )}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={value.cep}
            onChange={(e) => onChange({ cep: formatCep(e.target.value) })}
            placeholder="00000-000"
            maxLength={9}
            className={inputCls}
          />
        </div>
      </div>

      {/* Endereço */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Endereço</label>
        <input
          type="text"
          autoComplete="address-line1"
          value={value.address}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="Rua, avenida…"
          className={inputCls}
        />
      </div>

      {/* Número / Bairro */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Número</label>
          <input
            type="text"
            value={value.number}
            onChange={(e) => onChange({ number: e.target.value })}
            placeholder="123"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>
            Bairro <span className="font-normal text-foreground/40">(opcional)</span>
          </label>
          <input
            type="text"
            value={value.neighborhood}
            onChange={(e) => onChange({ neighborhood: e.target.value })}
            placeholder="Centro"
            className={inputCls}
          />
        </div>
      </div>

      {/* Cidade / Estado */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Cidade</label>
          <input
            type="text"
            autoComplete="address-level2"
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder="São Paulo"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Estado</label>
          <select
            value={value.state}
            onChange={(e) => onChange({ state: e.target.value })}
            className={inputCls}
          >
            <option value="">Selecione…</option>
            {UF_OPTIONS.map((uf) => (
              <option key={uf.value} value={uf.value}>
                {uf.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Telefone */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>
            Telefone <span className="font-normal text-foreground/40">(opcional)</span>
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={value.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="(11) 99999-9999"
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
}
