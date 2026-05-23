"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { setEditMode } from "@/actions/edit-mode";
import { useAuth } from "./auth-provider";

interface EditModeContextValue {
  /** Cookie-persisted preference; true even when toggled off-screen (mobile) */
  editMode: boolean;
  /** Combined: cookie on, current user is admin, viewport ≥ 768px */
  active: boolean;
  isAdmin: boolean;
  isMobile: boolean;
  toggle: () => void;
  pending: boolean;
}

const Ctx = createContext<EditModeContextValue | undefined>(undefined);

export function EditModeProvider({
  children,
  initialEnabled,
}: {
  children: ReactNode;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const { isAnyAdmin } = useAuth();
  // Optimistic override during the brief window between user click and cookie
  // round-trip. Null = no override, defer to the server-rendered cookie.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const editMode = optimistic ?? initialEnabled;

  const toggle = useCallback(() => {
    const next = !editMode;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await setEditMode(next);
        router.refresh();
      } finally {
        // Drop the override once the server-rendered cookie reflects reality
        setOptimistic(null);
      }
    });
  }, [editMode, router]);

  const isAdmin = isAnyAdmin();
  const active = editMode && isAdmin && !isMobile;

  return (
    <Ctx.Provider value={{ editMode, active, isAdmin, isMobile, toggle, pending }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEditMode must be inside EditModeProvider");
  return ctx;
}
