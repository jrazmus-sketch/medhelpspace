import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "node:crypto";
import { getEmailSettings, getEmailTemplate } from "@/lib/email";
import { renderEmail, escapeHtml, type EmailTemplateRow } from "@/lib/email-render";
import { alertCronFailure } from "@/lib/admin/cron-alert";
import {
  todayKeyBR,
  toDateKeyBR,
  addDaysKey,
  diffDaysKey,
  dayOfWeekBR,
  dayOfWeekForKey,
} from "@/lib/br-date";
import { getDerivedPlanForUser } from "@/lib/study-plan/fetch";
import type { PlanItem } from "@/lib/study-plan/derive";

// Mirror of scripts/send-lifecycle-notifications.js, ported for Vercel Cron.
// Schedule: configured in app/vercel.json (daily 11:00 UTC = 08:00 BRT).
// Auth: requires header "Authorization: Bearer <CRON_SECRET>"; Vercel sends this automatically.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel — increase if cohort grows large

const MEDHELP_60D_MODULE_ID = 1;
const CONTEUDO_CATEGORY_SLUG = "conteudo";
// Minimum number of SM-2-due flashcards before we nudge the bell, so a stray
// card or two doesn't nag. Deduped to one notification per user per day.
const FLASHCARD_DUE_THRESHOLD = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

