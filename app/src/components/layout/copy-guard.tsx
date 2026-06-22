"use client";

import { useEffect } from "react";

/**
 * Deters casual copy-paste of lesson content across the member area.
 *
 * NOT a security boundary — JavaScript can be disabled and the HTML can still
 * be read from the source/devtools. The goal is to stop the easy vectors:
 * drag-select → Ctrl+C, right-click → Copy, mobile long-press → Copy, and
 * select-all / save-page shortcuts.
 *
 * Form fields (search, checkout, notes) stay fully usable: any event that
 * originates inside an input/textarea/select/contenteditable is left alone,
 * mirroring the CSS exemption in globals.css (`.no-copy` block).
 */
export function CopyGuard() {
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.closest !== "function") return false;
      return !!el.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
      );
    };

    const block = (e: Event) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (!e.ctrlKey && !e.metaKey) return;
      // c = copy, x = cut, a = select-all, s = save-page
      if (["c", "x", "a", "s"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };

    // Block native image drag (drag-to-desktop saves the file). Right-click
    // "Save image as" is already covered by the contextmenu blocker above.
    const onDragStart = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement) e.preventDefault();
    };

    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  return null;
}
