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
const META_PATCH = readFileSync(path.join(ROOT, "schema-patch-privacidade-meta.sql"), "utf8");
const META_ROLLBACK = readFileSync(path.join(ROOT, "schema-patch-privacidade-meta-rollback.sql"), "utf8");
const page = (slug: string) => readFileSync(path.join(ROOT, "app/src/app", slug, "page.tsx"), "utf8");

test("the patches write exactly lib/legal-pages.ts", () => {
  assert.ok(PATCH.includes(`$legal$${TERMOS_HTML}$legal$`));
  // /privacidade was last rewritten by the Meta patch (2026-11-09).
  assert.ok(META_PATCH.includes(`$legal$${PRIVACIDADE_HTML}$legal$`));
  // …and its rollback restores the 2026-11-02 text.
  assert.ok(META_ROLLBACK.includes("Não utilizamos cookies de rastreamento para publicidade."));
});

test("item 6 points to the footer link — Karina's sentence, verbatim (2026-11-10)", () => {
  const sentence =
    "Para mudar sua escolha, use o link 'Preferências de cookies', no rodapé do site, ou escreva para ";
  assert.ok(PRIVACIDADE_HTML.includes(sentence));
  assert.ok(!PRIVACIDADE_HTML.includes("apague os cookies do site no seu navegador"));
  const patch = readFileSync(path.join(ROOT, "schema-patch-privacidade-cookie-prefs.sql"), "utf8");
  assert.ok(patch.includes(`$new$${sentence}$new$`));
});

test("Meta Pixel / Conversions API — Karina's approved sentences, verbatim (2026-11-09)", () => {
  for (const t of [
    "Se você aceitar os cookies de publicidade no aviso do site, compartilhamos com a Meta (Facebook e Instagram) informações sobre as visitas às nossas páginas públicas de venda e de cadastro, o início da contratação e a confirmação da compra (produto, plano ou turma e valor pago), para medir e aprimorar nossos anúncios.",
    "Para fins de correspondência segura com a Meta, o e-mail, o telefone e um identificador interno da sua conta são transmitidos em formato hash.",
    "Junto com esses eventos, também são enviados os identificadores dos cookies da própria Meta, o endereço IP e as informações do navegador.",
    "Não enviamos dados de cartão, CPF, endereço residencial, informações de saúde, respostas aos casos ou o conteúdo estudado na plataforma.",
    "cookies de análise (Google Analytics), para entender como as páginas públicas são usadas e melhorá-las. Você pode recusá-los no aviso de cookies;",
    "cookies de publicidade (Meta Pixel), somente nas páginas públicas de venda, de contratação e de cadastro, para medir o resultado dos nossos anúncios. Eles só são ativados se você clicar em “Aceitar” no aviso de cookies.",
    // Her approval of the two consistency fixes (2026-11-09 16:49 BRT):
    "Não vendemos seus dados pessoais. Só os compartilhamos com terceiros quando exigido por lei, para operar serviços essenciais da plataforma (o PagBank, para o processamento do pagamento, e o Emissor Nacional da NFS-e, para a emissão da nota fiscal) ou, com o seu consentimento, para publicidade, como descrito abaixo.",
    "Os cookies de publicidade não são usados na área do aluno nem nos casos clínicos. Os cookies de análise registram apenas a visita às páginas, nunca as respostas aos casos nem o conteúdo estudado na área do aluno.",
  ]) assert.ok(PRIVACIDADE_HTML.includes(t), t);
  assert.doesNotMatch(PRIVACIDADE_HTML, /Não utilizamos cookies de rastreamento para publicidade/);
  assert.doesNotMatch(PRIVACIDADE_HTML, /sem possibilidade de leitura direta/);
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
  // No claim that card data is encrypted in the browser. ("informações do
  // navegador" in the Meta paragraph is a different thing and is expected.)
  assert.doesNotMatch(PRIVACIDADE_HTML, /criptografad\w* no (seu )?navegador/);
});
