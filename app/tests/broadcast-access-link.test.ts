import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBroadcastTemplate,
  renderEmail,
  BROADCAST_ACCESS_HREF,
  DEFAULT_EMAIL_SETTINGS,
  type BroadcastSpec,
} from "@/lib/email-render";

// The admin broadcast can point its CTA at {{accessUrl}} — each recipient's own
// magic link into the free 100-question simulado, so an existing lead reaches
// question 1 without retyping a name, address or turma we already hold.
//
// The failure this file exists for is SILENT: normalizeCtaHref prefixes anything
// that is not http(s):// or /, so an unguarded tag became "https://{{accessUrl}}"
// and then interpolated to "https://https://medhelpspace.com.br/…". The send
// succeeds, the preview looks right, and every button in the blast is dead.

const SAMPLE_ACCESS = "https://medhelpspace.com.br/simulado-revalida/acesso?t=abc-123";

function render(spec: Partial<BroadcastSpec>, vars: Record<string, string> = {}) {
  const tpl = buildBroadcastTemplate({
    subject: "Assunto",
    bodyText: "Corpo da mensagem.",
    ...spec,
  } as BroadcastSpec);
  return renderEmail(tpl, DEFAULT_EMAIL_SETTINGS, {
    greeting: "Oi, Maria! ",
    unsubscribeUrl: "https://medhelpspace.com.br/api/leads/unsubscribe?t=x",
    ...vars,
  });
}

test("the {{accessUrl}} CTA renders the recipient's magic link verbatim", () => {
  const { html } = render(
    { ctaLabel: "Começar meu simulado", ctaHref: BROADCAST_ACCESS_HREF },
    { accessUrl: SAMPLE_ACCESS },
  );

  assert.ok(html.includes(`href="${SAMPLE_ACCESS}"`), "button should link to the magic link");
  assert.ok(!html.includes("https://https://"), "href must not be double-prefixed");
  assert.ok(!html.includes("{{accessUrl}}"), "the tag must not survive into the sent HTML");
});

test("a bare domain is still promoted to https (the guard is tag-only)", () => {
  const { html } = render({ ctaLabel: "Ver turmas", ctaHref: "medhelpspace.com.br/loja" });
  assert.ok(html.includes('href="https://medhelpspace.com.br/loja"'));
});

test("an ordinary absolute URL is untouched", () => {
  const { html } = render({ ctaLabel: "Ver turmas", ctaHref: "https://medhelpspace.com.br/loja" });
  assert.ok(html.includes('href="https://medhelpspace.com.br/loja"'));
  assert.ok(!html.includes("https://https://"));
});

test("accessUrl is declared as a broadcast variable", () => {
  const tpl = buildBroadcastTemplate({ subject: "s", bodyText: "b" });
  assert.ok(tpl.variables.some((v) => v.tag === "accessUrl"));
});

// Two recipients must never share a link: the token IS the exam session, so a
// single rendered href reused across the blast would hand every lead the same
// (first) candidate's answers and result.
test("each render carries its own token", () => {
  const a = render({ ctaLabel: "Ir", ctaHref: BROADCAST_ACCESS_HREF }, { accessUrl: SAMPLE_ACCESS });
  const other = "https://medhelpspace.com.br/simulado-revalida/acesso?t=zzz-999";
  const b = render({ ctaLabel: "Ir", ctaHref: BROADCAST_ACCESS_HREF }, { accessUrl: other });

  assert.ok(a.html.includes(SAMPLE_ACCESS));
  assert.ok(b.html.includes(other));
  assert.ok(!b.html.includes(SAMPLE_ACCESS));
});
