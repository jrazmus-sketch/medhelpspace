/**
 * /termos and /privacidade (Karina 2026-11-02): the ClinAct additions in her own
 * wording. The patch that wrote them to editable_pages and the code fallback
 * must stay the same text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TERMOS_HTML, PRIVACIDADE_HTML } from "@/lib/legal-pages";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PATCH = readFileSync(path.join(ROOT, "schema-patch-legal-clinact.sql"), "utf8");
const page = (slug: string) => readFileSync(path.join(ROOT, "app/src/app", slug, "page.tsx"), "utf8");

test("the patch writes exactly lib/legal-pages.ts", () => {
  assert.ok(PATCH.includes(`$legal$${TERMOS_HTML}$legal$`));
  assert.ok(PATCH.includes(`$legal$${PRIVACIDADE_HTML}$legal$`));
});

test("both pages fall back to the same text", () => {
  assert.match(page("termos"), /<LegalFallback title="Termos de uso" html=\{TERMOS_HTML\} \/>/);
  assert.match(page("privacidade"), /<LegalFallback title="Política de privacidade" html=\{PRIVACIDADE_HTML\} \/>/);
});

test("Karina's sentences, verbatim", () => {
  for (const t of [
    "na contratação inicial realizada pela página, o cliente pode desistir em até 7 dias e solicitar o reembolso integral do valor pago pelo e-mail",
    "Após o prazo de 7 dias aplicável à contratação inicial, o cancelamento interrompe as cobranças futuras e o acesso permanece disponível até o fim do período já pago, sem reembolso proporcional, ressalvadas as hipóteses previstas em lei.",
    "A assinatura é renovada automaticamente ao final de cada período, conforme o preço e as condições de renovação informados no momento da contratação. Quando houver condição promocional temporária, o valor e a duração da promoção, bem como o valor aplicável após seu término, serão informados antes da contratação.",
    "caso a cobrança da renovação não seja aprovada, poderão ocorrer novas tentativas de cobrança. Se o pagamento não for regularizado, a assinatura poderá ser suspensa até a atualização da forma de pagamento.",
  ]) assert.ok(TERMOS_HTML.includes(t), t);
  assert.ok(PRIVACIDADE_HTML.includes("Os dados de pagamento são processados pelo PagBank. A MedHelpSpace não armazena o número completo do cartão nem o código de segurança."));
});

test("what she took out stays out", () => {
  // Retry days are an operational rule that may change; no browser-encryption claim;
  // the old blanket no-refund sentence contradicted the 7-day guarantee.
  assert.doesNotMatch(TERMOS_HTML, /3, 5 e 7|Não há reembolso proporcional após a ativação/);
  assert.doesNotMatch(TERMOS_HTML, /exclusivamente a médicos/);
  assert.doesNotMatch(PRIVACIDADE_HTML, /navegador/);
});
