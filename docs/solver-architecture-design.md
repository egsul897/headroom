# Headroom — Generalized Solver Architecture Design

**Status: design only.** No schema, engine code, `CapacityExpr`, seed data, golden tests, or UI have been modified to produce this document. This is the implementation blueprint for Headroom's generalized Phase 1 contractual transaction solver, written against the ontology frozen by `docs/targeted-ontology-closure-test.md` §L ("Revised minimal ontology") and §S ("Final recommendation: READY_FOR_SOLVER_DESIGN"). It does not reopen any legal conclusion already settled through `docs/legal-model-remediation-design.md`, `docs/cross-document-ontology-stress-test.md`, or `docs/targeted-ontology-closure-test.md`.

Scope discipline, stated once so it does not need repeating in every section: **Phase 1 answers whether proposed debt can be incurred and secured, at what priority, subject to shared/entity/currency/dynamic-applicability constraints.** It explicitly excludes the LME/enforcement-control regime (standstill, turnover, foreclosure control, DIP, mixed-collateral proceeds waterfalls) that Round 2 §D/§L/§R evidenced from real intercreditor agreements and deliberately deferred — those are named as future primitives, not designed here, and not implemented here.

---

## A. Executive architecture decision

Headroom's current engine (`lib/covenant-engine.ts`) answers "how much capacity exists" with **one precomputed number per document per side**, produced by evaluating a static, hand-authored `CapacityExpr` tree (`REF`/`SUM`/`MIN`/`MAX`) over a flat set of `CovenantProvision` rows, then taking `min()` across documents (`combineCrossDocument`). That architecture is correct for what it was built to prove — company-agnostic evaluation of seven `FormulaType` archetypes — but it structurally cannot express what the two ontology-research rounds established as *real, contractual data*: which permissions stack, which are alternatives, which share a cap across documents, which lien follows which debt automatically, which collateral pool a priority attaches to, or which rule turns on only in certain states. The tree shape (`SUM` = always additive, `MIN` = always all-must-hold, `MAX` = take the higher) is authored once by whoever writes the seed JSON; the ontology work proved that shape is itself a fact about the document, not an engine author's assumption.

**Decision: replace the *composition* layer (not the *leaf calculation* layer) with a generalized permission-and-constraint graph evaluated by a bounded election-enumeration solver, keep `CapacityExpr`/`FormulaType` as a permanent, first-class fallback for provisions not yet re-modeled, and combine the two through an explicit, auditable boundary (§Q) rather than a rewrite.**

Three things drive this decision, each traceable to a specific ontology finding rather than to architectural taste:

1. **The core product question is not reducible to MIN/MAX/SUM.** Round 2 §N classifies every mechanic actually encountered into seven solver problem classes (arithmetic, eligibility, allocation, constraint satisfaction, state transition, external-input dependency, human judgment) and finds the eventual engine must be "a combination... primarily a constraint/graph evaluator over permissions and shared constraints... with a state machine layer for dynamic applicability and cross-permission effects... and explicit boundary handling for external inputs and human judgment." No single combinator captures that.
2. **The reuse ratio is high enough to build now, but not 100%.** Round 2 §Q measures ~88% of newly-encountered real-world mechanics as representable through parameterization or generalization of already-proposed concepts, versus ~41% in Round 1. That is the evidentiary basis for `READY_FOR_SOLVER_DESIGN` (Round 2 §S) — it is not evidence that the *existing* `CapacityExpr` tree suffices; it is evidence that a *generalized permission graph* suffices, which is a different claim requiring a different runtime.
3. **The existing engine's own author-facing design already anticipated exactly this seam.** `legal-model-remediation-design.md` §5 proposes the allocator as new, additive functions living alongside `evaluateProvision`/`evalExpr`, wired in **opt-in per document** based on whether a document has `grants`-tagged permission data (§10 step 7). This design generalizes that seam — from "debt/lien stacking allocator" to "full permission-path solver" — without discarding the opt-in boundary itself, because the boundary is what makes the migration safe (§Q, §18/R24 of the task).

Headroom's engine therefore becomes two cooperating layers sharing one database and one result vocabulary:

- **Layer 1 — Leaf calculation (kept, extended).** `evaluateProvision`/`FormulaType` remains the place a single permission's own standalone capacity is computed from financial/external inputs. New leaf calculation types are added as new `FormulaType`-equivalent measurement rules (borrowing-base formula, currency conversion) exactly as the ontology work concluded (Round 2 §G, §J) — these are leaf-level, not relationship-level, so they extend the *existing* concept, not the new one.
- **Layer 2 — Composition/solver (new).** A permission graph (permissions, relationships, shared constraints, collateral pools, dynamic-activation rules, parameter-adjustment triggers) replaces the hand-authored `CapacityExpr` tree for any document that has been modeled into it, and answers the two core product questions (§B–§O below) through election enumeration plus per-election feasibility search, never through generative inference.

