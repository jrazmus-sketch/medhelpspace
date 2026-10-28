import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatCnpj, isValidCnpj, validateBilling, type BillingDetails } from "@/lib/br";
import { addMonthsKey, referencePeriod } from "@/lib/clinact/invoice-period";

// Karina 2026-10-27 ("Ajuste da emissão de NFS-e para o Portal Nacional", reply):
// PF/PJ at checkout, ClinAct invoices on the same fiscal screen, separate
// "Cancelada"/"Reembolsada", her money labels verbatim, no ISS rate.

const PF: BillingDetails = {
  personType: "pf",
  firstName: "Maria",
  lastName: "Silva",
  cpf: "529.982.247-25",
  companyName: "",
  cnpj: "",
  companyEmail: "",
  cep: "44001-000",
  address: "Rua A",
  number: "1",
  neighborhood: "",
  city: "Feira de Santana",
  state: "BA",
  phone: "",
};

test("CNPJ: check digits, mask, repeated digits refused", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11222333000181"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("11111111111111"), false);
  assert.equal(isValidCnpj("1122233300018"), false);
  assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
});

test("checkout: PF is the default and needs no company", () => {
  assert.equal(validateBilling(PF), null);
  // A payload from an old client without personType is still a PF sale.
  const { personType: _omit, ...legacy } = PF;
  assert.equal(validateBilling(legacy), null);
});

test("checkout: PJ needs razão social and a valid CNPJ, keeps the student's CPF", () => {
  const pj = { ...PF, personType: "pj" as const };
  assert.match(validateBilling(pj) ?? "", /razão social/);
  assert.match(validateBilling({ ...pj, companyName: "Clínica X Ltda" }) ?? "", /CNPJ/);
  const ok = { ...pj, companyName: "Clínica X Ltda", cnpj: "11.222.333/0001-81" };
  assert.equal(validateBilling(ok), null);
  assert.match(validateBilling({ ...ok, companyEmail: "não-é-email" }) ?? "", /E-mail/);
  // The student is still required on a PJ sale — kept separate from the tomador.
  assert.match(validateBilling({ ...ok, cpf: "" }) ?? "", /CPF/);
  assert.match(validateBilling({ ...PF, personType: "xx" as never }) ?? "", /Tipo/);
});

test("ClinAct reference period: Brasília calendar, inclusive, month-end clamped", () => {
  assert.deepEqual(referencePeriod("2026-09-25T08:58:32-03:00", "mensal"), { start: "2026-09-25", end: "2026-10-24" });
  assert.deepEqual(referencePeriod("2026-09-25T08:58:32-03:00", "anual"), { start: "2026-09-25", end: "2027-09-24" });
  // 23:30 in Brasília is already the next day in UTC — the period follows Brasília.
  assert.equal(referencePeriod("2026-10-31T23:30:00-03:00", "mensal").start, "2026-10-31");
  assert.equal(addMonthsKey("2027-01-31", 1), "2027-02-28");
  assert.equal(referencePeriod("2027-01-31T12:00:00-03:00", "mensal").end, "2027-02-27");
});

const read = (p: string) => readFileSync(path.resolve(p), "utf8");
const client = read("src/app/admin/notas-fiscais/notas-fiscais-client.tsx");
const ptBR = JSON.parse(read("src/locales/admin/pt-BR.json")).notasFiscais;

test("fiscal screen: official Emissor URL, no WebISS, no ISS rate", () => {
  assert.match(client, /"https:\/\/www\.nfse\.gov\.br\/EmissorNacional"/);
  // No WebISS link in the flow. The word itself survives only in the historical
  // label of the June test nota (Karina's third reply, 2026-10-27).
  assert.doesNotMatch(client, /google\.com\/url|https?:\/\/[^"\s]*webiss/i);
  assert.doesNotMatch(client, /Alíquota|SERVICO\.iss|fieldIss/);
  assert.equal(ptBR.openPortal, "Emitir NFS-e no Portal Nacional");
  assert.equal(ptBR.fieldIss, undefined);
});

test("fiscal screen: her money labels verbatim, surcharge separate from the service value", () => {
  assert.equal(ptBR.fieldOriginal, "Valor original do produto");
  assert.equal(ptBR.fieldDiscount, "Desconto aplicado");
  assert.equal(ptBR.fieldService, "Valor do serviço após o desconto");
  assert.match(ptBR.fieldSurcharge, /^Acréscimo do parcelamento/);
  assert.equal(ptBR.fieldTotal, "Total cobrado do comprador");
  // Service value = original − discount; the surcharge never enters it.
  assert.match(client, /fmt\(r\.originalCents - r\.discountCents\)/);
  // "Copiar tudo" is built from the same field list as the screen.
  assert.match(client, /function copyBlock[\s\S]*sectionsFor\(r, tPt\)/);
});

test("fiscal screen: the filters Karina listed, Cancelada ≠ Reembolsada", () => {
  for (const k of ["productAll", "productRevalida", "productClinact"]) assert.ok(ptBR[k], k);
  assert.equal(ptBR.statusPending, "Aguardando emissão");
  assert.equal(ptBR.statusIssued, "Emitida");
  assert.equal(ptBR.statusCancelled, "Cancelada");
  assert.equal(ptBR.statusRefunded, "Reembolsada");
  assert.match(client, /cancelled: \(r\) => !r\.internalTest && notaState\(r\) === "cancelled"/);
  assert.match(client, /refunded: \(r\) => !r\.internalTest && r\.refunded/);
});
