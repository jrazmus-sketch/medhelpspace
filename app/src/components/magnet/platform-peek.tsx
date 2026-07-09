"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react";
import { useIsMounted } from "@/hooks/use-is-mounted";

// Compact "por dentro da plataforma" slider for the funnel (idea 2 showcase + idea 3
// folded in as an inline lightbox — NEVER navigate cold traffic away to the homepage).
// Reuses the real screenshots the marketing landing already ships, but styled with the
// FUNNEL's semantic tokens (surface / border / brand) so it sits natively inside the
// quiz + reward cards instead of the marketing --lp-* section chrome. Mounts:
//   • PlatformPeek                    — the slider itself, inline on the reward/offer screen.
//   • PlatformPeek showDeviceToggle   — adds a Computador/Celular toggle (flashcards reward);
//     leads are ~50/50 desktop/mobile, so each half sees its own device first and can switch.
//   • PlatformPeekModal               — a subtle trigger + overlay wrapping the slider, used
//                                       from the welcome step ("Ver o que tem dentro →").

// `card: true` = a 4:5 MemoreCard poster (not an app screenshot) → rendered
// contained + centred on the surface stage in both device modes, so it reads as a
// card rather than a cropped screen.
type Shot = { src: string; title: string; caption: string; card?: boolean };

// MemoreCards has no desktop/phone app screenshot — the product IS the visual card,
// so we show a real poster (contained) in both sets. Same object in both arrays.
const MEMORECARDS_SHOT: Shot = {
  src: "/landing/memorecards/card-3.webp",
  title: "MemoreCards",
  caption: "Mapas visuais de alta fixação — o padrão da prova numa imagem só.",
  card: true,
};

// Desktop screenshots (landscape 1731×1083) — the marketing landing's desktop set.
const DESKTOP_SHOTS: Shot[] = [
  {
    src: "/landing/desktop/painel.webp",
    title: "Seu painel de estudos",
    caption: "Contagem regressiva, plano do dia e todo o progresso em uma tela.",
  },
  {
    src: "/landing/desktop/questoes.webp",
    title: "Questões comentadas",
    caption: "Provas do Revalida com gabarito e o “pega” de cada questão.",
  },
  {
    src: "/landing/desktop/resumos.webp",
    title: "Resumos narrativos",
    caption: "A clínica contada como história — para fixar de verdade.",
  },
  MEMORECARDS_SHOT,
  {
    src: "/landing/desktop/medvoice.webp",
    title: "MedVoice — a clínica fala",
    caption: "Áudios por tema com transcrição, para estudar no seu ritmo.",
  },
  {
    src: "/landing/desktop/relatorio.webp",
    title: "Relatório de desempenho",
    caption: "Seus acertos, sua sequência e seus pontos fracos por área.",
  },
  {
    src: "/landing/desktop/especialidade.webp",
    title: "Tudo por especialidade",
    caption: "Questões, resumos, áudios e flashcards de cada área num lugar só.",
  },
];

// Portrait in-hand phone screenshots (1170×2532) — the /landing/shot-*.webp set the
// landing shows in system-showcase. Captions use the app's canonical product names.
const PHONE_SHOTS: Shot[] = [
  {
    src: "/landing/shot-questoes-ecg.webp",
    title: "Questões Revalida",
    caption: "Questões estilo INEP comentadas, alternativa por alternativa.",
  },
  {
    src: "/landing/shot-resumos.webp",
    title: "Resumos Narrativos",
    caption: "A clínica em cena — o que mais cai, contado como história.",
  },
  {
    src: "/landing/shot-medvoice.webp",
    title: "MedVoice",
    caption: "Áudios por tema com transcrição — a clínica fala.",
  },
  {
    src: "/landing/shot-flashcards.webp",
    title: "Flashcards",
    caption: "Revisão ativa com repetição espaçada.",
  },
  MEMORECARDS_SHOT,
  {
    src: "/landing/shot-audiocards.webp",
    title: "AudioCards",
    caption: "Os mesmos temas dos flashcards — agora no ouvido.",
  },
  {
    src: "/landing/shot-revalida-up.webp",
    title: "Revalida Up",
    caption: "Os padrões que mais caem, em recordação ativa.",
  },
];

