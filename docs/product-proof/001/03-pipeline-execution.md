# Product Proof 001 — Pipeline Execution Log

**Runner:** `npx tsx scripts/product-proof/run-001-mtn-pipeline.ts`  
**Console log:** `logs/pipeline-console.txt`  
**Machine summary:** `artifacts/pipeline-execution-summary.json`  
**Tested SHA:** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Paid inference:** none  
**Neon writes:** none  

---

## Stage table

| # | Stage | Status | Entry point | Wall ms | Paid LLM | Human | Provenance / notes |
|---|---|---|---|---:|---|---:|---|
| 0 | SOURCE DOCUMENTS | **SUCCESS** | Frozen SEC HTML → extracted text under `sources/` | 12 | No | 1 | Package selection + freeze |
| 1 | STRUCTURAL INDEX | **SUCCESS** | `parseDocumentStructure` / `buildStructuralIndex` / KF `extractStructure` | 110 | No | 0 | 1595 nodes, 252 defs, 1501 refs (261 resolved) |
| 2 | COVENANT DISCOVERY | **PARTIAL** | Pass A + `runDiscoveryPipeline` (synthetic) + KF `discoverCovenantCandidates` | 53 | No | 0 | Pass A: 810; KF Doc A: 25; Pass B empty (no credentials) |
| 3 | MULTI-DOCUMENT GRAPH | **SUCCESS** | `buildPackageGraph` | 52 | No | 0 | CA/INDENTURE/INDENTURE/UNKNOWN; 0 relationships |
| 4 | DEFINITION RESOLUTION | **SUCCESS** | Structural defs + literal `X means` probe | 0 | No | 0 | 9/9 key terms anchored in Doc A |
| 5 | AMENDMENT PRECEDENCE | **PARTIAL** | `runAmendmentPipeline` | 1 | No | 0 | 0 effects (restatement + separate indentures) |
| 6 | GENERALIZED RULE REPRESENTATION | **BLOCKED** | `compileCovenantToIR` | 0 | No | 0 | **First hard product block for capacity** |
| 7 | VERIFICATION | **BLOCKED** | `verifyCompiledCandidate` | 0 | No | 0 | No compiled candidate |
| 8 | FINANCIAL / UTILIZATION BINDING | **PARTIAL** | `resolveUtilization` / `decideSolverUtilizationAuthority` / `computeVerifiedRemaining` | 0 | No | 0 | Empty ledger → UNKNOWN; unmodeled gross → REFUSED |
| 9 | CAPACITY ENGINE | **BLOCKED** | `evaluateVerifiedCapacity` | 1 | No | 0 | Empty VEP → `VERIFICATION_ARTIFACT_INCOMPLETE` |
| 10 | TRANSACTION SIMULATION | **BLOCKED** | `simulateVerifiedTransaction` | 0 | No | 0 | $50M/$100M → REFUSED |
| 11 | CUSTOMER-FACING ANSWER | **UNSUPPORTED** | Position / Simulate / Ask UI | 0 | No | 0 | Neon writes forbidden; no local DB |

### First successful stage
`SOURCE_DOCUMENTS`

### First failed / unsupported stage (hard product break)
`GENERALIZED_RULE_REPRESENTATION` (first `BLOCKED`)

Customer UI is separately `UNSUPPORTED` due to environment constraints.

---

## Per-stage detail

### 0 — SOURCE DOCUMENTS
- **Inputs:** SEC URLs listed in `01-source-manifest.json`
- **Outputs:** `artifacts/stage-00-source-inventory.json`, frozen raw HTML + extracted text
- **Coverage:** 4 documents; Security Documents / intercreditor missing (disclosed)
- **Cost:** $0

### 1 — STRUCTURAL INDEX
- **Outputs:** `stage-01-structural-index-summary.json`, KF structural sample
- **Coverage:** Full-text structure parse for all four docs
- **Errors:** none

### 2 — COVENANT DISCOVERY
- **Pass A:** 258 candidates on CA; signals include prohibitive / Permitted / dollar / ratio patterns
- **KF families on Doc A:** SECTION 10 tagged `LIENS` (+ others); SECTION 11 tagged `FINANCIAL_MAINTENANCE_COVENANTS` / `RATIO_BASED_PERMISSIONS`; some `INDEBTEDNESS` hits (including definitional noise around “Section 10.9 Indebtedness”)
- **Pass B:** synthetic empty — **not** competitive discovery
- **Missing:** executable basket inventory for Permitted Debt (a)–(p)

### 3 — MULTI-DOCUMENT GRAPH
- Classified CA and both indentures correctly; 10-K as UNKNOWN
- No amendment/relationship edges (expected given package composition)
- Instruments grouped as four singleton instruments

### 4 — DEFINITION RESOLUTION
- Anchors found for Permitted Debt, Permitted Liens, Adjusted EBITDA, Net Funded Debt, Restricted Company, Maximum Facility Amount, Facility Amount, Secured Debt, Threshold Amount
- Recursive context-bundle product path not invoked (no issuer-agnostic CLI on main)

### 5 — AMENDMENT PRECEDENCE
- Pipeline ran; zero amendment-shaped effects
- Prior Ninth A&R not in package; Tenth A&R is operative restatement

### 6–7 — RULE REPRESENTATION / VERIFICATION
- **Bypassed?** No. Explicitly **not** hand-modeled.
- Blocked awaiting paid compile or sealed VEP

### 8 — FINANCIAL / UTILIZATION
- `knowledge=UNKNOWN`, `supportsRemainingClaim=false`
- Hypothetical labeled gross probe → `GROSS_ONLY` / not AVAILABLE
- Unmodeled gross → `REFUSED`
- **Safety:** empty ledger did **not** become zero usage

### 9–10 — CAPACITY / SIMULATION
- Empty VEP refused under REQUIRE policy
- No false affirmative permission observed

### 11 — CUSTOMER OUTPUT
- Position/Simulate/Ask not populated (Neon write ban + no local Postgres)
- Customer-facing answer = this offline bundle + NOT DETERMINED posture (see `08-customer-output.md`)

---

## Autonomous completion % by stage

| Stage | Autonomous % | Rationale |
|---|---:|---|
| SOURCE | 80% | Human selected package; fetch/hash automated |
| STRUCTURAL INDEX | 100% | Fully automated |
| DISCOVERY | 40% | Pass A + KF yes; Pass B semantic no |
| PACKAGE GRAPH | 100% | Automated |
| DEFINITIONS | 70% | Anchors automated; recursive product path unused |
| AMENDMENT | 90% | Automated; empty result is package-true |
| RULE IR | 0% | Blocked |
| VERIFICATION | 0% | Blocked |
| FIN/UTIL BINDING | 60% | Authority APIs run; no authentic ledger/FCE bind |
| CAPACITY | 0% | Blocked (fail-closed) |
| SIMULATION | 0% | Blocked (fail-closed) |
| CUSTOMER UI | 0% | Unsupported in this environment |

**End-to-end autonomous document→capacity answer: 0%** (pipeline breaks before executable rules).
