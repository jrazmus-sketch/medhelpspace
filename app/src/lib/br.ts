// Brazil-specific input helpers shared by client (formatting + live validation in
// the checkout forms) and server (re-validation in the charge route). Keep this
// file dependency-free so it can be imported from both "use client" and server code.

/** Mask CPF digits as 000.000.000-00 while typing. */
export function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Validate CPF check digits. Accepts masked or unmasked input. */
export function isValidCpf(raw: string): boolean {
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

/** Mask CEP digits as 00000-000 while typing. */
export function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Brazilian states (UF) for the Estado dropdown. */
export const UF_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const UF_SET = new Set(UF_OPTIONS.map((u) => u.value));
export function isValidUf(uf: string): boolean {
  return UF_SET.has(uf.toUpperCase());
}

/** Mask CNPJ digits as 00.000.000/0000-00 while typing. */
export function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Validate CNPJ check digits. Accepts masked or unmasked input. */
export function isValidCnpj(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    let weight = len - 7;
    for (let i = 0; i < len; i++) {
      sum += parseInt(d[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === parseInt(d[12]) && digit(13) === parseInt(d[13]);
}

/** Who the nota is issued to: the student (PF) or a company paying for them (PJ). */
export type PersonType = "pf" | "pj";

// Shape shared across checkout client, charge route, and DB columns.
export interface BillingDetails {
  /** Defaults to "pf". In "pj" the address is the company's. */
  personType: PersonType;
  // The STUDENT (always) — and the tomador when personType is "pf".
  firstName: string;
  lastName: string;
  cpf: string;          // digits only by the time it hits the server
  // The company — the tomador when personType is "pj". Empty for "pf".
  companyName: string;  // razão social
  cnpj: string;         // digits only by the time it hits the server
  companyEmail: string; // optional — where the company wants the nota
  cep: string;          // digits only
  address: string;
  number: string;
  neighborhood: string; // optional
  city: string;
  state: string;        // UF
  phone: string;        // optional, digits only
}

/**
 * Validate a billing payload server-side. Returns a Portuguese error string for
 * the first problem, or null if valid. Required fields mirror the old WooCommerce
 * form (neighborhood + phone are optional).
 */
export function validateBilling(b: Partial<BillingDetails> | undefined): string | null {
  if (!b) return "Dados de cobrança ausentes.";
  if (b.personType !== undefined && b.personType !== "pf" && b.personType !== "pj") {
    return "Tipo de comprador inválido.";
  }
  if (b.personType === "pj") {
    if (!b.companyName?.trim()) return "Informe a razão social da empresa.";
    if (!b.cnpj || !isValidCnpj(b.cnpj)) return "CNPJ inválido.";
    const email = b.companyEmail?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail da empresa inválido.";
  }
  if (!b.firstName?.trim()) return "Informe o nome.";
  if (!b.lastName?.trim()) return "Informe o sobrenome.";
  if (!b.cpf || !isValidCpf(b.cpf)) return "CPF inválido.";
  if (!b.cep || onlyDigits(b.cep).length !== 8) return "CEP inválido.";
  if (!b.address?.trim()) return "Informe o endereço.";
  if (!b.number?.trim()) return "Informe o número.";
  if (!b.city?.trim()) return "Informe a cidade.";
  if (!b.state || !isValidUf(b.state)) return "Selecione o estado.";
  return null;
}

/**
 * The tomador of a ClinAct subscription's NFS-e (Karina 2026-10-27): the
 * student himself (default), another Pessoa Física, or a Pessoa Jurídica.
 * Never derived from the card — the cardholder is payment data only.
 */
export type TomadorType = "aluno" | "pf" | "pj";

export interface NfseTomador {
  type: TomadorType;
  /** Nome completo, or razão social when "pj". */
  name: string;
  /** CPF, or CNPJ when "pj" — digits only by the time it hits the server. */
  document: string;
  email: string;
  phone: string;        // digits, with DDD
  cep: string;          // digits only
  street: string;       // logradouro
  number: string;
  complement: string;   // optional
  neighborhood: string;
  city: string;
  state: string;        // UF
}

/** Trimmed, digits-only and length-capped copy — what the server stores. */
export function normalizeNfseTomador(t: Partial<NfseTomador> | undefined): NfseTomador {
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const type: TomadorType = t?.type === "pf" || t?.type === "pj" ? t.type : "aluno";
  return {
    type,
    name: s(t?.name, 200),
    document: onlyDigits(s(t?.document, 30)),
    email: s(t?.email, 200).toLowerCase(),
    phone: onlyDigits(s(t?.phone, 30)),
    cep: onlyDigits(s(t?.cep, 12)),
    street: s(t?.street, 200),
    number: s(t?.number, 30),
    complement: s(t?.complement, 100),
    neighborhood: s(t?.neighborhood, 100),
    city: s(t?.city, 100),
    state: s(t?.state, 2).toUpperCase(),
  };
}

/** Portuguese error for the first problem, or null. Expects a normalized tomador. */
export function validateNfseTomador(t: NfseTomador): string | null {
  const isPj = t.type === "pj";
  if (isPj) {
    if (!t.name) return "Informe a razão social.";
    if (!isValidCnpj(t.document)) return "CNPJ inválido.";
  } else {
    if (t.name.split(/\s+/).filter(Boolean).length < 2) return "Informe o nome completo.";
    if (!isValidCpf(t.document)) return "CPF inválido.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) return "E-mail inválido.";
  if (t.phone.length < 10 || t.phone.length > 11) return "Informe um telefone com DDD.";
  if (t.cep.length !== 8) return "CEP inválido.";
  if (!t.street) return "Informe o logradouro.";
  if (!t.number) return "Informe o número.";
  if (!t.neighborhood) return "Informe o bairro.";
  if (!t.city) return "Informe o município.";
  if (!isValidUf(t.state)) return "Selecione a UF.";
  return null;
}
