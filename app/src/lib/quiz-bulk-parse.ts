/**
 * Bulk-paste parser for Revalida-format MCQs in the admin quiz editor.
 *
 * Browser-safe port of the migration importer (scripts/parse-questoes.js) so
 * questions pasted into the admin builder are auto-formatted into the EXACT
 * same shape the original import produced:
 *   - `question`: stem with a provenance <h3> + <p> paragraphs
 *   - `answers`:  [{ text: "<div><strong>(A) …</strong></div>", correct, feedback }]
 *   - `explanation_html`: built from the Comentário / PEGA REVALIDA / Resumo-chave
 *     blocks via the same bullet conventions (●, 🟣, ❌, "Heading:")
 *
 * Output renders identically to imported questions in QuizPlayer. The per-option
 * "feedback" is the distractor analysis (empty for the correct option); the
 * player reconstructs the "Análise das alternativas incorretas:" block from it.
 *
 * Pure text → object. No DB, no Node APIs — safe to import in a client component.
 */

export type ParsedAnswer = { text: string; correct: boolean; feedback: string };

export type ParsedQuizQuestion = {
  question: string;
  answers: ParsedAnswer[];
  media_url: string;
  explanation_html: string;
  // Review hints surfaced in the preview (not persisted):
  number: string | null;
  year: string | null;
  anulada: boolean;
  needsImage: boolean;
  /** Set when the correct answer could not be auto-detected — needs a manual tick. */
  warning: boolean;
};

export type ParseError = { number: string | null; reason: string };

export type ParseResult = {
  questions: ParsedQuizQuestion[];
  errors: ParseError[];
};

// ── cleaning ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanDocText(raw: string): string {
  // Normalize to NFC first. The migration importer never needed this (docx text
  // was already precomposed), but clipboard paste — especially from macOS — often
  // delivers NFD-decomposed accents ("a" + U+0301), which silently break the
  // accented-keyword regexes below (Análise, Comentário, Questão).
  let s = (raw || "").normalize("NFC");
  s = s.replace(/ðª/g, "🟪").replace(/ð£/g, "🟣"); // fix mojibake'd markers
  s = s.replace(/\\([<>=_*#.\-+|`~()[\]])/g, "$1"); // unescape backslash-escaped punct
  const lines = s
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*#+\s*/, "") // drop leading markdown heading hashes
        .replace(/\*\*/g, "") // drop bold markers
        .trim(),
    );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// "Comentário" block text → HTML. Bullet conventions:
//   ● → plain <ul>, 🟣 → <ul class="resumo">, ❌ → <ul class="pega">
//   a line ending in ":" → <h4> heading, everything else → <p>
function explanationTextToHtml(text: string): string {
  const lines = text.split("\n").map((l) => l.trim());
  const out: string[] = [];
  let buf: string[] = [];
  let bulletKind: string | null = null;
  const flush = () => {
    if (!buf.length) return;
    const cls =
      bulletKind === "🟣" ? ' class="resumo"' : bulletKind === "❌" ? ' class="pega"' : "";
    out.push(`<ul${cls}>${buf.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`);
    buf = [];
    bulletKind = null;
  };
  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }
    const m = line.match(/^([●🟣❌])\s*(.*)$/u);
    if (m) {
      const k = m[1];
      if (bulletKind && bulletKind !== k) flush();
      bulletKind = k;
      if (m[2].trim()) buf.push(m[2].trim());
      continue;
    }
    flush();
    if (/:$/.test(line)) out.push(`<h4>${escapeHtml(line.replace(/^[🟪🟣]\s*/u, ""))}</h4>`);
    else out.push(`<p>${escapeHtml(line)}</p>`);
  }
  flush();
  return out.join("\n");
}

// ── splitting into question chunks ────────────────────────────────────────────

const Q_HEADER = /^quest[aã]o\s+\d+/;

function splitOn(lines: string[], heads: number[]): string[] {
  const chunks: string[] = [];
  for (let h = 0; h < heads.length; h++) {
    chunks.push(
      lines
        .slice(heads[h], h + 1 < heads.length ? heads[h + 1] : lines.length)
        .join("\n")
        .trim(),
    );
  }
  return chunks;
}

