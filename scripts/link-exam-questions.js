#!/usr/bin/env node
'use strict';
/**
 * link-exam-questions.js — run after EVERY Questões import (R1, Karina 2026-11-12).
 *
 * Ties each new platform record to its ORIGINAL Revalida question (exam_questions,
 * edition + number) and writes the import report she asked for. Dry run by default;
 * --apply writes, in ONE transaction. Never edits a question's text, answers,
 * comments, Revalida Up, flashcards or MedVoice.
 *
 *   node scripts/link-exam-questions.js [--apply] [--out report.md]
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/link-exam-questions.js
 *
 * For every record on a Questões page (pages.view='quiz') with no original yet:
 *   1. reads "Questão N · Revalida ED" (or the legacy "Questão N (Revalida ED)");
 *      an unreadable label is REPORTED, never guessed;
 *   2. finds the original (edition, number) — creating the row for a new edition
 *      (e.g. 2026.2) — and links the record to it;
 *   3. DUPLICATE CHECK: if that original already has a published record, the new
 *      record is a second copy of the same question → reported for review (linked,
 *      so it can never be counted twice);
 *   4. TOPIC: an original that already has a topic keeps it. One without a topic gets
 *      the topic of its section ONLY when that section holds a single topic (status
 *      'proposto'); in a section shared by several topics, or with no topic, it is
 *      flagged "tema a definir" — new topics are never created here (her rule).
 * Report: questions added (edition, number, area › specialty › section, topic),
 * duplicates, topics to decide, incidence before → after (distinct originals), the
 * A–D tier the CURRENT rule would give, and which Revalida Up / flashcards / MedVoice
 * belong to the topics that received questions (for her pedagogical review).
 */
const fs = require('fs');
const path = require('path');
const postgres = require(path.join(__dirname, '..', 'node_modules', 'postgres'));

function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', 'app', '.env.local'), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const k = t.slice(0, t.indexOf('=')).trim();
      if (!(k in process.env)) process.env[k] = t.slice(t.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* rely on process.env */ }
}

