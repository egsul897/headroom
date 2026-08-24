# Legal Model Remediation Design

**Status: design only. No schema, engine, seed data, golden-test expected answers, or test files have been modified to produce this document.**

Scope: the 10 approved legal conclusions from the external leveraged-finance review of Coherent Golden Test Set v1 (Debt & Liens Capacity). This document audits the current Prisma schema, `lib/covenant-engine.ts`, the Coherent seed data, and the golden-test harness against those conclusions, and proposes a generalized (non-Coherent-specific) remediation. It does not reopen the approved conclusions themselves.

---

## 1. Overall diagnosis

The current engine computes covenant capacity as **one precomputed number per document per side**, produced by evaluating a *static, hand-authored* expression tree (`CapacityExpr`: `REF`/`SUM`/`MIN`/`MAX`) over a flat set of `CovenantProvision` rows. That architecture was built — and validated in the prior remediation phase — to prove the engine is *company-agnostic*: no provision codes, document ids, or section numbers are branched on in `lib/covenant-engine.ts`, and a synthetic second company runs through the identical code path with correct numbers.

That earlier phase proved **generalization over formula archetypes** (the 7 `FormulaType` values). It did **not** attempt to model **stacking, concurrency, alternative paths, or the debt/lien independence** the legal review now requires. The static tree shape (a `SUM` node is always additive; a `MIN` node always means "all must hold"; a `MAX` node always means "take the higher, but only if every branch is modeled") was chosen once, by whoever wrote the seed data, and baked in as if it were a fixed structural fact about the document. The 10 approved conclusions establish that it is not: whether two permissions stack, whether one is disregarded from the other's ratio denominator, whether two permissions are alternatives, and how a repayment affects a basket, are all **contractual data**, not shapes an engine author gets to assume.

The remediation is therefore not a bug fix to the existing tree evaluator — it is the introduction of a **new abstraction layer** (a permission graph + allocation algorithm) that computes what the tree used to hard-code, and a **retirement path** for the parts of the tree that can't correctly express the required concepts (concurrent-use disregard, alternative-path status semantics, per-permission measurement basis, transaction assumptions distinct from financial facts).

One concrete defect was found during this audit that is a real, self-contained correctness bug independent of the larger redesign: **`MAX`'s status-combination rule is currently "worst status wins," which is correct for a genuine joint constraint (`MIN`) but wrong for an alternative/OR relationship.** Today, if one alternative path in a `MAX` node is `not_tested` or `review_required` (e.g., the FCCR path lacks a rate assumption) while the other alternative is fully modeled and passes, the current engine reports the *whole* `MAX` result as unresolved — even though the fully-modeled alternative alone should be sufficient. This is backwards for Conclusion 7's "either path is sufficient" semantics, and it's a fail-closed violation in the *opposite* direction (a usable answer gets suppressed) from the kind this codebase has otherwise been careful about (an unusable answer getting silently presented as usable). It's flagged as P0 §2.2 below.

---

## 2. Current-model defects, ranked

### P0 — correctness (the current number/verdict can be wrong under the approved conclusions)

1. **Hardcoded, unconditional `SUM` for stacking.** The indenture's `capacityFormulas.secured` sums `facility_flat + facility_grower + mila_secured + general_debt` and separately sums `lien_ratio + lien_general`, with no representation of whether that additivity is contractually earned (Conclusion 1/3/4). The tree assumes every `SUM` is a concurrent-and-disregarded stack; that must be data, not a tree-authoring choice.
2. **`MAX`-as-OR status bug** (described above). Affects the indenture's `unsecured = MAX(ratio_debt_fccr, mila_unsecured)` node and any future alternative-path relationship (Conclusion 7).
3. **`assumedNewDebtRatePct` lives on `FinancialSnapshot`** and is silently used as a default rate for every `COVERAGE_RATIO_ROOM` evaluation, including bare `PROVISION_CAPACITY`/`DOCUMENT_CAPACITY`/`CROSS_DOCUMENT_CAPACITY` queries that report a dollar figure without any per-transaction confirmation that the rate is an accepted assumption (Conclusion 8/10). A snapshot-level "fact" is standing in for a transaction-level assumption.
4. **CA §6.11 is wired as an unconditional `MIN` participant** in the Credit Agreement's `capacityFormulas.secured` *and* `.unsecured`, applied to every debt path with no distinction between maintenance-covenant compliance, incurrence conditions, and Incremental Amount mechanics (Conclusion 5).
5. **No "known but not modeled" status.** `not_tested` currently means "nothing recorded" — it can't distinguish that from "we know this permission/covenant exists and haven't entered it," which weakens the fail-closed guarantee generally and is a prerequisite for correctly implementing several of the design questions below.
6. **No provenance on financial inputs.** The ~$1.7B EBITDA reconstruction is a plain `Decimal` column with no `sourceType`/`reviewStatus`, unlike `DefinedTerm`, which already has exactly this pattern (`UNVERIFIED`/`VERIFIED`/`DISPUTED`) for legal text (Conclusion 10).
7. **Measurement basis is implicit in `FormulaType`, not an explicit, orthogonal field.** `FLAT_NET_OF_DEBT` always reads the *current* snapshot balance (effectively "currently outstanding"); the RP waterfall's `restrictedPaymentPoolUsed` always sums ledger `DEBIT`s only, never restored by `CREDIT` (effectively "cumulative incurred"). These are currently correct for Coherent's specific baskets by accident of which `FormulaType` was chosen — the *coupling* itself is the defect (Conclusion 9).

### P1 — architecture (structurally blocks correct modeling even where today's number happens to be right)

