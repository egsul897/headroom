# PR #304 Independent Product Acceptance

**PR:** https://github.com/egsul897/headroom/pull/304  
**Tip under review:** branch `cursor/real-covenant-dashboard-slice-2ca3`  
**Canonical base:** `cursor/canonical-product-integration-5a28`  
**Paid inference:** $0 · **Production Neon writes:** none · **Self-merge:** forbidden

## Executive finding

PR #304 demonstrates a **fixture-modeled dashboard path**: hand-encoded Matthews permission formulas + authentic-source-backed financial fixture numbers rendered through shared `evaluateProvision` into Position with non-AVAILABLE labels.

It does **not** demonstrate reusable autonomous covenant intelligence, a generalized multi-package calculation pipeline, or production authority.

Prior claim `REAL_DASHBOARD_VERTICAL_SLICE_PROVEN` is **rejected** as overstated relative to the four required milestones below.

---

## Milestone verdicts (separate; not inferred)

| Milestone | Verdict | Basis |
|---|---|---|
| **FIXTURE_MODELED_DASHBOARD_PROVEN** | **PROVEN (with defects)** | Authentic fixture financials + manually encoded formulas → Position metrics with `NOT_PRODUCTION_AUTHORITATIVE` / MODELED labels; production handoff refused |
| **GENERALIZED_CALCULATION_PIPELINE_PROVEN** | **NOT_PROVEN** | Registry and evaluator are Matthews-only; second authentic package returns null |
| **AUTONOMOUS_COVENANT_COMPILATION_PROVEN** | **NOT_PROVEN** | All five `CovenantProvisionInput` objects are manually hardcoded; zero compile/IR path |
| **PRODUCTION_AUTHORITY_PROVEN** | **NOT_PROVEN** | Correctly refused (trusted-issuer BLOCKED; completeness absent) |

---

## Check 1 — Origin of five CovenantProvisionInput objects

**Source:** `lib/product/real-dashboard-vertical-slice/package-matthews.ts` → `matthewsCovenantProvisions()` (lines 89–142).

| # | code | Origin | Autonomous compile? |
|---|---|---|---|
| 1 | `ind_permitted_debt_1a_flat` | Manual literal: `FLAT_NET_OF_DEBT`, thr=1300, `netOfBasis:"secured"` | **NO** |
| 2 | `ind_ratio_debt_fccr` | Manual literal: `COVERAGE_RATIO_ROOM`, thr=2.0 | **NO** |
| 3 | `ind_permitted_debt_1b_ratio_secured` | Manual literal: `LEVERAGE_RATIO_ROOM`, thr=3.5, secured | **NO** |
| 4 | `ind_permitted_debt_2_notes` | Manual literal: `FLAT_AMOUNT`, thr=300 | **NO** |
| 5 | `ca_lien_601j_2024notes` | Manual literal: `FLAT_AMOUNT`, thr=0 | **NO** |

Provenance chain: hand-transcribed in `scripts/populate-matthews-solver-native.ts` → copied into `matthewsCovenantProvisions()`. Comment admits: *"Codes/thresholds/sectionRefs match populate-matthews-solver-native.ts."*

**Grep evidence:** `lib/product/real-dashboard-vertical-slice/**` contains **zero** imports of `compileFrozenDebtPackage`, fixed-dollar/greater-of compilers, or Phase-3 verified IR loaders.

**Defect D1:** Provisions are not compiled from operative source text in this pathway.

---

## Check 2 — Financial inputs vs EDGAR + legal assumptions

### Financial figures (fixture `tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json`)

| Metric | Fixture | Onboarding §D (accession 0000063296-25-000006) | Match? |
|---|---:|---|---|
| TOTAL_ASSETS | 1791.719 | 10-Q BS | Yes (GAAP face) |
| CASH | 33.513 | 10-Q BS | Yes |
| TOTAL_DEBT | 809.211 | Note 7 roll-up | Yes |
| SECURED_DEBT | 778.882 | Revolver+Notes only (excludes other/leases) | Yes (disclosed simplification) |
| INTEREST_EXPENSE | 54.64 | TTM reconstruction table | Yes |
| CONSOLIDATED_EBITDA | 128.313 | Indenture-defined TTM reconstruction | Yes as **PUBLIC_FILING_RECONSTRUCTION / UNVERIFIED** |

**Defect D2:** CONSOLIDATED_EBITDA is not a disclosed single filing line — it is an engineering reconstruction (`docs/matthews-international-onboarding.md` §D). Fixture label `AUTHENTIC_SOURCE_BACKED` is accurate for lineage, not for certified officer EBITDA.

### Hardcoded outside fixture metrics

`matthewsFinancialSnapshot()` hardcodes:
- `cumulativeNetIncome: -3.472`
- `equityProceedsSinceIssue: 0`
- `assumedNewDebtRatePct: 8.625` (Notes coupon — disclosed assumption, not contractual)

### Material legal assumption defects

