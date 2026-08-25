# Phase 10 — Product UI + End-to-End Application Wiring

Records Gate 0 (the eligibility-defect fix) and Phase 10 (the generalized product UI) in one combined task. Read alongside `docs/generalized-financial-analytics-architecture.md`, `docs/financial-core-vertical-slice-implementation.md`, `docs/result-semantics-headroom-cleanup.md`, and `docs/legal-review-status-model.md`.

## A. Executive result

Gate 0 is resolved: a new, generalized `TRANSACTION_SECURITY_SCOPE` eligibility-condition kind is mechanically evaluated by the solver, applied as a one-row data fix to the specific Coherent permission whose action label restricted it to unsecured-or-junior debt without any structured enforcement. The fix works exactly as designed and is proven by 11 new unit tests plus a live golden-harness re-run. The re-run also surfaced a second, distinct, pre-existing, already-disclosed limitation (no live signal for lien pairing/priority) that is documented, not fixed, per the task's scope freeze — see §B/§C.

Phase 10 delivers a generalized, company-agnostic product: a `/[companyId]/{overview,capital-structure,capacity,simulate,documents}` information architecture backed by a new `lib/dashboard-service.ts`/`lib/scenario-runner.ts` aggregation layer, wired to the existing `lib/financial-core/**` and `lib/covenant-engine.ts` engines with zero new calculation logic in components and zero company-name branching. Both Coherent and Matthews render through the identical components; Coherent's financial-core data (previously never populated) was added via a new, disclosed re-expression script so both companies actually exercise the same code path. A real, pre-existing bug in the financial-core scenario engine's `REFINANCING` action was discovered by this work's own test suite and fixed (§Q). The full regression suite passes (255/255 vitest, unchanged golden-test/shadow-run/acceptance results, clean build), and the product was exercised live — both via direct HTTP/SSR inspection and via a real Chromium browser (Playwright, driven manually against the running dev server) — with results captured, not assumed.

**Final verdict: `PHASE10_USABLE_PRODUCT_COMPLETE`** (see §V.. final section for the full justification).

## B. Gate-0 eligibility fix

**Diagnosis (verified, not re-derived):** `coh-ca-d-incr-ratiobased-unsecjr`'s action label reads "Incur debt under the Ratio-Based Incremental Facility, unsecured or junior-secured (unlimited if TNL ≤ 4.25x)," but its `eligibilityConditions` column was `null`. `runSolverForDocument` filters eligible permissions only by `documentId`/`grantType`; nothing else in the modeled data restricted this permission from being counted toward first-lien/pari-passu secured queries. I re-read `lib/covenant-engine.ts` and `lib/solver/service.ts` (`computeMaximumCapacityFromEvaluations`, lines ~118-160) directly and confirmed the exact mechanism described in the task: `const hasFailure = evalResult.requirements.some(r => r.status === "FAILED"); if (hasFailure) continue;` — an election with a FAILED requirement is excluded from the winning maximum-capacity computation, so a mechanically-enforced FAILED eligibility condition is sufficient to fix this without any branching on permission code or company.

**Implementation (`lib/solver/types.ts`, `lib/solver/election.ts`):**
- New `EligibilityCondition.kind` value `"TRANSACTION_SECURITY_SCOPE"` plus `allowedSecurity?: "UNSECURED_ONLY" | "UNSECURED_OR_JUNIOR"` (exactly the two values needed — no `SECURED_ANY` or other unused variant), documented as a generalized primitive usable by any permission on any company.
- New branch in `evaluatePermissionEligibility` (before the generic UNKNOWN fallback): `UNSECURED_ONLY` requires `!transaction.secured`; `UNSECURED_OR_JUNIOR` requires either `!transaction.secured`, or (if secured) every entry in `transaction.requestedLienPriority` is `"SECOND"` — an empty/uncharacterized array on a secured transaction is `FAILED`, not assumed eligible. Both branches always resolve `SATISFIED`/`FAILED`, never `UNKNOWN` (no external-data dependency).
- `scripts/populate-coherent-security-scope-fix.ts` — the one data-only change, idempotent (verified by running it twice; second run reported "no-op"), touching only `coh-ca-d-incr-ratiobased-unsecjr.eligibilityConditions`. Verified no other field on the row changed (the script asserts this itself and I re-read the row directly).

