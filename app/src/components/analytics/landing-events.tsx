"use client";

// Section-view and scroll-depth events for a long sales page (Karina 2026-09-30).
// Mounted once on the page; observes the ids in LANDING_SECTIONS and fires each
// view_<section>_section ONCE per page load when ~35% of the block is on screen,
// plus scroll_25/50/75/90 once each. Everything goes through lib/analytics/track,
// which is a no-op until the GA tag is loaded (tracked route + consent), so this
// never sends anything the consent layer would not allow.

import { useEffect } from "react";
import { LANDING_SECTIONS, SCROLL_MILESTONES, type LandingSection } from "@/lib/analytics/landing-sections";
import { trackScrollDepth, trackSectionView } from "@/lib/analytics/track";

export function LandingEvents({ sections = LANDING_SECTIONS }: { sections?: readonly LandingSection[] }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ── Section views ──────────────────────────────────────────────────────
    const seen = new Set<string>();
    const byId = new Map(sections.map((s) => [s.id, s.section]));
    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const id = (e.target as HTMLElement).id;
            const section = byId.get(id);
            if (!section || seen.has(id)) continue;
            seen.add(id);
            trackSectionView(section);
            observer?.unobserve(e.target);
          }
        },
        { threshold: 0.35 },
      );
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      }
    }

    // ── Scroll depth ───────────────────────────────────────────────────────
    const fired = new Set<number>();
    let ticking = false;
    const check = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = ((window.scrollY || doc.scrollTop) / max) * 100;
      for (const m of SCROLL_MILESTONES) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          trackScrollDepth(m);
        }
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    check();

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections]);

  return null;
}
