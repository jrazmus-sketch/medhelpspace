// dashboard-app.jsx — v2

const PALETTES = {
  midnight: {
    label: "Midnight",
    swatch: ["#0c0b14", "#161420", "#8b7bff"],
    vars: {
      "--bg": "#0c0b14", "--surface": "#161420", "--surface-2": "#1f1c2d",
      "--surface-3": "#2a2640", "--divider": "#26233a",
      "--text": "#ece9f5", "--text-2": "#b4afca", "--text-3": "#7d7796", "--text-4": "#555068",
    },
  },
  aubergine: {
    label: "Aubergine",
    swatch: ["#180c1f", "#241326", "#c89cf5"],
    vars: {
      "--bg": "#180c1f", "--surface": "#241326", "--surface-2": "#311a33",
      "--surface-3": "#3d2240", "--divider": "#33203a",
      "--text": "#f3e6f5", "--text-2": "#c7b2cf", "--text-3": "#8e7894", "--text-4": "#604f66",
    },
  },
  slate: {
    label: "Slate",
    swatch: ["#0d1117", "#171c24", "#7d8cff"],
    vars: {
      "--bg": "#0d1117", "--surface": "#171c24", "--surface-2": "#212834",
      "--surface-3": "#2c3442", "--divider": "#252b37",
      "--text": "#e8ecf3", "--text-2": "#a8b1c2", "--text-3": "#727a8c", "--text-4": "#4d5363",
    },
  },
  ink: {
    label: "Ink",
    swatch: ["#0a0a0a", "#141414", "#b07cff"],
    vars: {
      "--bg": "#0a0a0a", "--surface": "#141414", "--surface-2": "#1d1d1d",
      "--surface-3": "#272727", "--divider": "#222222",
      "--text": "#ededed", "--text-2": "#a8a8a8", "--text-3": "#727272", "--text-4": "#4a4a4a",
    },
  },
  paper: {
    label: "Paper",
    swatch: ["#f4f0e8", "#ffffff", "#6b4eef"],
    light: true,
    vars: {
      "--bg": "#f4f0e8", "--surface": "#ffffff", "--surface-2": "#f8f4ec",
      "--surface-3": "#ebe5d6", "--divider": "#e3dcc9",
      "--text": "#1a1813", "--text-2": "#4d4a3f", "--text-3": "#7a766a", "--text-4": "#a8a394",
      "--on-accent": "#ffffff",
    },
  },
};

// Accent options paired with a lighter shade for text accents
const ACCENTS = [
  { key: "violet",   value: "#8b7bff", lighter: "#b0a4ff", onLight: "#5a47e8", label: "Violet" },
  { key: "indigo",   value: "#7d83ff", lighter: "#a3a8ff", onLight: "#4e54e8", label: "Indigo" },
  { key: "amethyst", value: "#b07cff", lighter: "#cba4ff", onLight: "#7c49e8", label: "Amethyst" },
  { key: "coral",    value: "#ff8866", lighter: "#ffb09a", onLight: "#e85a31", label: "Coral" },
  { key: "mint",     value: "#48d49f", lighter: "#7cdebc", onLight: "#1f9a6a", label: "Mint" },
];

function hexToRgb(hex){
  const m = hex.replace("#","").match(/.{2}/g);
  return m.map(x => parseInt(x,16));
}

function applyTheme({ palette, accent, radius }){
  const root = document.documentElement;
  const p = PALETTES[palette] || PALETTES.midnight;
  Object.entries(p.vars).forEach(([k,v]) => root.style.setProperty(k, v));

  // Default on-accent for dark palettes
  if (!p.light) root.style.setProperty("--on-accent", "#16122e");

  // Accent
  const acc = ACCENTS.find(a => a.value.toLowerCase() === (accent || "").toLowerCase()) || ACCENTS[0];
  const accVal = p.light ? acc.value : acc.value;
  const accLighter = p.light ? acc.onLight : acc.lighter;
  const [r,g,b] = hexToRgb(accVal);

  root.style.setProperty("--accent", accVal);
  root.style.setProperty("--accent-2", accLighter);
  root.style.setProperty("--accent-tint", `rgba(${r},${g},${b},${p.light ? 0.08 : 0.10})`);
  root.style.setProperty("--accent-tint-strong", `rgba(${r},${g},${b},${p.light ? 0.16 : 0.22})`);

  // Radius
  root.style.setProperty("--r", `${radius}px`);
  root.style.setProperty("--r-sm", `${Math.max(2, Math.round(radius * .6))}px`);

  // For paper (light) — adjust ambient overlay color since accent-tint changed
  document.body.style.colorScheme = p.light ? "light" : "dark";
}

function App(){
  const [t, setTweak] = useTweaks(window.__TWEAK_DEFAULTS);

  React.useEffect(() => {
    applyTheme({
      palette: t.palette || "midnight",
      accent: t.accent || "#8b7bff",
      radius: t.radius == null ? 6 : t.radius,
    });
  }, [t.palette, t.accent, t.radius]);

  return (
    <>
      {t.variation === "B" ? <VariationB/> : <VariationA/>}

      <TweaksPanel>
        <TweakSection label="Layout"/>
        <TweakRadio
          label="Variação"
          value={t.variation}
          options={["A","B"]}
          onChange={(v) => setTweak("variation", v)}
        />
        <div style={{fontSize:11, color:"rgba(41,38,27,.55)", marginTop:-2, lineHeight:1.45}}>
          {t.variation === "A" ? "A — Sidebar editorial, bento" : "B — Magazine, headline gigante"}
        </div>
        <TweakSlider
          label="Cantos"
          value={t.radius == null ? 6 : t.radius}
          min={0} max={16} step={1} unit="px"
          onChange={(v) => setTweak("radius", v)}
        />

        <TweakSection label="Paleta de fundo"/>
        <TweakColor
          label="Tema"
          value={Array.isArray(t.paletteSwatch) ? t.paletteSwatch : (PALETTES[t.palette]||PALETTES.midnight).swatch}
          options={Object.values(PALETTES).map(p => p.swatch)}
          onChange={(arr) => {
            const entry = Object.entries(PALETTES).find(([k,p]) => JSON.stringify(p.swatch) === JSON.stringify(arr));
            if (entry) setTweak({ palette: entry[0], paletteSwatch: arr });
          }}
        />
        <div style={{fontSize:11, color:"rgba(41,38,27,.55)", marginTop:-2, lineHeight:1.45}}>
          Midnight · Aubergine · Slate · Ink · Paper (light)
        </div>

        <TweakSection label="Acento"/>
        <TweakColor
          label="Cor"
          value={t.accent}
          options={ACCENTS.map(a => a.value)}
          onChange={(v) => setTweak("accent", v)}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
