import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlStructure, htmlText, keepsFormatting, normalizeEditorHtml } from "@/lib/rich-text-fidelity";

// Karina 2026-11-02 — "Correção da formatação dos comentários após edição das questões":
// a one-word edit in Questão 96 (fibromialgia) turned every <h4> into <p> and stripped the
// ul.pega / ul.certo / ul.resumo classes, because the editor rebuilt the text from a schema
// that didn't know them.

const here = path.dirname(fileURLToPath(import.meta.url));

// The comment as stored (sibling Questão of the same page) and what the OLD editor saved.
const STORED = `<h4>Comentário:</h4>
<p>A paciente apresenta dor &gt; 3 meses.</p>
<h4>PEGA REVALIDA:</h4>
<ul class="pega"><li>Depressão pode coexistir.</li></ul>
<ul class="certo"><li>Dor generalizada = fibromialgia.</li></ul>
<h4>Resumo-chave:</h4>
<ul class="resumo"><li>Fibromialgia = dor crônica.</li></ul>`;
const OLD_EDITOR = `<p>Comentário:</p><p>A paciente apresenta dor &gt; 3 meses.</p><p>PEGA REVALIDA:</p><ul><li><p>Depressão pode coexistir.</p></li></ul><ul><li><p>Dor generalizada = fibromialgia.</p></li></ul><p>Resumo-chave:</p><ul><li><p>Fibromialgia = dor crônica.</p></li></ul><p></p>`;
// What the editor now hands back for the same text (TipTap's shape, before normalising).
const NEW_EDITOR = `<h4>Comentário:</h4><p>A paciente apresenta dor &gt; 3 meses.</p><h4>PEGA REVALIDA:</h4><ul class="pega"><li><p>Depressão pode coexistir.</p></li></ul><ul class="certo"><li><p>Dor generalizada = fibromialgia.</p></li></ul><h4>Resumo-chave:</h4><ul class="resumo"><li><p>Fibromialgia = dor crônica.</p></li></ul><p></p>`;

test("the old editor's output is caught as a formatting loss", () => {
  assert.equal(keepsFormatting(STORED, OLD_EDITOR), false);
  // the words were all there — it was only the structure that went
  assert.equal(htmlText(STORED), htmlText(OLD_EDITOR));
});

test("the new editor's output keeps everything", () => {
  assert.equal(keepsFormatting(STORED, NEW_EDITOR), true);
  assert.equal(
    normalizeEditorHtml(NEW_EDITOR),
    `<h4>Comentário:</h4><p>A paciente apresenta dor &gt; 3 meses.</p><h4>PEGA REVALIDA:</h4><ul class="pega"><li>Depressão pode coexistir.</li></ul><ul class="certo"><li>Dor generalizada = fibromialgia.</li></ul><h4>Resumo-chave:</h4><ul class="resumo"><li>Fibromialgia = dor crônica.</li></ul>`,
  );
});

test("a changed word is a text change, not a structure change", () => {
  const edited = STORED.replace("Depressão", "Ansiedade");
  assert.equal(keepsFormatting(STORED, edited), false, "text differs → not the same content");
  assert.deepEqual(htmlStructure(STORED), htmlStructure(edited), "but the skeleton is identical");
});

test("spellings the browser renders identically are not differences", () => {
  assert.equal(keepsFormatting("<p><b>x</b> <i>y</i></p>", "<p><strong>x</strong> <em>y</em></p>"), true);
  assert.equal(keepsFormatting("<p>a&nbsp;b</p>\n<p>c</p>", "<p>a b</p><p>c</p>"), true);
  // the HTML parser adds <tbody> to every table that lacks one
  assert.equal(
    keepsFormatting(
      `<div class="quiz-table-wrap"><table class="quiz-table"><tr><th colspan="2">Exame</th></tr></table></div>`,
      `<div class="quiz-table-wrap"><table class="quiz-table"><tbody><tr><th colspan="2">Exame</th></tr></tbody></table></div>`,
    ),
    true,
  );
  assert.equal(keepsFormatting(`<img src="a.png?x=1&amp;y=2" alt="">`, `<img alt="" src="a.png?x=1&y=2">`), true);
});

test("the editor may add a plain <p> around bare text — nothing else", () => {
  assert.equal(keepsFormatting("Qual o agente etiológico?", "<p>Qual o agente etiológico?</p>"), true, "a plain flashcard front");
  assert.equal(keepsFormatting("<h2>Título</h2>\r\nTexto solto", "<h2>Título</h2><p> Texto solto</p>"), true);
  assert.equal(keepsFormatting("<p>x</p>", "<p><strong>x</strong></p>"), false, "added formatting is not the same text");
  // ChatGPT paste markers style nothing; data-page-id (internal links) still counts
  assert.equal(keepsFormatting(`<ul><li data-start="75" data-end="115">a</li></ul>`, "<ul><li>a</li></ul>"), true);
  assert.equal(keepsFormatting(`<p><a href="x" data-page-id="12">a</a></p>`, `<p><a href="x">a</a></p>`), false);
});

