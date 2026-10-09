# NEON INTELLIGENCE BASELINE

**Generated:** 2026-10-09T22:14:00Z (approx; see `neon-intelligence-baseline.raw.json`)  
**Access mode:** READ_ONLY  
**Starting SHA (branch base):** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Script:** `npm run kf:neon-intelligence-baseline`  
**Raw counts:** `docs/intelligence-factory/neon-intelligence-baseline.raw.json`

Maturity labels used below are **never collapsed**: Observed → Extracted → Verified → Certified → Executable → Customer-ready.

---

## 1. Actual database and repository corpus inventory

### Neon (live, read-only)

| Layer | Dataset | Records | Notes |
|---|---|---:|---|
| Tenant | Company | 16 | 9 CUSTOMER / 7 EVALUATION; onboarding: 9 ACTIVE, 5 ACTIVE_WITH_LIMITATIONS, 2 ONBOARDING |
| Tenant | Document | 29 | 15 companies; 12 CREDIT_AGREEMENT, 4 AMENDMENT, 2 INDENTURE, … |
| Tenant | DebtInstrument | 6 | |
| Legacy engine | CovenantProvision | 19 | 3 documents; all 8 FormulaTypes represented |
| Legacy engine | DefinedTerm | 75 | all UNVERIFIED |
| Solver-native | Permission | 39 | 29 VERIFIED / 10 UNVERIFIED; 11 documents; all MODELED |
| Solver-native | PermissionRelationship | 27 | |
| Solver-native | SharedCapacityConstraint (+ members) | 3 / 3 | |
| Solver-native | SolverCoverageDeclaration | 22 | |
| Financial | FinancialSnapshot / DebtTranche | 8 / 4 | |
| Financial | LedgerEntry | 6 | all ACTIVE; 1 company |
| Financial-core | FinancialState / Facility / DebtEvent | 8 / 6 / 7 | |
| Financial-core | ExternalInputRecord | 9 | 6 CERTIFIED_EXTERNAL_INPUT, 3 PUBLIC_FILING_RECONSTRUCTION |
| Regression | GoldenTest | 48 | all VERIFIED |
| Legal review | LegalReviewRecord | 109 | 61 VERIFIED / 48 UNVERIFIED |
| Extraction | ExtractionCandidate | 166 | 138 APPROVED |
| Extraction | DocumentChunk / ExtractionRun | 65 / 18 | |
| Contract model | DocumentNode | 60 | |
| Contract model | DocumentRelationshipEdge, DefinedTermNode, ContractRule, AmendmentEffect, UnresolvedContractItem | **0** | schema present, unused in Neon |
| Analysis | AnalysisRun | 6 | all COMPLETED_WITH_REVIEW |
| Semantic truth | SemanticTruthRecord | **0** | no durable IR truth rows |
| Claim review | ClaimReviewItem / Decision | 48 / 0 | |
| Knowledge Factory | KnowledgeSource | **730** | 200 distinct issuers; 710 DocumentByteObject |
| Knowledge Factory | KnowledgeRelationshipEdge | **8193** | all DISCOVERED |
| Phase-4 | ContractInputSnapshot / Fact | 6 APPROVED / 48 | |
| Phase-4 | ContractLedgerUsage (+ events) | 1 / 1 | |

### Repository (offline / file corpus)

| Artifact | Scale |
|---|---|
| Mass-precedent inventory | 151 locators (29 committed bytes, 122 URL-only); 150 unique hashes |
| Mass-precedent retrieval index | 133 sources, 35 issuers, 11,458 covenant candidates, 988 definitions, 21 families |
| Local mass-precedent analyze (29 docs) | 3,133 candidates, 737 defs, 19,241 xrefs |
| Basket formula corpus (phase-1 summary) | 55 candidates, 20 families, 17 formula kinds, **0 capacityComputable** |
| Unseen-package fixtures | CONMED, DSGR, FWRG, LSB, CHWY, RIOT, Gibraltar, SUP, plus phase-3 holdout/replay dirs |

---

## 2. Unique authentic agreements

| Measure | Count |
|---|---:|
| KnowledgeSource rows | 730 |
| Distinct `originalBytesHash` | **708** |
| Distinct hashes in financing document classes (excl. UNKNOWN/OTHER/WAIVER/etc. filter used in diagnostic) | **448** |
| Distinct issuers (CIK) | **200** |
| Duplicate hash groups | 10 groups / 32 rows (near-dupe / re-import signal) |
| Product Document rows (customer/eval packages) | 29 |

Do **not** treat KnowledgeSource row count as independent precedent count. Prefer distinct content hash + issuer diversity.

---

## 3. Unique covenant provisions

