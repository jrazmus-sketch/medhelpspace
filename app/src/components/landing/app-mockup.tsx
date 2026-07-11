// SCREENSHOT PLACEHOLDER SYSTEM
// Each <AppMockup variant="..." /> renders a CSS-only mockup of the real app UI.
// When real screenshots are ready, replace the entire <AppMockup> element with:
//
//   <Image
//     src={`/screenshots/${variant}.png`}
//     alt={altText}
//     width={1200}
//     height={720}
//     className="w-full rounded-b-xl"
//   />
//
// Screenshot guide (take at 1280px viewport width, prefer dark mode):
//   dashboard  →  /app/                              (specialty grid + cohort banner)
//   questoes   →  /app/cardiologia/objetivas-comentadas/<any-quiz>  (mid-quiz, one answered)
//   resumos    →  /app/cardiologia/resumos/<any-lesson>              (lesson open, sidebar visible)
//   medvoice   →  /app/medvoice/<any-page>           (audio playing, transcript visible)
//   formula    →  /app/cardiologia/formula            (formula cards grid)
//   audiocards →  /app/audiocards/<any-page>          (card flipped showing answer)

export type MockupVariant =
  | "dashboard"
  | "questoes"
  | "resumos"
  | "medvoice"
  | "formula"
  | "audiocards";

interface AppMockupProps {
  variant: MockupVariant;
  className?: string;
}

