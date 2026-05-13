"use client";

import { useReveal } from "@/hooks/use-reveal";

export function HeaderInner() {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      className="lp-reveal bg-[var(--lp-alt-bg)] px-5 pb-4 pt-16 text-center md:px-8 md:pt-24"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
        O que está incluído
      </p>
      <h2
        className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-[2.5rem]"
        style={{ fontFamily: "var(--font-bricolage)" }}
      >
        Um sistema completo.
        <span className="text-foreground/40"> Cinco ferramentas. Uma aprovação.</span>
      </h2>
    </div>
  );
}
