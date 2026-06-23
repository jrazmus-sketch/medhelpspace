"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "@/providers/auth-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { CoachKey, OnboardingContentMap } from "@/lib/onboarding/tips";

const LS_KEY = "mhs_onboarding_dismissed_v1";
const PREVIEW_KEY = "mhs_onboarding_preview";

// Stable no-op subscriber for the "am I hydrated yet?" snapshot trick: the
// server/first-client snapshot is `false`, the post-hydration snapshot is
// `true`. Lets us avoid rendering tips before we know the dismissed set —
// without a setState-in-effect (which this repo's lint forbids).
const emptySubscribe = () => () => {};

// ── Preview store (super-admin testing toggle) ───────────────────────────────
// A tiny localStorage-backed external store. When ON, the provider treats every
// tip as un-dismissed so an admin can preview the full new-member experience,
// then flip it back off — without clearing their real dismissals. Driven via
// useSyncExternalStore so reads stay lint-clean (no setState-in-effect) and the
// snapshot is a stable primitive boolean.
const previewListeners = new Set<() => void>();
function readPreview(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribePreview(cb: () => void) {
  previewListeners.add(cb);
  return () => {
    previewListeners.delete(cb);
  };
}
function writePreview(on: boolean) {
  try {
    if (on) window.localStorage.setItem(PREVIEW_KEY, "1");
    else window.localStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* ignore */
  }
  previewListeners.forEach((cb) => cb());
}

interface OnboardingContextValue {
  /** True once hydrated (and, in real mode, once the profile has settled).
   *  Gate rendering on this to avoid a flash of already-dismissed tips. */
  ready: boolean;
  isDismissed: (key: CoachKey) => boolean;
  dismiss: (key: CoachKey) => void;
  /** Re-enable every coachmark (used by "Reativar dicas" on the guide). */
  reset: () => void;
  /** Super-admin preview: when true, every tip shows regardless of dismissals. */
  previewMode: boolean;
  setPreviewMode: (on: boolean) => void;
  /** Editable tip strings from site_content (`{}` → use hardcoded fallbacks). */
  content: OnboardingContentMap;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

/**
 * Shared store for the new-member walkthrough dismissals. Mounted once in the
 * member layout, so it persists across client navigations between /app/* pages
 * (App Router keeps the layout mounted) — tips don't re-flash as you move.
 *
 * The dismissed set is the union of:
 *   • a persisted source — `profile.onboarding_dismissed` (real auth, loaded by
 *     AuthProvider) or localStorage (mock / offline dev); and
 *   • optimistic in-session dismissals held in React state.
 * `reset()` flips a `cleared` flag so we ignore the persisted source until the
 * backing store catches up. All setState happens in event handlers (never in an
 * effect), and external reads go through useSyncExternalStore / useMemo.
 */
export function OnboardingProvider({
  children,
  content = {},
}: {
  children: React.ReactNode;
  /** Editable strings fetched server-side in the member layout (site_content). */
  content?: OnboardingContentMap;
}) {
  const { profile, loading } = useAuth();

  // false on the server + first client render, true afterwards.
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // Super-admin preview toggle (off on server + until hydrated).
  const previewMode = useSyncExternalStore(subscribePreview, readPreview, () => false);
  const setPreviewMode = useCallback((on: boolean) => writePreview(on), []);

  // Optimistic, session-local dismissals + the "reset" override. Mutated only
  // from the dismiss()/reset() handlers below.
  const [extra, setExtra] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState(false);

  // Persisted source, read during render (no effect). In mock mode this reads
  // localStorage once hydrated; in real mode it reflects the loaded profile.
  const persisted = useMemo<Set<string>>(() => {
    if (!hydrated) return new Set();
    if (USE_MOCK_DATA) {
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
      } catch {
        return new Set();
      }
    }
    return new Set((profile?.onboarding_dismissed ?? []) as string[]);
  }, [hydrated, profile]);

  const effective = useMemo<Set<string>>(() => {
    if (cleared) return extra;
    return new Set([...persisted, ...extra]);
  }, [cleared, persisted, extra]);

  const ready = USE_MOCK_DATA ? hydrated : hydrated && !loading;

  const dismiss = useCallback((key: CoachKey) => {
    setExtra((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev).add(key);
      if (USE_MOCK_DATA) {
        try {
          window.localStorage.setItem(LS_KEY, JSON.stringify([...next]));
        } catch {
          /* ignore quota / private-mode errors */
        }
      } else {
        // Fire-and-forget; the optimistic local state is the UX truth.
        void fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismiss", key }),
        });
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setCleared(true);
    setExtra(new Set());
    if (USE_MOCK_DATA) {
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {
        /* ignore */
      }
    } else {
      void fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
    }
  }, []);

  // Preview mode short-circuits dismissals so admins see the full experience.
  const isDismissed = useCallback(
    (key: CoachKey) => (previewMode ? false : effective.has(key)),
    [previewMode, effective],
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({ ready, isDismissed, dismiss, reset, previewMode, setPreviewMode, content }),
    [ready, isDismissed, dismiss, reset, previewMode, setPreviewMode, content],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
