import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "node:crypto";
import { lifecycleEmailHtml } from "@/lib/email";

// Mirror of scripts/send-lifecycle-notifications.js, ported for Vercel Cron.
// Schedule: configured in app/vercel.json (daily 11:00 UTC = 08:00 BRT).
// Auth: requires header "Authorization: Bearer <CRON_SECRET>"; Vercel sends this automatically.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel — increase if cohort grows large

const FROM = "MedHelpSpace <pagamentos@medhelpspace.com.br>";
const APP_URL = "https://medhelpspace.com.br";
const MEDHELP_60D_MODULE_ID = 1;
const CONTEUDO_CATEGORY_SLUG = "conteudo";
// Minimum number of SM-2-due flashcards before we nudge the bell, so a stray
// card or two doesn't nag. Deduped to one notification per user per day.
const FLASHCARD_DUE_THRESHOLD = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().split("T")[0];
}
function offsetDateKey(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function fmtPtBr(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });
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
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;

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
      await resend.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html });
      push(`  SEND ${tag} ✓`);
    } catch (e) {
      // Roll back the reservation so the next cron run retries.
      await supabase.from("email_log").delete().eq("id", logId);
      push(`  FAIL ${tag} — ${e instanceof Error ? e.message : String(e)}`);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("user_id, cohort:cohorts(id, name, membership_starts_at, membership_ends_at, test_date)");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = (memberships ?? []).filter((m: any) => {
      const c = m.cohort;
      return c && c.membership_starts_at <= now && c.membership_ends_at >= now;
    });
    const userIds = active.map((m) => m.user_id as string);
    if (userIds.length === 0) return [];
    const [{ data: profiles }, { data: plans }] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name").in("id", userIds),
      supabase.from("study_plans")
        .select("user_id, intensity, email_daily_plan, email_weekly_summary, paused_until")
        .in("user_id", userIds),
    ]);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const planMap = new Map((plans ?? []).map((p) => [p.user_id, p]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return active.map((m: any) => {
      const profile = profileMap.get(m.user_id);
      return {
        user_id: m.user_id as string,
        email: (profile?.email as string | null) ?? null,
        display_name: (profile?.display_name as string | null) ?? null,
        cohort: m.cohort,
        plan: planMap.get(m.user_id) ?? null,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("cohort_id, unlock_date, cohort:cohorts(id, name, slug, test_date)")
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
          const displayName = (m.display_name || m.email.split("@")[0]).split(" ")[0];
          await sendOne({
            to: m.email,
            subject: "MedHelp 60D liberado — sua reta final começa agora",
            html: lifecycleEmailHtml({
              displayName,
              headline: "MedHelp 60D está liberado",
              body: `Faltam 60 dias para sua prova (${fmtPtBr(cohort.test_date)}). O módulo intensivo <strong>MedHelp 60D</strong> agora está disponível — Revalida Up, Memorecards e todos os recursos de reta final.`,
              ctaLabel: "Acessar MedHelp 60D →",
              ctaHref: `${APP_URL}/app`,
            }),
            userId: m.user_id, kind: "60d-unlock", contextId: String(cohort.id),
          });
          await insertNotification({
            userId: m.user_id, kind: "60d-unlock",
            title: "MedHelp 60D liberado",
            body: "Sua reta final começa agora — Revalida Up + Memorecards disponíveis.",
            href: "/app", icon: "lock", contextId: String(cohort.id),
          });
        }
        if (categoryId) {
          const title = `MedHelp 60D liberado — ${cohort.name}`;
          const { data: existing } = await supabase
            .from("announcements").select("id").eq("cohort_id", cohort.id).eq("title", title).maybeSingle();
          if (!existing) {
            await supabase.from("announcements").insert({
              title,
              body_html: `<p>Sua reta final começa agora. O módulo MedHelp 60D está disponível com Revalida Up, Memorecards e todos os recursos intensivos.</p>`,
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
        const displayName = (m.display_name || m.email.split("@")[0]).split(" ")[0];
        await sendOne({
          to: m.email,
          subject: "Seu acesso encerra em 7 dias",
          html: lifecycleEmailHtml({
            displayName,
            headline: "Seu acesso encerra em 7 dias",
            body: `Seu acesso à turma <strong>${cohort.name}</strong> termina em ${fmtPtBr(cohort.membership_ends_at.split("T")[0])}. Aproveite os últimos dias para revisar o que ficou pendente. Se quiser continuar estudando, você pode renovar agora.`,
            ctaLabel: "Renovar acesso →",
            ctaHref: `${APP_URL}/app/acesso-encerrado`,
          }),
          userId: m.user_id, kind: "expiry-warning-7d", contextId: String(cohort.id),
        });
        await insertNotification({
          userId: m.user_id, kind: "expiry-warning-7d",
          title: "Seu acesso encerra em 7 dias",
          body: `Renove para continuar estudando após ${fmtPtBr(cohort.membership_ends_at.split("T")[0])}.`,
          href: "/app/acesso-encerrado", icon: "alert", contextId: String(cohort.id),
        });
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
        const displayName = (m.display_name || m.email.split("@")[0]).split(" ")[0];
        await sendOne({
          to: m.email,
          subject: "Seu acesso ao MedHelpSpace foi encerrado",
          html: lifecycleEmailHtml({
            displayName,
            headline: "Acesso encerrado",
            body: `Seu acesso à turma <strong>${cohort.name}</strong> foi encerrado. Esperamos que você tenha tido uma ótima preparação. Para continuar estudando na próxima turma, é só renovar.`,
            ctaLabel: "Ver próximas turmas →",
            ctaHref: `${APP_URL}/app/acesso-encerrado`,
          }),
          userId: m.user_id, kind: "expiry-notice", contextId: String(cohort.id),
        });
        await insertNotification({
          userId: m.user_id, kind: "expiry-notice",
          title: "Acesso encerrado",
          body: "Renove para continuar estudando na próxima turma.",
          href: "/app/acesso-encerrado", icon: "alert", contextId: String(cohort.id),
        });
      }
    }
  }

  // ── [4/8] Weekly summary (Mondays only) ──────────────────────────────────
  push(`\n[4/8] Weekly summary…`);
  if (new Date().getDay() !== 1) push("  Skipped (not Monday).");
  else {
    const students = await getActiveStudents();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = students.filter((s: any) => {
      if (!s.plan) return true;
      if (s.plan.paused_until && s.plan.paused_until >= todayKey()) return false;
      return s.plan.email_weekly_summary !== false;
    });
    push(`  ${eligible.length} eligible students`);
    const now = new Date();
    const weekKey = `${now.getFullYear()}-W${String(Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, "0")}`;
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenIso = sevenDaysAgo.toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of eligible as any[]) {
      const [{ data: attempts }, { count: completions }] = await Promise.all([
        supabase.from("quiz_attempts").select("is_correct, created_at").eq("user_id", s.user_id).gte("created_at", sevenIso),
        supabase.from("lesson_completions").select("*", { count: "exact", head: true }).eq("user_id", s.user_id).gte("completed_at", sevenIso),
      ]);
      const totalQ = (attempts ?? []).length;
      const correctQ = (attempts ?? []).filter((a) => a.is_correct).length;
      const accuracy = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : null;
      const lessonsDone = completions ?? 0;
      const daysActive = new Set((attempts ?? []).map((a) => (a.created_at as string).split("T")[0])).size;
      const daysToExam = s.cohort?.test_date
        ? Math.max(0, Math.ceil((new Date(s.cohort.test_date).getTime() - Date.now()) / 86_400_000))
        : null;
      const displayName = (s.display_name || s.email.split("@")[0]).split(" ")[0];
      const body = totalQ === 0 && lessonsDone === 0
        ? `Esta semana foi corrida — sem registros de estudo. Sem culpa. Comece com uma sessão curta hoje, mesmo que sejam 15 minutos.`
        : `Esta semana: <strong>${totalQ} questões</strong> respondidas${accuracy != null ? ` com <strong>${accuracy}% de acerto</strong>` : ""}, <strong>${lessonsDone} aulas</strong> concluídas, em <strong>${daysActive} dia${daysActive !== 1 ? "s" : ""}</strong> ativos.${daysToExam != null ? ` Faltam ${daysToExam} dias para a prova.` : ""}`;
      await sendOne({
        to: s.email, subject: "Resumo semanal do seu plano de estudos",
        html: lifecycleEmailHtml({
          displayName, headline: "Seu resumo da semana", body,
          ctaLabel: "Ver plano e ajustar →", ctaHref: `${APP_URL}/app/plano`,
        }),
        userId: s.user_id, kind: "weekly-summary", contextId: weekKey,
      });
      await insertNotification({
        userId: s.user_id, kind: "weekly-summary",
        title: "Resumo da semana disponível",
        body: totalQ > 0 ? `${totalQ} questões · ${accuracy ?? 0}% acerto · ${lessonsDone} aulas` : "Veja o que você pode estudar essa semana.",
        href: "/app/plano", icon: "calendar", contextId: weekKey,
      });
    }
  }

  // ── [5/8] Daily plan email (opt-in) ──────────────────────────────────────
  push(`\n[5/8] Daily plan email (opt-in)…`);
  {
    const students = await getActiveStudents();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = students.filter((s: any) => {
      if (!s.plan) return false;
      if (s.plan.paused_until && s.plan.paused_until >= todayKey()) return false;
      return s.plan.email_daily_plan === true;
    });
    push(`  ${eligible.length} eligible (opt-in)`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of eligible as any[]) {
      const displayName = (s.display_name || s.email.split("@")[0]).split(" ")[0];
      const daysToExam = s.cohort?.test_date
        ? Math.max(0, Math.ceil((new Date(s.cohort.test_date).getTime() - Date.now()) / 86_400_000))
        : null;
      await sendOne({
        to: s.email, subject: "Seu plano de estudos para hoje",
        html: lifecycleEmailHtml({
          displayName, headline: "Plano de hoje",
          body: `Seu plano personalizado está pronto na plataforma. Abra para ver as tarefas específicas baseadas no seu desempenho atual.${daysToExam != null ? ` <br/><br/>Faltam <strong>${daysToExam} dias</strong> para sua prova.` : ""}`,
          ctaLabel: "Abrir plano de hoje →", ctaHref: `${APP_URL}/app/plano`,
        }),
        userId: s.user_id, kind: "daily-plan", contextId: todayKey(),
      });
    }
  }

  // ── [6/8] Missed-3-days nudge ────────────────────────────────────────────
  push(`\n[6/8] Missed-3-days nudge…`);
  {
    const students = await getActiveStudents();
    const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeIso = threeDaysAgo.toISOString();
    const userIds = students
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => !(s.plan?.paused_until && s.plan.paused_until >= todayKey()))
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
          const contextId = `last-${last.split("T")[0]}`;
          await insertNotification({
            userId, kind: "missed-3-days",
            title: "Que tal voltar com calma?",
            body: "Você não precisa fazer tudo hoje — apenas uma sessão curta já mantém o ritmo.",
            href: "/app/plano", icon: "calendar", contextId,
          });
          nudged++;
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
      const dates = [...new Set((recentAttempts ?? []).map((a) => (a.created_at as string).split("T")[0]))].sort().reverse();
      let streak = 0;
      const today = todayKey();
      let cursor = today;
      for (const d of dates) {
        if (d === cursor) {
          streak++;
          const prev = new Date(cursor); prev.setDate(prev.getDate() - 1);
          cursor = prev.toISOString().split("T")[0];
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
    }
  }

  // ── [8/8] Flashcards due for review ──────────────────────────────────────
  push(`\n[8/8] Flashcards due for review…`);
  {
    const today = todayKey();
    const students = await getActiveStudents();
    // Skip paused plans, mirroring the missed-3-days nudge.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = (students as any[]).filter(
      (s) => !(s.plan?.paused_until && s.plan.paused_until >= today),
    );
    let notified = 0;
    for (const s of eligible) {
      // Count cards whose SM-2 due_date has arrived (mirrors lib/study-plan derive).
      const { count: dueCount } = await supabase
        .from("flashcard_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", s.user_id)
        .lte("due_date", today);
      if ((dueCount ?? 0) < FLASHCARD_DUE_THRESHOLD) continue;
      // contextId = today → at most one flashcards-due bell per user per day.
      await insertNotification({
        userId: s.user_id, kind: "flashcards-due",
        title: "Flashcards para revisar",
        body: `Você tem ${dueCount} flashcards prontos para revisão hoje pelo SM-2.`,
        href: "/app/flashcards", icon: "calendar", contextId: today,
      });
      notified++;
    }
    push(`  Notified ${notified} students (threshold ${FLASHCARD_DUE_THRESHOLD}).`);
  }

  push(`\nDone.`);
  return NextResponse.json({ ok: true, log });
}
