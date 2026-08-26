# Universal Headroom Product Experience

Task: "HEADROOM — UNIVERSAL PRODUCT EXPERIENCE — PROTOTYPE-QUALITY UI + BEST-IN-CLASS USABILITY + GENERALIZED COMPANY RENDERING." Scope explicitly excluded: Phase C0/Phase C analyzer, new ERP connectors, full auth/RBAC, solver/financial-core semantic changes.

## A. Executive result

Headroom is now one product shell (`components/GlobalBrand.tsx` + `app/[companyId]/layout.tsx`) rendering identically for any company through the same read model (`lib/covenant-overview-builder.ts`) and the same components (`components/CovenantOverview.tsx`, `components/DashboardClient.tsx`). The duplicate-branding bug is fixed at its root cause. The Dashboard now leads with the business answer (financial position → capacity → needs attention) before contractual detail, with basket rows tiered (primary/conditional/exceptions) and sorted by real urgency, a real Needs Attention panel, and a client-side find/filter — all built from already-computed data, zero new calculation logic in React. A new unseen-company test fixture (`tests/unseen-company-ui.test.tsx`) proves the UI generalizes to a company that is neither Coherent nor Matthews. Verdict: see §110 below.

## B. Duplicate-logo fix

**Root cause**: `app/layout.tsx` (root layout, wraps every route) rendered a full `.site-header` with "Headroom" branding unconditionally. `app/[companyId]/layout.tsx` (the company-scoped shell) *also* rendered its own full `.site-header` with "Headroom" + company name + tabs. Next.js nests layouts, so every company page rendered both — visible in the pre-fix screenshot as two stacked white bars both saying "Headroom."

**Fix**: extracted the shared brand markup into `components/GlobalBrand.tsx`. The root layout now renders *no* header of its own — just the html/body/font wiring. `app/[companyId]/layout.tsx` keeps its own compact header (this is the one true instance for every company page). Every other route that isn't wrapped by a company layout (root picker, delete-confirmation, new-company wizard, admin, onboarding wizard entry pages) now renders `<GlobalBrand />` explicitly. Verified visually for Coherent, Matthews, and the root picker (screenshots below) — exactly one "Headroom" per page.

## C. Product shell

```
<html> (app/layout.tsx — no header, font vars only)
  root picker (app/page.tsx) — <GlobalBrand/> + company list, OR
  <GlobalBrand/> + delete/new/admin pages, OR
  app/[companyId]/layout.tsx — <GlobalBrand>-equivalent compact header + company context + PrimaryTabs
    → Feeds / Dashboard / Simulate / Docs / Ledger (app/[companyId]/*)
```
"Dashboard" is used everywhere (route segment, tab label, component names); no visible "Position" terminology remains anywhere in `app/**`/`components/**`.

## D. Prototype design system

Unchanged this task (established in the prior "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" task, re-verified here): paper background, dark-navy capacity band, serif (Newsreader) section citations, monospace (Spline Sans Mono) numbers, sans (Public Sans) labels, tight rows, `app/globals.css`'s existing token set (`--navy`, `--green`, `--amber`, `--red`, `--line`, `--font-serif/mono/sans`). New tokens added this task (`.family-summary`, `.tier-label`, `.attention-item`/`.attention-high`/`.attention-medium`, `.dashboard-filter-bar`/`.dashboard-filter-search`) reuse the same palette and type scale — no new colors or fonts introduced.

## E. Dashboard hierarchy

Reordered `components/DashboardClient.tsx` (the real Dashboard) and `components/CovenantOverview.tsx`'s `CovenantOverviewView` to the task's required order:

