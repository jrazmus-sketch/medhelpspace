/**
 * Notificações box on the Revalida home (Karina 2026-11-20, 23h28 BRT): the X only HIDES the box (saved on the account),
 * a short notice with "Desfazer" says where to bring it back, and the bell offers "Mostrar notificações na página
 * inicial" while it is hidden. Hiding never deletes, dismisses or marks a notification as read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const root = (...p: string[]) => readFileSync(path.join(process.cwd(), "..", ...p), "utf8");

test("the X hides the BOX — on every announcement, not only the welcome — and never dismisses anything", () => {
  const s = src("components", "dashboard", "notification-strip-client.tsx");
  assert.match(s, /onClick=\{\(\) => setBoxHidden\(true\)\}/);
  assert.doesNotMatch(s, /latest\.is_welcome &&/);
  assert.doesNotMatch(s, /dismissAnnouncement/);
  assert.doesNotMatch(src("actions", "admin.ts"), /export async function dismissAnnouncement/);
});

test("closing shows her notice, verbatim, with Desfazer", () => {
  const s = src("components", "dashboard", "notification-strip-client.tsx");
  assert.match(s, /Notificações ocultadas da página inicial\. Você pode restaurá-las pelo sininho no topo da tela\./);
  assert.match(s, /onClick=\{\(\) => setBoxHidden\(false\)\}[\s\S]{0,200}Desfazer/);
});

test("the choice lives on the account and touches nothing else (no read mark, no dismissal, no notification)", () => {
  const a = src("actions", "home-notifications.ts");
  assert.match(a, /\.update\(\{ home_notifications_hidden: hidden \}\)\.eq\("id", user\.id\)/);
  assert.doesNotMatch(a, /announcement_reads|announcement_dismissals|user_notifications|\.delete\(/);
  // "use server" files may export only async functions
  assert.doesNotMatch(a.replace(/export async function/g, ""), /export /);
});

test("an announcement is never filtered out by a dismissal any more (box AND bell keep it)", () => {
  const l = src("lib", "announcements.ts");
  assert.doesNotMatch(l, /\.filter\(\(r\) => !\(r\.is_welcome && dismissedIds\.has/);
});

test("the bell offers the restore only while the box is hidden and there is something to show", () => {
  const b = src("components", "layout", "notification-bell.tsx");
  assert.match(b, /\{boxHidden && \([\s\S]{0,600}Mostrar notificações na página inicial/);
  assert.match(b, /announceHomeNotifications\(false\)/);
  const f = src("lib", "notifications-feed.ts");
  assert.match(f, /if \(announcements\.length > 0\) \{[\s\S]{0,300}home_notifications_hidden/);
});

test("the patch adds the account column and turns every earlier welcome dismissal into 'box hidden'", () => {
  const p = root("schema-patch-home-notifications-hidden.sql");
  assert.match(p, /ADD COLUMN IF NOT EXISTS home_notifications_hidden boolean NOT NULL DEFAULT false/);
  assert.match(p, /SET home_notifications_hidden = true[\s\S]*announcement_dismissals[\s\S]*a\.is_welcome/);
  assert.doesNotMatch(p, /DELETE FROM announcement_dismissals/i);
});
