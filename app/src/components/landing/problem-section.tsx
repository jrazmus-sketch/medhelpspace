"use client";

import { useEffect, useRef } from "react";
import { SiteText } from "./site-text";

export function ProblemSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Scroll-reveal
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-cin-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Parallax: image moves at 20% of the section's scroll speed
  useEffect(() => {
    const section = sectionRef.current;
    const img = imgRef.current;
    if (!section || !img) return;

    let raf: number;

    function update() {
      const rect = section!.getBoundingClientRect();
      // Only push image downward (positive Y) — keeps bottom: 0 as the floor.
      // Negative values would lift the image and expose a gap at the section bottom.
      const offset = Math.max(0, (rect.top + rect.height / 2 - window.innerHeight / 2) * 0.2);
      img!.style.transform = `translateY(${offset}px)`;
    }

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="lp-cin-block relative overflow-hidden px-5 py-28 md:px-8 md:py-36"
      style={{ background: "var(--lp-alt)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src="/images/students.webp"
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "auto",
          display: "block",
          opacity: 0.32,
          pointerEvents: "none",
          willChange: "transform",
        }}
      />

      {/* Gradient overlay: opaque section bg at top, transparent from midpoint down */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, var(--lp-alt) 0%, var(--lp-alt) 25%, transparent 60%)",
        }}
      />

      {/* Content */}
      <div className="relative mx-auto max-w-5xl" style={{ zIndex: 1, borderTop: "1px solid var(--lp-border)" }}>
        <div className="pt-16 text-center md:pt-24">
          <div
            className="mb-10 text-[10px] uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
          >
            <SiteText as="span" k="problem.eyebrow" fallback="O problema" />
          </div>

          <h2
            className="text-[clamp(2.2rem,5.5vw,5rem)] font-black leading-[1.05] tracking-[-0.025em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <SiteText as="span" k="problem.headline1" fallback="O Revalida não derruba por falta de esforço." />
          </h2>

          <h2
            className="mt-2 text-[clamp(2.2rem,5.5vw,5rem)] font-black leading-[1.05] tracking-[-0.025em]"
            style={{
              fontFamily: "var(--font-bricolage)",
              color: "var(--lp-fg-40)",
            }}
          >
            <SiteText as="span" k="problem.headline2" fallback="Ele derruba quando o esforço vira volume." />
          </h2>

          <p
            className="mx-auto mt-10 max-w-lg text-base leading-relaxed sm:text-lg"
            style={{ color: "var(--lp-fg-40)" }}
          >
            <SiteText as="span" multiline k="problem.body" fallback="Muito conteúdo, pouca decisão, pouca fixação. A virada é simples: você não precisa de mais horas. Você precisa de método." />
          </p>
        </div>
      </div>
    </section>
  );
}
