"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { MediaListField } from "./media-field";
import {
  saveCaseDraft,
  validateCaseDoc,
  publishCase,
  unpublishCase,
  archiveCase,
  deleteDraft,
  duplicateCase,
  createPreviewLink,
} from "@/actions/clinact";
import { KIND_FIELDS } from "@/lib/clinact/schemas";
import { AUTHORABLE_KINDS, FORMAT_PRESETS, isDecision, newStep, seedSteps } from "@/lib/clinact/format-presets";
import { validateForPublish } from "@/lib/clinact/validate";
import { serializeCase } from "@/lib/clinact/serialize";
import { slugifyTitle } from "@/lib/clinact/slug";
import {
  DIFFICULTIES,
  FORMATS,
  FORMAT_LABELS,
  FORMAT_SKILL,
  QUALITIES,
  REVEAL_CATEGORIES,
  type CaseDoc,
  type CaseFormat,
  type ClueDoc,
  type Media,
  type OptionDoc,
  type StepDoc,
  type StepKind,
} from "@/lib/clinact/types";

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm min-h-11 focus:outline-none focus:ring-2 focus:ring-brand/40";
const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-brand text-brand-fg hover:opacity-90`;
const btnGhost = `${btn} border border-border hover:bg-accent`;
const iconBtn = "inline-flex h-11 w-11 shrink-0 sm:h-9 sm:w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30";

type Taxonomy = { specialties: { id: number; name: string }[]; topics: { id: number; name: string; specialty_id: number | null }[] };

export function CaseEditor({ initial, taxonomy, isNew }: { initial: CaseDoc; taxonomy: Taxonomy; isNew: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [doc, setDoc] = useState<CaseDoc>(initial);
  const [dirty, setDirty] = useState(isNew);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"ficha" | "blocos" | "verificar">("blocos");
  const [confirm, setConfirm] = useState<null | "unpublish" | "archive" | "delete">(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [showText, setShowText] = useState(false);

  const status = doc.status ?? "draft";
  const set = (patch: Partial<CaseDoc>) => {
    setDoc((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const checks = useMemo(() => validateForPublish(normalizeForSave(doc), () => null), [doc]);
  const blocking = checks.filter((c) => !c.ok && c.blocking);
  const warnings = checks.filter((c) => !c.ok && !c.blocking);

  // ── ficha handlers ─────────────────────────────────────────────────────────
  function onTitle(v: string) {
    set({ title: v, slug: isNew || status === "draft" ? slugifyTitle(v) : doc.slug });
  }
  function onFormat(f: CaseFormat) {
    const hasContent = doc.steps.some((s) => Object.values(s.content).some((v) => (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.length : false)));
    set({ format: f, primary_skill: FORMAT_SKILL[f], steps: hasContent ? doc.steps : seedSteps(f) });
  }
  const topicsForSpecialty = taxonomy.topics.filter((tp) => !doc.specialty_id || tp.specialty_id === doc.specialty_id);

  // ── step handlers ──────────────────────────────────────────────────────────
  const setSteps = (steps: StepDoc[]) => set({ steps: steps.map((s, i) => ({ ...s, position: i })) });
  const updateStep = (i: number, patch: Partial<StepDoc>) => setSteps(doc.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= doc.steps.length) return;
    const next = [...doc.steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };
  const removeStep = (i: number) => setSteps(doc.steps.filter((_, j) => j !== i));
  const addStep = (kind: StepKind) => setSteps([...doc.steps, newStep(kind, doc.steps.length, doc.format)]);

  // ── actions ────────────────────────────────────────────────────────────────
  async function doSave(): Promise<number | null> {
    const payload = normalizeForSave(doc);
    const r = await saveCaseDraft(payload);
    if (!r.ok) {
      toast.error(r.error === "slug_taken" ? t("clinact.editor.slugTaken") : `${t("clinact.editor.saveError")} ${r.detail ?? ""}`);
      return null;
    }
    setDirty(false);
    if (isNew || doc.id !== r.id) {
      router.replace(`/admin/clinact/${r.id}`);
    }
    setDoc((d) => ({ ...d, id: r.id, slug: r.slug }));
    return r.id;
  }

  function onSave() {
    startTransition(async () => {
      const id = await doSave();
      if (id) toast.success(t("clinact.editor.saved"));
    });
  }

  function onPreview() {
    startTransition(async () => {
      const id = dirty || !doc.id ? await doSave() : doc.id;
      if (!id) return;
      const { url } = await createPreviewLink(id);
      window.open(url, "_blank", "noopener");
    });
  }

  function onPublish() {
    startTransition(async () => {
      // Validate what is on screen BEFORE it lands: on a published case the
      // save itself is the republish (revision += 1, snapshot), so a blocked
      // document must never reach the DB.
      const v = await validateCaseDoc(normalizeForSave(doc));
      if (v.blockers.length) {
        setBlockers(v.blockers);
        setTab("verificar");
        return;
      }
      setBlockers(null);
      if (status === "published") {
        const id = await doSave();
        if (!id) return;
        toast.success(t("clinact.editor.republished"));
        router.refresh();
        return;
      }
      const id = dirty || !doc.id ? await doSave() : doc.id;
      if (!id) return;
      const r = await publishCase(id);
      if (!r.ok) {
        setBlockers(r.blockers ?? [t("clinact.editor.notFound")]);
        setTab("verificar");
        return;
      }
      setDoc((d) => ({ ...d, status: "published", revision: r.revision }));
      toast.success(t("clinact.editor.published", { revision: r.revision }));
      router.refresh();
    });
  }

  function onUnpublish() {
    setConfirm(null);
    if (!doc.id) return;
    startTransition(async () => {
      await unpublishCase(doc.id!);
      setDoc((d) => ({ ...d, status: "draft" }));
      toast.success(t("clinact.editor.unpublished"));
      router.refresh();
    });
  }

  function onArchive() {
    setConfirm(null);
    if (!doc.id) return;
    startTransition(async () => {
      await archiveCase(doc.id!);
      toast.success(t("clinact.editor.archived"));
      router.push("/admin/clinact");
    });
  }

  function onDelete() {
    setConfirm(null);
    if (!doc.id) return;
    startTransition(async () => {
      const r = await deleteDraft(doc.id!);
      if (!r.ok) {
        toast.error(t("clinact.editor.deleteRefused"));
        return;
      }
      router.push("/admin/clinact");
    });
  }

  function onDuplicate() {
    if (!doc.id) return;
    startTransition(async () => {
      const r = await duplicateCase(doc.id!);
      if (r.ok) router.push(`/admin/clinact/${r.id}`);
    });
  }

  const statusLabel = t(`clinact.status.${status}`);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{doc.title || t("clinact.editor.untitled")}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status === "published" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : status === "archived" ? "bg-muted" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
              {statusLabel}
            </span>
            <span>{FORMAT_LABELS[doc.format]}</span>
            {doc.revision ? <span>· rev. {doc.revision}</span> : null}
            {dirty ? <span className="text-amber-600 dark:text-amber-300">· {t("clinact.editor.unsaved")}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={onSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("clinact.editor.save")}
          </button>
          <button className={btnGhost} onClick={onPreview} disabled={pending}>
            <Eye className="h-4 w-4" /> {t("clinact.editor.preview")}
          </button>
          {status === "published" ? (
            <>
              <button className={btnPrimary} onClick={onPublish} disabled={pending || !dirty} title={t("clinact.editor.republishHint")}>
                <Upload className="h-4 w-4" /> {t("clinact.editor.republish")}
              </button>
              <button className={btnGhost} onClick={() => setConfirm("unpublish")} disabled={pending}>
                <EyeOff className="h-4 w-4" /> {t("clinact.editor.unpublish")}
              </button>
            </>
          ) : (
            <button className={btnPrimary} onClick={onPublish} disabled={pending || status === "archived"}>
              <Upload className="h-4 w-4" /> {t("clinact.editor.publish")}
            </button>
          )}
          {doc.id ? (
            <>
              <button className={btnGhost} onClick={onDuplicate} disabled={pending}>
                <Copy className="h-4 w-4" /> {t("clinact.editor.duplicate")}
              </button>
              <a className={btnGhost} href={`/admin/clinact/${doc.id}/exportar`}>
                <Download className="h-4 w-4" /> {t("clinact.editor.export")}
              </a>
              {status === "draft" && !doc.revision ? (
                <button className={`${btnGhost} text-destructive`} onClick={() => setConfirm("delete")} disabled={pending}>
                  <Trash2 className="h-4 w-4" /> {t("clinact.editor.delete")}
                </button>
              ) : status !== "archived" ? (
                <button className={btnGhost} onClick={() => setConfirm("archive")} disabled={pending}>
                  {t("clinact.editor.archive")}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface-1 p-1 lg:hidden">
        {(["ficha", "blocos", "verificar"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("min-h-11 flex-1 rounded-md text-sm font-medium", tab === k ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {t(`clinact.editor.tab.${k}`)}
            {k === "verificar" && blocking.length ? <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-xs text-destructive">{blocking.length}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* ── Ficha ── */}
        <section className={cn("space-y-3 rounded-xl border border-border bg-surface-1 p-4 lg:block", tab !== "ficha" && "hidden")}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("clinact.editor.ficha")}</h2>
          <Field label={t("clinact.fields.format")}>
            <select value={doc.format} onChange={(e) => onFormat(e.target.value as CaseFormat)} className={inputCls}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
              ))}
            </select>
          </Field>
          <Field label={t("clinact.fields.title")}>
            <input value={doc.title} onChange={(e) => onTitle(e.target.value)} className={inputCls} />
            <p className="mt-1 truncate text-xs text-muted-foreground">/clinact/caso/{doc.slug || "…"}</p>
          </Field>
          <Field label={t("clinact.fields.specialty")}>
            <select value={doc.specialty_id ?? ""} onChange={(e) => set({ specialty_id: e.target.value ? Number(e.target.value) : null, specialty_text: taxonomy.specialties.find((s) => s.id === Number(e.target.value))?.name ?? null, topic_id: null, topic_text: null })} className={inputCls}>
              <option value="">—</option>
              {taxonomy.specialties.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {doc.specialty_text && !doc.specialty_id ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">{t("clinact.editor.unmatched", { value: doc.specialty_text })}</p> : null}
          </Field>
          <Field label={t("clinact.fields.topic")}>
            <select value={doc.topic_id ?? ""} onChange={(e) => set({ topic_id: e.target.value ? Number(e.target.value) : null, topic_text: taxonomy.topics.find((s) => s.id === Number(e.target.value))?.name ?? doc.topic_text })} className={inputCls}>
              <option value="">—</option>
              {topicsForSpecialty.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.name}</option>
              ))}
            </select>
            {doc.topic_text && !doc.topic_id ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">{t("clinact.editor.unmatched", { value: doc.topic_text })}</p> : null}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("clinact.fields.difficulty")}>
              <select value={doc.difficulty} onChange={(e) => set({ difficulty: e.target.value as CaseDoc["difficulty"] })} className={inputCls}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{t(`clinact.difficulty.${d}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("clinact.fields.minutes")}>
              <input type="number" min={1} value={doc.est_minutes ?? ""} onChange={(e) => set({ est_minutes: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
            </Field>
          </div>
          <Field label={t("clinact.fields.summary")}>
            <textarea value={doc.summary ?? ""} onChange={(e) => set({ summary: e.target.value })} rows={2} className={inputCls} />
          </Field>
          {doc.format === "codigo_clinico" ? (
            <Field label={t("clinact.fields.finalKey")} hint={t("clinact.fields.finalKeyHint")}>
              <input value={doc.final_key ?? ""} onChange={(e) => set({ final_key: e.target.value })} className={inputCls} />
            </Field>
          ) : null}
          <Field label={t("clinact.fields.notes")} hint={t("clinact.fields.notesHint")}>
            <textarea value={doc.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} rows={3} className={inputCls} />
          </Field>
        </section>

        {/* ── Steps ── */}
        <section className={cn("space-y-3 lg:block", tab !== "blocos" && "hidden")}>
          {doc.steps.map((s, i) => (
            <StepCard
              key={i}
              step={s}
              index={i}
              total={doc.steps.length}
              format={doc.format}
              clues={doc.clues}
              onClues={(clues) => set({ clues: clues.map((c, k) => ({ ...c, position: k })) })}
              onChange={(patch) => updateStep(i, patch)}
              onMove={(d) => moveStep(i, d)}
              onRemove={() => removeStep(i)}
              sceneKeys={doc.steps.filter((x) => x.kind === "cena_conduta" && x.scene_key).map((x) => x.scene_key!)}
            />
          ))}
          <AddStep onAdd={addStep} format={doc.format} />
        </section>

        {/* ── Checklist + text ── */}
        <section className={cn("space-y-3 lg:block", tab !== "verificar" && "hidden")}>
          <div className="rounded-xl border border-border bg-surface-1 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("clinact.editor.checklist")}</h2>
            {blockers ? (
              <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">{t("clinact.editor.publishBlocked")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="mt-2 space-y-1.5 text-sm">
              {blocking.map((c, i) => (
                <li key={`b${i}`} className="flex gap-2 text-destructive"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{c.message}</li>
              ))}
              {warnings.map((c, i) => (
                <li key={`w${i}`} className="flex gap-2 text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{c.message}</li>
              ))}
              {checks.filter((c) => c.ok).map((c, i) => (
                <li key={`o${i}`} className="flex gap-2 text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{c.message}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{t("clinact.editor.checklistHint")}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-1 p-4">
            <button onClick={() => setShowText((v) => !v)} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("clinact.editor.textPreview")} {showText ? "▾" : "▸"}
            </button>
            {showText ? (
              <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed">{serializeCase(normalizeForSave(doc))}</pre>
            ) : null}
          </div>
        </section>
      </div>

      <ConfirmModal
        open={confirm === "unpublish"}
        title={t("clinact.editor.unpublish")}
        description={t("clinact.editor.unpublishConfirm")}
        onConfirm={onUnpublish}
        onCancel={() => setConfirm(null)}
        isPending={pending}
      />
      <ConfirmModal
        open={confirm === "archive"}
        title={t("clinact.editor.archive")}
        description={t("clinact.editor.archiveConfirm")}
        onConfirm={onArchive}
        onCancel={() => setConfirm(null)}
        isPending={pending}
      />
      <ConfirmModal
        open={confirm === "delete"}
        title={t("clinact.editor.delete")}
        description={t("clinact.editor.deleteConfirm")}
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirm(null)}
        isPending={pending}
      />
    </div>
  );
}

/** Derived fields + positions, so what is validated is what is saved. */
function normalizeForSave(doc: CaseDoc): CaseDoc {
  const leve = doc.steps.find((s) => s.kind === "leve_deste_caso");
  return {
    ...doc,
    slug: doc.slug || slugifyTitle(doc.title),
    primary_skill: FORMAT_SKILL[doc.format],
    takeaway: leve ? String((leve.content as { text?: string }).text ?? "") || null : doc.takeaway ?? null,
    steps: doc.steps.map((s, i) => ({
      ...s,
      position: i,
      skill: isDecision(s.kind) ? FORMAT_SKILL[doc.format] : null,
      options: s.options.map((o, j) => ({ ...o, position: j })),
    })),
    clues: doc.clues.map((c, i) => ({ ...c, position: i })),
  };
}

function Field({ label, hint, children, group = false }: { label: string; hint?: string; children: React.ReactNode; group?: boolean }) {
  // `group` renders a div instead of a <label>: composite fields (media rows,
  // item lists) hold several controls and a wrapping label would give the
  // first <select> the whole row's text as its accessible name.
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </Tag>
  );
}

function AddStep({ onAdd, format }: { onAdd: (k: StepKind) => void; format: CaseFormat }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const preset = FORMAT_PRESETS[format];
  const inFormat = new Set([...preset.default, ...preset.optional]);
  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className={`${btnGhost} w-full`}>
          <Plus className="h-4 w-4" /> {t("clinact.editor.addBlock")}
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {AUTHORABLE_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => { onAdd(k); setOpen(false); }}
              className={cn("min-h-11 rounded-md border px-3 text-sm", inFormat.has(k) ? "border-border hover:bg-accent" : "border-dashed border-border text-muted-foreground hover:bg-accent")}
              title={inFormat.has(k) ? undefined : t("clinact.editor.notInFormat")}
            >
              {t(`clinact.kind.${k}`)}
            </button>
          ))}
          <button onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-muted-foreground">{t("common.cancel")}</button>
        </div>
      )}
    </div>
  );
}

