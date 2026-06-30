"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isThemeUnlockedPath } from "@/lib/theme-scope";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  /** true on public pages where the theme is forced to dark and the toggle is hidden */
  locked: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  locked: true,
});

const STORAGE_KEY = "mhs-theme";

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function systemPref(): "light" | "dark" {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {}
  return "dark";
}

function resolve(t: Theme): "light" | "dark" {
  return t === "system" ? systemPref() : t;
}

function applyClass(r: "light" | "dark") {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(r);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Public pages are locked to dark; only /app and /admin honor the preference.
  const locked = !isThemeUnlockedPath(pathname);

  // Lazy-init from storage so the first client render already has the user's
  // preference (no SSR localStorage → falls back to "system" on the server, which
  // is fine: the provider renders no theme-dependent DOM, the class lives on <html>).
  const [theme, setThemeState] = useState<Theme>(() => readStored());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  // Apply the resolved theme to <html> whenever the route's lock state or the
  // preference changes. Forces dark on public pages, resolves the preference on
  // product pages. Runs on client-side navigation too — the pre-hydration script
  // in /public/theme-init.js only covers the initial/hard load.
  useEffect(() => {
    const r = locked ? "dark" : resolve(theme);
    applyClass(r);
    // Mirror the applied value into context for consumers (sonner, etc.); this
    // effect's purpose is the external <html> class sync, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedTheme(r);
  }, [locked, theme]);

  // Track OS preference changes — only relevant on product pages set to "system".
  useEffect(() => {
    if (locked || theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = systemPref();
      setResolvedTheme(r);
      applyClass(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [locked, theme]);

  // Persist the user's preference. On locked pages the apply effect still forces
  // dark, but the choice is kept so it's restored on return to /app or /admin.
  const setTheme = useCallback((next: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, locked }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
