import { createAdminClient } from "@/lib/supabase/admin";
import { errorFingerprint, type AppErrorReport } from "@/lib/app-errors";

/**
 * Record one occurrence of an error (see schema-patch-app-errors.sql). Never
 * throws: error tracking must not be able to cause, or mask, another error.
 */
export async function recordAppError(r: AppErrorReport): Promise<void> {
  try {
    const fingerprint = await errorFingerprint(r);
    const { error } = await createAdminClient().rpc("record_app_error", {
      p_fingerprint: fingerprint,
      p_kind: r.kind,
      p_message: r.message || "Erro sem mensagem",
      p_route: r.route,
      p_digest: r.digest,
      p_stack: r.stack,
      p_path: r.path,
      p_user_agent: r.userAgent,
    });
    if (error) console.error("recordAppError: rpc failed", error.message);
  } catch (e) {
    console.error("recordAppError: failed", e);
  }
}
