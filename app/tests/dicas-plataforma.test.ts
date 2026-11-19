/**
 * "Dicas da plataforma" (Karina 2026-11-19, 20h24 BRT): a visible way to every quick tip from the top menu, the page
 * that lists them all with where each appears, and restoring closed tips — one, or all — so they show again in
 * their original place. The X keeps working; choices live on the student's account (profiles.onboarding_dismissed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TIPS, GUIDE_GROUPS, TIP_PLACES, COACH_KEYS } from "@/lib/onboarding/tips";

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

test("every tip is on the central page, once, with the place where its box appears", () => {
  const listed = GUIDE_GROUPS.flatMap((g) => g.keys);
  assert.equal(new Set(listed).size, listed.length, "no tip twice");
  assert.deepEqual([...listed].sort(), Object.keys(TIPS).sort(), "every tip listed");
  for (const k of Object.keys(TIPS)) assert.ok(k in TIP_PLACES, `place of ${k}`);
});

test("every tip box used on a page is restorable from the central page (has a place)", () => {
  const used = new Set<string>();
  for (const f of walk(path.join(process.cwd(), "src"))) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/coachKey="([a-z0-9-]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/return "([a-z0-9-]+)";/g)) if (COACH_KEYS.has(m[1]) && /coachmarkKeyForPage/.test(s)) used.add(m[1]);
  }
  used.add("welcome"); // the dashboard welcome card
  for (const k of used) assert.ok(TIP_PLACES[k as keyof typeof TIP_PLACES], `${k} has a box but no place on the page`);
});

test("restore ONE tip: the API removes only that key, validated, on the user's own row", () => {
  const api = src("app", "api", "onboarding", "route.ts");
  const r = api.slice(api.indexOf('if (action === "restore")'), api.indexOf('if (action === "dismiss")'));
  assert.match(r, /!COACH_KEYS\.has\(key\)/);
  assert.match(r, /onboarding_dismissed: current\.filter\(\(k\) => k !== key\)/);
  assert.match(r, /\.eq\("id", user\.id\)/);
  const provider = src("providers", "onboarding-provider.tsx");
  assert.match(provider, /action: "restore", key/);
  assert.match(provider, /dismissedKeys: effective/);
});

test("the top menu has Dicas next to Revisão on desktop and a lamp below desktop width", () => {
  const h = src("components", "layout", "member-header.tsx");
  const nav = h.slice(h.indexOf('<nav className="hidden items-center lg:flex">'), h.indexOf("<EstudarMenu"));
  assert.match(nav, /href="\/app\/comecar"[\s\S]*Dicas\s*<\/Link>/);
  assert.match(h, /aria-label="Dicas da plataforma"[\s\S]{0,200}lg:hidden/);
});

test("closing a tip leaves a note saying where to reopen it, with Desfazer; the X still closes it", () => {
  const c = src("components", "onboarding", "coachmark.tsx");
  assert.match(c, /Dica fechada\. Você pode reabri-la em/);
  assert.match(c, /restore\(coachKey\)/);
  assert.match(c, /dismiss\(coachKey\);/);
});

test("the central page shows each tip's place and status, and restores one or all", () => {
  const p = src("app", "app", "comecar", "page.tsx");
  assert.match(p, /<TipStatus coachKey=\{key\} place=\{TIP_PLACES\[key\]\} \/>/);
  assert.match(p, /<RestoreAllTips \/>/);
  const s = src("components", "onboarding", "tip-status.tsx");
  assert.match(s, /Mostrar de novo na página/);
  assert.match(s, /Restaurar todas as dicas fechadas/);
});
