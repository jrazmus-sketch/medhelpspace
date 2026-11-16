#!/usr/bin/env node
// Revalida Up ↔ Meu Plano link check (Karina 2026-11-15). READ ONLY — it never creates or changes a link.
//
//   node scripts/check-revalida-up-links.js                       # prod (DATABASE_URL from app/.env.local)
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" node scripts/check-revalida-up-links.js
//
// Run it after every Revalida Up import, rename or specialty move (the importer prints this reminder; the admin
// dashboard shows the same count live, tile → /admin/revalida-up). It lists:
//   • published Revalida Up pages that no Meu Plano topic opens, each with the UNEQUIVOCAL candidate when there is
//     exactly one (a topic whose own Questões section has the same title as the page) — to be proposed to Karina,
//     never linked by this script;
//   • topic links that point at a page that is not a published Revalida Up page.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'app', '.env.local');
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  const m = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.*)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim().replace(/^"|"$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(2); }
const postgres = require(path.join(__dirname, '..', 'node_modules', 'postgres'));
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+revalida\s+up\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    await sql.begin('read only', async (t) => {
      const has = (await t`select to_regclass('public.revalida_up_link_check') is not null ok`)[0].ok;
      if (!has) { console.log('revalida_up_link_check not installed on this database (schema-patch-revalida-up-topic-links.sql).'); return; }
      const issues = await t`select issue, page_id, title, specialty, topic_name from revalida_up_link_check order by issue, specialty, title`;
      const sections = await t`select t.id, t.name, p.title from topic_content c join topics t on t.id = c.topic_id
                                 join pages p on p.id = c.page_id where c.resource_type = 'quiz'`;
      const missing = issues.filter((i) => i.issue === 'pagina_sem_tema');
      const invalid = issues.filter((i) => i.issue === 'vinculo_invalido');
      console.log(`Revalida Up × Meu Plano — ${missing.length} página(s) sem tema, ${invalid.length} vínculo(s) inválido(s)`);
      for (const i of missing) {
        const cands = sections.filter((s) => norm(s.title) === norm(i.title));
        const hint = cands.length === 1 ? `candidato inequívoco: tema "${cands[0].name}" (id ${cands[0].id}) — propor à Karina`
          : cands.length > 1 ? `${cands.length} candidatos — decisão da Karina` : 'sem correspondência inequívoca — decisão da Karina';
        console.log(`  · ${i.title} [${i.specialty ?? '—'}] (página ${i.page_id}) → ${hint}`);
      }
      for (const i of invalid) console.log(`  ! tema "${i.topic_name}" abre "${i.title}" (página ${i.page_id}), que não é um Revalida Up publicado`);
    });
  } finally { await sql.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
