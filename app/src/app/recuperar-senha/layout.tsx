import type { Metadata } from "next";

// Neutral: password recovery serves Revalida AND ClinAct accounts, so the tab
// must not inherit the root "MedHelpSpace Revalida" title (2026-11-03).
export const metadata: Metadata = {
  title: { absolute: "Recuperar senha | MedHelpSpace" },
  description: "Redefina a senha da sua conta MedHelpSpace.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
