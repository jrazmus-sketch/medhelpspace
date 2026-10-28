"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "@/lib/i18n";
import { Search, Copy, Check, ExternalLink, FileText, Lock, Pencil, AlertTriangle } from "lucide-react";
import { BR_TZ, todayKeyBR, toDateKeyBR } from "@/lib/br-date";
import { formatCpf, formatCnpj } from "@/lib/br";

// ── Fiscal constants. Edit here when the accountant finalizes wording.
//    From 01/11/2026 Simples Nacional companies issue on the national Emissor
//    (Karina 2026-10-27) — manually, with the e-CNPJ A1 in her browser; the
//    certificate never touches this app. No ISS rate is shown: MedHelpSpace
//    pays ISS inside the Simples (DAS), so a fixed rate here would be wrong. ──
const SERVICO = {
  // Código de Tributação Nacional: instrução, treinamento, orientação pedagógica
  // e avaliação de conhecimentos.
  codigo: "080201",
  revalida:
    "Acesso à plataforma de estudos MedHelpSpace — curso preparatório online para o Revalida (Turma {turma}).",
  // Karina 2026-10-27, verbatim ("plano mensal" / "plano anual").
  clinact:
    "Assinatura da plataforma educacional MedHelpSpace ClinAct, destinada ao treinamento online de raciocínio e decisão clínica — plano {plano}, referente ao período de {inicio} a {fim}.",
};
const EMISSOR_NACIONAL_URL = "https://www.nfse.gov.br/EmissorNacional";
// First day of the national Emissor. A test nota issued before it was a WebISS one.
const NACIONAL_DESDE = "2026-11-01";

export interface FiscalRow {
  kind: "revalida" | "clinact";
  /** Order uuid (Revalida) or PagBank INVO_ id (ClinAct). */
  id: string;
  userId: string;
  product: string;
  /** Cohort name (Revalida) or plan key (ClinAct), for the description. */
  descriptionTarget: string;
  planKey: "mensal" | "anual" | null;
  occurrence: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  saleDate: string;
  paidAt: string | null;
  paymentMethod: string;
  installments: number | null;
  refunded: boolean;
  originalCents: number;
  discountCents: number;
  surchargeCents: number;
  totalCents: number;
  /**
   * Who the nota is issued to: the student ("aluno"), another Pessoa Física, or
   * a company. Null only for a ClinAct subscription from before the checkout
   * asked — never filled in from the card.
   */
  tomador: {
    type: "aluno" | "pf" | "pj";
    name: string;
    doc: string;
    email: string;
    phone: string;
    cep: string;
    address: string;
    complement: string;
    neighborhood: string;
    cityState: string;
  } | null;
  /** Set when the student is not the tomador. */
  student: { name: string; cpf: string; email: string } | null;
  listName: string;
  listEmail: string;
  eligibleAt: string;
  inGuarantee: boolean;
  nfseStatus: string | null;
  nfseNumber: string | null;
  nfseVerificacao: string | null;
  nfseIssuedAt: string | null;
  nfseCancelledAt: string | null;
  /** An internal test, not a sale (Karina 2026-10-27): listed only under "Testes internos". */
  internalTest: boolean;
}

type Product = "all" | "revalida" | "clinact";
type Situation = "all" | "pending" | "issued" | "cancelled" | "refunded" | "test";
type NotaState = "pending" | "issued" | "cancelled" | "skipped";

function notaState(r: FiscalRow): NotaState {
  if (r.nfseStatus === "cancelled") return "cancelled";
  if (r.nfseStatus === "issued") return "issued";
  if (r.nfseStatus === "skipped") return "skipped";
  return "pending";
}