This is a **composition-over-configuration** architecture in the sense the task requires: an unfamiliar debt document is onboarded by entering `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`CollateralPool`/`RuleActivationCondition` rows against the fixed, already-validated ontology (§C), not by writing new solver code. Sections R and V make the "no company-specific source code" acceptance criterion (task §24) concrete.

---

## B. Solver inputs

A `SolverRequest` is a single structured object; nothing the solver needs may be implicit in ambient state. This is intentionally more explicit than `simulateDebtIncurrence(data, position, amount, secured)`'s current four positional arguments (`legal-model-remediation-design.md` §5 already flags this signature as needing to grow to accept `TransactionAssumptions`; this generalizes that conclusion).

```
SolverRequest {
  companyContext: {
    companyId: string
    asOfDate: Date                       // effective-dating anchor for documents/provisions (mirrors Document.effectiveFrom/To)
  }

  transaction: {
    transactionType: "DEBT_INCURRENCE" | "LIEN_GRANT" | "RESTRICTED_PAYMENT" | "ASSET_SALE" | ...  // extensible; Phase 1 solver focuses on DEBT_INCURRENCE (+ its automatic/linked LIEN_GRANT)
    amount: number
    currency: { code: string; }          // ISO code; see K "Currency / value measurement"
    incurringEntity: EntityRef           // which entity in the corporate family incurs the debt
    guarantorStatus: "GUARANTOR" | "NON_GUARANTOR" | "UNKNOWN"
    secured: boolean
    collateralPools: CollateralPoolRef[] // proposed pools to be secured on, if secured (may be empty pending determination -> REVIEW_REQUIRED)
    requestedLienPriority: PriorityTierRef[]  // per proposed pool: FIRST | SECOND | PARI_PASSU_WITH<X> | UNSECURED
    useOfProceeds: string                // free text + optional structured tag (e.g. "ACQUISITION", "REFINANCING", "GENERAL_CORPORATE")
    acquisitionRelated: boolean
    maturity?: Date
    weightedAverageLife?: number         // years; only relevant to WAL-floor term conditions
    interestRate?: { couponPct: number; allInYieldPct?: number }  // allInYieldPct needed for PARAMETER_ADJUSTMENT_TRIGGER evaluation (MFN)
    transactionDate: Date
  }

  financialState: {
    snapshotAsOf: Date
    ebitda, cash, interestExpense, totalDebt, securedDebt, cumulativeNetIncome,
    equityProceedsSinceIssue, liquidity, borrowingBaseInputs?: BorrowingBaseInputs,
    ratingsState?: RatingsRef[]
    // every field carries FinancialFieldProvenance (source + review status) — see K
  }

  historicalState: {
    basketUsage: BasketUsageRecord[]        // per permission/shared-constraint: cumulative incurred, outstanding, prepayment credits
    priorIncurrences: LedgerEventRef[]
    prepayments: LedgerEventRef[]
    reclassifications: ReclassificationRecord[]
    redesignations: RedesignationRecord[]
    elections: ElectionRecord[]             // e.g. LCA elections pending, equity-cure uses
    stepUpCooldownHistory: StepUpEventRecord[]
  }

  externalInputs: {
    borrowingBaseCertificate?: { asOfDate: Date; values: Record<string, number>; provenance: ExternalInputProvenance }
    reserves?: { named: Record<string, number>; discretionaryCatchAll?: number | "UNKNOWN" }
    ratings?: { agency: string; rating: string; asOfDate: Date }[]
    agentDeterminations?: AgentDeterminationRef[]
    collateralClassifications?: CollateralClassificationRef[]
  }

  assumptions: TransactionAssumptions   // rate, EBITDA adjustments, funding source, concurrent repayment, designated test date — see legal-model-remediation-design.md §4/§7; never a silent default
}
```

Design notes, each answering a specific requirement from task §3:

- **Provenance is not a bolt-on field, it is a wrapper type.** Every leaf value in `financialState` and `externalInputs` is carried as `{ value, sourceType, reviewStatus, notes? }` reusing `FinancialFieldProvenance`'s three-state `reviewStatus` pattern from `legal-model-remediation-design.md` §7 — extended (§K below) to also cover borrowing-base and reserve inputs, which Round 2 §G/§P newly requires provenance for.
- **`collateralPools`/`requestedLienPriority` are arrays, not a scalar flag**, directly answering Round 2 §L item 4 / §S: "the solver's notion of priority must be resolvable per collateral pool, not per permission."
- **`assumptions` is a distinct top-level object, never merged into `financialState`.** This is Conclusion 8/10 from `legal-model-remediation-design.md` §1/§3, reconfirmed by every later round: a transaction-supplied assumption (rate, EBITDA add-back, designated test date) must never silently stand in for a reported/reconstructed financial fact.
- **`transactionType` is intentionally an open enum with `DEBT_INCURRENCE` as Phase 1's real target.** `LIEN_GRANT` is not requested independently by a caller in the common case — it is derived automatically via `PermissionRelationship` (automatic-lien-tied-to-basket, §C) — but is named here because a caller can, in principle, test lien-only questions (e.g. "can this existing unsecured debt be secured now") separately from an incurrence.
- **`asOfDate` at the company-context level and `transactionDate` at the transaction level are deliberately distinct fields**, not aliases: `asOfDate` governs which documents/provisions are effective (mirrors `Document.effectiveFrom/effectiveTo`, `loadCompanyCovenantData`'s existing `effectiveDateFilter`); `transactionDate` is what dynamic-activation predicates (§I) and measurement-basis calculations (§J) evaluate against. They will usually be the same instant for a "what can I do today" query but must diverge for a "what could I have done as of a past/future date" query, which the historical/golden-test suite already exercises informally.

---

## C. Contract model

### C.1 Permission

A `Permission` is the generalized replacement for the debt/lien-relevant subset of `CovenantProvision` — not a parallel table, but (per `legal-model-remediation-design.md` §4's own framing, generalized) a richer shape a `CovenantProvision` row can carry:

```
Permission {
  id
  documentId                      // still anchored to a Document — provenance requires this even when the permission participates in a cross-document SharedCapacityConstraint
  grantType: "DEBT_INCURRENCE" | "LIEN"          // Round 1 item; independence per legal-model-remediation-design.md Conclusion 2
  amountKind: "FIXED" | "INCURRENCE_BASED"
  action: string                  // what it permits, in plain terms — "incur debt", "secure debt on Pool A at first priority"
  entityScope: EntityClassFilter  // Round 2 §L item 10 — Borrower / Guarantor RS / Non-Guarantor RS / Foreign RS / Unrestricted Sub / Securitization Sub / Immaterial Sub
  capacityRule: FormulaRef        // -> existing FormulaType leaf calculation (unchanged), OR a new leaf type (borrowing-base, §G)
  eligibilityConditions: EligibilityCondition[]   // AND-combined predicates gating whether this permission is available at all (ratings, intercreditor joinder, MFN-exclusion test, LCA test-date freeze, entity scope, ...)
  termConditions: TermCondition[] // WAL/maturity floors, Inside-Maturity-Exception-style term waivers
  measurementBasis: "CUMULATIVE_INCURRED" | "CURRENTLY_OUTSTANDING" | "NET_OF_REPAYMENT" | "PREPAYMENT_CREDIT"
  sourceProvision: { documentId, sectionRef, definedTermIds[] }
  effectiveFrom, effectiveTo      // amendment precedence, same semantics as Document/CovenantProvision today
  modelingStatus: "MODELED" | "KNOWN_NOT_MODELED"
}
```

`amountKind`/`capacityRule`/`measurementBasis` are exactly `legal-model-remediation-design.md` §3–§4's proposal, unchanged by either ontology round (Round 2 §L items 1–10 table: "permission-level vocabulary remained completely stable"). `entityScope` and `eligibilityConditions`/`termConditions` are the generalization Round 2 §E/§K adopted from the closure test's own decomposition (`PERMISSION → ELIGIBILITY CONDITIONS → CAPACITY → TERM CONDITIONS → STATE EFFECTS`, Round 2 §A/§E), which "held up well across every mechanic reviewed... adopted as the primary structural refinement of this round." This design adopts that five-stage decomposition as `Permission`'s own internal shape rather than as a separate concept, because Round 2 tested it exhaustively and it is the single strongest structural finding of either round.

### C.2 Requirements (per transaction)

A proposed transaction is tested against an **AND-combined set of requirement classes**, generalizing task §1's own list and Round 1 §H's confirmed taxonomy (extended per Round 2 §H's two additional buckets):

| Requirement class | What it tests | Source |
|---|---|---|
| `DEBT_PERMISSION` | At least one debt-incurrence `Permission` (or valid combination) covers the amount | Round 1 §H, confirmed everywhere |
| `LIEN_PERMISSION` | If secured, at least one lien `Permission` (automatic or independently qualifying) covers the amount, per pool | Round 1 §H |
| `PRIORITY_CONDITION` | Requested priority on each pool is available; intercreditor joinder precondition satisfied if required | Round 1 §H; Round 2 §D/§L item 6 |
| `COLLATERAL_SCOPE` | Each requested pool exists, and eligibility to be secured on it is satisfied | Round 2 §L item 4 |
| `RATIO_CONDITION` | Applicable ratio/coverage tests (`LEVERAGE_RATIO_ROOM`/`COVERAGE_RATIO_ROOM`/`RATIO_GATE`-equivalent) pass pro forma | Round 1 §H |
| `GUARANTOR_CONDITION` | Entity-scope/nested-sub-cap conditions (non-guarantor sub-caps) satisfied | Round 1 §H; Round 2 §I |
| `SHARED_CAP` | Every `SharedCapacityConstraint` the winning election consumes has headroom | §G below |
| `COVENANT_APPLICABILITY` | Any covenant/permission whose applicability is dynamically gated (§I) is resolved for `transactionDate` | Round 1 §H "whole-covenant-package state"; Round 2 §L item 8 |
| `CROSS_DOCUMENT_STATE` | Any permission whose ceiling depends on another document's/instrument's aggregate balance is resolved | Round 1 §H "cross-document state" |
| `TERM_CONDITION` | WAL/maturity floors, MFN eligibility exclusions, LCA-freeze parameters | Round 2 §E/§K |
| `TRANSACTION_ASSUMPTION` | Every assumption the winning election needs (rate, designated test date, EBITDA adjustment) is supplied | `legal-model-remediation-design.md` §8 |

A transaction is `CLEAR` only if **every applicable requirement class has at least one satisfied instance along the winning `PermissionPath`** (§D) — this is the multi-requirement-class generalization the task's §1 explicitly demands ("do not assume the answer is reducible to a single MIN, MAX, or SUM").

### C.3 Relationships

The six-way `StackingRelationshipType` taxonomy from `legal-model-remediation-design.md` §3, reconfirmed unchanged through both ontology rounds (Round 1 §G: "generalizes well... every genuinely pairwise interaction found across all five companies... maps onto one of the six existing relationship types without needing a seventh"), plus the one new type Round 2 adopted:

| Relationship | Semantics | Status |
|---|---|---|
| `CONCURRENT_DISREGARDED` | Both permissions usable at once; the Fixed member's amount is excluded from the Incurrence-Based member's ratio denominator | Confirmed, unchanged |
| `CONCURRENT_COUNTED` | Both usable at once; Fixed member's amount *does* count toward the ratio denominator | Confirmed, unchanged |
| `ALTERNATIVE` | Mutually exclusive, OR semantics — best passing path wins; a non-modeled sibling never poisons a modeled one | Confirmed, unchanged; formalized in §M |
| `MUTUALLY_EXCLUSIVE` | Cannot be used together at all, no best-of semantics | Confirmed, unchanged |
| `AUTOMATIC_LINKED_PERMISSION` | One permission (typically a lien) has no capacity of its own — it is parasitic on a named debt basket's own sizing | Round 1 §D item 8, confirmed 5/5 companies |
| `EQUAL_AND_RATABLE_PULLUP` | Inverse of the above: an unsecured/subordinated instrument automatically acquires security whenever other, more-senior-or-pari debt becomes secured | Round 1 §L item 7 → Round 2 §L item 7, `CORE_CANDIDATE` |
| `BASKET_FEEDING` | Unused capacity in one basket automatically feeds another (Coherent's Reallocated Amount; generalized in Round 2 §F as a `SharedCapacityConstraint` aggregation direction, not a separate relationship — see §G) | Merged into `SharedCapacityConstraint`, Round 2 §M |
| `REDESIGNATION` / `RECLASSIFICATION` | Borrower election to divide/classify/reclassify debt among qualifying baskets at incurrence or later; automatic opt-out redesignation between components (Coherent-only, `PROVISIONAL_SINGLE_DOCUMENT`) | Confirmed 3+ companies (election form); redesignation-over-time held single-document |
| `PARAMETER_ADJUSTMENT_TRIGGER` | Exercising Permission A automatically changes a parameter (pricing margin, etc.) of a different, named Permission B | **New in Round 2** (§L item 11) — MFN/Yield-Differential, evidenced in 2 companies |
| `SHARED_CONSTRAINT_PARTICIPATION` | A permission draws against a `SharedCapacityConstraint` rather than (or in addition to) its own standalone ceiling | New structural type needed to wire §G in; not itself a stacking rule between two permissions |
| `UNKNOWN` | Relationship not yet established | Fail-closed default; never inferred |

`BASKET_FEEDING`'s absorption into `SharedCapacityConstraint` (rather than staying a pairwise relationship) is a direct, load-bearing adoption of Round 2 §F/§M's finding: Round 1 treated cross-document caps and nested sub-caps as separate primitives; Round 2, after reading CHS's actual pooled-cap text, found they are "the same shape with different aggregation criteria" and merged them. This design follows that merge rather than re-splitting it, because re-splitting it was exactly the mistake Round 2 caught Round 1 in.

---

## D. Permission path model

A `PermissionPath` is the generalized, always-produced trace object answering the task's §6 example directly. It is the unit the solver reasons about, allocates within, and reports.

```
PermissionPath {
  id
  status: PathStatus                     // §M below

  legs: PermissionPathLeg[]              // one entry per permission actually relied upon
    PermissionPathLeg {
      permissionId
      grantType: "DEBT_INCURRENCE" | "LIEN"
      amountAllocated: number
      standaloneCapacity?: number         // this permission's own ceiling, pre-allocation
      linkedFrom?: permissionId            // set when this leg exists only via AUTOMATIC_LINKED_PERMISSION or EQUAL_AND_RATABLE_PULLUP
      concurrentTreatment?: { withPermissionId, relationship, disregardedFromRatioDenominator: boolean }
      measurementBasis
      historicalUsage: { cumulativeIncurred?, currentlyOutstanding?, prepaymentCredit? }
      ratioCalculation?: { measure, threshold, proFormaDebtUsed }
      sourceProvision
    }

  linkedPermissions: { debtPermissionId, lienPermissionId, pool: CollateralPoolRef, priorityTier }[]

  conditionsTested: RequirementResult[]  // one per §C.2 requirement class instance actually evaluated for this path, with its own status
  sharedConstraintsConsumed: { constraintId, amountConsumed, headroomBefore, headroomAfter }[]
  assumptionsUsed: { field, value, provided: "explicit" | "missing" }[]
  parameterAdjustmentsTriggered: { triggeringPermissionId, affectedPermissionId, parameter, before, after, sourceProvision }[]
  sourceProvisions: SourceCitation[]      // deduplicated, every leg's + every condition's citation
  stateEffects: StateDelta                // §L below — hypothetical, not applied
}
```

This directly satisfies task §6's worked example: Debt Permission A ($400M) and Debt Permission B ($100M) are two `legs`; Lien Permission X `linkedFrom: A`; Lien Permission Y is its own `leg` for $100M; Shared Constraint S across the full $500M appears once in `sharedConstraintsConsumed`; Ratio Test R applicable only to A appears once in `conditionsTested` scoped to leg A; Priority Condition P appears in `conditionsTested` referencing the specific pool. Nothing in the worked example requires a field this structure doesn't already have.

A `PermissionPath` is always fully populated for both the winning path *and* every rejected alternative (§I below) — the difference between a "used" and "considered-but-rejected" path is a field on the containing result (§N), not a different shape, so the explainability requirement (§16 of the task) never has to reconstruct a rejected path from partial data.

---

## E. Allocation model

### E.1 The allocation question

Given a target transaction amount and a set of permissions connected by relationships (§C.3), determine whether — and how — the amount can be distributed across permissions such that every relationship constraint and every shared constraint (§G) is simultaneously satisfied.

### E.2 Approach comparison (task §7 requires comparing, not assuming)

| Approach | Fit for Headroom's actual problem | Verdict |
|---|---|---|
| **Pure graph search** (traverse relationship edges, pick a path) | Handles `ALTERNATIVE`/`MUTUALLY_EXCLUSIVE` grouping and `AUTOMATIC_LINKED_PERMISSION` cleanly, but has no native notion of a *numeric* amount being split, capped, or jointly solved across concurrently-drawn ratio permissions | **Necessary but not sufficient alone** |
| **General constraint satisfaction (CSP)** | Models the AND-combination of requirement classes (§C.2) well and generalizes to arbitrary boolean gating (eligibility, applicability, entity scope), but a general CSP solver is overkill for the actual cardinality (§U) and produces less naturally explainable traces than an enumerated, named election | **Right conceptual frame for gating; too general as an implementation** |
| **Linear/integer optimization (LP/MILP)** | Well-suited if the goal were "maximize $X$ subject to many simultaneous linear constraints" in the abstract, but Headroom's ratio formulas are *not* linear in the allocation split in general (a ratio-room ceiling is itself a function of how much of the same transaction is attributed to which permission, and several relationship types — `ALTERNATIVE`, `AUTOMATIC_LINKED_PERMISSION` — are discrete/combinatorial, not continuous), and an LP/MILP result is opaque without a large amount of bespoke trace-reconstruction the solver would need to build anyway | **Wrong primary tool; premature per task's own instruction not to choose an optimization library prematurely** |
| **Bounded election enumeration + per-election monotone bisection (hybrid)** | Enumerate the small number of legally distinct *elections* (which permissions/relationships this transaction could rely on — bounded by real covenant-package cardinality, §U) using the relationship graph to prune invalid combinations (no two `ALTERNATIVE`/`MUTUALLY_EXCLUSIVE` members together); for each election, solve the *numeric* feasibility (does a split of $X exist satisfying every ratio/shared-cap constraint the election implies) via monotone bisection, which is valid because every individual permission's capacity function is non-increasing in pro forma debt | **Recommended** |

This is the same algorithm shape `legal-model-remediation-design.md` §6 already designed and reasoned through for the narrower debt/lien-stacking problem (its Steps 1–7), generalized here to also gate on shared constraints, collateral pools, dynamic activation, and parameter-adjustment triggers rather than only stacking relationships. Nothing in either ontology round falsified that algorithm — Round 1 §K states this explicitly ("nothing in this pass falsifies the *algorithm* itself... what breaks is upstream of the solver," i.e., the *inputs* the algorithm needs, not its shape) and Round 2 corroborates it further (§N: allocation "is needed only for shared-basket draw-down among Phase-1-scoped permissions").

### E.3 Election enumeration, generalized

An **election** is a candidate subset of permissions the transaction could rely on, subject to:
- no two members of the same `ALTERNATIVE` group both included;
- no two `MUTUALLY_EXCLUSIVE` permissions both included;
- every `AUTOMATIC_LINKED_PERMISSION`/`EQUAL_AND_RATABLE_PULLUP` lien leg is included automatically once its linked debt leg is included (not independently chosen);
- entity-scope (`EntityClass` filter) admits the proposed `incurringEntity`;
- collateral-pool eligibility admits the proposed `collateralPools`/`requestedLienPriority`.

Election enumeration is bounded, not exhaustive-over-all-provisions: it operates only over the permissions actually applicable to the requested `grantType`(s), entity, and pools — typically single digits to low tens per side even at real-company scale (§U). Brute-force power-set enumeration over that bounded set, capped with a documented fallback threshold (`legal-model-remediation-design.md` §6 Step 2 already proposes 20 permissions per side before falling back to a documented heuristic), remains the right default; §U revisits whether that cap is realistic.

### E.4 Per-election feasibility

For each election:
1. Partition members into `FIXED` and `INCURRENCE_BASED`.
2. Apply each pairwise relationship's rule (disregard/count/sum) to determine how members combine (§C.3), deriving the combinator **from data, per election**, never assuming `SUM` or `MIN` as an engine default.
3. If the election includes exactly one `INCURRENCE_BASED` member with all `FIXED` members already resolved (disregarded or counted), that member's own capacity function is evaluated directly (closed form, from the existing `FormulaType` leaf).
4. If the election includes **two or more concurrently-drawn `INCURRENCE_BASED` members** whose capacities are mutually dependent (each depends on a pro forma debt level partly set by the other), solve via **monotone bisection over the total transaction amount $X$**: for a candidate $X$, check whether a feasible split across the election's members exists (each member's capacity is non-increasing in pro forma debt, so feasibility-at-$X$ is itself monotone in $X$), and bisect to the boundary. This subsumes `legal-model-remediation-design.md` §6 Step 3's fallback and is the one place genuine numerical search (rather than closed-form evaluation) is required — bounded, deterministic, and independent of any specific relationship shape.
5. Check every `SharedCapacityConstraint` the election's legs consume (§G) — an election that would exceed a shared constraint's remaining headroom is infeasible for amounts beyond that headroom, which further bounds step 4's bisection rather than requiring a separate solver pass.
6. Check every `RequirementResult` (§C.2) — `PRIORITY_CONDITION`, `COVENANT_APPLICABILITY`, `TERM_CONDITION`, `TRANSACTION_ASSUMPTION` — as boolean AND-gates on top of the numeric result. Any gate that is `UNKNOWN` (an unresolved `UNKNOWN` relationship, an unconfirmed entity classification, a missing assumption) makes the election **not evaluable**, not automatically failed and not automatically passed (§M, §P).

### E.5 Worked cases from task §7

| Case | Handling |
|---|---|
| One permission covers entire amount | Trivial election, single leg, closed-form capacity check |
| Multiple permissions stack | `CONCURRENT_DISREGARDED`/`CONCURRENT_COUNTED` combinator per §C.3/E.4 step 2 |
| Fixed + ratio concurrent, fixed disregarded from ratio denominator | E.4 step 2, `CONCURRENT_DISREGARDED` |
| Multiple lien permissions for different debt portions | Multiple `AUTOMATIC_LINKED_PERMISSION` legs, each tied to a different debt leg, allocated in proportion to the debt legs they're linked from |
| Automatic lien linkage | `AUTOMATIC_LINKED_PERMISSION`, E.3 |
| Shared capacity caps | §G, gated in E.4 step 5 |
| Entity-specific sub-caps | `SharedCapacityConstraint` with `ENTITY_CLASS_FILTER` aggregation rule (§G), or a permission-level `entityScope` gate (§C.1) |
| Mutually exclusive paths | `MUTUALLY_EXCLUSIVE`, excluded at enumeration (E.3) |
| Reclassification/redesignation | Modeled as a borrower **election among qualifying elections** — the solver reports the best available election per §F, and a reclassification is simply "the borrower's chosen election," not a distinct algorithm |
| Basket feeding | `SharedCapacityConstraint` aggregation (§G), not a separate mechanic |

---

## F. Constraint model

Every AND-combined requirement class from §C.2 is represented uniformly as a `RequirementResult`:

```
RequirementResult {
  class: RequirementClass          // DEBT_PERMISSION | LIEN_PERMISSION | PRIORITY_CONDITION | COLLATERAL_SCOPE |
                                    // RATIO_CONDITION | GUARANTOR_CONDITION | SHARED_CAP | COVENANT_APPLICABILITY |
                                    // CROSS_DOCUMENT_STATE | TERM_CONDITION | TRANSACTION_ASSUMPTION
  scope: { permissionId?, poolId?, entityId?, constraintId? }   // what this instance of the class is testing
  status: "SATISFIED" | "FAILED" | "UNKNOWN"
  detail: string
  sourceProvision?: SourceCitation
}
```

A `PermissionPath` is only `CLEAR`-eligible if **every** `RequirementResult` on it is `SATISFIED` (§M). This is the mechanism that answers task §1's "do not assume the answer is reducible to a single MIN, MAX, or SUM": the overall verdict is a conjunction over a *heterogeneous* set of requirement instances, not a numeric fold over a homogeneous tree.

`COVENANT_APPLICABILITY` and `CROSS_DOCUMENT_STATE` are included as first-class requirement classes specifically because Round 1 §H found the original AND-taxonomy had "no bucket for a condition on another document's aggregate state" and "no bucket for a condition on a company-wide state rather than a specific transaction's own facts" — this design closes both gaps by adding the two classes Round 1 itself proposed, rather than stretching `DOCUMENT-SPECIFIC_CONDITION` to do two jobs (Round 1 §H's own objection to that alternative).

---

## G. Shared-capacity model

`SharedCapacityConstraint` is adopted verbatim from Round 2 §F/§L item 1 — the single most important structural merge either round produced (it collapses Round 1's separately-proposed "cross-document capacity reference" and "nested guarantor sub-cap" into one shape once CHS's actual pooled-cap text was read in full).

```
SharedCapacityConstraint {
  id
  companyId                         // spans documents; not owned by a single Document
  cap: FormulaRef                   // usually FIXED, occasionally itself formula-derived
  aggregationRule: "NAMED_MEMBER_CLAUSES" | "EXTERNAL_INSTRUMENT_BALANCE" | "ENTITY_CLASS_FILTER"
  members: SharedConstraintMember[] // depends on aggregationRule:
    // NAMED_MEMBER_CLAUSES: explicit list of permissionIds (+ optional named instrument identifiers, e.g. "2031 Notes", "2032 Notes")
    // EXTERNAL_INSTRUMENT_BALANCE: a reference to another document's/instrument's live aggregate outstanding balance
    // ENTITY_CLASS_FILTER: an EntityClass predicate scoping which entities' usage counts, applied across one or more permissions
  measurementBasis: "OUTSTANDING" | "CUMULATIVE_INCURRED"
  followsRefinancing: boolean        // CHS's cap "follows the debt through refinancing" — a flag, not a new mechanic
  currentUsage: number                // computed from historicalState + ledger, or read externally for EXTERNAL_INSTRUMENT_BALANCE
  sourceProvision: SourceCitation     // the constraint's own citation, kept distinct from any single member's citation (Round 2 §O)
}
```

**How this interacts with allocation (§E):** a `SharedCapacityConstraint` is not itself an election member — it is consulted during E.4 step 5 as a headroom check on whichever election's legs participate in it (via `SHARED_CONSTRAINT_PARTICIPATION`, §C.3). `currentUsage + proposedAllocationAcrossParticipatingLegs ≤ cap` is the gate; when the constraint's `aggregationRule` is `EXTERNAL_INSTRUMENT_BALANCE`, `currentUsage` is itself an external input (§K) and a stale/missing read makes every requirement instance referencing it `UNKNOWN`, not silently treated as zero usage (fail-closed, per Round 2 §P).

Support matrix against task §10's explicit list:

| Requirement | Mechanism |
|---|---|
| Multiple entry-point permissions | `members` list under `NAMED_MEMBER_CLAUSES` |
| Cross-document participants | `companyId`-scoped, not `documentId`-scoped |
| Named note series | `members` may reference a named instrument identifier without a modeled `Permission` row existing for it (the cap references the *series*, not a Headroom-internal permission) |
| External balance references | `aggregationRule: EXTERNAL_INSTRUMENT_BALANCE`, sourced through `externalInputs` (§B/§K) |
| Entity-filtered sub-caps | `aggregationRule: ENTITY_CLASS_FILTER`, reusing `EntityClass` (§C.1) |
| Outstanding vs. cumulative measurement | `measurementBasis` field, same enum as `Permission.measurementBasis` |
| Current and pro forma usage | `currentUsage` (pre-transaction) vs. the E.4 step-5 check (post-transaction, hypothetical — never persisted, per §L) |

---

## H. Collateral/priority model

Scoped deliberately to what task §11 asks for and no further — enforcement mechanics are out of Phase 1 per the ontology work's own conclusion (Round 2 §D final paragraph, §L items 18–19, §R first bullet).

```
CollateralPool {
  id
  companyId
  name                              // "ABL Priority Collateral", "Fixed Asset Collateral", etc. — as named in the actual document
  definedTermRef?                   // -> DefinedTerm, when the pool is itself a defined term
}

