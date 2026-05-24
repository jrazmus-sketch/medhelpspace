"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Upload, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadLessonAudio } from "@/actions/admin";

type Props = {
  pageSlug: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; filename: string }
  | { status: "success"; filename: string }
  | { status: "error"; message: string };

const ERROR_KEYS: Record<string, string> = {
  no_file: "errorNoFile",
  no_page_slug: "errorNoPageSlug",
  empty_file: "errorEmpty",
  too_large: "errorTooLarge",
  bad_mime: "errorBadMime",
  bunny_not_configured: "errorNotConfigured",
  upload_failed: "errorUploadFailed",
};

export function AudioUploader({ pageSlug, onUploaded, disabled }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });

  async function handleFile(file: File) {
    setState({ status: "uploading", filename: file.name });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("pageSlug", pageSlug);

    try {
      const result = await uploadLessonAudio(fd);
      if ("error" in result) {
        const key = ERROR_KEYS[result.error] ?? "errorUploadFailed";
        setState({ status: "error", message: t(`audioUpload.${key}`) });
        return;
      }
      onUploaded(result.url);
      setState({ status: "success", filename: file.name });
      // Clear the success state after a few seconds so it doesn't linger.
      window.setTimeout(() => {
        setState((prev) => (prev.status === "success" ? { status: "idle" } : prev));
      }, 4000);
    } catch {
      setState({ status: "error", message: t("audioUpload.errorUploadFailed") });
    } finally {
      // Allow the same file to be selected again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  const busy = state.status === "uploading";

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.aac,.wav,.ogg,.webm"
        onChange={onChange}
        disabled={disabled || busy}
        className="sr-only"
        id={`audio-upload-${pageSlug}-${Math.random().toString(36).slice(2, 7)}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium transition-colors",
            "hover:border-brand/60 hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("audioUpload.uploading")}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {t("audioUpload.button")}
            </>
          )}
        </button>

        {state.status === "uploading" && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {state.filename}
          </span>
        )}
        {state.status === "success" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("audioUpload.success")}
          </span>
        )}
        {state.status === "error" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {state.message}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("audioUpload.hint")}</p>
    </div>
  );
}
