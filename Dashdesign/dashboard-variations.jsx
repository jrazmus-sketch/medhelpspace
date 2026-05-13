// dashboard-variations.jsx — v2 (editorial bento)

const NAV_ITEMS = [
  { id: "home",       label: "Início",            Icon: IcHome,       trackKey: null, active: true },
  { id: "questoes",   label: "Questões",          Icon: IcQuestion,   trackKey: "c-questoes",   num: "01" },
  { id: "resumos",    label: "Resumos",           Icon: IcBook,       trackKey: "c-resumos",    num: "02" },
  { id: "medvoice",   label: "MedVoice",          Icon: IcMic,        trackKey: "c-medvoice",   num: "03" },
  { id: "formula",    label: "Fórmula",           Icon: IcSigma,      trackKey: "c-formula",    num: "04" },
  { id: "audiocards", label: "AudioCards",        Icon: IcHeadphones, trackKey: "c-audiocards", num: "05" },
  { id: "medhelp60",  label: "MedHelp 60D",       Icon: IcLock,       trackKey: "c-medhelp60",  num: "06", locked: true },
];

const TRACK_COLORS = {
  questoes: "var(--c-questoes)",
  resumos: "var(--c-resumos)",
  medvoice: "var(--c-medvoice)",
  formula: "var(--c-formula)",
  audiocards: "var(--c-audiocards)",
  medhelp60: "var(--c-medhelp60)",
};

