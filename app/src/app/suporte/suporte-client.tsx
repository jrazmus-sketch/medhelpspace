"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LifeBuoy, Send, ChevronRight } from "lucide-react";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  MESSAGE_MIN,
  MESSAGE_MAX,
  SUBJECT_MAX,
  type SupportCategory,
  type SupportStatus,
  type SupportTicket,
} from "@/lib/support";

const STATUS_STYLES: Record<SupportStatus, string> = {
  open: "bg-brand/15 text-brand",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  resolved: "bg-green-500/15 text-green-700 dark:text-green-400",
  closed: "bg-surface-2 text-muted-foreground",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SuporteClient({ initialTickets }: { initialTickets: SupportTicket[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<SupportCategory>("tecnico");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = subject.trim();
    const m = message.trim();
    // Capture where they came from (client-only) — helps triage "técnico" reports.
    const pageUrl = typeof document !== "undefined" ? document.referrer : "";
    if (s.length < 1) {
      setError("Escreva um assunto.");
      return;
    }
    if (m.length < MESSAGE_MIN) {
      setError(`A mensagem precisa ter pelo menos ${MESSAGE_MIN} caracteres.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, subject: s, message: m, pageUrl }),
        });
        if (!res.ok) {
          const { error: code } = await res
            .json()
            .catch(() => ({ error: "save_failed" }));
          setError(
            code === "too_soon"
              ? "Aguarde alguns segundos antes de enviar outro chamado."
              : "Não foi possível enviar. Tente novamente.",
          );
          return;
        }
        const { ticketId } = await res.json();
        router.push(`/suporte/${ticketId}`);
      } catch {
        setError("Não foi possível enviar. Tente novamente.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-[10px] py-8 sm:px-6 sm:py-10">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand">
          <LifeBuoy className="h-3.5 w-3.5" strokeWidth={2} />
          Suporte
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Precisa de ajuda?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Conte o que está acontecendo e nossa equipe responde por aqui e no seu
          e-mail. Acesso, pagamento, problema técnico ou dúvida sobre o conteúdo —
          estamos aqui pra ajudar.
        </p>
      </div>

      {/* New ticket form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border bg-surface-1 p-4 sm:p-5"
      >
        <div className="space-y-1.5">
          <label htmlFor="sup-category" className="text-sm font-medium text-muted-foreground">
            Assunto
          </label>
          <select
            id="sup-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
            className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand/50"
          >
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPORT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sup-subject" className="text-sm font-medium text-muted-foreground">
            Título
          </label>
          <input
            id="sup-subject"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Resuma em uma frase"
            className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand/50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sup-message" className="text-sm font-medium text-muted-foreground">
            Mensagem
          </label>
          <textarea
            id="sup-message"
            value={message}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Descreva o que aconteceu com o máximo de detalhes que puder."
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand/50"
          />
          <p className="text-right text-[11px] text-muted-foreground">
            {message.length}/{MESSAGE_MAX}
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          <Send className="h-4 w-4" />
          {pending ? "Enviando…" : "Enviar chamado"}
        </button>
      </form>

      {/* My tickets */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Meus chamados
        </h2>

        {initialTickets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Você ainda não abriu nenhum chamado.
          </p>
        ) : (
          <ul className="space-y-2">
            {initialTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/suporte/${t.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-3.5 transition-colors hover:border-brand/40 hover:bg-surface-2"
                >
                  {t.member_unread && (
                    <span
                      aria-label="Nova resposta"
                      className="h-2 w-2 shrink-0 rounded-full bg-brand"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {SUPPORT_CATEGORY_LABELS[t.category]} · {formatDate(t.last_message_at)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[t.status]}`}
                  >
                    {SUPPORT_STATUS_LABELS[t.status]}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
