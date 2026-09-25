// Browser side of error tracking: send a crash caught by an error boundary to
// /api/client-error (→ app_errors). Each distinct error is sent once per page
// load, so a render loop cannot flood the endpoint, and sending never throws.

const sent = new Set<string>();

export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const key = `${error.digest ?? ""}|${error.message}`;
    if (sent.has(key)) return;
    sent.add(key);
    const payload = JSON.stringify({
      message: error.message,
      stack: error.stack ?? null,
      digest: error.digest ?? null,
      // The server keeps the path only; the query string is dropped there.
      url: window.location.href,
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/client-error", blob)) {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Reporting is best-effort; the error screen must render regardless.
  }
}
