"use client";

// Section-view and scroll-depth events for a long sales page (Karina 2026-09-30).
// Mounted once on the page; observes the ids in LANDING_SECTIONS and fires each
// view_<section>_section ONCE per page load when ~35% of the block is on screen
// (or the block fills half the screen — see below),
// plus scroll_25/50/75/90 once each. Everything goes through lib/analytics/track,
// which is a no-op until the GA tag is loaded (tracked route + consent), so this
// never sends anything the consent layer would not allow.

import { useEffect } from "react";
import { LANDING_SECTIONS, SCROLL_MILESTONES, type LandingSection } from "@/lib/analytics/landing-sections";
import { trackScrollDepth, trackSectionView } from "@/lib/analytics/track";

const SECTION_VIEW_RATIO = 0.35;

export function LandingEvents({ sections = LANDING_SECTIONS }: { sections?: readonly LandingSection[] }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ── Section views ──────────────────────────────────────────────────────
    // "Reached" = 35% of the block on screen, OR the block filling half the screen.
    // The second clause matters for blocks taller than ~2.9 screens: on a 375×667
    // phone the pricing block is ~1970px, so at most 34% of it is ever visible and a
    // ratio-only rule never fired view_pricing_section on small phones. The 5% steps
    // make the observer report often enough to see the half-screen point.
    const seen = new Set<string>();
    const byId = new Map(sections.map((s) => [s.id, s.section]));
    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const screen = e.rootBounds?.height ?? window.innerHeight;
            if (e.intersectionRatio < SECTION_VIEW_RATIO && e.intersectionRect.height < screen * 0.5) continue;
            const id = (e.target as HTMLElement).id;
            const section = byId.get(id);
            if (!section || seen.has(id)) continue;
            seen.add(id);
            trackSectionView(section);
            observer?.unobserve(e.target);
          }
        },
        { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
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
