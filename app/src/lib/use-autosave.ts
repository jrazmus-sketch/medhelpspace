"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * A setting that changes on screen AT ONCE and saves itself in the background.
 *
 * Why (Meu Plano, 2026-09-23): the settings disabled every control while a server
 * action + full /app re-render ran (seconds), so clicks in that window were lost —
 * and the specialty chips started the save inside a state updater, which React
 * rejects ("Cannot call startTransition while rendering"), so they never saved.
 *
 * Rules: the control is never locked; quick changes are coalesced (one save after
 * `delay` ms of quiet); only one save runs at a time and the LATEST value is always
 * what ends up saved; a failure is reported, never swallowed.
 */
export function useAutosave<T>(
  initial: T,
  save: (value: T) => Promise<unknown>,
  delay = 500,
): { value: T; setValue: (next: T | ((prev: T) => T)) => void; status: SaveStatus } {
  const [value, setValueState] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const latest = useRef(initial);
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(async () => {
    if (inFlight.current) {
      again.current = true; // a newer value is waiting; the running save loops once more
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    try {
      do {
        again.current = false;
        await saveRef.current(latest.current);
      } while (again.current);
      setStatus("saved");
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const v = typeof next === "function" ? (next as (prev: T) => T)(latest.current) : next;
      latest.current = v;
      setValueState(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, delay);
    },
    [delay, flush],
  );

  // Leaving the page with a change still waiting: save it now rather than drop it.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [flush],
  );

  return { value, setValue, status };
}