PermissionCollateralScope {
  permissionId
  collateralPoolId
  priorityTier: "FIRST" | "SECOND" | "PARI_PASSU" | "UNSECURED"
  pariPassuWithGroupId?              // for PARI_PASSU_WITH<X>-style requests
  intercreditorAgreementRef?         // -> IntercreditorAgreement (below), when joinder is a precondition
}

IntercreditorAgreement {
  id
  companyId
  name
  governs: { poolId, counterpartyClass }[]   // which pool(s)/creditor classes this specific agreement governs — CHS names three, each different
  // NOTE: enforcement-regime fields (standstill period, turnover mechanics, DIP subordination terms,
  // release-on-foreclosure, designated-controlling-representative) are deliberately NOT modeled here.
  // Phase 1 needs only: does this agreement exist, and is joinder to it a transaction precondition (§C.2 PRIORITY_CONDITION).
}
```

This directly implements Round 2 §D's own conclusion: "For Phase 1's actual question... **yes**, with the two additions Round 1 already proposed (collateral pool as a first-class node/attribute; intercreditor joinder as a transaction precondition)... For the deeper enforcement/LME questions... the Round-1 model is not sufficient, and should not be extended to cover them now." `IntercreditorAgreement` is included as a document-type-adjacent node (not a full model of its operative terms) purely so a `PRIORITY_CONDITION` requirement can cite *which* agreement joinder is required — nothing about standstill periods, turnover, or mixed-collateral proceeds allocation is represented, matching the explicit deferral list in §L items 18–19.

A single permission (or instrument) being first-priority on Pool A and second-priority on Pool B simultaneously is directly representable: `PermissionCollateralScope` is a join row per `(permission, pool)`, so priority is never a scalar on the permission itself (Round 1 §O item 4's central finding, reconfirmed and deepened by Round 2 §D's three real CHS intercreditor agreements).

---

## I. Dynamic activation model

Adopted from Round 2 §L item 8 (`CONDITIONAL_RULE_ACTIVATION`), which merges Round 1's three separately-proposed dynamic-state shapes (threshold step-up/cool-down; springing liquidity-gated applicability; whole-package rating-triggered suspension) into one generalized resolver concept, further corroborated by four new mechanics in Round 2 (equity cure's usage-limit gate, hysteresis-style springing covenants, discharge/reinstatement, LCA test-date freeze).

```
RuleActivationCondition {
  id
  appliesTo: { permissionId? , covenantSectionIds?: string[], companyWide?: boolean }  // one permission, a named list of sections, or the whole covenant package
  predicate: StatePredicate
  effect: "APPLICABILITY" | "PARAMETER_VALUE" | "RETROACTIVE_REEXAMINATION"
  parameterResolver?: (state, events, time) => value      // only when effect === PARAMETER_VALUE — e.g. a step-up'd threshold
  reversionRule?: { predicate: StatePredicate, retroactiveReconciliation?: string }   // TransDigm-style: how debt incurred during suspension is re-tested at reversion
}