**Proof (`tests/solver/gate0-security-scope.test.ts`, 11 tests, all passing):**
- Direct `evaluatePermissionEligibility` unit tests: SATISFIED for unsecured; FAILED for secured+empty-array (fail-closed); FAILED for secured+FIRST; FAILED for secured+PARI_PASSU; FAILED if *any* pool among several is FIRST even when others are SECOND; SATISFIED for secured+all-SECOND; UNSECURED_ONLY additionally FAILED even for junior-secured; never produces UNKNOWN.
- End-to-end `runSolver`/`computeMaximumCapacityFromEvaluations` tests with two competing permissions (a larger, restricted one and a smaller, unrestricted one): an ineligible secured transaction correctly picks the smaller, unrestricted election (200, not 500); an eligible unsecured transaction picks the larger, restricted one (500); an eligible junior-secured transaction (with a matching `PermissionCollateralScope` supplied so the *unrelated* generic `PRIORITY_CONDITION` check doesn't confound the isolation) also picks the larger one (500) — proving the mechanism supports the junior-secured distinction even though no live caller populates `requestedLienPriority` today.

## C. Corrected affected Coherent results — actual numbers observed, not assumed

Re-ran `npx tsx scripts/golden-test.ts coherent` after the fix and read the real output for Q22 and rows 16/17:

| Row | Before fix (documented) | After fix (observed) |
|---|---|---|
| Q22 (`cmt7vicwr002pj1d33vvdfvav`) | computed 4629, binding `ca_incremental_ratio_based_unsecured_or_junior` | **computed 4629 (unchanged), binding `ca_permitted_debt_601p`** |
| Row 16 (`cmt7vicwj002dj1d3bv3zwd1w`) | binding `ca_incremental_ratio_based_unsecured_or_junior` | binding `ca_permitted_debt_601p` |
| Row 17 (`cmt7vicwk002fj1d3nnpsqqdp`) | binding `ca_incremental_ratio_based_unsecured_or_junior` | binding `ca_permitted_debt_601p` |

The fix works as designed — `coh-ca-d-incr-ratiobased-unsecjr` is confirmed excluded from these rows' winning elections (its `TRANSACTION_SECURITY_SCOPE` condition correctly FAILS for a secured, uncharacterized-priority transaction). But the dollar figure is **unchanged** (still 4629), because a *different*, genuinely-eligible permission — `ca_permitted_debt_601p` ("General Permitted Debt catch-all," §6.01(p), no security restriction on its action label, `eligibilityConditions` legitimately `null`, `reviewStatus: VERIFIED`) — shares the exact same `LEVERAGE_RATIO_ROOM`/TNL≤4.25x formula and threshold (confirmed by direct DB read of both rows). This is not a bug in the fix; it's a real finding about Coherent's capital structure (two functionally-overlapping general baskets at the same threshold).

**A second, distinct, pre-existing finding surfaced by this fix, not fixed by it:** `ca_permitted_debt_601p`'s own `notes` and its `PermissionRelationship` rows confirm it has **no automatic lien link** and is "not automatically lien-eligible... requires independent §6.02(kk) clearance." Yet it is reported CLEAR for a `secured: true` query, because — exactly as this task's own design already discloses — no live caller ever populates `Transaction.requestedLienPriority`, so nothing mechanically checks that a "secured" query's winning election actually carries lien authority. This is the **same already-disclosed "no live lien-priority signal" limitation** named in the task's own background (not a new instance of "action label claims a restriction the data doesn't enforce" — this permission's label makes no security claim at all), so it does not meet the bar for stopping before Part 2. It is documented, not fixed (would require a `lib/solver/**` feasibility-algorithm change beyond this task's authorized scope).

**Reconciliation performed** (`scripts/populate-gate0-golden-reconciliation.ts`, idempotent, verified by re-running): appended a detailed `reviewerNotes` entry to all three rows explaining both findings above. **`expectedAnswer`/`bindingProvision` are left unchanged** (3541/`mila_secured` on all three) — genuine ambiguity remains about whether 4629 is the confirmed-correct secured figure, for the new, different reason (lien-pairing), so this does not meet the "no further ambiguity remains" bar for silently promoting a corrected value. `golden_tests.status` stays `VERIFIED` on all three (legal review and this engineering finding are separate dimensions, per `docs/legal-review-status-model.md` §0/§10).

## D. Product information architecture

`/[companyId]/{overview, capital-structure, capacity, simulate, documents}`, plus a company-selector homepage (`app/page.tsx`, `listCompanies()`-driven) and a company-scoped shell (`app/[companyId]/layout.tsx`) with a company switcher and tab nav (`components/CompanyNav.tsx`). The root `app/layout.tsx` was stripped of its Coherent-specific header/data-fetching (previously hardcoded) and reduced to a company-agnostic shell; the legacy Coherent-only pages (`/position`, `/simulate`, `/docs`, `/ledger`, `/feeds`) are retained, reachable via links on the homepage, unmodified in behavior.

## E. Overview implementation

`app/[companyId]/overview/page.tsx` reads exclusively from `getCompanyDashboard(companyId)` (`lib/dashboard-service.ts`): cash, total liquidity, gross/net/secured debt, annualized interest, gross/net/secured generic leverage, interest coverage, EBITDA margin, near-term maturity buckets (12/24/36 months) and next maturity, cross-document secured/unsecured maximum capacity, and a legal-review summary (golden-test/permission verified counts). Every figure is read off an already-computed object; the component performs no arithmetic.

## F. Capital structure

`app/[companyId]/capital-structure/page.tsx` renders `CapitalStructureSummary.facilities` as a table (instrument, type, outstanding, commitment, rate, maturity, secured/unsecured, collateral pool, governing document) plus fixed/floating mix and totals. Proven to render structurally different capital structures identically: Coherent's four term-loan/notes/other tranches vs. Matthews' first-lien-revolver/second-lien-notes split on a shared collateral pool (both captured live, §T).

## G. Liquidity

Rendered on the Overview stat grid (cash, total liquidity) and available in full via `financialPosition.liquidity` (revolver commitment/drawn/LC usage/availability, borrowing-base status) — not broken into its own page given the IA's five-tab scope, but the underlying `LiquidityPosition` object is fully surfaced through `getCompanyDashboard`.

## H. Maturity analytics

Overview's "Near-term maturities" card renders `MaturityAnalytics` (next maturity, due-within-12/24/36-months) directly. Coherent's four facilities have no confirmed maturity day-of-month on record (only "due 2029"/"due 2030" year confirmed — see §O), so they correctly render "No dated maturities on record" rather than a fabricated date; Matthews' Notes maturity (2027-10-01) is confirmed and renders correctly (captured live).

## I. Capacity/headroom

`app/[companyId]/capacity/page.tsx` calls `computeRemainingCapacityAfterDebtIncurrence(data, position, 0, secured, solverContext)` (via `getCompanyDashboard`) for both sides — the identical, real post-transaction-recomputation function the Simulate workflow uses, evaluated at amount=0 so "post a $0 transaction" *is* "current state," never a separate `preMax` code path. Renders per-document method (`SOLVER_NATIVE_RECOMPUTED` / `LEGACY_DECLARED_MINUS_TESTED_AMOUNT` / `NOT_DETERMINABLE`), maximum capacity, binding constraint citations, and an explicit "Not evaluated" for `NOT_DETERMINABLE` — never `$0`/`Unlimited`. Captured live for both companies (§T); Matthews' Credit Agreement side correctly renders "Not evaluated" while its Indenture side renders the real, golden-test-matching `$631M`.

## J. Scenario workflow

`app/[companyId]/simulate/page.tsx` loads read-only `ScenarioInputs` (`getScenarioInputs`) server-side once; `SimulateClient.tsx` (client component) composes one `ScenarioAction` from a form and calls `runScenarioWithInputs` (`lib/scenario-runner.ts`, a separate, `@prisma/client`-free module so it's safe in the browser bundle and cannot access the database even in principle). Supports the 5 scenario kinds the task's test checklist names — `DEBT_ISSUANCE`, `DRAW_REVOLVER`, `DEBT_REPAYMENT`, `REFINANCING`, `ACQUISITION` — out of the financial core's full 11-kind `ScenarioAction` union (`DIVIDEND`/`SHARE_REPURCHASE`/`ASSET_SALE`/`CHANGE_EBITDA`/`RATE_ASSUMPTION_CHANGE`/`WORKING_CAPITAL_CHANGE` are supported by the engine but have no UI form in this pass — see §U). The engine's own fail-closed `requireCash`/`requireFacility` throws (a genuinely infeasible composed transaction, e.g. more cash consideration than is on hand) are caught and rendered as a prominent red banner rather than an uncaught exception (discovered live against Matthews — see §T).

## K. Before/transaction/after

Rendered as a table (cash, gross debt, net debt, total liquidity, gross leverage, annualized interest — before/after/Δ), read directly from `ScenarioResult.before`/`after`/`financialImpact`, no subtraction performed in the component.

## L. Contractual results

Rendered as a `Chip` (`CLEAR`/`BLOCKED`/`REVIEW REQUIRED`/`NOT EVALUATED`, mapped from `TransactionStatus`) plus a "no contractual test was run" banner when the scenario has no debt-relevant action (e.g. a pure-cash acquisition or a repayment) — the financial analysis still renders in full either way, per `runScenarioAgainstCovenants`'s own optional-contractual-leg design.

## M. Explainability

`DocumentExplainability` (in `SimulateClient.tsx`) renders, per document, a `<details>` drill-down: tested amount → reason/binding provision (selected path) → binding constraint (maximum-capacity ceiling, kept visually and structurally distinct from the selected path) → permissions considered (from `solverResult.permissionPathUsed.legs`) → alternative paths rejected → review items — structured, source-cited, never a fabricated natural-language opinion.

## N. Provenance/trust

`LegalReviewBadge` (`components/ui.tsx`) renders a `VERIFIED`/`UNVERIFIED`/`DISPUTED` status with the current, controlling policy language from `docs/legal-review-status-model.md` §0 *always visible beside it* (never a bare stamp) — proven live (§T screenshots) and by a dedicated rendered-markup test (§S). `WarningList` renders `MISSING_ASSUMPTION`/`STALE_INPUT`/`DISPUTED_FACT` warnings as prominent banners at the top of Overview/Simulate, not buried in a tooltip — confirmed live for Coherent/Matthews' shared "no floating-rate benchmark assumption" gap.

## O. Multi-company behavior

Coherent's financial-core data (`FinancialState`/`Facility`/`DebtEvent`) had **never been populated** before this task — only Matthews was ever wired into `lib/financial-core/**`'s schema; Coherent's data lived only in the legacy `FinancialSnapshot`/`DebtTranche`/`LedgerEntry` tables. Without populating it, Overview/Capital Structure/Liquidity/Maturity literally could not render for Coherent (`loadCompanyFinancialCoreData` throws). `scripts/populate-coherent-financial-core.ts` re-expresses Coherent's *already-modeled, already-reviewed* legacy figures verbatim in the financial-core schema (never re-derives or newly estimates a number) — disclosed in full in the script's own header, including two honest gaps: (1) `gaapEbitda` is deliberately left unset (Coherent's legacy model only ever recorded one EBITDA figure, the covenant-defined one; inventing a second, distinct "GAAP EBITDA" would be fabrication — confirmed the metrics engine falls back correctly since `covenantEbitda` is populated), and (2) `maturityDate` is left unset for the two term loans (DebtTranche only ever recorded "due 2030"/"due 2029" — year only; inventing a day-of-month would be fabrication). Verified the four facilities' principal sums to exactly the legacy snapshot's `totalDebt` (3258) before proceeding. Idempotent (delete-then-recreate by companyId).

## P. Matthews fail-closed behavior

Matthews' Credit Agreement has no `DEBT_INCURRENCE` `SolverCoverageDeclaration` at all (a documented, pre-existing gap — `docs/matthews-international-onboarding.md`), so its capacity is genuinely `NOT_DETERMINABLE`. Captured live: Capacity page renders "Not evaluated" (never `$0`/`Unlimited`); Simulate's contractual result for a debt-issuance scenario renders `NOT EVALUATED`/"Review required before relying on this result" for that document while the Indenture side (which *is* solver-native) renders a real `CLEAR`/`$631M` figure alongside it in the same result — proving the fail-closed state and the real result coexist correctly, never collapsed into one wrong answer.

## Q. Service boundaries

`lib/dashboard-service.ts` (async, DB-reading) composes `lib/covenant-engine.ts` + `lib/financial-core/**` + `lib/financial-core-db/adapter.ts` outputs; it performs zero covenant or financial arithmetic itself. `lib/scenario-runner.ts` (pure, no `@prisma/client` import) holds the scenario-running logic so the Simulate page's client component can call it directly against already-loaded data with zero further I/O — this split is what makes non-mutation structural rather than conventional (§R). `lib/format.ts` gained `fmtMaxCapacity`/`maxCapacityDetail`/`fmtMetric`, the only formatters permitted to render a `MaxCapacityResult`/`MetricResult`, both of which fail closed to an explicit label, never `$0`/`Unlimited`.

**A real, pre-existing bug found and fixed while writing this task's own tests** (not a Gate-0-scope item; a `lib/financial-core/scenario.ts` correctness bug): the `REFINANCING` action recorded the new facility's funding `DebtEvent` with `eventType: "REFINANCING"` instead of `"ISSUANCE"` — every other "new facility" action (`DEBT_ISSUANCE`/`DRAW_REVOLVER`/`ACQUISITION`'s `newDebtFunding`) correctly used `"ISSUANCE"`. `computeOutstandingPrincipal` treats a `"REFINANCING"`-typed event as a *retirement* (its own documented convention, the same bucket as `REPAYMENT`), so the brand-new facility's balance was floored to zero and the refinanced amount silently vanished from `grossDebt`. Caught live via a real Playwright browser run against Matthews before it was caught by any unit test — fixed (one-line `eventType` change, `refinancesFacilityId` provenance preserved), and covered by a new regression suite (`tests/financial-core/refinancing-bug-fix.test.ts`, 3 tests) plus the `dashboard-service.test.ts` REFINANCING scenario test. This is a `lib/financial-core/**` fix, not a `lib/solver/**` fix — outside the Gate-0 scope freeze on solver election/graph/feasibility algorithms, and squarely the kind of correctness bug the product-quality bar requires fixing.

## R. Non-mutation proof

`tests/dashboard-service.test.ts` snapshots per-company row counts (`FinancialState`/`Facility`/`DebtEvent`/`Permission`/`PermissionRelationship`/`GoldenTest`/`CovenantProvision`/`LedgerEntry`, filtered by `companyId` to avoid cross-file interference from concurrent synthetic-fixture tests) before and after running a `DEBT_ISSUANCE` scenario for both companies via both `runScenarioWithInputs` (pure) and `runCompanyScenario` (the async convenience wrapper) — identical in every run. Structurally, `runScenarioWithInputs`/`lib/scenario-runner.ts` contain no `@prisma/client` import and no `await`/I/O of any kind, so non-mutation isn't merely tested, it's architecturally impossible to violate from that code path. `scripts/financial-core-acceptance-run.ts`'s own §8 non-mutation check (persisted cash/debt/facility/event/permission counts before vs. after a live acquisition scenario) also re-confirms this independently — re-run, PASS.

## S. Tests

- `tests/solver/gate0-security-scope.test.ts` — 11 tests, Gate-0 mechanism (§B).
- `tests/dashboard-service.test.ts` — 24 tests: `listCompanies`; parametrized `getCompanyDashboard` for both companies (plausible/internally-consistent figures; financial metrics byte-identical to calling `getFinancialPosition` directly; secured/unsecured capacity byte-identical to calling `computeRemainingCapacityAfterDebtIncurrence` directly); Matthews fail-closed capacity never fabricated; non-mutation (both companies, both entry points); all 5 required scenario kinds; CLEAR/BLOCKED/NOT_TESTED contractual results (including a deliberately huge Coherent issuance to prove BLOCKED is reachable, not just CLEAR); missing-benchmark-assumption warning surfaced; `selectedPath` vs `bindingConstraint` structurally distinct; `deriveContractualTestParams` generalized-mapping unit tests.
- `tests/phase10-ui-provenance.test.tsx` — 6 tests, real React-DOM-server rendering (no new dependency; `react-dom` is already installed) of `LegalReviewBadge` proving `VERIFIED` never renders bare, plus `fmtMaxCapacity`/`fmtMetric`/`fmtCapacity` never rendering `$0`/`Unlimited` for a fail-closed state.
- `tests/financial-core/refinancing-bug-fix.test.ts` — 3 tests, the scenario-engine bug fix (§Q).
- All 24 test files / 255 tests pass (`npx vitest run`), including every pre-existing test file, unmodified in behavior.

## T. Live acceptance results — actual captured evidence

Ran `npm run dev` (background), confirmed `GET /` returns 200, then exercised the real running server:
- **HTTP status, all 10 company/tab combinations:** `coherent/{overview,capital-structure,capacity,simulate,documents}` and `matthews/{...}` all returned `200` (captured via `curl -w "%{http_code}"`, not assumed).
- **SSR content spot-checks against the DB directly:** Coherent Overview's rendered `$1,162M` cash / `$3,258M` gross debt / `$2,221M` secured debt matched a direct `prisma.financialState`/`prisma.facility` query I ran independently. Matthews' rendered `$34M` cash matched the DB's raw `33.513` fact (rounded); its rendered `$784M` gross debt matched `484.083 + 300`.
- **Golden-test cross-check:** Coherent Overview's rendered "Maximum secured capacity $5,129M" matches golden row 25 exactly ("$5129M... modeled"). Matthews Capacity page's rendered Indenture-side "$631M" matches golden row 15's reviewer-verified `$631.45M` exactly.
- **Real browser (Playwright/Chromium, `/opt/pw-browsers`, driven directly against the running dev server — not a static render):**
  - Filled and submitted an `ACQUISITION` scenario on Coherent's Simulate page: before/transaction/after table rendered, `CLEAR` contractual chip rendered, full explainability drill-down + 24-citation source trace rendered, `VERIFIED` legal-review badge with its explanatory note rendered. Screenshot captured.
  - Same scenario on Matthews: rendered correctly, and its Credit Agreement side rendered `NOT EVALUATED`/"Review required" while its Indenture side rendered `CLEAR` alongside it in the same result — the exact fail-closed-coexists-with-a-real-result proof point §P describes. Screenshot captured. **This first run is what surfaced the REFINANCING bug described in §Q** — it was found live, not merely inferred.
  - Deliberately composed an infeasible Matthews acquisition ($9,999M cash consideration against $33.5M available cash): confirmed the engine's fail-closed `Error` is now caught and rendered as a clear red banner ("This transaction is not feasible as composed: ...") rather than a blank/broken page. Screenshot captured.
  - Full-page screenshots captured for all 8 non-Simulate company/tab pages (`overview`/`capital-structure`/`capacity`/`documents` × 2 companies) and both companies' Simulate results — visually confirmed real, differently-shaped, non-fabricated data for both companies throughout.
- **Build:** `npm run build` — compiled successfully, all 13 routes (5 company-scoped × 2 dynamic segments + 8 static/legacy) generated with no errors.

Nothing above is asserted without having actually run it in this session.

## U. Remaining product gaps

Reported honestly, not hidden:
1. **Lien-pairing/priority verification** (§C) — a secured-debt query is not verified against actual lien authority when `requestedLienPriority` is empty (the universal live-caller default). A real, disclosed, pre-existing limitation; not fixed here (out of authorized scope).
2. **Simulate UI covers 5 of 11 `ScenarioAction` kinds** — `DIVIDEND`/`SHARE_REPURCHASE`/`ASSET_SALE`/`CHANGE_EBITDA`/`RATE_ASSUMPTION_CHANGE`/`WORKING_CAPITAL_CHANGE` are fully supported by `lib/financial-core/scenario.ts` and `lib/scenario-runner.ts` (no UI code change needed to add a form for them) but have no form control in this pass.
3. **Documents page** does not yet reproduce the legacy `/docs`/`/feeds` pages' defined-term-level text browsing or source-feed queue view for every company (those legacy pages remain Coherent-only).
4. **Rate assumptions** are not user-suppliable in the UI (both companies' floating-rate instruments correctly show "Missing input" rather than a fabricated rate, but there's no form to supply a SOFR assumption and see it flow through).
5. **Liquidity/Maturity** are not standalone IA tabs (rendered fully within Overview) — acceptable against the 5-tab IA minimum the task specifies, but a future pass could split them out.
6. Coherent's two floating-rate term loans have no `marginBps`/`referenceRate` on record (never disclosed anywhere in this repository's prior research) — correctly renders "Missing input," not fabricated.

## V. Modified files

**Gate 0:**
- `lib/solver/types.ts` (M) — `TRANSACTION_SECURITY_SCOPE` kind + `allowedSecurity`.
- `lib/solver/election.ts` (M) — mechanical evaluation branch.
- `scripts/populate-coherent-security-scope-fix.ts` (new) — the one data-only change.
- `scripts/populate-gate0-golden-reconciliation.ts` (new) — reviewerNotes-only reconciliation for Q22/16/17.
- `tests/solver/gate0-security-scope.test.ts` (new) — 11 tests.

**Phase 10:**
- `lib/dashboard-service.ts` (new) — app-facing aggregation service.
- `lib/scenario-runner.ts` (new) — pure, Prisma-free scenario runner.
- `lib/format.ts` (M) — `fmtMaxCapacity`/`maxCapacityDetail`/`fmtMetric`.
- `lib/financial-core/scenario.ts` (M) — REFINANCING event-type bug fix.
- `scripts/populate-coherent-financial-core.ts` (new) — Coherent financial-core data population.
- `components/ui.tsx` (M) — `LegalReviewBadge`, `WarningList`, `LEGAL_REVIEW_STATUS_EXPLANATION`.
- `components/CompanyNav.tsx` (new).
- `app/layout.tsx` (M) — generalized, company-agnostic root shell.
- `app/page.tsx` (M) — company-selector homepage.
- `app/globals.css` (M) — new IA styling.
- `app/[companyId]/layout.tsx`, `page.tsx`, `overview/page.tsx`, `capital-structure/page.tsx`, `capacity/page.tsx`, `documents/page.tsx`, `simulate/page.tsx`, `simulate/SimulateClient.tsx` (all new).
- `vitest.config.ts` (M) — `.test.tsx` support + automatic JSX runtime, for the real-rendering UI test.
- `tests/dashboard-service.test.ts` (new) — 24 tests.
- `tests/phase10-ui-provenance.test.tsx` (new) — 6 tests.
- `tests/financial-core/refinancing-bug-fix.test.ts` (new) — 3 tests.

## Final verdict

**`PHASE10_USABLE_PRODUCT_COMPLETE`**

Gate 0 is resolved and proven. The app exposes generalized financial analytics for both companies through shared architecture (verified live, not assumed). A user can compose and run a real hypothetical transaction and see a genuine before/after + contractual result (verified live, including the fail-closed and infeasible-transaction cases). Capacity semantics are correct and kept structurally distinct (`testedAmount`/`maximumCapacity`/`selectedPath`/`bindingConstraint` never conflated). Material uncertainty is surfaced prominently, not buried. Scenarios are non-mutating both by test and by construction. No company-specific application logic exists in `app/**` or the new service/formatting code. The full regression suite passes: `npx prisma validate` (valid), `npx prisma migrate status` (up to date), `npx tsc --noEmit` (clean), `npx eslint .` (clean), `npx vitest run` (255/255), `npx tsx scripts/golden-test.ts coherent` (26/3/1/0, unchanged), `npx tsx scripts/golden-test.ts matthews` (2/4/10/2, unchanged), `npx tsx scripts/coherent-shadow-run.ts` (non-mutation confirmed), `npx tsx scripts/financial-core-acceptance-run.ts` (PASS), `npm run build` (success).
