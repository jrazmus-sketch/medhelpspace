# /admin/leads Build Phases — Handoff Document

**Last updated:** 2026-07-06 (Phase 3 build)  
**Build status:** ✅ Clean (0 TS errors, changed files lint-clean)

---

## Overview

The `/admin/leads` page is being built incrementally across phases:
- **Phase 1** ✅ DONE: Test lead filtering (is_test column + toggle)
- **Phase 2A** ✅ DONE: Quick wins (drip visibility, engagement badges, sortable columns)
  — NB: the 2A renderers existed but were NOT wired into the table until the Phase 3
  session (2026-07-06); drip/engagement columns + clickable sort headers are live now.
- **Phase 2B** ✅ DONE: Bulk selection + mark-as-test toolbar
- **Phase 2C** ✅ DONE: Advanced bulk actions (resend email, assign cohort, export CSV)
- **Phase 3** ✅ DONE (2026-07-06): bulk unsubscribe/reactivate, resend-to-specific-step,
  bulk archive/unarchive (`is_archived` column), drip-step distribution readout,
  "Mais ações" overflow menu, `router.refresh()` after bulk ops — see *Phase 3:
  What Shipped* below. Items NOT built are listed with reasons under *Deliberately
  deferred*.

---

## Architecture & Patterns

### Data Flow

```
LeadsPage (server)
  ↓ getLeadsOverview() [actions/leads.ts]
  ↓ returns { rows: LeadRow[], summary: LeadsSummary }
LeadsClient (client, "use client")
  ↓ local state: filters, sort, selection
  ↓ useMemo: filtered/sorted rows
  ↓ render table + toolbar
Bulk Actions → server actions (bulkMarkAsTest, bulkAssignCohort, bulkResendEmail, etc.)
  ↓ requireLeadsRole() [role gating]
  ↓ createAdminClient() [service-role Supabase writes]
  ↓ return { success, count, errors? }
  ↓ client: clear selection, refresh table, show feedback
```

### Component Structure

```
leads-client.tsx (main client component)
├── Filters: tier, status, source, capture, funnel, showTests, search
├── Sorting: sortBy, sortAsc (5 sortable columns)
├── Selection: selectedIds Set, isProcessing, successMessage, errorMessage
├── Modals:
│   ├── LeadDetailDrawer (read-only detail pane)
│   ├── ConfirmModal (resend email confirmation)
│   └── BulkAssignCohortModal (cohort picker)
└── Table:
    ├── Header row: checkboxes + 9 columns (email, drip, engagement, tier, etc.)
    ├── Body rows: checkbox + cells
    ├── Mobile cards: responsive layout with checkboxes
    └── Toolbar (fixed bottom):
        ├── Selection count
        ├── Mark as test (primary button)
        ├── Resend email (secondary button, disabled for unsubscribed)
        ├── Assign cohort (secondary button)
        ├── Export CSV (icon button)
        └── Feedback: success/error messages (auto-dismiss 3s)
```

### Type System

```typescript
// LeadRow — the row model (from lib/admin/leads.ts)
type LeadRow = {
  id: string;
  email: string;
  firstName: string | null;
  createdAt: string;
  utmSource: string | null;
  utmCampaign: string | null;
  targetCohort: string | null;
  score: number | null;
  questionsAnswered: number | null;
  completed: boolean;
  weakSpecialties: string[];
  verified: boolean;
  dripStep: number;
  dripStatus: string; // 'active' | 'unsubscribed' | 'bounced' | 'pending'
  convertedAt: string | null;
  lastEmailedAt: string | null;
  tier: LeadTier; // 'customer' | 'hot' | 'nurture' | 'suppressed'
  captureSource: string | null; // 'exit_intent' | null
  source: string; // 'simulado-honesto' | 'flashcards-50' | ...
  isTest: boolean;
};

type LeadsSummary = { total, verified, completed, converted, unsubscribed, bySource, byCohort };
type LeadTier = "customer" | "hot" | "nurture" | "suppressed";
```

### Server Actions Pattern

