// dashboard-shared.jsx — icons, data, primitives shared by both variations

// ──────────────────────────────────────────────────────────
// Icons (stroke-based, minimal, 20×20 by default)
// ──────────────────────────────────────────────────────────
const Icon = ({ d, size = 20, fill = "none", stroke = "currentColor", sw = 1.6, children, vb = "0 0 24 24", style }) => (
  <svg width={size} height={size} viewBox={vb} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

const IcHome = (p) => <Icon {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h5v-5h4v5h5v-9.5" /></Icon>;
const IcQuestion = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7V14"/><circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none"/></Icon>;
const IcBook = (p) => <Icon {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M8 7h7M8 11h7"/></Icon>;
const IcMic = (p) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></Icon>;
const IcSigma = (p) => <Icon {...p}><path d="M17 5H7l5 7-5 7h10"/></Icon>;
const IcHeadphones = (p) => <Icon {...p}><path d="M4 14v-2a8 8 0 1 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></Icon>;
const IcLock = (p) => <Icon {...p}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Icon>;
const IcCalendar = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></Icon>;
const IcFlame = (p) => <Icon {...p}><path d="M12 21c4 0 7-2.8 7-7 0-3-2-5-3-6 .2 2-1 3-2 3 0-3-2-6-5-8 .5 4-3 5-3 9 0 5 3 9 6 9Z"/></Icon>;
const IcSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>;
const IcBell = (p) => <Icon {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/></Icon>;
const IcSettings = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></Icon>;
const IcChevR = (p) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>;
const IcPlay = (p) => <Icon {...p}><path d="M8 5v14l11-7L8 5Z" fill="currentColor" stroke="none"/></Icon>;
const IcLayers = (p) => <Icon {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></Icon>;
const IcCheck = (p) => <Icon {...p}><path d="m5 12 5 5 9-11"/></Icon>;
const IcArrowUp = (p) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7"/></Icon>;
const IcMoon = (p) => <Icon {...p}><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/></Icon>;

// ──────────────────────────────────────────────────────────
// Data
// ──────────────────────────────────────────────────────────
const MEMBER = {
  firstName: "Karina",
  plan: "Revalida 2027.1",
  examLabel: "Revalida 2027.1",
  examDate: new Date("2027-03-23T00:00:00"), // ~310d from May 12 2026
  studyDays: 29,
  streak: 12,
};

const TRACKS = [
  {
    id: "questoes", name: "Estudo por Questões", sub: "Padrão INEP",
    desc: "Banco com correção comentada por especialidade.",
    Icon: IcQuestion, progress: 0.42, items: "2.860 questões",
  },
  {
    id: "resumos", name: "Resumos Narrativos", sub: "Clínica em Cena",
    desc: "Resumos no formato de caso clínico.",
    Icon: IcBook, progress: 0.28, items: "112 resumos",
  },
  {
    id: "medvoice", name: "MedVoice", sub: "A Clínica Fala",
    desc: "Aulas em áudio por especialidade.",
    Icon: IcMic, progress: 0.67, items: "94 aulas",
  },
  {
    id: "formula", name: "Fórmula MedHelp", sub: "Decisão Treinada",
    desc: "Método estruturado de raciocínio clínico.",
    Icon: IcSigma, progress: 0.18, items: "8 módulos",
  },
  {
    id: "audiocards", name: "AudioCards", sub: "Revisão que fala com você",
    desc: "Flashcards narrados para fixação.",
    Icon: IcHeadphones, progress: 0.55, items: "1.420 cards",
  },
  {
    id: "medhelp60", name: "MedHelp 60D", sub: "Sprint final",
    desc: "Liberado 60 dias antes da prova.",
    Icon: IcLock, locked: true, unlockIn: 250, items: "Bloqueado",
  },
];

const RESUME_PRIMARY = {
  trackId: "medvoice",
  trackName: "MedVoice",
  chapter: "Cardiologia · Aula 12",
  title: "Síndromes Coronarianas Agudas — Parte II",
  progress: 0.67,
  remaining: "14 min restantes",
  lastAt: "há 2 horas",
};

const RESUME_LIST = [
  RESUME_PRIMARY,
  {
    trackId: "questoes", trackName: "Estudo por Questões",
    chapter: "Pediatria · Bloco 8", title: "Doenças exantemáticas",
    progress: 0.43, remaining: "23 questões restantes", lastAt: "ontem",
  },
  {
    trackId: "resumos", trackName: "Resumos Narrativos",
    chapter: "Ginecologia · Capítulo 4", title: "SOP e infertilidade",
    progress: 0.12, remaining: "Cap. recém-iniciado", lastAt: "há 3 dias",
  },
];

const STATS = {
  questoes: { value: 1247, accuracy: 0.78, deltaWeek: +94 },
  topics:   { mastered: 34, total: 62 },
  audio:    { hours: 18, minutes: 42, deltaWeek: +3.2 }, // hours delta
  weekly:   { done: 4, goal: 5, daily: [55, 70, 40, 92, 65, 0, 0], todayIndex: 4 }, // Mon..Sun
};

const ACTIVITY = [
  { ico: <IcQuestion size={16}/>, t: "Concluído: bloco de Cardiologia (24 questões)", s: "82% de acerto · MedHelp INEP", time: "agora" },
  { ico: <IcHeadphones size={16}/>, t: "AudioCard revisado: Insuficiência Cardíaca", s: "12 cards · 18 min", time: "há 2h" },
  { ico: <IcMic size={16}/>, t: "Aula MedVoice iniciada: SCA — Parte II", s: "67% concluída", time: "há 2h" },
  { ico: <IcBook size={16}/>, t: "Resumo lido: Pneumonia adquirida na comunidade", s: "Clínica em Cena · Cap. 2", time: "ontem" },
];

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
function daysUntil(date){
  const now = new Date("2026-05-12T00:00:00");
  return Math.max(0, Math.round((date - now) / 86400000));
}
function fmtDate(d){
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtPct(n){ return Math.round(n * 100) + "%"; }
function fmtBr(n){ return n.toLocaleString("pt-BR"); }

// ──────────────────────────────────────────────────────────
// Reusable mini components
// ──────────────────────────────────────────────────────────
function ProgressRing({ value, size = 96, sw = 8, color }) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * value;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={sw}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color || "var(--accent)"} strokeWidth={sw}
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 8px var(--accent-ring))" }}/>
    </svg>
  );
}

function TrackIcon({ Icon: Cmp, locked }) {
  return (
    <div className="track-ico" style={locked ? {} : {}}>
      <Cmp size={20}/>
    </div>
  );
}

function TrackCard({ track, onPick }) {
  return (
    <div className={"track" + (track.locked ? " locked" : "")} onClick={onPick}>
      <div className="track-head">
        <TrackIcon Icon={track.Icon} locked={track.locked}/>
        {track.locked
          ? <span className="chip locked"><IcLock size={11}/> Em {track.unlockIn} dias</span>
          : <span className="chip"><span className="dot" style={{background:"var(--accent-2)"}}/>{fmtPct(track.progress)}</span>}
      </div>
      <div>
        <div className="track-title">{track.name}</div>
        <div className="track-sub">{track.desc}</div>
      </div>
      <div className="track-foot">
        <div className="track-prog mono tnum">{track.items}</div>
        {!track.locked && <IcChevR size={16} style={{ color: "var(--text-3)" }}/>}
      </div>
    </div>
  );
}

function StatCard({ label, num, unit, sub, subTone, mini }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="num tnum">{num}{unit && <span className="unit"> {unit}</span>}</div>
      {sub && (
        <div className="meta">
          <span className={subTone === "pos" ? "pos" : subTone === "neg" ? "neg" : ""}>{sub}</span>
        </div>
      )}
      {mini != null && (
        <div className="minibar"><i style={{ width: `${mini*100}%` }}/></div>
      )}
    </div>
  );
}

Object.assign(window, {
  Icon, IcHome, IcQuestion, IcBook, IcMic, IcSigma, IcHeadphones, IcLock,
  IcCalendar, IcFlame, IcSearch, IcBell, IcSettings, IcChevR, IcPlay,
  IcLayers, IcCheck, IcArrowUp, IcMoon,
  MEMBER, TRACKS, RESUME_PRIMARY, RESUME_LIST, STATS, ACTIVITY,
  daysUntil, fmtDate, fmtPct, fmtBr,
  ProgressRing, TrackIcon, TrackCard, StatCard,
});
