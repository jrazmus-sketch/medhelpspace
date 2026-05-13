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
db`
  SELECT l.page_id, p.slug, p.title, length(l.body_html) AS html_len,
         substring(l.body_html, 1, 2000) AS sample
  FROM lessons l
  JOIN pages p ON p.id = l.page_id
  WHERE p.type = 'plain-content' AND p.status = 'publish'
    AND l.position = 1
  ORDER BY html_len DESC
  LIMIT 3
`.then(rows => {
  for (const r of rows) {
    console.log(`\n=== ${r.slug} (${r.title}) — ${r.html_len} chars ===`);
    console.log(r.sample);
    console.log('---');
  }
  db.end();
}).catch(e => { console.error(e.message); db.end(); process.exit(1); });
