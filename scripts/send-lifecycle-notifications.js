#!/usr/bin/env node
'use strict';

/**
 * ⚠️  DEPRECATED — DO NOT USE.
 *
 * The production lifecycle-email path is the Vercel Cron route:
 *   app/src/app/api/cron/lifecycle-notifications/route.ts
 *
 * Email content (subject + body + CTA) now lives in the DB tables
 * `email_templates` / `email_settings` and is admin-editable in the panel; it is
 * rendered by the shared pure module app/src/lib/email-render.ts. This script
 * still carries the OLD hardcoded copy, so running it would send STALE content
 * that diverges from whatever the admin has edited. Left here only for reference.
 * Do not port the render logic into this file — that would re-introduce the very
 * duplication the DB-template refactor removed.
 */

/**
 * Daily lifecycle notification script.
 *
 * Runs three checks:
 *   1) 60D module unlocked today  → email + in-app announcement to all cohort members
 *   2) Membership ends in 7 days  → warning email
 *   3) Membership ended today     → expiry notice email
 *
 * Idempotent via email_log table (won't double-send).
 *
 * Usage:
 *   node scripts/send-lifecycle-notifications.js          # dry run, prints what would happen
 *   node scripts/send-lifecycle-notifications.js --apply  # actually send + log
 *
 * Schedule with cron / GitHub Actions / Vercel Cron (recommended: once daily 08:00 BRT).
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// ── Load app/.env.local ──────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', 'app', '.env.local');
  let raw;
  try { raw = fs.readFileSync(envPath, 'utf8'); }
  catch { return; }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = 'MedHelpSpace <contato@medhelpspace.com.br>';
const APP_URL = 'https://medhelpspace.com.br';
const MEDHELP_60D_MODULE_ID = 1;
const CONTEUDO_CATEGORY_SLUG = 'conteudo';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function offsetDateKey(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function fmtPtBr(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

async function getCohortMembers(cohortId) {
  // Get user_ids in cohort, then fetch their emails + names
  const { data: memberships } = await supabase
    .from('user_cohort_memberships')
    .select('user_id')
    .eq('cohort_id', cohortId);
  const userIds = (memberships ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map((users?.users ?? []).map((u) => [u.id, u]));

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return userIds.map((id) => {
    const user = userMap.get(id);
    const profile = profileMap.get(id);
    return {
      user_id: id,
      email: user?.email ?? null,
      display_name: profile?.display_name ?? null,
    };
  }).filter((m) => m.email);
}

async function alreadySent(userId, kind, contextId) {
  const { data } = await supabase
    .from('email_log')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('context_id', contextId)
    .maybeSingle();
  return !!data;
}

async function logSent(userId, kind, contextId) {
  if (!APPLY) return;
  await supabase.from('email_log').insert({
    user_id: userId, kind, context_id: contextId,
  });
}

async function sendOne({ to, subject, html, userId, kind, contextId }) {
  const tag = `[${kind} → ${to}]`;
  if (await alreadySent(userId, kind, contextId)) {
    console.log(`  SKIP ${tag} — already sent`);
    return;
  }
  if (!APPLY) {
    console.log(`  DRY  ${tag}`);
    return;
  }
  if (!resend) {
    console.log(`  SKIP ${tag} — no RESEND_API_KEY`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    await logSent(userId, kind, contextId);
    console.log(`  SEND ${tag} ✓`);
  } catch (e) {
    console.error(`  FAIL ${tag} — ${e.message}`);
  }
}

/**
 * Insert a row into user_notifications (the bell). Idempotent via the same
 * email_log table: we use a synthetic kind 'bell-{kind}' so the bell version
 * dedupe key never collides with the email dedupe key.
 */
async function insertNotification({ userId, kind, title, body, href, icon, contextId }) {
  const bellKind = `bell-${kind}`;
  if (await alreadySent(userId, bellKind, contextId)) {
    return;
  }
  if (!APPLY) {
    console.log(`  DRY  [bell:${kind} → ${userId}]`);
    return;
  }
  await supabase.from('user_notifications').insert({
    user_id: userId, kind, title, body, href, icon,
  });
  await logSent(userId, bellKind, contextId);
}

/**
 * Get all users who have an active membership in any cohort, with their
 * email, display_name, and study_plans preferences (if any).
 */
