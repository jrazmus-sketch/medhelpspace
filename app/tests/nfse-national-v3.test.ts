import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeNfseTomador, validateNfseTomador, type NfseTomador } from "@/lib/br";

// Karina 2026-10-27, third reply: the ClinAct tomador is chosen in "Dados para a
// nota fiscal" (never the cardholder), records before 28/10/2026 are internal
// tests, and her WebISS wording + ClinAct description are verbatim.

const ALUNO: NfseTomador = {
  type: "aluno",
  name: "Maria Silva",
  document: "529.982.247-25",
  email: "Maria@Exemplo.com",
  phone: "(75) 99123-4567",
  cep: "44001-000",
  street: "Rua A",
  number: "10",
  complement: "",
  neighborhood: "Centro",
  city: "Feira de Santana",
  state: "ba",
};

test("tomador: normalized to digits, trimmed, UF upper, unknown type → aluno", () => {
  const n = normalizeNfseTomador({ ...ALUNO, type: "xx" as never });
  assert.equal(n.type, "aluno");
  assert.equal(n.document, "52998224725");
  assert.equal(n.phone, "75991234567");
  assert.equal(n.cep, "44001000");
  assert.equal(n.state, "BA");
  assert.equal(n.email, "maria@exemplo.com");
  assert.equal(validateNfseTomador(n), null);
});

test("tomador: every field Karina listed is required (complemento optional)", () => {
  const ok = normalizeNfseTomador(ALUNO);
  for (const [field, msg] of [
    ["name", /nome completo/],
    ["document", /CPF/],
    ["email", /E-mail/],
    ["phone", /telefone/],
    ["cep", /CEP/],
    ["street", /logradouro/],
    ["number", /número/],
    ["neighborhood", /bairro/],
    ["city", /município/],
    ["state", /UF/],
  ] as const) {
    assert.match(validateNfseTomador({ ...ok, [field]: "" }) ?? "", msg, field);
  }
  assert.equal(validateNfseTomador({ ...ok, complement: "" }), null);
  assert.match(validateNfseTomador({ ...ok, name: "Maria" }) ?? "", /nome completo/);
});

test("tomador: Pessoa Jurídica needs razão social + a valid CNPJ", () => {
  const pj = normalizeNfseTomador({ ...ALUNO, type: "pj", name: "Clínica X Ltda", document: "11.222.333/0001-81" });
  assert.equal(validateNfseTomador(pj), null);
  assert.match(validateNfseTomador({ ...pj, document: "52998224725" }) ?? "", /CNPJ/);
  assert.match(validateNfseTomador({ ...pj, name: "" }) ?? "", /razão social/);
});

const read = (p: string) => readFileSync(path.resolve(p), "utf8");
const client = read("src/app/admin/notas-fiscais/notas-fiscais-client.tsx");
const page = read("src/app/admin/notas-fiscais/page.tsx");
const form = read("src/app/clinact/(membro)/assinar/subscribe-form.tsx");
const assinarRoute = read("src/app/api/clinact/assinar/route.ts");
const ptBR = JSON.parse(read("src/locales/admin/pt-BR.json")).notasFiscais;

test("ClinAct description: Karina's text, verbatim", () => {
  assert.ok(
    client.includes(
      "Assinatura da plataforma educacional MedHelpSpace ClinAct, destinada ao treinamento online de raciocínio e decisão clínica — plano {plano}, referente ao período de {inicio} a {fim}.",
    ),
  );
  assert.match(client, /codigo: "080201"/);
});

test("internal tests: out of every sale filter, only under Testes internos", () => {
  for (const s of ["pending", "issued", "cancelled", "refunded"]) {
    assert.match(client, new RegExp(`${s}: \\(r\\) => !r\\.internalTest`), s);
  }
  assert.match(client, /test: \(r\) => r\.internalTest/);
  assert.match(client, /situation === "all" \? !isSale\(r\)/);
  assert.equal(ptBR.statusTest, "Testes internos");
  // ...and out of the bell/digest backlog.
  const backlog = read("src/lib/admin/nfse.ts");
  assert.equal(backlog.match(/\.eq\("internal_test", false\)/g)?.length, 2);
});

test("WebISS test notas: her two sentences, verbatim", () => {
  assert.equal(ptBR.webissTestNota, "Nota de teste emitida no WebISS — competência anterior a 01/11/2026.");
  assert.equal(
    ptBR.webissTestRefunded,
    "Teste reembolsado com NFS-e emitida no WebISS — verifique se a nota fiscal também foi cancelada.",
  );
  // Never cancelled automatically: the screen only shows the warning.
  assert.doesNotMatch(client, /nfseStatus = "cancelled"[^\n]*internalTest/);
});

test("ClinAct tomador: from Dados para a nota fiscal, never from the card", () => {
  assert.match(form, /Dados para a nota fiscal/);
  for (const label of ["Para mim (aluno)", "Outra pessoa física", "Pessoa jurídica"]) {
    assert.ok(form.includes(label), label);
  }
  assert.match(assinarRoute, /validateNfseTomador\(tomador\)/);
  // The fiscal screen reads tomador_* and no longer builds a tomador from billing_*.
  assert.match(page, /tomador: i\.tomador_type/);
  assert.doesNotMatch(page, /name: i\.billing_name/);
  assert.equal(ptBR.sectionTomadorCard, undefined);
});
