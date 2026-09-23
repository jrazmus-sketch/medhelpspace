// Zoom + pan math for the MemoreCards full-screen viewer. Pure (no DOM), so the
// rules are tested directly: the card can be enlarged 1×–4×, is only ever moved
// while enlarged, and can never be dragged off the screen.
//
// Coordinates are in screen pixels relative to the CENTRE of the stage (the
// full-screen area), which is also the transform origin of the card.

export type Zoom = { s: number; x: number; y: number };
export type Size = { w: number; h: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Where a double-tap / double-click lands. */
export const TAP_SCALE = 2.5;

export const IDENTITY: Zoom = { s: 1, x: 0, y: 0 };

/** The card's on-screen size at 1×: as large as the stage allows at its own ratio. */
export function fitCard(stage: Size, ratio: number): Size {
  const w = Math.min(stage.w, stage.h * ratio);
  return { w, h: w / ratio };
}

/**
 * Keep the enlarged card covering the stage: it may be moved only as far as it
 * overhangs the stage on that axis, and not at all on an axis where it still fits.
 */
export function clampZoom(z: Zoom, card: Size, stage: Size): Zoom {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, z.s));
  const maxX = Math.max(0, (card.w * s - stage.w) / 2);
  const maxY = Math.max(0, (card.h * s - stage.h) / 2);
  return {
    s,
    x: Math.min(maxX, Math.max(-maxX, z.x)),
    y: Math.min(maxY, Math.max(-maxY, z.y)),
  };
}

/**
 * Change the scale while keeping the point under `at` (stage-centre coordinates)
 * fixed on screen — the pinch / wheel / double-tap behaviour everyone expects.
 */
export function zoomAt(z: Zoom, nextScale: number, at: { x: number; y: number }, card: Size, stage: Size): Zoom {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  const k = s / z.s;
  return clampZoom({ s, x: at.x - (at.x - z.x) * k, y: at.y - (at.y - z.y) * k }, card, stage);
}

/**
 * Two-finger gesture: the content point that was under the fingers' midpoint at
 * the start stays under their midpoint now, at the new scale (zoom + pan at once).
 */
export function pinch(
  start: Zoom,
  startMid: { x: number; y: number },
  startDist: number,
  mid: { x: number; y: number },
  dist: number,
  card: Size,
  stage: Size,
): Zoom {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.s * (dist / Math.max(1, startDist))));
  const cx = (startMid.x - start.x) / start.s;
  const cy = (startMid.y - start.y) / start.s;
  return clampZoom({ s, x: mid.x - cx * s, y: mid.y - cy * s }, card, stage);
}

/** Double-tap: enlarge towards the tapped point, or return to the whole card. */
export function toggleZoom(z: Zoom, at: { x: number; y: number }, card: Size, stage: Size): Zoom {
  return z.s > 1.01 ? IDENTITY : zoomAt(z, TAP_SCALE, at, card, stage);
}

/** A swipe changes card only when the card is NOT enlarged — then the finger pans. */
export function isSwipe(z: Zoom, dx: number, dy: number): -1 | 1 | 0 {
  if (z.s > 1.01) return 0;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
