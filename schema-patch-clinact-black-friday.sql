-- ClinAct — "Condição de lançamento Black Friday" (Karina 2026-10-29).
--
-- ClinAct goes on sale on 02/11/2026 with a launch promotion: annual R$ 179 in
-- the first year (then R$ 299/ano), monthly R$ 20,90 for the first three
-- charges (then R$ 29,90/mês), for subscriptions made 02/11 → 30/11/2026.
-- The promotion itself lives in code (lib/clinact/plans.ts, CLINACT_PROMOTIONS)
-- and is charged with a PagBank coupon on the NORMAL plan. This patch only
-- records, per subscription, what it was SOLD at, plus two e-mail markers:
--
--   promotion_key / promo_amount_cents / promo_cycles / pagbank_coupon_id
--       the offer at the time of the charge — "Minha assinatura" and the
--       e-mails read it, so the condition a student bought never depends on
--       what the code says later. NULL = sold at the normal price.
--   confirmation_sent_for / renewal_notice_sent_for
--       the PagBank subscription id the e-mail was sent for. Claimed with a
--       conditional UPDATE before sending, so checkout + webhook + cron can
--       all call the sender and one e-mail goes out per subscription. A new
--       subscription (new id) needs no reset.
--
-- Backfill: every EXISTING subscription is marked as already confirmed, so
-- the reconcile does not send a confirmation for a subscription from before
-- this release (its next renewal would otherwise trigger it).
--
-- Also seeds the two e-mail templates so they are editable at
-- /admin/email-templates (ON CONFLICT DO NOTHING — never overwrites an edit;
-- the code defaults in lib/email-render.ts are the fallback either way).
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-black-friday.sql              # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-black-friday.sql            # local
--
-- Rollback:
--   ALTER TABLE clinact_subscriptions
--     DROP COLUMN IF EXISTS promotion_key, DROP COLUMN IF EXISTS promo_amount_cents,
--     DROP COLUMN IF EXISTS promo_cycles, DROP COLUMN IF EXISTS pagbank_coupon_id,
--     DROP COLUMN IF EXISTS confirmation_sent_for, DROP COLUMN IF EXISTS renewal_notice_sent_for;
--   DELETE FROM email_templates WHERE kind IN ('clinact-subscription-confirmed', 'clinact-renewal-notice');

BEGIN;

ALTER TABLE clinact_subscriptions
  ADD COLUMN IF NOT EXISTS promotion_key text,
  ADD COLUMN IF NOT EXISTS promo_amount_cents integer,
  ADD COLUMN IF NOT EXISTS promo_cycles integer,
  ADD COLUMN IF NOT EXISTS pagbank_coupon_id text,
  ADD COLUMN IF NOT EXISTS confirmation_sent_for text,
  ADD COLUMN IF NOT EXISTS renewal_notice_sent_for text;

-- A promotion is all three facts or none of them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinact_subscriptions_promo_complete') THEN
    ALTER TABLE clinact_subscriptions ADD CONSTRAINT clinact_subscriptions_promo_complete CHECK (
      (promotion_key IS NULL AND promo_amount_cents IS NULL AND promo_cycles IS NULL)
      OR (promotion_key IS NOT NULL AND promo_amount_cents > 0 AND promo_cycles >= 1)
    );
  END IF;
END $$;

UPDATE clinact_subscriptions
   SET confirmation_sent_for = pagbank_subscription_id
 WHERE confirmation_sent_for IS NULL
   AND pagbank_subscription_id IS NOT NULL;

INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, sort_order)
VALUES
  ($t$clinact-subscription-confirmed$t$, $t$ClinAct — assinatura confirmada$t$, $t$Enviado quando o primeiro pagamento de uma assinatura do ClinAct é aprovado.$t$, $t$Assinatura do ClinAct confirmada$t$, $t$Olá, {{displayName}}$t$, $t$Sua assinatura do ClinAct está ativa$t$, $t$<p style="margin:0 0 14px;">Seu acesso ao ClinAct está liberado: todos os casos, a Minha Evolução e a revisão espaçada.</p><p style="margin:0 0 14px;"><strong>Plano:</strong> {{planLabel}}<br/>{{promoLine}}<strong>Primeira cobrança:</strong> {{firstCharge}}<br/><strong>Próxima cobrança:</strong> {{nextCharge}}</p><p style="margin:0 0 14px;">{{chargeSchedule}}</p><p style="margin:0 0 14px;">A assinatura renova automaticamente até você cancelar. Você pode cancelar quando quiser em Minha assinatura, e o acesso continua até o fim do período já pago.</p>$t$, $t$Começar a treinar →$t$, $t$/clinact/treinar$t$, $t$[{"tag":"displayName","description":"Primeiro nome do assinante"},{"tag":"planLabel","description":"Plano contratado (Mensal ou Anual)"},{"tag":"promoLine","description":"Linha da condição especial, quando houver (já formatada) — vazia sem promoção"},{"tag":"firstCharge","description":"Valor da primeira cobrança (ex.: R$ 179,00)"},{"tag":"nextCharge","description":"Valor e data da próxima cobrança (ex.: R$ 299,00 em 02/11/2027)"},{"tag":"chargeSchedule","description":"As cobranças por extenso (calculado do plano)"}]$t$::jsonb, 60),
  ($t$clinact-renewal-notice$t$, $t$ClinAct — aviso de renovação anual$t$, $t$Enviado 15 dias antes da primeira renovação de uma assinatura anual contratada com condição especial, que renova pelo valor normal.$t$, $t$Sua assinatura anual do ClinAct renova em {{renewalDate}}$t$, $t$Olá, {{displayName}}$t$, $t$Aviso de renovação$t$, $t$<p style="margin:0 0 14px;">Sua assinatura anual do ClinAct foi contratada na {{promoLabel}}, com o primeiro ano por {{firstCharge}}.</p><p style="margin:0 0 14px;">Em <strong>{{renewalDate}}</strong>, ela será renovada automaticamente pelo valor normal do plano: <strong>{{renewalAmount}}</strong>, no cartão cadastrado.</p><p style="margin:0 0 14px;">Se quiser continuar, não precisa fazer nada. Se preferir não renovar, cancele antes dessa data em Minha assinatura — o acesso continua até o fim do período já pago.</p>$t$, $t$Ver minha assinatura →$t$, $t$/clinact/assinatura$t$, $t$[{"tag":"displayName","description":"Primeiro nome do assinante"},{"tag":"promoLabel","description":"Nome da condição especial (ex.: Condição de lançamento Black Friday)"},{"tag":"firstCharge","description":"Valor pago no primeiro ano (ex.: R$ 179,00)"},{"tag":"renewalDate","description":"Data da renovação (ex.: 02/11/2027)"},{"tag":"renewalAmount","description":"Valor da renovação (ex.: R$ 299,00/ano)"}]$t$::jsonb, 61)
ON CONFLICT (kind) DO NOTHING;

COMMIT;
