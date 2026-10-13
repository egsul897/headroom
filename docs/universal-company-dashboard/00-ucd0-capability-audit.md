# UCD-0 — Existing Computation Capability Audit

**Program:** Universal Company Dashboard & Covenant Computation  
**Phase:** UCD-0 (audit only; no phase-gate advancement claimed)  
**Starting SHA (`origin/main` tip at audit):** `67027b8f499921a12cee7b9b9f04d832898b6384`  
**Machine-readable matrix:** `01-computation-capability-matrix.json`  
**Controlling product architecture:** `docs/headroom-north-star-v2.md`  
**Phase gates / roadmap:** `docs/headroom-north-star-reconciliation/06-revised-roadmap.md`, `07-next-implementation-gate.json` (NS-4)  
**Canonical integration (merged):** `cursor/canonical-product-integration-5a28` via #293 (register at `docs/canonical-product-integration/`)

Phase certifications (2A–2G, capacity mathematics matrices, Phase 3 certified suites) are **not** treated as proof of general UCD computational coverage.

---

## 1. Exact repository starting SHA

`67027b8f499921a12cee7b9b9f04d832898b6384`  
(merge of #306 competing-restatement authority on `main`; matches `origin/main` after fetch)

## 2. Existing computation architecture

```
DEBT DOCS
  → Phase 2A–2G substrate (structure, discovery, package graph, context, amendment/operative state)
  → Phase 3 semantic IR (IRRule / IRDefinition / compositional expressions) + certification
  → Phase 4A evaluate-expression + dependency graph
  → Phase 4B FinancialSnapshot identity / resolve-only input contract (in-memory)
  → Phase 4C capacity graph + ledger + shared caps + reclassification (in-memory)
  → Phase 4D transaction overlay / simulate (in-memory)
  → verified-transaction-execution + lib/capacity evidence/utilization gates
       (PRODUCTION_AUTHORITY blocked without real IdP + complete evidence)

PARALLEL LEGACY PRODUCT PATH (what the dashboard actually uses today):
  Prisma CovenantProvision / Document.capacityFormulas / Permission
  → lib/covenant-engine.ts (FormulaType switch + CapacityExpr)
  → lib/solver/* (optional SOLVER_NATIVE elections)
  → lib/financial-core/* (generic FinancialState metrics)
  → lib/dashboard-service.ts → app/[companyId]/dashboard|position|simulate|capacity
```

| Concern | Module(s) |
|---|---|
| Covenant compilation (semantic) | `lib/contract-model/compiler/semantic/*`, certification, IR |
| Formula representation | IR expressions (`lib/contract-model/ir/types.ts`); legacy `FormulaType` |
| Financial definitions | `IRDefinition`; FDP docs dataset; **no product-scale compiler→dashboard** |
| Ratio calculations | Legacy `computeLeverageMetrics`; financial-core generics; FCE `deriveContractualMetrics`; 4A `DIVIDE` |
| Basket capacity | Legacy `evaluateProvision` + CapacityExpr; 4C `evaluateCapacityState` |
| Historical utilization | `LedgerEntry`; 4C ledger; `lib/capacity/utilization-*` (UNKNOWN≠zero) |
| Shared capacity | Solver `SharedConstraint`; 4C shared nodes |
| Transaction simulation | `simulateDebtIncurrence` / solver; 4D `simulateTransaction`; unified verified execution |
| Dashboard rendering | `lib/dashboard-service.ts`, `covenant-overview-*`, `app/[companyId]/*` |

**Data flow (documents → numbers on screen):** documents are indexed/discovered/compiled in Phase 2–3 paths that **do not drive** the customer dashboard. Dashboard numbers come from hand-seeded / onboarded `FinancialState` + `CovenantProvision` rows evaluated by the legacy engine (and optional solver), composed by `getCompanyDashboard`. Certified 4A–4D results appear in product only through verified-execution / capacity adapters that refuse production authority when evidence/IdP incomplete.

## 3. Which ratios can genuinely be calculated today

| Ratio | Genuine? | Notes |
|---|---|---|
| First Lien Leverage | **No** | No first-lien debt identity in covenant-engine |
| First Lien Net Leverage | **No** | Unsupported |
| Secured Leverage (gross) | **Partial** | Generic `securedDebt / ebitda` |
| Secured Net Leverage | **Partial** | `(securedDebt − cash) / ebitda`; cash netting not contract-specific |
| Total Leverage (gross) | **Partial** | Generic `totalDebt / ebitda` |
| Total Net Leverage | **Partial** | Legacy + FCE derivation when components present |
| Fixed Charge Coverage | **No** (legacy) | Engine field `fixedChargeCoverage` is **interest coverage** (`ebitda/interestExpense`) |
| Interest Coverage | **Partial** | When EBITDA + interest present |
| Debt / EBITDA | **Partial** | Same as generic total leverage |
| Other contractual ratios | **Partial** | 4A can evaluate arbitrary `DIVIDE` IR in tests; not product-compiled |

## 4. Which baskets can genuinely be calculated today

| Basket family | Genuine? | Engine |
|---|---|---|
| Fixed-dollar (debt/lien/RP/investment) | **Yes** (gross) | `FLAT_AMOUNT` / 4C MONEY |
| Growers (% EBITDA / Total Assets) | **Yes** (gross; flat metrics) | `GREATER_OF_*` / 4C |
| Ratio debt / ratio room / ratio gate | **Partial** | total vs secured only |
| Builder / Available Amount | **Partial** | `BUILDER_BASKET`; 4C definition fixtures |
| Incremental / credit facility composite | **Partial** | 4C matrix; limited product wiring |
| Shared baskets | **Partial** | 4C + solver; fail-closed on ambiguity |
| Asset sale / reinvestment | **Partial** | threshold + window; not full reinvestment program |
| Remaining capacity | **Only with verified utilization** | Unknown usage never treated as zero |
| Global max across alternative paths | **No** | 4E not product-ready |

## 5. Which financial definitions are supported

- **Representable:** `IRDefinition` + `DEFINED_TERM_REFERENCE` / `METRIC_REFERENCE` with recursive `dependsOnTerms` and `UNSUPPORTED` leaves.
- **Executable from operative document at product scale:** **No.**
- **Bound as flat inputs today:** EBITDA, cash, interest, total/secured debt, optional total assets, CNI, equity proceeds.
- **Not first-class in legacy metrics:** First Lien Debt, genuine Fixed Charges, capped cash netting, Available Amount / Cumulative Credit as full contractual programs.
- **Research-only:** `docs/financial-definitions-precedent/*` (DRAFT_DATASET, not certified production).

## 6. Hardcoded / synthetic / issuer-branched dashboard metrics

- CONMED demo branches on `position`, `documents`, `evidence` pages.
- `SOLVER_CONTEXT_ENTITY_DEFAULTS` for coherent/matthews (generic fallback otherwise).
- `debt-intelligence` ratio strip: generic formulas + AI-surfaced thresholds (not certified rulebook execution).
- Synthetic certificate seeding; trusted-issuer production activation **BLOCKED**.
- financial-core metrics are **explicitly non-contractual** (architecture §G).
- Dashboard service itself does not invent capacity arithmetic (composes engines).

## 7. Missing computational primitives

1. Instrument-scoped contractual definition compilation → executable IR at scale  
2. First-lien / junior / unsecured debt bases in legacy metrics  
3. Fixed Charges ≠ Interest Expense  
4. Permitted cash-netting caps/exclusions as expression components  
5. Contractual period/as-of selector → snapshot identity  
6. Persisted APPROVED snapshots (NS-4) and path-attributed ledger  
7. Product dashboard authority moved from legacy → 4A–4D  
8. Per-calculation input readiness taxonomy (UCD-4)  
9. Cross-company held-out numerical UCD acceptance suite  
10. Authorized multi-path capacity maximum (4E)

## 8. Missing financial input architecture

- NS-4 store not implemented; 4B is resolve-only in-memory  
- No real customer APPROVED certificate ingestion path complete  
- Dual/triple financial schemas unreconciled for product reads  
- Connectors not wired into `FinancialState`  
- `LedgerEntry` ≉ `DebtEvent` ≉ 4C usage  
- Production IdP absent (`TRUSTED_ISSUER_ACTIVATION = BLOCKED`)

## 9. Gaps vs existing Phase 3 / 4 / 5 work

| Layer | Built | UCD gap |
|---|---|---|
| Phase 3 | IR, semantic compile/verify/certify | Reliability gate open; dashboard does not consume certified rulebook |
| Phase 4A–4D | Deterministic runtime + capacity + simulate | In-memory; not UI authority; not bound to approved persisted snapshots |
| Phase 4E | Planned | Path enumeration blocked on Phase 3 readiness |
| Historical Phase 5 ERP vision | Superseded by NS v2 | MVP is certificates/snapshots, not ERP |
| UCD objective | — | End-to-end company-agnostic: defs → inputs → ratios/capacity → auditable dashboard |

## 10. Proposed bounded implementation PR sequence

| PR | Scope | Avoids conflict with |
|---|---|---|
| **UCD-0** (this) | Audit + capability matrix | n/a |
| **UCD-1a** | Contractual financial-definition identity + recursive dependency + explicit UNSUPPORTED adjustments (pure lib; reuses IR) | #304–#317 product/compiler/authority PRs |
| **UCD-1b** | Bind definitions to 4B input manifests; input readiness classifier (AVAILABLE_VERIFIED…UNSUPPORTED) | NS-4 persistence PRs if any |
| **UCD-2a** | Ratio engine over definition-resolved numerators/denominators (4A), with calculation traces; do not replace legacy yet | capacity-integration #308 |
| **UCD-3a** | Capacity remaining publication only through verified utilization adapters (extend, don’t fork) | #308 |
| **UCD-4** | Company missing-information report from compiled dependency manifests | — |
| **UCD-5** | Dashboard read-model from verified execution outputs (no independent UI formulas) | #311 CFO workflow — coordinate |
| **UCD-6/7** | Held-out multi-issuer validation + unseen-company acceptance | Do not tune fixtures |

Do **not** advance North Star phase gates or merge production authority without independent review.

## 11. Existing tests and exact-tip CI evidence

**Exact-tip CI:** [canonical-compiler run 38184494968](https://github.com/egsul897/headroom/actions/runs/38184494968) — **success** on `67027b8f…` (typecheck + Phase 3 certified suites + verifier/pilot suites).

**Representative computation tests (not UCD acceptance):**

- `tests/contract-model/runtime/expression-runtime.test.ts`
- `tests/contract-model/runtime/capacity/capacity-mathematics-matrix.test.ts` (+ shared/ledger/builder suites)
- `tests/contract-model/runtime/input/*`
- `tests/contract-model/runtime/transaction/*`
- `tests/capacity/utilization-and-remaining.test.ts`
- `tests/financial-certificate-engine/derived-and-reconcile.test.ts`
- `tests/financial-core/adversarial.test.ts`
- `tests/product/unified-transaction-execution.test.ts`
- `tests/financial-definitions-precedent/*` (dataset integrity, not production engine)

## 12. Estimated technical dependencies and blockers

| Blocker | Why it blocks UCD |
|---|---|
| Phase 3 stratified certification incomplete | No trusted rulebook for arbitrary issuers |
| NS-4 approved snapshot persistence absent | No durable verified financial truth |
| Selector resolution absent | Cannot map contractual periods to snapshots |
| Persisted 4C ledger absent | Remaining capacity cannot be authoritative |
| Production IdP BLOCKED | Verified capacity cannot be PRODUCTION_AUTHORITATIVE |
| Dual legacy vs 4A–4D product paths | Dashboard can look complete while using non-contractual generics |
| Open concurrent PRs (#304–#317) | Coordinate UI/compiler/capacity merges; prefer pure computation libs first |
| No held-out multi-issuer numerical GT for UCD | Cannot claim generalization |

---

## Immediate next implementation (post-audit)

**UCD-1a:** additive `lib/contract-model/financial-definitions/` — company-agnostic definition kinds, recursive dependency closure, unsupported-adjustment honesty, and input-readiness classification — without touching active product/compiler PR surfaces and without claiming dashboard authority.
