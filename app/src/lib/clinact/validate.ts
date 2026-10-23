/**
 * Publish validator (§2 "Publish validator refuses", §3 Publish).
 *
 * Import and publish deliberately disagree on media: a missing file is a
 * WARNING at import (she writes the case before recording the sound) and a
 * BLOCK at publish (a student must never meet a dead audio button). The
 * structural checks here are pure; the media-existence check is injected by
 * the caller (a HEAD against the CDN, server-side) so the same validator can
 * run client-side in the editor's checklist with "unknown" media state.
 *
 * Messages are Portuguese and name the scene/block — the panel audience is a
 * content producer, not a developer.
 */

import { collectMedia } from "./media";
import { DECISION_KINDS, type CaseDoc, type StepDoc } from "./types";

export type Check = { ok: boolean; message: string; blocking: boolean };

export type MediaProbe = (url: string) => boolean | null; // null = unknown

// Derived from the shared list — this was the fourth hardcoded copy, and a case
// whose only decision was an INVESTIGAÇÃO read as having no decision at all.
const DECISION = new Set<string>(DECISION_KINDS);

function label(s: StepDoc, i: number): string {
  if (s.kind === "cena_conduta") return `Cena "${s.scene_key ?? i + 1}"`;
  return `Bloco ${i + 1} (${s.kind.replace(/_/g, " ")})`;
}

/** Every authored string under a value — text, labels, reveals, captions — never a file name or URL. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => (k === "url" || k === "file" || k === "type" ? [] : strings(x)));
  }
  return [];
}

const stepStrings = (s: StepDoc): string[] => [
  ...strings(s.content),
  ...s.options.flatMap((o) => [o.label, o.feedback ?? "", o.seduction ?? "", ...strings(o.effect)]),
];

// ── Findings, not digits (Karina 2026-10-22, CEC-19) ─────────────────────────
// The result-leak check compared bare numbers, so "há 14 meses" (in a result)
// matched a dose "às 14h" later, and the "76" of "128/76 mmHg" matched a new
// reading "130/76 mmHg" at the return visit. A finding is the WHOLE value — a
// compound like 128/76 stays one value — together with its unit when the unit
// is a known clinical/time unit. "14 meses" ≠ "14h" ≠ "14"; "128/76 mmHg" ≠
// "130/76 mmHg" ≠ "76 bpm". The same finding reappearing is still a leak.
const UNITS = new Set([
  "h", "hs", "min", "minuto", "minutos", "hora", "horas", "dia", "dias", "semana", "semanas",
  "mes", "meses", "ano", "anos", "mmhg", "bpm", "irpm", "ipm", "rpm", "%", "°c", "ºc", "c",
  "mg", "g", "kg", "mcg", "µg", "ug", "ml", "l", "dl", "cm", "mm", "m", "ui", "u",
  "mg/dl", "g/dl", "mmol/l", "meq/l", "mg/l", "ng/ml", "pg/ml", "u/l", "ui/l", "ui/ml",
  "mm3", "/mm3", "cmh2o", "kg/m2", "ml/min", "l/min", "mg/kg", "vezes", "x",
]);
const stripMarks = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const RE_FINDING = /(\d+(?:[.,]\d+)*(?:\s*\/\s*\d+(?:[.,]\d+)*)*)(?:\s*(%|[°º]\s?C|\/?[A-Za-zÀ-ÿµ][A-Za-zÀ-ÿµ0-9]*(?:\/[A-Za-zÀ-ÿµ0-9]+)?))?/g;

type Finding = { key: string; shown: string };

/** Every finding in a text: "128/76 mmHg" → key "128/76 mmhg"; "14 meses" → "14 meses"; "14h" → "14 h". */
export function findingsIn(t: string): Finding[] {
  const out: Finding[] = [];
  for (const m of t.matchAll(RE_FINDING)) {
    const value = m[1].replace(/\s+/g, "");
    // A lone single digit is too common to mean anything (same rule as before).
    if (!value.includes("/") && value.replace(/[.,]/g, "").length < 2) continue;
    const rawUnit = (m[2] ?? "").replace(/\s+/g, "");
    const unit = stripMarks(rawUnit).toLowerCase();
    const known = UNITS.has(unit) ? unit : "";
    out.push({ key: known ? `${value} ${known}` : value, shown: known ? `${value} ${rawUnit}` : value });
  }
  return out;
}

