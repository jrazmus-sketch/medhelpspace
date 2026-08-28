/**
 * Signed, expiring preview links (§3 "Preview"). An admin gets a URL that runs
 * the REAL player against a draft; the attempt it creates is flagged
 * `is_preview` and never counts. Server-only (needs the secret).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 60 * 60 * 6; // 6 hours — long enough for a review session

function secret(): string {
  const s = process.env.CLINACT_PREVIEW_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.CRON_SECRET;
  if (!s) throw new Error("No secret available to sign preview links");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createPreviewToken(caseId: number, userId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  const payload = `${caseId}.${exp}.${userId}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyPreviewToken(token: string, now = Date.now()): { caseId: number; userId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = Buffer.from(token.slice(0, dot), "base64url").toString();
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [caseIdRaw, expRaw, userId] = payload.split(".");
  const caseId = Number(caseIdRaw);
  const exp = Number(expRaw);
  if (!Number.isFinite(caseId) || !Number.isFinite(exp) || !userId) return null;
  if (exp * 1000 < now) return null;
  return { caseId, userId };
}
