"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

interface Props {
  chargeId: string;
  cohortSlug: string;
  qrText: string;
  qrImageUrl: string | null;
  expiresAt: string | null;
  onPaid: () => void;
}

export function PixDisplay({ chargeId, cohortSlug, qrText, qrImageUrl, expiresAt, onPaid }: Props) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    function tick() {
      const diff = Math.floor((end - Date.now()) / 1000);
      if (diff <= 0) {
        setExpired(true);
        setSecondsLeft(0);
      } else {
        setSecondsLeft(diff);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Poll for payment status every 5 seconds
  useEffect(() => {
    if (expired) return;

    async function poll() {
      try {
        const res = await fetch(`/api/pagbank/status/${chargeId}`);
        if (!res.ok) return;
        const data: { paid: boolean } = await res.json();
        if (data.paid) {
          if (pollRef.current) clearInterval(pollRef.current);
          onPaid();
        }
      } catch {
        // silently retry
      }
    }

    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [chargeId, expired, onPaid]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(qrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // clipboard not available
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="text-4xl">⏱️</div>
        <div>
          <h2 className="text-xl font-bold text-foreground">QR code expirado</h2>
          <p className="mt-2 text-sm text-foreground/55">
            O código Pix expirou após 30 minutos.
          </p>
        </div>
        <a
          href={`/checkout?cohort=${cohortSlug}`}
          className="rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40"
        >
          ← Voltar e tentar novamente
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 py-6 text-center">

      <div>
        <h2
          className="text-2xl font-extrabold text-foreground"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          Pague com Pix
        </h2>
        <p className="mt-2 text-sm text-foreground/55">
          Escaneie o QR code ou copie o código no app do seu banco
        </p>
      </div>

      {/* Countdown */}
      {secondsLeft !== null && (
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-4 py-1.5 text-sm font-medium text-foreground/60">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Expira em {formatTime(secondsLeft)}
        </div>
      )}

      {/* QR image */}
      {qrImageUrl ? (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt="QR code Pix"
            width={220}
            height={220}
            className="block"
          />
        </div>
      ) : (
        <div className="flex h-56 w-56 items-center justify-center rounded-2xl border border-border bg-muted/30 text-sm text-foreground/40">
          QR code indisponível
        </div>
      )}

      {/* Copy code */}
      <div className="w-full max-w-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-foreground/40">
          Pix copia e cola
        </p>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left font-mono text-xs text-foreground/60">
            {qrText}
          </div>
          <button
            type="button"
            onClick={copyCode}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
              copied
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-border bg-background text-foreground hover:bg-muted/40"
            }`}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      <p className="text-xs text-foreground/40">
        O acesso é liberado automaticamente após a confirmação do pagamento.
        <br />
        Pode fechar esta página com segurança.
      </p>
    </div>
  );
}
