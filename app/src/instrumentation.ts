// Next.js instrumentation file — https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
// (see app/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// Convention: must live at the ROOT of the app, or inside `src/` when the project
// uses a src folder (this one does) — so this file is `app/src/instrumentation.ts`.
// `onRequestError` has been stable since Next 15.0.0 (no experimental flag / no
// next.config.ts change required).
//
// Minimal production error tracking (no Sentry / no external service):
//   (a) ALWAYS: one structured `console.error` line so Vercel's log pipeline
//       captures every server error. Must never throw — this is the baseline
//       observability and cannot be allowed to fail.
//   (b) BEST-EFFORT, Node runtime only: insert a deduplicated row into the
//       existing `admin_alerts` table so errors are visible from the admin
//       panel's data (same table used by lib/admin-notify.ts). This intentionally
//       does NOT call recordAdminAlert() — that helper fires "instant" emails to
//       admins on first-seen events, and an error storm must never become an
//       email storm. We insert directly via the service-role client instead, and
//       rely on the existing UNIQUE(event_type, context_id) constraint on
//       `admin_alerts` (schema-patch-admin-notifications.sql) for dedup: repeat
//       inserts with the same context_id hit a 23505 conflict, which we swallow.
//
// Fail-open contract: nothing in this file may throw in a way that affects the
// request that triggered the error. Every step is wrapped defensively.

import type { Instrumentation } from "next";

const MAX_STACK_LINES = 10;
const MAX_MESSAGE_CHARS_FOR_DEDUP = 40;

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // ── Extract what we can from the error, defensively. `error` is typed
  // `unknown` by Next (the doc's `{ digest: string } & Error` is the common
  // case, but not guaranteed — React may hand back a processed error).
  let message = "Unknown error";
  let stack: string | undefined;
  let digest: string | undefined;
  try {
    if (error instanceof Error) {
      message = error.message || message;
      stack = error.stack;
      digest = (error as Error & { digest?: string }).digest;
    } else if (typeof error === "string") {
      message = error;
    } else {
      message = String(error);
    }
  } catch {
    // Keep the defaults above — extraction itself must never throw.
  }

  const truncatedStack = stack
    ? stack.split("\n").slice(0, MAX_STACK_LINES).join("\n")
    : undefined;

  // (a) ALWAYS — structured console.error for Vercel's log capture. This is the
  // baseline and must never throw.
  try {
    console.error(
      "[server-error]",
      JSON.stringify({
        message,
        digest: digest ?? null,
        routePath: context?.routePath ?? null,
        routerKind: context?.routerKind ?? null,
        routeType: context?.routeType ?? null,
        method: request?.method ?? null,
        timestamp: new Date().toISOString(),
        stack: truncatedStack ?? null,
      }),
    );
  } catch {
    // JSON.stringify (circular refs, etc.) or console.error itself must never
    // propagate — swallow and move on.
  }

  // (b) BEST-EFFORT — dedup'd admin_alerts row, Node runtime only (the admin
  // Supabase client uses the service-role key and isn't meaningful/available on
  // the Edge runtime). Wrapped in its own try/catch that swallows everything.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // Dynamic import per the docs' "Importing runtime-specific code" pattern —
      // keeps this out of any Edge bundle of instrumentation.ts. lib/supabase/admin.ts
      // has no `server-only` guard, so it's safe to import here.
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();

      const routePath = context?.routePath ?? "unknown-route";
      const dedupKey = digest ?? message.slice(0, MAX_MESSAGE_CHARS_FOR_DEDUP);
      const contextId = `${routePath}:${dedupKey}`;

      // Direct table insert — intentionally NOT recordAdminAlert(), which would
      // also trigger "instant" emails to admins on first-seen events. We only
      // want a passive log row here.
      await admin.from("admin_alerts").insert({
        event_type: "server_error",
        title: `Erro no servidor — ${routePath}`,
        body: message,
        metadata: {
          digest: digest ?? null,
          routePath,
          routerKind: context?.routerKind ?? null,
          routeType: context?.routeType ?? null,
          method: request?.method ?? null,
          stack: truncatedStack ?? null,
        },
        context_id: contextId,
      });
      // Any error from the insert (including a 23505 dedup conflict when the
      // same context_id was already recorded) is intentionally ignored — this
      // is a passive log, not a control-flow signal.
    } catch {
      // Best-effort only — never let admin-alert logging affect the request.
    }
  }
};