// ─────────────────────────────────────────────────────────────
// CHART COMPONENTS — pure SVG, glanceable
// ─────────────────────────────────────────────────────────────
function Donut({ value, size = 116, sw = 12, color = "var(--accent)", track = "var(--surface-2)", centerNum, centerLab }) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value));
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={sw}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
      </svg>
      <div className="center">
        <div>
          <div className="num tnum">{centerNum}</div>
          {centerLab && <div className="lab">{centerLab}</div>}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data, color = "var(--accent)", fill = true, width = 280, height = 64, showDots = true }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 4;
  const stepX = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / range);
    return [x, y];
  });
  const linePath = "M" + points.map(p => p.join(",")).join(" L");
  const fillPath = linePath + ` L${points[points.length-1][0]},${height - pad} L${pad},${height - pad} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {fill && <path d={fillPath} fill="url(#sparkFill)"/>}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {showDots && (
        <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="3.5" fill={color}/>
      )}
    </svg>
  );
}

function HBars({ items }) {
  const max = Math.max(...items.map(i => i.value));
  return (
    <div className="hbars">
      {items.map((it, i) => (
        <div className="row" key={i} style={{ "--c": it.color }}>
          <div className="nm">{it.label}</div>
          <div className="tk"><i style={{ width: `${(it.value/max)*100}%` }}/></div>
          <div className="vl">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ weeks, today }) {
  // weeks: array of 7-day rows (oldest first). values 0..1
  const flat = weeks.flat();
  return (
    <div className="heatmap">
      {flat.map((v, i) => {
        const lvl = v === 0 ? 0 : v < 0.25 ? 1 : v < 0.55 ? 2 : v < 0.85 ? 3 : 4;
        return <div key={i} className={`cell ${lvl ? "l"+lvl : ""}${i === today ? " today" : ""}`} title={`${Math.round(v*60)} min`}/>;
      })}
    </div>
  );
}

function VBars({ items }) {
  return (
    <div className="vbars">
      {items.map((it, i) => {
        const total = it.right + it.wrong;
        const rightPct = total ? (it.right / 100) * 100 : 0;
        const wrongPct = total ? (it.wrong / 100) * 100 : 0;
        return (
          <div className="col" key={i}>
            <div className="val tnum">{Math.round((it.right/(it.right+it.wrong))*100)}%</div>
            <div className="stack">
              <div className="wrong" style={{height: `${wrongPct}%`, background:"var(--surface-3)"}}/>
              <div className="right" style={{height: `${rightPct}%`, background: it.color || "var(--accent)"}}/>
            </div>
            <div className="lbl">{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// Chart-friendly data
const AUDIO_WEEKS = [9.2, 12.5, 14.0, 16.8, 18.7]; // last 5 weeks, hours
const SPECIALTY_MASTERY = [
  { label: "Cardiologia", value: 82, color: "var(--c-medvoice)" },
  { label: "Pediatria",   value: 71, color: "var(--c-resumos)" },
  { label: "G.O.",        value: 64, color: "var(--c-formula)" },
  { label: "Clínica",     value: 48, color: "var(--c-audiocards)" },
];
const SPECIALTY_ACCURACY = [
  { label: "Card", right: 82, wrong: 18, color: "var(--c-medvoice)" },
  { label: "Ped",  right: 75, wrong: 25, color: "var(--c-resumos)" },
  { label: "G.O.", right: 68, wrong: 32, color: "var(--c-formula)" },
  { label: "Clín", right: 71, wrong: 29, color: "var(--c-audiocards)" },
  { label: "Cir",  right: 58, wrong: 42, color: "var(--c-questoes)" },
  { label: "Pneu", right: 84, wrong: 16, color: "var(--c-pop, #66e0ff)" },
];
// 5 weeks x 7 days heatmap (values 0..1)
const STUDY_HEATMAP = [
  [.4, .6, .3, .8, .5, 0, .2],
  [.7, .5, .9, .6, .3, .2, 0 ],
  [.5, .8, .6, .4, .9, 0, .3],
  [.6, .4, .8, .7, .5, .3, .2],
  [.8, .9, .7, 1.0, .55, 0, 0],
];


function MiniRing({ value, size = 54, sw = 5 }) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * value;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={sw}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="var(--accent)" strokeWidth={sw}
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
    </svg>
  );
}

function TrackTile({ track, num }) {
  const isLocked = !!track.locked;
  return (
    <div className={"track-tile" + (isLocked ? " locked" : "")}
         style={{ "--c": TRACK_COLORS[track.id], "--on-color": "#16122e" }}>
      <span className="corner-num mono">{num}</span>
      <div className="swatch"><track.Icon size={20}/></div>
      <div>
        <div className="tt">{track.name}</div>
        <div className="ts">{track.desc}</div>
      </div>
      <div className="foot">
        {isLocked ? (
          <>
            <span className="chip" style={{background:"transparent", color: "var(--c-medhelp60)"}}>
              <IcLock size={11}/> {track.unlockIn} dias até liberar
            </span>
          </>
        ) : (
          <div className="prog">
            <div className="bar"><i style={{width: fmtPct(track.progress)}}/></div>
            <div className="pct tnum mono">{fmtPct(track.progress)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiTile({ label, value, unit, sub, subTone, fill }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div>
        <div className="v tnum">{value}{unit && <span className="u"> {unit}</span>}</div>
        {sub && <div className="sub"><span className={subTone === "pos" ? "pos" : ""}>{sub}</span></div>}
        {fill != null && <div className="bar"><i style={{width: `${fill*100}%`}}/></div>}
      </div>
    </div>
  );
}

function ResumeStrip() {
  return (
    <div className="resume-strip">
      <div className="pill-ico"><IcMic size={20}/></div>
      <div className="meta">
        <div className="tag">{RESUME_PRIMARY.trackName}</div>
        <div className="t">{RESUME_PRIMARY.title}</div>
        <div className="s">
          <span>{RESUME_PRIMARY.chapter}</span><span className="dot"></span>
          <span>{RESUME_PRIMARY.remaining}</span><span className="dot"></span>
          <span>{RESUME_PRIMARY.lastAt}</span>
        </div>
      </div>
      <div className="prog-wrap">
        <div className="ringy">
          <MiniRing value={RESUME_PRIMARY.progress}/>
          <div className="v tnum mono">{Math.round(RESUME_PRIMARY.progress*100)}</div>
        </div>
        <button className="btn primary"><IcPlay size={14}/> Continuar</button>
      </div>
    </div>
  );
}

function PlanCard() {
  return (
    <div className="plan-card">
      <div>
        <div className="label">Plano de hoje</div>
        <h3>3 sessões<br/>· 1h 40min</h3>
      </div>
      <div className="plan-tasks">
        <div className="task done"><span className="tk-ico"><IcCheck size={10}/></span>20 questões — Cardiologia</div>
        <div className="task"><span className="tk-ico"></span>Aula MedVoice — SCA pt. II</div>
        <div className="task"><span className="tk-ico"></span>Revisão AudioCards (40 cards)</div>
      </div>
      <div className="arrow"><IcChevR size={18}/></div>
    </div>
  );
}

function WeeklyBars() {
  const days = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const data = STATS.weekly.daily; const max = 100;
  return (
    <>
      <div className="week">
        {data.map((v, i) => (
          <div key={i} className={"col" + (i === STATS.weekly.todayIndex ? " today" : "")}>
            <div className="b"><i style={{height: `${(v/max)*100}%`}}/></div>
            <div className="lbl">{days[i]}</div>
          </div>
        ))}
      </div>
      <div className="week-legend">
        <span>Meta diária <b>60 min</b></span>
        <span><b>4 / 5 dias</b> cumpridos</span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIATION A — sidebar + editorial bento
// ─────────────────────────────────────────────────────────────
function VariationA() {
  const examDays = daysUntil(MEMBER.examDate);

  return (
    <div className="shell-a">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div className="brand-name">MedHelp <span>· Space</span></div>
        </div>

        <div className="nav-group">
          <div className="nav-head"><span className="label">Painel</span></div>
          <div className="nav-item active">
            <span className="num mono"></span>
            <span className="ic"><IcHome size={18}/></span>
            <span>Início</span>
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-head"><span className="label">Trilhas</span></div>
          {NAV_ITEMS.filter(n => n.trackKey).map((n) => (
            <div key={n.id}
                 className={"nav-item" + (n.locked ? "" : "")}
                 style={{ "--track-color": `var(--${n.trackKey})` }}>
              <span className="strip"/>
              <span className="num mono">{n.num}</span>
              <span className="ic"><n.Icon size={17}/></span>
              <span>{n.label}</span>
              {n.locked && <span className="lock"><IcLock size={13}/></span>}
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="avatar">K</div>
          <div className="avatar-info">
            <div className="n">{MEMBER.firstName}</div>
            <div className="s">{MEMBER.plan}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="crumbs">Área do aluno · <strong>Início</strong></div>
          <div className="topbar-actions">
            <div className="search">
              <IcSearch size={16}/>
              <input placeholder="Buscar aulas, questões, tópicos…"/>
              <span className="mono" style={{fontSize:11, color:"var(--text-4)"}}>⌘K</span>
            </div>
            <button className="iconbtn"><IcBell size={16}/></button>
            <button className="iconbtn"><IcSettings size={16}/></button>
          </div>
        </div>

        {/* HERO BENTO */}
        <section className="hero">
          <div className="greet-block">
            <div>
              <div className="greet-tag">Bom te ver, Karina</div>
              <h1>Pronta para <em>continuar</em><br/>de onde parou?</h1>
              <p className="lead">
                Você está no <b style={{color:"var(--text)"}}>{MEMBER.studyDays}º dia</b> de estudos para o {MEMBER.examLabel}.
                Sua próxima sessão recomendada está em MedVoice.
              </p>
            </div>
            <ResumeStrip/>
          </div>

          <div className="num-stack">
            <div className="big-num accent">
              <div className="stack-l">
                <div className="label">Dias até a prova</div>
                <div className="small">{fmtDate(MEMBER.examDate)} · {MEMBER.examLabel}</div>
              </div>
              <div>
                <div className="digit tnum">{examDays}</div>
                <span className="unit">dias</span>
              </div>
            </div>
            <div className="big-num">
              <div className="stack-l">
                <div className="label">Dias de estudo</div>
                <div className="small">desde 13 de abril</div>
              </div>
              <div>
                <div className="digit tnum">{MEMBER.studyDays}</div>
                <span className="unit">acumulados</span>
              </div>
            </div>
            <div className="big-num fire">
              <div className="stack-l">
                <div className="label">Sequência atual</div>
                <div className="small">Maior: 18 dias · <span style={{color:"var(--c-questoes)"}}>em chamas</span></div>
              </div>
              <div>
                <div className="digit tnum">{MEMBER.streak}</div>
                <span className="unit">seguidos</span>
              </div>
            </div>
          </div>
        </section>

        {/* ROW 2 — Plan + 3 KPIs */}
        <section className="row-2">
          <PlanCard/>
          <KpiTile
            label="Questões"
            value={fmtBr(STATS.questoes.value)}
            sub={`${fmtPct(STATS.questoes.accuracy)} acerto · +${STATS.questoes.deltaWeek} sem.`}
            subTone="pos"
            fill={STATS.questoes.accuracy}
          />
          <KpiTile
            label="Tópicos"
            value={STATS.topics.mastered}
            unit={`/ ${STATS.topics.total}`}
            sub="dominados · 6 novos no mês"
            fill={STATS.topics.mastered/STATS.topics.total}
          />
          <KpiTile
            label="Áudio"
            value={`${STATS.audio.hours}h${STATS.audio.minutes}`}
            sub={`+${STATS.audio.deltaWeek}h vs. semana anterior`}
            subTone="pos"
          />
        </section>

        {/* TRILHAS */}
        <div className="sec">
          <h2>Trilhas <span className="count mono">06</span></h2>
          <a className="more">Ver todas →</a>
        </div>
        <section className="tracks-grid">
          {TRACKS.map((t, i) => (
            <TrackTile key={t.id} track={t} num={String(i+1).padStart(2,"0")}/>
          ))}
        </section>

        {/* ROW 3 */}
        <div className="sec">
          <h2>Esta semana</h2>
          <a className="more">Ver relatório →</a>
        </div>
        <section className="row-3">
          <div className="panel">
            <h3>Atividade <span className="label-l">últimas 24h</span></h3>
            <div className="feed">
              {ACTIVITY.map((a, i) => (
                <div className="feed-row" key={i}>
                  <div className="feed-ico">{a.ico}</div>
                  <div className="feed-text">
                    <div className="t">{a.t}</div>
                    <div className="s">{a.s}</div>
                  </div>
                  <div className="feed-time">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Tempo de estudo <span className="label-l">minutos / dia</span></h3>
            <WeeklyBars/>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIATION B — magazine, no sidebar
// ─────────────────────────────────────────────────────────────
function VariationB() {
  const examDays = daysUntil(MEMBER.examDate);

  return (
    <div className="shell-b">
      <header className="magazine-bar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div className="brand-name">MedHelp <span>· Space</span></div>
        </div>
        <nav className="nav-pills">
          <a className="nav-pill active">Início</a>
          <a className="nav-pill">Questões</a>
          <a className="nav-pill">Resumos</a>
          <a className="nav-pill">MedVoice</a>
          <a className="nav-pill">Fórmula</a>
          <a className="nav-pill">AudioCards</a>
        </nav>
        <div className="spacer"/>
        <div className="search" style={{width: 220}}>
          <IcSearch size={16}/>
          <input placeholder="Buscar…"/>
        </div>
        <button className="iconbtn"><IcBell size={16}/></button>
        <div className="avatar">K</div>
      </header>

      <main className="mag-main">
        <section className="mag-hero">
          <div className="left">
            <div className="greet-tag">Olá, Karina · Domingo, 12 mai</div>
            <h1>Bom te ver<br/>de volta.</h1>
            <h2>Continue em <b>Cardiologia — Síndromes Coronarianas, parte II</b>.</h2>
            <div className="lead">
              <span className="pip"><b style={{color:"var(--text-2)"}}>{MEMBER.studyDays}º</b> dia de estudo</span>
              <span className="pip"><b style={{color:"var(--text-2)"}} className="tnum">{daysUntil(MEMBER.examDate)}</b> dias até a prova</span>
              <span className="pip"><b style={{color:"var(--text-2)"}} className="tnum">{MEMBER.streak}</b> dias seguidos</span>
            </div>
          </div>
          <div className="nums">
            <div className="one">
              <div className="lab">Até a prova</div>
              <div className="digit a tnum">{daysUntil(MEMBER.examDate)}</div>
              <div className="lab" style={{marginTop:6, color:"var(--text-4)"}}>{fmtDate(MEMBER.examDate)}</div>
            </div>
            <div className="one">
              <div className="lab">De estudo</div>
              <div className="digit tnum">{MEMBER.studyDays}</div>
              <div className="lab" style={{marginTop:6, color:"var(--text-4)"}}>dias acumulados</div>
            </div>
            <div className="one">
              <div className="lab">Sequência</div>
              <div className="digit b tnum">{MEMBER.streak}</div>
              <div className="lab" style={{marginTop:6, color:"var(--text-4)"}}>seguidos · máx. 18</div>
            </div>
          </div>
        </section>

        {/* Resume + plan + KPI */}
        <section className="mag-resume-row">
          <PlanCard/>
          <div className="kpi" style={{background:"var(--surface)"}}>
            <div className="label">Continuar</div>
            <div>
              <div style={{fontSize:11, color:"var(--accent-2)", letterSpacing:".14em", textTransform:"uppercase", fontWeight:600}}>{RESUME_PRIMARY.trackName}</div>
              <div style={{fontSize:17, fontWeight:500, marginTop:4, letterSpacing:"-.01em", lineHeight:1.2}}>{RESUME_PRIMARY.title}</div>
              <div style={{fontSize:12, color:"var(--text-3)", marginTop:6}}>{RESUME_PRIMARY.chapter} · {RESUME_PRIMARY.remaining}</div>
            </div>
            <div style={{display:"flex", gap:10, alignItems:"center", marginTop:14}}>
              <div className="bar" style={{flex:1}}><i style={{width: fmtPct(RESUME_PRIMARY.progress)}}/></div>
              <span className="mono tnum" style={{fontSize:12, color:"var(--text-2)"}}>{fmtPct(RESUME_PRIMARY.progress)}</span>
              <button className="btn primary sm"><IcPlay size={12}/> Continuar</button>
            </div>
          </div>
          <KpiTile
            label="Questões"
            value={fmtBr(STATS.questoes.value)}
            sub={`${fmtPct(STATS.questoes.accuracy)} de acerto`}
            subTone="pos"
            fill={STATS.questoes.accuracy}
          />
        </section>

        {/* Visual at-a-glance progress charts */}
        <div className="sec">
          <h2>Progresso</h2>
          <a className="more">Detalhes →</a>
        </div>
        <section className="chart-grid">
          {/* 1. Donut — accuracy */}
          <div className="chart-card">
            <div className="head">
              <div className="label">Acerto</div>
              <div className="delta">+4 pts</div>
            </div>
            <div className="body" style={{justifyContent:"center"}}>
              <Donut
                value={STATS.questoes.accuracy}
                color="var(--accent)"
                centerNum={`${Math.round(STATS.questoes.accuracy*100)}%`}
                centerLab="acerto"
              />
            </div>
            <div className="foot">
              <span className="tnum">{fmtBr(STATS.questoes.value)} questões</span>
            </div>
          </div>

          {/* 2. Sparkline — audio per week */}
          <div className="chart-card">
            <div className="head">
              <div className="label">Áudio · 5 sem.</div>
              <div className="delta">+{STATS.audio.deltaWeek}h</div>
            </div>
            <div className="body">
              <Sparkline data={AUDIO_WEEKS} color="var(--c-pop)"/>
            </div>
            <div className="foot">
              <span className="big tnum">{STATS.audio.hours}<span className="u">h</span></span>
              <span>este mês</span>
            </div>
          </div>

          {/* 3. Mini bars — specialty mastery */}
          <div className="chart-card">
            <div className="head">
              <div className="label">Tópicos · top 4</div>
              <div className="delta">+6 mês</div>
            </div>
            <div className="body" style={{alignItems:"center"}}>
              <HBars items={SPECIALTY_MASTERY}/>
            </div>
            <div className="foot">
              <span className="big tnum">{STATS.topics.mastered}<span className="u">/{STATS.topics.total}</span></span>
              <span>dominados</span>
            </div>
          </div>

          {/* 4. Heatmap — last 5 weeks of study */}
          <div className="chart-card">
            <div className="head">
              <div className="label">Constância · 5 sem.</div>
              <div className="delta">{MEMBER.streak} dias</div>
            </div>
            <div className="body" style={{alignItems:"center"}}>
              <Heatmap weeks={STUDY_HEATMAP} today={STUDY_HEATMAP.flat().length - 3}/>
            </div>
            <div className="foot">
              <div className="legend">
                <span className="item"><span className="sw" style={{background:"var(--surface-2)"}}/>0</span>
                <span className="item"><span className="sw" style={{background:"rgba(125,131,255,.45)"}}/>30m</span>
                <span className="item"><span className="sw" style={{background:"var(--accent)"}}/>60m+</span>
              </div>
            </div>
          </div>
        </section>

        <div className="sec">
          <h2>Trilhas <span className="count mono">06</span></h2>
          <a className="more">Ver todas →</a>
        </div>
        <section className="tracks-grid">
          {TRACKS.map((t, i) => (
            <TrackTile key={t.id} track={t} num={String(i+1).padStart(2,"0")}/>
          ))}
        </section>

        <div className="sec">
          <h2>Esta semana</h2>
          <a className="more">Relatório →</a>
        </div>
        <section className="row-3">
          <div className="panel">
            <h3>Atividade <span className="label-l">últimas 24h</span></h3>
            <div className="feed">
              {ACTIVITY.map((a, i) => (
                <div className="feed-row" key={i}>
                  <div className="feed-ico">{a.ico}</div>
                  <div className="feed-text">
                    <div className="t">{a.t}</div>
                    <div className="s">{a.s}</div>
                  </div>
                  <div className="feed-time">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Acerto por especialidade <span className="label-l">últimos 30 dias</span></h3>
            <VBars items={SPECIALTY_ACCURACY}/>
            <div className="legend" style={{marginTop: 14}}>
              <span className="item"><span className="sw" style={{background:"var(--accent)"}}/>acerto</span>
              <span className="item"><span className="sw" style={{background:"var(--surface-3)"}}/>erro</span>
              <span className="item" style={{marginLeft:"auto", color:"var(--text-3)"}}>média geral <b style={{color:"var(--text)"}} className="tnum">73%</b></span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

Object.assign(window, { VariationA, VariationB });
