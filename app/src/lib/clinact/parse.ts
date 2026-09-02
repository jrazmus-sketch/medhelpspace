/**
 * ClinAct authoring-format parser — version 1.
 *
 * The accepted format is the contract in docs/clinact/formato-de-conteudo.md.
 * The guide and this parser are versioned together: if the format changes,
 * both change in the same commit and FORMAT_VERSION moves.
 *
 * Pure text → CaseDoc[] with per-case errors and warnings, each naming the
 * line in the ORIGINAL file (1-based) in Portuguese — the audience is a content
 * producer. No DB, no Node APIs: safe in client components, so the dry-run
 * report can render before anything is sent to the server.
 *
 * What it forgives (guide §10): curly quotes, NBSP, trailing whitespace, extra
 * blank lines, `•`/`–` bullets, NFD accents. What it does not forgive (§2): a
 * ficha label that is not exactly `TÍTULO:` etc. — mis-cased or unaccented
 * labels are an error that names the line, because "silently accepted" is how
 * a typo becomes a missing field nobody notices.
 */

import { FORMAT_PRESETS } from "./format-presets";
import { mediaRejectionReason, mediaTypeFor, mediaUrlFor } from "./media";
import { normalizeSceneKey, slugifyTitle } from "./slug";
import {
  DIFFICULTIES,
  FORMATS,
  FORMAT_SKILL,
  QUALITIES,
  type CaseDoc,
  type CaseFormat,
  type ClueDoc,
  type Difficulty,
  type Media,
  type OptionDoc,
  type Quality,
  type Reveal,
  type RevealCategory,
  type StepDoc,
  type StepKind,
} from "./types";

export const FORMAT_VERSION = 1;

export type Issue = { line: number | null; message: string };

export type ParsedCase = {
  title: string;
  slug: string;
  format: CaseFormat | null;
  specialtyText: string | null;
  topicText: string | null;
  startLine: number;
  blockCount: number;
  notes: string[];
  errors: Issue[];
  warnings: Issue[];
  /** Present only when there are no errors. */
  doc: CaseDoc | null;
};

export type ParseFileResult = {
  version: number;
  cases: ParsedCase[];
};

// ── normalisation (§10) ───────────────────────────────────────────────────────

export function normalizeText(raw: string): string {
  let s = (raw || "").replace(/^﻿/, "").normalize("NFC");
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[   ]/g, " "); // non-breaking spaces
  s = s.replace(/[​-‍⁠]/g, ""); // zero-width residue
  s = s.replace(/[“”„″]/g, '"').replace(/[‘’‚′]/g, "'");
  s = s.replace(/\*\*/g, ""); // markdown bold residue
  const lines = s.split("\n").map((line) => {
    let l = line.replace(/\s+$/, "");
    // Bullet variants at line start → "- " (guide §1). Only at the start, so an
    // em dash inside a title ("TEP — paciente instável") is left alone.
    l = l.replace(/^(\s*)[•–—]\s+/, "$1- ");
    l = l.replace(/^(\s*)[•–—]$/, "$1-");
    return l;
  });
  return lines.join("\n");
}

const DELIMITER = /^\s*=+\s*CASO\s*=+\s*$/i;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ── ficha labels (§2) — exact ─────────────────────────────────────────────────

const LABELS = ["FORMATO", "TÍTULO", "ESPECIALIDADE", "TEMA", "DIFICULDADE", "DURAÇÃO", "RESUMO", "CHAVE FINAL"] as const;
type Label = (typeof LABELS)[number];
const LABEL_BY_LOOSE = new Map(LABELS.map((l) => [stripAccents(l).toUpperCase(), l]));

// ── block names (§3) — accent-insensitive ─────────────────────────────────────

const BLOCKS: Record<string, StepKind> = {
  NARRATIVA: "narrativa",
  PISTAS: "pistas",
  PERGUNTA: "pergunta",
  ORDENAR: "ordenar",
  CENA: "cena_conduta",
  "NOVO DADO": "novo_dado",
  REAVALIACAO: "reavaliacao",
  CONFIANCA: "confianca",
  FEEDBACK: "feedback",
  "CUSTO DO ATRASO": "custo_do_atraso",
  MIDIA: "midia",
  CRONOMETRO: "cronometro",
  "LEVE DESTE CASO": "leve_deste_caso",
};

// ── attribute keys (§4–§9) ────────────────────────────────────────────────────

