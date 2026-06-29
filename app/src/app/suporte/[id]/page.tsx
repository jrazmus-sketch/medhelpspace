import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getMyTicketWithMessages, markTicketReadByMember } from "@/lib/support-data";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportStatus,
} from "@/lib/support";
import { ThreadReply } from "./thread-client";

export const metadata = { title: "Chamado" };

const STATUS_STYLES: Record<SupportStatus, string> = {
  open: "bg-brand/15 text-brand",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  resolved: "bg-green-500/15 text-green-700 dark:text-green-400",
  closed: "bg-surface-2 text-muted-foreground",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId) || ticketId <= 0 || USE_MOCK_DATA) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getMyTicketWithMessages(user.id, ticketId);
  if (!data) notFound();

  // Opening the thread clears the member-unread flag for the list badge.
  await markTicketReadByMember(user.id, ticketId);

  const { ticket, messages } = data;

  return (
    <div className="mx-auto max-w-2xl px-[10px] py-8 sm:px-6 sm:py-10">
      <Link
        href="/suporte"
        className="mb-5 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Meus chamados
      </Link>

      {/* Ticket header */}
      <div className="mb-6 border-b border-border pb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold leading-snug tracking-tight text-foreground">
            {ticket.subject}
          </h1>
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[ticket.status]}`}
          >
            {SUPPORT_STATUS_LABELS[ticket.status]}
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          {SUPPORT_CATEGORY_LABELS[ticket.category]} · Protocolo #{ticket.id} · Aberto em{" "}
          {formatDateTime(ticket.created_at)}
        </p>
      </div>

      {/* Thread */}
      <div className="space-y-4">
        {messages.map((m) => {
          const isMember = m.author_role === "member";
          return (
            <div
              key={m.id}
              className={isMember ? "flex justify-end" : "flex justify-start"}
            >
              <div className="max-w-[85%]">
                <p
                  className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${isMember ? "text-right text-muted-foreground" : "text-brand"}`}
                >
                  {isMember ? "Você" : "Suporte"}
                </p>
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMember
                      ? "rounded-tr-sm bg-brand/10 text-foreground"
                      : "rounded-tl-sm bg-surface-2 text-foreground"
                  }`}
                >
                  {m.body}
                </div>
                <p
                  className={`mt-1 text-[10.5px] text-muted-foreground ${isMember ? "text-right" : ""}`}
                >
                  {formatDateTime(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply box */}
      <div className="mt-8 border-t border-border pt-6">
        <ThreadReply ticketId={ticket.id} status={ticket.status} />
      </div>
    </div>
  );
}
