"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  UF_OPTIONS,
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhoneBr,
  onlyDigits,
  type NfseTomador,
  type TomadorType,
} from "@/lib/br";

export const TOMADOR_TYPES: Array<{ value: TomadorType; label: string }> = [
  { value: "aluno", label: "Para mim (aluno)" },
  { value: "pf", label: "Outra pessoa física" },
  { value: "pj", label: "Pessoa jurídica" },
];

export const EMPTY_TOMADOR: NfseTomador = {
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

/**
 * "Dados para a nota fiscal" — ONE block shared by the ClinAct and the Revalida
 * checkouts (Karina 2026-10-28: "a mesma lógica, os mesmos nomes e a mesma
 * organização visual"). The nota goes to the student himself (default), another
 * Pessoa Física or a Pessoa Jurídica — never, by default, to whoever owns the
 * card: the card block of each checkout is payment only.
 *
 * Each checkout decides what switching the type does to the identity
 * (`onTypeChange`) and what it shows about the student when the nota is for
 * someone else (`student`) — the fields themselves never differ.
 */
export function NotaFiscalFields({
  value,
  onChange,
  onTypeChange,
  student,
  fieldClass,
  optionClass,
}: {
  value: NfseTomador;
  /** Must merge functionally — the CEP lookup patches after an await. */
  onChange: (patch: Partial<NfseTomador>) => void;
  onTypeChange: (type: TomadorType) => void;
  /** Shown right under the choice whenever the nota is NOT for the student. */
  student: ReactNode;
  fieldClass: string;
  /** Background/border of an unselected option card. */
  optionClass: string;
}) {
  const isPj = value.type === "pj";
  const [cepLoading, setCepLoading] = useState(false);
  const lastCepLookup = useRef("");

  // ViaCEP autofill. Keyless public API; degrades silently.
  const cepDigits = onlyDigits(value.cep);
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
        if (Object.keys(p).length) onChange(p);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onChange merges functionally; cepDigits drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepDigits]);

  const optional = <span className="font-normal text-muted-foreground">(opcional)</span>;

  return (
    <section className="@container flex flex-col gap-3" aria-labelledby="nota-title">
      <div>
        <h2 id="nota-title" className="text-base font-semibold">
          Dados para a nota fiscal
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A nota fiscal é emitida em nome de quem você indicar aqui.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Emitir a nota para</legend>
        <div className="mt-2 grid gap-2 @lg:grid-cols-3">
          {TOMADOR_TYPES.map((o) => (
            <label
              key={o.value}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium ${
                value.type === o.value ? "border-brand bg-brand/10" : optionClass
              }`}
            >
              <input
                type="radio"
                name="tomador"
                value={o.value}
                checked={value.type === o.value}
                onChange={() => onTypeChange(o.value)}
                className="h-4 w-4 shrink-0"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      {value.type !== "aluno" && (
        <>
          {student}
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tomador da nota fiscal
          </p>
        </>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{isPj ? "Razão social" : "Nome completo"}</span>
        <input
          className={fieldClass}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          autoComplete={isPj ? "organization" : "name"}
          required
        />
      </label>

      <div className="grid gap-3 @md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{isPj ? "CNPJ" : "CPF"}</span>
          <input
            className={fieldClass}
            value={value.document}
            onChange={(e) =>
              onChange({ document: isPj ? formatCnpj(e.target.value) : formatCpf(e.target.value) })
            }
            inputMode="numeric"
            placeholder={isPj ? "00.000.000/0000-00" : "000.000.000-00"}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Telefone com DDD</span>
          <input
            className={fieldClass}
            value={value.phone}
            onChange={(e) => onChange({ phone: formatPhoneBr(e.target.value) })}
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
          className={fieldClass}
          type="email"
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
          autoComplete="email"
          required
        />
      </label>

      <div className="grid gap-3 @md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            CEP
            {cepLoading && <span className="ml-2 font-normal text-muted-foreground">buscando…</span>}
          </span>
          <input
            className={fieldClass}
            value={value.cep}
            onChange={(e) => onChange({ cep: formatCep(e.target.value) })}
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
          className={fieldClass}
          value={value.street}
          onChange={(e) => onChange({ street: e.target.value })}
          autoComplete="address-line1"
          placeholder="Rua, avenida…"
          required
        />
      </label>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">Número</span>
          <input
            className={fieldClass}
            value={value.number}
            onChange={(e) => onChange({ number: e.target.value })}
            placeholder="123"
            required
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">Complemento {optional}</span>
          <input
            className={fieldClass}
            value={value.complement}
            onChange={(e) => onChange({ complement: e.target.value })}
            autoComplete="address-line2"
            placeholder="Apto, sala…"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Bairro</span>
        <input
          className={fieldClass}
          value={value.neighborhood}
          onChange={(e) => onChange({ neighborhood: e.target.value })}
          required
        />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">Município</span>
          <input
            className={fieldClass}
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            autoComplete="address-level2"
            required
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">UF</span>
          <select
            className={fieldClass}
            value={value.state}
            onChange={(e) => onChange({ state: e.target.value })}
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
  );
}
