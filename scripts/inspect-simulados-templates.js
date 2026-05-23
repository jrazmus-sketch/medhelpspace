'use strict';
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(__dirname,'..','app','.env.local'),'utf8');
for (const line of raw.split('\n')) {
  const eq = line.indexOf('='); if (eq===-1) continue;
  const k=line.slice(0,eq).trim(), v=line.slice(eq+1).trim();
  if (!(k in process.env)) process.env[k]=v;
}
const postgres = require('postgres');
const db = postgres(process.env.DATABASE_URL,{max:1});

(async () => {
  try {
    // Pull a sample of *-simulados pages and check which markers appear in their lesson bodies.
    const pages = await db`
      SELECT p.id, p.slug, p.title,
             (SELECT count(*) FROM lessons l WHERE l.page_id = p.id) AS lesson_count,
             (SELECT count(*) FROM lessons l
                WHERE l.page_id = p.id AND l.title ILIKE '%resposta%') AS resposta_lessons,
             (SELECT count(*) FROM lessons l
                WHERE l.page_id = p.id AND l.title ILIKE '%pergunta%') AS pergunta_lessons
      FROM pages p
      WHERE p.type IN ('text-lesson','audio-lesson') AND p.slug LIKE '%-simulados'
      ORDER BY p.slug
    `;

    console.log(`Total *-simulados pages: ${pages.length}\n`);
    console.log('lesson_count distribution:');
    const dist = {};
    for (const p of pages) dist[p.lesson_count] = (dist[p.lesson_count]||0)+1;
    console.log(dist);

    console.log('\nPages with NO "respostas"-named lesson (heuristic miss):');
    let noResposta = 0;
    for (const p of pages) {
      if (p.resposta_lessons === 0n || p.resposta_lessons === 0) {
        noResposta++;
        if (noResposta <= 15) console.log(`  ${p.slug} — ${p.lesson_count} lessons`);
      }
    }
    console.log(`  ... total: ${noResposta}`);

    // Pick 5 random pages and scan markers in their bodies
    const sample = await db`
      SELECT p.id, p.slug, l.id AS lesson_id, l.title, l.body_html
      FROM pages p
      JOIN lessons l ON l.page_id = p.id
      WHERE p.type IN ('text-lesson','audio-lesson') AND p.slug LIKE '%-simulados'
      ORDER BY random()
      LIMIT 12
    `;
    console.log('\n--- random sample marker scan ---');
    for (const row of sample) {
      const body = row.body_html;
      const qHits = (body.match(/Quest[aã]o\s*\d+/gi) || []).length;
      const aHits = ((body.match(/\(A\)/g) || []).length);
      const correctHits = (body.match(/Alternativa correta/gi) || []).length;
      const comentario = /Coment[aá]rio/i.test(body);
      const pega = /PEGA REVALIDA/i.test(body);
      const resumo = /Resumo-chave/i.test(body);
      console.log(`${row.slug} :: ${row.title}`);
      console.log(`   Questões=${qHits}  (A)opts=${aHits}  correta=${correctHits}  Comentário=${comentario}  PEGA=${pega}  Resumo=${resumo}`);
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    db.end();
  }
})();
