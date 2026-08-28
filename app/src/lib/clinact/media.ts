/**
 * Media naming — the filename IS the identity.
 *
 * Karina writes `[imagem: ecg-caso-12.jpg]` and drops `ecg-caso-12.jpg` in the
 * importer's dropzone (today or next month). Both sides go through
 * `mediaKey()` so they meet at one deterministic CDN path — which is what lets
 * "missing" be a warning at import and a hard block at publish (§2): the URL
 * is known from day one, only the bytes are pending.
 */

import { CLINACT_CDN_BASE, CLINACT_MEDIA_PREFIX, type Media } from "./types";

export function mediaKey(filename: string): string {
  const base = filename.trim().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const cs = clean(stem) || "arquivo";
  const ce = clean(ext);
  return ce ? `${cs}.${ce}` : cs;
}

export function mediaUrlFor(filename: string): string {
  return `${CLINACT_CDN_BASE}/${CLINACT_MEDIA_PREFIX}/${mediaKey(filename)}`;
}

export function mediaTypeFor(filename: string, tag?: string): Media["type"] {
  if (tag === "audio" || tag === "áudio") return "audio";
  if (tag === "imagem" || tag === "image") return "image";
  if (tag === "video" || tag === "vídeo") return "video";
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (["mp3", "m4a", "wav", "ogg", "aac"].includes(ext)) return "audio";
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  return "image";
}

/** Every Media object inside a case document, wherever it lives. */
export function collectMedia(doc: {
  steps: { content: Record<string, unknown>; options: { effect: { revela?: { midia?: Media }[] } }[] }[];
  clues: { media?: Media | null }[];
}): { media: Media; where: string }[] {
  const out: { media: Media; where: string }[] = [];
  doc.steps.forEach((s, si) => {
    const list = s.content.media;
    if (Array.isArray(list)) {
      for (const m of list as Media[]) out.push({ media: m, where: `bloco ${si + 1}` });
    }
    s.options.forEach((o, oi) => {
      for (const r of o.effect?.revela ?? []) {
        if (r.midia) out.push({ media: r.midia, where: `bloco ${si + 1}, alternativa ${oi + 1}` });
      }
    });
  });
  doc.clues.forEach((c, ci) => {
    if (c.media) out.push({ media: c.media, where: `pista ${ci + 1}` });
  });
  return out;
}
