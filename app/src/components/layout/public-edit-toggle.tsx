"use client";

import { usePathname } from "next/navigation";
import { MousePointerClick } from "lucide-react";
import { useEditMode } from "@/providers/edit-mode-provider";
import { cn } from "@/lib/utils";

// Floating "Edição rápida" toggle for the public site. Rendered once in the root
// layout so an admin can turn inline editing on while viewing ANY public page
// (landing, /loja, /privacidade, /termos, auth pages…). Inside /app the admin bar
// already carries this control, and /admin is the panel itself — so we suppress it
// on those trees to avoid a duplicate. Admin + desktop only (inline edit is
// disabled on mobile by design). Self-contained and fixed-positioned to avoid
// entangling with the fixed LandingNav.
export function PublicEditToggle() {
  const pathname = usePathname();
  const { editMode, toggle, isAdmin, isMobile, pending } = useEditMode();

  if (!isAdmin || isMobile) return null;
  // /app → admin bar has its own toggle; /admin → admin panel, no public editing.
  if (pathname?.startsWith("/app") || pathname?.startsWith("/admin")) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        editMode
          ? "Desativar edição rápida"
          : "Ativar edição rápida (clique em qualquer texto para editar)"
      }
      className={cn(
        "fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition-colors disabled:opacity-60",
        editMode
          ? "bg-brand text-brand-fg hover:opacity-90"
          : "border border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      <MousePointerClick className="h-4 w-4" />
      {editMode ? "Edição rápida ativa" : "Editar página"}
    </button>
  );
}
