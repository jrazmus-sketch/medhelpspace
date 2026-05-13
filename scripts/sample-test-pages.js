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
  SELECT p.id, p.slug, p.title, p.type, length(l.body_html) AS len,
         substring(l.body_html, 1, 1200) AS sample
  FROM lessons l
  JOIN pages p ON p.id = l.page_id
  WHERE p.id IN (652, 5274)  -- bradiarritimias + neoplasias neurologia
     OR p.slug IN ('disturbios-hidroeletroliticos-resumos','cardiopatia-congenita-resumos')
  ORDER BY p.id
`.then(rows => {
  for (const r of rows) {
    console.log(`\n=== id=${r.id} ${r.slug} [${r.type}] ${r.len} chars ===`);
    console.log(r.sample);
    console.log('---');
  }
  db.end();
}).catch(e => { console.error(e.message); db.end(); process.exit(1); });