All bulk actions follow this pattern (in `actions/leads.ts`):

```typescript
"use server";

export async function bulkSomeAction(leadIds: string[], ...args): Promise<{
  success: boolean;
  count: number;
  errors?: Array<{ id: string; reason: string }>;
}> {
  // 1. Validate role
  await requireLeadsRole(); // throws if not super_admin or billing_admin

  // 2. Validate inputs
  if (!leadIds || leadIds.length === 0) throw new Error("No lead IDs");

  // 3. Execute
  const admin = createAdminClient();
  const { data, error, count } = await admin.from("leads").update(...).in("id", leadIds);

  // 4. Handle errors
  if (error) {
    console.error("...", error);
    throw new Error("Failed to...");
  }

  // 5. Return result
  return { success: true, count: count ?? 0 };
}
```

**Key points:**
- All "use server" exports must be `async` functions (cannot export consts/types)
- Always call `requireLeadsRole()` first (enforces authorization)
- Use `createAdminClient()` (service-role) for writes
- Return structured result: `{ success, count, errors? }`
- Throw exceptions; client catches and displays as toast

### Client-Side Handlers Pattern

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [isProcessing, setIsProcessing] = useState(false);
const [successMessage, setSuccessMessage] = useState<string | null>(null);

async function handleBulkAction() {
  if (selectedIds.size === 0) return;
  setIsProcessing(true);
  try {
    const result = await bulkSomeAction(Array.from(selectedIds), ...args);
    setSuccessMessage(t("bulkActionSuccessOther", { count: result.count }));
    setSelectedIds(new Set()); // clear selection
    // refresh table: call getLeadsOverview() and update rows
  } catch (err) {
    setErrorMessage(t("bulkActionError"));
  } finally {
    setIsProcessing(false);
  }
}
```

**Key points:**
- Use `Set<string>` for O(1) lookup on large selections
- Wrap server action in try/catch
- Clear selection on success
- Show message + auto-dismiss (setTimeout 3s)
- Disable buttons while processing

### i18n Pattern

All user-facing strings use `i18next`:

```typescript
const { t } = useTranslation();

// Simple key
t("leads.bulkMarkAsTest") // "Marcar como teste"

