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
    const summary = await db`
      SELECT p.type,
             count(*)::int AS n
      FROM pages p
      WHERE p.slug LIKE '%-simulados'
      GROUP BY p.type
      ORDER BY p.type
    `;
    console.log('=== All *-simulados pages by type ===');
    for (const r of summary) console.log(`  ${r.type.padEnd(20)} ${r.n}`);

    const h5p = await db`
      SELECT count(*)::int AS pages,
             (SELECT count(*)::int FROM quiz_questions q
                JOIN pages p2 ON p2.id = q.page_id
                WHERE p2.slug LIKE '%-simulados') AS quiz_q_rows,
             (SELECT count(*)::int FROM lessons l
                JOIN pages p2 ON p2.id = l.page_id
                WHERE p2.slug LIKE '%-simulados' AND p2.type = 'h5p-quiz') AS lessons_preserved
      FROM pages p
      WHERE p.slug LIKE '%-simulados' AND p.type = 'h5p-quiz'
    `;
    console.log('\n=== h5p-quiz *-simulados pages ===');
    console.log(`  pages:             ${h5p[0].pages}`);
    console.log(`  quiz_questions:    ${h5p[0].quiz_q_rows}  (expected ${h5p[0].pages*10})`);
    console.log(`  lessons preserved: ${h5p[0].lessons_preserved}  (expected ${h5p[0].pages*2})`);

    const badQ = await db`
      SELECT p.slug, count(q.*)::int AS qn
      FROM pages p
      LEFT JOIN quiz_questions q ON q.page_id = p.id
      WHERE p.slug LIKE '%-simulados' AND p.type = 'h5p-quiz'
      GROUP BY p.id, p.slug
      HAVING count(q.*) != 10
      ORDER BY p.slug
    `;
    console.log(`\nPages with question count != 10: ${badQ.length}`);
    for (const r of badQ) console.log(`  ${r.slug}  qn=${r.qn}`);

    const missingExplain = await db`
      SELECT p.slug, count(*)::int AS n
      FROM pages p
      JOIN quiz_questions q ON q.page_id = p.id
      WHERE p.slug LIKE '%-simulados' AND p.type = 'h5p-quiz'
        AND (q.explanation_html IS NULL OR q.explanation_html = '')
      GROUP BY p.slug
      ORDER BY p.slug
    `;
    console.log(`\nPages with any empty explanation_html: ${missingExplain.length}`);
    for (const r of missingExplain.slice(0, 10)) console.log(`  ${r.slug}  empty=${r.n}`);
    if (missingExplain.length > 10) console.log(`  ... (+${missingExplain.length-10} more)`);
  } finally {
    db.end();
  }
})();
