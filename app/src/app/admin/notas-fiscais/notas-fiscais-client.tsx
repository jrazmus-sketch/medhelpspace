"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Search, Copy, Check, ExternalLink, FileText } from "lucide-react";

// ── Fiscal constants (validated via the 2026-06-27 test note). Edit here when the
//    accountant finalizes wording / rates. `{turma}` is replaced with the cohort. ──
const SERVICO = {
  codigo: "0802",
  iss: "5%",
  descricaoTemplate:
    "Acesso à plataforma de estudos MedHelpSpace — curso preparatório online para o Revalida (Turma {turma}).",
};
const WEBISS_URL = "https://feiradesantanaba.webiss.com.br/";

interface Row {
  id: string;
  userId: string;
  email: string;
  accountName: string | null;
  cohortName: string;
  amountCents: number;
  createdAt: string;
  eligibleAt: string;
  ready: boolean;
  waiting: boolean;
  firstName: string;
  lastName: string;
  cpf: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  nfseStatus: string | null;
  nfseNumber: string | null;
  nfseVerificacao: string | null;
  nfseIssuedAt: string | null;
}

function fmt(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buyerName(r: Row) {
  const n = `${r.firstName} ${r.lastName}`.trim();
  return n || r.accountName || r.email;
}
function descricao(r: Row) {
  return SERVICO.descricaoTemplate.replace("{turma}", r.cohortName);
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
      className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
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
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm text-foreground">{value || "—"}</p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

export function NotasFiscaisClient({
  rows: initialRows,
  guaranteeDays,
}: {
  rows: Row[];
  guaranteeDays: number;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [filter, setFilter] = useState<"ready" | "waiting" | "issued" | "all">("ready");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const counts = {
    ready: rows.filter((r) => r.ready).length,
    waiting: rows.filter((r) => r.waiting).length,
    issued: rows.filter((r) => r.nfseStatus === "issued").length,
  };

  const filtered = rows.filter((r) => {
    const byFilter =
      filter === "all"
        ? true
        : filter === "ready"
          ? r.ready
          : filter === "waiting"
            ? r.waiting
            : r.nfseStatus === "issued" || r.nfseStatus === "skipped";
    const q = search.toLowerCase();
    const bySearch =
      !q ||
      buyerName(r).toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.cohortName.toLowerCase().includes(q) ||
      r.cpf.includes(q);
    return byFilter && bySearch;
  });

  function badge(r: Row) {
    if (r.nfseStatus === "issued")
      return {
        label: r.nfseNumber
          ? t("notasFiscais.notaNumberShort", { n: r.nfseNumber })
          : t("notasFiscais.statusIssued"),
        cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      };
    if (r.nfseStatus === "skipped")
      return {
        label: t("notasFiscais.statusSkipped"),
        cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      };
    if (r.ready)
      return {
        label: t("notasFiscais.statusReady"),
        cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      };
    return {
      label: t("notasFiscais.statusWaiting"),
      cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {t("notasFiscais.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("notasFiscais.subtitle")}</p>
        </div>
        <a
          href={WEBISS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("notasFiscais.openWebiss")}
        </a>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { key: "ready", label: t("notasFiscais.summaryReady"), value: counts.ready, accent: "text-green-600 dark:text-green-400" },
          { key: "waiting", label: t("notasFiscais.summaryWaiting"), value: counts.waiting, accent: "text-yellow-600 dark:text-yellow-400" },
          { key: "issued", label: t("notasFiscais.summaryIssued"), value: counts.issued, accent: "text-foreground" },
        ].map(({ key, label, value, accent }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key as typeof filter)}
            className={`rounded-xl border bg-surface-1 p-4 text-left transition-colors ${
              filter === key ? "border-brand" : "border-border hover:border-muted-foreground/40"
            }`}
          >
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("notasFiscais.searchPlaceholder")}
            className="rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="ready">{t("notasFiscais.filterReady")}</option>
          <option value="waiting">{t("notasFiscais.filterWaiting")}</option>
          <option value="issued">{t("notasFiscais.filterIssued")}</option>
          <option value="all">{t("notasFiscais.filterAll")}</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left">
              {[
                t("notasFiscais.colDate"),
                t("notasFiscais.colBuyer"),
                t("notasFiscais.colCohort"),
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("notasFiscais.noResults")}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const b = badge(r);
              return (
                <tr
                  key={r.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-1/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium leading-tight text-foreground">{buyerName(r)}</p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">{r.cohortName}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                    {fmt(r.amountCents)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}
                    >
                      {b.label}
                    </span>
                    {r.waiting && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {t("notasFiscais.eligibleOn", { date: fmtDate(r.eligibleAt) })}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="ml-auto flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {r.nfseStatus === "issued" ? t("notasFiscais.view") : t("notasFiscais.fill")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <NotaDetail
          row={selected}
          guaranteeDays={guaranteeDays}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function NotaDetail({
  row,
  guaranteeDays,
  onClose,
  onSaved,
}: {
  row: Row;
  guaranteeDays: number;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const { t } = useTranslation();
  const [numero, setNumero] = useState(row.nfseNumber ?? "");
  const [verificacao, setVerificacao] = useState(row.nfseVerificacao ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const fullAddress = [row.address, row.number].filter(Boolean).join(", ");
  const cityState = [row.city, row.state].filter(Boolean).join(" - ");

  const allBlock = [
    `Nome: ${`${row.firstName} ${row.lastName}`.trim()}`,
    `CPF: ${row.cpf}`,
    `E-mail: ${row.email}`,
    `Telefone: ${row.phone}`,
    `CEP: ${row.cep}`,
    `Endereço: ${fullAddress}`,
    `Bairro: ${row.neighborhood}`,
    `Cidade: ${cityState}`,
    "—",
    `Serviço: ${descricao(row)}`,
    `Cód. serviço municipal: ${SERVICO.codigo}`,
    `Alíquota ISS: ${SERVICO.iss}`,
    `Valor: ${fmt(row.amountCents)}`,
  ].join("\n");

  function save(action: "issue" | "skip") {
    startSaving(async () => {
      setError(null);
      try {
        const res = await fetch("/api/admin/nfse/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: row.id,
            action,
            numero: numero.trim(),
            verificacao: verificacao.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("notasFiscais.saveError"));
        onSaved({
          ...row,
          ready: false,
          waiting: false,
          nfseStatus: action === "skip" ? "skipped" : "issued",
          nfseNumber: action === "issue" ? numero.trim() : null,
          nfseVerificacao: action === "issue" ? verificacao.trim() || null : null,
          nfseIssuedAt: new Date().toISOString(),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : t("notasFiscais.saveError"));
      }
    });
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(allBlock);
    } catch {
      /* no-op */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {t("notasFiscais.detailTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {buyerName(row)} · {row.cohortName} · {fmt(row.amountCents)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("common.close")}
          </button>
        </div>

        {row.waiting && (
          <p className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            {t("notasFiscais.guaranteeNote", { days: guaranteeDays })}
          </p>
        )}

        {/* Tomador */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("notasFiscais.sectionTomador")}
            </h3>
            <button
              type="button"
              onClick={copyAll}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Copy className="h-3 w-3" />
              {t("notasFiscais.copyAll")}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField label={t("notasFiscais.fieldName")} value={`${row.firstName} ${row.lastName}`.trim()} />
            <CopyField label={t("notasFiscais.fieldCpf")} value={row.cpf} />
            <CopyField label={t("notasFiscais.fieldEmail")} value={row.email} />
            <CopyField label={t("notasFiscais.fieldPhone")} value={row.phone} />
            <CopyField label={t("notasFiscais.fieldCep")} value={row.cep} />
            <CopyField label={t("notasFiscais.fieldAddress")} value={fullAddress} />
            <CopyField label={t("notasFiscais.fieldNeighborhood")} value={row.neighborhood} />
            <CopyField label={t("notasFiscais.fieldCity")} value={cityState} />
          </div>
        </div>

        {/* Serviço */}
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("notasFiscais.sectionServico")}
          </h3>
          <div className="grid gap-2">
            <CopyField label={t("notasFiscais.fieldDescription")} value={descricao(row)} />
            <div className="grid gap-2 sm:grid-cols-3">
              <CopyField label={t("notasFiscais.fieldServiceCode")} value={SERVICO.codigo} />
              <CopyField label={t("notasFiscais.fieldIss")} value={SERVICO.iss} />
              <CopyField label={t("notasFiscais.fieldAmount")} value={fmt(row.amountCents)} />
            </div>
          </div>
        </div>

        {/* Mark as issued */}
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("notasFiscais.markIssued")}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                {t("notasFiscais.numeroLabel")}
              </span>
              <input
                type="text"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder={t("notasFiscais.numeroPlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                {t("notasFiscais.verificacaoLabel")}
              </span>
              <input
                type="text"
                value={verificacao}
                onChange={(e) => setVerificacao(e.target.value)}
                placeholder={t("notasFiscais.verificacaoPlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => save("issue")}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? t("notasFiscais.saving") : t("notasFiscais.saveIssued")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save("skip")}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              {t("notasFiscais.skip")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