async function getActiveStudents() {
  const now = new Date().toISOString();
  const { data: memberships } = await supabase
    .from('user_cohort_memberships')
    .select('user_id, cohort:cohorts(id, name, membership_starts_at, membership_ends_at, test_date)');

  const active = (memberships ?? []).filter((m) => {
    const c = m.cohort;
    return c && c.membership_starts_at <= now && c.membership_ends_at >= now;
  });
  const userIds = active.map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map((users?.users ?? []).map((u) => [u.id, u]));

  const [{ data: profiles }, { data: plans }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', userIds),
    supabase.from('study_plans').select('user_id, intensity, email_daily_plan, email_weekly_summary, paused_until').in('user_id', userIds),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const planMap = new Map((plans ?? []).map((p) => [p.user_id, p]));

  return active.map((m) => {
    const user = userMap.get(m.user_id);
    return {
      user_id: m.user_id,
      email: user?.email ?? null,
      display_name: profileMap.get(m.user_id)?.display_name ?? null,
      cohort: m.cohort,
      plan: planMap.get(m.user_id) ?? null,
    };
  }).filter((s) => s.email);
}

// ── Email templates (inlined; same structure as lib/email.ts) ────────────────

function lifecycleHtml({ displayName, headline, body, ctaLabel, ctaHref }) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>${headline}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
<tr><td style="background:#7a1d91;padding:28px 40px;"><p style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px;">MedHelpSpace Revalida</p></td></tr>
<tr><td style="padding:40px;">
<p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em;font-weight:600;">Olá, ${displayName}</p>
<p style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-.4px;line-height:1.2;">${headline}</p>
<p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.65;">${body}</p>
<table cellpadding="0" cellspacing="0"><tr><td style="background:#7a1d91;border-radius:10px;">
<a href="${ctaHref}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:-.2px;">${ctaLabel}</a>
</td></tr></table></td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;"><p style="margin:0;font-size:11.5px;color:#9ca3af;">MedHelpSpace Revalida · <a href="${APP_URL}" style="color:#7a1d91;text-decoration:none;">medhelpspace.com.br</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

// ── Trigger 1: 60D unlocked today ────────────────────────────────────────────

async function process60DUnlock() {
  console.log('\n[1/7] Checking 60D module unlocks…');
  const { data: access } = await supabase
    .from('cohort_module_access')
    .select('cohort_id, unlock_date, cohort:cohorts(id, name, slug, test_date)')
    .eq('content_module_id', MEDHELP_60D_MODULE_ID)
    .eq('unlock_date', todayKey());

  const cohorts = (access ?? []).filter((a) => a.cohort);
  if (cohorts.length === 0) {
    console.log('  No cohorts unlocking 60D today.');
    return;
  }

  // Find Conteúdo category for the announcement insert
  const { data: cat } = await supabase
    .from('announcement_categories')
    .select('id')
    .eq('slug', CONTEUDO_CATEGORY_SLUG)
    .single();
  const categoryId = cat?.id;

  for (const a of cohorts) {
    const cohort = a.cohort;
    console.log(`  Cohort: ${cohort.name} (${cohort.id})`);
    const members = await getCohortMembers(cohort.id);
    console.log(`    ${members.length} members`);

    for (const m of members) {
      const displayName = (m.display_name || m.email.split('@')[0]).split(' ')[0];
      await sendOne({
        to: m.email,
        subject: 'MedHelp 60D liberado — sua reta final começa agora',
        html: lifecycleHtml({
          displayName,
          headline: 'MedHelp 60D está liberado',
          body: `Faltam 60 dias para sua prova (${fmtPtBr(cohort.test_date)}). O módulo intensivo <strong>MedHelp 60D</strong> agora está disponível — Revalida Up, Memorecards e todos os recursos de reta final.`,
          ctaLabel: 'Acessar MedHelp 60D →',
          ctaHref: `${APP_URL}/app`,
        }),
        userId: m.user_id,
        kind: '60d-unlock',
        contextId: String(cohort.id),
      });
      await insertNotification({
        userId: m.user_id,
        kind: '60d-unlock',
        title: 'MedHelp 60D liberado',
        body: 'Sua reta final começa agora — Revalida Up + Memorecards disponíveis.',
        href: '/app',
        icon: 'lock',
        contextId: String(cohort.id),
      });
    }

    // In-app announcement, cohort-scoped, idempotent by title + cohort_id check
    if (APPLY && categoryId) {
      const title = `MedHelp 60D liberado — ${cohort.name}`;
      const { data: existing } = await supabase
        .from('announcements')
        .select('id')
        .eq('cohort_id', cohort.id)
        .eq('title', title)
        .maybeSingle();
      if (!existing) {
        await supabase.from('announcements').insert({
          title,
          body_html: `<p>Sua reta final começa agora. O módulo MedHelp 60D está disponível com Revalida Up, Memorecards e todos os recursos intensivos.</p>`,
          category_id: categoryId,
          priority: 'urgent',
          status: 'published',
          pinned: true,
          cohort_id: cohort.id,
        });
        console.log(`    Created in-app announcement`);
      } else {
        console.log(`    In-app announcement already exists`);
      }
    } else if (!APPLY) {
      console.log(`    DRY: would create in-app announcement`);
    }
  }
}

// ── Trigger 2: Membership ends in 7 days ─────────────────────────────────────

async function processExpiryWarning() {
  console.log('\n[2/7] Checking memberships ending in 7 days…');
  const targetEnd = offsetDateKey(7);
  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, slug, membership_ends_at')
    .gte('membership_ends_at', `${targetEnd}T00:00:00`)
    .lte('membership_ends_at', `${targetEnd}T23:59:59`);

  if (!cohorts || cohorts.length === 0) {
    console.log('  No cohorts ending in 7 days.');
    return;
  }

  for (const cohort of cohorts) {
    console.log(`  Cohort: ${cohort.name} (${cohort.id})`);
    const members = await getCohortMembers(cohort.id);
    console.log(`    ${members.length} members`);

    for (const m of members) {
      const displayName = (m.display_name || m.email.split('@')[0]).split(' ')[0];
      await sendOne({
        to: m.email,
        subject: 'Seu acesso encerra em 7 dias',
        html: lifecycleHtml({
          displayName,
          headline: 'Seu acesso encerra em 7 dias',
          body: `Seu acesso à turma <strong>${cohort.name}</strong> termina em ${fmtPtBr(cohort.membership_ends_at.split('T')[0])}. Aproveite os últimos dias para revisar o que ficou pendente. Se quiser continuar estudando, você pode renovar agora.`,
          ctaLabel: 'Renovar acesso →',
          ctaHref: `${APP_URL}/app/acesso-encerrado`,
        }),
        userId: m.user_id,
        kind: 'expiry-warning-7d',
        contextId: String(cohort.id),
      });
      await insertNotification({
        userId: m.user_id,
        kind: 'expiry-warning-7d',
        title: 'Seu acesso encerra em 7 dias',
        body: `Renove para continuar estudando após ${fmtPtBr(cohort.membership_ends_at.split('T')[0])}.`,
        href: '/app/acesso-encerrado',
        icon: 'alert',
        contextId: String(cohort.id),
      });
    }
  }
}

// ── Trigger 3: Membership ended today ────────────────────────────────────────

async function processExpiryNotice() {
  console.log('\n[3/7] Checking memberships that ended today…');
  const today = todayKey();
  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('id, name, slug, membership_ends_at')
    .gte('membership_ends_at', `${today}T00:00:00`)
    .lte('membership_ends_at', `${today}T23:59:59`);

  if (!cohorts || cohorts.length === 0) {
    console.log('  No cohorts ending today.');
    return;
  }

  for (const cohort of cohorts) {
    console.log(`  Cohort: ${cohort.name} (${cohort.id})`);
    const members = await getCohortMembers(cohort.id);
    console.log(`    ${members.length} members`);

    for (const m of members) {
      const displayName = (m.display_name || m.email.split('@')[0]).split(' ')[0];
      await sendOne({
        to: m.email,
        subject: 'Seu acesso ao MedHelpSpace foi encerrado',
        html: lifecycleHtml({
          displayName,
          headline: 'Acesso encerrado',
          body: `Seu acesso à turma <strong>${cohort.name}</strong> foi encerrado. Esperamos que você tenha tido uma ótima preparação. Para continuar estudando na próxima turma, é só renovar.`,
          ctaLabel: 'Ver próximas turmas →',
          ctaHref: `${APP_URL}/app/acesso-encerrado`,
        }),
        userId: m.user_id,
        kind: 'expiry-notice',
        contextId: String(cohort.id),
      });
      await insertNotification({
        userId: m.user_id,
        kind: 'expiry-notice',
        title: 'Acesso encerrado',
        body: 'Renove para continuar estudando na próxima turma.',
        href: '/app/acesso-encerrado',
        icon: 'alert',
        contextId: String(cohort.id),
      });
    }
  }
}

// ── Trigger 4: Weekly summary (Mondays) ──────────────────────────────────────

async function processWeeklySummary() {
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
  if (dayOfWeek !== 1) {
    console.log('\n[4/7] Weekly summary — skipped (not Monday).');
    return;
  }
  console.log('\n[4/7] Weekly summary email…');

  const students = await getActiveStudents();
  const eligible = students.filter((s) => {
    const plan = s.plan;
    if (!plan) return true; // default ON
    if (plan.paused_until && plan.paused_until >= todayKey()) return false;
    return plan.email_weekly_summary !== false;
  });

  if (eligible.length === 0) {
    console.log('  No eligible students.');
    return;
  }

  // ISO week as the dedup key
  const now = new Date();
  const weekKey = `${now.getFullYear()}-W${String(Math.ceil(((now - new Date(now.getFullYear(), 0, 1)) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)).padStart(2, '0')}`;

  // Past 7 days window
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  for (const s of eligible) {
    // Aggregate last week's stats for this student
    const [{ data: attempts }, { count: completions }] = await Promise.all([
      supabase.from('quiz_attempts').select('is_correct, created_at').eq('user_id', s.user_id).gte('created_at', sevenDaysAgoIso),
      supabase.from('lesson_completions').select('*', { count: 'exact', head: true }).eq('user_id', s.user_id).gte('completed_at', sevenDaysAgoIso),
    ]);

    const totalQ = (attempts ?? []).length;
    const correctQ = (attempts ?? []).filter((a) => a.is_correct).length;
    const accuracy = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : null;
    const lessonsDone = completions ?? 0;
    const daysActive = new Set((attempts ?? []).map((a) => a.created_at.split('T')[0])).size;
    const daysToExam = s.cohort?.test_date
      ? Math.max(0, Math.ceil((new Date(s.cohort.test_date).getTime() - Date.now()) / 86_400_000))
      : null;

    const displayName = (s.display_name || s.email.split('@')[0]).split(' ')[0];
    const body = totalQ === 0 && lessonsDone === 0
      ? `Esta semana foi corrida — sem registros de estudo. Sem culpa. Comece com uma sessão curta hoje, mesmo que sejam 15 minutos.`
      : `Esta semana: <strong>${totalQ} questões</strong> respondidas${accuracy != null ? ` com <strong>${accuracy}% de acerto</strong>` : ''}, <strong>${lessonsDone} aulas</strong> concluídas, em <strong>${daysActive} dia${daysActive !== 1 ? 's' : ''}</strong> ativos.${daysToExam != null ? ` Faltam ${daysToExam} dias para a prova.` : ''}`;

    await sendOne({
      to: s.email,
      subject: 'Resumo semanal do seu plano de estudos',
      html: lifecycleHtml({
        displayName,
        headline: 'Seu resumo da semana',
        body,
        ctaLabel: 'Ver plano e ajustar →',
        ctaHref: `${APP_URL}/app/plano`,
      }),
      userId: s.user_id,
      kind: 'weekly-summary',
      contextId: weekKey,
    });
    await insertNotification({
      userId: s.user_id,
      kind: 'weekly-summary',
      title: 'Resumo da semana disponível',
      body: totalQ > 0 ? `${totalQ} questões · ${accuracy ?? 0}% acerto · ${lessonsDone} aulas` : 'Veja o que você pode estudar essa semana.',
      href: '/app/plano',
      icon: 'calendar',
      contextId: weekKey,
    });
  }
}

// ── Trigger 5: Daily plan email (opt-in) ─────────────────────────────────────

async function processDailyPlanEmail() {
  console.log('\n[5/7] Daily plan email (opt-in)…');
  const students = await getActiveStudents();
  const eligible = students.filter((s) => {
    const plan = s.plan;
    if (!plan) return false; // default OFF
    if (plan.paused_until && plan.paused_until >= todayKey()) return false;
    return plan.email_daily_plan === true;
  });
  if (eligible.length === 0) {
    console.log('  No eligible students (opt-in).');
    return;
  }

  for (const s of eligible) {
    const displayName = (s.display_name || s.email.split('@')[0]).split(' ')[0];
    const daysToExam = s.cohort?.test_date
      ? Math.max(0, Math.ceil((new Date(s.cohort.test_date).getTime() - Date.now()) / 86_400_000))
      : null;

    await sendOne({
      to: s.email,
      subject: 'Seu plano de estudos para hoje',
      html: lifecycleHtml({
        displayName,
        headline: 'Plano de hoje',
        body: `Seu plano personalizado está pronto na plataforma. Abra para ver as tarefas específicas baseadas no seu desempenho atual.${daysToExam != null ? ` <br/><br/>Faltam <strong>${daysToExam} dias</strong> para sua prova.` : ''}`,
        ctaLabel: 'Abrir plano de hoje →',
        ctaHref: `${APP_URL}/app/plano`,
      }),
      userId: s.user_id,
      kind: 'daily-plan',
      contextId: todayKey(),
    });
  }
}

// ── Trigger 6: Missed-3-days nudge ───────────────────────────────────────────

async function processMissed3Days() {
  console.log('\n[6/7] Missed-3-days nudge…');
  const students = await getActiveStudents();
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoIso = threeDaysAgo.toISOString();

  let nudged = 0;
  for (const s of students) {
    // Skip paused
    if (s.plan?.paused_until && s.plan.paused_until >= todayKey()) continue;
    // Last activity (any quiz or lesson)
    const [{ data: lastQuiz }, { data: lastLesson }] = await Promise.all([
      supabase.from('quiz_attempts').select('created_at').eq('user_id', s.user_id).order('created_at', { ascending: false }).limit(1),
      supabase.from('lesson_completions').select('completed_at').eq('user_id', s.user_id).order('completed_at', { ascending: false }).limit(1),
    ]);
    const lastQ = lastQuiz?.[0]?.created_at;
    const lastL = lastLesson?.[0]?.completed_at;
    const last = [lastQ, lastL].filter(Boolean).sort().pop();
    // No prior activity at all: don't nudge (might be brand new)
    if (!last) continue;
    if (last > threeDaysAgoIso) continue; // active recently

    // Idempotency: only one nudge per gap. We use last_activity date as the contextId.
    const contextId = `last-${last.split('T')[0]}`;
    await insertNotification({
      userId: s.user_id,
      kind: 'missed-3-days',
      title: 'Que tal voltar com calma?',
      body: 'Você não precisa fazer tudo hoje — apenas uma sessão curta já mantém o ritmo.',
      href: '/app/plano',
      icon: 'calendar',
      contextId,
    });
    nudged++;
  }
  console.log(`  Nudged ${nudged} students.`);
}

// ── Trigger 7: Quiz milestones ───────────────────────────────────────────────

async function processMilestones() {
  console.log('\n[7/7] Milestone checks…');
  const students = await getActiveStudents();

  for (const s of students) {
    // 100-question milestone (counts cumulative)
    const { count: totalQ } = await supabase
      .from('quiz_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', s.user_id);

    if ((totalQ ?? 0) >= 100) {
      await insertNotification({
        userId: s.user_id,
        kind: 'milestone-100q',
        title: '100 questões respondidas',
        body: 'Você passou da marca de 100 questões. Continue assim.',
        href: '/app/relatorio',
        icon: 'trophy',
        contextId: '100',
      });
    }

    // Streak detection: how many consecutive distinct days have any quiz attempt?
    const { data: recentAttempts } = await supabase
      .from('quiz_attempts')
      .select('created_at')
      .eq('user_id', s.user_id)
      .order('created_at', { ascending: false })
      .limit(200);
    const dates = [...new Set((recentAttempts ?? []).map((a) => a.created_at.split('T')[0]))].sort().reverse();
    let streak = 0;
    const today = todayKey();
    let cursor = today;
    for (const d of dates) {
      if (d === cursor) {
        streak++;
        const prev = new Date(cursor);
        prev.setDate(prev.getDate() - 1);
        cursor = prev.toISOString().split('T')[0];
      } else if (d < cursor) break;
    }

    if (streak >= 30) {
      await insertNotification({
        userId: s.user_id,
        kind: 'milestone-streak-30',
        title: '30 dias de sequência',
        body: 'Disciplina impressionante. Você está construindo um hábito de verdade.',
        href: '/app/relatorio',
        icon: 'trophy',
        contextId: `streak-30-${today}`,
      });
    } else if (streak >= 7) {
      await insertNotification({
        userId: s.user_id,
        kind: 'milestone-streak-7',
        title: '7 dias seguidos',
        body: 'Uma semana inteira de estudo. Mantenha o ritmo.',
        href: '/app/relatorio',
        icon: 'trophy',
        contextId: `streak-7-${today}`,
      });
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async function main() {
  console.log(`Lifecycle notifications — ${APPLY ? 'APPLY' : 'DRY RUN'} mode`);
  console.log(`Today: ${todayKey()}`);
  if (!APPLY) {
    console.log('No emails will be sent and no logs will be written. Pass --apply to commit.');
  }
  if (APPLY && !resend) {
    console.warn('WARNING: --apply set but RESEND_API_KEY missing; emails will not actually send.');
  }

  await process60DUnlock();
  await processExpiryWarning();
  await processExpiryNotice();
  await processWeeklySummary();
  await processDailyPlanEmail();
  await processMissed3Days();
  await processMilestones();

  console.log('\nDone.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