// The status filters are predicates, not one state: a sale refunded after its
// nota was issued is BOTH "Emitida" and "Reembolsada" — and that is exactly
// the one that needs the nota cancelled.
//
// An internal test is never a sale nor a nota pending on the Emissor Nacional
// (Karina 2026-10-27): every filter but "Testes internos" leaves it out.
const SITUATION: Record<Exclude<Situation, "all">, (r: FiscalRow) => boolean> = {
  pending: (r) => !r.internalTest && notaState(r) === "pending" && !r.refunded,
  issued: (r) => !r.internalTest && notaState(r) === "issued",
  cancelled: (r) => !r.internalTest && notaState(r) === "cancelled",
  refunded: (r) => !r.internalTest && r.refunded,
  test: (r) => r.internalTest,
};
const isSale = (r: FiscalRow) => !r.internalTest;

/** A test nota recorded before the national Emissor existed — it was a WebISS one. */
function isWebissTestNota(r: FiscalRow) {
  const state = notaState(r);
  return (
    r.internalTest &&
    (state === "issued" || state === "cancelled") &&
    !!r.nfseIssuedAt &&
    toDateKeyBR(r.nfseIssuedAt) < NACIONAL_DESDE
  );
}

function fmt(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
// Values go onto the nota, so they use the Brazilian calendar date — never the
// admin's browser timezone. A bare YYYY-MM-DD is already a calendar date.
function fmtDateBR(value: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: BR_TZ });
}
function fmtDoc(r: FiscalRow) {
  if (!r.tomador?.doc) return "";
  return r.tomador.type === "pj" ? formatCnpj(r.tomador.doc) : formatCpf(r.tomador.doc);
}

// Fiscal VALUES are Portuguese, like the description — they are pasted into
// the portal. Only the labels follow the admin's language.
function paymentStatus(r: FiscalRow) {
  const status = r.refunded ? "Reembolsado" : "Pago";
  const method =
    r.kind === "clinact"
      ? "Cartão de crédito (assinatura)"
      : r.paymentMethod === "pix"
        ? "Pix"
        : `Cartão de crédito${r.installments && r.installments > 1 ? ` (${r.installments}x)` : ""}`;
  return `${status} — ${method}`;
}
function planLabel(r: FiscalRow) {
  return r.planKey === "anual" ? "Anual" : "Mensal";
}
function chargeLabel(r: FiscalRow) {
  return !r.occurrence || r.occurrence <= 1 ? "Primeira cobrança" : `Renovação (${r.occurrence}ª cobrança)`;
}
function periodLabel(r: FiscalRow) {
  return `${fmtDateBR(r.periodStart)} a ${fmtDateBR(r.periodEnd)}`;
}
function descricao(r: FiscalRow) {
  if (r.kind === "clinact") {
    return SERVICO.clinact
      .replace("{plano}", planLabel(r).toLowerCase())
      .replace("{inicio}", fmtDateBR(r.periodStart))
      .replace("{fim}", fmtDateBR(r.periodEnd));
  }
  return SERVICO.revalida.replace("{turma}", r.descriptionTarget);
}

interface Field {
  label: string;
  value: string;
  wide?: boolean;
}
interface Section {
  title: string;
  fields: Field[];
  note?: string;
}

/**
 * Everything to copy for one sale, grouped. The modal AND "Copiar tudo" are
 * built from this one list, so a field can never carry two different names.
 * The money block keeps the installment surcharge on its own line: it is NOT
 * part of the service value of the nota (Karina 2026-10-27).
 */