type AttrKey =
  | "feedback"
  | "seducao"
  | "qualidade"
  | "sabemos"
  | "encontramos"
  | "fizemos"
  | "estado"
  | "relogio"
  | "vai para"
  | "detalhe"
  | "categoria"
  | "grupo"
  | "distrator"
  | "legenda"
  | "alt"
  | "transcricao"
  | "janela"
  | "segundos";

const ATTR_KEYS: AttrKey[] = [
  "feedback", "seducao", "qualidade", "sabemos", "encontramos", "fizemos", "estado", "relogio",
  "vai para", "detalhe", "categoria", "grupo", "distrator", "legenda", "alt", "transcricao",
  "janela", "segundos",
];
const ATTR_BY_LOOSE = new Map(ATTR_KEYS.map((k) => [k, k]));

const RE_OPTION = /^\s*([*-])(?:\s+(.*))?$/;
const RE_ORDER_ITEM = /^\s*(\d+)[.)]\s+(.*)$/;
const RE_MEDIA = /^\s*\[\s*(imagem|image|audio|áudio|video|vídeo)\s*:\s*([^\]]+?)\s*\]\s*$/i;
const RE_ATTR = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,20}?)\s*:\s?(.*)$/;
const RE_BLOCK = /^##\s*(.+?)\s*$/;
const RE_NOTE = /^\s*NOTA\s*:\s*(.*)$/i;
const RE_LABEL = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,20}?)\s*:\s?(.*)$/;

/**
 * The blank templates ship placeholders on the marker line (`- [pista]`,
 * `* [alternativa correta]`) so the syntax is obvious at a glance. If one is
 * left unedited it must fail LOUDLY — a case published with "[pista]" as a
 * clinical clue is worse than a rejected import.
 */
const RE_PLACEHOLDER = /^\[[^\]]*\]$/;

function attrKeyOf(raw: string): AttrKey | null {
  const loose = stripAccents(raw).toLowerCase().replace(/\s+/g, " ").trim();
  return ATTR_BY_LOOSE.get(loose as AttrKey) ?? null;
}

function blockKindOf(raw: string): { kind: StepKind; sceneKey: string | null } | null {
  const [namePart, ...rest] = raw.split(":");
  const loose = stripAccents(namePart).toUpperCase().replace(/\s+/g, " ").trim();
  const kind = BLOCKS[loose];
  if (!kind) return null;
  if (kind === "cena_conduta") {
    const key = normalizeSceneKey(rest.join(":").trim());
    return { kind, sceneKey: key || null };
  }
  return { kind, sceneKey: null };
}

// ── file split ────────────────────────────────────────────────────────────────

type Chunk = { startLine: number; lines: string[] };

function splitCases(text: string): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (DELIMITER.test(lines[i])) {
      if (cur && cur.lines.some((l) => l.trim())) chunks.push(cur);
      cur = { startLine: i + 2, lines: [] };
      continue;
    }
    if (!cur) cur = { startLine: 1, lines: [] };
    cur.lines.push(lines[i]);
  }
  if (cur && cur.lines.some((l) => l.trim())) chunks.push(cur);
  return chunks;
}

// ── per-case parse ────────────────────────────────────────────────────────────

type Block = {
  kind: StepKind;
  sceneKey: string | null;
  line: number;
  text: string[]; // prose lines before options / items
  options: OptionDraft[];
  items: { text: string; line: number }[];
  clues: ClueDraft[];
  media: Media[];
  attrs: Partial<Record<AttrKey, string>>;
};

type OptionDraft = {
  line: number;
  marker: "*" | "-";
  label: string;
  feedback?: string;
  seduction?: string;
  quality?: string;
  reveals: Reveal[];
  estado?: string;
  relogio?: number;
  nextScene?: string;
};

type ClueDraft = {
  line: number;
  label: string;
  detail?: string;
  category?: string;
  cluster?: string;
  distractor?: string;
  media?: Media;
};

/** Which "thing" an upward-attaching line binds to. */
type Target =
  | { kind: "block"; block: Block }
  | { kind: "option"; block: Block; option: OptionDraft }
  | { kind: "clue"; block: Block; clue: ClueDraft }
  | { kind: "media"; media: Media; parent: Target };