8. **`CapacityExpr` is a static, company-authored tree with no runtime allocation/election search.** It can only express what someone manually wired into JSON — it cannot *derive* a stacking outcome from declarative permission + relationship data (Design Q A/C).
9. **No first-class debt-vs-lien distinction.** `CovenantProvision` doesn't tag what a permission *grants*; the debt/lien separation exists only by convention (which baskets happen to appear inside which `SUM` node), not structurally (Conclusion 2).
10. **No `TransactionAssumptions` type.** `simulateDebtIncurrence(data, position, amount, secured)` has nowhere to carry a transaction date, an explicit rate override, EBITDA adjustments, or a concurrent repayment. This is also the root cause of the sequential-scenario gap identified in the prior phase (v1 Q23–Q25 have no pro-forma-chaining API).
11. **No `PermissionRelationship` data at all.** Concurrency, disregard, alternative-grouping, and mutual exclusivity are invisible to the schema; they exist only implicitly in which `CapacityExpr` node type someone chose.

### P2 — enhancement

12. Golden-test harness has no query type for reading an allocation trace or a labeled subtotal (already flagged as a gap for v1 Q5 in the prior phase).
13. UI (`ProvisionTrace`, Position page) has no rendering support for a multi-permission allocation trace; downstream of the engine/schema work, not blocking it.

---

## 3. Proposed legal ontology

Generalized concepts required, independent of Coherent:

- **Permission** — a contractual grant that either (a) allows debt to be *incurred*, or (b) allows a lien to *secure* debt, or (c) some other transaction type (out of scope here — see Open Questions). A permission has an **amount kind** (`FIXED` — a dollar/formula cap computed from static-at-evaluation-time inputs, vs. `INCURRENCE_BASED` — a pro forma ratio test) and a **measurement basis** (how its own history of usage is tracked — see below). Every existing `FormulaType` archetype is *still* the right tool for computing a permission's own **standalone** capacity; nothing about the 7 archetypes is wrong. What's missing is everything *around* them.
- **Grant type** — `DEBT_INCURRENCE` vs `LIEN` (Conclusion 2's independence). Reserved for future extension (e.g. `RESTRICTED_PAYMENT`) but not implemented here — see Open Questions on whether §13.1-style stacking also governs the RP waterfall.
- **Stacking relationship** — a *pairwise*, explicit, data-declared relationship between two permissions: `CONCURRENT_DISREGARDED` (both may be used at once, and the Fixed member's amount is excluded from the Incurrence-Based member's ratio denominator — §13.1's actual rule), `CONCURRENT_COUNTED` (both may be used at once, but the Fixed member's amount *does* count toward the ratio denominator — meaning it typically contributes nothing beyond the ratio ceiling), `ALTERNATIVE` (mutually exclusive, OR semantics — one path chosen, best result reported, other path's non-modeled status doesn't block the group), `MUTUALLY_EXCLUSIVE` (cannot be used together, no OR/best-of semantics — using one forecloses the other entirely), and `UNKNOWN` (relationship not yet established — fail-closed, see §8).
- **Independent constraint system** — debt-incurrence permissions and lien permissions form two *separate* feasibility problems for the same proposed dollar amount; the joint answer is (generally) the minimum of the two systems' independently-solved maxima, not a single blended tree (Conclusion 2).
- **Transaction assumption** — a value the *proponent of a hypothetical transaction* supplies (interest rate, EBITDA adjustment, funding source, concurrent repayment, transaction date), distinct in kind from a **financial fact** the company has actually reported or reconstructed. The engine must never let one silently stand in for the other (Conclusion 8/10).
- **Financial input provenance** — every financial fact used in a calculation carries where it came from and whether it's been verified, using the same three-state pattern (`UNVERIFIED`/`VERIFIED`/`DISPUTED`) the codebase already applies to `DefinedTerm` (Conclusion 10).
- **Covenant applicability / contractual path** — whether a given financial covenant (e.g., CA §6.11) is a condition of the specific transaction path being tested is itself a fact that must be declared per path, not assumed true for every debt incurrence merely because the covenant exists in the document (Conclusion 5).
- **Measurement basis** (usage/replenishment semantics) — `CUMULATIVE_INCURRED` (never reduced by repayment — a lifetime-usage/builder-style measure), `CURRENTLY_OUTSTANDING` (recomputed fresh from the latest balance — automatically "replenishes" as debt is repaid), `NET_OF_REPAYMENT` (nets cumulative incurrence against cumulative repayment via ledger events specifically, distinct from both of the above) (Conclusion 9).

---

## 4. Proposed schema changes (no migration yet)

All changes below are additive/nullable except where flagged — the goal is a document with no `Permission`/`PermissionRelationship` rows populated to evaluate **identically** to today via the legacy `CapacityExpr` path.

**`CovenantProvision`** (extended in place — a Permission *is* a richer CovenantProvision, not a parallel table):
- `grants: PermissionGrant?` (`DEBT_INCURRENCE` | `LIEN`) — nullable; existing rows that aren't debt/lien permissions (RP baskets, ratio gates, asset-sale thresholds) simply leave this null and are unaffected by the new allocator.
- `amountKind: AmountKind?` (`FIXED` | `INCURRENCE_BASED`) — nullable, informational/organizational; the actual capacity math still comes from `formulaType`. Present mainly so the allocator can group permissions without re-deriving amount kind from `formulaType` (a `FLAT_NET_OF_DEBT` basket is `FIXED` but reads a live balance, which is exactly the kind of thing that shouldn't be inferred from the formula type alone).
- `measurementBasis: MeasurementBasis?` (`CUMULATIVE_INCURRED` | `CURRENTLY_OUTSTANDING` | `NET_OF_REPAYMENT`) — nullable. Decoupled from `formulaType` per Conclusion 9.
- `alternativeGroupId: String?` — permissions sharing a group id are members of an OR relationship (redundant with, but simpler than, always going through `PermissionRelationship` for the common alternative-group case; `PermissionRelationship` remains the mechanism for pairwise stacking rules that aren't simple groups).
- `modelingStatus: ModelingStatus` (`MODELED` | `KNOWN_NOT_MODELED`), default `MODELED`. A `KNOWN_NOT_MODELED` row records that a permission/covenant is known to exist per the document but hasn't been entered — see Open Questions on whether `formulaType` needs to become nullable to fully support this.

**New table `PermissionRelationship`**:
```
id            String   @id
companyId     String
permissionAId String   // -> CovenantProvision.id
permissionBId String   // -> CovenantProvision.id
relationship  StackingRelationshipType  // CONCURRENT_DISREGARDED | CONCURRENT_COUNTED | ALTERNATIVE | MUTUALLY_EXCLUSIVE | UNKNOWN
disregardedPermissionId String?  // for CONCURRENT_DISREGARDED: which of A/B is excluded from the other's ratio denominator (may need both directions modeled if mutual)
sectionRef    String?  // citation for the relationship itself (e.g. "§13.1"), not just the two permissions it connects
notes         String?
createdAt     DateTime @default(now())
```
No default rows for Coherent are proposed here — see §10 Migration Plan step 8 and Open Questions on why the basket-by-basket table isn't populated yet.

**`Document.capacityFormulas` (`CapacityExpr` JSON shape)**: add a new node type `{ op: "ALT", items: CapacityExpr[], label?: string }` alongside the existing `REF`/`SUM`/`MIN`/`MAX`, with its own status-combination rule (§6 below) — this is the minimal, isolated fix for the P0 §2.2 bug and does not require the larger allocator to ship first.

**`FinancialSnapshot`**: add `provenance: Json?` — a map keyed by field name (`ebitda`, `cash`, `interestExpense`, …) to `{ sourceType: FinancialSourceType, reviewStatus: DefinedTermStatus, notes?: string }`. Reuses the existing `DefinedTermStatus` enum rather than inventing a parallel one. New enum `FinancialSourceType`: `REPORTED_GAAP` | `COVENANT_DEFINED_RECONCILIATION` | `RECONSTRUCTED_ESTIMATE` | `TRANSACTION_ASSUMPTION`.

**`assumedNewDebtRatePct` is removed from `FinancialSnapshot`** (a breaking change, called out explicitly rather than left as a silent behavior change) and replaced by a required field on the new engine-layer `TransactionAssumptions` type (§7 below) — it was never a financial fact in the first place.

**Simulation-result status**: extend `TransactionStatus` with `transaction_assumption_required` — distinct from `review_required`, because the caller-facing remedy is different ("supply a rate" vs. "a human needs to resolve something about the covenant package").

**Deliberately NOT proposed** (to avoid overbuilding, per the explicit instruction on financial provenance): no new `TransactionAssumptions` Prisma model (kept as a pure engine-layer parameter type unless/until scenario-saving becomes a real product requirement — see Open Questions); no wrapping of every scalar financial field in its own row/table; no schema representation of the allocation *algorithm* itself (that's engine code, not data).

---

## 5. Proposed engine changes (no implementation yet)

- **New pure functions**, additive alongside the existing `evaluateProvision`/`evalExpr`/`computeCovenantPosition`:
  - `evaluatePermissionAllocation(permissions, relationships, targetAmount, financials, assumptions) → AllocationResult` — the core allocator (§6).
  - `maxFeasibleAmount(permissions, relationships, financials, assumptions) → { amount, status, trace }` — the "what's the ceiling" counterpart, built on the same allocator (§6, monotone search).
- **`ALT` node evaluation** in `evalExpr`: status = `modeled` if **at least one** member is `modeled` (using the best modeled member's value, and recording which member was actually relied upon); only falls to `worstStatus` of all members if **zero** members are modeled. This is the opposite combination rule from `SUM`/`MIN`/`MAX`, and is the one isolated, shippable-first fix from this design.
- **`SUM` becomes conditional, not unconditional.** For a document that has `Permission`/`PermissionRelationship` data populated, `capacityFormulas`'s hand-authored `SUM` nodes for debt/lien baskets are **superseded** by the allocator (see Migration Plan — this is an opt-in, per-document transition, not a flag day). For documents without that data (including, initially, every non-debt/lien basket even within the indenture — RP, asset-sale), `SUM`/`MIN`/`MAX` continue to mean exactly what they mean today.
- **Debt/lien independence**: `computeCovenantPosition`'s per-document secured/unsecured evaluation gains a parallel path that, when a document has `grants`-tagged permissions, computes `debtSideMax` and `lienSideMax` as two independent `maxFeasibleAmount` calls and combines them as `min(debtSideMax, lienSideMax)` **unless** an explicit cross-side `PermissionRelationship` (a `REQUIRES_MATCHING_LIEN`-style pairing — see Open Questions on whether this relationship type is needed for Coherent specifically) says otherwise.
- **`TransactionAssumptions` becomes a required parameter** wherever a capacity or simulation result would depend on an assumption (specifically: any `COVERAGE_RATIO_ROOM`-driven number, and any allocation involving a `CONCURRENT_DISREGARDED` relationship that needs to know the transaction's actual $ split across permissions). `simulateDebtIncurrence`'s signature changes from `(data, position, amount, secured)` to `(data, position, request: { amount, secured, assumptions: TransactionAssumptions })`.
- **Financial-fact provenance is read alongside the raw value** wherever a `FinancialSnapshot` field feeds a calculation, and surfaced in the trace (§9) — this does not change any *number*, it changes what's returned *alongside* the number.

---

## 6. Proposed simulation algorithm

This directly answers Design Question C.

**Inputs**: a proposed transaction (`amount`, `secured: boolean`, `assumptions: TransactionAssumptions`), the applicable `Permission` rows for the relevant grant type(s), the `PermissionRelationship` rows connecting them, current financials.

**Step 1 — partition by grant type.** If `secured`, both a debt-side (`grants: DEBT_INCURRENCE`) and a lien-side (`grants: LIEN`) feasibility problem must be solved; if unsecured, debt-side only.

**Step 2 — per side, enumerate elections.** An *election* is a specific subset of that side's permissions chosen to be drawn upon for this transaction, subject to: no two members of the same `ALTERNATIVE` group both included; no two `MUTUALLY_EXCLUSIVE` permissions both included. In practice, real covenant packages have a small number of debt/lien permissions per side (Coherent's indenture: 4 debt-side, 2 lien-side), so brute-force enumeration over the power set (bounded, e.g., capped at 20 permissions per side before falling back to a documented heuristic — see Open Questions) is tractable; this is not proposed as an asymptotically scalable general-purpose SAT solver, and doesn't need to be for the sizes covenant packages actually have.

**Step 3 — evaluate each election's achievable total.** For each candidate election:
- Split members into `FIXED` and `INCURRENCE_BASED`.
- For each `INCURRENCE_BASED` member, compute its capacity using pro forma debt that **excludes** the amount attributed to any `FIXED` member related to it by `CONCURRENT_DISREGARDED`, and **includes** the amount attributed to any `FIXED` member related to it by `CONCURRENT_COUNTED`. (If the relationship between two members the election wants to use concurrently is `UNKNOWN`, this election is **not evaluable** — see Step 5.)
- If a `CONCURRENT_DISREGARDED` relationship fully decouples a `FIXED` member from an `INCURRENCE_BASED` member's denominator, the pair's combined achievable amount is the **sum** of each member's own standalone capacity (this is the case that produces additive stacking — and it is *derived*, per election, from relationship data, not hard-coded as a universal engine behavior for every `FIXED`+`INCURRENCE_BASED` pair).
- If the relationship is `CONCURRENT_COUNTED`, the `FIXED` member contributes **no increment** beyond the `INCURRENCE_BASED` member's own ceiling (using it doesn't cost anything, but doesn't unlock anything either, unless the `FIXED` member independently caps the same dollars lower, in which case the pair's combined capacity is `min` of the two).
- For elections where **two or more `INCURRENCE_BASED` members** are drawn upon concurrently (their capacities each depend on a pro forma debt level partly determined by the other), solve for the joint feasible total via monotone bisection over the total amount `X` (each member's own capacity function is non-increasing in pro forma debt, so "does a feasible split of `X` exist across this election's members" is itself monotone in `X`, making bisection a robust, generic fallback that doesn't require a closed-form solution to be hand-derived for every relationship shape). Coherent's current data never exercises this case (at most one `INCURRENCE_BASED` permission per side is drawn upon at a time in the existing baskets) — flagged as an open question on whether it needs to be built now.

**Step 4 — take the best election.** The side's `maxFeasibleAmount` is the maximum achievable total across every **evaluable** election (Step 3); the specific election achieving it becomes the `electionUsed` in the trace, and every other election with a lower total (or that wasn't chosen) is recorded as an `unusedAlternativePath`.

**Step 5 — track un-evaluable elections separately.** Any election that couldn't be fully evaluated because a required `PermissionRelationship` is `UNKNOWN` is **excluded from the "known feasible" maximum** but is **not discarded** — if its potential contribution (computed optimistically, i.e., assuming the best-case relationship type) would exceed the known-feasible maximum, that's surfaced as an explicit `unresolvedReviewItems` entry ("a higher amount may be available pending confirmation of X vs. Y's stacking terms"), never silently dropped.

**Step 6 — combine sides.** For `secured=true`, the joint result is `min(debtSideMax, lienSideMax)` unless a cross-side `PermissionRelationship` says a specific debt permission is only securable via a specific lien permission (an explicit pairing, not assumed).

**Step 7 — status.** `modeled`/`clear` only if the winning election on every required side is fully evaluable with no `UNKNOWN` relationships and every required `TransactionAssumptions` field is present; otherwise `review_required` or `transaction_assumption_required` per §8.

This algorithm explicitly does **not** assume the answer is always `MIN` or always `SUM`: it derives which combinator applies, per pair, per election, from relationship data — `MIN` remains correct *across* the two independent debt/lien systems (Conclusion 2's actual claim), and `SUM` remains correct *within* a stacking group whose members are genuinely `CONCURRENT_DISREGARDED` (which is a real, common case — the point isn't that `SUM` is wrong, it's that treating `SUM` as an unconditional engine default is wrong).

---

## 7. Financial provenance design

(Design Question F.) Deliberately minimal — one JSON column, not a new accounting subsystem.

```ts
interface FinancialFieldProvenance {
  sourceType: "REPORTED_GAAP" | "COVENANT_DEFINED_RECONCILIATION" | "RECONSTRUCTED_ESTIMATE" | "TRANSACTION_ASSUMPTION";
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED";  // reuses DefinedTermStatus's existing three states
  notes?: string;
}
// FinancialSnapshot.provenance: Record<keyof FinancialSnapshotInput, FinancialFieldProvenance>
```

`value` and `asOfDate` are **not** duplicated inside the provenance object — they already exist as the `FinancialSnapshot`'s own columns; provenance is a sidecar describing *how much to trust* each already-stored value, mirroring exactly how `DefinedTerm.status` sits alongside `DefinedTerm.fullText` today rather than wrapping it.

`assumedNewDebtRatePct` is explicitly **not** part of `FinancialSnapshot.provenance` — it's being removed from `FinancialSnapshot` entirely (§4) because a `TRANSACTION_ASSUMPTION`-sourced value living on a "known facts as of a date" table is exactly the conflation Conclusion 10 flags. `TransactionAssumptions` fields don't need the same provenance envelope — by construction, everything in that type *is* a transaction assumption; provenance tracking is for distinguishing *within* the facts table, not for the assumptions type.

The engine does **not** block a `modeled` result merely because a required input has `reviewStatus: UNVERIFIED` — an estimate is still usable for planning, consistent with this product's existing design (every number on Position already carries an "unverified" defined-term badge without that blocking the number itself). What changes is that the **trace** (§9) always surfaces the provenance, and any caller (a golden test, a UI banner, a future export) that wants to gate on verification status now has something to gate on, which doesn't exist today.

---

## 8. Fail-closed design

(Design Question I.) One rule change and five specific cases.

**Rule change**: `status: "clear"` may only be returned when every permission and relationship actually relied upon by the **winning election** is fully modeled with a known, non-ambiguous relationship type, and every `TransactionAssumptions` field required by that election is present. A permission or relationship that exists but isn't part of the winning election doesn't block the result — but it does get surfaced (§9).

| Case | Status | Reasoning |
|---|---|---|
| A permission is known to exist but not modeled | `review_required`, reason cites the specific known-but-unmodeled permission | Distinguished from `not_tested` ("nothing recorded") by the new `modelingStatus: KNOWN_NOT_MODELED` field — `not_tested` remains "we never looked," `review_required` becomes "we know there's a gap." |
| Stacking relationship between two permissions the transaction wants to use concurrently is `UNKNOWN` | That specific election excluded from the known-feasible maximum; `unresolvedReviewItems` entry if it could matter (§6 Step 5) | Never silently assume `CONCURRENT_DISREGARDED` (most favorable) or `MUTUALLY_EXCLUSIVE` (least favorable) — both are guesses. |
| Required financial input is reconstructed/unverified | Result still `modeled`, but provenance surfaced in the trace | Per §7 — an estimate remains usable; the point is visibility, not blocking. |
| Transaction interest rate absent, needed to convert a ratio into a dollar figure | `transaction_assumption_required` | New, distinguishable from `review_required` because the remedy is "supply an assumption," not "a human must resolve ambiguity in the covenant package." |
| Applicability of a covenant (e.g., CA §6.11) to the specific path being tested requires legal judgment and isn't resolved by data | `review_required`, reason names the covenant and the undetermined path | Never assume universal applicability (today's bug) *or* universal inapplicability. |
| Multiple interpretations remain genuinely possible | `review_required`, **both** candidate interpretations and their respective numbers reported in the trace | Never silently pick one. |

---

## 9. Explainability — structured trace

(Design Question H.) Extends, rather than replaces, the existing `EvaluatedProvision`/`DocumentCapacityResult`/`LabeledSubtotal` machinery — those remain exactly right for a single-permission, non-stacked evaluation; this is what a *multi-permission allocation* additionally needs to report.

```ts
interface CapacityAllocationTrace {
  transactionTested: { amount: number; secured: boolean; asOfDate: Date };
  transactionAssumptionsUsed: { field: string; value: unknown; provided: "explicit" | "missing" }[];
  debtSide: PermissionSideTrace;
  lienSide?: PermissionSideTrace;   // absent for unsecured
  bindingConstraint: { side: "debt" | "lien"; permissionCode: string; reason: string } | null;
  financialInputsUsed: { field: string; value: number; asOfDate: Date; sourceType: string; reviewStatus: string }[];
  unresolvedReviewItems: { reason: string; affectedPermissions: string[] }[];
  status: TransactionStatus;
}

interface PermissionSideTrace {
  electionUsed: {
    permissionCode: string;
    amountKind: "FIXED" | "INCURRENCE_BASED";
    measurementBasis: string;
    standaloneCapacity: number;
    amountAllocated: number;
    concurrentTreatment?: { withPermissionCode: string; relationship: string; disregardedFromRatio: boolean };
    historicalUsage: { cumulativeIncurred?: number; currentlyOutstanding?: number };
    ratioCalculation?: { measure: number; threshold: number; proFormaDebtUsed: number };
    sourceProvision: CovenantProvisionInput;  // reuses the existing citation type as-is
  }[];
  unusedAlternativePaths: { permissionCode: string; wouldHaveContributed?: number; whyNotUsed: string }[];
  maxFeasibleAmount?: number;
  status: TransactionStatus;
}
```

Every field above maps onto something the task's Design Question H explicitly asked to be recoverable: transaction tested, debt/lien permissions used, fixed amounts allocated, ratio permissions allocated and their calculations, concurrent-use treatment, historical usage, financial inputs, transaction assumptions, binding constraint(s), unused alternative paths, source provisions, unresolved review items.

---

## 10. Migration plan

Ordered so existing functionality is preserved at every step — nothing here is a flag day.

1. **Add the `ALT` node type and fix its status semantics** (§5). This is a small, isolated, immediately-shippable P0 fix, independent of everything else in this document. Update Coherent's indenture `unsecured` formula from `MAX` to `ALT` (a **data** change, not a schema change). No other document/company is affected since no other document currently uses `MAX`.
2. **Add the new nullable/additive `CovenantProvision` fields** (`grants`, `amountKind`, `measurementBasis`, `alternativeGroupId`, `modelingStatus` defaulting to `MODELED`) and the new `PermissionRelationship` table (empty by default). Zero behavior change — nothing reads these fields yet.
3. **Add `FinancialSnapshot.provenance`** (nullable) and backfill Coherent's existing snapshot with the current EBITDA-reconstruction provenance (`RECONSTRUCTED_ESTIMATE` / `UNVERIFIED`). Zero behavior change to any computed number.
4. **Remove `assumedNewDebtRatePct` from `FinancialSnapshot`; introduce `TransactionAssumptions`** as an engine-layer parameter type; change `simulateDebtIncurrence`'s signature to require it. This *is* a breaking change to every call site (all internal to this codebase today — no external API consumers) and to the golden-test harness's `DEBT_SIMULATION`/`RP_SIMULATION` query handling (they'll need to supply an explicit rate in `queryParams` going forward rather than relying on the snapshot default). Every existing `COVERAGE_RATIO_ROOM`-driven golden row must be updated to pass the rate explicitly at this step, or it will correctly start returning `transaction_assumption_required` — that's the intended, fail-closed behavior, not a regression to fix around.
5. **Add `transaction_assumption_required` to `TransactionStatus`.**
6. **Build the allocation algorithm (§6) as new, additive engine functions.** Nothing existing calls them yet.
7. **Wire the allocator in, opt-in per document**: `computeCovenantPosition`'s per-document evaluation checks whether a document has any `grants`-tagged permissions; if so, use the new allocator for that document's secured/unsecured capacity; if not, fall back to the existing `CapacityExpr` tree evaluation exactly as today. This means Coherent's Credit Agreement (no debt/lien permission tagging yet) and every other company's documents keep working unmodified while only the Indenture's debt/lien baskets — once tagged — get the richer treatment.
8. **Populate Coherent's `Permission`/`PermissionRelationship` data for the indenture's debt+lien baskets.** **Blocked** on obtaining the basket-by-basket stacking table from counsel (the approved conclusions state the general §13.1 rule, not which specific pairs of Coherent's baskets are `CONCURRENT_DISREGARDED` vs. `CONCURRENT_COUNTED` vs. `ALTERNATIVE`) — see Open Questions. Do not guess this data to make the migration "complete."
9. **Recompute and update the affected `golden_tests` rows** (§ Golden-test impact matrix below) once step 8's data is legally confirmed. Explicitly out of scope for this design phase.
10. **Extend `ProvisionTrace`/Position/Simulate UI** to render `CapacityAllocationTrace` for documents using the new allocator, falling back to today's rendering for documents still on the legacy tree. Last, since it's presentation-layer.

---

## 11. Tests required before implementation can be considered complete

- `ALT` status-propagation: one alternative `review_required`/`not_tested`, the other fully `modeled` → group result is `modeled`, using the modeled path, with the other path recorded as an unused alternative (not silently dropped, not blocking).
- Allocation algorithm, isolated cases: (a) `CONCURRENT_DISREGARDED` FIXED+INCURRENCE_BASED pair → additive result equals the sum of standalone capacities; (b) `CONCURRENT_COUNTED` pair → non-additive, capped at the ratio ceiling; (c) `ALTERNATIVE` group → best-path selection, with the correct path recorded and the other reported as unused; (d) `MUTUALLY_EXCLUSIVE` → the invalid combined election is correctly excluded from consideration; (e) `UNKNOWN` relationship on an election that *could* be binding → `review_required`/`unresolvedReviewItems`, not silently included or silently excluded.
- Debt/lien independence: a synthetic company where lien capacity is tighter than debt capacity for some `X`, and a second synthetic company where the reverse holds — both must correctly attribute the binding side and combine via `min` across the two independent systems.
- `TransactionAssumptions`: a `COVERAGE_RATIO_ROOM`-backed query with no rate supplied returns `transaction_assumption_required`, never a fabricated number; the same query with a rate supplied returns a number and records the supplied rate in the trace as an explicit assumption, not a fact.
- Financial-provenance visibility: an evaluation using an `UNVERIFIED` input still returns a usable, `modeled` result, but the trace's `financialInputsUsed` correctly carries `sourceType`/`reviewStatus` for that field.
- Measurement basis: three synthetic permissions, one each of `CUMULATIVE_INCURRED`/`CURRENTLY_OUTSTANDING`/`NET_OF_REPAYMENT`, proving a repayment ledger event affects each differently and correctly — extends the existing `tests/ledger-regression.test.ts` pattern rather than replacing it.
- **Backward-compatibility regression**: every one of the existing 23 vitest tests and the 29 executable golden rows must still pass, byte-for-byte, for any document that hasn't opted into the new `Permission` data (step 7's fallback path) — this is the hard requirement that makes the migration additive rather than a rewrite.
- A new synthetic-second-company test (extending `tests/synthetic-company.test.ts`'s pattern) exercising concurrent stacking specifically, with **its own**, differently-shaped stacking rules from Coherent's, proving zero Coherent-specific branching in the allocator.

---

## 12. Open questions

Genuine unresolved engineering/model questions — none of these reopen the 10 approved legal conclusions.

1. **Coherent's basket-by-basket stacking table isn't specified yet.** The approved conclusions establish the *general* §13.1 rule and the *general* independence of debt/lien tests; they don't say, e.g., whether `facility_flat` and `mila_secured` are specifically `CONCURRENT_DISREGARDED`, `CONCURRENT_COUNTED`, or `ALTERNATIVE` with respect to each other. This blocks recomputing Q1/Q3/Q22/DB-row-25 (and Q2/Q4 for the CA side) — see the impact matrix below.
2. **Which CA unsecured/secured incurrence paths actually condition on §6.11 compliance?** Needed before Q2/Q4/DB-row-25 can be recomputed. Conclusion 6 confirms the CA has its own fixed+ratio stacking mechanics but doesn't specify them structurally the way §13.1 was quoted for the indenture.
3. **Does the N-way concurrent `INCURRENCE_BASED` case (§6 Step 3's bisection fallback) actually arise in Coherent's documents**, or is it always at-most-one-ratio-permission per election in practice? Determines whether the bisection fallback needs to be built now or can be deferred as dead code for the current dataset.
4. **Should `TransactionAssumptions` be persisted** (a named, savable/reusable scenario) or remain purely request-scoped? Affects whether a new Prisma model is warranted or the pure engine-layer type (as proposed) suffices. No product requirement for scenario-saving exists yet.
5. **Does `modelingStatus: KNOWN_NOT_MODELED` require `formulaType` to become nullable?** A stub row for a known-but-unmodeled permission currently has nowhere to "park" without a formula. Proposed to leave `formulaType` required and simply never evaluate it when `modelingStatus` is `KNOWN_NOT_MODELED`, but this needs confirmation it doesn't create a confusing "meaningless required field" situation.
6. **Does §13.1 (or an analogous provision) also govern the Restricted Payments basket waterfall?** The RP waterfall has a structurally similar Fixed(builder)+Fixed(general)+ratio-gate shape. The approved conclusions are explicitly scoped to "Debt & Liens Capacity"; RP/Investments were explicitly excluded from the v1 review. Flagging, not assuming either way — consistent with RP/Investment/asset-sale golden rows already being tracked as a separate scope track from the v1 debt/lien set.
7. **Is a cross-side `REQUIRES_MATCHING_LIEN`-style `PermissionRelationship` actually needed for Coherent**, or does plain `min(debtSideMax, lienSideMax)` (Conclusion 2's default) fully describe the indenture's structure? Needs confirmation before assuming the simpler combinator suffices.
8. **Election-enumeration complexity budget.** Brute-force power-set enumeration (§6 Step 2) is fine at Coherent's scale (4 debt-side, 2 lien-side permissions). A documented fallback (e.g., a heuristic/greedy solve with an explicit approximation caveat) should exist before a hypothetical Company B with many more permissions per side is onboarded, but isn't a blocker now.

---

## Appendix: Golden-test impact matrix (all 30 `golden_tests` rows)

**Important note on numbering**: the DB's insertion-order row numbers (`n`) do **not** align 1:1 with the v1 document's own `Q1`–`Q25` numbering. 20 of the 30 DB rows map onto v1 questions (v1 `Q5` and `Q23`–`Q25` were never turned into executable rows — flagged in the prior phase — and v1 `Q17` is represented as two partial spot-check rows rather than one). The remaining 8 DB rows (`n=23`, `n=25`–`30`) are pre-v1 additions: `n=23` and `n=25` are debt-capacity-adjacent rows added before the v1 legal review existed; `n=26`–`30` are Restricted Payment / Investment / Asset Sale rows, which v1 **explicitly excludes** from its stated scope, and which none of the 10 approved conclusions address at all.

| n | v1 Q# | Question (abbreviated) | Classification | Why |
|---|---|---|---|---|
| 1 | Q1 | Max secured debt today ($4,041M) | EXPECTED_TO_CHANGE | Assumes `mila_secured`'s ratio result is an absolute ceiling with no Fixed-Amount concurrent stacking (Concl. 1/3), and doesn't independently solve debt-vs-lien via a real allocator (Concl. 2/4). True capacity may be higher. Blocked on Open Q1 (basket-by-basket stacking table) + the allocator existing. |
| 2 | Q2 | Max unsecured debt today ($5,129M) | LEGAL_JUDGMENT_REQUIRED | CA §6.11 currently modeled as a universal ceiling (Concl. 5). Need to know which unsecured-incurrence path(s) actually condition on it. Open Q2. |
| 3 | Q3 | Binds Q1's answer | EXPECTED_TO_CHANGE | Tracks Q1 exactly. |
| 4 | Q4 | Binds Q2's answer | LEGAL_JUDGMENT_REQUIRED | Tracks Q2 exactly. |
| 5 | Q6 | $100M secured permitted? | UNAFFECTED | Verdict ("yes") is robust: capacity can only increase under stacking, never decrease, and $100M already clears comfortably under today's understated number. Binding-provision citation may broaden once the allocator can name multiple concurrently-available permissions, but the yes/no answer itself doesn't change. |
| 6 | Q7 | $250M secured permitted? | UNAFFECTED | Same reasoning as row 5. |
| 7 | Q8 | $500M secured permitted? | UNAFFECTED | Same reasoning as row 5. |
| 8 | Q9 | $1,000M secured permitted? | UNAFFECTED | Same reasoning as row 5. |
| 9 | Q10 | $100M unsecured permitted? | REQUIRES_ASSUMPTION | Question doesn't specify which unsecured-incurrence path is being tested; per Concl. 5 the engine must know that before citing §6.11 (or anything else) as the binding test. The "yes" verdict is very likely robust at this size, but the *correctness of citing `ca_leverage_cap`* specifically is now open. |
| 10 | Q11 | $250M unsecured permitted? | REQUIRES_ASSUMPTION | Same as row 9. |
| 11 | Q12 | $500M unsecured permitted? | REQUIRES_ASSUMPTION | Same as row 9. |
| 12 | Q13 | $1,000M unsecured permitted? | REQUIRES_ASSUMPTION | Same as row 9. |
| 13 | Q14 | FCCR threshold / current FCCR | UNAFFECTED | Pure ratio-fact query using *actual current* interest expense — no assumed rate, no dollar-capacity fabrication. Remains valid as a test of the ratio computation itself. |
| 14 | Q15 | TNL threshold (CA) / current TNL | UNAFFECTED | Same reasoning as row 13 — a fact query, not a capacity query. Valid regardless of whether §6.11's *applicability to a given debt path* changes. |
| 15 | Q16 | SSNL threshold / current SSNL | UNAFFECTED | Same reasoning as row 13. |
| 16 | Q17 (partial) | SSNL binding spot check @ $2,000M | EXPECTED_TO_CHANGE | Depends on Q1's corrected capacity function; a spot-check of whether the indenture still binds at this amount needs re-running once stacking is modeled. |
| 17 | Q17 (partial) | SSNL binding spot check @ $4,041M ceiling | EXPECTED_TO_CHANGE | Same as row 16; the $4,041M reference point itself is Q1's (pre-remediation) number. |
| 18 | Q18 | Credit Facilities flat basket size ($1,779M) | UNAFFECTED | Tests a single permission's own standalone formula (`FLAT_NET_OF_DEBT` against current secured debt) — unaffected by how it gets *combined* with other permissions, which is a separate question this row doesn't ask. Remains a valid, reusable building-block test. |
| 19 | Q19 | General debt basket size ($680M) | UNAFFECTED | Same reasoning as row 18 (`GREATER_OF_FLAT_OR_PCT_EBITDA`, no cross-permission interaction in its own formula). |
| 20 | Q20 | General liens basket size ($680M) | UNAFFECTED | Same reasoning as row 18. |
| 21 | Q21 | MILA unsecured formula / $10,153.85M (FCCR path controls) | EXPECTED_TO_CHANGE | Directly implicates Concl. 7 (OR representation — currently `MAX`, should be `ALT`) *and* Concl. 8 (the dollar figure is FCCR-derived using the snapshot's implicit rate, not a confirmed transaction assumption). Should return `transaction_assumption_required` unless/until a rate is supplied explicitly as part of the query. |
| 22 | Q22 | $500M secured incurred, remaining capacity ($3,541M) | EXPECTED_TO_CHANGE | `remaining = Q1's answer − 500`; tracks Q1 exactly. |
| — | Q23 | (not an executable row) Sequential $2,000M unsecured after Q22 | REQUIRES_NEW_ENGINE_CAPABILITY | No pro-forma-chaining API exists (flagged in prior phase); also inherits Q2's §6.11-applicability question once chaining exists. |
| — | Q24 | (not an executable row) $300M repayment restores capacity? | REQUIRES_NEW_ENGINE_CAPABILITY | The prior phase's manual verification already found the mechanistically correct answer (facility_flat moves dollar-for-dollar with the repayment) — Concl. 9 confirms the underlying principle. What's missing architecturally is `measurementBasis` as an explicit field rather than an accident of `FormulaType` choice; today's specific number is likely already right, the generalization isn't there yet. |
| — | Q25 | (not an executable row) EBITDA growth needed for +$500M | REQUIRES_NEW_ENGINE_CAPABILITY | Needs a "solve for X" capability that doesn't exist, *and* depends on Q1's corrected capacity function. |
| 23 | *(pre-v1, not numbered in v1)* | $1,000M secured, pro forma TNL | UNAFFECTED | The "cleared" verdict is robust (same reasoning as row 5); pro forma TNL is pure arithmetic `(debt+1000−cash)/EBITDA`, doesn't test a threshold, unaffected by capacity-modeling changes. |
| 24 | *(v1's redesignation question)* | Redesignation impact on secured capacity | OUT_OF_SCOPE | Unaffected — remains explicitly out of scope for this phase, as before. |
| 25 | *(pre-v1, not numbered in v1)* | CA's own secured capacity standalone ($5,129M) | LEGAL_JUDGMENT_REQUIRED | Directly implicates Concl. 5, same root cause as row 2/4 — this row *is* `ca_leverage_cap`/`ca_coverage_cap`'s `MIN` today. |
| 26 | *(not in v1 — RP scope)* | $200M dividend w/ $150M pool used | OUT_OF_SCOPE | v1 explicitly excludes Restricted Payments/Investments; none of the 10 approved conclusions address RP mechanics. Needs its own legal review before being touched. |
| 27 | *(not in v1 — RP scope)* | $3,000M dividend, spills to general basket | OUT_OF_SCOPE | Same reasoning as row 26. |
| 28 | *(not in v1 — RP scope)* | $6,000M Investment via ratio gate | OUT_OF_SCOPE | Same reasoning as row 26. |
| 29 | *(not in v1 — RP scope)* | $300M asset sale, offer triggered | OUT_OF_SCOPE | Same reasoning as row 26 (asset sales also outside v1's stated scope). |
| 30 | *(not in v1 — RP scope)* | Dividend not tested against CA's own RP covenant | OUT_OF_SCOPE | Same reasoning as row 26. |

**Summary**: 9 UNAFFECTED · 8 EXPECTED_TO_CHANGE · 4 REQUIRES_ASSUMPTION · 4 REQUIRES_NEW_ENGINE_CAPABILITY · 4 LEGAL_JUDGMENT_REQUIRED · 6 OUT_OF_SCOPE (30 total). No expected answers have been changed to match current engine output, and none have been guessed at a new value — per instruction, `EXPECTED_TO_CHANGE`/`LEGAL_JUDGMENT_REQUIRED` rows are left exactly as they are pending the Open Questions above being resolved by counsel.