function sectionsFor(r: FiscalRow, t: TFunction): Section[] {
  const k = (key: string) => t(`notasFiscais.${key}`);
  const isClinact = r.kind === "clinact";

  const venda: Field[] = [
    { label: k(isClinact ? "fieldInvoiceId" : "fieldOrderId"), value: r.id, wide: true },
    { label: k("fieldProduct"), value: r.product },
  ];
  if (isClinact) {
    venda.push(
      { label: k("fieldPlan"), value: planLabel(r) },
      { label: k("fieldCharge"), value: chargeLabel(r) },
      { label: k("fieldPeriod"), value: periodLabel(r) },
    );
  }
  venda.push(
    { label: k(isClinact ? "fieldChargeDate" : "fieldSaleDate"), value: fmtDateBR(r.saleDate) },
    { label: k("fieldPaidDate"), value: fmtDateBR(r.paidAt) },
    { label: k("fieldPaymentStatus"), value: paymentStatus(r), wide: true },
  );

  const tm = r.tomador;
  const tomadorFields: Field[] = [];
  if (tm) {
    tomadorFields.push(
      { label: k(tm.type === "pj" ? "fieldCompanyName" : "fieldName"), value: tm.name, wide: true },
      { label: k(tm.type === "pj" ? "fieldCnpj" : "fieldCpf"), value: fmtDoc(r) },
      { label: k("fieldEmail"), value: tm.email },
      { label: k("fieldPhone"), value: tm.phone },
      { label: k("fieldCep"), value: tm.cep },
      { label: k("fieldAddress"), value: tm.address, wide: true },
    );
    if (tm.complement) tomadorFields.push({ label: k("fieldComplement"), value: tm.complement });
    tomadorFields.push(
      { label: k("fieldNeighborhood"), value: tm.neighborhood },
      { label: k("fieldCity"), value: tm.cityState },
    );
  }
  const tomadorTitle = !tm
    ? k("sectionTomador")
    : tm.type === "pj"
      ? k("sectionTomadorPj")
      : tm.type === "pf"
        ? k("sectionTomadorOtherPf")
        : k("sectionTomadorPf");

  const sections: Section[] = [
    { title: k("sectionVenda"), fields: venda },
    { title: tomadorTitle, fields: tomadorFields, note: tm ? undefined : k("tomadorMissing") },
  ];

  if (r.student) {
    const studentFields: Field[] = [
      { label: k("fieldName"), value: r.student.name, wide: true },
      { label: k("fieldEmail"), value: r.student.email },
    ];
    if (r.student.cpf) studentFields.splice(1, 0, { label: k("fieldCpf"), value: formatCpf(r.student.cpf) });
    sections.push({ title: k("sectionAluno"), fields: studentFields });
  }

  sections.push({
    title: k("sectionServico"),
    fields: [
      { label: k("fieldDescription"), value: descricao(r), wide: true },
      { label: k("fieldServiceCode"), value: SERVICO.codigo },
    ],
  });

  const valores: Field[] = [
    { label: k("fieldOriginal"), value: fmt(r.originalCents) },
    { label: k("fieldDiscount"), value: fmt(r.discountCents) },
    { label: k("fieldService"), value: fmt(r.originalCents - r.discountCents) },
  ];
  if (r.surchargeCents > 0) valores.push({ label: k("fieldSurcharge"), value: fmt(r.surchargeCents) });
  valores.push({ label: k("fieldTotal"), value: fmt(r.totalCents) });
  sections.push({ title: k("sectionValores"), fields: valores });

  return sections;
}

function copyBlock(r: FiscalRow): string {
  // Always the Portuguese names — the block is pasted next to a Portuguese
  // portal, whatever language the admin UI is in.
  const tPt = i18n.getFixedT("pt-BR");
  return sectionsFor(r, tPt)
    .map((s) => [`— ${s.title} —`, ...s.fields.map((f) => `${f.label}: ${f.value || "—"}`)].join("\n"))
    .join("\n\n");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — no-op */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!value}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="break-words text-sm text-foreground">{value || "—"}</p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

const BADGE = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  issued: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  skipped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  refunded: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  test: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