function parseChunk(chunk: Chunk): ParsedCase {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const notes: string[] = [];
  const ficha: Partial<Record<Label, { value: string; line: number }>> = {};
  const blocks: Block[] = [];

  let inFicha = true;
  let target: Target | null = null;
  /** Attribute currently accepting continuation lines (multi-line feedback). */
  let openAttr: { set: (v: string) => void; get: () => string } | null = null;
  let lastNoteIdx = -1;

  const L = (i: number) => chunk.startLine + i;

  for (let i = 0; i < chunk.lines.length; i++) {
    const line = chunk.lines[i];
    const ln = L(i);
    const trimmed = line.trim();

    // NOTA: paragraphs anywhere (§11)
    const note = trimmed.match(RE_NOTE);
    if (note) {
      notes.push(note[1]);
      lastNoteIdx = notes.length - 1;
      openAttr = {
        set: (v) => (notes[lastNoteIdx] = v),
        get: () => notes[lastNoteIdx],
      };
      continue;
    }

    const blockMatch = trimmed.match(RE_BLOCK);
    if (blockMatch) {
      inFicha = false;
      openAttr = null;
      const bk = blockKindOf(blockMatch[1]);
      if (!bk) {
        errors.push({ line: ln, message: `Bloco desconhecido: "## ${blockMatch[1]}". Blocos válidos: NARRATIVA, PISTAS, PERGUNTA, ORDENAR, CENA, NOVO DADO, REAVALIAÇÃO, CONFIANÇA, FEEDBACK, CUSTO DO ATRASO, MÍDIA, CRONÔMETRO, LEVE DESTE CASO.` });
        target = null;
        continue;
      }
      if (bk.kind === "cena_conduta" && !bk.sceneKey) {
        errors.push({ line: ln, message: `A cena precisa de um apelido: "## CENA: chegada".` });
      }
      const block: Block = { kind: bk.kind, sceneKey: bk.sceneKey, line: ln, text: [], options: [], items: [], clues: [], media: [], attrs: {} };
      blocks.push(block);
      target = { kind: "block", block };
      continue;
    }

    if (inFicha) {
      if (!trimmed) continue;
      const m = trimmed.match(RE_LABEL);
      if (m) {
        const rawLabel = m[1].trim();
        const exact = (LABELS as readonly string[]).includes(rawLabel) ? (rawLabel as Label) : null;
        if (exact) {
          if (ficha[exact]) warnings.push({ line: ln, message: `"${exact}:" repetido — a última ocorrência vale.` });
          ficha[exact] = { value: m[2].trim(), line: ln };
          continue;
        }
        const loose = LABEL_BY_LOOSE.get(stripAccents(rawLabel).toUpperCase());
        if (loose) {
          errors.push({ line: ln, message: `Rótulo "${rawLabel}:" — escreva exatamente "${loose}:" (maiúsculas e acento).` });
          ficha[loose] = ficha[loose] ?? { value: m[2].trim(), line: ln };
          continue;
        }
      }
      errors.push({ line: ln, message: `Linha inesperada antes do primeiro bloco: "${trimmed.slice(0, 60)}". A ficha aceita só FORMATO, TÍTULO, ESPECIALIDADE, TEMA, DIFICULDADE, DURAÇÃO, RESUMO e CHAVE FINAL.` });
      continue;
    }

    if (!target) continue; // after an unknown block: skip its body
    const block: Block = target.kind === "media" ? blockOf(target) : target.block;

    if (!trimmed) {
      openAttr = null; // a blank line closes a multi-line attribute
      continue;
    }

    // Media tag — attaches upward (§8)
    const mm = trimmed.match(RE_MEDIA);
    if (mm) {
      openAttr = null;
      const file = mm[2].trim();
      const rejected = mediaRejectionReason(file);
      if (rejected) warnings.push({ line: ln, message: `"${file}": ${rejected}.` });
      const media: Media = { type: mediaTypeFor(file, mm[1].toLowerCase()), url: mediaUrlFor(file), file };
      const parent: Target = target.kind === "media" ? target.parent : target;
      if (parent.kind === "option") {
        const last = parent.option.reveals[parent.option.reveals.length - 1];
        if (last && !last.midia) last.midia = media;
        else parent.option.reveals.push({ cat: "encontramos", texto: "", midia: media });
      } else if (parent.kind === "clue") {
        if (parent.clue.media) warnings.push({ line: ln, message: `A pista já tinha uma mídia; a segunda foi ignorada.` });
        else parent.clue.media = media;
      } else {
        block.media.push(media);
      }
      target = { kind: "media", media, parent };
      continue;
    }

    // Ordered item (ORDENAR)
    if (block.kind === "ordenar") {
      const om = trimmed.match(RE_ORDER_ITEM);
      if (om) {
        openAttr = null;
        block.items.push({ text: om[2].trim(), line: ln });
        continue;
      }
    }

    // Option / clue line
    const opt = line.match(RE_OPTION);
    if (opt && block.kind !== "ordenar") {
      openAttr = null;
      const marker = opt[1] as "*" | "-";
      const label = (opt[2] ?? "").trim();
      if (block.kind === "pistas") {
        if (marker === "*") warnings.push({ line: ln, message: `Em PISTAS o marcador é "-"; "*" foi lido como pista comum.` });
        const clue: ClueDraft = { line: ln, label };
        block.clues.push(clue);
        target = { kind: "clue", block, clue };
      } else {
        const option: OptionDraft = { line: ln, marker, label, reveals: [] };
        block.options.push(option);
        target = { kind: "option", block, option };
      }
      continue;
    }

    // Attribute line — only when it applies to what is directly above it.
    // "Estado: PA 88/54" inside a narrative paragraph is prose, not a drawer.
    const am = trimmed.match(RE_ATTR);
    const key = am ? attrKeyOf(am[1]) : null;
    if (am && key && attrApplies(key, target)) {
      const value = am[2].trim();
      const bound = bindAttr(key, value, target, block, ln, errors, warnings);
      openAttr = bound;
      continue;
    }

    // Continuation / prose
    if (openAttr) {
      openAttr.set(`${openAttr.get()} ${trimmed}`.trim());
      continue;
    }
    if (target.kind === "option") {
      target.option.label = `${target.option.label} ${trimmed}`.trim();
      continue;
    }
    if (target.kind === "clue") {
      target.clue.label = `${target.clue.label} ${trimmed}`.trim();
      continue;
    }
    if (block.options.length || block.clues.length) {
      // Prose after the alternatives is almost always a wrapped line that lost
      // its bullet — surface it rather than silently gluing it somewhere.
      warnings.push({ line: ln, message: `Texto solto depois das alternativas: "${trimmed.slice(0, 50)}". Foi anexado ao enunciado.` });
    }
    // Preserve paragraph breaks: an empty entry marks a break.
    if (block.text.length && chunk.lines[i - 1]?.trim() === "") block.text.push("");
    block.text.push(trimmed);
  }

  // ── assemble ────────────────────────────────────────────────────────────────

  const title = ficha["TÍTULO"]?.value ?? "";
  if (!title) errors.push({ line: chunk.startLine, message: `Falta "TÍTULO:" na ficha.` });

  const formatRaw = ficha.FORMATO?.value.trim().toLowerCase() ?? "";
  const format = (FORMATS as readonly string[]).includes(formatRaw) ? (formatRaw as CaseFormat) : null;
  if (!ficha.FORMATO) errors.push({ line: chunk.startLine, message: `Falta "FORMATO:" na ficha.` });
  else if (!format) errors.push({ line: ficha.FORMATO.line, message: `FORMATO "${ficha.FORMATO.value}" inválido. Use codigo_clinico, clinica_em_cena, decisao_30s ou ponto_de_virada.` });

  let difficulty: Difficulty = "intermediaria";
  if (ficha.DIFICULDADE) {
    const d = stripAccents(ficha.DIFICULDADE.value.trim().toLowerCase());
    if ((DIFFICULTIES as readonly string[]).includes(d)) difficulty = d as Difficulty;
    else errors.push({ line: ficha.DIFICULDADE.line, message: `DIFICULDADE "${ficha.DIFICULDADE.value}" inválida. Use básica, intermediária ou avançada.` });
  } else warnings.push({ line: chunk.startLine, message: `Sem "DIFICULDADE:" — ficou intermediária.` });

  let estMinutes: number | null = null;
  if (ficha["DURAÇÃO"]) {
    const n = Number(ficha["DURAÇÃO"].value.replace(/[^\d.,]/g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) estMinutes = Math.round(n);
    else errors.push({ line: ficha["DURAÇÃO"].line, message: `DURAÇÃO "${ficha["DURAÇÃO"].value}" — escreva só o número de minutos.` });
  } else warnings.push({ line: chunk.startLine, message: `Sem "DURAÇÃO:".` });

  if (!ficha.RESUMO?.value) warnings.push({ line: chunk.startLine, message: `Sem "RESUMO:" — o caso aparece sem chamada na lista.` });
  if (!ficha.ESPECIALIDADE?.value) warnings.push({ line: chunk.startLine, message: `Sem "ESPECIALIDADE:".` });
  if (!ficha.TEMA?.value) warnings.push({ line: chunk.startLine, message: `Sem "TEMA:".` });

  if (format === "codigo_clinico" && !ficha["CHAVE FINAL"]?.value) {
    warnings.push({ line: chunk.startLine, message: `Código Clínico sem "CHAVE FINAL:" — o centro do mapa fica vazio.` });
  }
  if (format && format !== "codigo_clinico" && ficha["CHAVE FINAL"]?.value) {
    warnings.push({ line: ficha["CHAVE FINAL"].line, message: `"CHAVE FINAL:" só é usada no Código Clínico; foi guardada mas não aparece.` });
  }

  if (!blocks.length) errors.push({ line: chunk.startLine, message: `Nenhum bloco encontrado — o caso precisa de pelo menos "## NARRATIVA" e "## PERGUNTA".` });

  const preset = format ? FORMAT_PRESETS[format] : null;
  const allowed = preset ? new Set([...preset.default, ...preset.optional]) : null;
  const sceneKeys = new Set(blocks.filter((b) => b.kind === "cena_conduta" && b.sceneKey).map((b) => b.sceneKey as string));
  const seenScenes = new Set<string>();

  const steps: StepDoc[] = [];
  const clues: ClueDoc[] = [];
  let takeaway: string | null = null;
  let position = 0;
  let lastDecisionIdx = -1;

  for (const b of blocks) {
    if (allowed && !allowed.has(b.kind)) {
      warnings.push({ line: b.line, message: `O bloco "${blockName(b.kind)}" não faz parte do modelo ${format}; entrou mesmo assim.` });
    }
    const prose = joinProse(b.text);
    const content: Record<string, unknown> = {};
    const options: OptionDoc[] = [];
    const isDecision = b.kind === "pergunta" || b.kind === "reavaliacao" || b.kind === "cena_conduta";

    switch (b.kind) {
      case "narrativa":
      case "novo_dado":
      case "feedback":
      case "leve_deste_caso":
        content.text = prose;
        if (b.kind === "leve_deste_caso") takeaway = prose || null;
        if (!prose && b.kind !== "feedback") warnings.push({ line: b.line, message: `Bloco "${blockName(b.kind)}" vazio.` });
        break;
      case "pergunta":
      case "reavaliacao":
        content.prompt = prose;
        if (!prose) errors.push({ line: b.line, message: `"${blockName(b.kind)}" sem enunciado.` });
        break;
      case "cena_conduta":
        content.text = prose;
        if (b.sceneKey) {
          if (seenScenes.has(b.sceneKey)) errors.push({ line: b.line, message: `Cena "${b.sceneKey}" repetida.` });
          seenScenes.add(b.sceneKey);
        }
        break;
      case "ordenar":
        content.prompt = prose;
        content.items = b.items.map((it) => it.text);
        if (b.items.length < 2) errors.push({ line: b.line, message: `"ORDENAR" precisa de pelo menos 2 itens numerados (1. …, 2. …).` });
        break;
      case "custo_do_atraso":
        content.text = prose;
        if (b.attrs.janela) content.window = b.attrs.janela;
        break;
      case "cronometro": {
        const secs = Number((b.attrs.segundos ?? "").replace(/[^\d]/g, ""));
        if (!secs) errors.push({ line: b.line, message: `"CRONÔMETRO" precisa de "segundos: 30".` });
        content.seconds = secs || 30;
        break;
      }
      case "midia":
        if (!b.media.length) errors.push({ line: b.line, message: `"MÍDIA" sem nenhuma linha [imagem: …] ou [audio: …].` });
        break;
      case "confianca":
        if (lastDecisionIdx < 0) warnings.push({ line: b.line, message: `"CONFIANÇA" antes de qualquer pergunta — não há decisão para medir.` });
        break;
      case "pistas":
        if (!b.clues.length) errors.push({ line: b.line, message: `"PISTAS" sem nenhuma pista ("- …").` });
        break;
    }

    if (b.media.length && b.kind !== "midia") content.media = b.media;
    if (b.kind === "midia") content.media = b.media;

    if (b.kind === "pistas") {
      b.clues.forEach((c) => {
        if (!c.label) errors.push({ line: c.line, message: `Pista sem texto. O texto da pista vai na mesma linha do "-"; "detalhe:" é só complemento.` });
        else if (RE_PLACEHOLDER.test(c.label)) {
          errors.push({ line: c.line, message: `Pista ainda está com o texto de exemplo do modelo ("${c.label}") — substitua pelo texto do caso.` });
        }
        clues.push({
          position: clues.length,
          label: c.label,
          detail: c.detail ?? null,
          media: c.media ?? null,
          category: c.category ?? null,
          is_red_herring: c.distractor !== undefined,
          red_herring_reason: c.distractor ?? null,
          cluster: c.cluster ?? null,
        });
      });
    }

    if (isDecision) {
      lastDecisionIdx = steps.length;
      const n = b.options.length;
      if (n < 2) errors.push({ line: b.line, message: `"${blockName(b.kind)}" precisa de 2 a 5 alternativas (encontrei ${n}).` });
      if (n > 5) errors.push({ line: b.line, message: `"${blockName(b.kind)}" tem ${n} alternativas — o máximo é 5.` });
      if (b.kind === "cena_conduta" && n > 4) warnings.push({ line: b.line, message: `Cena com ${n} condutas — o modelo sugere de 2 a 4.` });

      const stars = b.options.filter((o) => o.marker === "*").length;
      const anyQuality = b.options.some((o) => o.quality !== undefined);
      if (b.kind !== "cena_conduta") {
        if (stars === 0) errors.push({ line: b.line, message: `"${blockName(b.kind)}" sem alternativa correta — marque uma com "*".` });
        if (stars > 1) errors.push({ line: b.line, message: `"${blockName(b.kind)}" com ${stars} alternativas marcadas "*" — só uma pode ser a correta.` });
      } else if (stars === 0 && !anyQuality) {
        errors.push({ line: b.line, message: `Cena "${b.sceneKey}" sem "qualidade:" nas condutas e sem "*" — não dá para medir.` });
      }

      b.options.forEach((o, oi) => {
        if (!o.label) errors.push({ line: o.line, message: `Alternativa ${oi + 1} sem texto.` });
        else if (RE_PLACEHOLDER.test(o.label)) {
          errors.push({ line: o.line, message: `Alternativa ${oi + 1} ainda está com o texto de exemplo do modelo ("${o.label}") — substitua pelo texto do caso.` });
        }
        let quality: Quality | null = null;
        if (o.quality !== undefined) {
          const q = stripAccents(o.quality.toLowerCase().trim());
          if ((QUALITIES as readonly string[]).includes(q)) quality = q as Quality;
          else errors.push({ line: o.line, message: `qualidade "${o.quality}" inválida. Use ideal, aceitavel, inadequada ou prejudicial.` });
        } else if (b.kind === "cena_conduta") {
          warnings.push({ line: o.line, message: `Conduta sem "qualidade:" — entra como ${o.marker === "*" ? "certa" : "errada"} (certo/errado).` });
        }
        const isCorrect = o.marker === "*" || (b.kind === "cena_conduta" && stars === 0 && quality === "ideal");
        if (!isCorrect && !o.seduction && (format === "decisao_30s" || format === "ponto_de_virada") && b.kind !== "cena_conduta") {
          warnings.push({ line: o.line, message: `Alternativa errada sem "sedução:" — é o que mais ensina.` });
        }
        if (o.nextScene && !sceneKeys.has(o.nextScene)) {
          errors.push({ line: o.line, message: `"vai para: ${o.nextScene}" aponta para uma cena que não existe.` });
        }
        const effect: OptionDoc["effect"] = {};
        if (o.reveals.length) effect.revela = o.reveals;
        if (o.estado) effect.estado = { descricao: o.estado };
        if (o.relogio !== undefined) effect.relogio = o.relogio;
        options.push({
          position: oi,
          label: o.label,
          is_correct: isCorrect,
          quality,
          feedback: o.feedback ?? null,
          seduction: o.seduction ?? null,
          effect,
          next_scene_key: o.nextScene ?? null,
        });
      });
    } else if (b.options.length) {
      errors.push({ line: b.options[0].line, message: `Alternativas ("*" / "-") só cabem em PERGUNTA, REAVALIAÇÃO ou CENA — aqui é "${blockName(b.kind)}".` });
    }

    steps.push({
      position: position++,
      kind: b.kind,
      enabled: true,
      scene_key: b.sceneKey,
      skill: isDecision || b.kind === "ordenar" ? (format ? FORMAT_SKILL[format] : null) : null,
      content,
      options,
    });
  }

  if (format && !steps.some((s) => s.kind === "pergunta" || s.kind === "reavaliacao" || s.kind === "cena_conduta" || s.kind === "ordenar")) {
    errors.push({ line: chunk.startLine, message: `O caso não tem nenhuma decisão (PERGUNTA, REAVALIAÇÃO, ORDENAR ou CENA).` });
  }
  if (format && !steps.some((s) => s.kind === "leve_deste_caso")) {
    warnings.push({ line: chunk.startLine, message: `Sem "## LEVE DESTE CASO".` });
  }
  if (notes.length) warnings.push({ line: null, message: `${notes.length} NOTA(S) para revisar depois da importação.` });

  const slug = slugifyTitle(title);
  const doc: CaseDoc | null =
    errors.length || !format
      ? null
      : {
          slug,
          format,
          title,
          specialty_text: ficha.ESPECIALIDADE?.value || null,
          topic_text: ficha.TEMA?.value || null,
          difficulty,
          primary_skill: FORMAT_SKILL[format],
          est_minutes: estMinutes,
          summary: ficha.RESUMO?.value || null,
          takeaway,
          final_key: ficha["CHAVE FINAL"]?.value || null,
          notes: notes.length ? notes.join("\n") : null,
          steps,
          clues,
        };

  return {
    title,
    slug,
    format,
    specialtyText: ficha.ESPECIALIDADE?.value || null,
    topicText: ficha.TEMA?.value || null,
    startLine: chunk.startLine,
    blockCount: blocks.length,
    notes,
    errors,
    warnings,
    doc,
  };
}

function blockOf(t: Target): Block {
  if (t.kind === "media") return blockOf(t.parent);
  return t.block;
}

function joinProse(lines: string[]): string {
  // Consecutive lines = one paragraph (soft wrap); an empty marker = break.
  const paras: string[][] = [[]];
  for (const l of lines) {
    if (l === "") paras.push([]);
    else paras[paras.length - 1].push(l);
  }
  return paras
    .map((p) => p.join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

function blockName(kind: StepKind): string {
  const entry = Object.entries(BLOCKS).find(([, k]) => k === kind);
  return entry ? entry[0] : kind;
}

type Bound = { set: (v: string) => void; get: () => string } | null;

const MEDIA_ATTRS: AttrKey[] = ["legenda", "alt", "transcricao"];
const BLOCK_ATTRS: AttrKey[] = ["janela", "segundos"];
const OPTION_ATTRS: AttrKey[] = ["feedback", "seducao", "qualidade", "sabemos", "encontramos", "fizemos", "estado", "relogio", "vai para"];
const CLUE_ATTRS: AttrKey[] = ["detalhe", "categoria", "grupo", "distrator"];

function attrApplies(key: AttrKey, target: Target): boolean {
  if (MEDIA_ATTRS.includes(key)) return true; // warns itself when no media is above
  if (BLOCK_ATTRS.includes(key)) return true;
  const parent = target.kind === "media" ? target.parent : target;
  if (parent.kind === "option") return OPTION_ATTRS.includes(key);
  if (parent.kind === "clue") return CLUE_ATTRS.includes(key);
  return false;
}

function bindAttr(
  key: AttrKey,
  value: string,
  target: Target,
  block: Block,
  ln: number,
  errors: Issue[],
  warnings: Issue[],
): Bound {
  // Media attributes bind to the media tag directly above.
  if (key === "legenda" || key === "alt" || key === "transcricao") {
    if (target.kind !== "media") {
      warnings.push({ line: ln, message: `"${key}:" sem uma linha [imagem: …] / [audio: …] logo acima — ignorada.` });
      return null;
    }
    const m = target.media;
    const field = key === "legenda" ? "caption" : key === "alt" ? "alt" : "transcript";
    m[field] = value;
    return { set: (v) => (m[field] = v), get: () => m[field] ?? "" };
  }
  const parent: Target = target.kind === "media" ? target.parent : target;

  if (key === "janela" || key === "segundos") {
    block.attrs[key] = value;
    return { set: (v) => (block.attrs[key] = v), get: () => block.attrs[key] ?? "" };
  }

  if (parent.kind === "clue") {
    const c = parent.clue;
    switch (key) {
      case "detalhe":
        c.detail = value;
        return { set: (v) => (c.detail = v), get: () => c.detail ?? "" };
      case "categoria":
        c.category = value;
        return null;
      case "grupo":
        c.cluster = value;
        return null;
      case "distrator":
        c.distractor = value;
        return { set: (v) => (c.distractor = v), get: () => c.distractor ?? "" };
      default:
        warnings.push({ line: ln, message: `"${key}:" não se aplica a uma pista — ignorada.` });
        return null;
    }
  }

  if (parent.kind === "option") {
    const o = parent.option;
    switch (key) {
      case "feedback":
        o.feedback = value;
        return { set: (v) => (o.feedback = v), get: () => o.feedback ?? "" };
      case "seducao":
        o.seduction = value;
        return { set: (v) => (o.seduction = v), get: () => o.seduction ?? "" };
      case "qualidade":
        o.quality = value;
        return null;
      case "sabemos":
      case "encontramos":
      case "fizemos":
      case "estado": {
        const r: Reveal = { cat: key as RevealCategory, texto: value };
        o.reveals.push(r);
        if (key === "estado") o.estado = value;
        return { set: (v) => { r.texto = v; if (key === "estado") o.estado = v; }, get: () => r.texto };
      }
      case "relogio": {
        const n = Number(value.replace(/[^\d]/g, ""));
        if (!Number.isFinite(n)) errors.push({ line: ln, message: `"relógio:" precisa ser um número de minutos.` });
        o.relogio = n || 0;
        return null;
      }
      case "vai para":
        o.nextScene = normalizeSceneKey(value);
        return null;
      default:
        warnings.push({ line: ln, message: `"${key}:" não se aplica a uma alternativa — ignorada.` });
        return null;
    }
  }

  warnings.push({ line: ln, message: `"${key}:" fora de uma alternativa ou pista — ignorada.` });
  return null;
}

// ── entry point ───────────────────────────────────────────────────────────────

export function parseCaseFile(raw: string): ParseFileResult {
  const text = normalizeText(raw);
  const chunks = splitCases(text);
  const cases = chunks.map(parseChunk);

  // Duplicate titles inside one file collide on slug — flag both.
  const bySlug = new Map<string, ParsedCase[]>();
  for (const c of cases) {
    if (!c.slug) continue;
    bySlug.set(c.slug, [...(bySlug.get(c.slug) ?? []), c]);
  }
  for (const [, group] of bySlug) {
    if (group.length > 1) {
      for (const c of group) {
        c.errors.push({ line: c.startLine, message: `Título repetido no arquivo ("${c.title}") — cada caso precisa de um título único.` });
        c.doc = null;
      }
    }
  }
  return { version: FORMAT_VERSION, cases };
}

/**
 * Resolve ESPECIALIDADE / TEMA against the DB lists. Exact match first, then
 * accent/case-insensitive. No match is a warning (guide §10), never an error.
 */
export function resolveTaxonomy(
  parsed: ParsedCase,
  specialties: { id: number; name: string }[],
  topics: { id: number; name: string; specialty_id: number | null }[],
): void {
  if (!parsed.doc) return;
  const norm = (s: string) => stripAccents(s).toLowerCase().trim();
  const spText = parsed.doc.specialty_text;
  if (spText) {
    const sp = specialties.find((s) => s.name === spText) ?? specialties.find((s) => norm(s.name) === norm(spText));
    if (sp) parsed.doc.specialty_id = sp.id;
    else parsed.warnings.push({ line: parsed.startLine, message: `Especialidade "${spText}" não está na lista — o caso entra sem especialidade; ligamos depois.` });
  }
  const tpText = parsed.doc.topic_text;
  if (tpText) {
    const pool = parsed.doc.specialty_id ? topics.filter((t) => t.specialty_id === parsed.doc!.specialty_id) : topics;
    const tp =
      pool.find((t) => t.name === tpText) ??
      pool.find((t) => norm(t.name) === norm(tpText)) ??
      topics.find((t) => t.name === tpText) ??
      topics.find((t) => norm(t.name) === norm(tpText));
    if (tp) parsed.doc.topic_id = tp.id;
    else parsed.warnings.push({ line: parsed.startLine, message: `Tema "${tpText}" não está na lista — o caso entra sem tema; ligamos depois.` });
  }
}
