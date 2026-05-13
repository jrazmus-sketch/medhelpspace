"use client";

const SPECS = [
  { name: "Cardiologia",      light: "#e84343", dark: "#ff8080" },
  { name: "Pneumologia",      light: "#f97316", dark: "#ffb070" },
  { name: "Reumatologia",     light: "#d4a017", dark: "#ffd96b" },
  { name: "Clínica Médica",   light: "#16a34a", dark: "#6ee79b" },
  { name: "Gastroenterologia",light: "#0d9488", dark: "#5dd8c8" },
  { name: "Neurologia",       light: "#0891b2", dark: "#4dc8e8" },
  { name: "Obstetrícia",      light: "#7c3aed", dark: "#b59dff" },
  { name: "Ginecologia",      light: "#db2777", dark: "#f786c0" },
  { name: "Pediatria",        light: "#e11d48", dark: "#ff7b9b" },
  { name: "Infectologia",     light: "#65a30d", dark: "#b8e05a" },
  { name: "Nefrologia",       light: "#2563eb", dark: "#82b4ff" },
  { name: "Dermatologia",     light: "#b45309", dark: "#fbbf5a" },
];

export function SpecialtyMosaic() {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {SPECS.map((spec, i) => (
        <div
          key={spec.name}
          className="group rounded-xl border px-3 py-2.5 text-center text-xs font-semibold leading-tight transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:px-4 sm:py-3 sm:text-sm"
          style={{
            animationName: "lp-scale-in",
            animationDuration: "0.5s",
            animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
            animationFillMode: "both",
            animationDelay: `${i * 55}ms`,
            borderColor: `color-mix(in srgb, var(--spec-color) 30%, transparent)`,
            backgroundColor: `color-mix(in srgb, var(--spec-color) 10%, var(--background))`,
            color: `var(--spec-color)`,
            // CSS variable set via inline style for dark/light mode
          } as React.CSSProperties}
          // We apply the color via a CSS variable trick using data attributes
          data-spec={i + 1}
        >
          {spec.name}
        </div>
      ))}
      <style>{`
        ${SPECS.map((s, i) => `
          [data-spec="${i + 1}"] { --spec-color: ${s.light}; }
          .dark [data-spec="${i + 1}"] { --spec-color: ${s.dark}; }
        `).join("")}
      `}</style>
    </div>
  );
}
