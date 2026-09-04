/**
 * CaseDoc → authoring text (guide format v1). Exact inverse of parse.ts for
 * everything the format can express, so any case exports back to the file it
 * imports from (§3.3 round-trip). Tested: parse(serialize(doc)) ≡ doc.
 */

import {
  type CaseDoc,
  type ClueDoc,
  type Media,
  type OptionDoc,
  type StepDoc,
  type StepKind,
} from "./types";

const BLOCK_NAMES: Record<StepKind, string> = {
  narrativa: "NARRATIVA",
  pistas: "PISTAS",
  pergunta: "PERGUNTA",
  ordenar: "ORDENAR",
  cena_conduta: "CENA",
  investigacao: "INVESTIGAÇÃO",
  novo_dado: "NOVO DADO",
  reavaliacao: "REAVALIAÇÃO",
  confianca: "CONFIANÇA",
  feedback: "FEEDBACK",
  seducao: "FEEDBACK",
  custo_do_atraso: "CUSTO DO ATRASO",
  midia: "MÍDIA",
  cronometro: "CRONÔMETRO",
  leve_deste_caso: "LEVE DESTE CASO",
  prontuario: "",
  codigo_decifrado: "",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  basica: "básica",
  intermediaria: "intermediária",
  avancada: "avançada",
};

function mediaLines(m: Media, indent = ""): string[] {
  const tag = m.type === "audio" ? "audio" : m.type === "video" ? "video" : "imagem";
  const out = [`${indent}[${tag}: ${m.file ?? m.url.split("/").pop() ?? ""}]`];
  if (m.caption) out.push(`${indent}legenda: ${m.caption}`);
  if (m.alt) out.push(`${indent}alt: ${m.alt}`);
  if (m.transcript) out.push(`${indent}transcricao: ${m.transcript}`);
  return out;
}

function optionLines(o: OptionDoc): string[] {
  const out = [`${o.is_correct ? "*" : "-"} ${o.label}`];
  const ind = "  ";
  if (o.quality) out.push(`${ind}qualidade: ${o.quality}`);
  if (o.feedback) out.push(`${ind}feedback: ${o.feedback}`);
  if (o.seduction) out.push(`${ind}sedução: ${o.seduction}`);
  for (const r of o.effect?.revela ?? []) {
    if (r.texto) out.push(`${ind}${r.cat}: ${r.texto}`);
    if (r.midia) out.push(...mediaLines(r.midia, ind));
  }
  if (o.effect?.estado?.descricao && !(o.effect.revela ?? []).some((r) => r.cat === "estado")) {
    out.push(`${ind}estado: ${o.effect.estado.descricao}`);
  }
  if (o.effect?.relogio !== undefined) out.push(`${ind}relógio: ${o.effect.relogio}`);
  if (o.next_scene_key) out.push(`${ind}vai para: ${o.next_scene_key}`);
  return out;
}

function clueLines(c: ClueDoc): string[] {
  const out = [`- ${c.label}`];
  const ind = "  ";
  if (c.detail) out.push(`${ind}detalhe: ${c.detail}`);
  if (c.category) out.push(`${ind}categoria: ${c.category}`);
  if (c.cluster) out.push(`${ind}grupo: ${c.cluster}`);
  if (c.is_red_herring) out.push(`${ind}distrator: ${c.red_herring_reason ?? ""}`.trimEnd());
  if (c.media) out.push(...mediaLines(c.media, ind));
  return out;
}

function stepLines(s: StepDoc, clues: ClueDoc[]): string[] {
  if (s.kind === "prontuario" || s.kind === "codigo_decifrado" || s.kind === "seducao") return [];
  const c = s.content as Record<string, unknown>;
  const header = s.kind === "cena_conduta" ? `## CENA: ${s.scene_key ?? ""}` : `## ${BLOCK_NAMES[s.kind]}`;
  const out = [header];
  const text = typeof c.text === "string" ? c.text : typeof c.prompt === "string" ? c.prompt : "";
  if (text) out.push(text);

  switch (s.kind) {
    case "ordenar":
      (Array.isArray(c.items) ? (c.items as string[]) : []).forEach((it, i) => out.push(`${i + 1}. ${it}`));
      break;
    case "custo_do_atraso":
      if (c.window) out.push(`janela: ${c.window}`);
      break;
    case "cronometro":
      out.push(`segundos: ${c.seconds ?? 30}`);
      break;
    case "pistas":
      for (const k of clues) out.push(...clueLines(k));
      break;
  }

  const media = Array.isArray(c.media) ? (c.media as Media[]) : [];
  if (s.kind === "midia") {
    for (const m of media) out.push(...mediaLines(m));
  }

  if (s.options.length) {
    out.push("");
    for (const o of s.options) out.push(...optionLines(o));
  }

  if (s.kind !== "midia" && media.length) {
    // Block-level media goes after the block's own content/options.
    for (const m of media) out.push(...mediaLines(m));
  }
  return out;
}

export function serializeCase(doc: CaseDoc): string {
  const out: string[] = ["=== CASO ==="];
  out.push(`FORMATO: ${doc.format}`);
  out.push(`TÍTULO: ${doc.title}`);
  if (doc.specialty_text) out.push(`ESPECIALIDADE: ${doc.specialty_text}`);
  if (doc.topic_text) out.push(`TEMA: ${doc.topic_text}`);
  out.push(`DIFICULDADE: ${DIFFICULTY_LABEL[doc.difficulty] ?? doc.difficulty}`);
  if (doc.est_minutes) out.push(`DURAÇÃO: ${doc.est_minutes}`);
  if (doc.summary) out.push(`RESUMO: ${doc.summary}`);
  if (doc.final_key) out.push(`CHAVE FINAL: ${doc.final_key}`);
  const sorted = [...doc.steps].sort((a, b) => a.position - b.position);
  const clues = [...doc.clues].sort((a, b) => a.position - b.position);
  for (const s of sorted) {
    const lines = stepLines(s, clues);
    if (!lines.length) continue;
    out.push("");
    out.push(...lines);
  }
  if (doc.notes) {
    out.push("");
    for (const n of doc.notes.split("\n")) if (n.trim()) out.push(`NOTA: ${n.trim()}`);
  }
  return out.join("\n") + "\n";
}

export function serializeCases(docs: CaseDoc[]): string {
  return docs.map(serializeCase).join("\n");
}
