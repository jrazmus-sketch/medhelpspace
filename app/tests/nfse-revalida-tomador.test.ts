import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  billingFromTomador,
  normalizeNfseTomador,
  resolveCheckoutStudent,
  splitFullName,
  validateCheckoutStudent,
  type NfseTomador,
} from "@/lib/br";

// Karina 2026-10-28 (fourth reply): the Revalida checkout gets the SAME "Dados
// para a nota fiscal" block as ClinAct — Para mim (aluno) / Outra pessoa física /
// Pessoa jurídica — student kept apart, card holder payment only.

const BASE: NfseTomador = normalizeNfseTomador({
  type: "aluno",
  name: "Maria da Silva",
  document: "529.982.247-25",
  email: "maria@exemplo.com",
  phone: "(75) 99123-4567",
  cep: "44001-000",
  street: "Rua A",
  number: "10",
  complement: "Sala 2",
  neighborhood: "Centro",
  city: "Feira de Santana",
  state: "BA",
});

test("full name split keeps every surname", () => {
  assert.deepEqual(splitFullName("  Maria  da Silva "), { firstName: "Maria", lastName: "da Silva" });
  assert.deepEqual(splitFullName("Maria"), { firstName: "Maria", lastName: "" });
});

test("Para mim (aluno): the student IS the tomador, the student block is ignored", () => {
  const s = resolveCheckoutStudent(BASE, { name: "Outro Nome", cpf: "111.444.777-35" });
  assert.deepEqual(s, { name: "Maria da Silva", cpf: "52998224725" });
  const b = billingFromTomador(BASE, s);
  assert.equal(b.personType, "pf");
  assert.equal(b.firstName, "Maria");
  assert.equal(b.lastName, "da Silva");
  assert.equal(b.cpf, "52998224725");
  assert.equal(b.companyName, "");
  assert.equal(b.address, "Rua A");
  assert.equal(b.phone, "75991234567");
});

test("Outra pessoa física: student and tomador stay separate", () => {
  const t = normalizeNfseTomador({ ...BASE, type: "pf", name: "Carlos Pereira Lima", document: "111.444.777-35" });
  const s = resolveCheckoutStudent(t, { name: " Maria da Silva ", cpf: "529.982.247-25" });
  assert.equal(validateCheckoutStudent(s), null);
  const b = billingFromTomador(t, s);
  // billing_first/last_name + billing_cpf are the STUDENT, never the tomador.
  assert.equal(`${b.firstName} ${b.lastName}`, "Maria da Silva");
  assert.equal(b.cpf, "52998224725");
  assert.equal(b.personType, "pf");
  assert.equal(b.companyName, "");
  // The student block is required when the nota is for someone else.
  assert.match(validateCheckoutStudent(resolveCheckoutStudent(t, {})) ?? "", /nome completo do aluno/);
  assert.match(validateCheckoutStudent(resolveCheckoutStudent(t, { name: "Maria Silva", cpf: "123" })) ?? "", /CPF do aluno/);
});

test("Pessoa jurídica: company fields from the tomador, student apart", () => {
  const t = normalizeNfseTomador({ ...BASE, type: "pj", name: "Clínica X Ltda", document: "11.222.333/0001-81", email: "nf@clinicax.com.br" });
  const b = billingFromTomador(t, { name: "Maria da Silva", cpf: "52998224725" });
  assert.equal(b.personType, "pj");
  assert.equal(b.companyName, "Clínica X Ltda");
  assert.equal(b.cnpj, "11222333000181");
  assert.equal(b.companyEmail, "nf@clinicax.com.br");
  assert.equal(b.cpf, "52998224725");
});

const read = (p: string) => readFileSync(path.resolve(p), "utf8");

test("both checkouts render the one shared block", () => {
  const shared = "@/components/checkout/nota-fiscal-fields";
  assert.ok(read("src/app/checkout/billing-form.tsx").includes(shared));
  assert.ok(read("src/app/clinact/(membro)/assinar/subscribe-form.tsx").includes(shared));
  const billingForm = read("src/app/checkout/billing-form.tsx");
  assert.match(billingForm, /Aluno \(quem vai acessar o curso\)/);
});

test("Revalida card: payment only, holder CPF never assumed", () => {
  const card = read("src/app/checkout/card-form.tsx");
  assert.ok(card.includes("Os dados do cartão são usados somente para o pagamento."));
  assert.ok(card.includes("O titular do cartão tem o mesmo CPF informado na nota fiscal"));
  assert.ok(card.includes("CPF do titular do cartão"));
  const route = read("src/app/api/pagbank/charge/route.ts");
  assert.match(route, /validateNfseTomador\(tomador\)/);
  assert.match(route, /validateCheckoutStudent\(student\)/);
  // Holder CPF comes from the request, not from the nota/billing, on the new form.
  assert.match(route, /const cpf = tomador \? onlyDigits\(body\.cpf \?\? ""\) : billing\.cpf/);
  assert.match(route, /tomador_type: tomador\.type/);
  // The fiscal screen reads the stored tomador on orders too.
  assert.match(read("src/app/admin/notas-fiscais/page.tsx"), /tomador: storedTomador\(o\) \?\?/);
});
