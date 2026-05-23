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

const ENTITIES = {'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"'};
function htmlToText(html) {
  let s = html.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<[^>]+>/g,'');
  s = s.replace(/&[a-zA-Z#0-9]+;/g, m => ENTITIES[m] ?? m);
  return s;
}

(async () => {
  try {
    // Look at the FIRST question header line of every simulado page's "Perguntas" lesson.
    const lessons = await db`
      SELECT p.slug, l.body_html
      FROM pages p
      JOIN lessons l ON l.page_id = p.id
      WHERE p.type IN ('text-lesson','audio-lesson')
        AND p.slug LIKE '%-simulados'
        AND l.title ILIKE '%pergunta%'
      ORDER BY p.slug
    `;

    console.log(`Sampling ${lessons.length} simulado Perguntas lessons.\n`);

    const hasRevalida = [];
    const hasInedita = [];
    const otherPattern = [];

    for (const row of lessons) {
      const text = htmlToText(row.body_html);
      // Find first "Questão" line
      const m = text.match(/Quest[aã]o\s+\d+[^\n]*/i);
      const firstHeader = m ? m[0].trim() : '(no Questão header found)';
      // Is there a parenthetical with year?
      const revalidaMatch = firstHeader.match(/\(\s*Revalida\s+\d{4}[\.\-]?\d*\s*\)/i);
      // Is there a (inédita) marker anywhere in the body?
      const ineditaMatch = /in[eé]dita/i.test(text);

      if (revalidaMatch) hasRevalida.push({ slug: row.slug, sample: firstHeader });
      else if (ineditaMatch) hasInedita.push({ slug: row.slug, sample: firstHeader });
      else otherPattern.push({ slug: row.slug, sample: firstHeader });
    }

    console.log(`=== Has "(Revalida YYYY.X)" in Questão 1 header (${hasRevalida.length}) ===`);
    for (const r of hasRevalida.slice(0, 8)) console.log(`  ${r.slug}\n    "${r.sample}"`);
    if (hasRevalida.length > 8) console.log(`  ... +${hasRevalida.length - 8} more`);

    console.log(`\n=== Body mentions "inédita" (${hasInedita.length}) ===`);
    for (const r of hasInedita.slice(0, 8)) console.log(`  ${r.slug}\n    "${r.sample}"`);
    if (hasInedita.length > 8) console.log(`  ... +${hasInedita.length - 8} more`);

    console.log(`\n=== Other (no Revalida year, no "inédita" marker) (${otherPattern.length}) ===`);
    for (const r of otherPattern.slice(0, 12)) console.log(`  ${r.slug}\n    "${r.sample}"`);
    if (otherPattern.length > 12) console.log(`  ... +${otherPattern.length - 12} more`);

    // Look at a single page's full first-question chunk to see exactly how the year appears
    const sample = await db`
      SELECT p.slug, l.body_html
      FROM pages p
      JOIN lessons l ON l.page_id = p.id
      WHERE p.type IN ('text-lesson','audio-lesson')
        AND p.slug LIKE '%-simulados'
        AND l.title ILIKE '%pergunta%'
      ORDER BY random()
      LIMIT 1
    `;
    if (sample.length > 0) {
      console.log(`\n--- Random page sample: ${sample[0].slug} ---`);
      const text = htmlToText(sample[0].body_html);
      console.log(text.slice(0, 800));
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    db.end();
  }
})();