| Assumption | Code | Legal issue |
|---|---|---|
| `netOfBasis: "secured"` on cl.(1)(a) | package-matthews.ts:99 | Indenture measures Debt Facilities + QRT outstanding (~$584.8M), not total secured ($778.882M). Documented understatement ~$194M (`onboarding` §F.2). |
| FCCR→dollar via assumed rate | evaluateProvision COVERAGE_RATIO_ROOM | Converts coverage room using assumed 8.625%; not a contractual dollar basket. |
| First Lien 2.50x (1)(b)(y) omitted | caveat only | Material tighter constraint unmodeled (`onboarding` §F.1). |
| CA §6.01(j) thr=0 | package-matthews.ts:138 | Structurally correct per Sixth Amendment (zero NEW Loan-Party secured liens except 2024 Notes). |

---

## Check 3 — remainingCapacityMm / modeledCapacityMm / authorityStatus → Position

### Per-covenant publication (runtime probe)

| code | modeled | remainingCapacityMm | authorityStatus | Position claimKind | claimLabel |
|---|---:|---:|---|---|---|
| 1a_flat | 521.118 | **null** | GROSS_ONLY_UTILIZATION_INCOMPLETE | **REMAINING** | MODELED / NOT VERIFIED |
| fccr | 110.336 | **110.336** | MODELED_AUTHENTIC_EVIDENCE | **REMAINING** | MODELED / NOT VERIFIED |
| 1b_secured | 0 | 0 | MODELED_AUTHENTIC_EVIDENCE | REMAINING | MODELED / NOT VERIFIED |
| notes | 300 | 0 | MODELED_AUTHENTIC_EVIDENCE | REMAINING | MODELED / NOT VERIFIED |
| ca_lien | 0 | 0 | STRUCTURAL_ZERO | REMAINING | MODELED / NOT VERIFIED |

### Package secured side

`dashboardStubFromSlice` sets `remainingCapacity = indentureSecuredCompositionMm` (**631.454**) with `utilizationRemainingAuthority: NOT_PRODUCTION_AUTHORITATIVE`.

`presentCapacityClaim(... remainingIsAuthoritative: false)` → label **MODELED / NOT VERIFIED** (not AVAILABLE).

**Defect D3a:** UI claimKind is always `"REMAINING"` even when authority is GROSS_ONLY / modeled ratio room (`position-bridge.ts` `metricFromCovenant`, lines 205–210). Numbers are shown via `fmtM` on Position without a GROSS vs REMAINING distinction in the displayed value (`app/[companyId]/position/page.tsx` ~369).

**Defect D3b:** FCCR/1b set `remainingCapacityMm = modeled` while completeness/trusted-issuer incomplete (`evaluate-covenants.ts` 198–203) — softens “remaining” semantics.

**Defect D3c:** `rulebookFromSlice` fabricates `stage: "REVIEWED"` and counts all rows as reviewed/executable (`position-bridge.ts` 66–80) — not counsel review evidence.

**Gate preserved:** `remainingIsAuthoritative:false`; `productionRemainingPublished:false`; `mayUseAsProductionCapacityInput` refused; no AVAILABLE label observed.

---

## Check 4 — $631.454M secured composition

**Construction:** `flat.modeledCapacityMm + fccr.modeledCapacityMm` (`evaluate-covenants.ts` 337–343).

### Can the two components legally coexist?

- **Debt-incurrence (Indenture alone):** Permitted Debt cl.(1)(a) and Ratio Debt §4.09(a) are distinct baskets; using both for separate Indebtedness is a recognized Indenture stacking pattern (onboarding §E reports the same binary-search max).
- **Secured / lien eligibility (cross-document):**
  - Indenture Permitted Liens cl.(2) automatic first-lien link is modeled from **Debt Facilities (1a/1b)**, not from Ratio Debt.
  - CA §6.01(j) after Sixth Amendment: **zero** NEW Loan-Party secured lien capacity except the 2024 Note Offering (`ca_lien_601j_2024notes` thr=0).
  - Therefore FCCR room dollars cannot be treated as **incremental secured** capacity without an independent lien permission — which the CA blocks.

**Defect D4:** Publishing **$631.454M as secured package remaining** is **HYPOTHETICAL / UNVERIFIED** for secured capacity. At most it is Indenture-side debt-incurrence composition under solver-native population assumptions, ignoring CA lien companion failure and (1)(b)(y) first-lien test.

**Required label:** `HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION` — not verified secured remaining.

---

## Check 5 — independentExpectedRemaining circularity

```124:147:lib/product/real-dashboard-vertical-slice/evaluate-covenants.ts
export function independentExpectedRemaining(...) {
  switch (code) {
    case "ind_permitted_debt_1a_flat":
      return Math.max(0, 1300 - fin.securedDebt);  // mirrors thr=1300 + netOfBasis secured
    case "ind_ratio_debt_fccr":
      return Math.max(0, (fin.ebitda / 2.0 - fin.interestExpense) / rate); // mirrors thr=2.0
    case "ind_permitted_debt_1b_ratio_secured":
      return Math.max(0, 3.5 * fin.ebitda - metrics.netSecured); // mirrors thr=3.5
```