function StepCard(props: {
  step: StepDoc;
  index: number;
  total: number;
  format: CaseFormat;
  clues: ClueDoc[];
  sceneKeys: string[];
  onClues: (c: ClueDoc[]) => void;
  onChange: (p: Partial<StepDoc>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { step, index, total, onChange } = props;
  const fields = KIND_FIELDS[step.kind];
  const content = step.content as Record<string, unknown>;
  const setContent = (k: string, v: unknown) => onChange({ content: { ...content, [k]: v } });
  const decision = step.kind === "pergunta" || step.kind === "reavaliacao" || step.kind === "cena_conduta";

  return (
    <div className={cn("rounded-xl border border-border bg-surface-1", !step.enabled && "opacity-60")}>
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <span className="flex-1 truncate text-sm font-semibold">
          {index + 1}. {t(`clinact.kind.${step.kind}`)}
          {step.kind === "cena_conduta" && step.scene_key ? <span className="ml-1 font-normal text-muted-foreground">· {step.scene_key}</span> : null}
        </span>
        <label className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={step.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} className="h-4 w-4" />
          {t("clinact.editor.enabled")}
        </label>
        <button className={iconBtn} onClick={() => props.onMove(-1)} disabled={index === 0} aria-label={t("quizEditor.moveUp")}><ArrowUp className="h-4 w-4" /></button>
        <button className={iconBtn} onClick={() => props.onMove(1)} disabled={index === total - 1} aria-label={t("quizEditor.moveDown")}><ArrowDown className="h-4 w-4" /></button>
        <button className={`${iconBtn} hover:text-destructive`} onClick={props.onRemove} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 p-3">
        {step.kind === "cena_conduta" ? (
          <Field label={t("clinact.fields.sceneKey")} hint={t("clinact.fields.sceneKeyHint")}>
            <input value={step.scene_key ?? ""} onChange={(e) => onChange({ scene_key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} className={inputCls} />
          </Field>
        ) : null}
        {step.kind === "confianca" ? <p className="text-sm text-muted-foreground">{t("clinact.editor.confidenceHint")}</p> : null}
        {step.kind === "cronometro" ? <p className="text-sm text-muted-foreground">{t("clinact.editor.timerHint")}</p> : null}
        {fields.map((f) => (
          <Field key={f.key} label={t(`clinact.fields.${f.labelKey}`)} group={f.kind === "media" || f.kind === "items"}>
            {f.kind === "textarea" ? (
              <textarea value={String(content[f.key] ?? "")} onChange={(e) => setContent(f.key, e.target.value)} rows={4} className={inputCls} />
            ) : f.kind === "text" ? (
              <input value={String(content[f.key] ?? "")} onChange={(e) => setContent(f.key, e.target.value)} className={inputCls} />
            ) : f.kind === "number" ? (
              <input type="number" value={Number(content[f.key] ?? 0)} onChange={(e) => setContent(f.key, Number(e.target.value))} className={inputCls} />
            ) : f.kind === "items" ? (
              <ItemsField value={Array.isArray(content[f.key]) ? (content[f.key] as string[]) : []} onChange={(v) => setContent(f.key, v)} />
            ) : (
              <MediaListField value={Array.isArray(content[f.key]) ? (content[f.key] as Media[]) : []} onChange={(v) => setContent(f.key, v)} />
            )}
          </Field>
        ))}
        {step.kind === "pistas" ? <CluesEditor clues={props.clues} onChange={props.onClues} /> : null}
        {decision ? (
          <OptionsEditor
            options={step.options}
            scene={step.kind === "cena_conduta"}
            sceneKeys={props.sceneKeys.filter((k) => k !== step.scene_key)}
            onChange={(options) => onChange({ options: options.map((o, i) => ({ ...o, position: i })) })}
          />
        ) : null}
      </div>
    </div>
  );
}

function ItemsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      {value.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
          <input value={it} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} />
          <button className={iconBtn} disabled={i === 0} onClick={() => { const n = [...value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}><ArrowUp className="h-4 w-4" /></button>
          <button className={iconBtn} disabled={i === value.length - 1} onClick={() => { const n = [...value]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; onChange(n); }}><ArrowDown className="h-4 w-4" /></button>
          <button className={`${iconBtn} hover:text-destructive`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...value, ""])} className="inline-flex min-h-11 sm:min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /> {t("clinact.editor.addItem")}</button>
      <p className="text-xs text-muted-foreground">{t("clinact.editor.orderHint")}</p>
    </div>
  );
}

function OptionsEditor({ options, scene, sceneKeys, onChange }: { options: OptionDoc[]; scene: boolean; sceneKeys: string[]; onChange: (o: OptionDoc[]) => void }) {
  const { t } = useTranslation();
  const upd = (i: number, p: Partial<OptionDoc>) => onChange(options.map((o, j) => (j === i ? { ...o, ...p } : o)));
  const setCorrect = (i: number) => onChange(options.map((o, j) => ({ ...o, is_correct: j === i })));
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-muted-foreground">{scene ? t("clinact.fields.conducts") : t("clinact.fields.options")}</span>
      {options.map((o, i) => (
        <div key={i} className={cn("space-y-2 rounded-lg border p-3", o.is_correct ? "border-emerald-500/50 bg-emerald-500/5" : "border-border")}>
          <div className="flex items-start gap-2">
            <label className="mt-2.5 flex items-center gap-1 text-xs" title={t("clinact.fields.correct")}>
              <input type="radio" name={`correct-${i}`} checked={o.is_correct} onChange={() => setCorrect(i)} className="h-4 w-4" />
            </label>
            <textarea value={o.label} onChange={(e) => upd(i, { label: e.target.value })} rows={2} placeholder={t("clinact.fields.optionLabel")} className={inputCls} />
            <button className={`${iconBtn} mt-1 hover:text-destructive`} onClick={() => onChange(options.filter((_, j) => j !== i))} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></button>
          </div>
          {scene ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <select value={o.quality ?? ""} onChange={(e) => upd(i, { quality: (e.target.value || null) as OptionDoc["quality"] })} className={inputCls}>
                <option value="">{t("clinact.fields.quality")}: —</option>
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>{t(`clinact.quality.${q}`)}</option>
                ))}
              </select>
              <input type="number" value={o.effect?.relogio ?? ""} onChange={(e) => upd(i, { effect: { ...o.effect, relogio: e.target.value ? Number(e.target.value) : undefined } })} placeholder={t("clinact.fields.clock")} className={inputCls} />
              <select value={o.next_scene_key ?? ""} onChange={(e) => upd(i, { next_scene_key: e.target.value || null })} className={inputCls}>
                <option value="">{t("clinact.fields.nextSceneDefault")}</option>
                {sceneKeys.map((k) => (
                  <option key={k} value={k}>{t("clinact.fields.goesTo")} {k}</option>
                ))}
              </select>
            </div>
          ) : null}
          <textarea value={o.feedback ?? ""} onChange={(e) => upd(i, { feedback: e.target.value })} rows={2} placeholder={t("clinact.fields.feedback")} className={inputCls} />
          {!o.is_correct ? (
            <textarea value={o.seduction ?? ""} onChange={(e) => upd(i, { seduction: e.target.value })} rows={2} placeholder={t("clinact.fields.seduction")} className={inputCls} />
          ) : null}
          <RevealsEditor option={o} onChange={(p) => upd(i, p)} />
        </div>
      ))}
      {options.length < 5 ? (
        <button onClick={() => onChange([...options, { position: options.length, label: "", is_correct: options.length === 0, effect: {} }])} className="inline-flex min-h-11 sm:min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Plus className="h-4 w-4" /> {t("clinact.editor.addOption")}
        </button>
      ) : null}
    </div>
  );
}