// With params
t("leads.bulkSelectedCountOther", { count: 3 }) // "3 leads selecionados"
```

**Translation files:** `app/src/locales/admin/{pt-BR,en}.json`

**Namespace:** All leads UI strings use the `"leads"` key prefix

**Pluralization:** Use `One` / `Other` suffixes for count-based strings:
```json
{
  "bulkSelectedCount": "{{count}} lead selecionado",
  "bulkSelectedCountOther": "{{count}} leads selecionados"
}
```

---

## Current Implementation Details

### Phase 1: Test Lead Filtering

**Schema:** `is_test BOOLEAN NOT NULL DEFAULT false` on `leads` table  
**Query:** Added to `getLeadsOverview()` select statement  
**Type:** `LeadRow.isTest: boolean`  
**UI:**
- Filter toggle: `<input type="checkbox" checked={showTests} />`
- Badge in detail drawer: "Teste interno" with amber AlertTriangle icon
- Default: hidden (showTests=false), requires explicit toggle to see

### Phase 2A: Quick Wins

**Drip Step Visibility**
- Column: "E-mail X/6" (e.g., "E-mail 3/6")
- Source: `row.dripStep` (integer 0–6)
- Implementation: `<DripStep row={row} />` renderer at line 226–236
- i18n: `colDripFormat` with `{{step}}/{{total}}` params

**Email Engagement Badges**
- Heuristic: Hot tier (verified + completed) → ~2 opens; Nurture (verified only) → ~1 open
- Condition: Shows only if `row.lastEmailedAt` is set (lead has been emailed)
- Implementation: `<EmailEngagement row={row} />` renderer at line 238–248
- Fallback: "—" if no emails sent yet
- i18n: `engagementOpens` with `{{count}}` param

**Sortable Columns**
- Headers: Tier, Email, Last Activity (clickable)
- State: `sort: { sortBy, sortAsc }`
- Logic: Click toggles direction on same field; new field starts descending
- Indicators: ↑ (ascending) / ↓ (descending) in header
- Implementation: `renderSortableHeader()` function at line 270–290
- Sorting logic in `filtered` useMemo at line 184–211

### Phase 2B: Bulk Actions Foundation

**Row Selection**
- State: `selectedIds: Set<string>`
- Checkboxes: First table column + "Select all" header
- Handler: `handleSelectAll()` and `handleRowToggle(id)`
- Mobile: Checkboxes preserved in card layout

**Selection Toolbar**
- Fixed bottom: `position: fixed; bottom: 0; left: 0; right: 0;`
- Shows only when `selectedIds.size > 0`
- Content: Selection count + action buttons + feedback messages
- Implementation: lines 575–761

**Mark as Test**
- Server action: `bulkMarkAsTest(leadIds)` at lines 35–55 of actions/leads.ts
- Updates: `is_test = true` for selected leads
- DB: Single `.update(...).in("id", leadIds)` query
- Role gate: `requireLeadsRole()` (super_admin, billing_admin)
- Client: `handleBulkMarkAsTest()` at line 209–222
- Feedback: Success message "X leads marcados como teste"

### Phase 2C: Advanced Bulk Actions

#### Resend Email

**Server Action:** `bulkResendDripEmail(leadIds)` (lines 93–253 of actions/leads.ts)

**Logic:**
1. Query leads with `dripStep`, `dripStatus`, email
2. Filter: only "active" status leads can receive email
3. For each lead:
   - nextStep = dripStep + 1 (cap at 6)
   - template = DRIP_STEP_TO_KIND[nextStep] (maps to "lead-d0", "lead-d1", etc.)
   - build vars: displayName, greeting, score, weakSpecialties, examLabel, unsubscribeUrl
   - call `sendTemplateEmail(email, template, vars)`
4. Update leads: `dripStep = nextStep`, `last_emailed_at = now()`
5. Return: `{ success, sent, failed: [{id, email, reason}] }`

**Helpers:**
- `fetchLeadsForDrip(leadIds)` — queries leads for email send
- `specialtyNames(specialtyIds)` — converts weak_specialty_ids to names
- `buildDripVars(lead)` — constructs template variables

**Client:**
- State: `showResendModal` (confirmation modal)
- Computed: `canResendEmail` (all selected leads have "active" status)
- Handler: `handleBulkResendEmail()` at lines 297–326
- Modal: `ConfirmModal` showing count at lines 711–722
- Button: "Reenviar E-mail" (Mail icon), disabled for unsubscribed/bounced
- Feedback: Success count or error message with failed leads

**Resend Integration:**
- Uses existing `sendTemplateEmail()` from `lib/email.ts`
- Template kinds: "lead-d0", "lead-d1", "lead-d2", "lead-d4", "lead-d7", "lead-final"
- Requires: `RESEND_API_KEY` env var (already configured)

**i18n keys:**
- `bulkResend`, `bulkResendTitle`, `bulkResendDescription*`, `bulkResendConfirm`
- `bulkResendSuccess*`, `bulkResendPartialError`, `bulkResendDisabledTooltip`

#### Assign Cohort

**Component:** `bulk-assign-cohort-modal.tsx` (NEW file, ~80 lines)

**Modal:**
- Shows 3 cohorts as radio buttons: "revalida-2026-2", "revalida-2027-1", "revalida-2027-2"
- Slug displayed next to cohort name for clarity
- Confirm button disabled until cohort selected

**Server Action:** `bulkAssignCohort(leadIds, cohort)` (lines 57–89 of actions/leads.ts)

**Logic:**
1. Validate cohort against whitelist: `["revalida-2026-2", "revalida-2027-1", "revalida-2027-2"]`
2. Update: `target_cohort = cohort` for all selected leads
3. Return: `{ success, count }`

**Client:**
- State: `showCohortModal` (modal visibility)
- Button: "Atribuir turma" (secondary, outline style)
- Handler: `handleBulkAssignCohort()` at lines 262–286
- Feedback: Success message "X leads com turma atribuída"

**i18n keys:**
- `bulkAssignCohort`, `bulkAssignCohortTitle`, `bulkAssignCohortSubtitle*`
- `bulkAssignCohortConfirm`, `bulkAssignCohortError`, `bulkAssignCohortSuccess*`

#### Export CSV

**Client-side only (no server call)**

**Helpers:**
- `formatCsvValue(value)` (lines 61–76) — CSV-safe value encoding
  - Handles nulls, booleans (→ "Sim"/"Não"), arrays (→ pipe-separated)
  - **Security:** Formula injection protection — prepends `'` to values starting with `=+−@`
