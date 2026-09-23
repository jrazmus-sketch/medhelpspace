// Shown the instant a member follows a link inside /app, while the next page is
// rendered on the server. Without it a click gave NO feedback until the whole
// page arrived (Justin, 2026-09-23: "a surprisingly long delay"), and Next could
// not prefetch anything for these dynamic routes — a loading boundary is what lets
// <Link> prefetch the shell ahead of the click.
//
// Neutral on purpose (it stands in for every /app page): a title bar and a few
// content blocks in the page's own surface tokens, pulsing gently.

export default function AppLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando"
      className="mx-auto w-full max-w-5xl px-4 pt-7 pb-16 sm:px-6"
    >
      <div className="animate-pulse motion-reduce:animate-none">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="mt-6 h-8 w-2/3 max-w-sm rounded-md bg-surface-2" />
        <div className="mt-3 h-4 w-full max-w-md rounded bg-surface-2" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-[var(--radius)] bg-surface-1 ring-1 ring-[var(--surface-2)]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
