# Customer Cold-Start Readiness Assessment

**Cycle:** 2 (Workstream E)  
**Access mode:** Offline / deterministic where possible  
**Paid inference:** $0 (no Anthropic)  
**Neon KF mutations:** 0  

## Commands run

| Command | Result |
|---|---|
| `npx vitest run tests/onboarding/synthetic-acceptance.test.ts` | **13/13 passed** |
| `npx vitest run tests/onboarding/setup-status.test.ts tests/onboarding/analysis-readiness-contract-docs.test.ts` | **4/4 passed** |
| `npx tsx scripts/onboarding-precedent-acceptance.ts` | Completed; recall 75%; formula/threshold defects documented |
| `npx vitest run tests/stratified-cert/gibraltar-development-pipeline.test.ts` | **1 failed** (Pass A candidate count 711 vs expected 938 — fixture/pipeline drift; not introduced this cycle) |

## Cold-start workflow (synthetic company)

Exercised end-to-end with `SyntheticExtractionProvider` (zero company-specific code):

UPLOAD → PARSE/CHUNK → EXTRACT → REVIEW → PROMOTE → financials → facilities → certify inputs → golden proposals → dashboard capacity.

### Manual interventions still required (recorded by pipeline)

| Gate | Existing status semantics |
|---|---|
| Confirm document type | user confirmation before trust |
| Review extraction candidates | `PENDING` → `APPROVED`/`EDITED`/`REJECTED` with `reviewedBy` |
| `KNOWN_NOT_MODELED` gaps | never promote; force `ACTIVE_WITH_LIMITATIONS` if unresolved |
| Analysis readiness | promote gated on `AnalysisReadinessReason` (`READY` / stale / never analyzed…) |
| Manual financial snapshot | required for `EXECUTABLE_PATH_AVAILABLE` |
| Facility mapping | human-confirmed |
| External input certification | placeholder until certified |
| Golden tests | proposals start `UNVERIFIED` |
| Capacity honesty | `capacityCertified: false`; authority `LEGACY_ENGINE` / `NOT_CERTIFIED_4E` |

### Readiness vocabulary (no parallel statuses invented)

- **Ready to evaluate** ↔ `CapacityReadinessStatus.EXECUTABLE_PATH_AVAILABLE` + workflow steps `READY`
- **Needs financial information** ↔ `NO_FINANCIAL_SNAPSHOT` / workflow `approvedFinancialSnapshot: MISSING`
- **Needs ledger information** ↔ workflow `historicalLedger: MISSING` / `PARTIAL`
- **Needs contractual evidence** ↔ `NO_DOCUMENTS` / `AnalysisReadinessReason.NO_DOCUMENTS` / `NEVER_ANALYZED` / `STALE_DOCUMENTS_SINCE_LAST_RUN`
- **Needs legal review** ↔ `ACTIVE_WITH_LIMITATIONS`, `REVIEW_REQUIRED`, claim-review / unresolved contract items

## Real-prose cold start (synthetic provider honesty)

Against Coherent ground-truth Permissions (ephemeral test company only):

| Metric | Value |
|---|---:|
| Ground-truth items | 4 |
| Extracted MODELED candidates | 3 |
| Recall (section found) | **75%** |
| Precision (maps to real item) | **100%** |
| Threshold numerically correct | **0/3** ($X,000,000 unscaled → 1,000,000× off) |
| formulaType correct | **0/3** (always `FLAT_AMOUNT`; drops greater-of/EBITDA grower) |
| grantType correct | **2/3** (lien basket mis-tagged DEBT_INCURRENCE) |
| False negatives | 1 (TNL maintenance §6.11(a) invisible) |
| Gap placeholders for ratio covenants | **0** (silent miss) |

**Implication:** Autonomous customer onboarding cannot be declared customer-ready on the synthetic extractor. LLM extraction remains the intended quality path and was **not** authorized (paid inference) this session.

## Unseen package (Gibraltar offline)

- Offline Pass A / structure stages run without provider calls.
- Candidate-count assertion failed (711 ≠ 938) — treat as **regression signal on offline discovery scale**, not as a successful cold-start certification.
- Pass B correctly requires provider execution (fail-closed without keys).

## Customer-ready verdict

| Dimension | Status |
|---|---|
| Pipeline exists for cold start | **Yes** (synthetic E2E green) |
| Zero manual intervention | **No** — review, financials, facilities, certification required |
| Operative rulebook without hand curation | **No** — SemanticTruth 0; promotion UNVERIFIED |
| Accurate basket math from raw SEC prose via synthetic extract | **No** (0/3 formula/threshold) |
| Readiness explanation to customer | **Partial** — enums exist; product surfaces need consistent packaging of the five readiness buckets above |

## Next highest-value E tasks

1. Package readiness buckets into one customer-facing assessment API using existing enums only.
2. Improve synthetic (or authorize LLM) extraction for `$X,000,000` scale + greater-of growers + maintenance covenants.
3. Rebaseline Gibraltar Pass A expected counts or fix discovery drift.
4. Blind holdout package through full onboarding without preloaded rule IDs once extraction quality allows.