type Device = "desktop" | "phone";

// Static phone-mockup of a MemoreCard — mirrors the front-page MemorecardsScreen look
// (a 4:5 card behind slim app chrome in a device frame) but non-interactive and using
// the funnel's semantic tokens, so it drops into the slider without nesting a carousel
// or pulling in landing (--lp-*) styles. Content = card-3 (system-showcase's MemoreCards
// hero). `h-full` makes it fill whichever stage (phone or desktop) it sits in.
function MemorecardMockup() {
  return (
    <div className="flex h-full aspect-[232/408] max-w-full flex-col overflow-hidden rounded-[22px] border border-border bg-surface-1 shadow-lg">
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-3">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-brand">
          Ginecologia
        </span>
        <span className="ml-auto rounded-full bg-brand-muted/60 px-1.5 py-0.5 text-[8px] font-bold text-brand">
          MemoreCard
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/memorecards/card-3.webp"
        alt="MemoreCard — HPV e Colo Uterino (Ginecologia)"
        width={640}
        height={800}
        draggable={false}
        loading="lazy"
        className="min-h-0 w-full flex-1 object-cover object-top"
      />
      <div className="flex items-start gap-1.5 border-t border-border px-3 py-2">
        <span className="mt-px text-[9px] text-brand" aria-hidden>
          ✦
        </span>
        <p className="text-[8px] leading-snug text-muted-foreground">
          <span className="font-bold text-foreground">Grito da prova: </span>
          HPV transitório é comum; persistência oncogênica = lesão precursora.
        </p>
      </div>
    </div>
  );
}