/** A later conduct that explicitly OBTAINS data may reveal that value as its own result. */
const RE_OBTAINS = /\b(solicit|ped[ei]|medi[rd]|med[ei]|aferi|afer[ei]|dosa|dosag|repet|colet|coleta|realiz|reavali|examin|verific|chec|obt[eé]m|obter|nova (aferi|medida|dosagem))/i;

export function validateForPublish(doc: CaseDoc, probe: MediaProbe = () => null): Check[] {
  const checks: Check[] = [];
  const add = (ok: boolean, message: string, blocking = true) => checks.push({ ok, message, blocking });

  add(!!doc.title.trim(), doc.title.trim() ? "Título preenchido" : "Falta o título");
  add(!!doc.slug, "Endereço gerado a partir do título");

  const steps = doc.steps.filter((s) => s.enabled).sort((a, b) => a.position - b.position);
  add(steps.length > 0, steps.length ? `${steps.length} bloco(s) ativo(s)` : "O caso não tem blocos ativos");

  const decisions = steps.filter((s) => DECISION.has(s.kind));
  add(decisions.length > 0, decisions.length ? `${decisions.length} decisão(ões)` : "Nenhuma decisão (PERGUNTA, REAVALIAÇÃO, ORDENAR, CENA ou INVESTIGAÇÃO)");

  steps.forEach((s, i) => {
    const c = s.content as Record<string, unknown>;
    switch (s.kind) {
      case "narrativa":
      case "novo_dado":
      case "cena_conduta":
        if (!String(c.text ?? "").trim()) add(false, `${label(s, i)} está sem texto`);
        break;
      case "pergunta":
      case "reavaliacao":
      case "investigacao":
        if (!String(c.prompt ?? "").trim()) add(false, `${label(s, i)} está sem enunciado`);
        break;
      case "ordenar": {
        const items = Array.isArray(c.items) ? (c.items as string[]).filter((x) => x.trim()) : [];
        if (items.length < 2) add(false, `${label(s, i)} precisa de pelo menos 2 itens`);
        break;
      }
      case "cronometro": {
        const secs = Number(c.seconds);
        if (!Number.isFinite(secs) || secs < 5) add(false, `${label(s, i)}: segundos inválidos`);
        break;
      }
      case "midia": {
        const media = Array.isArray(c.media) ? c.media : [];
        if (!media.length) add(false, `${label(s, i)} está sem arquivo`);
        break;
      }
      case "leve_deste_caso":
        if (!String(c.text ?? "").trim()) add(false, `${label(s, i)} está vazio`, false);
        break;
    }

    if (s.kind === "pergunta" || s.kind === "reavaliacao" || s.kind === "cena_conduta") {
      const opts = s.options;
      if (opts.length < 2 || opts.length > 5) add(false, `${label(s, i)}: precisa de 2 a 5 alternativas (tem ${opts.length})`);
      const empty = opts.filter((o) => !o.label.trim()).length;
      if (empty) add(false, `${label(s, i)}: ${empty} alternativa(s) sem texto`);
      const correct = opts.filter((o) => o.is_correct).length;
      if (s.kind !== "cena_conduta") {
        if (correct !== 1) add(false, `${label(s, i)}: exatamente uma alternativa deve ser a correta (tem ${correct})`);
      } else {
        const withQ = opts.filter((o) => o.quality).length;
        if (withQ === 0 && correct === 0) add(false, `${label(s, i)}: condutas sem qualidade e sem alternativa correta`);
        if (withQ && withQ < opts.length) add(false, `${label(s, i)}: ${opts.length - withQ} conduta(s) sem qualidade`, false);
      }
      const noFeedback = opts.filter((o) => !o.feedback?.trim()).length;
      if (noFeedback) add(false, `${label(s, i)}: ${noFeedback} alternativa(s) sem feedback`, false);
    }
  });

  // ── INVESTIGAÇÃO: graded as a set, by the quality of each option ─────────
  steps.forEach((s, i) => {
    if (s.kind !== "investigacao") return;
    const opts = s.options;
    if (opts.length < 2 || opts.length > 8) add(false, `${label(s, i)}: precisa de 2 a 8 opções (tem ${opts.length})`);
    const empty = opts.filter((o) => !o.label.trim()).length;
    if (empty) add(false, `${label(s, i)}: ${empty} opção(ões) sem texto`);
    // The quality IS the score here — there is no right/wrong fallback.
    const noQuality = opts.filter((o) => !o.quality).length;
    if (noQuality) add(false, `${label(s, i)}: ${noQuality} opção(ões) sem qualidade — em INVESTIGAÇÃO é ela que vale a nota`);
    // Without an ideal option the score can never reach 1,0.
    if (!opts.some((o) => o.quality === "ideal")) add(false, `${label(s, i)}: nenhuma opção Ideal — a nota máxima ficaria inalcançável`);
    const noFeedback = opts.filter((o) => !o.feedback?.trim()).length;
    if (noFeedback) add(false, `${label(s, i)}: ${noFeedback} opção(ões) sem feedback`, false);
    // A set is not a path: a "vai para" on one option is ignored by the engine.
    if (opts.some((o) => o.next_scene_key)) add(false, `${label(s, i)}: "vai para" não funciona dentro de INVESTIGAÇÃO e será ignorado`, false);
  });

  // ── INVESTIGAÇÃO: nothing may lean on a result the student may not have
  // ordered (Karina 2026-10-06). This is the mechanical half of her rule: a
  // number that exists ONLY in an option's result — absent from everything
  // before the block — and turns up where every student reads it (any feedback
  // in the block, shown for unordered items too, or anything after it). Inferences ("sem três
  // critérios menores") carry no number; those stay an editorial read (§7).
  steps.forEach((s, i) => {
    if (s.kind !== "investigacao") return;
    // The block's own prompt and option labels are on screen before confirming.
    const before = new Set(
      [...steps.slice(0, i).flatMap(stepStrings), ...strings(s.content), ...s.options.map((o) => o.label)]
        .flatMap(findingsIn)
        .map((f) => f.key),
    );
    const owner = new Map<string, { option: string; shown: string }>(); // result-only finding → its option
    for (const o of s.options) {
      for (const f of strings(o.effect).flatMap(findingsIn)) {
        if (!before.has(f.key) && !owner.has(f.key)) owner.set(f.key, { option: o.label, shown: f.shown });
      }
    }
    if (!owner.size) return;
    // Later conducts: the label, feedback and seduction are read by everyone; the
    // revealed result is exempt only when the conduct itself explicitly obtains
    // data ("Aferir novamente a PA…") — then the value is that action's own.
    const laterStrings = (t: StepDoc): string[] => [
      ...strings(t.content),
      ...t.options.flatMap((o) => [o.label, o.feedback ?? "", o.seduction ?? "", ...(RE_OBTAINS.test(o.label) ? [] : strings(o.effect))]),
    ];
    const everyone: [text: string, where: string][] = [
      ...s.options.map((o): [string, string] => [o.feedback ?? "", `o feedback de "${o.label}"`]),
      ...steps.slice(i + 1).flatMap((t, j) => laterStrings(t).map((x): [string, string] => [x, label(t, i + 1 + j)])),
      [doc.takeaway ?? "", "Leve deste caso"],
    ];
    const flagged = new Set<string>();
    for (const [text, where] of everyone) {
      for (const f of findingsIn(text)) {
        const hit = owner.get(f.key);
        if (!hit || flagged.has(f.key)) continue;
        flagged.add(f.key);
        add(false, `${label(s, i)}: "${hit.shown}" só existe no resultado de "${hit.option}", mas aparece também em ${where} — quem não pediu esse exame leria o resultado ali`, false);
      }
    }
  });

  // ── Convergent branching (Clínica em Cena) ────────────────────────────────
  const scenes = steps.filter((s) => s.kind === "cena_conduta");
  if (scenes.length) {
    const keys = scenes.map((s) => s.scene_key ?? "");
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dup.length) add(false, `Cena repetida: "${dup[0]}"`);
    if (keys.some((k) => !k)) add(false, "Toda cena precisa de um apelido");

    const idx = new Map(keys.map((k, i) => [k, i]));
    // Detour scenes = targeted by any "vai para". The normal flow SKIPS them:
    // a blank conduct falls to the next NON-detour scene (or the end of the
    // case). This matches the guide's inline template (chegada → deterioracao
    // → investigacao): chegada's good conducts land on investigacao.
    const targeted = new Set<number>();
    for (const sc of scenes) {
      for (const o of sc.options) {
        if (o.next_scene_key) {
          const t = idx.get(o.next_scene_key);
          if (t === undefined) add(false, `Cena "${sc.scene_key}": "vai para: ${o.next_scene_key}" aponta para uma cena que não existe`);
          else targeted.add(t);
        }
      }
    }
    /** First non-detour scene after i; null = the case ends. */
    const fallNext = (i: number): number | null => {
      for (let j = i + 1; j < scenes.length; j++) if (!targeted.has(j)) return j;
      return null;
    };
    const edges = new Map<number, Set<number | null>>();
    for (let i = 0; i < scenes.length; i++) {
      const out = new Set<number | null>();
      for (const o of scenes[i].options) {
        if (o.next_scene_key) {
          const t = idx.get(o.next_scene_key);
          if (t !== undefined) out.add(t);
        } else {
          out.add(fallNext(i));
        }
      }
      edges.set(i, out);
    }
    // Reachability from the first scene.
    const reached = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const t of edges.get(cur) ?? []) if (t !== null && !reached.has(t)) { reached.add(t); stack.push(t); }
    }
    for (let i = 0; i < scenes.length; i++) if (!reached.has(i)) add(false, `Cena "${keys[i]}" nunca é alcançada`);
    // Every reached scene must have a path to the end of the case (null edge).
    const canEnd = new Set<number>();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < scenes.length; i++) {
        if (canEnd.has(i)) continue;
        for (const t of edges.get(i) ?? []) {
          if (t === null || canEnd.has(t)) { canEnd.add(i); changed = true; break; }
        }
      }
    }
    for (let i = 0; i < scenes.length; i++) if (reached.has(i) && !canEnd.has(i)) add(false, `Cena "${keys[i]}": há um caminho que nunca chega ao fim do caso`);
    // Detour depth ≤ 1 ("um desvio dura no máximo uma cena"): a detour's
    // explicit jumps may not land on another detour scene. (Its blank
    // conducts already converge — fallNext never returns a detour.)
    for (const t of targeted) {
      for (const o of scenes[t].options) {
        if (!o.next_scene_key) continue;
        const dest = idx.get(o.next_scene_key);
        if (dest !== undefined && targeted.has(dest)) {
          add(false, `Cena "${keys[t]}" → "${keys[dest]}": desvio com mais de uma cena antes de voltar ao caminho comum`);
        }
      }
    }
  }

  // ── Media must exist (blocking at publish — Karina 2026-08-28) ────────────
  const media = collectMedia(doc);
  for (const { media: m, where } of media) {
    const name = m.file ?? m.url;
    if (!m.url) { add(false, `Mídia "${name}" (${where}) sem arquivo`); continue; }
    const exists = probe(m.url);
    if (exists === false) add(false, `Arquivo "${name}" (${where}) não foi enviado — publique só depois de subir a mídia`);
    else if (exists === null) add(true, `Mídia "${name}" (${where}) — existência verificada ao publicar`, false);
    if (m.type === "image" && !m.alt) add(false, `Imagem "${name}" sem "alt" (acessibilidade)`, false);
    if (m.type === "audio" && !m.transcript) add(false, `Áudio "${name}" sem transcrição (acessibilidade)`, false);
  }

  if (!doc.takeaway && !steps.some((s) => s.kind === "leve_deste_caso" && String((s.content as { text?: string }).text ?? "").trim())) {
    add(false, "Sem \"Leve deste caso\"", false);
  }
  if (!doc.specialty_id) add(false, "Sem especialidade ligada", false);
  if (!doc.topic_id) add(false, "Sem tema ligado", false);

  return checks;
}

export function publishBlockers(checks: Check[]): string[] {
  return checks.filter((c) => !c.ok && c.blocking).map((c) => c.message);
}
