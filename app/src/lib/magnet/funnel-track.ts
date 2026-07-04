"use client";
// Fire-and-forget top-of-funnel beacon for /questoes-revalida. Deduped per session
// on the client (sessionStorage) AND on the server (unique index). Strictly best-
// effort: analytics must never break the funnel, so every failure is swallowed.
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";

const SID_KEY = "mhs_fsid";

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return "nostore-" + Math.random().toString(36).slice(2); // sessionStorage blocked
  }
}

// The same mhs_fsid the landing/quiz_start beacons use, exposed so the lead capture
// can persist it on the lead row (leads.funnel_session_id) — joining a lead ⇄ its
// anonymous pre-capture funnel journey. Returns null if storage is blocked.
export function getFunnelSessionId(): string | null {
  try {
    return sessionStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

function send(event: "landing" | "quiz_start", sid: string, utm: MagnetUtm): void {
  void fetch("/api/funnel-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, sessionId: sid, utm }),
    keepalive: true, // survive the tab navigating away right after the click
  }).catch(() => {});
}

export function trackFunnel(event: "landing" | "quiz_start", utm: MagnetUtm): void {
  try {
    const guard = `mhs_fe_${event}`;
    if (sessionStorage.getItem(guard)) return; // already fired this session
    sessionStorage.setItem(guard, "1");
    send(event, sessionId(), utm);
  } catch {
    send(event, "nostore", utm); // storage blocked → best-effort single send
  }
}

// ── Lead-captured signal (exit-intent coordination) ─────────────────────────────
// The exit-intent "salvar para depois" modal lives at page level, separate from the
// quiz's React state. Once the visitor has given their email anywhere in the funnel
// (the Q5 gate, or a known ?retomar resume), we DON'T want to nag them to "save for
// later". The quiz calls markLeadCaptured() at that moment; the modal reads the flag
// (isLeadCaptured) and also listens for the LEAD_CAPTURED_EVENT to disarm live.

const CAPTURED_KEY = "mhs_lead_captured";
export const LEAD_CAPTURED_EVENT = "mhs:lead-captured";

export function markLeadCaptured(): void {
  try {
    sessionStorage.setItem(CAPTURED_KEY, "1");
  } catch {
    /* storage blocked — the in-page event below still disarms an open modal */
  }
  try {
    window.dispatchEvent(new Event(LEAD_CAPTURED_EVENT));
  } catch {
    /* non-browser / SSR — no-op */
  }
}

export function isLeadCaptured(): boolean {
  try {
    return sessionStorage.getItem(CAPTURED_KEY) === "1";
  } catch {
    return false;
  }
}
