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

/**
 * The formats a case may actually use (Karina, 2026-09-01 — "Formatos de audios").
 *
 * The rule that decides this list is her own: a student must never meet a dead
 * media button. So a format is accepted only when EVERY current browser plays
 * it, including older iPhones.
 *
 *   audio  mp3 / m4a (AAC) / wav  — universal
 *   image  jpg / png / webp / gif — universal
 *   video  mp4 / webm             — out of the MVP, structure ready
 *
 * Deliberately excluded:
 *   .ogg   Safari only plays Ogg Vorbis from 18.4 (macOS + iOS). Every iPhone
 *          below that shows a player that never sounds. Convert to .mp3/.m4a.
 *   .heic  iPhone's default photo format; only Safari renders it.
 */
export const ALLOWED_MEDIA_EXT: Record<string, "image" | "audio" | "video"> = {
  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  wav: "audio",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  mp4: "video",
  webm: "video",
};

/** Extensions we recognise as media but refuse, with the reason (PT, for the panel). */
export const REFUSED_MEDIA_EXT: Record<string, string> = {
  ogg: "áudio .ogg não toca em iPhones com Safari anterior ao 18.4 — converta para .mp3 ou .m4a",
  oga: "áudio .oga não toca em iPhones com Safari anterior ao 18.4 — converta para .mp3 ou .m4a",
  opus: "áudio .opus não toca em todos os navegadores — converta para .mp3 ou .m4a",
  flac: "áudio .flac não toca em todos os navegadores e gera arquivos enormes — converta para .mp3",
  heic: "imagem .heic só abre no Safari — exporte como .jpg ou .png",
  heif: "imagem .heif só abre no Safari — exporte como .jpg ou .png",
  wma: "áudio .wma não toca em navegadores — converta para .mp3",
  mov: "vídeo .mov nem sempre toca fora do Safari — exporte como .mp4",
  avi: "vídeo .avi não toca em navegadores — exporte como .mp4",
  mkv: "vídeo .mkv não toca em navegadores — exporte como .mp4",
  bmp: "imagem .bmp é pesada demais para a web — exporte como .jpg ou .png",
  tiff: "imagem .tiff não abre em navegadores — exporte como .jpg ou .png",
  tif: "imagem .tif não abre em navegadores — exporte como .jpg ou .png",
};

export function extensionOf(filename: string): string {
  const base = filename.trim().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** null = accepted; a string = the PT reason it is refused. */
export function mediaRejectionReason(filename: string): string | null {
  const ext = extensionOf(filename);
  if (!ext) return "sem extensão no nome do arquivo — use .mp3, .m4a, .wav, .jpg, .png ou .webp";
  if (ALLOWED_MEDIA_EXT[ext]) return null;
  if (REFUSED_MEDIA_EXT[ext]) return REFUSED_MEDIA_EXT[ext];
  return `formato .${ext} não é aceito — use .mp3, .m4a ou .wav para áudio e .jpg, .png ou .webp para imagem`;
}

export function mediaTypeFor(filename: string, tag?: string): Media["type"] {
  if (tag === "audio" || tag === "áudio") return "audio";
  if (tag === "imagem" || tag === "image") return "image";
  if (tag === "video" || tag === "vídeo") return "video";
  const ext = extensionOf(filename);
  if (ALLOWED_MEDIA_EXT[ext]) return ALLOWED_MEDIA_EXT[ext];
  // Refused formats are still CLASSIFIED so the warning names the right kind.
  if (["ogg", "oga", "opus", "flac", "wma"].includes(ext)) return "audio";
  if (["mov", "avi", "mkv"].includes(ext)) return "video";
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