1. **Headline financial position** (cash/debt/leverage stat strip) — moved above the capacity band.
2. **Headline capacity** (navy band: secured/unsecured/RP).
3. Editable LTM financials card (the live-reflow mechanism for #1/#2 — kept adjacent to what it drives).
4. **Needs attention** (new — §H).
5. **Covenant family summaries + detailed rows** (tiered — §J).
6. **Capital structure**.
7. **Near-term maturities** / recent-changes context.

## F. Financial summary

Unchanged data source (`lib/financial-core/metrics.ts` via `financialPosition.headlineMetrics`, unmodified) — cash, gross/net debt, total liquidity, net/secured leverage, interest coverage, EBITDA margin, all monospace, tabular, with explicit `NOT_AVAILABLE`/`REVIEW_REQUIRED` states already in place pre-task. No fabricated values found or introduced.

## G. Capacity band

Unchanged this task: navy band shows secured/unsecured/RP capacity with binding document + section inline, `Not modeled`/`Review required` explicit states (never `$0`), confirmed live for both companies (§Z/§AA).

## H. Needs Attention

New: `lib/covenant-overview-builder.ts`'s `buildAttentionItems`, added to `CovenantOverviewCore.attentionItems`, rendered by the new `AttentionList` component (`components/CovenantOverview.tsx`). Every item is read off an already-computed signal, never invented:

- `financialPosition.warnings` (unmodified `position-service.ts` — `STALE_INPUT`/`DISPUTED_FACT`/`MISSING_ASSUMPTION`, already real and categorized before this task).
- A family with `counts.reviewRequired > 0` → one summarized line per family.
- `financialPosition.maturities.dueWithin12Months > 0` → the real next-maturity fact.
- A `CAPACITY` row genuinely at `currentCapacity === 0` (not the headline's own binding constraint) → "no capacity currently available under its own formula," the same honest locked-reason text already used for red capacity bars.

Severity-sorted (HIGH before MEDIUM), capped at 8 items to stay compact. No invented "near-limit" percentage — the codebase has no per-basket usage tracking to honestly compute one, so none was fabricated (a known, pre-existing, documented limitation — see §AI).

## I. Covenant-family hierarchy

Unchanged grouping (`FAMILY_ORDER` in `components/CovenantOverview.tsx`, unmodified): Indebtedness → Liens → Financial Covenants → Restricted Payments → Investments → Asset Sales → (further families in the existing ontology order). New this task: each family now shows a one-line **family summary** (`familySummaryLine` — the top-ranked row's name/capacity/binding document+section, a presentation pick over already-ranked data, not a new calculation) directly under the family header, before the row table.

## J. Basket hierarchy

New: `RowTier = "PRIMARY" | "CONDITIONAL" | "EXCEPTION"`, computed by `assignTiers` in `lib/covenant-overview-builder.ts`. Rule (generalized, never keyed on provision code or basket name):

- `UNMODELED`/`NOT_TESTED` rows → always `EXCEPTION` (present, never hidden, just visually lighter).
- `RATIO` rows → always `PRIMARY` (a financial-covenant test is inherently decision-relevant).
- `CAPACITY` rows that are `MODELED`/`REVIEW_REQUIRED`: the top 3 by real evaluated capacity (unlimited counts as top) → `PRIMARY`; the rest → `CONDITIONAL`.

Rendered by `TieredRows` (`components/CovenantOverview.tsx`) as a subtle uppercase sub-label ("Primary paths" / "Conditional / special-purpose paths" / "Exceptions / other paths"), inserted only within the healthy-`AVAILABLE` bucket where triage actually matters — a binding/locked/review-required row is already distinguished by its own status pill. Nothing is hidden or default-collapsed (§33 requirement).

## K. Ratio rows

Unchanged presentation (pre-existing `RatioRowView`/`RatioBar`): current/limit/headroom, tone-colored bar for "at or below a maximum" ratios, text-only (no fabricated scale) for "at or above a minimum" ratios like interest coverage.

## L. Status system

`RowStatus` (`MODELED`/`REVIEW_REQUIRED`/`NOT_TESTED`/`UNMODELED`), `BindingState` (`BINDING`/`AVAILABLE`/`REVIEW_REQUIRED`/`NOT_EVALUABLE`/`UNMODELED`), `ReviewStateLabel` (`VERIFIED`/`UNVERIFIED`/`DISPUTED`/`NOT_TRACKED`) unchanged this task, all already mapped to customer-facing labels (`statusLabel`/`bindingLabel`/`reviewLabel` in `components/CovenantOverview.tsx`). New this task: `lib/status-labels.ts` centralizes the same treatment for `OnboardingStatus`, previously leaked raw (`ACTIVE_WITH_LIMITATIONS` shown verbatim in a `Chip` on two onboarding pages) — see §Y.

## M. Fail-closed UX

Unchanged discipline, re-verified this task for Matthews and the new unseen fixture: no row or headline figure ever renders `$0`/`Unlimited`/`Clear` for an unknown state. `VERIFIED` keeps its "— legal review" qualifier wherever shown.

## N. Capital structure

Unchanged (`components/DashboardClient.tsx`'s capital-structure card, pre-existing `financialPosition.capitalStructure.facilities`) — instrument/type/secured-or-not/document/amount, real data.

## O. Maturity view

Unchanged this task: compact list (next maturity, due within 12/24/36 months). **Not built**: the horizontal/vertical visual timeline §35 describes — real gap, see §AI.

## P. Simulate

Unchanged this task (built in the prior task): action picker (debt/dividend/investment/asset sale), slider + numeric input bound to the real engine, secured/unsecured toggle mapped to the real `simulateDebtIncurrence(..., secured, solverContext)` call, verdict band, per-document breakdown, allocation waterfall, pro forma ratio table.

## Q. Docs

Unchanged this task: per-document capacity trace + per-document EBITDA definition (`getEbitdaDefinitionsByDocument`), "Not sourced yet" for a document with none.

## R. Ledger

Unchanged this task: running basket ledger, RP-pool band, manual entry form.

## S. Feeds

Unchanged this task: real, DB-backed review queue (approve/dismiss), applied-from-filings history.

## T. Mobile

Not re-tested this task (no dashboard layout changes affecting the `@media (max-width: 860px)` rules were made; the new filter bar and Needs Attention card use the same `Card`/`button-row` primitives that already reflow correctly). Carried forward from the prior task's verified mobile screenshot. Flagged as **unverified-this-session** rather than re-claimed — see §AI.

## U. Empty/loading/error

Empty state: `CovenantFamiliesView` already shows "Covenant model not initialized" for zero families (unchanged); new this task, `FamilySectionView` shows "No rows modeled in this family yet" for a family that exists only via an advisory note (§97's "one clean state row," not an empty heading). Loading: still Next.js's default streaming (no explicit skeleton components) — real gap, §AI. Error: unchanged — no Prisma/stack-trace text found in any customer-facing page.

## V. Accessibility

Not independently audited with tooling this task. `AttentionList` items use both a left-border color *and* text (never color-only). The new filter buttons and search input use real `<button>`/`<input>` elements with `aria-label`. No tooltip/keyboard-shortcut work (§55/§58) was added — real gap, §AI.

## W. Search/filter/jump-nav

New: `CovenantFamiliesView` now owns a find field + 5 status chips (All/Available/Used/Binding/Review required), pure client-side filtering of already-loaded rows (`rowMatchesFilter`/`rowMatchesQuery`), default `ALL` (nothing gated by default), families with zero matching rows hidden with an explicit "no rows match this filter, clear to see everything" message rather than silently disappearing. Verified interactively (search for "Ratio Debt," filter by "Binding") — screenshots below. **Not built**: the sticky family jump-nav (§32) — real gap, §AI.

## X. Dashboard read model

`CovenantOverviewCore` (`lib/covenant-overview-builder.ts`) now carries `attentionItems: AttentionItem[]` in addition to the pre-existing `headlineMetrics`/`securedCapacity`/`unsecuredCapacity`/`warnings`/`covenantFamilies`; each `OverviewRow` now carries `tier: RowTier`. Both are pure, deterministic derivations of already-computed fields — no new I/O, no new engine calls. `DashboardClient` still re-runs this same pure builder client-side on every financials edit (zero server round-trip), unchanged from the prior task.

## Y. Generalization audit

Searched `app/**`/`components/**`/`lib/**` (excluding `scripts/`, `prisma/seed-data.ts`, `tests/`, `docs/` — DATA_ONLY/TEST_ONLY by construction) for `coherent`/`matthews`/`google`/known IDs. Findings:

| Occurrence | Classification | Action |
|---|---|---|
| `lib/coherent.ts`'s `companyId: string = DEFAULT_COMPANY_ID` default on every loader | **PRODUCTION_RISK** | **Fixed** — `companyId` is now required everywhere in `lib/coherent.ts`; the silent Coherent fallback is gone. Confirmed via `tsc --noEmit` that every real call site already passed an explicit id. |
| 5 legacy top-level pages (`app/position`, `app/simulate`, `app/docs`, `app/ledger`, `app/feeds`) hardcoded to Coherent via the now-removed default | **PRODUCTION_RISK** | **Removed** — fully superseded by `app/[companyId]/*`; `app/admin`'s dangling "Legacy views" links removed with them. |
| `lib/dashboard-service.ts`'s `SOLVER_CONTEXT_ENTITY_DEFAULTS` (nicer display name for Coherent's/Matthews' `incurringEntity`) | **LEGACY_COMPATIBILITY** | Left as-is — has a real, generalized fallback (`{ id: `${companyId}-borrower`, name: companyId }`) for any other company, so it degrades gracefully rather than breaking. |
| `lib/coherent.ts`'s `PROTECTED_COMPANY_IDS` (Coherent + Matthews) | **Deliberate, task-requested exception** (§79) | Kept — an explicit, minimal delete-safety allowlist, not a rendering branch. |
| Every other hit (~40 occurrences) | **DOCUMENTATION_ONLY** | Code comments explaining *why*, referencing doc filenames or the prototype reference path (`reference/headroom-coherent.jsx`) — no runtime behavior. Left as-is; two stale comments (one in `app/admin/page.tsx`, one in `tests/synthetic-company.test.ts`) were corrected since they referenced the just-removed `DEFAULT_COMPANY_ID`/legacy pages. |

`scripts/populate-coherent-*.ts`/`scripts/populate-matthews-*.ts`/`prisma/seed-data.ts` are **DATA_ONLY** by design (population scripts for two specific real companies' reviewed legal data) — explicitly out of scope ("do not rewrite reviewed legal data").

## Z. Coherent result

Verified locally (screenshots below): one Headroom logo, prototype typography/tabs/background intact, financial summary → capacity band → editable inputs → **Needs attention (4 real items: locked lien baskets + one missing-assumption warning)** → tiered family sections (Primary/Conditional labels visible in Indebtedness and Liens) → capital structure. All 16+6+6+3+1+1 basket/ratio rows from the prior task remain fully accessible (nothing lost while adding hierarchy). Search for "Ratio Debt" and the "Binding" filter both verified live-interactive.

## AA. Matthews result

Verified locally: identical shell/components, capacity band honestly shows `Not modeled`/`Not modeled`/`Not tested`, Needs Attention shows 5 real items (1 missing-assumption + 4 genuinely-locked liens, all real formula-derived facts), tier labels correctly group its smaller row set, no fabricated values anywhere.

## AB. Partial-company result

No partial-onboarding company exists in the local dev database (only Coherent + Matthews are seeded there). Production has real partial companies from prior sessions (`apple`, `apple-mt979e4i`, `gateway-live-test-co`, `live-acceptance-test-co-autonomous-retrieval-v1`) — checked post-deploy against live production rather than fabricated locally; see the Final Report's live-verification section for the actual observed state (an `ONBOARDING`-status company routes straight to the onboarding wizard via `app/[companyId]/layout.tsx`'s existing `onboardingStatus === "ONBOARDING"` gate, unchanged this task, and shows real stage-by-stage progress, not a fabricated "looks done" dashboard).

## AC. Generic unseen fixture

`tests/unseen-company-ui.test.tsx` — a company that is neither Coherent nor Matthews (`unseen-fixture-co`), built entirely in-memory (no DB) by calling the same pure functions the real pages call (`getFinancialPosition`, `buildCovenantOverview`, both unmodified), rendered through the same `CovenantOverviewView` component. 7 assertions, all passing: same CSS classes as Coherent/Matthews; a real $150M capacity rule in Indebtedness; an honestly-unmodeled Liens item (never `$0`); a ratio rule (MODELED) and a review item (REVIEW_REQUIRED) in Financial Covenants, both routed purely by `formulaType`, never a hardcoded provision code; the review item surfaced in Needs Attention; headline capacity honestly `NOT_MODELED` (this fixture's document has no capacity formula); real financial-core-computed net debt ($920M). This proves UI/read-model generalization — it does **not** prove contract-analyzer generalization (§73's own caveat, and Phase C was explicitly out of scope for this task).

## AD. Autonomous onboarding readiness

Unchanged this task (audit only, per §68's "do NOT implement Phase C analyzer"). The UI/read-model boundary already supports the target flow without modification: `app/[companyId]/onboarding/*` is a real, working stage sequence (sources → documents → review → financials → facilities → activate), each stage backed by real Prisma-persisted state, and the exact same `app/[companyId]/dashboard` route renders whatever canonical state promotion has produced so far — no separate "onboarding preview" component exists or is needed.

## AE. Gap matrix

| Capability | Today | Required next |
|---|---|---|
| Company identity resolution (name → issuer/ticker/CIK) | MANUAL_REVIEW_REQUIRED — `app/companies/new` takes ticker/CIK as plain optional text fields; no auto-resolution | Public-company identity lookup (Phase C-adjacent, out of this task's scope) |
| Public filing discovery (10-K/10-Q/8-K) | AUTOMATIC_IF_SOURCE_AVAILABLE — real EDGAR connector (`lib/connectors/edgar-connector.ts`), exercised live by `tests/connectors/edgar-*.test.ts` this session's suite | Broaden beyond 10-K/10-Q/8-K to exhibit-level credit-agreement/indenture discovery (partially real already per `scripts/populate-*-financial-provenance.ts` headers) |
| Document ingestion/chunking | AUTOMATIC_TODAY once a source is connected (`app/[companyId]/onboarding/documents`) | — |
| Extraction candidates → structured rules | MANUAL_REVIEW_REQUIRED — `app/[companyId]/onboarding/review` requires human approve/edit/reject before promotion | Phase C analyzer (explicitly out of scope) |
| Covenant inventory / definitions / cross-references | MANUAL_REVIEW_REQUIRED (same review gate) | Phase C analyzer |
| Coverage/promotion to canonical state | AUTOMATIC_TODAY once approved (`lib/onboarding/promotion.ts`, unmodified) | — |
| Dashboard rendering from canonical state | AUTOMATIC_TODAY, company-agnostic (this task's own proof, §AC) | — |

This table intentionally repeats the shape of gaps already documented in `docs/matthews-international-onboarding.md`/`docs/targeted-ontology-closure-test.md` from prior work — nothing here was newly discovered or newly closed this task; it is presented for the task's own requested §106/§72 audit.

## AF. Tests

New this task: `tests/unseen-company-ui.test.tsx` (7 tests, generic-fixture UI generalization proof, §AC). Updated: `tests/covenant-overview-ui.test.tsx` (added the required `attentionItems: []` field to its empty-state fixture), `tests/synthetic-company.test.ts` (corrected a stale comment referencing the removed `DEFAULT_COMPANY_ID`). See the Final Report for the full suite's pass count.

## AG. Performance

No new per-row database or solver calls were introduced — `attentionItems`/`tier` are pure post-processing over rows the builder already produces in one pass per company per request (same `buildCovenantOverview` call site, same call count as before this task). Not independently profiled with a dedicated timing harness this session; no regression is expected given the change is O(rows) in-memory sorting/filtering, not new I/O.

## AH. Production deployment

See the Final Report (§29-32 there) for the actual merge SHA, Vercel deployment ID, and live-verification results — performed after this doc was drafted, per the established PR-to-`main` workflow.

## AI. Remaining limitations

Carried forward from the prior task (unchanged): no per-basket usage tracking, so a true fill-percentage/near-limit threshold cannot be honestly computed; citations are plain text, not deep-linked. New/reconfirmed this task, real gaps not attempted (all correctly out of a single task's scope, listed for the record rather than silently dropped):

- No visual maturity timeline (§35) — still a plain list.
- No loading skeletons (§49) — Next.js's default streaming only.
- No keyboard shortcuts (`/` to focus search, arrow/Enter navigation) (§55).
- No sticky family jump-nav (§32).
- No independent accessibility audit (contrast tooling, screen-reader pass) (§54).
- Mobile/tablet layouts not re-tested this session (no CSS breakpoint changes were made; carried forward from the prior task's verified mobile screenshot).
- Company identity resolution / autonomous filing-to-covenant pipeline remains manual-review-gated by design (Phase C, explicitly out of scope).

## AJ. Exact next task

Build the visual maturity timeline (§35) and the sticky family jump-nav (§32) — both are pure presentation over data the read model already exposes (`financialPosition.maturities`, `CovenantFamilySection[]`), require no engine/solver changes, and were the two concretely-scoped UI items from this task's spec that didn't fit this pass's budget. A second, independent candidate: a dedicated accessibility pass (contrast + keyboard nav + screen-reader labels) across the Dashboard/Simulate/Docs/Ledger/Feeds tabs.
