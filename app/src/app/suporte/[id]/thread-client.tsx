"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { MESSAGE_MAX, type SupportStatus } from "@/lib/support";

export function ThreadReply({
  ticketId,
  status,
}: {
  ticketId: number;
  status: SupportStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, startTransition] = useTransition();

  const reopens = status === "resolved" || status === "closed";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setExpired(false);
    const m = message.trim();
    if (m.length < 1) {
      setError("Escreva uma mensagem.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/${ticketId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: m }),
        });
        if (!res.ok) {
          // Same stale-session case as the new-ticket form: the page still renders
          // as logged in, but the POST arrives with a dead cookie.
          if (res.status === 401) {
            setExpired(true);
            setError(null);
            return;
          }
          setError("Não foi possível enviar. Tente novamente.");
          return;
        }
        setMessage("");
        router.refresh();
      } catch {
        setError("Não foi possível enviar. Tente novamente.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="reply-message" className="block text-sm font-medium text-muted-foreground">
        {reopens ? "Responder e reabrir" : "Responder"}
      </label>
      <textarea
        id="reply-message"
        value={message}
        maxLength={MESSAGE_MAX}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder="Escreva sua resposta…"
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brand/50"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {expired && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">Sua sessão expirou.</p>
          <p className="mt-1 text-destructive/90">
            Sua resposta continua aqui — entre novamente e clique em “Enviar”.
          </p>
          {/* New tab on purpose — see the note in suporte-client.tsx. */}
          <a
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-[44px] items-center font-semibold underline underline-offset-4"
          >
            Entrar novamente
          </a>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        {reopens ? (
          <p className="text-[12px] text-muted-foreground">
            Este chamado está {status === "resolved" ? "resolvido" : "encerrado"} — responder
            vai reabri-lo.
          </p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
