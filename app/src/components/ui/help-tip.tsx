"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";

interface HelpTipProps {
  /**
   * The hint content. Plain text, or rich nodes for longer explanations.
   * Member-facing callers pass hardcoded Portuguese; admin callers should
   * pass an i18n `t(...)` string (never hardcode admin strings).
   */
  children: React.ReactNode;
  /** Accessible label for the icon-only trigger (screen readers). */
  label?: string;
  /** Which side of the trigger the bubble opens on. */
  side?: "top" | "bottom" | "left" | "right";
  /** Extra classes for the trigger button (e.g. to tint the icon on a dark card). */
  className?: string;
  /** Extra classes for the popup bubble. */
  contentClassName?: string;
}

/**
 * A small "?" affordance that reveals an explanatory hint.
 *
 * Interaction is **tap/click to toggle** (Base UI Popover's native behaviour),
 * which works identically on touch and desktop — honouring the project's
 * mobile-first rule, where a hover-only tooltip would be invisible. Mouse
 * hover is layered on top as a desktop nicety only, gated on `pointerType`
 * so a tap never double-fires. The trigger carries a 44px hit area (via the
 * `before` pseudo-element) and a focus-visible ring for keyboard users.
 *
 * Styling uses the shared popover tokens (`bg-popover` / `popover-foreground`,
 * `ring-foreground/10`) so it themes for light + dark automatically.
 */
export function HelpTip({
  children,
  label = "Mais informações",
  side = "top",
  className,
  contentClassName,
}: HelpTipProps) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    // Small grace period so the pointer can travel from the trigger into the
    // bubble (which cancels the close) without it snapping shut.
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  const isMouse = (e: React.PointerEvent) => e.pointerType === "mouse";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        onPointerEnter={(e) => {
          if (isMouse(e)) {
            cancelClose();
            setOpen(true);
          }
        }}
        onPointerLeave={(e) => {
          if (isMouse(e)) scheduleClose();
        }}
        className={cn(
          "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-popup-open:bg-muted data-popup-open:text-foreground before:absolute before:-inset-2 before:content-['']",
          className,
        )}
      >
        <CircleHelp aria-hidden="true" className="size-[18px]" strokeWidth={2} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          sideOffset={8}
          align="center"
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <Popover.Popup
            onPointerEnter={cancelClose}
            onPointerLeave={(e) => {
              if (isMouse(e)) scheduleClose();
            }}
            className={cn(
              "z-50 max-w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-lg bg-popover px-3.5 py-2.5 text-[13px] leading-relaxed text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              contentClassName,
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
