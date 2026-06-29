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
  const [pending, startTransition] = useTransition();

  const reopens = status === "resolved" || status === "closed";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