StatePredicate =
  | { kind: "POINT_IN_TIME"; test: (state, time) => boolean }                          // e.g. rating ≥ X today
  | { kind: "CONTINUITY_WINDOW"; test: (state, time) => boolean; minConsecutivePeriods: number; periodUnit: "DAY" | "QUARTER" }  // hysteresis: entry/exit conditions differ (Petco's 20-consecutive-day exit; Coherent's minimum-consecutive-quarters cooldown)
  | { kind: "EVENT_TRIGGERED"; sinceEvent: EventType; until?: EventType }              // discharge/reinstatement: active until a qualifying reincurrence event
  | { kind: "USAGE_LIMITED"; maxUses: number; minSpacingPeriods?: number }              // equity cure's 5-uses / 2-of-4-quarters spacing gate
```

This one generalized shape covers every mechanic Round 2 §H tested:

| Mechanic | `StatePredicate` kind | `effect` |
|---|---|---|
| Threshold step-up/cool-down (Coherent) | `CONTINUITY_WINDOW` (cooldown gate) | `PARAMETER_VALUE` |
| Springing FCCR (Petco/CommScope-Vistance) | `CONTINUITY_WINDOW` (asymmetric entry/exit — hysteresis) | `APPLICABILITY` |
| Whole-package rating suspension (TransDigm) | `POINT_IN_TIME` + `reversionRule` | `APPLICABILITY` + `RETROACTIVE_REEXAMINATION` |
| Discharge/reinstatement (CHS) | `EVENT_TRIGGERED` | `APPLICABILITY` (of a priority/discharge state, not a covenant) |
| Equity cure usage-limit gate | `USAGE_LIMITED` | gates a **companion** `RETROACTIVE_COMPLIANCE_ADJUSTMENT` (§K), not `effect` on this node directly — see the note below |
| LCA test-date freeze | not a `RuleActivationCondition` at all | modeled as a measurement-rule parameter (§J), per Round 2 §H/§K's own determination that it "is not applicability of a rule or the value of a threshold... it needs to be able to select an *input date*" |

**Boundary case, carried over faithfully from Round 2 §H/§K rather than smoothed away:** the equity cure's *retroactive financial-input-override* character does not fit `CONDITIONAL_RULE_ACTIVATION`'s applicability/parameter shape cleanly. Round 2's own resolution — confirmed here rather than re-litigated — is that the usage-limit/spacing logic is a clean `USAGE_LIMITED` predicate, but the retroactive override itself is a distinct, narrower concept (`RETROACTIVE_COMPLIANCE_ADJUSTMENT`, §K), not a `RuleActivationCondition` effect. This design keeps that split rather than forcing a false unification, consistent with the task's own instruction not to invent one-off primitives *or* to over-generalize past what the evidence supports.

Fail-closed defaults (task §13's implicit requirement, made explicit here, restating Round 2 §P verbatim because it is already precisely stated there): an unknown ratings state defaults to the covenant package being **active** (more restrictive); an unknown liquidity/springing-covenant state, an unknown continuity-window history, or an unknown usage count never defaults to the more permissive branch — every such gap produces `REVIEW_REQUIRED` on the requirement instance that depends on it (§F), never a silent default in either direction.

---

## J. Measurement/history model

Two orthogonal concerns, kept orthogonal per Round 2 §J's explicit finding ("currency does not introduce a new architectural primitive... composes directly with the already-proposed `MeasurementBasis`... as an orthogonal... rule"):

**Usage/replenishment semantics** (`MeasurementBasis`, unchanged from `legal-model-remediation-design.md` §3):
`CUMULATIVE_INCURRED` (never reduced by repayment) | `CURRENTLY_OUTSTANDING` (recomputed fresh from latest balance) | `NET_OF_REPAYMENT` (nets cumulative incurrence against cumulative repayment via ledger events) | `PREPAYMENT_CREDIT` (Coherent's Prepayment-Based Incremental Facility / Petco's Fixed Incremental Amount prepayment leg — promoted `CORE_CANDIDATE` per Round 1 §J, confirmed in two companies).

**Value/currency conversion** (`ValueMeasurementRule`, new per Round 2 §J/§L item 13):
```
ValueMeasurementRule {
  conversionBasis: "FIXED_AT_EVENT_DATE" | "PERIODICALLY_SNAPPED" | "CONTINUOUSLY_CURRENT"
  snapEvent?: "INCURRENCE_DATE" | "LCA_TEST_DATE" | "PERIODIC_CALCULATION_DATE"
  retroactiveBreachProtection: boolean   // both real examples found protect against later FX movement busting an already-permitted amount
}
```

**Designated test-date parameter** (Round 2 §H/§K/§L item 14): `TransactionAssumptions` gains a `designatedTestDate?: Date` field, distinct from `transactionDate`, used only when a permission's `eligibilityConditions` include an LCA-style test-date freeze. A companion **pending-LCA state flag** (§L item 15 — a time-bounded `RuleActivationCondition`-adjacent state, not itself a rule) marks that other, concurrent calculations during the pendency window must assume the pending acquisition already closed; this is read, not computed, by the solver (it is populated from `historicalState.elections`, never inferred).

Both are parameters on already-existing concepts (`MeasurementBasis`/`TransactionAssumptions`), exactly as Round 2 concluded — no new node, relationship, or state type for either currency or test-date freezing.

---

## K. External-input model

Generalizes `FinancialFieldProvenance` (`legal-model-remediation-design.md` §7) to the wider set of external dependencies Round 2 §G identified, and gives the "product boundary" question (task §12) a single crisp table, adopted directly from Round 2 §G:

| Category | Example | Headroom's role |
|---|---|---|
| **Computable formula** | Borrowing-base advance-rate calculation; leverage-ratio-room; currency conversion | **Compute it** — same leaf-`FormulaType` machinery as every other archetype |
| **Certified external input** | Eligible Accounts/Inventory totals; named Reserve categories; a Borrowing Base Certificate's line items | **Consume it as an external input with provenance** — never independently recomputed, sourced from the certificate, structurally parallel to a `FinancialSnapshot` field |
| **Discretionary reserve** | The open-ended "any and all other reserves... reasonably likely to..." catch-all | **Surface it, never silently assume zero** — a fail-closed, human-judgment-adjacent input distinct from a named category (Round 2 §G/§L items 3a/3b split) |
| **Human classification** | Whether a specific receivable satisfies a specific ineligibility exclusion | **Out of scope** — Headroom does not independently classify underlying receivables/inventory unless a company explicitly configures a deterministic rule for a specific exclusion criterion |

```
ExternalInput {
  id
  kind: "COMPUTABLE_FORMULA" | "CERTIFIED_EXTERNAL_INPUT" | "DISCRETIONARY_CATCH_ALL" | "HUMAN_CLASSIFICATION"
  value?: number                    // absent for HUMAN_CLASSIFICATION and unresolved DISCRETIONARY_CATCH_ALL
  asOfDate?: Date
  sourceRef?: string                 // e.g. "Borrowing Base Certificate dated ..."
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED"
  staleness?: { maxAgeDays: number } // borrowing-base certificates are periodic — an input past its own reporting-frequency window is stale, not silently reused
}
```

**Incomplete-input → fail-closed behavior (task §12's explicit requirement):** any `RequirementResult` (§F) whose computation would read a `CERTIFIED_EXTERNAL_INPUT` or `DISCRETIONARY_CATCH_ALL` value that is missing, stale (past `staleness.maxAgeDays`, itself derived from the ABL's own reporting-frequency trigger — Round 2 §G's "Monthly Reporting Trigger"/"Quarterly Reporting Trigger" pattern), or `DISPUTED` resolves to `UNKNOWN`, never to zero and never to the prior period's figure carried forward silently — this is Round 2 §P's fail-closed table, adopted verbatim as the governing rule here rather than restated as a new design choice.

---

## L. State-transition model

Every successful (or partially successful) `PermissionPath` produces a `StateDelta` — a **hypothetical** description of post-transaction state, never a mutation of persisted company state. Simulation and execution are structurally separated, per task §15's explicit instruction, mirroring the existing engine's own posture (`computeCovenantPosition`/`simulateDebtIncurrence` are already pure functions over plain data with no write side effects — this design keeps that property and makes it a first-class output type rather than an implicit consequence of the functions being pure).

```
StateDelta {
  debtOutstandingDelta: { permissionId, amount }[]         // per permission, keyed so a subsequent transaction's basket usage recomputation is exact
  cashDelta: number
  leverageMetricsProForma: LeverageMetrics                 // same shape computeLeverageMetrics already returns
  basketUsageDelta: { permissionId | constraintId, amount, measurementBasis }[]
  sharedConstraintUsageDelta: { constraintId, amount }[]
  prepaymentCreditDelta?: { permissionId, amount }[]
  reclassificationsApplied?: ReclassificationRecord[]
  redesignationsApplied?: RedesignationRecord[]
  ruleActivationChanges?: { conditionId, wasActive: boolean, nowActive: boolean, reason }[]
  parameterAdjustmentsApplied?: { affectedPermissionId, parameter, before, after }[]
}
```

**Execution boundary**: a separate, explicitly out-of-scope-for-this-design workflow (task §15's own instruction — not designed here beyond naming it) is responsible for, upon actual transaction approval, converting an approved `StateDelta` into real `LedgerEntry` rows (and, eventually, `Permission`-usage-tracking rows) through the existing `LedgerEntry`/`FeedQueueItem` approve-to-write pattern the schema already has (`FeedQueueItem.payload` → approving "writes real FinancialSnapshot/LedgerEntry rows," per the existing schema comment) — this design reuses that existing approve-then-write seam rather than inventing a second one.

---

## M. Status semantics

### M.1 The status vocabulary

Five statuses, matching task §17's minimum list exactly, with one clarification on why no more are needed:

| Status | Meaning |
|---|---|
| `CLEAR` | At least one complete `PermissionPath` exists whose every `RequirementResult` is `SATISFIED` |
| `BLOCKED` | Every considered `PermissionPath` has at least one `RequirementResult` that is definitively `FAILED` (not merely `UNKNOWN`), and no path is `CLEAR` |
| `NOT_TESTED` | No applicable `Permission`/`RuleActivationCondition`/`SharedCapacityConstraint` data exists at all for the relevant grant type/entity/pool — nothing to evaluate, distinct from `KNOWN_NOT_MODELED` below |
| `REVIEW_REQUIRED` | A mandatory requirement's status is `UNKNOWN` on every considered path (unresolved relationship, unconfirmed entity classification, missing external input, unresolved dynamic-activation state, or a `Permission`/covenant with `modelingStatus: KNOWN_NOT_MODELED` that is applicable to this transaction) |
| `ASSUMPTION_REQUIRED` | The only thing missing on an otherwise-resolvable winning path is a `TransactionAssumptions` field (rate, designated test date, EBITDA adjustment) — distinguished from `REVIEW_REQUIRED` because the remedy is "the caller supplies a value," not "a human resolves ambiguity in the covenant package" (`legal-model-remediation-design.md` §8, reconfirmed) |

No sixth status is needed. `EXTERNAL_INPUT_REQUIRED`, which Round 2 §P's fail-closed table names as a distinct remedy category for missing borrowing-base certificates, is modeled as a **reason-code annotation on `REVIEW_REQUIRED`** (`unresolvedReviewItems[].reasonCategory: "EXTERNAL_INPUT" | "LEGAL_JUDGMENT" | "UNKNOWN_RELATIONSHIP" | "UNKNOWN_ENTITY_CLASS" | ...`), not a seventh top-level status — the caller-facing *remedy* differs (get a certificate vs. get a lawyer's read), but the *contractual posture* (deterministic evaluation cannot proceed) is identical, and collapsing it into `REVIEW_REQUIRED` with a reason code avoids the "proliferation of feature-specific status codes" Round 2 §P itself warns against while still letting a UI or API consumer branch on the reason category when it wants to.

### M.2 Aggregation semantics, made precise

Let a **Requirement Group** be the set of `PermissionPath`s considered for a given transaction (across every applicable `ALTERNATIVE` grouping and every combination of debt-side/lien-side elections).

1. **Path-level status** = `worstOf(RequirementResult.status)` **with one deliberate exception**: an `ALTERNATIVE`-grouped sibling relationship never contributes its own status into a *different* path's aggregation — each path in an `ALTERNATIVE` group is evaluated fully independently, and only that path's own `RequirementResult`s determine its own status. This is the direct, generalized fix for the `MAX`-as-OR bug `legal-model-remediation-design.md` §2.2 identified in the legacy engine (there, one alternative's `not_tested`/`review_required` status poisoned the whole `MAX` node because `worstStatus` was applied *across* alternatives, not *within* one). The generalized solver never makes that mistake by construction, because path status is computed per-path before any cross-path aggregation happens.
2. **Overall transaction status** = 
   - `CLEAR` if **at least one** path in the Requirement Group has status `SATISFIED`-on-every-requirement (i.e., path-level `CLEAR`).
   - Else `BLOCKED` if **every** path has at least one requirement `FAILED` (a hard, confirmed block — not merely unresolved).
   - Else `ASSUMPTION_REQUIRED` if the **best remaining path** (the one that would be `CLEAR` but for missing assumptions) needs only `TransactionAssumptions` fields, and no other path is already `CLEAR`.
   - Else `REVIEW_REQUIRED` if at least one path has an `UNKNOWN` mandatory requirement that isn't resolvable by supplying an assumption, and no path is `CLEAR`.
   - Else `NOT_TESTED` if the Requirement Group itself is empty (no applicable permission data at all).
3. **Precedence when multiple non-`CLEAR` conditions co-occur across different paths**: `CLEAR` (if any path achieves it) strictly dominates everything else — a blocked or unresolved alternative never downgrades a genuinely clear path, which is the mathematically precise form of task §17's own worked example ("one valid complete path may be enough for overall CLEAR... unresolved optional alternatives do not necessarily prevent CLEAR if another complete valid path exists"). Absent a `CLEAR` path, `BLOCKED` requires *unanimous* failure across all considered paths — a single `UNKNOWN` path prevents a `BLOCKED` verdict from being returned, because `BLOCKED` is meant to be a *confirmed* negative, and an unresolved path could still turn out to be a valid one.

This precedence order — `CLEAR` > `BLOCKED` (only if unanimous) > `ASSUMPTION_REQUIRED` > `REVIEW_REQUIRED` > `NOT_TESTED` — is a strict, order-independent lattice: computing it requires no more than one pass over the Requirement Group's path statuses, and it is stated fully above rather than left as "aggregate sensibly," directly answering task §17's "make this mathematically precise" instruction.

---

## N. Explainability / result object

```
SolverResult {
  overall: { status: PathStatus, amountTested: number, maximumCapacity?: MaxCapacityResult }  // §O

  permissionPathUsed?: PermissionPath        // the winning path, present iff overall.status === CLEAR

  constraintsEvaluated: {
    sharedConstraints: SharedCapacityConstraint[]     // every one consulted, with pre/post usage
    ratioTests: RatioTestResult[]                      // reuses the existing RatioTestResult shape from lib/covenant-engine.ts unchanged
    eligibilityConditions: RequirementResult[]
    entityCollateralPriorityRequirements: RequirementResult[]
  }

  dynamicRules: {
    activated: { conditionId, effect, reason }[]
    parameterChanges: { affectedPermissionId, parameter, before, after }[]
    predicatesEvaluated: { conditionId, predicateKind, result: boolean | "UNKNOWN", stateUsed }[]
  }

  inputs: {
    financialFactsUsed: { field, value, provenance }[]
    historicalStateUsed: { field, value, asOfEvent }[]
    externalInputsUsed: ExternalInput[]
    assumptionsUsed: { field, value, provided: "explicit" | "missing" }[]
  }

  alternatives: { path: PermissionPath, rejectionReason: string }[]   // every non-winning path considered, never silently dropped

  sources: SourceCitation[]        // deduplicated across the whole result: document, effective version, section, defined terms

  uncertainty: {
    reviewItems: { reasonCategory, description, affectedPermissions }[]
    missingInputs: string[]
    legalJudgmentRequired: { description, sourceProvision }[]
  }
}
```

Every field maps onto one bullet of task §16's list by construction (the table above is organized in the same order as that list specifically so the mapping is checkable at a glance). The UI never reconstructs allocation logic, binding-constraint logic, or alternative-path reasoning from a bare number — it renders this object, exactly the same design commitment `legal-model-remediation-design.md` §9's `CapacityAllocationTrace` already made for the narrower debt/lien case, generalized here to the full permission-path model.

---

## O. Maximum-capacity algorithm

### O.1 What "maximum" means here

Task §8 is explicit that a closed-form maximum should never be assumed. This design distinguishes five possible answers, mirroring §M's status vocabulary but specialized to the "what's the ceiling" question:

```
MaxCapacityResult =
  | { kind: "EXACT"; amount: number; path: PermissionPath }
  | { kind: "BOUNDED_RANGE"; lowerBound: number; upperBound?: number; reason: string }
  | { kind: "SCENARIO_DEPENDENT"; scenarios: { assumptionSet: TransactionAssumptions; amount: number }[] }
  | { kind: "ASSUMPTION_REQUIRED"; missingFields: string[] }
  | { kind: "REVIEW_REQUIRED"; reason: string }
