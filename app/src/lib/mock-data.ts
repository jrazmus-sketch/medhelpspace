/**
 * Mock data for development — runs entirely offline until Supabase is wired up.
 * Toggle with USE_MOCK_DATA env var (defaults to true in development).
 */

import type {
  Cohort,
  CohortModuleAccess,
  CohortProduct,
  ContentModule,
  DashboardData,
  Lesson,
  NavItem,
  Page,
  Specialty,
  Track,
  User,
  UserWithCohort,
} from "@/types/supabase";

// ── Feature flag ──────────────────────────────────────────────────────────────
// Mock mode is a DEV-ONLY convenience. Gating the whole expression on
// NODE_ENV !== "production" guarantees a stray NEXT_PUBLIC_USE_MOCK_DATA=true in a
// prod/preview environment can never flip the app into mock mode — which would
// disable the membership paywall and treat every viewer as an admin (drafts exposed).
// `next build`/`next start` set NODE_ENV=production, so this is false in any prod build.
export const USE_MOCK_DATA =
  process.env.NODE_ENV !== "production" &&
  (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL);

// ── Seed data ──────────────────────────────────────────────────────────────────

export const MOCK_COHORTS: Cohort[] = [
  {
    id: 1,
    slug: "revalida-2026-2",
    name: "Revalida 2026.2",
    test_date: "2026-07-01",
    date_confirmed: true,
    membership_starts_at: "2025-08-01T00:00:00Z",
    membership_ends_at: "2026-08-31T23:59:59Z",
  },
  {
    id: 2,
    slug: "revalida-2027-1",
    name: "Revalida 2027.1",
    test_date: "2027-01-15",
    date_confirmed: false,
    membership_starts_at: "2026-02-01T00:00:00Z",
    membership_ends_at: "2027-02-28T23:59:59Z",
  },
];

// Saleable cohorts for the storefront — mirrors the backfilled catalog columns.
export const MOCK_COHORT_PRODUCTS: CohortProduct[] = [
  {
    id: 1,
    slug: "revalida-2026-2",
    name: "Revalida 2026.2",
    // On sale in mock mode so the strikethrough + badge render in dev/mobile-check.
    priceCents: 299000,
    priceLabel: "R$ 2.990",
    compareAtPriceCents: 399000,
    compareAtPriceLabel: "R$ 3.990",
    isOnSale: true,
    discountPercent: 25,
    savingsLabel: "Economize R$ 1.000",
    displayOrder: 1,
    testDate: "2026-09-15",
    unlock60dDate: "2026-07-15",
    dateConfirmed: true,
  },
  {
    id: 2,
    slug: "revalida-2027-1",
    name: "Revalida 2027.1",
    priceCents: 499000,
    priceLabel: "R$ 4.990",
    compareAtPriceCents: null,
    compareAtPriceLabel: null,
    isOnSale: false,
    discountPercent: null,
    savingsLabel: null,
    displayOrder: 2,
    testDate: "2027-01-15",
    unlock60dDate: "2026-11-16",
    dateConfirmed: false,
  },
];

export const MOCK_CONTENT_MODULES: ContentModule[] = [
  {
    id: 1,
    slug: "medhelp-60d",
    name: "MedHelp 60D",
    description: "Fórmula MedHelp + Memorecards — unlocks 60 days before the cohort test date",
    unlock_offset_days: 60,
  },
];

// Module unlocks 60 days before test_date for each cohort
export const MOCK_MODULE_ACCESS: CohortModuleAccess[] = [
  {
    cohort_id: 1,
    content_module_id: 1,
    unlock_date: "2026-05-02", // 2026-07-01 - 60 days
  },
  {
    cohort_id: 2,
    content_module_id: 1,
    unlock_date: "2026-11-16", // 2027-01-15 - 60 days
  },
];

export const MOCK_SPECIALTIES: Specialty[] = [
  { id: 1,  slug: "cardiologia",          name: "Cardiologia",           emoji: "🫀", display_order: 1 },
  { id: 2,  slug: "pneumologia",          name: "Pneumologia",           emoji: "🫁", display_order: 2 },
  { id: 3,  slug: "neurologia",           name: "Neurologia",            emoji: "🧠", display_order: 3 },
  { id: 4,  slug: "clinica-medica",       name: "Clínica Médica",        emoji: "🩺", display_order: 4 },
  { id: 5,  slug: "cirurgia",             name: "Cirurgia Geral",        emoji: "🔪", display_order: 5 },
  { id: 6,  slug: "ginecologia",          name: "Ginecologia e Obstetrícia", emoji: "🤰", display_order: 6 },
  { id: 7,  slug: "pediatria",            name: "Pediatria",             emoji: "👶", display_order: 7 },
  { id: 8,  slug: "medicina-intensiva",   name: "Medicina Intensiva",    emoji: "🚨", display_order: 8 },
  { id: 9,  slug: "infectologia",         name: "Infectologia",          emoji: "🦠", display_order: 9 },
  { id: 10, slug: "endocrinologia",       name: "Endocrinologia",        emoji: "⚗️", display_order: 10 },
  { id: 11, slug: "gastroenterologia",    name: "Gastroenterologia",     emoji: "🫃", display_order: 11 },
  { id: 12, slug: "reumatologia",         name: "Reumatologia",          emoji: "🦴", display_order: 12 },
];