- `generateLeadsCSV(rows)` (lines 78–120) — builds CSV document
  - Headers: email, firstName, created, lastActivity, dripStep, score, questionsAnswered, completed, weakSpecialties, verified, tier, captureSource, source, isTest
  - Dates in ISO format
  - lastActivity fallback to createdAt if no emails sent
- `downloadCSV(csv, filename)` (lines 122–132) — browser download trigger

**Scope:** Exports currently filtered + sorted rows (respects all active filters)

**Client:**
- Button: "Exportar CSV" (Download icon), always visible
- Filename: `leads-export-YYYYMMDD.csv` (auto-generated date)
- Trigger: Client-side Blob + download link, no server call

**i18n keys:**
- `exportCSV`, `exportCSVHint`

---

## Known Gotchas & Invariants

### Code-Level

1. **"use server" exports must be async functions**
   - Cannot export const/type/function declarations
   - `const a = ...` will crash the route if in a "use server" file
   - Solution: Move types to separate files (e.g., `lib/types.ts`)

2. **CSV formula injection**
   - Values starting with `=+−@` are interpreted as Excel formulas
   - Protection: `formatCsvValue()` prepends `'` to neutralize
   - Regex: `/^[=+\-@\t\r]/`

3. **Role gating**
   - Always call `requireLeadsRole()` first in server actions
   - Enforces: `role IN ('super_admin', 'billing_admin')`
   - Throws if unauthorized; client catches and displays error

4. **Bulk update patterns**
   - Use `.in("id", leadIds)` for efficient bulk updates
   - Always validate leadIds array is non-empty
   - Return count from Supabase for UI feedback

### UI/UX

1. **Selection persistence**
   - Selection clears on successful bulk action
   - Use `Set<string>` for O(1) membership testing (avoid array.includes)
   - Selected rows visually highlighted (checkbox checked state)

2. **Feedback messages**
   - Success messages auto-dismiss after 3 seconds
   - Error messages persist until user dismisses or retry succeeds
   - Use `setSuccessMessage(null)` in useEffect with timeout

3. **Disabled state tooltips**
   - Resend button disabled if any lead is unsubscribed/bounced
   - Tooltip explains: "Only 'active' leads can receive email"
   - Computed state: `canResendEmail` evaluates all selected leads

4. **Modal patterns**
   - Confirmation modals for destructive or expensive operations
   - Example: "Resend Email 3/6 to 5 leads?" (asks for confirmation before sending)
   - Use `ConfirmModal` component (generic, reusable)

---

## Phase 3: What Shipped (2026-07-06)