// "Today" is the STUDENT's today (America/São_Paulo), never the server's. The cron
// fires at 11:00 UTC = 08:00 BRT so UTC usually agrees, but every comparison below
// runs against a DATE column (unlock_date, pause_from/until) or becomes an email_log
// context_id, and those must be the Brazilian calendar date or a retry/re-deploy
// after 21:00 BRT would silently address tomorrow. See lib/br-date.ts.
function todayKey() {
  return todayKeyBR();
}
function offsetDateKey(days: number) {
  return addDaysKey(todayKeyBR(), days);
}
function fmtPtBr(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ── Pause state (study plan V2) ──────────────────────────────────────────────
//
// `study_plans.paused_until` was retired by schema-patch-study-plans-v2.sql — the
// column still exists for back-compat but nothing writes it any more, so gating on
// it meant vacationing students and students on a plantão day kept getting the
// daily plan and the missed-days nudge. Real pause state is three things, matching
// the precedence in lib/study-plan/derive.ts:
//   (a) an explicit study_plan_pauses date range covering today,
//   (b) today's weekday bit set in recurring_off_days (plantão pattern),
//   (c) today's weekday bit NOT set in available_days.
// Both masks are bit0=Sunday … bit6=Saturday.
const ALL_DAYS_MASK = 127;

type PlanRow = {
  user_id: string;
  available_days?: number | null;
  recurring_off_days?: number | null;
  email_daily_plan?: boolean | null;
  email_weekly_summary?: boolean | null;
};
type PauseRow = { user_id: string; pause_from: string; pause_until: string };

// A missing study_plans row is NOT paused (the student simply never customised a
// plan) — the weekly-summary default-ON semantics depend on that.
function isPausedToday(
  plan: PlanRow | null | undefined,
  pauses: PauseRow[],
  today: string = todayKeyBR(),
): boolean {
  if (isOnBreak(pauses, today)) return true;
  if (!plan) return false;
  const dayBit = 1 << dayOfWeekForKey(today);
  if (((plan.recurring_off_days ?? 0) & dayBit) !== 0) return true;
  if (((plan.available_days ?? ALL_DAYS_MASK) & dayBit) === 0) return true;
  return false;
}

/**
 * Only the explicit date-range pauses (vacation, exam week) — NOT the weekly
 * availability pattern.
 *
 * Use this for anything RETROSPECTIVE. "Today isn't one of your study days" is a
 * correct reason to skip today's task list; it is a wrong reason to withhold a
 * recap of the week that just happened. The weekly summary only runs on Mondays,
 * so gating it on `isPausedToday` would compose into "never" for every student
 * whose schedule excludes Monday — e.g. a Tue/Thu/weekend plan (available_days
 * = 85), which is a real, opted-in student in production.
 */
function isOnBreak(pauses: PauseRow[], today: string = todayKeyBR()): boolean {
  return pauses.some((p) => p.pause_from <= today && p.pause_until >= today);
}

// ── Daily-plan email body ────────────────────────────────────────────────────
//
// One table row per plan item. Table + inline styles only (no flexbox, no external
// CSS) — Gmail/Outlook strip everything else. Titles/subtitles come from DB content
// (topic names) so they are escaped before landing in the HTML.
function renderPlanItemsHtml(items: PlanItem[], appUrl: string): string {
  return items
    .map((item) => {
      // Item hrefs are site-relative ("/app/cardiologia/foo"); make them absolute
      // exactly the way renderEmail's resolveHref() does for cta_href.
      const href = item.href.startsWith("/") ? `${appUrl}${item.href}` : item.href;
      const minutes = Math.max(1, Math.round(item.estimatedMinutes));
      return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 10px;background:#f9f5ff;border-radius:8px;">
  <tr>
    <td style="padding:13px 16px;">
      <a href="${href}" style="font-size:15px;font-weight:700;color:#7a1d91;text-decoration:none;line-height:1.4;">${escapeHtml(item.title)}</a>
      <p style="margin:5px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">${escapeHtml(item.subtitle)} &nbsp;·&nbsp; ~${minutes} min</p>
    </td>
  </tr>
</table>`;
    })
    .join("\n");
}

type LogLine = string;
const log: LogLine[] = [];
function push(line: string) { log.push(line); }

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Vercel Cron auth: Bearer header must match CRON_SECRET env
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`, "utf8");
  const actual = Buffer.from(authHeader ?? "", "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;

  // Email content now lives in the DB (email_templates / email_settings, editable in
  // the admin panel). Fetch settings + every template this cron sends ONCE per run —
  // not per recipient — so a large cohort doesn't re-fetch the same rows N times.
  const settings = await getEmailSettings();
  const FROM = settings.from_address;
  const EMAIL_KINDS = [
    "60d-unlock",
    "expiry-warning-7d",
    "expiry-notice",
    "weekly-summary",
    "daily-plan",
  ] as const;
  const templateList = await Promise.all(EMAIL_KINDS.map((k) => getEmailTemplate(k)));
  const templates: Record<string, EmailTemplateRow> = {};
  EMAIL_KINDS.forEach((k, i) => {
    templates[k] = templateList[i];
  });

  push(`Lifecycle notifications — APPLY (Vercel Cron)`);
  push(`Today: ${todayKey()}`);
  if (!resend) push(`WARNING: RESEND_API_KEY missing — emails will not send`);

  // ── Shared helpers (closure over supabase/resend) ────────────────────────

  // Reserve an email_log slot by relying on the UNIQUE (user_id, kind, context_id)
  // constraint. Returns the new row id, or null if a row already exists (duplicate).
  // The insert-first pattern means we hold the "lock" before the side-effect, so
  // concurrent runs don't double-send.
  async function reserveEmailLog(
    userId: string, kind: string, contextId: string,
  ): Promise<number | null> {
    const { data, error } = await supabase
      .from("email_log")
      .insert({ user_id: userId, kind, context_id: contextId })
      .select("id")
      .single();
    // 23505 = unique_violation → already sent
    if (error?.code === "23505") return null;
    if (error) throw error;
    return (data?.id as number) ?? null;
  }

  let sentCount = 0;
  let failedCount = 0;

  // Roll back an email_log reservation and record the failure. Shared by both the
  // "Resend returned {error} without throwing" path and the thrown-exception path,
  // so a rejected send is never left marked as reserved/sent.
  async function rollbackAndFail(logId: number, tag: string, reason: string) {
    await supabase.from("email_log").delete().eq("id", logId);
    push(`  FAIL ${tag} — ${reason}`);
    failedCount++;
  }

  async function sendOne(opts: {
    to: string; subject: string; html: string; userId: string; kind: string; contextId: string;
  }) {
    const tag = `[${opts.kind} → ${opts.to}]`;
    // Fail loud if Resend is unconfigured — skip BEFORE reserving the log slot,
    // so a missing key doesn't silently mark emails as "sent".
    if (!resend) { push(`  SKIP ${tag} — no RESEND_API_KEY`); return; }
    const logId = await reserveEmailLog(opts.userId, opts.kind, opts.contextId);
    if (logId === null) { push(`  SKIP ${tag} — already sent`); return; }
    try {
      // The Resend SDK reports API rejections (invalid recipient, rate limit, etc.)
      // via the returned `error` field WITHOUT throwing (see lib/email.ts:138-141) —
      // must check it explicitly or a rejected send is logged as sent.
      const { error } = await resend.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html });
      if (error) {
        await rollbackAndFail(logId, tag, error.message ?? "send_error");
        return;
      }
      push(`  SEND ${tag} ✓`);
      sentCount++;
    } catch (e) {
      await rollbackAndFail(logId, tag, e instanceof Error ? e.message : String(e));
    }
  }

  async function insertNotification(opts: {
    userId: string; kind: string; title: string; body: string;
    href: string | null; icon: string | null; contextId: string;
  }) {
    const bellKind = `bell-${opts.kind}`;
    const logId = await reserveEmailLog(opts.userId, bellKind, opts.contextId);
    if (logId === null) return; // already delivered
    const { error } = await supabase.from("user_notifications").insert({
      user_id: opts.userId, kind: opts.kind, title: opts.title,
      body: opts.body, href: opts.href, icon: opts.icon,
    });
    if (error) {
      // Roll back the reservation so the next run retries.
      await supabase.from("email_log").delete().eq("id", logId);
    }
  }

  async function getCohortMembers(cohortId: number) {
    const { data: memberships } = await supabase
      .from("user_cohort_memberships").select("user_id").eq("cohort_id", cohortId);
    const userIds = (memberships ?? []).map((m) => m.user_id as string);
    if (userIds.length === 0) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds);
    return (profiles ?? [])
      .filter((p): p is { id: string; email: string; display_name: string | null } =>
        typeof p.email === "string" && p.email.length > 0,
      )
      .map((p) => ({ user_id: p.id, email: p.email, display_name: p.display_name }));
  }

  async function getActiveStudents() {
    const now = new Date().toISOString();
    const { data: memberships } = await supabase
      .from("user_cohort_memberships")
      .select("user_id, cohort:cohorts(id, name, membership_starts_at, membership_ends_at, test_date, date_confirmed)");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = (memberships ?? []).filter((m: any) => {
      const c = m.cohort;
      return c && c.membership_starts_at <= now && c.membership_ends_at >= now;
    });
    const userIds = active.map((m) => m.user_id as string);
    if (userIds.length === 0) return [];
    const today = todayKey();
    // NOTE: these `.in("user_id", userIds)` selects are subject to PostgREST's
    // 1000-row cap and would silently truncate on a large membership. Fine at the
    // current member count; paginate with .range() if the cohort ever outgrows it.
    const [{ data: profiles }, { data: plans }, { data: pauses }] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name").in("id", userIds),
      supabase.from("study_plans")
        // paused_until deliberately NOT selected — retired by study-plans-v2.
        .select("user_id, intensity, email_daily_plan, email_weekly_summary, available_days, recurring_off_days")
        .in("user_id", userIds),
      supabase.from("study_plan_pauses")
        .select("user_id, pause_from, pause_until")
        .in("user_id", userIds)
        .lte("pause_from", today)
        .gte("pause_until", today),
    ]);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const planMap = new Map((plans ?? []).map((p) => [p.user_id, p as PlanRow]));
    const pauseMap = new Map<string, PauseRow[]>();
    for (const p of (pauses ?? []) as PauseRow[]) {
      const list = pauseMap.get(p.user_id);
      if (list) list.push(p);
      else pauseMap.set(p.user_id, [p]);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return active.map((m: any) => {
      const profile = profileMap.get(m.user_id);
      return {
        user_id: m.user_id as string,
        email: (profile?.email as string | null) ?? null,
        display_name: (profile?.display_name as string | null) ?? null,
        cohort: m.cohort,
        plan: planMap.get(m.user_id) ?? null,
        pauses: pauseMap.get(m.user_id) ?? [],
      };
    }).filter((s): s is typeof s & { email: string } =>
      typeof s.email === "string" && s.email.length > 0,
    );
  }

  // ── [1/8] 60D unlock ─────────────────────────────────────────────────────
  push(`\n[1/8] Checking 60D module unlocks…`);
  {
    const { data: access } = await supabase
      .from("cohort_module_access")
      .select("cohort_id, unlock_date, cohort:cohorts(id, name, slug, test_date, date_confirmed)")
      .eq("content_module_id", MEDHELP_60D_MODULE_ID)
      .eq("unlock_date", todayKey());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cohorts = ((access ?? []) as any[]).filter((a) => a.cohort);
    if (cohorts.length === 0) push("  No cohorts unlocking 60D today.");
    else {
      const { data: cat } = await supabase
        .from("announcement_categories").select("id").eq("slug", CONTEUDO_CATEGORY_SLUG).single();
      const categoryId = cat?.id as number | undefined;
      for (const a of cohorts) {
        const cohort = a.cohort;
        push(`  Cohort: ${cohort.name} (${cohort.id})`);
        const members = await getCohortMembers(cohort.id);
        push(`    ${members.length} members`);
        for (const m of members) {
          try {
            const displayName = (m.display_name || m.email.split("@")[0]).split(" ")[0];
            // Never mention the exam date in this email until the board has
            // actually confirmed it — testDate carries its own leading " (…)"
            // so the sentence still reads cleanly when it's blank.
            const { subject, html } = renderEmail(templates["60d-unlock"], settings, {
              displayName,
              testDate: cohort.date_confirmed ? ` (${fmtPtBr(cohort.test_date)})` : "",
            });
            await sendOne({
              to: m.email,
              subject,
              html,
              userId: m.user_id, kind: "60d-unlock", contextId: String(cohort.id),
            });
            await insertNotification({
              userId: m.user_id, kind: "60d-unlock",
              title: "MedHelp 60D liberado",
              body: "Sua reta final começa agora — Fórmula MedHelp + Memorecards disponíveis.",
              href: "/app", icon: "lock", contextId: String(cohort.id),
            });
          } catch (e) {
            push(`    ERROR [60d-unlock → ${m.email}] — ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (categoryId) {
          const title = `MedHelp 60D liberado — ${cohort.name}`;
          const { data: existing } = await supabase
            .from("announcements").select("id").eq("cohort_id", cohort.id).eq("title", title).maybeSingle();
          if (!existing) {
            await supabase.from("announcements").insert({
              title,
              body_html: `<p>Sua reta final começa agora. O módulo MedHelp 60D está disponível com Fórmula MedHelp, Memorecards e todos os recursos intensivos.</p>`,
              category_id: categoryId, priority: "urgent", status: "published", pinned: true,
              cohort_id: cohort.id,
            });
            push(`    Created in-app announcement`);
          }
        }
      }
    }
  }

  // ── [2/8] 7-day expiry warning ───────────────────────────────────────────
  push(`\n[2/8] Checking memberships ending in 7 days…`);
  {
    const targetEnd = offsetDateKey(7);
    const { data: cohorts } = await supabase
      .from("cohorts")
      .select("id, name, slug, membership_ends_at")
      .gte("membership_ends_at", `${targetEnd}T00:00:00`)
      .lte("membership_ends_at", `${targetEnd}T23:59:59`);
    if (!cohorts || cohorts.length === 0) push("  None.");
    else for (const cohort of cohorts) {
      push(`  Cohort: ${cohort.name} (${cohort.id})`);
      const members = await getCohortMembers(cohort.id);
      for (const m of members) {
        try {
          const displayName = (m.display_name || m.email.split("@")[0]).split(" ")[0];
          const { subject, html } = renderEmail(templates["expiry-warning-7d"], settings, {
            displayName,
            cohortName: cohort.name,
            endsAt: fmtPtBr(cohort.membership_ends_at.split("T")[0]),
          });
          await sendOne({
            to: m.email,
            subject,
            html,
            userId: m.user_id, kind: "expiry-warning-7d", contextId: String(cohort.id),
          });
          await insertNotification({
            userId: m.user_id, kind: "expiry-warning-7d",
            title: "Seu acesso encerra em 7 dias",
            body: `Renove para continuar estudando após ${fmtPtBr(cohort.membership_ends_at.split("T")[0])}.`,
            href: "/app/acesso-encerrado", icon: "alert", contextId: String(cohort.id),
          });
        } catch (e) {
          push(`    ERROR [expiry-warning-7d → ${m.email}] — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  // ── [3/8] Expiry notice (today) ──────────────────────────────────────────
  push(`\n[3/8] Checking memberships ending today…`);
  {
    const today = todayKey();
    const { data: cohorts } = await supabase
      .from("cohorts")
      .select("id, name, slug, membership_ends_at")
      .gte("membership_ends_at", `${today}T00:00:00`)
      .lte("membership_ends_at", `${today}T23:59:59`);
    if (!cohorts || cohorts.length === 0) push("  None.");
    else for (const cohort of cohorts) {
      push(`  Cohort: ${cohort.name} (${cohort.id})`);
      const members = await getCohortMembers(cohort.id);
      for (const m of members) {
        try {
          const displayName = (m.display_name || m.email.split("@")[0]).split(" ")[0];
          const { subject, html } = renderEmail(templates["expiry-notice"], settings, {
            displayName,
            cohortName: cohort.name,
          });
          await sendOne({
            to: m.email,
            subject,
            html,
            userId: m.user_id, kind: "expiry-notice", contextId: String(cohort.id),
          });
          await insertNotification({
            userId: m.user_id, kind: "expiry-notice",
            title: "Acesso encerrado",
            body: "Renove para continuar estudando na próxima turma.",
            href: "/app/acesso-encerrado", icon: "alert", contextId: String(cohort.id),
          });
        } catch (e) {
          push(`    ERROR [expiry-notice → ${m.email}] — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  // ── [4/8] Weekly summary (Mondays only) ──────────────────────────────────
  push(`\n[4/8] Weekly summary…`);
  if (dayOfWeekBR() !== 1) push("  Skipped (not Monday).");
  else {
    const students = await getActiveStudents();
    // Default ON: a student with no study_plans row still gets the summary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = students.filter((s: any) => {
      // isOnBreak, NOT isPausedToday — this recap must reach students whose weekly
      // schedule excludes Monday. See the note on isOnBreak.
      if (isOnBreak(s.pauses)) return false;
      if (!s.plan) return true;
      return s.plan.email_weekly_summary !== false;
    });
    push(`  ${eligible.length} eligible students`);
    const now = new Date();
    const weekKey = `${now.getFullYear()}-W${String(Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, "0")}`;
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenIso = sevenDaysAgo.toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of eligible as any[]) {
      try {
        const [{ data: attempts }, { count: completions }] = await Promise.all([
          supabase.from("quiz_attempts").select("is_correct, created_at").eq("user_id", s.user_id).gte("created_at", sevenIso),
          supabase.from("lesson_completions").select("*", { count: "exact", head: true }).eq("user_id", s.user_id).gte("completed_at", sevenIso),
        ]);
        const totalQ = (attempts ?? []).length;
        const correctQ = (attempts ?? []).filter((a) => a.is_correct).length;
        const accuracy = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : null;
        const lessonsDone = completions ?? 0;
        // Bucket by the student's Brazilian day. On the raw UTC prefix, one
        // evening straddling 21:00 BRT counted as two active days.
        const daysActive = new Set((attempts ?? []).map((a) => toDateKeyBR(a.created_at as string))).size;
        // The countdown stays hidden until the banca confirms the date — same rule
        // the rest of the product follows (60d-unlock email, cohort-timing copy).
        const daysToExam = s.cohort?.test_date && s.cohort?.date_confirmed
          ? Math.max(0, diffDaysKey(todayKey(), toDateKeyBR(s.cohort.test_date)))
          : null;
        const displayName = (s.display_name || s.email.split("@")[0]).split(" ")[0];
        const body = totalQ === 0 && lessonsDone === 0
          ? `Esta semana foi corrida — sem registros de estudo. Sem culpa. Comece com uma sessão curta hoje, mesmo que sejam 15 minutos.`
          : `Esta semana: <strong>${totalQ} questões</strong> respondidas${accuracy != null ? ` com <strong>${accuracy}% de acerto</strong>` : ""}, <strong>${lessonsDone} aulas</strong> concluídas, em <strong>${daysActive} dia${daysActive !== 1 ? "s" : ""}</strong> ativos.${daysToExam != null ? ` Faltam ${daysToExam} dias para a prova.` : ""}`;
        const { subject, html } = renderEmail(templates["weekly-summary"], settings, {
          displayName, summaryBody: body,
        });
        await sendOne({
          to: s.email, subject, html,
          userId: s.user_id, kind: "weekly-summary", contextId: weekKey,
        });
        await insertNotification({
          userId: s.user_id, kind: "weekly-summary",
          title: "Resumo da semana disponível",
          body: totalQ > 0 ? `${totalQ} questões · ${accuracy ?? 0}% acerto · ${lessonsDone} aulas` : "Veja o que você pode estudar essa semana.",
          href: "/app/plano", icon: "calendar", contextId: weekKey,
        });
      } catch (e) {
        push(`  ERROR [weekly-summary → ${s.email}] — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ── [5/8] Daily plan email (opt-in) ──────────────────────────────────────
  push(`\n[5/8] Daily plan email (opt-in)…`);
  {
    const students = await getActiveStudents();
    // Opt-in only: no study_plans row means the student never enabled this.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = students.filter((s: any) => {
      if (!s.plan) return false;
      if (isPausedToday(s.plan, s.pauses)) return false;
      return s.plan.email_daily_plan === true;
    });
    push(`  ${eligible.length} eligible (opt-in)`);
    // Each send derives the student's plan, which costs ~14 queries and re-reads
    // the whole content catalog (>1000 pages) — ~0.5s per student, all inside a
    // maxDuration = 60 function. A Vercel hard timeout is NOT a JS exception, so
    // the outer try/catch never fires and alertCronFailure never sends: the run
    // would die silently AND starve sections [6/8]–[8/8], which come after this
    // one. Until the catalog fetch is hoisted out of the loop, cap the batch and
    // say out loud who was deferred — a silent truncation would read as success.
    const DAILY_PLAN_BATCH_CAP = 40;
    const batch = eligible.slice(0, DAILY_PLAN_BATCH_CAP);
    if (eligible.length > batch.length) {
      push(`  WARNING: capped at ${batch.length}; ${eligible.length - batch.length} students NOT sent today. Hoist the catalog fetch out of getDerivedPlanForUser before raising this.`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of batch as any[]) {
      try {
        const displayName = (s.display_name || s.email.split("@")[0]).split(" ")[0];
        // The email carries the ACTUAL plan, so it is derived per student with the
        // same engine /app/plano renders from. If the derivation says paused (a
        // pause the coarse filter above can't see) or produces nothing to do, send
        // nothing at all — an empty "here's your plan" is worse than silence.
        const plan = await getDerivedPlanForUser(s.user_id);
        if (!plan || plan.paused || plan.items.length === 0) {
          const why = !plan ? "sem plano derivado" : plan.paused ? "plano pausado hoje" : "nenhum item para hoje";
          push(`  SKIP [daily-plan → ${s.email}] — ${why}`);
          continue;
        }
        // Countdown only once the banca confirmed the date (see weekly summary).
        const daysToExam = s.cohort?.test_date && s.cohort?.date_confirmed
          ? Math.max(0, diffDaysKey(todayKey(), toDateKeyBR(s.cohort.test_date)))
          : null;
        const { subject, html } = renderEmail(templates["daily-plan"], settings, {
          displayName,
          planItems: renderPlanItemsHtml(plan.items, settings.app_url),
          totalMinutes: String(Math.round(plan.totalEstimatedMinutes)),
          daysToExamLine:
            daysToExam != null
              ? ` Faltam <strong>${daysToExam} dias</strong> para a sua prova.`
              : "",
        });
        await sendOne({
          to: s.email, subject, html,
          userId: s.user_id, kind: "daily-plan", contextId: todayKey(),
        });
      } catch (e) {
        push(`  ERROR [daily-plan → ${s.email}] — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ── [6/8] Missed-3-days nudge ────────────────────────────────────────────
  push(`\n[6/8] Missed-3-days nudge…`);
  {
    const students = await getActiveStudents();
    const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeIso = threeDaysAgo.toISOString();
    // A student on vacation or on a plantão day is not "missing" days — never nudge
    // them for a gap their own plan told us to expect.
    const userIds = students
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => !isPausedToday(s.plan, s.pauses))
      .map((s) => s.user_id as string);

    let nudged = 0;
    if (userIds.length > 0) {
      // Single grouped query instead of N×2 per-user lookups.
      const { data: activityRows, error: actErr } = await supabase
        .rpc("get_last_activity_per_user", { user_ids: userIds });
      if (actErr) {
        push(`  ERROR fetching last activity: ${actErr.message}`);
      } else {
        const activityMap = new Map<string, string>(
          (activityRows ?? []).map((r: { user_id: string; last_activity: string }) =>
            [r.user_id, r.last_activity] as [string, string],
          ),
        );
        for (const userId of userIds) {
          const last = activityMap.get(userId);
          if (!last) continue;          // never studied — skip
          if (last > threeIso) continue; // active within 3 days — skip
          try {
            const contextId = `last-${last.split("T")[0]}`;
            await insertNotification({
              userId, kind: "missed-3-days",
              title: "Que tal voltar com calma?",
              body: "Você não precisa fazer tudo hoje — apenas uma sessão curta já mantém o ritmo.",
              href: "/app/plano", icon: "calendar", contextId,
            });
            nudged++;
          } catch (e) {
            push(`  ERROR [missed-3-days → ${userId}] — ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
    push(`  Nudged ${nudged} students.`);
  }

  // ── [7/8] Milestones ─────────────────────────────────────────────────────
  push(`\n[7/8] Milestone checks…`);
  {
    const students = await getActiveStudents();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of students as any[]) {
      try {
        const { count: totalQ } = await supabase
          .from("quiz_attempts").select("*", { count: "exact", head: true }).eq("user_id", s.user_id);
        if ((totalQ ?? 0) >= 100) {
          await insertNotification({
            userId: s.user_id, kind: "milestone-100q",
            title: "100 questões respondidas",
            body: "Você passou da marca de 100 questões. Continue assim.",
            href: "/app/relatorio", icon: "trophy", contextId: "100",
          });
        }
        const { data: recentAttempts } = await supabase
          .from("quiz_attempts").select("created_at").eq("user_id", s.user_id)
          .order("created_at", { ascending: false }).limit(200);
        // Brazilian days — a UTC prefix credits a 22:00 BRT session to tomorrow
        // and inflates the streak against today's cursor.
        const dates = [...new Set((recentAttempts ?? []).map((a) => toDateKeyBR(a.created_at as string)))].sort().reverse();
        let streak = 0;
        const today = todayKey();
        let cursor = today;
        for (const d of dates) {
          if (d === cursor) {
            streak++;
            cursor = addDaysKey(cursor, -1);
          } else if (d < cursor) break;
        }
        if (streak >= 30) {
          await insertNotification({
            userId: s.user_id, kind: "milestone-streak-30",
            title: "30 dias de sequência",
            body: "Disciplina impressionante. Você está construindo um hábito de verdade.",
            href: "/app/relatorio", icon: "trophy", contextId: `streak-30-${today}`,
          });
        } else if (streak >= 7) {
          await insertNotification({
            userId: s.user_id, kind: "milestone-streak-7",
            title: "7 dias seguidos",
            body: "Uma semana inteira de estudo. Mantenha o ritmo.",
            href: "/app/relatorio", icon: "trophy", contextId: `streak-7-${today}`,
          });
        }
      } catch (e) {
        push(`  ERROR [milestones → ${s.user_id}] — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ── [8/8] Review items due ───────────────────────────────────────────────
  push(`\n[8/8] Review items due…`);
  {
    const today = todayKey();
    const students = await getActiveStudents();
    // Skip paused plans, mirroring the missed-3-days nudge.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = (students as any[]).filter(
      (s) => !isPausedToday(s.plan, s.pauses, today),
    );
    let notified = 0;
    for (const s of eligible) {
      try {
        // Count all SM-2-due review items (flashcards + quiz + memorecards) from the
        // unified review_schedule (flashcard_progress is frozen).
        const { count: dueCount } = await supabase
          .from("review_schedule")
          .select("*", { count: "exact", head: true })
          .eq("user_id", s.user_id)
          // Revalida types only — ClinAct reviews never trigger this bell.
          .in("item_type", ["flashcard", "quiz_question", "memorecard"])
          .eq("suspended", false)
          .lte("due_date", today);
        if ((dueCount ?? 0) < FLASHCARD_DUE_THRESHOLD) continue;
        // contextId = today → at most one review-due bell per user per day.
        await insertNotification({
          userId: s.user_id, kind: "flashcards-due",
          title: "Itens para revisar",
          body: `Você tem ${dueCount} itens prontos para revisão hoje.`,
          href: "/app/revisao", icon: "calendar", contextId: today,
        });
        notified++;
      } catch (e) {
        push(`  ERROR [flashcards-due → ${s.user_id}] — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    push(`  Notified ${notified} students (threshold ${FLASHCARD_DUE_THRESHOLD}).`);
  }

  push(`\nDone. Sent ${sentCount}, failed ${failedCount}.`);
  return NextResponse.json({ ok: true, log, sent: sentCount, failed: failedCount });
  } catch (err) {
    // The run itself crashed outside any per-item try/catch above (e.g. template
    // fetch failed) — every section already isolates per-recipient errors into the
    // `log`, so reaching here means the whole cron aborted, not just one send.
    await alertCronFailure("lifecycle-notifications", err);
    return NextResponse.json({ error: "cron_failed", log }, { status: 500 });
  }
}
