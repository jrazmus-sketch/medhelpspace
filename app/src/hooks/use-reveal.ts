"use client";

import { useEffect, useRef } from "react";

export function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-visible");
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return ref;
}

export function useRevealChildren(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const children = container.querySelectorAll<HTMLElement>(
      ".lp-reveal, .lp-reveal-left, .lp-reveal-right",
    );
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("lp-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold },
    );
    children.forEach((child) => obs.observe(child));
    return () => obs.disconnect();
  }, [threshold]);

  return ref;
}
