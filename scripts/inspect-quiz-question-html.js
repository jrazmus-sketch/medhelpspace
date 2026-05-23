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
  // existing bradiarritmias h5p-quiz page
  const page = await db`SELECT id, slug FROM pages WHERE slug = 'bradiarritmias'`;
  console.log('PAGE:', page[0]);
  const qs = await db`SELECT id, position, substring(question, 1, 400) AS q
                      FROM quiz_questions WHERE page_id = ${page[0].id} ORDER BY position LIMIT 2`;
  for (const r of qs) {
    console.log(`\n-- position ${r.position} --`);
    console.log(r.q);
  }
  db.end();
})();