| Measure | Count | Maturity |
|---|---:|---|
| Neon metadata `covenantSummary.items` | **30,051** | Extracted (summary items; DISCOVERED) |
| Neon metadata candidate sum | **40,518** | Observed/Extracted (analysis counts) |
| Retrieval-index covenant candidates | 11,458 | Extracted (file index) |
| Solver Permission rows | 39 | Verified (29) / Unverified (10); Executable when coverage declared |
| Legacy CovenantProvision rows | 19 | Executable via legacy engine |
| Basket corpus candidates | 55–390 (by phase) | Extracted only; **0 Executable** |
| SemanticTruthRecord | 0 | — |
| Certified KF representation (REVIEWER_VERIFIED / CERTIFIED) | **0** | pipelines stop before certification |

---

## 4. Existing verified and certified evidence

| Evidence | Count | Status semantics |
|---|---:|---|
| GoldenTest VERIFIED | 48 | Mechanical regression, not legal certification of packages |
| Permission reviewStatus VERIFIED | 29 | Data-fidelity review |
| LegalReviewRecord VERIFIED | 61 | Orthogonal legal-review determination |
| ExternalInput CERTIFIED_EXTERNAL_INPUT | 6 | Financial certification kind |
| ExternalInput review VERIFIED | 1 | |
| KnowledgeRelationshipEdge evidence | 8193 DISCOVERED | **Not** verified/certified |
| KnowledgeSource representation | 60 STRUCTURALLY_INDEXED / 670 DISCOVERED_CANDIDATE | No CERTIFIED |
| SemanticTruth trustStatus VERIFIED | **0** | |
| Phase-3 package CERTIFIED usable by Phase-4 | not populated via SemanticTruth | |
| Mass-precedent `promotedToLegalTruth` | **0** | Explicit |

---

## 5. Coverage by covenant mechanic

### Observed (retrieval index family histogram — documents carrying family)

| Mechanic | Docs in index (family hit) | Extracted structured Neon? | Verified/Certified | Executable engine |
|---|---:|---|---|---|
| Fixed-dollar baskets | via INDEBTEDNESS + permissions | Yes (FLAT_AMOUNT in engine) | Partial (Permission/Golden) | Yes (legacy + solver leaf) |
| Greater-of baskets | INDEBTEDNESS / growers | Yes | Partial | Yes (`GREATER_OF_*`) |
| Grower baskets | EBITDA / assets defs | Yes | Partial | Yes |
| Ratio-based permissions | 65 | Yes | Partial | Yes (`LEVERAGE/COVERAGE/RATIO_GATE`) |
| Incremental debt capacity | 40 | Summary/candidates | No | **No** first-class FormulaType |
| Available Amount / builder | 41 | Yes (1 BUILDER_BASKET provision) | Partial | Partial (engine builder shape) |
| Shared capacity | 70 | 50 PROVISION_SHARED_CAPACITY edges; 3 SharedCapacityConstraint | Partial | Numeric cap yes; **usage wired as 0** |
| Anti-stacking | via SHARED + conditions | Discovered edges | No | Partial (solver relationships) |
| Reclassification | GENERAL_CONDITIONS | Corpus extracted | No | North-Star runtime only / not product |
| Debt–lien coordination | LIENS 84 + INDEBTEDNESS 75 | Permissions | Partial | Solver when declared |
| Restricted payments | 41 | Yes | Partial | Legacy RP waterfall |
| Investments | 78 | Yes | Partial | Solver grant type |
| Asset sales | 70 | Yes | Partial | Legacy asset-sale sim |
| Mandatory prepayments | 43 | Summary | No | Not FormulaType |
| Subsidiary / guarantor | GUARANTEES 81; restricted/unrestricted subs | Summary | No | Entity scope partial |
| Financial maintenance | 46 | Summary | No | Synthetic extractor historically misses |
| Events of default | 87 | Summary | No | Not capacity engine |
| Amendment precedence | 24 AGREEMENT_AMENDMENT + 94 RESTATEMENT edges | Discovered | No | Document effective dating; graph not certified |

### Product FormulaType distribution (executable leaves)

CovenantProvision: FLAT 2, FLAT_NET_OF_DEBT 1, GREATER_OF_EBITDA 5, GREATER_OF_ASSETS 2, LEVERAGE_RATIO_ROOM 4, COVERAGE_RATIO_ROOM 2, BUILDER 1, RATIO_GATE 2.

Permission: FLAT 16, GREATER_OF_EBITDA 8, GREATER_OF_ASSETS 2, LEVERAGE 6, COVERAGE 5, FLAT_NET_OF_DEBT 2.

---

## 6. Existing retrieval and precedent infrastructure

