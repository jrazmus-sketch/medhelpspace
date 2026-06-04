"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { CreateMemberModal } from "@/components/admin/create-member-modal";
import {
  assignMemberToCohort,
  changeUserRole,
  sendPasswordReset,
  revokeUserSessions,
  deleteMember,
} from "@/actions/admin";

type MemberRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
  cohort_id: number | null;
};

type Cohort = { id: number; name: string };

interface Props {
  rows: MemberRow[];
  cohorts: Cohort[];
  currentUserRole: string;
  currentUserId: string;
}

const ROLES = ["member", "support_admin", "content_admin", "billing_admin", "super_admin"] as const;

const roleColor: Record<string, string> = {
  super_admin: "bg-brand/15 text-brand",
  content_admin: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  support_admin: "bg-green-500/15 text-green-700 dark:text-green-400",
  billing_admin: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  member: "bg-surface-2 text-muted-foreground",
};

type PendingModal =
  | { type: "role"; userId: string; email: string; newRole: string }
  | { type: "reset-password"; email: string }
  | { type: "revoke-sessions"; userId: string; email: string }
  | { type: "delete"; userId: string; email: string };

export function MembersClient({ rows, cohorts, currentUserRole, currentUserId }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingModal, setPendingModal] = useState<PendingModal | null>(null);
  const [actionResult, setActionResult] = useState<{ userId: string; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Track locally committed roles so the dropdown reverts on cancel
  const [committedRoles, setCommittedRoles] = useState<Map<string, string>>(
    () => new Map(rows.map((r) => [r.id, r.role])),
  );

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return r.email.toLowerCase().includes(q) || (r.display_name ?? "").toLowerCase().includes(q);
  });

  function handleCohortChange(userId: string, value: string) {
    const cohortId = value === "" ? null : Number(value);
    startTransition(() => { assignMemberToCohort(userId, cohortId); });
  }

  function handleRoleSelect(userId: string, email: string, newRole: string) {
    if (newRole === committedRoles.get(userId)) return;
    setPendingModal({ type: "role", userId, email, newRole });
  }

  function handleConfirm() {
    if (!pendingModal) return;
    if (pendingModal.type === "role") {
      const { userId, newRole } = pendingModal;
      startTransition(async () => {
        try {
          await changeUserRole(userId, newRole);
          setCommittedRoles((prev) => new Map(prev).set(userId, newRole));
          setActionResult({ userId, message: t("common.success") });
        } catch (e) {
          setActionResult({ userId, message: e instanceof Error ? e.message : t("errors.generic") });
        }
        setPendingModal(null);
      });
    } else if (pendingModal.type === "reset-password") {
      const { email } = pendingModal;
      startTransition(async () => {
        try {
          await sendPasswordReset(email);
          setActionResult({ userId: email, message: t("members.resetPasswordSent") });
        } catch (e) {
          setActionResult({ userId: email, message: e instanceof Error ? e.message : t("errors.generic") });
        }
        setPendingModal(null);
      });
    } else if (pendingModal.type === "revoke-sessions") {
      const { userId } = pendingModal;
      startTransition(async () => {
        try {
          await revokeUserSessions(userId);
          setActionResult({ userId, message: t("members.sessionRevoked") });
        } catch (e) {
          setActionResult({ userId, message: e instanceof Error ? e.message : t("errors.generic") });
        }
        setPendingModal(null);
      });
    } else if (pendingModal.type === "delete") {
      const { userId } = pendingModal;
      startTransition(async () => {
        try {
          await deleteMember(userId);
          // revalidatePath refreshes the server component with the row gone;
          // close the modal and let the table re-render without it.
          setPendingModal(null);
        } catch (e) {
          setActionResult({ userId, message: e instanceof Error ? e.message : t("errors.generic") });
          setPendingModal(null);
        }
      });
    }
  }

  function getModalContent(): {
    title: string;
    description: React.ReactNode;
    destructive: boolean;
    confirmLabel?: string;
  } {
    if (!pendingModal) return { title: "", description: "", destructive: false };
    if (pendingModal.type === "role") {
      return {
        title: t("members.changeRoleTitle"),
        description: (
          <p>{t("members.changeRoleDesc", { role: pendingModal.newRole, email: pendingModal.email })}</p>
        ),
        destructive: false,
      };
    }
    if (pendingModal.type === "reset-password") {
      return {
        title: t("members.resetPasswordTitle"),
        description: <p>{t("members.resetPasswordDesc", { email: pendingModal.email })}</p>,
        destructive: false,
      };
    }
    if (pendingModal.type === "delete") {
      return {
        title: t("members.deleteTitle"),
        description: (
          <>
            <p>{t("members.deleteDesc", { email: pendingModal.email })}</p>
            <p className="text-xs">{t("members.deleteNote")}</p>
          </>
        ),
        destructive: true,
        confirmLabel: t("members.deleteConfirm"),
      };
    }
    return {
      title: t("members.revokeSessionsTitle"),
      description: <p>{t("members.revokeSessionsDesc", { email: pendingModal.email })}</p>,
      destructive: false,
    };
  }

  const {
    title: modalTitle,
    description: modalDescription,
    destructive: modalDestructive,
    confirmLabel: modalConfirmLabel,
  } = getModalContent();
  const isSuperAdmin = currentUserRole === "super_admin";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("members.title")}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {search ? `${filtered.length} / ` : ""}{rows.length} {rows.length === 1 ? "membro" : "membros"}
          </span>
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
            >
              {t("members.create")}
            </button>
          )}
        </div>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("members.searchPlaceholder")}
        className="w-full max-w-sm rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
      />

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{t("members.displayName")}</th>
              <th className="px-4 py-3">{t("members.email")}</th>
              <th className="px-4 py-3">{t("members.role")}</th>
              <th className="px-4 py-3">{t("members.cohort")}</th>
              <th className="px-4 py-3">{t("members.joinedAt")}</th>
              <th className="px-4 py-3">{t("members.actions")}</th>
            </tr>
          </thead>
          <tbody className={isPending ? "opacity-60" : ""}>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t("members.noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">
                    {row.display_name || (
                      <span className="text-muted-foreground">{row.email.split("@")[0]}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                  <td className="px-4 py-3">
                    {isSuperAdmin ? (
                      <select
                        value={committedRoles.get(row.id) ?? row.role}
                        onChange={(e) => handleRoleSelect(row.id, row.email, e.target.value)}
                        className={[
                          "rounded-full px-2 py-0.5 text-xs font-medium border-0 outline-none cursor-pointer",
                          roleColor[committedRoles.get(row.id) ?? row.role] ?? roleColor.member,
                        ].join(" ")}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor[row.role] ?? roleColor.member}`}>
                        {row.role}
                      </span>
                    )}
                    {actionResult?.userId === row.id && (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                        {actionResult.message}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={row.cohort_id ?? ""}
                      onChange={(e) => handleCohortChange(row.id, e.target.value)}
                      className="rounded-md border border-border bg-surface-1 px-2 py-1 text-xs outline-none focus:border-brand/50"
                    >
                      <option value="">— {t("common.no")} turma —</option>
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPendingModal({ type: "reset-password", email: row.email })}
                        title={t("members.resetPassword")}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                      >
                        🔑
                      </button>
                      <button
                        onClick={() => setPendingModal({ type: "revoke-sessions", userId: row.id, email: row.email })}
                        title={t("members.revokeSessions")}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                      >
                        ⊘
                      </button>
                      {isSuperAdmin && row.id !== currentUserId && (
                        <button
                          onClick={() => setPendingModal({ type: "delete", userId: row.id, email: row.email })}
                          title={t("members.delete")}
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={pendingModal !== null}
        title={modalTitle}
        description={modalDescription}
        destructive={modalDestructive}
        confirmLabel={modalConfirmLabel}
        isPending={isPending}
        onConfirm={handleConfirm}
        onCancel={() => setPendingModal(null)}
      />

      <CreateMemberModal
        open={showCreate}
        cohorts={cohorts}
        onClose={() => setShowCreate(false)}
        onCreated={() => setShowCreate(false)}
      />
    </div>
  );
}
