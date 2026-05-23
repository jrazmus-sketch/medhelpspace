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
    const page = await db`
      SELECT id, slug, title, type, track_id, content_module_id
      FROM pages
      WHERE slug = 'bradiarritmias-simulados'
    `;
    console.log('PAGE:', JSON.stringify(page[0], null, 2));

    const lessons = await db`
      SELECT id, position, title, length(body_html) AS body_len, audio_url
      FROM lessons
      WHERE page_id = ${page[0].id}
      ORDER BY position
    `;
    console.log('\nLESSONS:');
    for (const l of lessons) console.log(`  pos=${l.position} id=${l.id} title="${l.title}" body_len=${l.body_len} audio=${l.audio_url ? 'YES' : 'no'}`);

    for (const l of lessons) {
      const full = await db`SELECT body_html FROM lessons WHERE id = ${l.id}`;
      console.log(`\n========== LESSON ${l.id}: ${l.title} ==========`);
      console.log(full[0].body_html);
    }

    // Also: how many *-simulados pages exist?
    const counts = await db`
      SELECT count(*) AS n
      FROM pages
      WHERE type IN ('text-lesson','audio-lesson') AND slug LIKE '%-simulados'
    `;
    console.log(`\nTotal text-lesson *-simulados pages: ${counts[0].n}`);
  } catch (e) {
    console.error(e.message);
  } finally {
    db.end();
  }
})();