function StatusBadges({ r }: { r: FiscalRow }) {
  const { t } = useTranslation();
  const state = notaState(r);
  const label =
    state === "issued"
      ? r.nfseNumber
        ? t("notasFiscais.notaNumberShort", { n: r.nfseNumber })
        : t("notasFiscais.statusIssued")
      : t(
          `notasFiscais.${
            { pending: "statusPending", cancelled: "statusCancelled", skipped: "statusSkipped" }[state]
          }`,
        );
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        {r.internalTest && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE.test}`}>
            {t("notasFiscais.testBadge")}
          </span>
        )}
        {!(state === "pending" && (r.refunded || r.internalTest)) && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[state]}`}>
            {label}
          </span>
        )}
        {r.refunded && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE.refunded}`}>
            {t("notasFiscais.statusRefunded")}
          </span>
        )}
      </div>
      {!r.internalTest && state === "pending" && !r.refunded && r.inGuarantee && (
        <p className="text-[11px] text-muted-foreground">
          {t("notasFiscais.guaranteeUntil", { date: fmtDateBR(r.eligibleAt) })}
        </p>
      )}
      {!r.internalTest && state === "issued" && r.refunded && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {t("notasFiscais.refundedWithActiveNota")}
        </p>
      )}
      {/* Karina's wording, verbatim. Whether that WebISS nota was cancelled is
          what WebISS says — never assumed here; she records it by hand. */}
      {isWebissTestNota(r) &&
        (state === "issued" && r.refunded ? (
          <p className="flex items-start gap-1 text-[11px] font-medium text-red-700 dark:text-red-400">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            {t("notasFiscais.webissTestRefunded")}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("notasFiscais.webissTestNota")}</p>
        ))}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              value === o.value
                ? "border-brand bg-brand/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1.5 text-xs opacity-70">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NotasFiscaisClient({
  rows: initialRows,
  guaranteeDays,
}: {
  rows: FiscalRow[];
  guaranteeDays: number;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FiscalRow[]>(initialRows);
  const [product, setProduct] = useState<Product>("all");
  const [situation, setSituation] = useState<Situation>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FiscalRow | null>(null);

  const byProduct = rows.filter((r) => product === "all" || r.kind === product);
  const count = (s: Exclude<Situation, "all">) => byProduct.filter(SITUATION[s]).length;

  const q = search.trim().toLowerCase();
  const filtered = byProduct.filter((r) => {
    if (situation === "all" ? !isSale(r) : !SITUATION[situation](r)) return false;
    if (!q) return true;
    return [r.listName, r.listEmail, r.product, r.tomador?.doc ?? "", r.student?.name ?? "", r.id]
      .some((v) => v.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{t("notasFiscais.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("notasFiscais.subtitle")}</p>
        </div>
        <a
          href={EMISSOR_NACIONAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("notasFiscais.openPortal")}
        </a>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <Segmented<Product>
          label={t("notasFiscais.productLabel")}
          value={product}
          onChange={setProduct}
          options={[
            { value: "all", label: t("notasFiscais.productAll") },
            { value: "revalida", label: t("notasFiscais.productRevalida") },
            { value: "clinact", label: t("notasFiscais.productClinact") },
          ]}
        />
        <Segmented<Situation>
          label={t("notasFiscais.statusLabel")}
          value={situation}
          onChange={setSituation}
          options={[
            { value: "all", label: t("notasFiscais.statusAll"), count: byProduct.filter(isSale).length },
            { value: "pending", label: t("notasFiscais.statusPending"), count: count("pending") },
            { value: "issued", label: t("notasFiscais.statusIssued"), count: count("issued") },
            { value: "cancelled", label: t("notasFiscais.statusCancelled"), count: count("cancelled") },
            { value: "refunded", label: t("notasFiscais.statusRefunded"), count: count("refunded") },
            { value: "test", label: t("notasFiscais.statusTest"), count: count("test") },
          ]}
        />
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("notasFiscais.searchPlaceholder")}
            className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {situation === "test" && (
        <p className="text-sm text-muted-foreground">{t("notasFiscais.testListNote")}</p>
      )}

      {filtered.length === 0 && (
        <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t("notasFiscais.noResults")}
        </p>
      )}

      {/* Phone: one card per sale */}
      {filtered.length > 0 && (
        <ul className="space-y-3 sm:hidden">
          {filtered.map((r) => (
            <li key={`${r.kind}:${r.id}`}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="w-full rounded-xl border border-border bg-surface-1 p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{r.listName}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.product}</p>
                  </div>
                  <p className="shrink-0 font-semibold text-foreground">{fmt(r.totalCents)}</p>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <StatusBadges r={r} />
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDateBR(r.paidAt ?? r.saleDate)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* sm+: table */}
      {filtered.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-1 text-left">
                {[
                  t("notasFiscais.colDate"),
                  t("notasFiscais.colBuyer"),
                  t("notasFiscais.colProduct"),
                  t("notasFiscais.colAmount"),
                  t("notasFiscais.colStatus"),
                  "",
                ].map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={`${r.kind}:${r.id}`}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-1/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {fmtDateBR(r.paidAt ?? r.saleDate)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium leading-tight text-foreground">{r.listName}</p>
                    <p className="text-xs text-muted-foreground">{r.listEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{r.product}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                    {fmt(r.totalCents)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadges r={r} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="ml-auto flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {notaState(r) === "pending" && isSale(r) ? t("notasFiscais.fill") : t("notasFiscais.view")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <NotaDetail
          row={selected}
          guaranteeDays={guaranteeDays}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setRows((prev) =>
              prev.map((r) => (r.kind === updated.kind && r.id === updated.id ? updated : r)),
            );
            setSelected(updated);
          }}
        />
      )}
    </div>
  );
}

type Action = "issue" | "cancel" | "uncancel" | "refund" | "unrefund" | "test" | "untest";

function NotaDetail({
  row,
  guaranteeDays,
  onClose,
  onSaved,
}: {
  row: FiscalRow;
  guaranteeDays: number;
  onClose: () => void;
  onSaved: (r: FiscalRow) => void;
}) {
  const { t } = useTranslation();
  const today = todayKeyBR();
  const state = notaState(row);
  const [numero, setNumero] = useState(row.nfseNumber ?? "");
  const [issuedOn, setIssuedOn] = useState(row.nfseIssuedAt ? toDateKeyBR(row.nfseIssuedAt) : today);
  const [verificacao, setVerificacao] = useState(row.nfseVerificacao ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [copiedAll, setCopiedAll] = useState(false);
  // A recorded nota opens read-only so nobody re-saves it while just looking.
  const [editing, setEditing] = useState(state === "pending");

  const sections = sectionsFor(row, t);

  function send(action: Action) {
    if (action === "cancel" && !window.confirm(t("notasFiscais.cancelConfirm"))) return;
    if (action === "refund" && !window.confirm(t("notasFiscais.refundConfirm"))) return;
    if (action === "test" && !window.confirm(t("notasFiscais.markTestConfirm"))) return;
    startSaving(async () => {
      setError(null);
      try {
        const res = await fetch("/api/admin/nfse/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: row.kind,
            id: row.id,
            action,
            numero: numero.trim(),
            verificacao: verificacao.trim(),
            issuedOn,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("notasFiscais.saveError"));
        const nowIso = new Date().toISOString();
        const next: FiscalRow = { ...row };
        if (action === "issue") {
          next.nfseStatus = "issued";
          next.nfseNumber = numero.trim();
          next.nfseVerificacao = verificacao.trim() || null;
          next.nfseIssuedAt = data.issuedAt ?? nowIso;
          next.nfseCancelledAt = null;
        } else if (action === "cancel") {
          next.nfseStatus = "cancelled";
          next.nfseCancelledAt = nowIso;
        } else if (action === "uncancel") {
          next.nfseStatus = "issued";
          next.nfseCancelledAt = null;
        } else if (action === "test" || action === "untest") {
          next.internalTest = action === "test";
        } else {
          next.refunded = action === "refund";
        }
        setEditing(false);
        onSaved(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("notasFiscais.saveError"));
      }
    });
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(copyBlock(row));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      /* no-op */
    }
  }

  const inputCls =
    "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:bg-surface-1 disabled:text-muted-foreground";
  const secondaryBtn =
    "flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-1 disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-4">
      <div className="my-4 w-full min-w-0 max-w-xl rounded-2xl border border-border bg-background p-4 shadow-xl sm:my-8 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{t("notasFiscais.detailTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {row.listName} · {row.product} · {fmt(row.totalCents)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <StatusBadges r={row} />
          <button
            type="button"
            onClick={copyAll}
            className="flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {t("notasFiscais.copyAll")}
          </button>
        </div>

        {row.internalTest && (
          <p className="mb-4 rounded-lg border border-purple-500/30 bg-purple-50 px-3 py-2 text-xs text-purple-900 dark:bg-purple-900/20 dark:text-purple-200">
            {t("notasFiscais.testBanner")}
          </p>
        )}

        {!row.internalTest && state === "pending" && !row.refunded && row.inGuarantee && (
          <p className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            {t("notasFiscais.guaranteeNote", { days: guaranteeDays })}
          </p>
        )}

        {sections.map((s) => (
          <div key={s.title} className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {s.title}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {s.fields.map((f) => (
                <div key={f.label} className={f.wide ? "sm:col-span-2" : undefined}>
                  <CopyField label={f.label} value={f.value} />
                </div>
              ))}
            </div>
            {s.note && <p className="mt-2 text-xs text-muted-foreground">{s.note}</p>}
          </div>
        ))}

        {/* Record what was done on the Portal Nacional */}
        <div className="border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("notasFiscais.markIssued")}
            </h3>
            {!editing && state !== "pending" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                {t("notasFiscais.lockedBadge")}
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t("notasFiscais.manualNote")}</p>

          {state === "cancelled" && row.nfseCancelledAt && (
            <p className="mb-3 text-sm text-foreground">
              {t("notasFiscais.cancelledOn", { date: fmtDateBR(row.nfseCancelledAt) })}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                {t("notasFiscais.numeroLabel")}
              </span>
              <input
                type="text"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                disabled={!editing}
                placeholder={t("notasFiscais.numeroPlaceholder")}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                {t("notasFiscais.issuedOnLabel")}
              </span>
              <input
                type="date"
                value={issuedOn}
                max={today}
                onChange={(e) => setIssuedOn(e.target.value)}
                disabled={!editing}
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                {t("notasFiscais.verificacaoLabel")}
              </span>
              <input
                type="text"
                value={verificacao}
                onChange={(e) => setVerificacao(e.target.value)}
                disabled={!editing}
                placeholder={t("notasFiscais.verificacaoPlaceholder")}
                className={inputCls}
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => send("issue")}
                  className="min-h-11 flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? t("notasFiscais.saving") : t("notasFiscais.saveIssued")}
                </button>
                {state !== "pending" && (
                  <button type="button" onClick={() => setEditing(false)} className={secondaryBtn}>
                    {t("common.cancel")}
                  </button>
                )}
              </>
            ) : (
              <>
                {state === "issued" && (
                  <>
                    <button type="button" onClick={() => setEditing(true)} className={secondaryBtn}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t("notasFiscais.edit")}
                    </button>
                    <button type="button" disabled={saving} onClick={() => send("cancel")} className={secondaryBtn}>
                      {t("notasFiscais.cancelNota")}
                    </button>
                  </>
                )}
                {state === "cancelled" && (
                  <button type="button" disabled={saving} onClick={() => send("uncancel")} className={secondaryBtn}>
                    {t("notasFiscais.uncancel")}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ClinAct has no refund flow in the app: the refund is made in the
              PagBank panel and only recorded here. Revalida refunds come from
              the order itself (Faturamento → reembolso). */}
          {row.kind === "clinact" && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs text-muted-foreground">{t("notasFiscais.refundHint")}</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => send(row.refunded ? "unrefund" : "refund")}
                className={secondaryBtn}
              >
                {row.refunded ? t("notasFiscais.unmarkRefunded") : t("notasFiscais.markRefunded")}
              </button>
            </div>
          )}

          {/* A test purchase made after 28/10/2026 is marked here, by hand. */}
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted-foreground">{t("notasFiscais.testHint")}</p>
            <button
              type="button"
              disabled={saving}
              onClick={() => send(row.internalTest ? "untest" : "test")}
              className={secondaryBtn}
            >
              {row.internalTest ? t("notasFiscais.unmarkTest") : t("notasFiscais.markTest")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
