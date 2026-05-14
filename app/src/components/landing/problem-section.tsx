"use client";

import { useEffect, useRef } from "react";

export function ProblemSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
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

  return (
    <section
      ref={ref}
      className="lp-cin-block px-5 py-28 md:px-8 md:py-36"
      style={{ background: "var(--lp-alt)" }}
    >
      <div
        className="mx-auto max-w-5xl"
        style={{ borderTop: "1px solid var(--lp-border)" }}
      >
        <div className="pt-16 text-center md:pt-24">
          <div
            className="mb-10 text-[10px] uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
          >
            O problema
          </div>

          <h2
            className="text-[clamp(2.2rem,5.5vw,5rem)] font-black leading-[1.05] tracking-[-0.025em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            O Revalida não derruba
            <br className="hidden sm:block" /> por falta de esforço.
          </h2>

          <h2
            className="mt-2 text-[clamp(2.2rem,5.5vw,5rem)] font-black leading-[1.05] tracking-[-0.025em]"
            style={{
              fontFamily: "var(--font-bricolage)",
              color: "var(--lp-fg-15)",
            }}
          >
            Ele derruba quando o esforço
            <br className="hidden sm:block" /> vira volume.
          </h2>

          <p
            className="mx-auto mt-10 max-w-lg text-base leading-relaxed sm:text-lg"
            style={{ color: "var(--lp-fg-40)" }}
          >
            Muito conteúdo, pouca decisão, pouca fixação.
            A virada é simples: você não precisa de mais horas.
            Você precisa de método.
          </p>
        </div>
      </div>
    </section>
  );
}
