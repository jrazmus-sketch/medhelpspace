"use client";

import { MousePointerClick } from "lucide-react";
import { useEditMode } from "@/providers/edit-mode-provider";
import { cn } from "@/lib/utils";

// Floating "Edição rápida" toggle for the landing page. The admin bar (with the
// usual toggle) only renders inside /app, so without this an admin would have no
// way to turn inline editing on while viewing "/". Self-contained and fixed-
// positioned to avoid entangling with the fixed LandingNav. Admin + desktop only
// (inline edit mode is disabled on mobile by design).
export function LandingEditToggle() {
  const { editMode, toggle, isAdmin, isMobile, pending } = useEditMode();
  if (!isAdmin || isMobile) return null;

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
