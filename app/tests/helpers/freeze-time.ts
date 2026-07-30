/**
 * Freezes the clock for the duration of a call.
 *
 * The study-plan engine reads "now" internally (`todayKeyBR()` takes no
 * argument), so the only way to test the 21:00-BRT rollover — the boundary that
 * caused the planner's date defects — is to pin the global Date.
 *
 * A Proxy is used rather than a subclass so both `new Date()` and `Date.now()`
 * are covered without fighting Date's overload signatures.
 */
export function withFrozenTime<T>(iso: string, fn: () => T): T {
  const Real = globalThis.Date;
  const fixed = new Real(iso).getTime();

  const Frozen = new Proxy(Real, {
    construct(target, args) {
      return args.length === 0
        ? new target(fixed)
        : Reflect.construct(target, args);
    },
    get(target, prop, receiver) {
      if (prop === "now") return () => fixed;
      return Reflect.get(target, prop, receiver);
    },
  }) as DateConstructor;

  globalThis.Date = Frozen;
  try {
    return fn();
  } finally {
    globalThis.Date = Real;
  }
}

/** 2026-07-28 is a Tuesday in Brazil. 10:00 BRT — UTC and BR agree on the date. */
export const MORNING_BRT = "2026-07-28T13:00:00Z";

/**
 * 22:00 BRT on that same Tuesday — but 01:00 UTC on WEDNESDAY the 29th.
 * Every regression in this suite lives in this three-hour window.
 */
export const EVENING_BRT = "2026-07-29T01:00:00Z";
