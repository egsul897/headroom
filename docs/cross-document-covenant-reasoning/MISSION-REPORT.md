# Headroom Agent 5 — Cross-Document Covenant Reasoning

**Branch:** `cursor/cross-document-covenant-reasoning-5d11`  
**PR:** https://github.com/egsul897/headroom/pull/218  
**Implementation SHA:**   
**Branch tip:** see latest commit on this branch`6fddaf90f5ab7cf24dae56360a7981c003165998`  
**Cost:** $0 (zero provider calls; offline fixture reasoning)  
**False-permission count:** **0**

## Mission

Make Headroom evaluate a proposed transaction against **all independently applicable operative agreements**, without duplicating the document graph, amendment precedence, verified rulebook, Phase 4E path enumeration, or cross-rule capacity systems.

## Generalize mission (this tip)

See [`03-generalize-execution-report.md`](./03-generalize-execution-report.md).

| Gate | Result |
|------|--------|
| Completeness audit (CONMED+DSGR) | Missed **0**, false non-applicability **0** |
| Authentic EDGAR scenarios | **12/12** (CONMED, DSGR, Gibraltar, Chewy, FWRG) |
| Synthetic baseline | **8/8** preserved |
| Adversarial | **10/10** FP=0 preserved |
| A8-01 failed-gate | `NOT_SATISFIED` floor + permanent regression suite |
| Sequential state | CONMED debt→RP→overflow; hypothetical isolation |
| Ask honesty layers | `crossDocumentVerdict` ∥ `legacySimulation` ∥ `permissionLayers` |

## What was built (composition, not duplication)

| Existing system | How Agent 5 consumes it |
|---|---|
| Phase 2C package graph | Optional wire; unresolved relationships → unknowns |
| Operative amendment precedence | Effective/supersession dating on facts |
| Phase 3 trusted rulebook | Optional readiness signal |
| Phase 4E `enumerateCertifiedPaths` | Called when a VEP is supplied |
| Phase 4D / verified execution | Agent 4 sequential runner + A8-01 capacity status floor |
| Cross-covenant analysis | Optional within-family / shared-cap notes |
| Legacy covenant-engine capacity | Attached numerically — **never** certified package permission |

### Invariants enforced

1. **Conjunction across applicable documents** — permission in one never overrides prohibition in another.
2. **OR within a document’s basket exceptions** — unused-basket overflow is not controlling when another basket clears.
3. **Irrelevant documents need not authorize**.
4. **Missing restrictions / absent docs are unknowns** — never inferred satisfied.
5. **Legacy numerical ≠ certified permission** — `permissionLayers.certificationStatus.legacyIsCertifiedPackagePermission === false`.

## Scenario corpus

| Layer | Count | Label |
|-------|-------|-------|
| Synthetic baseline | 8 | `SYNTHETIC_PRODUCT_ACCEPTANCE` |
| Authentic EDGAR | 12 | `AUTHENTIC_EDGAR_FIXTURE` |
| Adversarial | 10 | Attack scenarios |

## Test / cost

```
npx vitest run tests/product/cross-document-*.test.ts \
  tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts \
  tests/product/sequential-*.test.ts \
  tests/product/transaction-effect-recipes.test.ts
# 115 passed in last local run
Cost: $0.00
```
