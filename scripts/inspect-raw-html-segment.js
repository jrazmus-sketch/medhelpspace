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

const slug = process.argv[2] || 'anemia-falciforme-simulados';
const qNum = parseInt(process.argv[3] || '2', 10);

(async () => {
  try {
    const pages = await db`SELECT id FROM pages WHERE slug = ${slug}`;
    const lessons = await db`
      SELECT id, title, body_html FROM lessons WHERE page_id = ${pages[0].id} ORDER BY position
    `;
    const perguntas = lessons.find(l => /pergunta/i.test(l.title));
    const html = perguntas.body_html;

    // Find Questão N and Questão N+1 in raw HTML
    const reN = new RegExp(`Quest[aã]o\\s*${qNum}\\b`, 'i');
    const reN1 = new RegExp(`Quest[aã]o\\s*${qNum+1}\\b`, 'i');
    const startIdx = html.search(reN);
    const sliceAfter = html.slice(startIdx + 10);
    const nextIdx = sliceAfter.search(reN1);
    const endIdx = nextIdx > -1 ? startIdx + 10 + nextIdx : html.length;

    const segment = html.slice(startIdx, endIdx);
    console.log(`=== Raw HTML for Q${qNum} of ${slug} ===`);
    console.log(`Length: ${segment.length} chars\n`);
    console.log(segment);
    console.log(`\n=== END ===`);
  } finally {
    db.end();
  }
})();
