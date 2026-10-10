/**
 * ClinAct sales page v2 and the editable platform pages (Karina, 2026-10-08:
 * "ClinAct — atualização dos textos…" and "correções na edição…").
 *
 * The bug behind her first e-mail: a <SiteText> is only editable once its
 * site_content row exists, and the sales page had 41 keys in code and none in
 * the database. These tests keep every ClinAct key in ONE copy map — the map
 * the seed script writes from — so a key cannot live only in the page again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { CLINACT_COPY } from "@/lib/clinact/site-copy";
import { SALES_IMAGE_SLOTS } from "@/lib/clinact/sales-images";
import { annualPerMonth } from "@/lib/clinact/plans";

const APP = path.resolve(import.meta.dirname, "..");
const SRC = path.join(APP, "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");
const SECTIONS = "components/clinact/sales/sections.tsx";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}
/** Every file that renders ClinAct copy: the sales page, the member area, the ClinAct components. */
const CLINACT_FILES = [
  path.join(SRC, "app", "clinact", "page.tsx"),
  ...filesUnder(path.join(SRC, "app", "clinact", "(membro)")),
  ...filesUnder(path.join(SRC, "components", "clinact")),
];

// ── The editing bug ──────────────────────────────────────────────────────────

test("every clinact.* key used in the code is in the copy map (or is an image slot)", () => {
  const known = new Set<string>([...Object.keys(CLINACT_COPY), ...SALES_IMAGE_SLOTS.map((s) => s.key)]);
  const used = new Set<string>();
  for (const f of CLINACT_FILES) {
    // `k="clinact.…"` attributes. (Keys held in typed maps — FORMAT_COPY,
    // PLAN_COPY — are ClinactCopyKey, so TypeScript already refuses an orphan;
    // the admin's t("clinact.editor…") are translation keys, not page copy.)
    for (const m of readFileSync(f, "utf8").matchAll(/\bk=\{?["'`](clinact\.[A-Za-z0-9_.]+)["'`]/g)) used.add(m[1]);
  }
  assert.ok(used.size > 40, `found ${used.size} keys`);
  const orphans = [...used].filter((k) => !known.has(k));
  assert.deepEqual(orphans, [], "a key outside the map would render as plain, non-editable text");
});

test("no ClinAct file uses <SiteText> directly — always <ClinactText>, typed against the map", () => {
  for (const f of CLINACT_FILES) {
    if (f.endsWith("clinact-text.tsx")) continue;
    assert.doesNotMatch(readFileSync(f, "utf8"), /<SiteText\b/, path.relative(SRC, f));
  }
});

test("the seed script writes from the same map and never overwrites an edited text", () => {
  const script = readFileSync(path.join(APP, "..", "scripts", "clinact-seed-site-content.ts"), "utf8");
  assert.match(script, /Object\.entries\(CLINACT_COPY\)/);
  assert.match(script, /ON CONFLICT \(key\) DO NOTHING/);
});

test("the copy has no empty value and no leftover of the old 14-section page", () => {
  for (const [k, v] of Object.entries(CLINACT_COPY)) assert.ok(v.trim(), k);
  const all = Object.values(CLINACT_COPY).join("\n");
  for (const gone of ["Saber Medicina não é o mesmo", "Para quem é", "biblioteca viva", "mensalidades, doze meses", "Conhecer o ClinAct"]) {
    assert.ok(!all.includes(gone), `"${gone}" was removed`);
  }
});

// ── Her six sections ─────────────────────────────────────────────────────────

test("the page is her six sections, in her order", async () => {
  const src = read(SECTIONS);
  const block = src.slice(src.indexOf("export const CLINACT_SECTIONS"));
  const keys = [...block.matchAll(/key: "([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["hero", "competencias", "casos", "evolucao", "gratuitos", "planos"]);
});

test("início: her title with 'decisão.' in lilac, audience, weekly line, and the two buttons", () => {
  assert.equal(CLINACT_COPY["clinact.hero.label"], "MEDHELPSPACE · CLINACT");
  assert.equal(`${CLINACT_COPY["clinact.hero.title"]} ${CLINACT_COPY["clinact.hero.title_accent"]}`, "Raciocínio que termina em decisão.");
  assert.equal(CLINACT_COPY["clinact.hero.sub"], "Casos clínicos interativos para treinar suas decisões.");
  assert.equal(CLINACT_COPY["clinact.hero.semanal"], "Novos casos toda semana.");
  assert.equal(CLINACT_COPY["clinact.hero.cta"], "Experimente o ClinAct de graça");
  assert.equal(CLINACT_COPY["clinact.hero.cta2"], "Ver planos");
  const src = read(SECTIONS);
  // The accent is the brand-as-text token (lilac on the dark page), never a literal colour.
  assert.match(src, /<span className="text-brand-text">\s*<ClinactText k="clinact\.hero\.title_accent"/);
});

test("the hero buttons land on the free-cases box and on the plans", () => {
  const src = read(SECTIONS);
  assert.match(src, /export const ANCHOR_GRATUITOS = "casos-gratuitos";/);
  assert.match(src, /export const ANCHOR_PLANOS = "planos";/);
  const hero = src.slice(src.indexOf("function Hero("), src.indexOf("// ── 2."));
  assert.match(hero, /href=\{`#\$\{ANCHOR_GRATUITOS\}`\}/, "primary → #casos-gratuitos");
  assert.match(hero, /href=\{`#\$\{ANCHOR_PLANOS\}`\}/, "secondary → #planos");
  assert.doesNotMatch(hero, /#competencias/, "no longer to the formats");
  assert.match(src, /<section id=\{ANCHOR_GRATUITOS\}/);
  assert.match(src, /<section id=\{ANCHOR_PLANOS\}/);
});

test("the four formats carry her descriptions, and the paragraph under the title is gone", () => {
  assert.equal(CLINACT_COPY["clinact.competencias.title"], "Quatro formas de treinar suas decisões.");
  assert.equal(CLINACT_COPY["clinact.competencias.codigo_clinico"], "Conecte as pistas e construa sua hipótese.");
  assert.equal(CLINACT_COPY["clinact.competencias.clinica_em_cena"], "Conduza o caso, decisão por decisão.");
  assert.equal(CLINACT_COPY["clinact.competencias.decisao_30s"], "Identifique o que precisa ser feito primeiro.");
  assert.equal(CLINACT_COPY["clinact.competencias.ponto_de_virada"], "Diante de um novo dado, decida o que manter e o que mudar.");
  assert.ok(!("clinact.competencias.lead" in CLINACT_COPY));
});

test("the two demos alternate sides on desktop, and the caption sits under its picture", () => {
  const src = read(SECTIONS);
  const casos = src.slice(src.indexOf("function Casos("), src.indexOf("function Evolucao("));
  const evolucao = src.slice(src.indexOf("function Evolucao("), src.indexOf("// ── 5."));
  assert.doesNotMatch(casos, /phoneLeft/, "Veja na prática: text left, phone right");
  assert.match(evolucao, /phoneLeft/, "Entenda suas decisões: phone left, text right");
  assert.match(casos, /caption=\{<ClinactText k="clinact\.casos\.legenda" \/>\}/);
  const img = read("components/clinact/sales/site-image.tsx");
  assert.match(img, /<figcaption/, "the caption is part of the image's figure");
  // One device for every demo (Justin 2026-10-10): the display is inset in a
  // bezel, under a status bar with the island — never edge to edge.
  assert.match(img, /aspectRatio: "390 \/ 897"/, "one aspect ratio for every phone: status bar + the whole capture");
  assert.match(img, /var\(--dv-bezel\)/, "a bezel around the display");
  assert.match(img, /<StatusBar \/>/, "a status bar above the app");
});

test("the format cards carry the same icon the platform's library uses", () => {
  const src = read(SECTIONS);
  assert.match(src, /import \{ FORMAT_ICONS \} from "@\/components\/clinact\/library-cards";/);
  const card = src.slice(src.indexOf("function Competencias("), src.indexOf("// ── 3 & 4."));
  assert.match(card, /const Icon = FORMAT_ICONS\[format\];/);
});

test("the free cases and the plans read as she wrote them", () => {
  assert.equal(CLINACT_COPY["clinact.gratuitos.title"], "Experimente o ClinAct antes de assinar.");
  assert.equal(CLINACT_COPY["clinact.gratuitos.cta"], "Experimentar os 4 casos grátis");
  assert.equal(CLINACT_COPY["clinact.planos.title"], "Assine o ClinAct");
  assert.equal(CLINACT_COPY["clinact.planos.mensal.cta"], "Assinar plano mensal");
  assert.equal(CLINACT_COPY["clinact.planos.anual.cta"], "Assinar plano anual");
  // The equivalent is computed from the prices; only the words are editable.
  const equivalente = CLINACT_COPY["clinact.planos.anual.equivalente"].replace("{mensal}", annualPerMonth());
  assert.equal(equivalente.replace(/ /g, " "), "Equivalente a R$ 24,92 por mês."); // pt-BR currency uses a no-break space
  const gratuitos = read(SECTIONS).slice(read(SECTIONS).indexOf("function Gratuitos("), read(SECTIONS).indexOf("// ── 6."));
  assert.doesNotMatch(gratuitos, /FORMAT_LABELS/, "the list repeating the four formats is gone");
});

// ── The platform pages ───────────────────────────────────────────────────────

test("Casos shows her weekly line under the title, for everyone", () => {
  assert.equal(
    CLINACT_COPY["clinact.app.treinar.semanal"],
    "Novos casos toda semana para você continuar treinando seu raciocínio clínico.",
  );
  const page = read("app/clinact/(membro)/treinar/page.tsx");
  const title = page.indexOf('k="clinact.app.treinar.title"');
  const weekly = page.indexOf('k="clinact.app.treinar.semanal"');
  const access = page.indexOf("!viewer.hasAccess");
  assert.ok(title > 0 && weekly > title && weekly < access, "right under the title, outside the subscriber/free branch");
});

test("the specialty count stays live inside its editable sentence", () => {
  assert.match(CLINACT_COPY["clinact.app.especialidade.lead"], /\{casos\}/);
  assert.match(read("app/clinact/(membro)/treinar/[especialidade]/page.tsx"), /vars=\{\{ casos: caseCount\(mine\.length\) \}\}/);
});