export function PlatformPeek({
  desktopShots = DESKTOP_SHOTS,
  phoneShots = PHONE_SHOTS,
  showDeviceToggle = false,
}: {
  desktopShots?: Shot[];
  phoneShots?: Shot[];
  // When set, renders a Computador/Celular toggle and swaps the shot set. Defaults
  // to the viewer's own device on mount. Off → desktop-only (unchanged behavior).
  showDeviceToggle?: boolean;
} = {}) {
  const hasToggle = showDeviceToggle && phoneShots.length > 0;
  const mounted = useIsMounted();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userChoice, setUserChoice] = useState<Device | null>(null);
  const [rawIdx, setIdx] = useState(0);

  // Auto-default to the viewer's own device: before mount both server and client
  // render desktop (no hydration mismatch); once mounted, matchMedia is read during
  // render (a plain read, not a subscription) so a mobile viewer flips to phone.
  // A user tap on the toggle (userChoice) wins over the auto default.
  const autoDevice: Device =
    hasToggle && mounted && window.matchMedia("(max-width: 767px)").matches
      ? "phone"
      : "desktop";
  const device: Device = hasToggle ? userChoice ?? autoDevice : "desktop";

  // Reset to the first slide when the device (and thus the shot set) changes — the
  // adjust-state-during-render pattern, not an effect. The scroll container is keyed
  // by `device` too, so it remounts at scrollLeft 0.
  const [prevDevice, setPrevDevice] = useState(device);
  if (device !== prevDevice) {
    setPrevDevice(device);
    setIdx(0);
  }

  const shots = hasToggle && device === "phone" ? phoneShots : desktopShots;
  const total = shots.length;
  const idx = Math.min(rawIdx, Math.max(0, total - 1));
  const isPhone = hasToggle && device === "phone";

  const goTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [total],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(total - 1, i));
    setIdx((prev) => (prev === clamped ? prev : clamped));
  }, [total]);

  const active = shots[idx] ?? shots[0];

  return (
    <div>
      {hasToggle && (
        <div className="mb-4 flex justify-center">
          <div
            role="tablist"
            aria-label="Escolha o dispositivo"
            className="inline-flex rounded-full border border-border bg-surface-2 p-1"
          >
            {([
              ["desktop", "Computador", Monitor],
              ["phone", "Celular", Smartphone],
            ] as const).map(([key, label, Icon]) => {
              const activeTab = device === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab}
                  onClick={() => setUserChoice(key)}
                  className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
                    activeTab
                      ? "bg-brand text-brand-fg"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <div
          key={device}
          ref={scrollRef}
          onScroll={onScroll}
          tabIndex={0}
          role="group"
          aria-roledescription="carrossel"
          aria-label="Telas do MedHelpSpace — deslize para navegar"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              goTo(idx + 1);
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goTo(idx - 1);
            }
          }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-border outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-scrollbar]:hidden"
        >
          {shots.map((shot) =>
            isPhone ? (
              // Portrait screenshot (or the MemoreCard mockup) centred on a fixed-height
              // surface stage → same size for every phone slide (no jitter).
              <div
                key={shot.src}
                className="flex h-[440px] w-full flex-shrink-0 snap-center items-center justify-center bg-surface-2 p-4 sm:h-[500px]"
              >
                {shot.card ? (
                  <MemorecardMockup />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot.src}
                    alt={`MedHelpSpace no celular — ${shot.title}`}
                    width={1170}
                    height={2532}
                    draggable={false}
                    loading="lazy"
                    className="h-full w-auto rounded-[22px] border border-border object-contain shadow-lg"
                  />
                )}
              </div>
            ) : (
              // Desktop landscape stage. Screenshots fill it (cover); the MemoreCard (a
              // 4:5 poster) shows contained + centred on the surface. We use the poster
              // img here (not the flex mockup) because the mockup's `h-full` can't resolve
              // against the aspect-ratio stage — an img (replaced element) can.
              <div
                key={shot.src}
                className={`flex w-full flex-shrink-0 snap-center items-center justify-center bg-surface-2 ${shot.card ? "p-4" : ""}`}
                style={{ aspectRatio: "1731 / 1083" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.src}
                  alt={shot.card ? `MemoreCard — ${shot.title}` : `MedHelpSpace — ${shot.title}`}
                  width={shot.card ? 640 : 1731}
                  height={shot.card ? 800 : 1083}
                  draggable={false}
                  loading="lazy"
                  className={
                    shot.card
                      ? "h-full w-auto rounded-xl border border-border object-contain shadow-lg"
                      : "h-full w-full object-cover object-top"
                  }
                />
              </div>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => goTo(idx - 1)}
          disabled={idx === 0}
          aria-label="Tela anterior"
          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goTo(idx + 1)}
          disabled={idx === total - 1}
          aria-label="Próxima tela"
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Caption — fixed min-height avoids layout shift between slides. */}
      <div className="mt-3 flex min-h-[52px] flex-col items-center text-center">
        <div className="text-sm font-bold tracking-tight text-foreground">{active.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{active.caption}</div>
      </div>

      {/* Position dots */}
      <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden>
        {shots.map((shot, i) => (
          <span
            key={shot.src}
            className="h-1.5 rounded-full bg-brand transition-all duration-300"
            style={{ width: i === idx ? 18 : 6, opacity: i === idx ? 1 : 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

// Trigger + overlay wrapper for the welcome step. Keeps the visitor ON the funnel
// (idea 3 done safely): the lightbox opens over the quiz and closes right back to it.
export function PlatformPeekModal({
  label = "Ver o que tem dentro →",
  showDeviceToggle = false,
}: {
  label?: string;
  showDeviceToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-brand underline-offset-2 hover:underline"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Por dentro da plataforma"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface-1 p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Por dentro da plataforma
                </p>
                <h2 className="mt-0.5 text-base font-bold tracking-tight">
                  O que você recebe ao continuar
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            <PlatformPeek showDeviceToggle={showDeviceToggle} />

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Voltar ao simulado →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
