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
  SELECT p.slug, p.title,
    (length(l.body_html) - length(replace(l.body_html, '<h2', ''))) / 3 AS h2_count,
    (length(l.body_html) - length(replace(l.body_html, '<h3', ''))) / 3 AS h3_count,
    substring(l.body_html, 1, 600) AS sample
  FROM lessons l
  JOIN pages p ON p.id = l.page_id
  WHERE p.type = 'plain-content' AND p.status = 'publish'
  ORDER BY h2_count DESC, h3_count DESC
  LIMIT 8
`.then(rows => {
  for (const r of rows)
    console.log(`${r.slug}: h2=${r.h2_count} h3=${r.h3_count}\n  ${r.sample.slice(0,200).replace(/\n/g,' ')}\n`);
  db.end();
}).catch(e => { console.error(e.message); db.end(); process.exit(1); });
