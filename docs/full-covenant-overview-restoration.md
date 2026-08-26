# Restore the full covenant overview

Dense institutional dashboard/position view, restored in generalized,
production-safe form. Every claim below is checked against real output from
`getCovenantOverview("coherent")` / `getCovenantOverview("matthews")` and
real screenshots, not asserted from the code alone.

## A. Prior regression

The current Dashboard (`app/[companyId]/dashboard/page.tsx`, pre-this-task)
showed: a headline stat-grid (cash/debt/leverage), near-term maturities, a
two-row "Covenant / headroom summary" with only a secured and an unsecured
dollar figure (no binding document, no section, no per-basket detail), and a
legal-review counter. Nothing on the page showed an individual covenant
family, a basket, a section citation, a formula, or a ratio test. To see any
of that, a user had to leave the Dashboard entirely — the legacy `/position`
page (Coherent-only, unlinked from the customer-facing product) was the only
place that dense information still existed.

## B. Prototype behaviors restored

Inspected `app/position/page.tsx` (the surviving prototype/Position view,
already generalized off `lib/coherent.ts`/`lib/covenant-engine.ts` in an
earlier task) before implementing. Behaviors restored, generalized (never
copying its Coherent-specific data, only its information architecture):

- Dense row presentation, many baskets visible by default, no accordions.
- Inline section citations directly on every row (`§6.01(p)`, `§3.3(a)`, …).
- A compact formula description per row (`describeFormula`), not a raw enum.
- A visible headline "maximum incremental debt" figure with its binding
  document/provision, not buried behind a click.
- Cross-document, not single-document: every governing document's baskets on
  one screen.

Not restored (deliberately): the prototype's own company-specific field
names/layout (`getPosition()`/`getDebtTranches()` hardcoded shape) — the new
service (`lib/covenant-overview-service.ts`) is a clean, generalized
contract built from scratch, not a refactor of the prototype's own code.

## C. Dashboard/service architecture

```
app/[companyId]/dashboard/page.tsx
  -> getCompanyDashboard()        (existing, unmodified - maturities, legal review)
  -> getCovenantOverview()        (NEW - lib/covenant-overview-service.ts)
       -> getFinancialPosition()                        (existing, unmodified)
       -> computeRemainingCapacityAfterDebtIncurrence()  (existing, unmodified, amount=0)
       -> evaluateProvision() / describeFormula()        (existing, unmodified, reused as pure functions)
       -> buildDebtRatioTests()                          (existing, unmodified)
       -> real Permission / CovenantProvision / SolverCoverageDeclaration rows (read-only Prisma queries)
  -> <CovenantOverviewView overview={...} />  (NEW - components/CovenantOverview.tsx)
```

Zero solver/financial-core files were modified. `main`'s container width was
widened globally (780px → 1180px, `app/globals.css`) — checked against every
existing page's own card/row-based layout, which reflows cleanly into the
extra width.

## D. `getCovenantOverview` service contract

```ts
getCovenantOverview(companyId: string, asOfDate?: Date): Promise<CovenantOverview>

interface CovenantOverview {
  company: CompanySummary;
  asOfDate: Date;
  headlineMetrics: HeadlineMetric[];       // { key, label, value: string|null, state }
  securedCapacity: HeadlineCapacitySide;   // maximumCapacity, remainingCapacity, bindingDocumentName, bindingSections, status
  unsecuredCapacity: HeadlineCapacitySide;
  warnings: { category; description }[];
  covenantFamilies: CovenantFamilySection[];
}

interface CovenantFamilySection {
  family: string;                 // "INDEBTEDNESS" | "LIENS" | "FINANCIAL_COVENANTS" | ...
  coverageState: "MODELED_AND_EVALUABLE" | "MODELED_REVIEW_REQUIRED" | "PRESENT_BUT_UNMODELED" | "NOT_TESTED";
  counts: { modeled; reviewRequired; unmodeled };
  rows: (CapacityRow | RatioRow)[];
  advisoryNotes: string[];         // real SolverCoverageDeclaration.notes text
}
```

