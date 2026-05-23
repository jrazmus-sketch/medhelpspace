"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { createMember } from "@/actions/admin";

type Cohort = { id: number; name: string };

const ROLES = ["member", "support_admin", "content_admin", "billing_admin", "super_admin"] as const;

interface Props {
  open: boolean;
  cohorts: Cohort[];
  onClose: () => void;
  onCreated: () => void;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

export function CreateMemberModal({ open, cohorts, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("member");
  const [cohortId, setCohortId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("member");
    setCohortId("");
    setError(null);
  }

  function handleClose() {
    if (isPending) return;
    reset();
    onClose();
  }

  function handleSubmit() {
    setError(null);
    if (!email.trim().includes("@")) {
      setError(t("members.createInvalidEmail"));
      return;
    }
    if (password.length < 8) {
      setError(t("members.createWeakPassword"));
      return;
    }
    startTransition(async () => {
      try {
        await createMember({
          email,
          password,
          role,
          displayName,
          cohortId: cohortId === "" ? null : Number(cohortId),
        });
        reset();
        onCreated();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.generic"));
      }
    });
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-sm outline-none focus:border-brand/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl space-y-4 p-6"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-base font-semibold">{t("members.createTitle")}</h3>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("members.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("members.displayName")}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("members.createPassword")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="shrink-0 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("members.createGeneratePassword")}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("members.role")}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("members.cohort")}
            </label>
            <select
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              className={inputClass}
            >
              <option value="">— {t("common.no")} turma —</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={handleClose}
            disabled={isPending}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? t("common.loading") : t("members.createSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
