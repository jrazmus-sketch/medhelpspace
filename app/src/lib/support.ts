// Shared support-ticket constants + types. PURE module — no server imports, no DB —
// so the member form, the admin inbox, route handlers, and server actions can all
// import it without dragging server code into a client bundle.

export const SUPPORT_CATEGORIES = [
  "tecnico",
  "pagamento",
  "acesso",
  "conteudo",
  "outro",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

// Member-facing labels (PT-BR only — the member site has no i18n).
export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  tecnico: "Problema técnico",
  pagamento: "Pagamento / cobrança",
  acesso: "Acesso / login",
  conteudo: "Dúvida sobre conteúdo",
  outro: "Outro assunto",
};

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

// Member-facing status labels (PT-BR).
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  resolved: "Resolvido",
  closed: "Encerrado",
};

export type SupportAuthorRole = "member" | "admin";

// Validation bounds — enforced on the client for UX and re-checked server-side.
export const SUBJECT_MAX = 150;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 4000;

export function isSupportCategory(v: unknown): v is SupportCategory {
  return typeof v === "string" && (SUPPORT_CATEGORIES as readonly string[]).includes(v);
}

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === "string" && (SUPPORT_STATUSES as readonly string[]).includes(v);
}

export type SupportTicket = {
  id: number;
  user_id: string;
  email: string;
  display_name: string | null;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  page_url: string | null;
  user_agent: string | null;
  cohort_id: number | null;
  handled_by: string | null;
  last_message_at: string;
  last_message_from: SupportAuthorRole;
  member_unread: boolean;
  admin_unread: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: number;
  ticket_id: number;
  author_id: string | null;
  author_role: SupportAuthorRole;
  body: string;
  created_at: string;
};
