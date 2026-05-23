import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { BlurbNavHubRenderer } from "@/components/content/blurb-nav-hub-renderer";
import { TrackHubRenderer } from "@/components/content/track-hub-renderer";
import { ViewHubRenderer } from "@/components/content/view-hub-renderer";
import { buildCrumbsForPage, type Crumb } from "@/lib/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardList, ListChecks, ScrollText, Mic, FlaskConical,
  Headphones, ChevronRight, type LucideIcon,
} from "lucide-react";
import type { PageView } from "@/types/supabase";

// ── Study type config (view / track → display) ────────────────────────────────

type TypeConfig = { label: string; desc: string; Icon: LucideIcon; color: string };

const VIEW_CONFIG: Partial<Record<PageView, TypeConfig>> = {
  quiz:       { label: "Questões Revalida",   desc: "Questões estilo INEP comentadas",          Icon: ClipboardList, color: "var(--c-questoes)"   },
  simulados:  { label: "Simulados",           desc: "Treino de prova por casos clínicos",       Icon: ListChecks,    color: "var(--c-simulados)"  },
  resumos:    { label: "Resumos Narrativos",  desc: "Narrativas clínicas por especialidade",    Icon: ScrollText,    color: "var(--c-resumos)"    },
  formula:    { label: "Fórmula MedHelp",     desc: "Condutas clínicas em formato visual",      Icon: FlaskConical,  color: "var(--c-formula)"    },
};

const TRACK_CONFIG: Record<string, TypeConfig> = {
  medvoice:   { label: "MedVoice",  desc: "Áudios por tema — a Clínica Fala",       Icon: Mic,       color: "var(--c-medvoice)"   },
  audiocards: { label: "AudioCards", desc: "Revisão em áudio, cartão por cartão",   Icon: Headphones, color: "var(--c-audiocards)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--muted-2, #727272)", fontWeight: 600,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SpecialtyHubPage({
  params,
}: {
  params: Promise<{ specialty: string }>;
}) {
  const { specialty: slug } = await params;
  await requireActiveMembership();
  const supabase = await createClient();

  const { data: specialties } = await supabase
    .from("specialties")
    .select("*")
    .order("display_order");

  const spec = (specialties ?? []).find((s) => s.slug === slug);

  // ── Non-specialty slugs (track hubs, view hubs, etc.) ─────────────────────
  if (!spec) {
    const admin = createAdminClient();
    const { data: page } = await admin
      .from("pages")
      .select("id, title, slug, type, track_id, view, specialty_id, content_module_id")
      .eq("slug", slug)
      .single();

    if (!page) notFound();

    const body =
      page.track_id != null ? (
        <TrackHubRenderer trackId={page.track_id} excludePageId={page.id} />
      ) : page.type === "blurb-nav-hub" ? (
        <BlurbNavHubRenderer pageId={page.id} />
      ) : page.view != null ? (
        <ViewHubRenderer view={page.view} excludePageId={page.id} />
      ) : null;

    if (!body) notFound();

    // Top-level type hub (no specialty) → buildCrumbsForPage emits
    // [Início, <Type root terminal>]. Voltar falls back to /app.
    const crumbs: Crumb[] = buildCrumbsForPage({
      page,
      specialty: null,
      specialtyHubSlug: null,
    });

    return (
      <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
        <div className="mb-2">
          <VoltarButton fallbackHref="/app" />
        </div>
        <Breadcrumbs className="mb-6" crumbs={crumbs} />
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1.15, margin: 0 }}>
            {page.title}
          </h1>
        </header>
        {body}
      </div>
    );
  }

  // ── Specialty hub ─────────────────────────────────────────────────────────

  const admin = createAdminClient();

  // Fetch hub pages (blurb-nav-hub) and track pages for this specialty
  const [{ data: hubPages }, { data: trackPagesRaw }, { data: allTracks }] = await Promise.all([
    admin
      .from("pages")
      .select("id, slug, view, title")
      .eq("specialty_id", spec.id)
      .eq("status", "publish")
      .eq("type", "blurb-nav-hub"),
    admin
      .from("pages")
      .select("id, slug, title, track_id")
      .eq("specialty_id", spec.id)
      .eq("status", "publish")
      .not("track_id", "is", null),
    admin.from("tracks").select("id, slug, name"),
  ]);

  // Build type option cards: view-based hub pages
  type TypeOption = { key: string; cfg: TypeConfig; href: string };
  const typeOptions: TypeOption[] = [];

  const VIEW_ORDER: PageView[] = ["quiz", "simulados", "resumos", "formula"];
  for (const view of VIEW_ORDER) {
    const cfg = VIEW_CONFIG[view];
    if (!cfg) continue;
    const hubPage = (hubPages ?? []).find(p => p.view === view);
    if (hubPage) {
      typeOptions.push({ key: view, cfg, href: `/app/${slug}/${hubPage.slug}` });
    }
  }

  // Track-based pages (medvoice, audiocards)
  const TRACK_ORDER = ["medvoice", "audiocards"];
  for (const trackSlug of TRACK_ORDER) {
    const cfg = TRACK_CONFIG[trackSlug];
    if (!cfg) continue;
    const track = (allTracks ?? []).find(t => t.slug === trackSlug);
    if (!track) continue;
    const trackPage = (trackPagesRaw ?? []).find(p => p.track_id === track.id);
    if (trackPage) {
      typeOptions.push({ key: trackSlug, cfg, href: `/app/${slug}/${trackPage.slug}` });
    }
  }

  const emoji = (spec as { emoji?: string }).emoji;

  // Specialty all-content hub: Início > <Specialty terminal>.
  const crumbs: Crumb[] = [
    { label: "Início", href: "/app" },
    { label: spec.name },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Header ── */}
      <header style={{ marginBottom: 32 }}>
        {emoji && <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 10 }}>{emoji}</div>}
        <h1 style={{
          fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 700,
          letterSpacing: "-.035em", lineHeight: 1.1, margin: 0,
        }}>
          {spec.name}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Escolha como quer estudar esta especialidade.
        </p>
      </header>

      {/* ── Study type cards ── */}
      {typeOptions.length > 0 ? (
        <div>
          <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>Tipo de conteúdo</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {typeOptions.map((opt, i) => {
              const { cfg, href } = opt;
              return (
                <Link
                  key={opt.key}
                  href={href}
                  style={{
                    borderRadius: "var(--radius)",
                    padding: "22px 20px",
                    display: "flex", alignItems: "flex-start", gap: 16,
                    textDecoration: "none", minHeight: 100,
                    background: `linear-gradient(140deg, color-mix(in srgb, ${cfg.color} 92%, #1a0030) 0%, ${cfg.color} 100%)`,
                    animation: `dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both`,
                    animationDelay: `${i * 55}ms`,
                    position: "relative", overflow: "hidden",
                  }}
                  className="transition-opacity hover:opacity-90"
                >
                  <cfg.Icon
                    size={22}
                    strokeWidth={1.6}
                    style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em", color: "#fff", lineHeight: 1.2 }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.4, color: "rgba(255,255,255,0.62)" }}>
                      {cfg.desc}
                    </div>
                    <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                      Acessar <ChevronRight size={11} strokeWidth={2.5} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
          Conteúdo em preparação para esta especialidade.
        </p>
      )}

      {/* ── Back link ── */}
      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--surface-2)" }}>
        <Link
          href="/app"
          style={{ fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
          className="hover:text-foreground transition-colors"
        >
          ← Voltar ao início
        </Link>
      </div>
    </div>
  );
}
