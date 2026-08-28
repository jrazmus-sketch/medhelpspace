"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Upload, Loader2, Trash2, Plus } from "lucide-react";
import { uploadClinactMedia } from "@/actions/clinact";
import { mediaKey, mediaTypeFor, mediaUrlFor } from "@/lib/clinact/media";
import type { Media } from "@/lib/clinact/types";

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm min-h-11 focus:outline-none focus:ring-2 focus:ring-brand/40";

/**
 * Edits a list of Media objects. The filename is the identity (see
 * lib/clinact/media.ts): typing a name derives the CDN URL; uploading a file
 * stores it under that same deterministic key.
 */
export function MediaListField({
  value,
  onChange,
  single = false,
}: {
  value: Media[];
  onChange: (next: Media[]) => void;
  single?: boolean;
}) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<Media>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => onChange([...value, { type: "image", url: "", file: "" }]);

  return (
    <div className="space-y-2">
      {value.map((m, i) => (
        <MediaRow key={i} media={m} onChange={(p) => update(i, p)} onRemove={() => remove(i)} />
      ))}
      {!single || value.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> {t("clinact.media.add")}
        </button>
      ) : null}
    </div>
  );
}

export function MediaRow({ media, onChange, onRemove }: { media: Media; onChange: (p: Partial<Media>) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await uploadClinactMedia(fd);
      if ("error" in r) {
        setErr(t(`clinact.media.err.${r.error}`, { defaultValue: t("clinact.media.err.upload_failed") }));
        return;
      }
      onChange({ url: r.url, file: r.key, type: mediaTypeFor(r.key) });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onFilename(name: string) {
    const trimmed = name.trim();
    onChange({ file: trimmed, url: trimmed ? mediaUrlFor(trimmed) : "", type: trimmed ? mediaTypeFor(trimmed) : media.type });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-1 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={media.type} onChange={(e) => onChange({ type: e.target.value })} className={`${inputCls} sm:w-32`}>
          <option value="image">{t("clinact.media.image")}</option>
          <option value="audio">{t("clinact.media.audio")}</option>
          <option value="video">{t("clinact.media.video")}</option>
        </select>
        <input
          value={media.file ?? ""}
          onChange={(e) => onFilename(e.target.value)}
          placeholder={t("clinact.media.filename")}
          className={inputCls}
        />
        <div className="flex gap-2">
          <input ref={inputRef} type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("clinact.media.upload")}
          </button>
          <button type="button" onClick={onRemove} aria-label={t("common.delete")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {media.file ? (
        <p className="truncate text-xs text-muted-foreground">
          {t("clinact.media.storedAs")} <code>{mediaKey(media.file)}</code>
        </p>
      ) : null}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <input value={media.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} placeholder={t("clinact.media.caption")} className={inputCls} />
      {media.type === "audio" ? (
        <textarea value={media.transcript ?? ""} onChange={(e) => onChange({ transcript: e.target.value })} placeholder={t("clinact.media.transcript")} rows={2} className={inputCls} />
      ) : (
        <input value={media.alt ?? ""} onChange={(e) => onChange({ alt: e.target.value })} placeholder={t("clinact.media.alt")} className={inputCls} />
      )}
    </div>
  );
}