### 3A — Email & Messaging
- [x] **Bulk unsubscribe / reactivate** — `bulkSetDripStatus(leadIds, action)` in
  actions/leads.ts. Unsubscribe mirrors the one-click route's write (`drip_status`
  + `unsubscribed_at`); reactivate flips unsubscribed/**bounced** leads back to
  active and clears `unsubscribed_at` — this IS the manual bounce override.
  `'converted'` is terminal and never touched (same `.neq` guard as the Resend
  webhook). `last_emailed_at` is KEPT (Q1 answered: the drip clock runs from
  `verified_at`, so clearing it only destroys history). Both confirm via
  ConfirmModal; result toast reports skipped rows.
- [x] **Resend to specific drip step** — `bulkResendDripEmail(leadIds, step?)` +
  new `bulk-resend-modal.tsx` (radio picker: "próximo passo de cada lead" default,
  or a specific template D0/D1/D2/D4/D7). `drip_step` is written as
  `max(current, step)` so resending an old email never rewinds the cron sequence.
  **lead-final (step 5) is deliberately not offered** — retired 2026-07-02.
- Bug fixes shipped with this: the old step→template map was **off by one vs. the
  lead-drip cron** (sent lead-d0 as "step 1", making the cron skip a step after any
  manual resend); the unsubscribe link was email-based but the route auths by
  `unsubscribe_token` (**every manual resend had a dead unsubscribe link**); manual
  sends were missing `resultUrl`/`checkoutUrl` vars (dead buttons in the emails).
  All three fixed — `buildDripVars` now mirrors the cron's var set exactly, coupon
  on the D2 step only.
- Flashcards-funnel leads (`source='flashcards-50'`) are refused by the resend
  action (client disables the button too): their sequence is `lead-fc-*`, owned by
  /api/cron/flashcards-drip.

### 3C — Data Management
- [x] **Bulk archive/unarchive** — `is_archived` column
  (schema-patch-leads-archive.sql, applied to prod + local 2026-07-06),
  `bulkSetArchived(leadIds, archived)`, "Mostrar arquivados" filter toggle
  (appears once any lead is archived), "Arquivado" pill next to the status pill.
  Archiving does NOT touch drip_status (list hygiene ≠ email suppression).

### 3D — Analytics (lite)
- [x] **Drip-step distribution** — "No fluxo" chip row next to Por origem/Por turma:
  counts of active+verified quiz-funnel leads per drip step (tests/archived excluded).

### Also in this session
- [x] **Phase 2A actually wired in** — drip + engagement columns added to the desktop
  table, sortable headers (Lead/Nível/E-mail/Última atividade) via
  `renderSortableHeader()` (plain helper, NOT an inline component —
  react-hooks/static-components errors otherwise), drip step shown on mobile cards.
- [x] **"Mais ações" overflow menu** in the toolbar (unsubscribe/reactivate/
  archive/unarchive) — keeps the fixed bottom bar usable at 375px; buttons are
  min-h-44px on mobile and the bar wraps; feedback messages moved to their own row.
- [x] **`router.refresh()` after every successful bulk action** — previously the
  table silently kept stale rows until a manual reload.
- [x] **2027.2 cohort slug bug fixed** — bulk assign wrote `revalida-2027-2`, but the
  real slug is `revalida-20272` (no hyphen; see lib/magnet/links.ts). Server now
  validates against `VALID_TARGET_COHORTS`; the modal slug is corrected. Assigning
  2027.2 NEVER worked before this.

### Deliberately deferred (with reasons — not just "later")

- **Bulk capture method change** (3A): rewrites acquisition attribution history that
  the funnel panel reports on; no concrete need articulated. Revisit only with a use case.
- **All of 3B (score/weak-specialty/tier overrides)**: score + weakSpecialties + tier
  are derived from real quiz answers; manual overrides break provenance (drip emails
  interpolate {{score}}). Tier override is open team question Q4.
- **Duplicate detection** (3C): impossible by construction — `leads_email_lower_uniq`
  unique index (schema-patch-leads.sql) means one row per email.
- **CSV import / bulk field corrections** (3C): unscoped bulk writes; needs a spec.
- **Sheets export, async reports, smart segments** (3D): external OAuth/integration
  work; CSV export covers today's need. Segments blocked on team question Q6.

---

## How to Build Phase 3+

### Step 1: Pick a feature from Phase 3A/B/C/D above

### Step 2: Follow the existing patterns

**For UI changes:**
1. Add state to `LeadsClient` (line 138–152)
2. Add handler function (follow `handleBulkMarkAsTest` pattern)
3. Add button to toolbar (lines 688–761)
4. Add modal if needed (use `ConfirmModal` or new modal component)
5. Add i18n keys to both locale files

**For server actions:**
1. Add function to `actions/leads.ts` (follow `bulkMarkAsTest` template)
2. Start with `requireLeadsRole()` and input validation
3. Use `createAdminClient()` for Supabase write
4. Return `{ success, count, errors? }`
5. Add comments explaining the drip/template/role logic

**For types:**
1. Add new fields to `LeadRow` if needed (keep in sync with `getLeadsOverview` query)
2. Add new enums/types to `lib/admin/leads.ts` (never in actions/leads.ts)

**For testing:**
1. Run `npm run build` — must compile with 0 TypeScript errors
2. Manually test in `/admin/leads` with mock data
3. Check role gating: test with non-admin user (should fail)
4. Check i18n: switch language, verify strings load

### Step 3: Commit by explicit path

```bash
git add app/src/actions/leads.ts app/src/app/admin/leads/leads-client.tsx app/src/locales/admin/*.json
git commit -m "Admin leads: Phase 3X — [description]"
git push origin main
```

### Step 4: Deploy & monitor

- Vercel auto-deploys on push
- Check Sentry for errors
- Monitor analytics: did bulk action count track correctly?

---

## File Structure

```
app/src/
├── actions/
│   └── leads.ts                           # Server actions (role-gated bulk ops)
├── app/admin/leads/
│   ├── page.tsx                           # Server component, calls getLeadsOverview()
│   └── leads-client.tsx                   # Main client component (filters, sorting, toolbar)
├── components/admin/
│   ├── lead-detail-drawer.tsx             # Read-only detail pane
│   ├── bulk-assign-cohort-modal.tsx       # Phase 2C: cohort picker modal
│   ├── bulk-resend-modal.tsx              # Phase 3A: drip-step picker modal
│   └── confirm-modal.tsx                  # Generic confirmation modal (reusable)
├── lib/admin/
│   └── leads.ts                           # LeadRow type, getLeadsOverview() query
└── locales/admin/
    ├── pt-BR.json                         # Portuguese i18n (leads section ~30 keys)
    └── en.json                            # English i18n (leads section ~30 keys)
```

---

## Testing Checklist (for future phases)

Before committing Phase 3+:

- [ ] **Build:** `npm run build` completes with 0 errors
- [ ] **Types:** No TypeScript errors in VSCode
- [ ] **Linting:** No ESLint errors (`npm run lint`)
- [ ] **Mock data:** Feature works with `NEXT_PUBLIC_USE_MOCK_DATA=true`
- [ ] **Role gates:** Non-admin user cannot call server action
- [ ] **i18n:** Strings load in both PT-BR and EN
- [ ] **Mobile:** Toolbar buttons visible + usable on 375px width
- [ ] **Accessibility:** Buttons have ARIA labels, modals are keyboard-navigable
- [ ] **Error handling:** Server error → client displays toast (not JS error)
- [ ] **Feedback:** Success/error messages appear and auto-dismiss appropriately

---

## Questions for Future Dev

Status after the 2026-07-06 Phase 3 build:

1. **Bulk unsubscribe** — ANSWERED: keep `last_emailed_at`. The drip clock runs from
   `verified_at`, so clearing it changes nothing and destroys send history.
2. **Archive vs. delete** — ANSWERED: soft delete (`is_archived`), reversible from the UI.
3. **Duplicate merging** — MOOT: `leads_email_lower_uniq` makes duplicates impossible.
4. **Tier override** — OPEN (not built): tier stays computed. Decide before building 3B.
5. **Export integration** — CSV only for now; Sheets/Slack deferred.
6. **Smart segments** — OPEN (not built): decide per-admin vs shared before building.

---

## Reference Links

- **Spec:** FREE-FUNNEL-BUILD-SPEC.md (original funnel architecture)
- **Email templates:** Email model in admin panel (leads.ts knows the template kinds)
- **Cohort system:** CLAUDE.md § Cohorts (membership window, test_date logic)
- **Role gating:** CLAUDE.md § Admin panel requirements (roles defined at schema level)

---

**End of handoff document.**  
Ready to build Phase 3+? Pick a feature and follow the patterns above.