```

### O.2 When binary search over amount is valid

For a **fixed election** whose members' capacity functions are each individually non-increasing in pro forma debt (true for every ratio-room/coverage-room formula in the existing `FormulaType` set, and true by construction for any future leaf formula that reads "more debt outstanding → less room"), feasibility-at-$X$ is monotone in $X$, so binary/bisection search over $X$ for that election converges to an exact boundary (§E.4 step 4). This is the **monotonic case** and is the common case for a single election.

### O.3 Non-monotonic cases, named explicitly (never silently smoothed over)

| Cause | Why it breaks simple monotonicity | Headroom's response |
|---|---|---|
| Discrete baskets / step thresholds | A `FIXED` basket's capacity is a step function (e.g., "greater of $250M or 10% EBITDA," and separately a $10mm minimum-increment rule per Petco/TransDigm §E) — feasibility can jump rather than smoothly close | Evaluate election-level feasibility directly at threshold boundaries in addition to the bisection midpoints, rather than assuming a single crossing point |
| Redesignation / election among qualifying baskets | Different elections can produce different maxima for the *same* dollar amount depending on which basket the borrower elects to draw from first | The maximum is the **max over all evaluable elections' own maxima** (§E.4 step 4's "take the best election"), not a single election's bisection result — this is why O.1 offers `EXACT` only when one election's answer already dominates every other election's, and `SCENARIO_DEPENDENT`/`BOUNDED_RANGE` otherwise |
| Term conditions (WAL/maturity floors) | A term condition can make an otherwise-larger amount infeasible at a *given* maturity/WAL while leaving it feasible at another — capacity is not purely a function of dollar amount, but of `(amount, maturity, WAL)` jointly | `EXACT` is reported only for the specific `(maturity, WAL)` the request specifies; a caller asking "what's the max at any maturity" gets `SCENARIO_DEPENDENT` unless every term-conditioned election happens to agree |
| Step-ups / cooldowns | The applicable threshold itself can differ depending on whether a step-up is currently active, which itself may depend on the very transaction being tested (a Material Acquisition triggering the step-up) | Evaluated as of `transactionDate` using `RuleActivationCondition` state (§I) resolved from `historicalState`/`transaction`, not assumed either way; an unresolved step-up state is `REVIEW_REQUIRED`/`BOUNDED_RANGE`, never silently the more permissive value |
| Multiple valid allocations, no unique maximizer | Two elections can each achieve the same maximum dollar figure via structurally different paths (e.g., one relying on a ratio test, the other on a fixed basket) | Both are reported (`alternatives`, §N) even when the numeric maximum is unambiguous — the *path*, not just the number, can be scenario-dependent even when the *amount* is not |
| Required transaction assumptions | A `COVERAGE_RATIO_ROOM`-backed election's maximum is undefined without a rate | `ASSUMPTION_REQUIRED`, never a fabricated number using a silently-defaulted rate — the exact failure mode `legal-model-remediation-design.md` P0 #3 already identified as a current bug, generalized here as a permanent rule rather than a one-off fix |

### O.4 The governing rule

**Headroom never fabricates a single number merely because a caller or the UI expects one.** `MaxCapacityResult` is a tagged union specifically so "no exact maximum exists under current information" is a representable, first-class answer rather than a number with an asterisk buried in prose. A UI that wants a single headline figure renders `EXACT`'s amount when present and an explicit "range" or "assumption needed" affordance otherwise — never silently narrows a `BOUNDED_RANGE`/`SCENARIO_DEPENDENT` result to its lower bound to make a KPI tile simpler.

---

## P. Candidate solver approaches — comparison and recommendation

Restating §E.2's table at the whole-solver level (task §5/§P ask for this at both the allocation-specific and the overall-architecture level; they are the same comparison applied at two grains, so this section cross-references §E.2 rather than re-deriving it, and adds the criteria specific to choosing the *overall* solver architecture rather than just the allocation sub-step).

| Criterion | Graph search alone | CSP (general) | LP/MILP | **Hybrid: bounded election enumeration + per-election monotone search** |
|---|---|---|---|---|
| Handles heterogeneous AND-combined requirement classes (§C.2/§F) | Weak — graphs are naturally OR/traversal-shaped, not AND-conjunction-shaped | Strong — this is exactly CSP's native shape | Weak — constraints must be linearized, awkwardly, for boolean gates | Strong — requirement evaluation is a plain conjunction per election, no special-casing needed |
| Handles non-linear/discontinuous capacity functions (ratio rooms, step thresholds) | N/A (not its job) | Possible but requires custom constraint types, losing "off the shelf" appeal | Requires linearization/relaxation, which risks silently approximating a legal threshold | Native — each election's numeric feasibility is evaluated by the same closed-form/bisection approach already validated in `legal-model-remediation-design.md` §6, no relaxation |
| Explainability (task §16 requires full reconstruction) | Graph traversal explains *which edges* were used but not *why a numeric ceiling* was reached | General CSP solvers typically report satisfiability, not a ranked, human-legible trace, without significant custom instrumentation | LP/MILP solutions are the least naturally explainable of the four — dual values and shadow prices are not a legal citation trail | An enumerated election *is* the trace — `PermissionPathLeg`s are exactly the election's members, with no translation layer needed between "what the solver computed" and "what the trace shows" |
| Determinism (task §21) | Deterministic | Deterministic (assuming a deterministic solving strategy is pinned) | Deterministic given a fixed solver/tie-breaking rule, but industrial MILP solvers' tie-breaking across equally-optimal solutions can be implementation-version-dependent unless carefully pinned | Deterministic by construction — enumeration order and bisection are both fully specified |
| Fit to actual problem size (§U: tens to low hundreds of permissions, single digits to low tens per side) | Fine at this scale | Fine at this scale, but its generality is unused | Massive overkill machinery for a problem this small, and introduces a new dependency (a MILP library) for no accuracy benefit | Fine, and intentionally sized to the actual problem rather than to a worst-case scale Headroom doesn't have |
| Premature commitment risk (task explicitly warns against choosing a library/algorithm prematurely) | Low risk, but insufficient alone (§E.2) | Choosing "a general CSP solver" commits to a solving *library* before the shape of most instances is known to need one | High — MILP is the most premature possible choice for a system whose actual arithmetic is mostly not linear-programming-shaped | Low — this is not "adopt library X," it is "compose two techniques Headroom already partially has" (election enumeration is graph/relationship-shaped; bisection is already implemented conceptually in `legal-model-remediation-design.md` §6) |

**Recommendation: the hybrid (bounded election enumeration over the relationship graph, with per-election numeric feasibility resolved by closed-form evaluation or monotone bisection).** This is not a new choice invented for this document — it is the direct generalization of the algorithm `legal-model-remediation-design.md` §6 already designed, evaluated as still valid by both ontology rounds (Round 1 §K: "nothing in this pass falsifies the *algorithm* itself"; Round 2 §N: allocation is needed only for the bounded shared-basket-drawdown case this hybrid already handles). No external optimization library is required for Phase 1; if a future phase's problem size or non-linearity genuinely outgrows bounded enumeration (§U discusses when that could happen), that would be the moment to introduce CSP/MILP machinery — deferred exactly as the task instructs, not designed around speculatively now.

---

## Q. Legacy migration plan

### Q.1 The concrete boundary, in terms of real code

`lib/covenant-engine.ts` today has two structurally distinct phases that are currently fused: (1) evaluating each `CovenantProvision` into an `EvaluatedProvision` (`evaluateProvision`), and (2) composing those into a document-level and cross-document number (`evalExpr`/`evaluateDocumentSide`/`combineCrossDocument`, and simulation on top via `buildDebtRatioTests`/`simulateDebtIncurrence`). The migration boundary sits **between phases (1) and (2)**, not inside phase (1):

- **Phase (1) — leaf calculation — is kept as-is and reused, not replaced.** `evaluateProvision` already computes exactly what a `Permission.capacityRule` (§C.1) needs: a single basket's own standalone capacity from `FormulaType`/`params`/financial inputs. The permission graph's leaf nodes call this same function (or its extended sibling, once borrowing-base/currency leaf types are added per §K/§J) — there is no reason to duplicate or reimplement leaf arithmetic, and doing so would risk the two layers silently disagreeing on a shared basket's own number.
- **Phase (2) — composition — is where the solver-native path diverges from the legacy `CapacityExpr` path.** `computeCovenantPosition`'s per-document loop gains a branch: if a document (or, more precisely, the specific debt/lien question being asked) has `Permission`/`PermissionRelationship`/`SharedCapacityConstraint` data covering **every** provision that is contractually relevant to that question, the new election-enumeration solver (§E) computes the answer; otherwise, `evalExpr` over the existing `CapacityExpr` JSON tree computes it exactly as today. This is the same opt-in-per-document seam `legal-model-remediation-design.md` §5/§10 step 7 already proposed for the narrower debt/lien allocator — generalized here to the full permission-path solver, not a different boundary.

### Q.2 The "no partial modeling → false CLEAR" guarantee (task §18 requirement 4)

The dangerous failure mode is a document that is *partially* migrated — some baskets modeled as `Permission` rows, others still only present as legacy `CovenantProvision`/`CapacityExpr` — being silently evaluated as if the modeled subset were the whole picture. This design prevents it with an explicit **coverage check**, run before the solver path is used for a given document/side:

> A document/side is **solver-native** for a given transaction only if every `CovenantProvision` on that document that is (a) tagged with a debt/lien-relevant `grants`/`grantType`, and (b) applicable to the transaction's requested entity/pool/priority, has a corresponding `Permission` row with `modelingStatus: MODELED`. If any applicable provision is still `modelingStatus: KNOWN_NOT_MODELED` or has no `Permission` row at all, the document/side is **not** solver-native for this transaction, and evaluation falls back to the legacy `CapacityExpr` path in full (not a mix of the two paths for the same document/side).

This is a stricter, transaction-scoped version of `legal-model-remediation-design.md` §10 step 7's simple "has any `grants`-tagged permission" test, tightened specifically because the generalized solver's stakes (a full `CLEAR`/`BLOCKED` verdict, not just a dollar subtotal) make partial coverage more dangerous than it was for the narrower allocator. **No transaction may be reported solver-native-`CLEAR` if a required governing restriction remains only partially modeled** — this is the literal requirement from task §18 point 4, and the coverage check is the mechanism that enforces it rather than merely asserting it.

### Q.3 Preventing double counting

Because phase (1) leaf calculation is shared, the risk of double counting is confined to phase (2): a basket must never be summed once by the legacy `CapacityExpr` tree *and* once by the solver's election enumeration for the same document/side/transaction. The coverage check in Q.2 enforces this structurally — a document/side is evaluated by exactly one of the two composition paths, never both, and `combineCrossDocument`'s existing `min()`-across-documents step (kept unchanged) then combines whichever composition path each document used, so a solver-native document and a still-legacy document coexist correctly in the same cross-document `min()` without either path's number being counted twice.

### Q.4 Migration steps (extends, does not replace, `legal-model-remediation-design.md` §10)

1. Steps 1–6 of `legal-model-remediation-design.md` §10 (the `ALT` node fix, additive nullable schema fields, `FinancialSnapshot.provenance`, `TransactionAssumptions`, `transaction_assumption_required` status) remain valid, unchanged prerequisites — they are subsumed by, not superseded by, this design's broader `Permission`/`SharedCapacityConstraint` schema (§R), since the earlier design's fields are strict subsets of this one's.
2. Add the new schema surface (§R) — `Permission` (superset of the earlier design's extended `CovenantProvision`), `PermissionRelationship` (now including `PARAMETER_ADJUSTMENT_TRIGGER`), `SharedCapacityConstraint`, `CollateralPool`/`PermissionCollateralScope`, `RuleActivationCondition`. All additive/nullable; zero behavior change until populated.
3. Build the election-enumeration solver (§E) as new, additive functions alongside `evaluateProvision`/`evalExpr`. Nothing existing calls them yet.
4. Implement the coverage check (Q.2) and wire it into `computeCovenantPosition`'s per-document loop as the sole switch between the two composition paths.
5. Populate `Permission`/relationship/constraint data for one bounded, already-well-understood slice first (Coherent's indenture debt+lien baskets — the same slice `legal-model-remediation-design.md` §10 step 8 already identified as blocked on counsel's basket-by-basket table, which remains the actual blocker, not an engineering one).
6. Re-run the full existing golden-test suite and vitest suite against the now-dual-path engine with **zero** `Permission` rows populated — this must pass byte-for-byte identically to today, proving the coverage check correctly falls back to legacy evaluation everywhere until data is entered (this is the "existing Coherent/synthetic tests continue to run" requirement, task §18 point 1).
7. Once counsel's basket-by-basket table is available, populate the coverage-complete `Permission` set for the first document/side and re-run the golden suite again — the newly-solver-native rows should now be evaluated by the solver path, and every other row should be byte-for-byte unchanged (proving no cross-contamination between the two paths).
8. Extend UI trace rendering (`ProvisionTrace`/Position/Simulate) to render `SolverResult` (§N) for solver-native documents, falling back to today's rendering for documents still on the legacy path — last, since it is presentation-layer and blocks nothing upstream.

---

## R. Proposed schema (no migration)

Proposed as design-only, per the task's explicit instruction not to implement. Each entity is justified individually against the "first-class table vs. JSON configuration" question the task asks (§19).

| Entity | Table or JSON? | Why |
|---|---|---|
| `Permission` | **Table** (extends `CovenantProvision` in place, per `legal-model-remediation-design.md` §4's existing precedent) | Needs to be queried, joined against relationships/constraints, and filtered by `grantType`/`entityScope`/`modelingStatus` independently of any single document's JSON blob — exactly the reasoning that already justified `CovenantProvision` being a table rather than JSON |
| `PermissionRelationship` | **Table** | A relationship is inherently a row connecting two `Permission` ids with its own citation and notes — this cannot be embedded as JSON on either side without becoming ambiguous about ownership (which permission's JSON is authoritative?), and needs to be queried in both directions (e.g. "everything Permission A is related to") |
| `SharedCapacityConstraint` | **Table** | Spans multiple documents/permissions by design (§G) — has no single natural JSON-blob owner. Needs independent lifecycle (a shared cap can be added/amended without touching any single permission's own row) and independent `currentUsage` tracking |
| `SharedCapacityConstraintMember` | **Table** (join table) | Many-to-many between constraints and permissions/entity-filters; a join table is the standard, correctly-normalized shape — embedding membership as JSON on the constraint would work for `NAMED_MEMBER_CLAUSES` but not cleanly for `ENTITY_CLASS_FILTER`, which has no enumerable membership at all |
| `CollateralPool` | **Table** | Referenced by multiple permissions (via `PermissionCollateralScope`) and potentially by multiple documents' intercreditor arrangements — needs independent identity, not JSON on one permission |
| `PermissionCollateralScope` | **Table** (join table) | The `(permission, pool)` pair *is* where priority attaches (§H) — this is the load-bearing normalization that makes "first on Pool A, second on Pool B, same permission" representable at all; JSON-embedding it on the permission would work but loses queryability ("every permission first-priority on Pool A") that the priority/collateral UI will need |
| `IntercreditorAgreement` | **Table** | A real governing-document type in its own right (Round 2 §L item 5) with its own name/citation, referenced by `PermissionCollateralScope.intercreditorAgreementRef` — same justification as `Document` itself being a table |
| `RuleActivationCondition` | **Table** | Needs independent querying ("every active rule as of date X") and its own lifecycle separate from the permission/covenant section it gates, especially for `companyWide: true` conditions that don't belong to any single permission |
| `MeasurementRule` (currency/value) | **JSON** (a field on `Permission`/`FormulaRef`, not a table) | Purely parametric (`conversionBasis`/`snapEvent`/`retroactiveBreachProtection`) with no independent identity, no cross-references from other entities, and no need to be queried except in the context of the permission it's attached to — a table would be over-normalization for three enum-like fields |
| `EntityClass` reference data | **Table** (a small fact table of Restricted Subsidiaries + `EntityClass` tag, per Round 2 §I's own recommendation) | Needs to be joined against from both `Permission.entityScope` and `SharedCapacityConstraintMember`'s entity filter — a single shared reference table avoids the two places disagreeing on what "Guarantor Restricted Subsidiary" means for a given entity |
| `ExternalInput` | **Table** | Needs its own provenance/staleness lifecycle (§K) independent of any single `FinancialSnapshot`, and must be queryable by kind (`CERTIFIED_EXTERNAL_INPUT` vs. `DISCRETIONARY_CATCH_ALL`) for fail-closed checks across many transactions, not just embedded once |
| `PermissionPath` / `SolverResult` | **NOT a table** — a computed, request-scoped output type only, never persisted as the "true" record of a transaction's evaluation | Persisting every solver run as its own table would conflate an ephemeral computation with the durable facts (`Permission`, `SharedCapacityConstraint`, financials) it was computed from; if a product requirement for saved/named scenarios emerges later (an open question `legal-model-remediation-design.md` §12 already flagged and left open), that is a separate, later decision — not assumed here |
| `TransactionAssumptions` | **NOT a table** — engine-layer parameter type, per `legal-model-remediation-design.md` §4's explicit "deliberately NOT proposed" stance, unchanged | Same reasoning as above; no product requirement for persisted scenarios exists yet |

New/extended enums (additive, mirroring the existing `DocumentType`/`FormulaType`/`EvaluationStatus`/`TransactionStatus` pattern): `GrantType`, `AmountKind`, `StackingRelationshipType` (7 values per §C.3, including `PARAMETER_ADJUSTMENT_TRIGGER`), `AggregationRule`, `PriorityTier`, `EntityClass`, `PathStatus` (§M.1's 5 values), `RequirementClass` (§C.2's 11 values), `ExternalInputKind`.

**Deliberately not over-normalized**: `EligibilityCondition`/`TermCondition` (§C.1) are proposed as JSON on the `Permission` row, not their own tables — they are heterogeneous, permission-specific predicates with no cross-referencing need from other entities (unlike `PermissionRelationship`/`SharedCapacityConstraint`, which are inherently relational). `StateDelta`/`SolverResult`'s many sub-fields are likewise JSON-shaped output, not tables, for the same reason `PermissionPath` itself isn't persisted.

---

## S. Test architecture

Four levels, per task §22, each with adversarial cases named explicitly rather than left generic:

### S.1 Primitive tests
Individual formulas (existing `evaluateProvision` cases, extended to any new leaf `FormulaType` — borrowing-base, currency conversion), individual predicates (`StatePredicate` kinds in isolation — a `CONTINUITY_WINDOW` predicate tested with exactly N-1, exactly N, and N+1 consecutive periods), individual relationship types (`CONCURRENT_DISREGARDED`/`CONCURRENT_COUNTED`/`ALTERNATIVE`/`MUTUALLY_EXCLUSIVE`/`AUTOMATIC_LINKED_PERMISSION`/`EQUAL_AND_RATABLE_PULLUP`/`PARAMETER_ADJUSTMENT_TRIGGER` each in a two-permission synthetic fixture with no other complexity).

### S.2 Allocation tests
Multiple-permission combinations exercised via synthetic elections: fixed+fixed stacking, fixed+ratio with disregard, two concurrent ratio permissions requiring bisection, an `AUTOMATIC_LINKED_PERMISSION` pair, an `ALTERNATIVE` group of three with one modeled/one review-required/one blocked (proving the per-path independence from §M.2 point 1), a `SharedCapacityConstraint` with `ENTITY_CLASS_FILTER` drawn from two different permissions simultaneously.

### S.3 Document-model tests
Coherent's existing golden-backed fixtures (unchanged, running against the legacy path per Q.4 step 6) plus new synthetic-second-company fixtures deliberately shaped differently from Coherent's — reusing and extending the existing `tests/synthetic-company.test.ts` pattern, which already exists specifically to prove zero company-specific branching (`legal-model-remediation-design.md` §11's own required test). The synthetic company's stacking rules, shared constraint, and collateral-pool structure must differ from Coherent's in shape, not just in dollar parameters, to prove genuine generalization rather than incidental compatibility.

### S.4 End-to-end transaction tests
Full `SolverRequest` → `PermissionPath` → `SolverResult` → `StateDelta`, including a request that spans two documents (one solver-native, one still legacy) to prove the Q.3 no-double-counting guarantee holds across the boundary.

### S.5 Required adversarial cases (task §22's explicit list, mapped to the concept each one stresses)

| Adversarial case | Concept stressed |
|---|---|
| Fixed + ratio stacking | `CONCURRENT_DISREGARDED`/`CONCURRENT_COUNTED` (§C.3, §E.4) |
| Automatic lien linkage | `AUTOMATIC_LINKED_PERMISSION` (§C.3, §D) |
| Shared cross-document cap | `SharedCapacityConstraint` with `EXTERNAL_INSTRUMENT_BALANCE`/`NAMED_MEMBER_CLAUSES` (§G) |
| Alternative path with one missing assumption | §M.2's precedence rule — the modeled sibling must still resolve `CLEAR` |
| Multiple collateral pools/priorities | `PermissionCollateralScope` (§H) — first-on-A/second-on-B same permission |
| Springing covenant | `CONTINUITY_WINDOW` hysteresis predicate (§I) |
| Borrowing-base missing reserve | `DISCRETIONARY_CATCH_ALL` fail-closed behavior (§K) — must never default to zero |
| MFN adjustment trigger | `PARAMETER_ADJUSTMENT_TRIGGER` (§C.3, §D `parameterAdjustmentsTriggered`) |
| Entity-specific sub-cap | `EntityClass` filter on `SharedCapacityConstraint`/`Permission.entityScope` (§C.1, §G) |
| Unknown mandatory restriction | `modelingStatus: KNOWN_NOT_MODELED` forcing `REVIEW_REQUIRED` via the Q.2 coverage check, never silently falling back to a partial `CLEAR` |

---

## T. Golden-test migration

The existing `golden_tests` table/harness (`scripts/golden-test.ts`) checks four things per row today: `expectedAnswer` (within tolerance), an optional `expectedStatus`, `bindingProvision`, and `bindingDefinedTerms`. This structure is preserved, not replaced — it is extended with additional optional columns/queryParams so a row can assert more without breaking any row that doesn't populate the new fields:

- `expectedPermissionPath` (optional): the set of permission codes/relationship types the winning path should rely on — generalizes `bindingProvision`'s single-code check to a full path.
- `expectedAllocation` (optional): per-leg amounts, for stacking cases.
- `expectedBindingConstraint` (optional): which single `RequirementResult` (not just which provision) is cited as the actual binding limit — sharper than today's `bindingProvision`, which only names a basket.
- `expectedAlternativesConsidered` (optional): a list of permission codes that should appear in `alternatives`, even when not winning — catching a regression where a real alternative silently stops being considered.
- `expectedStateDelta` (optional): key `StateDelta` fields for simulation rows.
- `expectedAssumptionsUsed` / `expectedSourceProvisions` (optional): closes the loop on provenance-level regression, not just numeric regression.

**Coexistence, not replacement**: rows with none of the new optional fields populated continue to be checked exactly as today (`expectedAnswer`/`expectedStatus`/`bindingProvision`/`bindingDefinedTerms` only) — this is true regardless of whether the row's underlying document is solver-native or still legacy, so the existing 30-row set requires zero edits to keep passing through this migration. New rows, and existing rows once counsel confirms the underlying stacking data (unblocking `legal-model-remediation-design.md`'s Appendix impact-matrix rows currently marked `EXPECTED_TO_CHANGE`/`LEGAL_JUDGMENT_REQUIRED`), are the ones that populate the new fields. `scripts/golden-test.ts` gains new, additive comparison branches (one per new optional field) alongside its four existing ones — never a rewrite of the existing four.

---

## U. Complexity/performance analysis

### U.1 Realistic problem size

Grounded directly in the five real companies studied across both ontology rounds, not a hypothetical:

- **Governing instruments per company**: Coherent (2: indenture + credit agreement), Petco (2: first-lien CA + ABL, plus 1 intercreditor agreement), TransDigm (2: CA + subordinated notes indenture, though TransDigm's actual multi-series notes stack is larger), CHS (1 indenture read + 3 intercreditor agreements), CommScope/Vistance (1 ABL read). Task's own estimate of "2–6 governing instruments" is consistent with, and slightly conservative against, what was actually observed (CHS's real capital structure, per the indenture's own recitals, plausibly has more note series than were individually read).
- **Permissions per side**: Coherent's indenture has 4 debt-side + 2 lien-side baskets (`legal-model-remediation-design.md` §6 Step 2's own count); Petco's CA §7.03 enumerates clauses (a)–(z) (up to 26, though not all are debt-capacity-relevant — most are exclusions/carve-outs, not independently-sized baskets); TransDigm's Permitted Indebtedness has 18 clauses in the same shape. "Tens to low hundreds" (task's estimate) is realistic at the high end for a company with many note series, each potentially represented by its own thin `Permission` row for citation purposes even when its stacking behavior is simple.
- **Relationships**: bounded by permissions-per-side squared in the worst case, but real relationships are sparse — most permission pairs have no direct relationship at all (they're independent), and the ones that do are overwhelmingly `ALTERNATIVE` groupings (few, small groups) or `AUTOMATIC_LINKED_PERMISSION` (one-to-one). "Dozens" (task's estimate) is realistic and, per the evidence gathered, likely an overestimate for most real capital structures' debt-side relationships specifically.
- **Requirement classes**: fixed at 11 (§C.2) — this does not scale with company size at all, since it is a closed taxonomy, not a per-company count.

### U.2 Is exhaustive election enumeration practical?

Yes, at this scale, with the documented cap already proposed (`legal-model-remediation-design.md` §6 Step 2's 20-permissions-per-side threshold). Power-set enumeration over $n \le 20$ is at most $2^{20} \approx 10^6$ candidate subsets before pruning — but the actual number of *legally valid* elections is far smaller than the raw power set, because `MUTUALLY_EXCLUSIVE`/`ALTERNATIVE` constraints (§E.3) prune most of the power set away before any numeric evaluation happens (an election containing two members of the same `ALTERNATIVE` group is invalid by construction, not merely low-value). In practice, the enumeration is over "which one member of each `ALTERNATIVE` group, if any, participates" × "which independent, non-exclusive fixed/ratio permissions also participate" — a much smaller combinatorial space than raw power-set size suggests, typically single digits to low tens of valid elections per side for the real companies studied.

### U.3 Where combinatorial explosion could actually occur

- **A company with many independent, freely-combinable `INCURRENCE_BASED` permissions with no relationship data between them at all** — each pair defaults to `UNKNOWN` (§C.3), which (per §M/§P's fail-closed rule) makes any election combining two or more of them `REVIEW_REQUIRED`-not-evaluable rather than requiring the solver to guess a combinator — so this case actually *reduces* computational work (fewer evaluable elections), not increases it, at the cost of more `REVIEW_REQUIRED` output. This is a data-completeness problem, not a solver-scaling problem.
- **A capital structure with many named note series each individually thin-modeled** (per U.1) inflates permission count without inflating relationship density — the bisection fallback (§E.4 step 4) is only triggered by *concurrently-drawn* `INCURRENCE_BASED` members, which remains rare even when permission count is high.
- **A `SharedCapacityConstraint` with `ENTITY_CLASS_FILTER` spanning many permissions** does not itself explode the election space — it is a single post-hoc headroom check (§E.4 step 5) applied to whichever election's legs participate, not a multiplicative factor on the enumeration.

### U.4 Pruning strategies (conceptual, not implemented)

1. Prune by `ALTERNATIVE`/`MUTUALLY_EXCLUSIVE` membership before generating any numeric evaluation (§E.3) — the dominant pruning lever, already cheap (a set-membership check per candidate).
2. Prune by entity-scope/collateral-pool eligibility before enumeration — an election containing a permission whose `entityScope` excludes the proposed `incurringEntity`, or whose collateral scope doesn't cover a requested pool, is invalid and never generated.
3. Memoize per-permission standalone capacity (phase-1 leaf calculation, §Q.1) across elections within one solver run — every election that includes a given `FIXED` permission unchanged by any `CONCURRENT_COUNTED` relationship in that election can reuse the same computed value rather than recomputing it.
4. For the >20-permissions-per-side case flagged as a documented open threshold in `legal-model-remediation-design.md` §6 Step 2 (not yet observed in any real company studied): a greedy, best-basket-first heuristic with an explicit "approximate — full enumeration exceeded the configured limit" flag on the result, rather than either silently truncating or silently taking forever — this is named as a future fallback, not built now, consistent with the task's instruction not to optimize prematurely.

---

## V. Implementation phases

Each phase is independently auditable — reviewable and mergeable without depending on a later phase's code existing, and each phase's own test suite (§S) passes on its own before the next begins.

| Phase | Scope | Auditable because |
|---|---|---|
| **0** | Land `legal-model-remediation-design.md` §10 steps 1–6 (the `ALT` fix, additive schema fields, provenance, `TransactionAssumptions`, new status) — these are prerequisites this design subsumes but does not redo | Independently reviewable against that earlier design's own test list (§11 there); zero dependency on anything new in this document |
| **1** | Add the full new schema surface (§R) — every table, all additive/nullable, zero rows populated, zero code reads them | Pure schema diff; reviewable by inspection against §R's own justification table; provably zero behavior change (no query touches the new tables yet) |
| **2** | Build leaf-calculation extensions (borrowing-base `FormulaType`, currency `MeasurementRule`) as new, additive functions beside `evaluateProvision`, with primitive tests (§S.1) only | Testable in complete isolation — no permission graph, no relationships, no solver — just new arithmetic against synthetic inputs |
| **3** | Build the election-enumeration + bisection solver core (§E) as new, additive functions operating on plain in-memory `Permission`/`PermissionRelationship`/`SharedCapacityConstraint` objects (no DB adapter yet), with allocation tests (§S.2) | Pure-function core, no I/O — reviewable and testable exactly like `lib/covenant-engine.ts`'s existing pure core, using the same synthetic-fixture pattern |
| **4** | Build `RuleActivationCondition` evaluation (§I) and `PARAMETER_ADJUSTMENT_TRIGGER` propagation (§C.3/§D) as additive extensions to the Phase 3 core | Each `StatePredicate` kind is independently unit-testable against synthetic state timelines before being wired into any real election |
| **5** | Build the `SolverResult`/trace assembly layer (§N) and `MaxCapacityResult` (§O), wrapping the Phase 3–4 core | Reviewable purely as a serialization/aggregation layer over already-tested Phase 3–4 outputs — no new numeric logic introduced here |
| **6** | Wire the Prisma adapter (loading `Permission`/relationship/constraint rows, mirroring `loadCompanyCovenantData`'s existing pattern) and the Q.2 coverage check into `computeCovenantPosition` | Reviewable against the existing `loadCompanyCovenantData` function it mirrors; the coverage check's correctness is independently testable with a document that has partial `Permission` coverage, asserting fallback to legacy evaluation |
| **7** | Run the full existing golden + vitest suite against the now-dual-path engine with zero `Permission` rows populated (Q.4 step 6) — a pure regression gate, no new functionality | Pass/fail is binary and mechanical; this phase produces no new code, only a CI checkpoint |
| **8** | Populate `Permission`/relationship/constraint data for Coherent's indenture debt+lien baskets once counsel's basket-by-basket table is available (blocked exactly as `legal-model-remediation-design.md` §10 step 8 already flags — a data/legal dependency, not an engineering one) | Reviewable as a data-entry PR against the already-built-and-tested Phase 3–6 solver; no engine code changes in this phase at all |
| **9** | Extend golden-test rows (§T) for the newly-solver-native slice, and extend UI trace rendering (§Q.4 step 8) | Last, presentation/regression-suite layer; blocks nothing upstream and can proceed in parallel with Phase 8 once Phase 6 is merged |

Phases 1–7 require no legal input and no counsel-provided data — they can proceed immediately and are the bulk of the engineering work. Phase 8 is the only phase gated on an external (legal) dependency, exactly matching where `legal-model-remediation-design.md` already identified the real bottleneck.

---

## W. Open engineering questions

Genuine, unresolved *engineering* questions only — none of these reopen a legal conclusion already settled by the source-review process or either ontology round.

1. **Election-enumeration cap tuning.** `legal-model-remediation-design.md` §6 Step 2 proposed 20 permissions-per-side as the brute-force/heuristic-fallback boundary. §U.2–U.3 above argues real elections are far sparser than raw power-set size suggests, but the *exact* cap (and the shape of the documented greedy-heuristic fallback for companies that exceed it) is not fixed by this design — it should be tuned against real data once Phase 8 populates a real company's rows, not guessed now.
2. **Where `RETROACTIVE_COMPLIANCE_ADJUSTMENT` (equity cure, §I/§K) is best implemented** — as a modifier applied before `evaluateProvision` runs (adjusting the input EBITDA), or as a post-hoc override of one specific `RequirementResult`. Round 2 §H/§K left this as a "companion concept," not a full mechanical design; Phase 4 needs to settle which layer owns the adjustment before implementing it, and this is a genuine architectural choice within the accepted concept, not a reopening of the concept itself.
3. **Whether `SharedCapacityConstraint.currentUsage` for `EXTERNAL_INSTRUMENT_BALANCE` should be a periodically-synced cached value or always a live read at evaluation time.** Round 2 flags this class of input as periodic/certified (§G), which argues for caching with explicit staleness (§K), but the exact refresh mechanism (a scheduled job, an on-demand pull, an uploaded certificate) is a product/ops decision outside this document's scope.
4. **How deep `IntercreditorAgreement` should model beyond "does joinder exist as a precondition."** This design deliberately stops at the precondition (§H), per Round 2's own scope determination — but if a future product requirement needs to *display* (not evaluate) the standstill/turnover terms as reference text for a lawyer, that's a provenance/citation question, not a solver-eligibility question, and could be added without touching the solver core. Flagged as a boundary worth revisiting if that requirement appears, not decided here.
5. **Golden-test harness performance at scale.** `scripts/golden-test.ts` currently re-runs `computeCovenantPosition`/`loadCompanyCovenantData` per row against a live database; once solver-native documents with real election enumeration are in the mix, whether the harness needs per-row caching of `loadCompanyCovenantData`'s output (shared across rows for the same company/asOfDate) is a pure performance question, decidable once Phase 8/9 data exists to benchmark against.
6. **Versioning `SolverResult`'s JSON shape for golden-test comparison stability.** As `PermissionPath`/`SolverResult` fields are added over time (§N is not claimed to be final/closed), golden rows asserting `expectedPermissionPath`/`expectedAllocation` (§T) need a stable enough shape not to spuriously break on additive fields — whether that's solved by "golden comparison only checks named sub-fields, never full-object equality" (likely the right default, consistent with how the harness already does partial comparison today) is worth confirming explicitly in Phase 9, not assumed silently.

---

## X. Recommendation

**READY_TO_IMPLEMENT**, for Phases 0–7 (§V) immediately, with Phase 8 correctly gated on the pre-existing legal/data dependency rather than any remaining design gap.

Grounds for this recommendation, stated against the same evidentiary bar the two ontology rounds used for their own verdicts:

1. **The ontology input is stable.** Round 2 §S already reached `READY_FOR_SOLVER_DESIGN` on the strength of a stable permission-level vocabulary (unchanged across two full stress-test rounds) and a tapering discovery rate (~88% reuse in Round 2 vs. ~41% in Round 1, with the one genuinely new concept — `PARAMETER_ADJUSTMENT_TRIGGER` — narrow and already incorporated here, §C.3/§L). This design does not extend the ontology beyond what Round 2 froze; every concept in §C–§L traces to a specific, cited finding in one of the two rounds, and §W's open questions are implementation-detail questions, not ontology gaps.
2. **The solver architecture is not a novel invention requiring further validation before building.** The recommended hybrid approach (§P) is the direct generalization of an algorithm `legal-model-remediation-design.md` §6 already designed and both ontology rounds independently re-confirmed as structurally sound (Round 1 §K, Round 2 §N) against real-company evidence, not a new algorithm proposed for the first time in this document.
3. **The migration boundary is concrete and testable, not aspirational.** §Q.1–Q.3 name the exact functions in the exact existing file (`lib/covenant-engine.ts`) where the boundary sits, and the coverage check (§Q.2) is a specific, statable predicate — "every applicable provision has a `MODELED` `Permission` row" — not a vague promise of safety. Phase 7 (§V) makes that promise mechanically checkable via the existing regression suite before any real data is migrated.
4. **The scope that remains explicitly excluded (LME/enforcement mechanics) is excluded on positive evidence, not by oversight.** Both ontology rounds read real, operative source documents (three full CHS intercreditor agreements in Round 2) specifically to test whether Phase 1's boundary was drawn in the right place, and confirmed it was (Round 2 §D: "For Phase 1's actual question... yes... For the deeper enforcement/LME questions... the Round-1 model is not sufficient, and should not be extended to cover them now"). This design inherits that boundary rather than second-guessing it, consistent with the task's own instruction not to reopen settled legal conclusions.

The one thing this recommendation is *not* claiming: that Phase 8 (populating real `Permission` data for Coherent's own indenture) can start today. That step was already correctly identified, before this document existed, as blocked on a specific legal deliverable (counsel's basket-by-basket stacking table, `legal-model-remediation-design.md` §10 step 8/§12 Open Question 1) — nothing in this design changes that dependency, and nothing in this design should be read as pressure to guess at that data to unblock it. Phases 0–7 are substantial, fully engineering-scoped work that does not require it.

---

*End of design document. No application code, Prisma schema, engine code, `CapacityExpr`, seed data, golden tests, or UI were modified in producing this file.*