export function AppMockup({ variant, className = "" }: AppMockupProps) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border shadow-xl ${className}`}>
      {/* Browser chrome */}
      <div className="lp-browser-chrome">
        <div className="lp-browser-dot bg-[#ff5f57]" />
        <div className="lp-browser-dot bg-[#febc2e]" />
        <div className="lp-browser-dot bg-[#28c840]" />
        <div className="lp-browser-url">
          <div className="h-2 w-2 rounded-full bg-brand/40 flex-shrink-0" />
          <div className="h-1.5 w-28 rounded-full bg-foreground/15" />
        </div>
      </div>
      {/* Content */}
      <div className="lp-mockup-shell">
        {variant === "dashboard" && <DashboardMockup />}
        {variant === "questoes" && <QuestoesMockup />}
        {variant === "resumos" && <ResumosMockup />}
        {variant === "medvoice" && <MedVoiceMockup />}
        {variant === "formula" && <FormulaMockup />}
        {variant === "audiocards" && <AudiocardsMockup />}
      </div>
    </div>
  );
}

/* ── Individual mockup variants ─────────────────────────────────────────────── */

function DashboardMockup() {
  const specialties = [
    { name: "Cardiologia", color: "var(--c-spec-1)" },
    { name: "Pneumologia", color: "var(--c-spec-2)" },
    { name: "Reumatologia", color: "var(--c-spec-3)" },
    { name: "Clínica Médica", color: "var(--c-spec-4)" },
    { name: "Gastroenterologia", color: "var(--c-spec-5)" },
    { name: "Neurologia", color: "var(--c-spec-6)" },
    { name: "Obstetrícia", color: "var(--c-spec-7)" },
    { name: "Ginecologia", color: "var(--c-spec-8)" },
    { name: "Pediatria", color: "var(--c-spec-9)" },
    { name: "Infectologia", color: "var(--c-spec-10)" },
    { name: "Nefrologia", color: "var(--c-spec-11)" },
    { name: "Dermatologia", color: "var(--c-spec-12)" },
  ];
  return (
    <div className="flex" style={{ height: 280 }}>
      {/* Sidebar */}
      <div className="lp-mockup-sidebar w-36 flex-shrink-0 p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-brand/30" />
          <div className="h-2 w-16 rounded-full bg-foreground/20" />
        </div>
        {["Dashboard", "MedVoice", "Audiocards", "Flashcards"].map((item, i) => (
          <div
            key={item}
            className="mb-1 rounded-md px-2 py-1.5 text-[9px] font-medium"
            style={{
              background: i === 0 ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "transparent",
              color: i === 0 ? "var(--brand)" : "var(--foreground)",
              opacity: i === 0 ? 1 : 0.45,
            }}
          >
            {item}
          </div>
        ))}
        <div className="mt-3 border-t border-border pt-3">
          {["Guia de Estudos", "Configurações"].map((item) => (
            <div key={item} className="mb-1 rounded-md px-2 py-1.5 text-[9px] text-foreground/35">{item}</div>
          ))}
        </div>
      </div>
      {/* Main */}
      <div className="lp-mockup-main flex-1 overflow-hidden p-4">
        {/* Cohort badge */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="h-2 w-24 rounded-full bg-foreground/20 mb-1" />
            <div className="h-1.5 w-32 rounded-full bg-foreground/10" />
          </div>
          <div className="rounded-full bg-brand/10 px-2 py-1 text-[8px] font-bold text-brand">
            Revalida 2027.1
          </div>
        </div>
        {/* Specialty grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {specialties.map((s) => (
            <div
              key={s.name}
              className="rounded-lg border border-border p-2"
              style={{ background: "var(--surface-1)" }}
            >
              <div
                className="mb-1 h-2 w-2 rounded-sm"
                style={{ background: s.color }}
              />
              <div className="text-[7px] font-semibold leading-tight text-foreground/70 line-clamp-2">
                {s.name}
              </div>
            </div>
          ))}
        </div>
        {/* 60D locked bar */}
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2">
          <div className="text-[10px]">🔒</div>
          <div className="flex-1">
            <div className="text-[8px] font-bold text-brand">MedHelp 60D</div>
            <div className="text-[7px] text-foreground/45">Libera em 127 dias</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestoesMockup() {
  return (
    <div style={{ height: 280 }} className="p-5">
      {/* Progress */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[9px] font-semibold text-foreground/50">Questão 3 de 12</div>
        <div className="flex gap-1">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  i < 2
                    ? "var(--c-success)"
                    : i === 2
                    ? "var(--brand)"
                    : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>
      {/* Question text */}
      <div className="mb-3 rounded-lg border border-border bg-surface-1 p-3">
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-foreground/15" />
          <div className="h-1.5 w-5/6 rounded-full bg-foreground/15" />
          <div className="h-1.5 w-4/5 rounded-full bg-foreground/10" />
          <div className="h-1.5 w-3/4 rounded-full bg-foreground/10" />
        </div>
      </div>
      {/* Answer options */}
      <div className="space-y-1.5">
        {[
          { label: "A", text: "Dissecção aórtica", correct: false, selected: false },
          { label: "B", text: "Infarto agudo do miocárdio", correct: true, selected: true },
          { label: "C", text: "Tromboembolismo pulmonar", correct: false, selected: false },
          { label: "D", text: "Pericardite aguda", correct: false, selected: false },
        ].map((opt) => (
          <div
            key={opt.label}
            className="flex items-center gap-2 rounded-lg border px-3 py-2"
            style={{
              borderColor: opt.selected
                ? "var(--c-success)"
                : "var(--border)",
              background: opt.selected
                ? "color-mix(in srgb, var(--c-success) 10%, transparent)"
                : "var(--surface-1)",
            }}
          >
            <div
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
              style={{
                background: opt.selected ? "var(--c-success)" : "var(--border)",
                color: opt.selected ? "white" : "var(--foreground)",
              }}
            >
              {opt.selected ? "✓" : opt.label}
            </div>
            <div className="text-[9px] font-medium" style={{ color: opt.selected ? "var(--c-success)" : "var(--foreground)", opacity: opt.selected ? 1 : 0.65 }}>
              {opt.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumosMockup() {
  const sections = ["Introdução", "Diagnóstico", "Tratamento", "Conduta", "Seguimento"];
  return (
    <div className="flex" style={{ height: 280 }}>
      {/* Section sidebar */}
      <div className="lp-mockup-sidebar w-28 flex-shrink-0 p-3">
        <div className="mb-2 text-[8px] font-bold uppercase tracking-widest text-foreground/30">Seções</div>
        {sections.map((s, i) => (
          <div
            key={s}
            className="mb-1 flex items-center gap-1.5 rounded-md px-2 py-1.5"
            style={{
              background: i === 2 ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent",
            }}
          >
            <div
              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
              style={{ background: i === 2 ? "var(--brand)" : "var(--foreground)", opacity: i === 2 ? 1 : 0.2 }}
            />
            <div
              className="text-[8px] font-medium"
              style={{ color: i === 2 ? "var(--brand)" : "var(--foreground)", opacity: i === 2 ? 1 : 0.45 }}
            >
              {s}
            </div>
          </div>
        ))}
      </div>
      {/* Content */}
      <div className="lp-mockup-main flex-1 p-4">
        <div
          className="mb-2 text-[11px] font-bold"
          style={{ color: "var(--brand)", fontFamily: "var(--font-bricolage)" }}
        >
          Insuficiência Cardíaca — Tratamento
        </div>
        <div className="space-y-1 mb-3">
          {[1, 0.8, 0.9, 0.7, 0.85].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-foreground/15" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
        {/* Lesson toggle open */}
        <div className="rounded-lg border border-brand/30 bg-brand/5">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-[9px] font-bold text-brand">Diuréticos de alça</div>
            <div className="text-[10px] text-brand">▲</div>
          </div>
          <div className="px-3 pb-3 space-y-1">
            {[1, 0.85, 0.75, 0.9].map((w, i) => (
              <div key={i} className="h-1.5 rounded-full bg-foreground/12" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
        </div>
        {/* Collapsed toggle */}
        <div className="mt-1.5 rounded-lg border border-border px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-medium text-foreground/50">IECA / BRA</div>
            <div className="text-[10px] text-foreground/30">▼</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MedVoiceMockup() {
  return (
    <div style={{ height: 280 }} className="p-5">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="rounded-md px-2 py-0.5 text-[8px] font-bold"
          style={{ background: "var(--c-medvoice)", color: "white" }}
        >
          MedVoice
        </div>
        <div className="text-[9px] font-semibold text-foreground/60">Cardiologia · Aula 4/19</div>
      </div>
      {/* Audio card */}
      <div
        className="mb-3 rounded-xl border border-border p-4"
        style={{ background: "var(--surface-1)" }}
      >
        <div className="mb-2 text-[11px] font-bold text-foreground">
          Insuficiência Cardíaca Aguda
        </div>
        <div className="mb-3 flex items-end gap-0.5 h-8">
          {Array.from({ length: 32 }, (_, i) => {
            const h = [40, 70, 55, 90, 60, 80, 45, 95, 50, 75, 30, 85, 65, 40, 70, 55, 90, 60, 80, 45, 70, 55, 30, 50, 40, 60, 75, 35, 65, 80, 45, 55][i];
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${h}%`,
                  background: i < 18
                    ? "var(--c-medvoice)"
                    : "color-mix(in srgb, var(--foreground) 20%, transparent)",
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[8px] text-foreground/40">
          <span>2:34</span>
          <span>4:18</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full" style={{ width: "60%", background: "var(--c-medvoice)" }} />
        </div>
      </div>
      {/* Transcript preview */}
      <div>
        <div className="mb-1.5 text-[8px] font-bold uppercase tracking-widest text-foreground/30">Transcrição</div>
        <div className="space-y-1">
          {[1, 0.9, 0.8, 0.85].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-foreground/12" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-3 py-2">
          <span className="text-[8px] font-bold" style={{ color: "var(--c-medvoice)" }}>✦</span>
          <div className="text-[8px] font-semibold text-foreground/65">
            Grito da prova: edema agudo de pulmão → furosemida IV
          </div>
        </div>
      </div>
    </div>
  );
}