const LABEL = /Quest[aã]o\s*0*(\d+)\s*(?:[·•\-–—|]|\()\s*Revalida\s*(20\d\d(?:[.\/][12])?)/i;
const tier = (n) => (n >= 9 ? 'A' : n >= 6 ? 'B' : n >= 3 ? 'C' : n >= 1 ? 'D' : '—');
// The statement without its "Questão N · Revalida ED" label, tags and spacing.
const body = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(LABEL, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
const edRank = (e) => { const [y, s] = e.split('.'); return Number(y) * 10 + Number(s || 0); };

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx > 0 ? process.argv[outIdx + 1] : null;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const report = [];
  try {
    await sql.begin(async (tx) => {
      const incBefore = new Map((await tx`SELECT topic_id, incidence FROM topic_incidence_live`).map((r) => [Number(r.topic_id), r.incidence]));
      const pending = await tx`
        SELECT q.id, q.page_id, left(regexp_replace(q.question, '<[^>]+>', '', 'g'), 200) AS head, q.question,
               p.slug, p.title, p.status, s.name AS spec, s.group_label
        FROM quiz_questions q JOIN pages p ON p.id = q.page_id LEFT JOIN specialties s ON s.id = p.specialty_id
        WHERE p.view = 'quiz' AND p.type = 'h5p-quiz' AND q.exam_question_id IS NULL
        ORDER BY q.id`;
      // Section → topics, from the questions already linked (primary topics) and,
      // for a section with none yet, from the topic map (topic_content quiz / source page).
      const linkedTopics = await tx`SELECT DISTINCT page_id, topic_id FROM topic_question_links WHERE is_primary`;
      const mapTopics = await tx`
        SELECT page_id, topic_id FROM topic_content WHERE resource_type = 'quiz' AND page_id IS NOT NULL
        UNION SELECT source_page_id, id FROM topics WHERE source_page_id IS NOT NULL`;
      const topicsOf = new Map();
      const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
      for (const r of linkedTopics) add(topicsOf, Number(r.page_id), Number(r.topic_id));
      const mapOf = new Map();
      for (const r of mapTopics) add(mapOf, Number(r.page_id), Number(r.topic_id));

      const added = [], unreadable = [], duplicates = [], conflicts = [], toDecide = [], touchedTopics = new Set();
      for (const r of pending) {
        const m = r.head.match(LABEL);
        if (!m) { unreadable.push(r); continue; }
        const number = Number(m[1]);
        const edition = m[2].replace('/', '.');
        let [eq] = await tx`SELECT id, topic_id FROM exam_questions WHERE edition = ${edition} AND number = ${number}`;
        if (!eq) {
          if (apply) [eq] = await tx`INSERT INTO exam_questions (edition, number) VALUES (${edition}, ${number}) RETURNING id, topic_id`;
          else eq = { id: null, topic_id: null, isNew: true };
        }
        const others = eq.id == null ? [] : await tx`
          SELECT q.id, p.slug, p.title, q.question FROM quiz_questions q JOIN pages p ON p.id = q.page_id
          WHERE q.exam_question_id = ${eq.id} AND q.id <> ${r.id} AND p.status = 'publish'`;
        if (others.length) {
          // Same question filed again (same text) → a copy: linked, counted once.
          // Different text under the same number → a numbering error: NOT linked.
          const sameText = others.some((o) => body(o.question) === body(r.question));
          if (!sameText) { conflicts.push({ r, edition, number, others }); continue; }
          duplicates.push({ r, edition, number, others });
        }
        let topicId = eq.topic_id == null ? null : Number(eq.topic_id);
        let topicNote = topicId != null ? 'tema já definido' : null;
        if (topicId == null) {
          const there = topicsOf.get(Number(r.page_id)) || mapOf.get(Number(r.page_id)) || new Set();
          if (there.size === 1) {
            topicId = [...there][0];
            topicNote = 'proposto: tema único da seção';
            if (apply && eq.id != null) await tx`UPDATE exam_questions SET topic_id = ${topicId}, topic_status = 'proposto', topic_note = ${topicNote}, updated_at = now() WHERE id = ${eq.id} AND topic_id IS NULL`;
          } else {
            toDecide.push({ r, edition, number, candidates: [...there] });
          }
        }
        if (apply && eq.id != null) await tx`UPDATE quiz_questions SET exam_question_id = ${eq.id} WHERE id = ${r.id}`;
        if (topicId != null) touchedTopics.add(topicId);
        added.push({ r, edition, number, topicId, topicNote, newOriginal: !!eq.isNew, copy: others.length > 0 });
      }

      const topics = new Map((await tx`SELECT id, name, incidence_count FROM topics`).map((t) => [Number(t.id), t]));
      const incAfter = apply
        ? new Map((await tx`SELECT topic_id, incidence FROM topic_incidence_live`).map((r) => [Number(r.topic_id), r.incidence]))
        : null;
      const resources = touchedTopics.size
        ? await tx`SELECT c.topic_id, c.resource_type, p.title, c.question_filter FROM topic_content c JOIN pages p ON p.id = c.page_id
                   WHERE c.topic_id IN ${tx([...touchedTopics])} AND c.resource_type IN ('revalida_up','flashcards','medvoice','resumo')`
        : [];
      const resOf = new Map();
      for (const r of resources) add(resOf, Number(r.topic_id), `${r.resource_type}: ${r.title}${r.question_filter?.group_label ? ` › ${r.question_filter.group_label}` : ''}`);

      const tName = (id) => (id == null ? '— (a definir)' : topics.get(id)?.name ?? `#${id}`);
      report.push(`# Relatório de importação — vínculo das questões originais`, '',
        `Gerado em ${new Date().toISOString()} · ${apply ? 'APLICADO' : 'SIMULAÇÃO (nada gravado)'}`, '',
        `Registros sem questão original vinculada encontrados: ${pending.length}`, '');
      report.push('## Questões adicionadas', '', '| Edição | Nº | Área › Especialidade › Seção | Tema do Meu Plano | Observação |', '|---|---|---|---|---|');
      for (const a of added.sort((x, y) => edRank(x.edition) - edRank(y.edition) || x.number - y.number)) {
        const area = a.r.group_label ? `${a.r.group_label} › ${a.r.spec}` : a.r.spec;
        report.push(`| ${a.edition} | Q${a.number} | ${area} › ${a.r.title}${a.r.status === 'publish' ? '' : ' (não publicada)'} | ${tName(a.topicId)} | ${a.newOriginal ? 'edição/questão nova no cadastro; ' : ''}${a.topicNote ?? ''} |`);
      }
      report.push('', '## Questões que já existiam (possível duplicata — conferir)', '');
      if (!duplicates.length) report.push('Nenhuma.');
      for (const d of duplicates) report.push(`- ${d.edition} Q${d.number}: registro ${d.r.id} (${d.r.title}) — já existe em ${d.others.map((o) => `${o.title} (registro ${o.id})`).join(', ')}. Contada uma única vez.`);
      report.push('', '## Número já ocupado por outra questão (NÃO vinculadas — conferir o rótulo)', '');
      if (!conflicts.length) report.push('Nenhum.');
      for (const c of conflicts) report.push(`- registro ${c.r.id} (${c.r.title}) está rotulado ${c.edition} Q${c.number}, mas essa questão já está cadastrada com outro enunciado em ${c.others.map((o) => `${o.title} (registro ${o.id})`).join(', ')}.`);
      report.push('', '## Temas a definir (aguardam sua aprovação)', '');
      if (!toDecide.length) report.push('Nenhum.');
      for (const t of toDecide) report.push(`- ${t.edition} Q${t.number} em ${t.r.title}: ${t.candidates.length ? `a seção reúne ${t.candidates.map(tName).join(', ')}` : 'a seção não tem tema'} — indicar o tema (ou aprovar um tema novo).`);
      report.push('', '## Rótulo ilegível (não vinculadas)', '');
      if (!unreadable.length) report.push('Nenhum.');
      for (const u of unreadable) report.push(`- registro ${u.id} em ${u.title}: "${u.head.slice(0, 80)}"`);
      report.push('', '## Incidência e prioridade (questões originais distintas)', '',
        '| Tema | Antes | Depois | Prioridade pela regra atual | Incidência gravada no Meu Plano |', '|---|---|---|---|---|');
      for (const id of [...touchedTopics].sort((a, b) => tName(a).localeCompare(tName(b)))) {
        const b = incBefore.get(id) ?? 0;
        const a = incAfter ? incAfter.get(id) ?? 0 : `${b} + ${added.filter((x) => x.topicId === id && !x.copy).length} (estimado)`;
        report.push(`| ${tName(id)} | ${b} | ${a} | ${tier(b)} → ${incAfter ? tier(a) : '—'} | ${topics.get(id)?.incidence_count ?? '—'} |`);
      }
      report.push('', '## Materiais dos temas que receberam questões (para sua revisão)', '');
      for (const id of touchedTopics) {
        const r = resOf.get(id);
        report.push(`- ${tName(id)}: ${r ? [...r].join(' · ') : 'sem Revalida Up, flashcards ou MedVoice vinculados'}`);
      }
      if (!apply) throw Object.assign(new Error('dry-run'), { dryRun: true });
    });
  } catch (e) {
    if (!e.dryRun) throw e;
  } finally {
    await sql.end();
  }
  const text = report.join('\n');
  if (outPath) fs.writeFileSync(outPath, text, 'utf8');
  console.log(text);
}

main().catch((e) => { console.error(e); process.exit(1); });