function RevealsEditor({ option, onChange }: { option: OptionDoc; onChange: (p: Partial<OptionDoc>) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState((option.effect?.revela?.length ?? 0) > 0);
  const reveals = option.effect?.revela ?? [];
  const setReveals = (r: typeof reveals) => onChange({ effect: { ...option.effect, revela: r.length ? r : undefined } });
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground sm:min-h-9">
        + {t("clinact.fields.reveals")}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2">
      <span className="block text-xs font-medium text-muted-foreground">{t("clinact.fields.reveals")}</span>
      {reveals.map((r, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex gap-1.5">
            <select value={r.cat} onChange={(e) => setReveals(reveals.map((x, j) => (j === i ? { ...x, cat: e.target.value as typeof r.cat } : x)))} className={`${inputCls} w-36`}>
              {REVEAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input value={r.texto} onChange={(e) => setReveals(reveals.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} className={inputCls} />
            <button className={`${iconBtn} hover:text-destructive`} onClick={() => setReveals(reveals.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
          <MediaListField single value={r.midia ? [r.midia] : []} onChange={(m) => setReveals(reveals.map((x, j) => (j === i ? { ...x, midia: m[0] } : x)))} />
        </div>
      ))}
      <button onClick={() => setReveals([...reveals, { cat: "encontramos", texto: "" }])} className="inline-flex min-h-11 sm:min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /> {t("clinact.editor.addReveal")}</button>
    </div>
  );
}

function CluesEditor({ clues, onChange }: { clues: ClueDoc[]; onChange: (c: ClueDoc[]) => void }) {
  const { t } = useTranslation();
  const upd = (i: number, p: Partial<ClueDoc>) => onChange(clues.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-muted-foreground">{t("clinact.fields.clues")}</span>
      {clues.map((c, i) => (
        <div key={i} className={cn("space-y-2 rounded-lg border p-3", c.is_red_herring ? "border-dashed border-border opacity-80" : "border-border")}>
          <div className="flex items-start gap-2">
            <input value={c.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder={t("clinact.fields.clueLabel")} className={inputCls} />
            <button className={`${iconBtn} mt-1 hover:text-destructive`} onClick={() => onChange(clues.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
          <input value={c.detail ?? ""} onChange={(e) => upd(i, { detail: e.target.value })} placeholder={t("clinact.fields.clueDetail")} className={inputCls} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={c.category ?? ""} onChange={(e) => upd(i, { category: e.target.value })} placeholder={t("clinact.fields.clueCategory")} className={inputCls} />
            <input value={c.cluster ?? ""} onChange={(e) => upd(i, { cluster: e.target.value })} placeholder={t("clinact.fields.clueCluster")} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.is_red_herring} onChange={(e) => upd(i, { is_red_herring: e.target.checked })} className="h-4 w-4" />
            {t("clinact.fields.redHerring")}
          </label>
          {c.is_red_herring ? <input value={c.red_herring_reason ?? ""} onChange={(e) => upd(i, { red_herring_reason: e.target.value })} placeholder={t("clinact.fields.redHerringReason")} className={inputCls} /> : null}
          <MediaListField single value={c.media ? [c.media] : []} onChange={(m) => upd(i, { media: m[0] ?? null })} />
        </div>
      ))}
      <button onClick={() => onChange([...clues, { position: clues.length, label: "", is_red_herring: false }])} className="inline-flex min-h-11 sm:min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /> {t("clinact.editor.addClue")}</button>
    </div>
  );
}