**Defect D5:** “Independent” arithmetic **reproduces the same hardcoded thresholds and netting basis** as `matthewsCovenantProvisions()`. It validates `evaluateProvision` arithmetic consistency, **not** independent legal correctness against operative indenture text. Does not re-parse source, does not challenge `netOfBasis:"secured"`, does not test (1)(b)(y).

---

## Check 6 — Second authentic package on same pathway

```
hasAuthenticPositionSlice("matthews")  → true
hasAuthenticPositionSlice(any other) → false
loadAuthenticDashboardSlice("conmed"|"coherent"|"wor"|"mhk"|"mtn") → null
```

**Defect D6a:** `hasAuthenticPositionSlice` is a single-company id check (`position-bridge.ts` 254–256).

**Defect D6b:** Entry point is named `evaluateMatthewsVerticalSlice`; `buildCovenantRow` switches on Matthews-specific codes (≥13 `p.code ===` branches).

**Result:** Same production pathway **cannot** evaluate a second authentic package without company-specific evaluator branches. **GENERALIZED_CALCULATION_PIPELINE_PROVEN = NOT_PROVEN.**

---

## Check 7 — Minimum work: autonomous OA + Phase 3 IR → dashboard

Bounded plan (no second engine; preserve fail-closed gates):

1. **Package adapter (generic):** Load sealed authentic package bytes → existing `compileFrozenDebtPackage` / operative-authority handoff (`#274/#283`) → verified IR units only (fixed-dollar / greater-of families already VE).
2. **Delete / quarantine** `matthewsCovenantProvisions()` and code-switched `buildCovenantRow` from the product Position path; keep as EVALUATION seed data only.
3. **Financial/utilization:** Reuse `#290` normalize + reconstruct; refuse remaining without completeness + trusted-issuer (already implemented).
4. **Capacity:** Feed verified IR into existing `evaluateVerifiedCapacity` / UTE (`executeUnifiedVerifiedTransaction`) — not leaf `evaluateProvision` over hand permissions.
5. **Position:** Consume UTE / product-capacity-view outputs; claimKind GROSS vs REMAINING must follow `utilizationRemainingAuthority` / `mayPublishAvailable`; never post unverified composition as secured remaining.
6. **Acceptance:** Second-issuer package (e.g. MTN fixed-dollar VE + real financial corpus when available) must pass the **same** loader with zero issuer `if (companyId === …)` branches in evaluators.
7. **Do not** activate production IdP or claim PRODUCTION_AUTHORITY without separate authorization.

---

## Check 8 — Fail-closed gates

| Gate | Status on #304 path |
|---|---|
| Trusted-issuer activation | BLOCKED (preserved) |
| Completeness certificate | absent → supportsRemainingClaim false (preserved) |
| Production capacity handoff | REFUSED (preserved) |
| AVAILABLE label | not observed (preserved) |
| UNKNOWN utilization → zero | not observed for 1a remaining (null) (preserved) |
| Presentation honesty | **PARTIAL** — claimKind REMAINING + $631 secured remainingCapacity are defects short of AVAILABLE false-favorable |

---

## Concrete defect register

| ID | Severity | Defect |
|---|---|---|
| D1 | **P0 product claim** | Provisions manually encoded; no autonomous compilation |
| D2 | P1 | EBITDA is PUBLIC_FILING_RECONSTRUCTION / UNVERIFIED, not certified |
| D3a | P1 | Position claimKind always REMAINING for modeled/gross figures |
| D3b | P1 | Ratio rooms copy modeled→remainingCapacityMm without completeness |
| D3c | P2 | Fabricated rulebook stage REVIEWED |
| D4 | **P0 legal** | $631.454 secured composition ignores CA lien companion; must be HYPOTHETICAL_UNVERIFIED |
| D5 | **P0 acceptance** | independentExpectedRemaining circular with fixture thresholds |
| D6a/b | **P0 generalization** | Matthews-only registry + code switches; second package fails |

---

## Required verdict (final)

```
FIXTURE_MODELED_DASHBOARD_PROVEN:        PROVEN_WITH_DEFECTS
GENERALIZED_CALCULATION_PIPELINE_PROVEN: NOT_PROVEN
AUTONOMOUS_COVENANT_COMPILATION_PROVEN:  NOT_PROVEN
PRODUCTION_AUTHORITY_PROVEN:             NOT_PROVEN
```

Prior `REAL_DASHBOARD_VERTICAL_SLICE_PROVEN` **withdrawn** as a product-acceptance claim.

## Test evidence

- Adversarial acceptance suite: `tests/product/real-dashboard-vertical-slice-acceptance-adversarial.test.ts`
- Runtime probes documented above (registry, claim labels, hardcoded thresholds)