function splitQuestions(cleanText: string): string[] {
  const lines = cleanText.split("\n");
  // Primary: year-gated headers — "Questão N (Revalida YYYY)" / "(YYYY.S)". This
  // matches the import exactly and ignores a bare "Questão N" figure/table caption
  // embedded inside a stem (those have no exam year).
  const yearHeads: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (Q_HEADER.test(lines[i].toLowerCase()) && /20\d\d/.test(lines[i])) yearHeads.push(i);
  }
  if (yearHeads.length) return splitOn(lines, yearHeads);
  // Fallback A: bare "Questão N" headers (manual paste without exam years).
  const bareHeads: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (Q_HEADER.test(lines[i].toLowerCase())) bareHeads.push(i);
  }
  if (bareHeads.length) return splitOn(lines, bareHeads);
  // Fallback B: a single headerless question.
  const t = cleanText.trim();
  if (t && /Alternativa\s+correta:/i.test(t)) return [t];
  return [];
}

// ── parse one chunk ────────────────────────────────────────────────────────────

type Parsed = {
  number: string | null;
  year: string | null;
  anulada: boolean;
  stem: string;
  options: string[];
  letters: string[];
  correct: string | null;
  distractor: Record<string, string>;
  explanation: string;
  needsImage: boolean;
};

function parseChunk(chunk: string): Parsed | { error: string; number: string | null } {
  const lines = chunk.split("\n");
  const hasHeader = Q_HEADER.test((lines[0] || "").toLowerCase());
  const header = hasHeader ? lines[0] : "";
  const number = hasHeader ? ((header.match(/\d+/) || [null])[0] as string | null) : null;
  const yearM = header.match(/\b(20\d\d(?:\.[12])?)/);
  const year = yearM ? yearM[1] : null;
  const rest = hasHeader ? lines.slice(1).join("\n") : chunk;

  const markerM = rest.match(/✔?\s*Alternativa\s+correta:/i);
  if (!markerM) return { error: 'sem marcador "Alternativa correta:"', number };
  const markerIdx = rest.indexOf(markerM[0]);
  const questionPart = rest.slice(0, markerIdx).trim();
  const answerPart = rest.slice(markerIdx).trim();
  const anulada = /anulad/i.test(header) || /anulad/i.test(answerPart);

  // Lettered options (A)–(E) at line start; fallback to inline "(A) … (B) …".
  const optRe = /^\(([A-E])\)\s*/gm;
  let optMatches = [...questionPart.matchAll(optRe)].map((m) => ({
    letter: m[1],
    idx: m.index ?? 0,
    after: (m.index ?? 0) + m[0].length,
  }));
  if (optMatches.length < 4) {
    const inline = /\(([A-E])\)\s+/g;
    const im = [...questionPart.matchAll(inline)].map((m) => ({
      letter: m[1],
      idx: m.index ?? 0,
      after: (m.index ?? 0) + m[0].length,
    }));
    if (im.length >= 4 && im.length <= 5) optMatches = im;
  }
  if (optMatches.length < 4)
    return { error: `apenas ${optMatches.length} alternativa(s) encontrada(s)`, number };
  if (optMatches.length > 5) return { error: `${optMatches.length} alternativas (>5)`, number };

  const stem = questionPart.slice(0, optMatches[0].idx).trim();
  const options: string[] = [];
  for (let i = 0; i < optMatches.length; i++) {
    const b = i + 1 < optMatches.length ? optMatches[i + 1].idx : questionPart.length;
    options.push(
      questionPart
        .slice(optMatches[i].after, b)
        .trim()
        .replace(/\s*\n\s*/g, " "),
    );
  }
  const letters = ["A", "B", "C", "D", "E"].slice(0, options.length);

  // Correct letter — primary marker then anulada/odd-phrasing fallbacks.
  let correct: string | null = null;
  const direct = answerPart.match(/Alternativa\s+correta:\s*\(([A-E])\)/i);
  if (direct) correct = direct[1];
  if (!correct) {
    const adq =
      answerPart.match(/mais\s+adequada[^()]*\(([A-E])\)/i) ||
      answerPart.match(/seria\s+a?\s*\(([A-E])\)/i) ||
      answerPart.match(/correta:[\s\S]{0,120}?\(([A-E])\)/i);
    if (adq) correct = adq[1];
  }

  // Per-distractor feedback from the "Análise das alternativas[ incorretas]:" block.
  // NOTE: the emoji marker classes carry the `u` flag — without it `🟪?` makes only
  // the low surrogate optional and the high surrogate REQUIRED, so the block is only
  // detected when literally prefixed with the emoji. With `u` the marker is truly
  // optional, so plain (emoji-less) pasted text is detected too. `[🟪🟣]` covers both
  // the purple-square and purple-circle markers used as block headers. The trailing
  // `(?:\n|$)` lets the Análise block terminate at end-of-input when it's the last
  // block (a headerless paste with no following Comentário/Resumo/question).
  const distractor: Record<string, string> = { A: "", B: "", C: "", D: "", E: "" };
  // The leading `[🟪🟣]?\s*` lets the removal swallow the block's own marker so no
  // stray "🟪" line is left in the explanation.
  const analiseRe =
    /[🟪🟣]?\s*An[aá]lise\s+das\s+alternativas(?:\s+incorretas)?:\s*([\s\S]*?)(?=\n\s*(?:[🟪🟣]?\s*PEGA REVALIDA|[🟪🟣]?\s*Resumo-chave|[🟪🟣]?\s*Coment[aá]rio|quest[aã]o\s+\d)|\s*$)/iu;
  const am = answerPart.match(analiseRe);
  if (am) {
    for (const lm of am[1].matchAll(/\(([A-E])\)\s*([\s\S]*?)(?=\n\s*\([A-E]\)|$)/g))
      distractor[lm[1]] = lm[2].trim().replace(/\s*\n\s*/g, " ");
  }

  // Explanation = from "Comentário:" onward, minus the distractor-analysis block.
  let explanation = answerPart;
  const ci = answerPart.search(/[🟪🟣]?\s*Coment[aá]rio:/iu);
  if (ci > -1) explanation = answerPart.slice(ci);
  if (am) explanation = explanation.replace(analiseRe, "").replace(/\n{3,}/g, "\n\n").trim();
  // Drop a leading bare "Alternativa correta: (X)" line — the gabarito is already
  // captured on the answer and the player highlights it; it's not explanation text.
  // (No-op when a real Comentário block is present, since `explanation` starts there.)
  explanation = explanation.replace(/^\s*✔?\s*Alternativa\s+correta:\s*\([A-E]\)\s*/i, "").trim();

  const needsImage =
    /(a seguir|imagem abaixo|exibid|mostrad[ao]\b|na imagem|figura abaixo|conforme (a )?imagem|eletrocardiograma|\bECG\b|radiografia[\s\S]{0,40}(seguir|abaixo)|tomografia[\s\S]{0,40}(seguir|abaixo)|exames? labora[\s\S]{0,40}(seguir|abaixo|tabela))/i.test(
      stem,
    );

  return { number, year, anulada, stem, options, letters, correct, distractor, explanation, needsImage };
}

