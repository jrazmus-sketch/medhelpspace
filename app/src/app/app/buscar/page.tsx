import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import Link from "next/link";
import { Search as SearchIcon, ChevronRight } from "lucide-react";

export const metadata = { title: "Buscar — MedHelpSpace" };

type SearchResult = {
  page_id: number;
  page_title: string;
  page_slug: string;
  page_type: string;
  specialty_id: number | null;
  specialty_slug: string | null;
  specialty_name: string | null;
  matched_lesson_id: number | null;
  matched_lesson_title: string | null;
  rank: number;
};

const TYPE_LABEL: Record<string, string> = {
  "plain-content": "Conteúdo",
  "text-lesson": "Aula",
  "audio-lesson": "Áudio",
  "h5p-quiz": "Questões",
  "blurb-nav-hub": "Hub",
};

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireActiveMembership();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let results: SearchResult[] = [];
  let queryError: string | null = null;

  if (query && !USE_MOCK_DATA) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("search_content", { q: query, max_results: 30 });
      if (error) queryError = error.message;
      results = (data ?? []) as SearchResult[];
    } catch (e) {
      queryError = e instanceof Error ? e.message : "Erro ao buscar";
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
      <h1 style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 700, letterSpacing: "-.03em", marginBottom: 24 }}>
        Buscar
      </h1>

      {/* Search form */}
      <form
        action="/app/buscar"
        method="get"
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 32,
          position: "sticky",
          top: 60,
          zIndex: 10,
          background: "var(--background)",
          padding: "4px 0",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <SearchIcon
            size={16}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-foreground)",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar por sintoma, doença, conduta…"
            autoFocus
            style={{
              width: "100%",
              padding: "12px 16px 12px 38px",
              fontSize: 15,
              borderRadius: "var(--radius)",
              border: "1px solid var(--surface-2)",
              background: "var(--surface-1)",
              color: "var(--foreground)",
              outline: "none",
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: "0 22px",
            background: "var(--brand)",
            color: "var(--brand-fg)",
            borderRadius: "var(--radius)",
            border: "none",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Buscar
        </button>
      </form>

      {/* Body */}
      {!query ? (
        <EmptyState />
      ) : queryError ? (
        <div style={{ padding: 20, borderRadius: "var(--radius)", background: "var(--surface-1)", border: "1px solid #ef4444" }}>
          <p style={{ fontSize: 14, color: "#ef4444" }}>Erro ao buscar: {queryError}</p>
        </div>
      ) : results.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: "var(--surface-1)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--surface-2)",
          }}
        >
          <p style={{ fontSize: 15, color: "var(--muted-foreground)", marginBottom: 8 }}>
            Nenhum resultado para “{query}”.
          </p>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", opacity: 0.7 }}>
            Tente termos mais simples ou sinônimos.
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>
            {results.length} resultado{results.length !== 1 ? "s" : ""}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r) => {
              const href = r.specialty_slug
                ? `/app/${r.specialty_slug}/${r.page_slug}${r.matched_lesson_id ? `?s=${r.matched_lesson_id}` : ""}`
                : `/app/${r.page_slug}`;
              return (
                <Link
                  key={`${r.page_id}-${r.matched_lesson_id ?? "page"}`}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    background: "var(--surface-1)",
                    border: "1px solid var(--surface-2)",
                    borderRadius: "var(--radius)",
                    textDecoration: "none",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  className="hover:border-brand/40 hover:bg-surface-2"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      {TYPE_LABEL[r.page_type] && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: ".1em",
                          textTransform: "uppercase",
                          color: "var(--brand)",
                          background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                          padding: "2px 7px",
                          borderRadius: 4,
                        }}>
                          {TYPE_LABEL[r.page_type]}
                        </span>
                      )}
                      {r.specialty_name && (
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                          {r.specialty_name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.page_title}
                    </div>
                    {r.matched_lesson_title && (
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        → {r.matched_lesson_title}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "60px 20px",
        textAlign: "center",
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--surface-2)",
      }}
    >
      <SearchIcon size={32} style={{ color: "var(--muted-foreground)", margin: "0 auto 16px", display: "block", opacity: 0.4 }} />
      <p style={{ fontSize: 15, color: "var(--muted-foreground)", marginBottom: 8 }}>
        Busque por qualquer termo médico.
      </p>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", opacity: 0.7 }}>
        Procura entre títulos de páginas e conteúdo das aulas.
      </p>
    </div>
  );
}
