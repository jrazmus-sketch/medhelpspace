#!/usr/bin/env node
/**
 * Permanently deletes the 10 test orders of 02–04/06/2026 (Karina 2026-11-20, Financeiro thread:
 * "exclusão definitiva", after checking no technical, financial or fiscal dependency).
 *
 * Verified before writing this (prod, 2026-11-20):
 *   - all 10 were placed by Justin's own test accounts/addresses; none was ever paid;
 *   - no coupon_redemptions / commissions row (the only FKs to orders), no NFS-e, no text reference
 *     to the ids in any other table;
 *   - the 3 PagBank orders (ORDE_067A…, ORDE_1DCE…, ORDE_6BF9…) have NO charge; their Pix QR codes
 *     expired 30 min after creation in June. The PagBank webhook answers an unknown order with
 *     a uniform 200 and does nothing, so a late notification cannot break anything.
 *
 * Usage:
 *   node scripts/delete-test-orders-2026-11-20.js --prod            # rehearsal: runs + checks, ROLLS BACK
 *   node scripts/delete-test-orders-2026-11-20.js --prod --apply    # commits
 *   node scripts/delete-test-orders-2026-11-20.js --db <url> --export <file.json>   # read-only copy of the rows
 *   node scripts/delete-test-orders-2026-11-20.js --db <url> --restore <file.json>  # puts the rows back exactly
 *
 * Before deleting, the full rows are written to parsed/financeiro/ (gitignored) — that file is the
 * rollback (`--restore`). One audit row `orders_test_deleted` records what was removed.
 */
const fs = require("fs");
const path = require("path");
require(path.resolve(__dirname, "../node_modules/dotenv")).config({ path: path.resolve(__dirname, "../app/.env.local"), quiet: true });
const postgres = require(path.resolve(__dirname, "../node_modules/postgres"));

const IDS = [
  "dd539709-b296-4ae4-8542-5ce1a40b20b9",
  "e11ff951-1d1c-4821-bbc6-73c38d2f4af6",
  "e3270a4a-05e7-49ee-b654-59b3e34613a7",
  "76231f23-552f-4f37-ad67-0778dd941500",
  "ef04994b-6f58-4ca7-a9ac-f4a2174880a1",
  "4b418620-54cd-4eac-a2fc-5b01eb2cb4ee",
  "57209181-d035-4d67-af27-55eeaf51b7be",
  "53a1a1ae-7615-4a39-a5b3-4064d988506d",
  "7d5d19f0-e0c4-4d88-8528-2edb24fde188",
  "40af3879-9d39-4536-91fa-0e127e01113c",
];
const BACKUP = path.resolve(__dirname, "../parsed/financeiro/pedidos-teste-junho-excluidos-2026-11-20.json");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const url = flag("--prod") ? process.env.DATABASE_URL : val("--db");
if (!url) {
  console.error("Use --prod or --db <url>");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
const ROLLBACK = Symbol("rollback");

async function exportRows(file) {
  await sql.begin("read only", async (tx) => {
    const rows = await tx`select to_jsonb(o) r from orders o where id = any(${IDS}) order by created_at`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows.map((x) => x.r), null, 1));
    console.log(`${rows.length} pedidos copiados para ${file}`);
  });
}

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  await sql.begin(async (tx) => {
    const exists = await tx`select count(*)::int n from orders where id = any(${rows.map((r) => r.id)})`;
    if (exists[0].n) throw new Error(`${exists[0].n} pedido(s) já existem — nada restaurado`);
    const ins = await tx`insert into orders select * from jsonb_populate_recordset(null::orders, ${sql.json(rows)}) returning id`;
    console.log(`${ins.length} pedidos restaurados`);
  });
}

async function run(apply) {
  const checks = [];
  const check = (name, ok, detail = "") => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  };
  try {
    await sql.begin(async (tx) => {
      const rows = await tx`select o.*, to_jsonb(o) as full_row from orders o where id = any(${IDS}) for update`;
      check("Os 10 pedidos existem", rows.length === IDS.length, `${rows.length} de ${IDS.length}`);
      check("Nenhum foi pago (status cancelado ou pendente, sem data de pagamento)",
        rows.every((r) => ["cancelled", "pending"].includes(r.status) && !r.paid_at));
      check("Nenhum tem nota fiscal", rows.every((r) => !r.nfse_number));
      check("Todos de 02 a 04/06/2026 (Brasília)",
        rows.every((r) => r.created_at >= new Date("2026-06-02T03:00:00Z") && r.created_at < new Date("2026-06-05T03:00:00Z")));
      const cr = await tx`select count(*)::int n from coupon_redemptions where order_id = any(${IDS})`;
      check("Nenhum uso de cupom ligado", cr[0].n === 0, String(cr[0].n));
      const cm = await tx`select count(*)::int n from commissions where order_id = any(${IDS})`;
      check("Nenhuma comissão de embaixador ligada", cm[0].n === 0, String(cm[0].n));
      if (checks.some((c) => !c.ok)) throw new Error("Verificação falhou — nada foi excluído");

      fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
      fs.writeFileSync(BACKUP, JSON.stringify(rows.map((r) => r.full_row), null, 1));
      check("Cópia completa salva antes da exclusão", fs.existsSync(BACKUP), path.relative(process.cwd(), BACKUP));

      const del = await tx`delete from orders where id = any(${IDS}) returning id`;
      check("10 pedidos excluídos", del.length === IDS.length, String(del.length));
      const left = await tx`select count(*)::int n from orders where id = any(${IDS})`;
      check("Nenhum dos 10 permanece", left[0].n === 0);
      await tx`insert into admin_audit_log (actor_user_id, action, details)
               values (null, 'orders_test_deleted', ${sql.json({
                 count: del.length,
                 order_ids: IDS,
                 reason: "Pedidos de teste de 02–04/06/2026, nunca pagos (Karina 2026-11-20)",
                 source: "scripts/delete-test-orders-2026-11-20.js",
               })})`;
      check("Registro no log de auditoria", true);
      if (checks.some((c) => !c.ok)) throw new Error("Verificação falhou — nada foi excluído");
      if (!apply) throw ROLLBACK;
    });
    console.log(`\n${checks.length}/${checks.length} verificações OK — APLICADO`);
  } catch (e) {
    if (e === ROLLBACK) console.log(`\n${checks.length}/${checks.length} verificações OK — ensaio, nada gravado (use --apply)`);
    else {
      console.error(e.message);
      process.exitCode = 1;
    }
  }
}

(async () => {
  if (val("--export")) await exportRows(path.resolve(val("--export")));
  else if (val("--restore")) await restore(path.resolve(val("--restore")));
  else await run(flag("--apply"));
  await sql.end();
})().catch(async (e) => {
  console.error(e.message);
  await sql.end();
  process.exit(1);
});