// ── public entrypoint ──────────────────────────────────────────────────────────

/**
 * Parse raw pasted text into formatted quiz questions + a list of chunks that
 * couldn't be structured. Recognized questions whose correct letter wasn't
 * auto-detected are still returned, flagged with `warning: true`.
 */
export function parseQuizText(raw: string): ParseResult {
  const clean = cleanDocText(raw || "");
  const chunks = splitQuestions(clean);
  const questions: ParsedQuizQuestion[] = [];
  const errors: ParseError[] = [];

  for (const chunk of chunks) {
    const p = parseChunk(chunk);
    if ("error" in p) {
      errors.push({ number: p.number ?? null, reason: p.error });
      continue;
    }
    const prov = [
      p.number ? `Questão ${p.number}` : null,
      p.year ? `Revalida ${p.year}` : null,
      p.anulada ? "Anulada" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const provHtml = prov ? `<h3><strong>${escapeHtml(prov)}</strong></h3>\n` : "";
    const stemHtml = p.stem
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join("\n");
    questions.push({
      question: provHtml + stemHtml,
      answers: p.letters.map((L, i) => ({
        text: `<div><strong>(${L}) ${escapeHtml(p.options[i])}</strong></div>`,
        correct: L === p.correct,
        feedback: L === p.correct ? "" : p.distractor[L] || "",
      })),
      media_url: "",
      explanation_html: explanationTextToHtml(p.explanation) || "",
      number: p.number,
      year: p.year,
      anulada: p.anulada,
      needsImage: p.needsImage,
      warning: !p.correct,
    });
  }

  return { questions, errors };
}
