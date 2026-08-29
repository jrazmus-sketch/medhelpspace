"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, FileText, Loader2, TriangleAlert, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dryRunImport, commitImport, uploadClinactMedia, type ImportReport, type ImportRow, type CommitResult } from "@/actions/clinact";
import { parseCaseFile, FORMAT_VERSION } from "@/lib/clinact/parse";
import { mediaKey } from "@/lib/clinact/media";
import { FORMAT_LABELS, FORMATS } from "@/lib/clinact/types";

type Source = { name: string; text: string };

const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-brand text-brand-fg hover:opacity-90`;
const btnGhost = `${btn} border border-border hover:bg-accent`;

export function ImportClient() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [paste, setPaste] = useState("");
  const [updatePublished, setUpdatePublished] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [mediaLog, setMediaLog] = useState<{ name: string; ok: boolean }[]>([]);
  const [pending, startTransition] = useTransition();
  const [mediaBusy, setMediaBusy] = useState(false);

  const allSources = (): Source[] => {
    const list = [...sources];
    if (paste.trim()) list.push({ name: t("clinact.importer.pasted"), text: paste });
    return list;
  };

  // Instant, client-side count so she sees the file was read before the
  // server round trip (which also HEADs every media file).
  const localCount = allSources().reduce((n, s) => n + parseCaseFile(s.text).cases.length, 0);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const added: Source[] = [];
    for (const f of Array.from(files)) {
      if (!/\.(md|txt)$/i.test(f.name)) {
        toast.error(t("clinact.importer.onlyText", { name: f.name }));
        continue;
      }
      added.push({ name: f.name, text: await f.text() });
    }
    setSources((s) => [...s, ...added]);
    setReport(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onMedia(files: FileList | null) {
    if (!files?.length) return;
    setMediaBusy(true);
    const log: { name: string; ok: boolean }[] = [];
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      const r = await uploadClinactMedia(fd);
      log.push({ name: mediaKey(f.name), ok: !("error" in r) });
    }
    setMediaLog((m) => [...m, ...log]);
    setMediaBusy(false);
    if (mediaRef.current) mediaRef.current.value = "";
    // Media state changed → the dry run is stale.
    setReport(null);
  }

  function onAnalyze() {
    const list = allSources();
    if (!list.length) return;
    startTransition(async () => {
      const r = await dryRunImport(list, updatePublished);
      setReport(r);
      setResult(null);
    });
  }

  function onCommit() {
    const list = allSources();
    startTransition(async () => {
      const r = await commitImport(list, updatePublished);
      setResult(r);
      setReport(null);
      toast.success(t("clinact.importer.done", { n: r.imported.length }));
    });
  }

  const willImport = report?.rows.filter((r) => r.action !== "error" && r.action !== "skip_published").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">{t("clinact.importer.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("clinact.importer.subtitle", { version: FORMAT_VERSION })}</p>
      </div>

      {/* Guide + templates: reachable from the screen itself (§3.3) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-1 p-3 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <a href="/admin/clinact/modelos/guia?ver=1" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline">{t("clinact.importer.guide")}</a>
        <span className="text-muted-foreground">·</span>
        <a href="/admin/clinact/modelos/temas?ver=1" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline">{t("clinact.importer.topics")}</a>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{t("clinact.importer.templates")}:</span>
        {FORMATS.map((f) => (
          <span key={f} className="inline-flex items-center gap-1">
            <a href={`/admin/clinact/modelos/${f}?modelo=1`} className="min-h-9 rounded-md border border-border px-2 leading-9 hover:bg-accent">{FORMAT_LABELS[f]}</a>
            <a href={`/admin/clinact/modelos/${f}?ver=1`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground" title={t("clinact.importer.fullExample")}>({t("clinact.importer.example")})</a>
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Files */}
        <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="text-sm font-semibold">{t("clinact.importer.files")}</h2>
          <input ref={fileRef} type="file" accept=".md,.txt,text/plain,text/markdown" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} className={`${btnGhost} w-full border-dashed`}>
            <Upload className="h-4 w-4" /> {t("clinact.importer.pickFiles")}
          </button>
          {sources.length ? (
            <ul className="space-y-1 text-sm">
              {sources.map((s, i) => (
                <li key={i} className="flex items-center justify-between rounded-md bg-background px-2 py-1.5">
                  <span className="truncate">{s.name}</span>
                  <button onClick={() => { setSources((x) => x.filter((_, j) => j !== i)); setReport(null); }} className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label={t("common.delete")}><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("clinact.importer.orPaste")}</label>
            <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setReport(null); }} rows={8} placeholder={"=== CASO ===\nFORMATO: decisao_30s\nTÍTULO: …"} className="w-full rounded-md border border-border bg-background p-2.5 font-mono text-xs leading-relaxed" />
          </div>
        </div>

        {/* Media */}
        <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="text-sm font-semibold">{t("clinact.importer.media")}</h2>
          <p className="text-xs text-muted-foreground">{t("clinact.importer.mediaHint")}</p>
          <input ref={mediaRef} type="file" accept="image/*,audio/*,video/*" multiple className="sr-only" onChange={(e) => onMedia(e.target.files)} />
          <button onClick={() => mediaRef.current?.click()} disabled={mediaBusy} className={`${btnGhost} w-full border-dashed`}>
            {mediaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("clinact.importer.pickMedia")}
          </button>
          {mediaLog.length ? (
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">
              {mediaLog.map((m, i) => (
                <li key={i} className={cn("flex items-center gap-1.5", m.ok ? "text-muted-foreground" : "text-destructive")}>
                  {m.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <CircleAlert className="h-3.5 w-3.5" />} {m.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={updatePublished} onChange={(e) => { setUpdatePublished(e.target.checked); setReport(null); }} className="h-4 w-4" />
          {t("clinact.importer.updatePublished")}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("clinact.importer.detected", { n: localCount })}</span>
          <button onClick={onAnalyze} disabled={pending || localCount === 0} className={btnPrimary}>
            {pending && !report ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("clinact.importer.analyze")}
          </button>
        </div>
      </div>

      {report ? (
        <div className="space-y-3">
          <ReportTable rows={report.rows} />
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{t("clinact.importer.confirmHint", { n: willImport })}</p>
            <button onClick={onCommit} disabled={pending || willImport === 0} className={btnPrimary}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t("clinact.importer.confirm", { n: willImport })}
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="text-sm font-semibold">{t("clinact.importer.resultTitle")}</h2>
          <ul className="space-y-1 text-sm">
            {result.imported.map((r) => (
              <li key={r.slug} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <Link href={`/admin/clinact/${r.id}`} className="text-brand hover:underline">{r.slug}</Link>
                <span className="text-xs text-muted-foreground">{t(`clinact.importer.action.${r.action}`)}</span>
              </li>
            ))}
            {result.skipped.map((r) => (
              <li key={r.slug} className="flex items-center gap-2 text-muted-foreground"><TriangleAlert className="h-4 w-4" /> {r.slug} — {t("clinact.importer.action.skip_published")}</li>
            ))}
            {result.failed.map((r) => (
              <li key={r.slug || r.title} className="text-destructive">
                <span className="flex items-center gap-2"><CircleAlert className="h-4 w-4" /> {r.title}</span>
                <ul className="ml-6 list-disc text-xs">{r.errors.map((e, i) => <li key={i}>{e.line ? `L${e.line}: ` : ""}{e.message}</li>)}</ul>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {result.imported.some((r) => r.action === "update_published") ? t("clinact.importer.mixedNote") : t("clinact.importer.draftsNote")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReportTable({ rows }: { rows: ImportRow[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
      <table className="w-full text-sm">
        <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t("clinact.importer.col.case")}</th>
            <th className="hidden px-3 py-2 sm:table-cell">{t("clinact.importer.col.format")}</th>
            <th className="hidden px-3 py-2 md:table-cell">{t("clinact.importer.col.specialty")}</th>
            <th className="hidden px-3 py-2 sm:table-cell">{t("clinact.importer.col.blocks")}</th>
            <th className="px-3 py-2">{t("clinact.importer.col.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const status = r.errors.length ? "erro" : r.warnings.length ? "avisos" : "ok";
            const expanded = open[r.index] ?? r.errors.length > 0;
            return (
              <FragmentRow key={r.index} r={r} status={status} expanded={expanded} onToggle={() => setOpen((o) => ({ ...o, [r.index]: !expanded }))} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ r, status, expanded, onToggle }: { r: ImportRow; status: "ok" | "avisos" | "erro"; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const pill =
    status === "erro" ? "bg-destructive/15 text-destructive" : status === "avisos" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return (
    <>
      <tr className="cursor-pointer hover:bg-accent/40" onClick={onToggle}>
        <td className="px-3 py-2.5">
          <p className="font-medium">{r.title}</p>
          <p className="text-xs text-muted-foreground">{r.file} · L{r.errors[0]?.line ?? "—"} · {t(`clinact.importer.action.${r.action}`)}</p>
        </td>
        <td className="hidden px-3 py-2.5 sm:table-cell">{r.format ? FORMAT_LABELS[r.format] : "—"}</td>
        <td className="hidden px-3 py-2.5 md:table-cell">{r.specialty ?? "—"}</td>
        <td className="hidden px-3 py-2.5 sm:table-cell">{r.blockCount}</td>
        <td className="px-3 py-2.5">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", pill)}>
            {status === "ok" ? "OK" : status === "avisos" ? `${r.warnings.length} ${t("clinact.importer.warnings")}` : `${r.errors.length} ${t("clinact.importer.errors")}`}
          </span>
        </td>
      </tr>
      {expanded && (r.errors.length || r.warnings.length) ? (
        <tr>
          <td colSpan={5} className="bg-background px-3 py-2">
            <ul className="space-y-1 text-xs">
              {r.errors.map((e, i) => (
                <li key={`e${i}`} className="flex gap-1.5 text-destructive"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e.line ? <span className="font-mono">L{e.line}</span> : null} {e.message}</li>
              ))}
              {r.warnings.map((w, i) => (
                <li key={`w${i}`} className="flex gap-1.5 text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w.line ? <span className="font-mono">L{w.line}</span> : null} {w.message}</li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}
