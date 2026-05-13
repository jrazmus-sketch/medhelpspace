"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { User as AuthUser, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA, MOCK_USER, MOCK_USER_WITH_COHORT } from "@/lib/mock-data";
import i18n from "@/lib/i18n";
import type { User as Profile } from "@/types/supabase";

// ── Context types ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Supabase auth.users record — null when signed out */
  user: AuthUser | null;
  /** profiles table row — null when signed out or still loading */
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** super_admin only */
  isSuperAdmin: () => boolean;
  /** super_admin OR content_admin */
  isContentAdmin: () => boolean;
  /** super_admin OR support_admin */
  isSupportAdmin: () => boolean;
  /** super_admin OR billing_admin */
  isBillingAdmin: () => boolean;
  /** any non-member role */
  isAnyAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!USE_MOCK_DATA);
  const { setTheme } = useTheme();

  const applyProfileSideEffects = useCallback(
    (p: Profile) => {
      // Restore user's theme preference
      if (p.theme_preference) setTheme(p.theme_preference);
      // Restore admin locale (member site ignores this)
      if (p.admin_locale) i18n.changeLanguage(p.admin_locale);
    },
    [setTheme],
  );

  useEffect(() => {
    // ── Mock mode: return static profile immediately ─────────────────────────
    if (USE_MOCK_DATA) {
      setProfile(MOCK_USER_WITH_COHORT);
      applyProfileSideEffects(MOCK_USER_WITH_COHORT);
      return;
    }

    // ── Real Supabase auth ───────────────────────────────────────────────────
    const supabase = createClient();

    async function fetchProfile(_uid: string): Promise<Profile | null> {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        if (p) applyProfileSideEffects(p);
      }
      setLoading(false);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        if (p) applyProfileSideEffects(p);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [applyProfileSideEffects]);

  const signOut = useCallback(async () => {
    if (USE_MOCK_DATA) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const role = profile?.role ?? "member";

  const isSuperAdmin = useCallback(() => role === "super_admin", [role]);
  const isContentAdmin = useCallback(
    () => role === "super_admin" || role === "content_admin",
    [role],
  );
  const isSupportAdmin = useCallback(
    () => role === "super_admin" || role === "support_admin",
    [role],
  );
  const isBillingAdmin = useCallback(
    () => role === "super_admin" || role === "billing_admin",
    [role],
  );
  const isAnyAdmin = useCallback(
    () => role !== "member",
    [role],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signOut,
        isSuperAdmin,
        isContentAdmin,
        isSupportAdmin,
        isBillingAdmin,
        isAnyAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