function FormulaMockup() {
  const cards = [
    { title: "IAM sem supra", tag: "Cardiologia", tip: "DAPT obrigatório ≥12m", color: "var(--c-questoes)" },
    { title: "HAS: alvo ideal", tag: "Clínica Médica", tip: "< 130/80 mmHg", color: "var(--c-resumos)" },
    { title: "AVE isquêmico", tag: "Neurologia", tip: "tPA: janela 4,5h", color: "var(--c-medvoice)" },
    { title: "DM2: 1ª linha", tag: "Endocrinologia", tip: "Metformina sempre", color: "var(--c-formula)" },
  ];
  return (
    <div style={{ height: 280 }} className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-bold text-foreground" style={{ fontFamily: "var(--font-bricolage)" }}>
          Fórmula MedHelp
        </div>
        <div className="rounded-full bg-brand/10 px-2 py-0.5 text-[8px] font-bold text-brand">
          48 atalhos
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-border p-3 relative overflow-hidden"
            style={{ background: "var(--surface-1)" }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
              style={{ background: card.color }}
            />
            <div className="pl-2">
              <div
                className="mb-0.5 text-[7px] font-bold uppercase tracking-widest"
                style={{ color: card.color }}
              >
                {card.tag}
              </div>
              <div className="mb-1.5 text-[9px] font-bold text-foreground leading-tight">
                {card.title}
              </div>
              <div
                className="inline-block rounded-md px-1.5 py-0.5 text-[8px] font-semibold"
                style={{
                  background: `color-mix(in srgb, ${card.color} 12%, transparent)`,
                  color: card.color,
                }}
              >
                {card.tip}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-foreground/3 px-3 py-2">
        <div className="text-[9px] font-bold text-brand">💡</div>
        <div className="text-[8px] text-foreground/55">Mnemônico: MONA — Morfina, O₂, Nitrato, AAS</div>
      </div>
    </div>
  );
}

function AudiocardsMockup() {
  return (
    <div style={{ height: 280 }} className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[9px] font-semibold text-foreground/50">Audiocards · Cardiologia</div>
        <div className="text-[8px] text-foreground/35">Card 12 de 45</div>
      </div>
      {/* Card */}
      <div
        className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 p-5 text-center"
        style={{
          borderColor: "color-mix(in srgb, var(--c-audiocards) 30%, transparent)",
          background: "color-mix(in srgb, var(--c-audiocards) 5%, transparent)",
        }}
      >
        <div
          className="mb-2 rounded-full px-2 py-0.5 text-[7px] font-bold uppercase tracking-widest"
          style={{ background: "var(--c-audiocards)", color: "white" }}
        >
          Resposta
        </div>
        <div
          className="mb-3 text-[11px] font-bold leading-snug"
          style={{ color: "var(--c-audiocards)", fontFamily: "var(--font-bricolage)" }}
        >
          Critérios maiores de Framingham para IC
        </div>
        <div className="space-y-1 text-left w-full">
          {["DPN / Ortopneia", "B3 + distensão jugular", "Edema pulmonar agudo", "Refluxo hepatojugular"].map((item) => (
            <div key={item} className="flex items-center gap-2 text-[8px] text-foreground/65">
              <div className="h-1 w-1 rounded-full flex-shrink-0" style={{ background: "var(--c-audiocards)" }} />
              {item}
            </div>
          ))}
        </div>
      </div>
      {/* Audio bar */}
      <div className="mt-3">
        <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full" style={{ width: "35%", background: "var(--c-audiocards)" }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[8px] text-foreground/40">0:08 / 0:22</div>
          <div className="flex gap-4 text-[9px] font-semibold">
            <span className="text-foreground/40">← Anterior</span>
            <span style={{ color: "var(--c-audiocards)" }}>Próximo →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