| Surface | Path | Usable? | Authority |
|---|---|---|---|
| Mass-precedent retrieval index | `docs/knowledge-factory/mass-precedent/retrieval-index.json` | Yes | Research only |
| Product precedent search | `lib/product/precedent-search.ts` | Yes | Non-operative |
| Mechanic clause queries | `lib/product/legal-reasoning/precedent-clause-search.ts` | Yes (expanded Cycle 1) | Non-operative |
| KF CorpusStore search | `lib/knowledge-factory/search/query.ts` | Local file | Non-operative |
| Ask / covenant intelligence | `lib/product/covenant-intelligence/*` | Neon summaries | Fail-closed; no invented capacity |
| KnowledgeRelationshipEdge graph | Neon 8193 edges | Yes if joined on **logical sourceId** | DISCOVERED only |
| SemanticTruth projection / research CLI | `scripts/covenant-precedent-research.ts` | Empty SemanticTruth | — |

**Schema note:** `KnowledgeRelationshipEdge.targetSourceId` stores logical `KnowledgeSource.sourceId`, not the cuid. Joining as FK-to-`id` falsely reports 100% orphans; all 8193 resolve via `sourceId`.

---

## 7. Existing capacity and transaction-execution coverage

| Path | Coverage | Gap |
|---|---|---|
| Legacy `covenant-engine` | 8 FormulaTypes + CapacityExpr + RP + asset sale | Narrow vs corpus taxonomy |
| Solver-native | Permissions, stacking, shared caps | `currentUsage: 0` at load; `historicalState` not on `RunSolverParams` |
| North-Star Phase-4 runtime | Expression IR + contract ledger | Product authority still LEGACY / NOT_CERTIFIED_4E |
| Basket formula corpus | 20 families / 21 kinds | 0 executable; never promotes to Permission |
| Golden tests | 48 VERIFIED across capacity/simulation types | 2 companies only |
| Contract ledger usage | 1 row | Not general utilization |

---

## 8. Data that is stored but not currently usable

1. **~670 DISCOVERED_CANDIDATE KnowledgeSources** with summaries — not customer rulebooks, not certified.
2. **30k+ covenant summary items** — retrieval/Ask discovery only.
3. **8193 relationship edges** — DISCOVERED; amendment edges not operative-version authority.
4. **Contract-model tables empty** (rules, defs, xrefs, amendment effects) despite schema.
5. **SemanticTruthRecord empty** — blocks verified-execution / Phase-4 certification bridge at scale.
6. **18 KnowledgeSource.documentId values** that do not resolve to Document (34 set, 16 resolve).
7. **2 DocumentByteObject** rows unreferenced by KnowledgeSource hash.
8. **200 UNKNOWN documentClass** — dry-run reclassify can fix **13** without network (4 CA, 5 indenture, 3 restatement, 1 term loan); remainder needs better signals.
9. **Basket corpus** bound candidates — research IR only.
10. **ClaimReviewItem 48 / Decision 0** — open review queue without closure.

---

## 9. Highest-value gaps

1. **Cold-start → SemanticTruth → certified rules** empty path (0 SemanticTruth).
2. **Corpus mechanics ≫ FormulaType** (incremental cap, MFN, reallocation, replenishment, anti-stacking as first-class).
3. **Utilization wiring** (`currentUsage: 0`; historicalState adapter unused).
4. **UNKNOWN class + false-positive exhibits** dilute retrieval quality.
5. **Dual stores** (file CorpusStore structural graph vs Neon registry/metadata) — structural nodes not normalized in Neon.
6. **Manual review gates** still required for ACTIVE customer packages.
7. **Holdout / challenge generation** not systematically fed from Neon summaries.
8. **Paid inference** not authorized this cycle — prefer offline/deterministic eval.

---

## 10. Proposed parallel work allocation

| Workstream | Owner focus | Near-term tasks (no speculative refactor) |
|---|---|---|
| **A — Neon inventory** | This PR | Durable baseline script; refresh after each corpus write |
| **B — Precedent expansion** | Cycle 2+ | Dry-run UNKNOWN reclassify → owner-approved write; diversify issuers; refresh retrieval index from STRUCTURALLY_INDEXED |
| **C — Covenant reasoning** | Cycle 2+ | Offline interpretation matrix over 60 STRUCTURALLY_INDEXED + holdouts; mechanic queries (started) |
| **D — Capacity mathematics** | Cycle 2+ | Eval matrix on GoldenTest + synthetic inputs; wire shared-constraint usage when tests exist |
| **E — Customer cold start** | Cycle 2+ | Run unseen fixtures through onboarding; readiness assessment using existing status enums |

**Code ownership:** Workstream A/B touch `scripts/knowledge-factory` + `docs/intelligence-factory`; C touches `lib/product/legal-reasoning`; D touches `lib/solver` / `lib/covenant-engine` only with tests; E touches `lib/onboarding` / product readiness. Keep PRs separate.

---

## Cycle 1 actions (this branch)

- Added read-only `kf:neon-intelligence-baseline`.
- Corrected relationship-edge coverage counting (`sourceId` vs cuid).
- Expanded mechanic-based precedent clause queries (shared capacity, anti-stacking, grower, MFN, maintenance, etc.).
- **No Neon writes. No paid inference. No production record mutation.**