test("a lost class, attribute or tag is a difference", () => {
  assert.equal(keepsFormatting(`<p class="quiz-source">ENARE</p>`, `<p>ENARE</p>`), false);
  assert.equal(keepsFormatting(`<p>T<sup>4</sup></p>`, `<p>T4</p>`), false);
  assert.equal(keepsFormatting(`<p><span style="color:#b046e9">x</span></p>`, `<p>x</p>`), false);
  assert.equal(keepsFormatting(`<th colspan="2">a</th>`, `<th>a</th>`), false);
});

test("marks may re-nest, split or drop when empty — every character keeps the same formatting", () => {
  // TipTap ranks marks itself: the legacy lessons' <strong><span style> comes back inside-out.
  assert.equal(
    keepsFormatting(
      `<p><strong></strong> <span style="color: #000000;"><strong>Questões</strong></span> fim</p>`,
      `<p><strong><span style="color: #000000;">Questões</span></strong> fim</p>`,
    ),
    true,
  );
  assert.equal(keepsFormatting(`<p><strong>ab</strong></p>`, `<p><strong>a</strong><strong>b</strong></p>`), true);
  assert.equal(keepsFormatting(`<p>Memor<strong>ização</strong></p>`, `<p>Memor<strong>ização</strong></p>`), true);
  // …but a character that changes formatting is a difference
  assert.equal(keepsFormatting(`<p><strong>ab</strong> c</p>`, `<p><strong>a</strong>b c</p>`), false);
});

test("a bare < in the text is text, as the browser reads it", () => {
  const stored = `<ul class="pega"><li>Área valvar <1 cm² e acharam que assintomático nunca intervém?</li></ul>`;
  assert.match(htmlText(stored), /<1 cm² e acharam/);
  assert.equal(keepsFormatting(stored, `<ul class="pega"><li><p>Área valvar &lt;1 cm² e acharam que assintomático nunca intervém?</p></li></ul>`), true);
});

test("style comes back exactly as written — the purple remap matches only the hex", () => {
  // What the editor emits: the browser-respelled style for display + the raw copy.
  const emitted = `<p><span style="color: rgb(176, 70, 233);" data-rte-style="color: #b046e9;">x</span></p>`;
  assert.equal(normalizeEditorHtml(emitted), `<p><span style="color: #b046e9;">x</span></p>`);
  assert.equal(keepsFormatting(`<p><span style="color: #b046e9;">x</span></p>`, emitted), true);
  // without the raw copy the re-spelled colour IS a difference
  assert.equal(keepsFormatting(`<p><span style="color: #b046e9;">x</span></p>`, `<p><span style="color: rgb(176, 70, 233);">x</span></p>`), false);
  const link = `<a href="cardiologia" data-page-id="12" style="color: rgb(255, 255, 255);" data-rte-style="color: #ffffff;">❤️</a>`;
  assert.equal(normalizeEditorHtml(link), `<a href="cardiologia" data-page-id="12" style="color: #ffffff;">❤️</a>`);
});

test("li > p is unwrapped only when the paragraph is the whole item (or precedes a nested list)", () => {
  assert.equal(normalizeEditorHtml("<ul><li><p>a</p></li></ul>"), "<ul><li>a</li></ul>");
  assert.equal(normalizeEditorHtml("<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>"), "<ul><li>a<ul><li>b</li></ul></li></ul>");
  assert.equal(normalizeEditorHtml("<ul><li><p>a</p><p>b</p></li></ul>"), "<ul><li><p>a</p><p>b</p></li></ul>");
  assert.equal(normalizeEditorHtml("<p></p>"), "");
});

test("the editor checks every text before showing it visually, and saves the normalised shape", () => {
  const src = readFileSync(path.join(here, "..", "src", "components", "admin", "rich-text-editor.tsx"), "utf8");
  assert.match(src, /onCreate: \(\{ editor \}\) => \{\s+if \(!keepsFormatting\(content, normalizeEditorHtml\(editor\.getHTML\(\)\)\)\)/);
  assert.match(src, /const next = normalizeEditorHtml\(editor\.getHTML\(\)\);/);
  const ext = readFileSync(path.join(here, "..", "src", "components", "admin", "rich-text-extensions.ts"), "utf8");
  assert.match(ext, /heading: \{ levels: \[2, 3, 4\] \}/, "h4 = the comment's section titles");
  assert.match(ext, /types: \["paragraph", "heading", "bulletList", "orderedList"\]/);
  // every kept style goes out raw (ProseMirror's cssText would re-spell it)
  assert.match(ext, /types: \["link"\]/);
  assert.equal((ext.match(/renderHTML: \(attrs\) => rawStyle\(/g) ?? []).length, 2, "span + link styles");
  assert.match(ext, /a\.name === "style" \? rawStyle\(a\.value\)/, "protected blocks too");
});