export const MOCK_TRACKS: Track[] = [
  { id: 1, slug: "medvoice",   name: "MedVoice" },
  { id: 2, slug: "audiocards", name: "Audiocards" },
  { id: 3, slug: "flashcards", name: "Flashcards" },
];

export const MOCK_USER: User = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "justin@medhelpspace.com.br",
  display_name: "Justin",
  role: "super_admin",
  theme_preference: "system",
  admin_locale: "en",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-05-11T00:00:00Z",
};

export const MOCK_USER_WITH_COHORT: UserWithCohort = {
  ...MOCK_USER,
  cohorts: [MOCK_COHORTS[1]], // Revalida 2027.1
  active_cohort: MOCK_COHORTS[1],
};

export const MOCK_JOINED_AT = "2026-03-25T00:00:00Z";

const _today = new Date();
const _joinedAt = new Date(MOCK_JOINED_AT);
export const MOCK_STUDY_DAYS = Math.max(
  0,
  Math.floor((_today.getTime() - _joinedAt.getTime()) / 86_400_000),
);

const _mockUnlockDate = new Date(
  MOCK_MODULE_ACCESS.find((a) => a.cohort_id === 2)?.unlock_date ?? "2099-01-01",
);
const _daysUntilUnlock = Math.ceil(
  (_mockUnlockDate.getTime() - _today.getTime()) / 86_400_000,
);

export const MOCK_DASHBOARD: DashboardData = {
  user: MOCK_USER_WITH_COHORT,
  specialties: MOCK_SPECIALTIES,
  module_access: MOCK_MODULE_ACCESS,
  study_days: MOCK_STUDY_DAYS,
};

export const MOCK_MODULE_LOCKED = _daysUntilUnlock > 0;
export const MOCK_DAYS_UNTIL_UNLOCK = Math.max(0, _daysUntilUnlock);

// ── Sample page content (a few pages for dev) ──────────────────────────────────

export const MOCK_PAGES: Page[] = [
  {
    id: 288,
    slug: "cardiologia",
    title: "Cardiologia",
    type: "blurb-nav-hub",
    status: "publish",
    parent_id: null,
    specialty_id: 1,
    view: "hub",
    track_id: null,
    content_module_id: null,
    notes: null,
    wp_created_at: "2025-07-21T01:05:55Z",
    wp_modified_at: "2026-04-01T10:00:00Z",
  },
  {
    id: 652,
    slug: "bradiarritimias",
    title: "Bradiarritimias",
    type: "plain-content",
    status: "publish",
    parent_id: 288,
    specialty_id: 1,
    view: null,
    track_id: null,
    content_module_id: null,
    notes: null,
    wp_created_at: "2025-07-25T12:00:00Z",
    wp_modified_at: "2026-03-15T08:00:00Z",
  },
];

export const MOCK_LESSONS: Lesson[] = [
  {
    id: 1,
    page_id: 652,
    position: 1,
    title: "Bradiarritimias — Resumo",
    body_html: `<h2>Bradiarritimias</h2>
<p>Definição: FC &lt; 60 bpm em repouso.</p>
<h3>Causas</h3>
<ul>
  <li>Fisiológica (atletas)</li>
  <li>Medicamentosa (betabloqueadores, digitálicos)</li>
  <li>BAV de 1º, 2º e 3º graus</li>
  <li>Síndrome do nó sinusal</li>
</ul>`,
    audio_url: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

export const MOCK_NAV_ITEMS: NavItem[] = [
  {
    id: 1,
    source_page_id: 288,
    target_page_id: 652,
    position: 1,
    label: "Bradiarritimias",
    icon: null,
    group_label: null,
    layout: "cards",
  },
  {
    id: 2,
    source_page_id: 288,
    target_page_id: 671,
    position: 2,
    label: "Insuficiência Cardíaca",
    icon: null,
    group_label: null,
    layout: "cards",
  },
  {
    id: 3,
    source_page_id: 288,
    target_page_id: 677,
    position: 3,
    label: "Tamponamento Cardíaco",
    icon: null,
    group_label: null,
    layout: "cards",
  },
];
