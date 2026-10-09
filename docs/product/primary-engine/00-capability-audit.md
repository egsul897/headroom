# Primary product mission — capability audit

**Mission:** Integrated Financial, Compliance Certificate, Covenant Capacity and Transaction State Engine  
**Mode:** Audit + smallest plan only — **no major new implementation**  
**Starting SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8` (`origin/main`)  
**Soft gates:** no paid inference; no fabricated financials; no zero utilization invention; certification gates preserved  

---

## North Star (restated)

A CFO uploads financing agreements, financial statements, compliance certificates, and transaction history. Headroom constructs a current, source-backed covenant position: capacity exists / used / remaining, conditions, and how each transaction changes flexibility. **Ask Headroom is secondary** to this engine.

---

## 1. Current capabilities — financial ingestion

| Capability | Status | Evidence |
|---|---|---|
| Document upload (debt docs, compliance cert type) | **Working** | `app/[companyId]/onboarding/documents/actions.ts`, `lib/connectors/upload-connector.ts` |
| CSV financial metrics upload | **Working** | `lib/connectors/csv-financial-connector.ts` → `FINANCIAL_FACT` candidates |
| Manual financial entry (dual-write legacy snapshot + FinancialState) | **Working** | `lib/onboarding/financial.ts`, onboarding financials page |
| Text/regex propose of labeled certificate/statement metrics | **Partial** | `lib/onboarding/financial-facts-from-document.ts` — labeled text only; no PDF/table layout |
| Review → promote → `FinancialSnapshot` / `FinancialState` | **Working** | `lib/onboarding/promotion.ts` |
| Promote → NS-4 `ContractInputSnapshot` APPROVED | **Working** | `lib/onboarding/ns4-financial-persist.ts` via `north-star-bridge` |
| Dedicated `FINANCIAL_STATEMENT` DocumentType + statement parser | **Missing** | Statements land as CSV / `OTHER` / shared regex |
| ERP / continuous bank sync | **Missing** (out of roadmap) | — |

**Identity / provenance retained today:** candidate `metricName`/`asOfDate`/`canonicalUnit`/`reviewStatus`/`reviewedBy`; NS-4 fact identity JSON + locators + attributable approval; Document storage refs. Legacy `FinancialSnapshot` lacks per-field provenance/status.

---

## 2. Current capabilities — officer / compliance certificate ingestion

| Capability | Status | Evidence |
|---|---|---|
| `COMPLIANCE_CERTIFICATE` DocumentType + upload | **Working** | Prisma `DocumentType`, onboarding documents UI |
| Certificate → `FINANCIAL_FACT` propose (deterministic) | **Working** | Same regex path; tests `tests/onboarding/certificate-financial-facts.test.ts` |
| NS-4 certificate propose → attributable approve | **Working** | `lib/contract-model/runtime/input/store/certificate/**`, product `/certificates` |
| Basket schedule lines → Phase 4C ledger on approve | **Working** | `certificate-actions.ts` / `promoteBasketLinesToContractLedger` |
| Synthetic CONMED-form certificate fixture | **Working** | Product certificates UI seeds fixture (labeled synthetic) |
| Distinct officer’s certificate type / OCR / heterogeneous PDF | **Missing** | Only compliance certificate + text regex / synthetic |
| Authentic customer certificate → APPROVED NS-4 (production) | **Partial** | SaaS E2E uses labeled test certificate; real customer PDFs not production-wired |

**Scope honesty:** product copy and NS-4 path distinguish contractual names (`CONTRACT_NAME_ONLY`); UI warns GAAP ≠ contractual. Officer cert is not treated as certifying facts outside extracted/approved facts.

---

## 3. Current capabilities — financial reconciliation

| Capability | Status | Evidence |
|---|---|---|
| Multi-source `FINANCIAL_FACT` reconcile (priority rules) | **Working** | `lib/connectors/reconciliation.ts` — MATCH / MATERIAL_DIFFERENCE / CONFLICT / STALE |
| Separate GAAP vs covenant EBITDA fields | **Partial** | `lib/financial-core/types.ts`; manual form notes — no auto comparator |
| Certificate-reported ratio vs Headroom-computed ratio | **Missing** | Documented in NS reconciliation decision; not implemented |
| Silent GAAP→contractual substitution | **Forbidden / avoided** | Setup loop + financial UI; NS-4 identity keys use contractual names |

---

## 4. Current ledger and utilization support

| Capability | Status | Evidence |
|---|---|---|
| Legacy `LedgerEntry` (ACTIVE/SUPERSEDED, basket enum) | **Working** | Prisma + Feeds + `app/[companyId]/ledger` |
| Phase 4C `ContractLedgerUsage` (path-attributed) | **Working** | Prisma + `runtime/capacity/store` + product append/supersede |
| Certificate basket schedule → 4C | **Working** | On attributable certificate approval |
| Overview utilization from 4C / attributed usage | **Missing / risk** | `covenant-overview-builder.ts` sets `usageState: NOT_TRACKED` and may show `utilizationPct: 0` when capacity finite — reads as zero, not UNKNOWN |
| Dual-ledger single truth migration | **Missing** | Both ledgers coexist; overview/engine largely ignore 4C |
| Assume zero utilization when history absent | **Forbidden in North Star path**; **tension on legacy overview** | Capacity readiness / invent-absence fail closed; overview utilizationPct=0 is the demonstrated failure |

---

## 5. Current transaction-state propagation support

| Capability | Status | Evidence |
|---|---|---|
| Phase 4A–4D runtime (eval, effects, simulate, capacity graph) | **Working** | `lib/contract-model/runtime/**`, `verified-execution.ts` |
| Product Simulate tab | **Partial** | Legacy covenant-engine / solver only; never posts to ledger; does **not** call `simulateVerifiedTransaction` |
| Certified transaction attempt | **Working** (fail-closed) | `attemptCertifiedTransaction` — requires eval date, NS-4 cutoff, APPROVED snapshot, VEP |
| Phase 4E path enumeration | **Partial** | Code works over VEP; authentic CONMED §7.2(c) VEP enumerates paths as `UNSUPPORTED` (cross-rule gates) |
| Dependency propagation (4A/4C/4D graphs) | **Working** (runtime) | Shared capacity, builder/grower roles, effect cycles refused |
| Product discovery dependency graph → capacity | **Missing connection** | `customer-intelligence/dependency-graph.ts` not wired into runtime graphs |
| Post hypothetical into live ledger | **Forbidden** | Simulate banners + 4D simulate.ts (no persist) |

---

## 6. Missing connections between existing components

1. **`ContractLedgerUsage` ↛ covenant overview / home utilization** — 4C loads on capacity/ledger pages; overview stays `NOT_TRACKED` / `utilizationPct: 0`.
2. **Product Simulate ↛ `simulateVerifiedTransaction`** — certified 4D only via Ask / certified-transaction when VEP present.
3. **Legacy `Permission` ↛ Phase 3 CERTIFIED IR / VEP** — UNVERIFIED Permissions enable `LEGACY_ENGINE` only.
4. **NS-4 APPROVED snapshots ↛ legacy FinancialState path** — dual stores; LEGACY_ENGINE keys off FinancialState.
5. **Product dependency-graph heuristics ↛ runtime capacity/effect graphs**.
6. **Legacy `LedgerEntry` ↛ 4C path attribution**.
7. **4E enumeration ↛ numeric remaining capacity** — needs `evaluateVerifiedCapacity` EXECUTED.
8. **Cross-rule gate evaluator** — authentic CONMED §7.2(c) capacity REFUSED (`CROSS_RULE_GATE_NOT_EXECUTABLE`); companions §7.1 / §7.3(g) not independently CERTIFIED.
9. **Certificate ↔ financial-statement reconciler** — multi-source fact reconcile exists; cert-vs-statement / reported-ratio-vs-computed missing.
10. **Financial-statement DocumentType + delivery registry** — selector delivery evidence inferred, not persisted as first-class uploads.

---

## 7. Smallest implementation plan → complete company covenant position

Order is deliberately minimal. **Do not rewrite architecture. Do not invent CERTIFIED.**

### Slice 1 — Honest utilization (no new engine)
- Wire overview / capacity rows to read Phase 4C `ContractLedgerUsage` when present.
- When usage is not tracked: surface **UNKNOWN / NOT_TRACKED**, never `utilizationPct: 0`.
- Keep LEGACY_ENGINE labels until certified path executes.

### Slice 2 — One authentic financial + certificate cohort (NS-4)
- Ingest one real compliance certificate (or labeled authentic text) + matching financial statement/CSV for one company (prefer CONMED or Harbor-lane-class fixture already in corpus).
- Promote attributable FINANCIAL_FACT → NS-4 APPROVED.
- Run multi-source reconcile; leave unexplained differences explicit.
- Persist period / provenance / review status (existing models).

### Slice 3 — As-of position (reuse engines)
- Load: operative permissions or CERTIFIED VEP units when available; NS-4 APPROVED snapshot; 4C ledger.
- Produce ratio table via existing `computeLeverageMetrics` / overview builder.
- Produce basket table with used/remaining/UNKNOWN; missing inputs listed.
- Authority: `LEGACY_ENGINE` or `NOT_CERTIFIED_4E` until REQUIRE capacity EXECUTED.

### Slice 4 — Three hypothetical simulations (no ledger post)
- Debt incurrence, restricted payment (or dividend), repayment/equity contribution — via existing Simulate **or** `simulateVerifiedTransaction` when VEP + cutoff exist.
- Pre/post positions; audit trail in report artifact only.
- Refuse unsupported paths (e.g. CONMED cross-rule gates) without inventing satisfaction.

### Slice 5 — Certified path only when Phase 3 supplies companions
- Coordinate with Phase 3 for §7.1 / §7.3(g) CERTIFIED companions + cross-rule evaluator.
- Do **not** invent package CERTIFIED or weaken REQUIRE.
- When EXECUTED: show CERTIFIED_4A_4D / CERTIFIED_EXECUTED labels and 4D effects.

**Out of scope for smallest plan:** Ask chatbot redesign, new dashboard IA, ERP sync, parallel covenant calculator, automatic promotion of Neon examples to certified legal truth.

---

## 8. First authentic integrated execution

### A. Customer setup loop (merged PR #199) — LEGACY + NS-4
| Item | Result |
|---|---|
| Artifact | `docs/audits/saas-setup-loop-e2e-result.json` |
| Company | `saas-setup-loop-e2e-mv1b0gp8` |
| Sources | Authentic-style CA (pkg-a) + labeled test compliance certificate |
| Outcome | `success: true` — upload → analysis → review → promote → NS-4 APPROVED → activate → dashboard |
| Ratios | TNL ≈ 1.233× (computeLeverageMetrics over approved financials) |
| Authority | `LEGACY_ENGINE`, `capacityCertified: false`, 1 UNVERIFIED Permission |
| Phase 3 trusted units | 0 (honest empty) |

### B. CONMED authentic VEP path (main tip, offline, no paid inference)
| Item | Result |
|---|---|
| Script | `scripts/product/attempt-authenticated-vep.ts` (re-run on tip `bae24ced`) |
| Candidate | CONMED §7.2(c) — `docs/phase-3-live-validation/7.2c-recompute-phase2-certified/` → **CERTIFIED** |
| VEP | **DERIVED** → `authenticated-vep/verified-execution-package.json` |
| Phase 4E | Authority `CERTIFIED_4E`, pathCount 1, path **status UNSUPPORTED** (`CROSS_RULE_GATE_NOT_EXECUTABLE`) |
| Capacity REQUIRE | **REFUSED** — same cross-rule gate; **no numeric headroom claimed** |
| Phase 4D | **Not attempted** (capacity refused) — fail-closed |
| Package CERTIFIED | **Cannot claim** — PARTIAL / unsealed population |
| Stratified board | Live CERTIFIED **0**; offline pins remain |

### C. CONMED product demo workspace
| Item | Result |
|---|---|
| Setup | `scripts/product/setup-conmed-demo.ts` / `docs/product/conmed-demo/` |
| Docs | Eighth A&R + GCA + Second Amendment + Omnibus loaded |
| Capacity | Documented NOT DETERMINABLE / empty ledger honesty — not certified remaining capacity |

**Independent assessment:** The sellable setup loop produces a **legacy** covenant position with NS-4 financial provenance. Authentic certified **numeric** capacity for CONMED is still blocked on cross-rule gates and companion certification — correctly refused.

---

## 9. Tests, independent verification, demonstrated failures

### Tests / gates (representative)
- Setup / NS-4: `tests/onboarding/certificate-financial-facts.test.ts`, `financial-fact-promotion.test.ts`, `tests/product/phase3-trusted-rulebook.test.ts`
- Invent-absence: `tests/home-overview-invent-absence.test.tsx`
- North Star: `tests/product/north-star-e2e-customer-workflow.test.ts`, `certified-transaction-gate.test.ts`, `authoritative-capacity.test.ts`
- Authenticated VEP offline: `tests/product/authenticated-vep-offline.test.ts`
- Certified path CI: provider-free suites under `tests/contract-model/certified/**`

### Demonstrated failures / tensions
1. **Overview utilizationPct = 0 with NOT_TRACKED** — looks like zero usage (`covenant-overview-builder.ts`).
2. **Authentic CONMED capacity REFUSED** — `CROSS_RULE_GATE_NOT_EXECUTABLE` (§7.1, §7.3(g)).
3. **Package-level CERTIFIED unavailable** — candidate CERTIFIED ≠ package CERTIFIED.
4. **Dual ledger / dual financial store** — product can show NS-4 approved counts while executing LEGACY_ENGINE figures.
5. **No automated certificate ↔ statement reconciliation** — unexplained differences not systematically preserved as a first-class report.

---

## 10. Starting SHA, ending SHA, PR, cost

| Field | Value |
|---|---|
| Starting SHA | `bae24ced33fdd6963d0615265a1e67cb181233e8` |
| Ending SHA | `d5645a4dcd983c16c5d3f9bdc805c46ca54bb8a6` |
| PR | *(opened with this deliverable — documentation only)* |
| Cost | **$0 paid inference** this mission (offline VEP attempt + audit). Agent compute cost not metered here. |

---

## Workstream readiness map

| Workstream | Readiness | Next concrete slice |
|---|---|---|
| A — Document ingestion | Strong for debt docs + cert type + CSV; weak for FS DocumentType / PDF | Slice 2 authentic cert+FS cohort |
| B — Financial/cert reconciliation | Multi-source facts Working; cert↔statement Missing | Slice 2 reconcile report |
| C — Company covenant position | LEGACY Working; CERTIFIED numeric Missing | Slice 1 + 3 honest position |
| D — Transaction effects | 4D runtime Working; product Simulate legacy; certified blocked | Slice 4 hypos + refuse unsupported |
| E — Dependency propagation | Runtime graphs Working; product wiring Partial | Fix only demonstrated overview/4C gap (Slice 1) |
| F — Authentic company demo | Partial (setup loop + CONMED VEP refuse) | Complete after Slices 1–4 |
| G — Neon continuous learning | Existing corpus/KF — **do not auto-promote to certified truth** | Holdouts preserved; examples stay source-backed |

---

## Explicit non-claims

- Headroom does **not** yet deliver the full CFO North Star as a certified continuous engine.
- Ask Headroom is **not** the primary product path for covenant position.
- CONMED §7.2(c) candidate CERTIFIED + derived VEP ≠ executable certified capacity.
- Acceptance / FIXTURE_IR / synthetic certificates are **not** authentic customer certification.
