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
import { type CaseDoc, type StepDoc } from "./types";

export type Check = { ok: boolean; message: string; blocking: boolean };

export type MediaProbe = (url: string) => boolean | null; // null = unknown

const DECISION = new Set(["pergunta", "reavaliacao", "ordenar", "cena_conduta"]);

function label(s: StepDoc, i: number): string {
  if (s.kind === "cena_conduta") return `Cena "${s.scene_key ?? i + 1}"`;
  return `Bloco ${i + 1} (${s.kind.replace(/_/g, " ")})`;
}

export function validateForPublish(doc: CaseDoc, probe: MediaProbe = () => null): Check[] {
  const checks: Check[] = [];
  const add = (ok: boolean, message: string, blocking = true) => checks.push({ ok, message, blocking });

  add(!!doc.title.trim(), doc.title.trim() ? "Título preenchido" : "Falta o título");
  add(!!doc.slug, "Endereço gerado a partir do título");

  const steps = doc.steps.filter((s) => s.enabled).sort((a, b) => a.position - b.position);
  add(steps.length > 0, steps.length ? `${steps.length} bloco(s) ativo(s)` : "O caso não tem blocos ativos");

  const decisions = steps.filter((s) => DECISION.has(s.kind));
  add(decisions.length > 0, decisions.length ? `${decisions.length} decisão(ões)` : "Nenhuma decisão (PERGUNTA, REAVALIAÇÃO, ORDENAR ou CENA)");

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

  // ── Convergent branching (Clínica em Cena) ────────────────────────────────
  const scenes = steps.filter((s) => s.kind === "cena_conduta");
  if (scenes.length) {
    const keys = scenes.map((s) => s.scene_key ?? "");
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dup.length) add(false, `Cena repetida: "${dup[0]}"`);
    if (keys.some((k) => !k)) add(false, "Toda cena precisa de um apelido");

    const idx = new Map(keys.map((k, i) => [k, i]));
    const next = (i: number) => (i + 1 < scenes.length ? i + 1 : null);
    const edges = new Map<number, Set<number>>();
    for (let i = 0; i < scenes.length; i++) {
      const targets = new Set<number>();
      for (const o of scenes[i].options) {
        if (o.next_scene_key) {
          const t = idx.get(o.next_scene_key);
          if (t === undefined) add(false, `Cena "${keys[i]}": "vai para: ${o.next_scene_key}" aponta para uma cena que não existe`);
          else targets.add(t);
        } else {
          const n = next(i);
          if (n !== null) targets.add(n);
        }
      }
      edges.set(i, targets);
    }
    // Reachability from the first scene.
    const reached = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const t of edges.get(cur) ?? []) if (!reached.has(t)) { reached.add(t); stack.push(t); }
    }
    for (let i = 0; i < scenes.length; i++) if (!reached.has(i)) add(false, `Cena "${keys[i]}" nunca é alcançada`);
    // Every path reaches the terminal scene: with convergence (fall-through)
    // that fails only when a detour points backwards forever or dead-ends.
    const last = scenes.length - 1;
    const canReachEnd = new Set<number>([last]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < scenes.length; i++) {
        if (canReachEnd.has(i)) continue;
        for (const t of edges.get(i) ?? []) if (canReachEnd.has(t)) { canReachEnd.add(i); changed = true; break; }
      }
    }
    for (let i = 0; i < scenes.length; i++) if (reached.has(i) && !canReachEnd.has(i)) add(false, `Cena "${keys[i]}": há um caminho que nunca chega ao fim do caso`);
    // Detour depth ≤ 1: a `vai para` target must fall back into the main line
    // (i.e. its own fall-through) within one scene — its options may not detour again.
    for (let i = 0; i < scenes.length; i++) {
      for (const o of scenes[i].options) {
        if (!o.next_scene_key) continue;
        const t = idx.get(o.next_scene_key);
        if (t === undefined) continue;
        const detourAgain = scenes[t].options.some((x) => x.next_scene_key && idx.get(x.next_scene_key) !== next(t));
        if (detourAgain) add(false, `Cena "${keys[i]}" → "${keys[t]}": desvio com mais de uma cena antes de voltar ao caminho comum`);
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
