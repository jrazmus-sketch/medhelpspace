"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { GraduationCap, ChevronRight, X, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDY_TYPE_CONFIG, type StudyTypeKey } from "@/lib/page-type";
import { ESTUDAR_GROUPS, ESTUDAR_NAV_OVERRIDES, isTypeActive } from "@/lib/estudar-nav";

/**
 * Mobile bottom-nav "Estudar" entry: a cell that opens a bottom sheet listing
 * the six content types (grouped Praticar / Ler / Ouvir). Mirrors the desktop
 * "Estudar" dropdown using the same shared ESTUDAR_GROUPS data. Mobile-only —
 * it lives inside MobileNav, which is shown below `lg`.
 */
export function MobileEstudarSheet({ currentType }: { currentType: StudyTypeKey | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = currentType != null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-[3px] outline-none transition-colors",
          active ? "text-brand" : "text-muted-foreground",
        )}
      >
        <GraduationCap size={19} strokeWidth={active ? 2 : 1.6} />
        <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 400, letterSpacing: ".03em" }}>
          Estudar
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[55] bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-[60] max-h-[82vh] overflow-y-auto rounded-t-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none",
            "px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]",
            "transition-transform duration-250 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          )}
        >
          {/* Grab handle */}
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />

          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="text-[15px] font-semibold tracking-tight text-foreground">
              Estudar
            </Dialog.Title>
            <Dialog.Close
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={18} />
            </Dialog.Close>
          </div>

          {ESTUDAR_GROUPS.map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </div>
              <div className="flex flex-col">
                {group.keys.map((key) => {
                  const cfg = STUDY_TYPE_CONFIG[key];
                  const ov = ESTUDAR_NAV_OVERRIDES[key];
                  const itemActive = isTypeActive(key, currentType);
                  return (
                    <button
                      key={key}
                      onClick={() => go(cfg.hubHref!)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors active:bg-accent"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                        style={{
                          background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
                          color: cfg.color,
                        }}
                      >
                        <cfg.Icon size={18} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight text-foreground">
                          {ov?.label ?? cfg.label}
                          {itemActive && (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: cfg.color }}
                            />
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                          {ov?.desc ?? cfg.desc}
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Replayable walkthrough — always one tap away */}
          <button
            onClick={() => go("/app/comecar")}
            className="mt-4 flex w-full items-center gap-3 rounded-lg border border-border px-2 py-2.5 text-left transition-colors active:bg-accent"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Compass size={18} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight text-foreground">
                Comece por aqui
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                Como usar a plataforma
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
