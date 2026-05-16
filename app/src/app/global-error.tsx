"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#09090b", color: "#fafafa" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "48px", fontWeight: 700, color: "rgba(255,255,255,0.15)", margin: 0 }}>!</p>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Algo deu errado</h1>
          <p style={{ fontSize: "14px", color: "#a1a1aa", maxWidth: "360px", margin: 0, lineHeight: 1.6 }}>
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <button
              onClick={reset}
              style={{
                background: "#7a1d91",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tentar novamente
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/app"
              style={{
                border: "1px solid #3f3f46",
                color: "#a1a1aa",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Voltar ao início
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