`CapacityRow`/`RatioRow` carry `stableKey`, `name`, `documentName`,
`sectionRef`, `formulaDisplay`/`currentRatio`+`ratioLimit`+`ratioHeadroom`,
`currentCapacity`/`used`/`remaining`/`utilizationPct`, `bindingState`,
`status`, `reviewState`, `entityScope` — see the file's own type definitions
for the complete, exact shape. React never reconstructs any of these fields;
it only formats/sorts/renders them.

## E. Headline financial metrics

Cash, gross debt, net debt, total liquidity, net leverage, secured leverage,
interest coverage, EBITDA margin — sourced from `getFinancialPosition`
(unchanged). Real observed output for Coherent: EBITDA margin renders
`NOT_AVAILABLE` (revenue isn't tracked for Coherent) rather than a fabricated
number — confirmed via `tests/covenant-overview-service.test.ts`'s explicit
"never a fabricated number for a missing metric" assertion.

## F. Secured/unsecured headline capacity

Reuses `computeRemainingCapacityAfterDebtIncurrence(..., amount: 0, ...)`
unchanged — the exact function the pre-existing Dashboard already called.
Real observed output: Coherent shows `$5,129M` secured and unsecured,
binding document "Credit Agreement (2022, as amended)", section `§6.01(p)`.
Matthews shows `Not modeled` for both sides (its cross-document result is
not a single EXACT figure today — a real, pre-existing fact, not a
regression introduced here) with no fabricated dollar figure or "Unlimited"
— asserted explicitly in `tests/covenant-overview-service.test.ts` and
`tests/covenant-overview-ui.test.tsx`.

## G. Covenant-family grouping

Family is derived from real structural signals only — never a hardcoded
company/provision-code branch:

- `INDEBTEDNESS`/`LIENS`: `Permission.grantType` directly.
- `RESTRICTED_PAYMENTS`/`INVESTMENTS`: whether a `CovenantProvision` code is
  referenced by a document's `rpWaterfall.steps`/`ratioGateCodeByKind`
  (`.dividend` → Restricted Payments, `.investment` → Investments).
- `ASSET_SALES`: referenced by `assetSale.thresholdCode`.
- `FINANCIAL_COVENANTS`: a `LEVERAGE_RATIO_ROOM`/`COVERAGE_RATIO_ROOM`
  provision not referenced by any of the above (a genuine standalone
  maintenance covenant, found via `buildDebtRatioTests`'s own scan).
- Any `CovenantProvision` a company/document/side already superseded by
  solver-native `Permission` coverage (`resolveDocumentSideCoverage`) is
  excluded from every family, so a real basket is never double-counted under
  both representations — verified explicitly by a dedicated test.

A family with zero real evidence of presence renders no section at all —
recorded here as a deliberate choice, not silently decided: fabricating
presence for, e.g., `ACQUISITIONS`/`REPORTING_INFORMATION`/`GUARANTEES`/
`COLLATERAL_SECURITY`/`FUNDAMENTAL_CHANGES`/etc. for Coherent or Matthews
would itself be dishonest, since this codebase has no real coverage
declaration, permission, or provision proving those families are present in
either company's actual documents today.

Real observed family list: **Coherent** — Indebtedness, Liens, Financial
Covenants, Restricted Payments, Investments, Asset Sales (6 families).
**Matthews** — Indebtedness, Liens (2 families, both with real, non-empty
advisory notes documenting known coverage exclusions).

## H. Capacity rows

Each row's `currentCapacity` comes from `evaluateProvision()` (unchanged,
existing pure function), called on a `Permission`/`CovenantProvision`
adapted into the exact `CovenantProvisionInput` shape it already accepts —
composition, not a parallel calculation. `formulaDisplay` comes from
`describeFormula()` (unchanged, existing). Real example (Coherent,
`§6.01(p)`): "The additional debt that keeps Total Net Leverage at or below
4.25x Consolidated EBITDA." → `$5,129M`.

## I. Ratio rows

`buildDebtRatioTests(..., amount: 0, ...)` (unchanged) for standalone
maintenance covenants; a direct `evaluateProvision()` read of a
`RATIO_GATE`-typed provision's `.gate` for the two ratio-gated
Restricted-Payments/Investments baskets. Rendered as Current/Limit/Headroom
text, never forced into a dollar-capacity column. A visual headroom bar is
drawn ONLY for a "must not exceed a maximum" ratio (a natural 0..limit
scale); a "must be at least a minimum" ratio (e.g. interest coverage) never
gets a fabricated bar scale — text only, per the task's own instruction not
to force a misleading utilization visual.

## J. Coverage/unmodeled handling

`coverageState` per family: `PRESENT_BUT_UNMODELED` if any row is a real
`KNOWN_NOT_MODELED` `Permission` (renders name/section/notes, no capacity
number, status `UNMODELED`); `MODELED_REVIEW_REQUIRED` if any row is
`review_required`; `MODELED_AND_EVALUABLE` otherwise. Real
`SolverCoverageDeclaration.notes` (existing rows, e.g. "Excludes cl.(1)(b)(y)'s
First Lien Net Leverage Ratio sub-test") render as a visible amber advisory
banner at the top of the affected family — never buried, never omitted.

## K. Inline citations

Every row's `sectionRef` renders directly in the row (desktop grid column
and mobile secondary line) — confirmed present in the markup via
`tests/covenant-overview-ui.test.tsx`'s explicit citation-presence assertion
and via a live screenshot (§Q/§R below). No citation is click-to-reveal; this
task did not build a new source-in-context viewer (§39's "reuse existing
source-in-context functionality, do not build a new document system" —
none of the existing Documents/Sources pages currently expose a
clause-level anchor to link to, so citations remain plain text this task,
recorded as a known limitation in §V).

## L. Formula serialization

Reused `lib/describe-formula.ts`'s `describeFormula()` verbatim — already
generic over `formulaType`/`thresholdValue`/`params`, already covers every
`FormulaType` value including `RATIO_GATE`. No new serializer was needed.
Tested explicitly: `tests/covenant-overview-service.test.ts` asserts no raw
`FormulaType` enum name ever appears where a formula display string should
be.

## M. Usage/headroom semantics

No per-basket ledger attribution exists anywhere in this codebase today
(`LedgerEntryInput.basket` is company-wide-category, not basket-specific) —
every capacity row honestly reports `usageState: "NOT_TRACKED"`, `used:
null`, never a fabricated `$0 used`. `remaining` equals the basket's own
current capacity (the correct, non-fabricated statement in the absence of
tracked usage — not a `max - used` subtraction, since there is no `used`
figure to subtract). Ratio-row headroom is the real
`threshold - currentRatio` (or reverse for a minimum), read directly off
`buildDebtRatioTests`'s own already-computed `preTransactionRatio`/`threshold`
fields — never recomputed independently.

## N. Binding/near-binding state

`BINDING` is assigned only when a row's own section/permission id matches
the real `bindingConstraint` citation `computeRemainingCapacityAfterDebtIncurrence`
already returns for that side — verified by a dedicated cross-check test
(at most one bound row per side, and it agrees with the headline capacity
card's own citation). No `NEAR_BINDING` state is ever synthesized: no
existing generalized service defines a "near limit" threshold, and the task
explicitly forbids inventing an arbitrary client-side one — this is recorded
here as a known, deliberate gap (§V), not silently worked around.

## O. Review states

`Permission.reviewStatus` (`VERIFIED`/`UNVERIFIED`/`DISPUTED`) renders
directly, labeled "Verified — legal review" / "Not yet reviewed" /
"Disputed" — never implying `VERIFIED` means mathematically/computationally
correct (the same distinction `components/ui.tsx`'s
`LEGAL_REVIEW_STATUS_EXPLANATION` already establishes elsewhere in the
product). A `CovenantProvision`-sourced row (no `reviewStatus` column exists
on that table) renders `reviewState: "NOT_TRACKED"` honestly rather than
inventing a review status that was never recorded.

## P. Mobile treatment

One markup structure (a CSS grid per row), reflowed via a single
`@media (max-width: 860px)` rule rather than two separate render paths: name
+ status pill on the first line, section citation and formula as immediate
secondary lines, then capacity/remaining as one compact line, then document
and review state. Verified with a real Playwright screenshot at a 390px
viewport (iPhone-class width) — see §Q. Document/capacity/used/remaining
columns are hidden as separate grid cells on mobile (folded into the compact
secondary lines instead), never hidden inside an accordion.

## Q. Coherent rendered result

Live-rendered via `next dev` + a real headless-Chromium screenshot
(desktop 1400px and mobile 390px viewports), not asserted from code alone.

- **Desktop**: one scrollable screen. Headline metric strip (8 tiles), two
  headline capacity cards side by side ($5,129M secured/unsecured, binding
  document + `§6.01(p)`), then 6 family sections (Indebtedness 16 rows,
  Liens 6 rows, Financial Covenants 6 ratio rows, Restricted Payments 3 rows,
  Investments 1 row, Asset Sales 1 row) — every row showing name, document,
  section, formula, capacity, used, remaining, status pill, review state.
  Exactly one row (`§6.01(p)`) carries the `Binding` pill, matching the
  headline card's own citation.
- **Mobile**: the same 33 rows, each collapsed to a compact card — name,
  status pill, section citation, formula, capacity/remaining line, document,
  review state, all visible with zero taps.
- Zero browser console errors (one unrelated pre-existing 404 for
  `/favicon.ico`, confirmed present before this task's changes too).

## R. Matthews rendered result

- Headline secured/unsecured capacity: **"Not modeled"** with an explicit
  `Status: Not modeled` line — never a fabricated dollar figure, never
  "Unlimited."
- Two families only: **Indebtedness** (4 rows, all real, all `Available`)
  and **Liens** (3 rows, all real). Both families carry real, visible amber
  advisory banners quoting the actual `SolverCoverageDeclaration.notes` —
  e.g. "Excludes cl.(1)(b)(y)'s First Lien Net Leverage Ratio sub-test and
  cl.(3) Existing Notes."
- No `Financial Covenants`/`Restricted Payments`/`Investments`/`Asset Sales`
  section renders at all — Matthews has zero real evidence for any of them
  today (zero `CovenantProvision` rows exist for Matthews at all), and
  fabricating a "present but unmodeled" claim with no real backing data
  would itself be a fail-open violation. Recorded explicitly, not hidden.
- Mobile: identical compact-card treatment, same component tree, same CSS
  classes as Coherent (verified by an explicit same-markup-classes test).

## S. Generalization proof

- `grep`-checked: zero occurrences of `"coherent"`/`"matthews"`/
  `"Coherent"`/`"Matthews"` anywhere in `lib/covenant-overview-service.ts`,
  `components/CovenantOverview.tsx`, or the Dashboard page.
- `tests/covenant-overview-service.test.ts` and
  `tests/covenant-overview-ui.test.tsx` both run `describe.each(["coherent",
  "matthews"])` / call both companies explicitly and assert the SAME
  contract/component renders correctly for both, with different results
  arising only from different underlying data (confirmed: an explicit test
  asserts the same CSS class names appear in both companies' rendered
  markup).

## T. Tests / regression

New tests added: `tests/covenant-overview-service.test.ts` (22 tests, real
DB), `tests/covenant-overview-ui.test.tsx` (9 tests, `react-dom/server`
against real service output). Full suite: **70 test files, 548 tests, all
passing** (548 = 517 pre-existing + 31 new; zero pre-existing test was
modified or deleted). `npx tsc --noEmit`: clean. `npx eslint .`: clean.
`npx prisma validate` / `npx prisma migrate status`: clean, schema unchanged,
18 migrations, no drift. Coherent golden harness: **26 passed, 3 failed, 1
flagged, 0 errored (30 total)** — identical to the documented baseline, not
a regression. Matthews golden harness: **2 passed, 4 failed, 10 flagged, 2
errored (18 total)** — identical to the documented baseline. `npm run
build`: succeeds cleanly (`✓ Compiled successfully`, all 22 routes
generated).

## U. Production deployment

Zero schema changes were made in this task (`git diff --stat` between main's
prior tip and the merged commit shows no `prisma/` files touched;
`npx prisma migrate status` confirms no drift before or after) — no
hosted-Neon migration was necessary.

This repo's Vercel project deploys Production from `main`, via merged PRs
(confirmed from `main`'s own commit history — every prior task's work
reached Production the same way). Committed and pushed to
`claude/headroom-scaffold-covenant-engine-jrijk8`, then, with the user's
explicit authorization for this specific step, PR #18 was opened and merged
into `main` (merge commit `b94651b`) to actually trigger the Production
deploy.

**Live verification** (against `https://headroom-debt-compass.vercel.app`,
using the Vercel Protection Bypass header, per the user's explicit
authorization for this task):
- `/coherent/dashboard`: HTTP 200. The new build went live ~30s after the
  merge. Served markup contains all 6 real family sections (Indebtedness,
  Liens, Financial Covenants, Restricted Payments, Investments, Asset
  Sales), the real `$5,129M` headline capacity with its binding
  document/section, 33 real section citations, exactly one `Binding` status
  pill, and zero error markers (`Internal Server Error`/stack
  traces/Prisma error text) — byte-for-byte structurally identical to the
  locally-verified build.
- `/matthews/dashboard`: HTTP 200. Correctly shows `Not modeled` headline
  capacity (not a fabricated figure), only the Indebtedness/Liens families,
  and the real advisory notes — confirming the fail-closed behavior holds in
  production, not just locally.
- `/admin` (no token): HTTP 404, as designed (fail-closed admin gate,
  unrelated to this task, unmodified).
- **Mobile**: a direct Playwright-to-production connection failed in this
  sandbox (`net::ERR_CONNECTION_RESET` reaching the live host from
  Chromium specifically — curl to the same host succeeds normally; a
  sandbox network/proxy limitation on browser traffic, reported honestly
  rather than routed around). Mobile rendering is instead evidenced by: (1)
  a real Playwright screenshot of the identical code running locally (§Q/§R,
  desktop + 390px mobile viewport, zero console errors besides an unrelated
  pre-existing missing favicon), and (2) confirming the live production HTML
  is structurally identical to that same local build (same CSS classes,
  same markup shape) — the responsive behavior is pure CSS
  (`@media (max-width: 860px)`), so an identical served markup+stylesheet
  renders identically regardless of which host serves it.

## V. Known limitations

- **No near-binding state.** No generalized service defines a "near limit"
  threshold today; per the task's own instruction, none was invented. A
  covenant one dollar away from its cap shows `Available`, identically to
  one with $2B of headroom. A future generalized "near-limit" service
  capability (not built here) would need an explicit, documented percentage
  or absolute-distance rule before this can change.
- **Citations are plain text, not deep links.** No existing page exposes a
  clause-level anchor for a citation to link to; building one was out of
  this task's scope ("reuse existing source-in-context functionality, do not
  build a new document system"). `§39`'s "row → section → source language"
  chain is therefore satisfied only at the section-name level, not as a
  clickable jump.
- **Per-basket usage is never tracked.** The ledger only records
  company-wide category totals (`DEBT_INCUR`/`DIVIDEND`/etc.), never an
  amount against one specific basket/permission — every capacity row's
  `used` is honestly `null`/`NOT_TRACKED`, not a real historical figure.
  Building real per-basket usage tracking is a distinct, larger feature this
  task did not attempt.
- **Matthews has zero standalone financial-covenant data.** If Matthews'
  real indenture/credit agreement contains maintenance financial covenants
  Headroom has not yet transcribed as `CovenantProvision` rows, this service
  has no way to know that and render a `PRESENT_BUT_UNMODELED`
  `Financial Covenants` section for them — it can only report what existing
  data proves. This is a data-population question for a future onboarding
  pass, not a service-layer defect.
- **A dedicated `/covenants` route was not created.** The existing product
  had none under `app/[companyId]/**`; the Dashboard route itself now
  satisfies the "one dense screen" requirement, and creating a second,
  separately-implemented table was explicitly what the task warned against
  (§38). If a future task wants a `/covenants` drill-down, it should reuse
  `<CovenantOverviewView>` directly rather than re-implementing rows.
