"use client";

import { useEffect, useRef } from "react";
import { AppMockup, type MockupVariant } from "./app-mockup";

export interface FeatureBandData {
  num: string;
  id: string;
  name: string;
  tagline: string;
  body: string;
  detail: string;
  result: string;
  color: string;
  mockupVariant: MockupVariant;
  /** If true, text content is on the right, visual on the left */
  flip?: boolean;
  /** Background override */
  bgClass?: string;
}

interface FeatureBandProps {
  feature: FeatureBandData;
}

export function FeatureBand({ feature: f }: FeatureBandProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = [contentRef.current, visualRef.current].filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("lp-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const textContent = (
    <div
      ref={contentRef}
      className={`lp-band-content flex flex-col justify-center ${f.flip ? "md:order-2" : ""}`}
    >
      {/* Feature number + name */}
      <div className="mb-4 flex items-center gap-3">
        <span
          className="font-mono text-sm font-bold"
          style={{ color: f.color }}
        >
          {f.num}
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest"
          style={{
            backgroundColor: `color-mix(in srgb, ${f.color} 12%, transparent)`,
            color: f.color,
          }}
        >
          {f.name}
        </span>
      </div>

      {/* Tagline */}
      <h3
        className="mb-5 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl"
        style={{ fontFamily: "var(--font-bricolage)" }}
      >
        {f.tagline}
      </h3>

      {/* Body */}
      <p className="mb-3 text-sm leading-relaxed text-foreground/65 sm:text-base">
        {f.body}
      </p>
      <p className="mb-6 text-sm leading-relaxed text-foreground/55 sm:text-base">
        {f.detail}
      </p>

      {/* Result badge */}
      <div
        className="inline-flex items-start gap-2 self-start rounded-xl px-4 py-3 text-sm font-semibold"
        style={{
          backgroundColor: `color-mix(in srgb, ${f.color} 10%, transparent)`,
          color: f.color,
        }}
      >
        <span className="mt-0.5 flex-shrink-0">✦</span>
        <span>{f.result}</span>
      </div>
    </div>
  );

  const visualContent = (
    <div
      ref={visualRef}
      className={`${f.flip ? "lp-band-visual-left md:order-1" : "lp-band-visual"}`}
    >
      {/*
        SCREENSHOT PLACEHOLDER
        Replace <AppMockup variant={f.mockupVariant} /> with:
        <Image src={`/screenshots/${f.mockupVariant}.png`} alt={f.name} width={1200} height={720}
          className="w-full rounded-xl shadow-2xl" />
      */}
      <AppMockup variant={f.mockupVariant} className="shadow-2xl" />
    </div>
  );

  return (
    <section
      id={f.id}
      className={`relative overflow-hidden px-5 py-16 md:px-8 md:py-24 ${f.bgClass ?? ""}`}
    >
      {/* Giant decorative number */}
      <div
        className="lp-dec-number"
        style={{ top: "-0.1em", right: f.flip ? "auto" : "-0.05em", left: f.flip ? "-0.05em" : "auto" }}
        aria-hidden
      >
        {f.num}
      </div>

      {/* Thin color accent on the side */}
      <div
        className="pointer-events-none absolute inset-y-0 w-1"
        style={{
          [f.flip ? "right" : "left"]: 0,
          background: `linear-gradient(to bottom, transparent, ${f.color}, transparent)`,
          opacity: 0.5,
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-16">
        {f.flip ? (
          <>
            {visualContent}
            {textContent}
          </>
        ) : (
          <>
            {textContent}
            {visualContent}
          </>
        )}
      </div>
    </section>
  );
}
