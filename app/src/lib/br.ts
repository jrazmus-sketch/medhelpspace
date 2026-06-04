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

// Shape shared across checkout client, charge route, and DB columns.
export interface BillingDetails {
  firstName: string;
  lastName: string;
  cpf: string;          // digits only by the time it hits the server
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
