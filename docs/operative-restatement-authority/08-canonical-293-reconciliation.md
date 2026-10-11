# Agent #7 — Canonical #293 reconciliation

**Disposition:** `AGENT_7_CANONICAL_INTEGRATION_DEFECT`  
**Date:** 2026-10-10  
**No self-merge. No production activation.**

## Exact SHAs (origin)

| Ref | SHA |
|---|---|
| `origin/main` | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` |
| PR #283 tip | `50ab46adb298d60a2630d995a9506f5c3598dc5d` |
| PR #287 tip | `603426c3e59b2f16b5c7b26a7e373c98de45c4cf` |
| PR #293 tip | `8a4beb52712a6e31e5458fe2a005026fadedd4f1` |
| Previously reviewed #283 tip | `0da545027365db571c4e7c51352424a167f3c14f` |

## Intervening commit analysis (`0da54502` → `50ab46ad`)

| Commit | Class | Production code? |
|---|---|---|
| `50ab46ad` docs(operative-authority): record exact-tip CI green… | **documentation** | **No** |

Diff: `docs/operative-restatement-authority/05-closeout.json` + `07-tip-regression-evidence.txt` only.  
No re-run of production regressions required beyond confirming docs-only delta (CI already green on `50ab46ad`).

## Source absorption matrix (#283 vs #293)

| Artifact | #283 tip | #293 tip | Status |
|---|---|---|---|
| `operative-authority/{bundle,governing-provision,restatement-*,production-authority-gate,types,date-utils}.ts` | present | present | **identical** |
| `operative-authority/retrieval-source.ts` | present (`0dcb4a17`) | **absent** | **MISSING** |
| `operative-authority/index.ts` export of binder | present | missing export | **MISSING** |
| Offline compile: `buildOperativeAuthorityHandoffBundle` + production gate | present | present | absorbed at `dee2545d` |
| Offline compile: `bindCandidateToOperativeRetrievalSource` before `buildCovenantContextBundle` | present | **absent** | **MISSING** |
| `context-retrieval/{pipeline,body-anchor,manifest}.ts` (#287) | present | present | **identical** (via `d369ddc3` ← `b2bff75e`) |
| `retrieval-source-binding.test.ts` | present | **absent** | **MISSING** |
| Unified execution adapter `#283` production gate (`lib/product/.../operative-authority.ts`) | n/a on #283 | present | #293/#285 path OK |
| #282 trusted identity | via consume | integrated `271cb518` | preserved on #293 |

**Root cause:** #293 integrate commit `6de127a7` merged #283 at `dee2545d` — **before** Agent #6 merge (`3ad64aa2`) and retrieval binding (`0dcb4a17`).

## Operative retrieval call graph

### Complete (#283 tip `50ab46ad`)

```
compileFrozenDebtPackage
  → buildOperativeAuthorityHandoffBundle  (#7)
  → summarizeBundleProductionAuthority({ attemptPromotionToProduction: true })
  → bindCandidateToOperativeRetrievalSource(candidate, authority, index)  (#7→#6)
  → buildCovenantContextBundle({ candidate: retrievalCandidate })  (#6)
       → resolveOperativeSource(...)  (candidate-span; body-anchor narrowing)
  → operativeSourceTextFor(operativeCandidate, ...)
```

### Incomplete (#293 tip `8a4beb52`)

```
compileFrozenDebtPackage
  → buildOperativeAuthorityHandoffBundle  (#7)  ✓
  → summarizeBundleProductionAuthority(...)     ✓
  → buildCovenantContextBundle({ candidate })   ✗ skips governingDocumentId remap
       → resolveOperativeSource(...)            ✓ (on discovery documentId)
```

## Smallest safe correction on #293

1. Bring forward from #283 tip (no second authority engine):
   - `lib/contract-model/compiler/operative-authority/retrieval-source.ts`
   - export from `operative-authority/index.ts`
   - offline-compile binder wiring + `stages.context.operativeSource*` counters
   - `tests/operative-restatement-authority/retrieval-source-binding.test.ts`
2. Do **not** independently merge #283 or #287.
3. Re-run Agent #11 AutoNation Round 2B after absorption (operative-doc accuracy may remain 0/1 — see evidence gaps).

## AutoNation acceptance (Agent #11 Round 2 on #293)

| Metric | Result |
|---|---|
| Operative-document accuracy | **0/1** (expected `doc-b`, observed `null`) |
| Scorecard tip | `2e8c9973` (after #283/#287 integrate; before tip `8a4beb52` summary fix) |
| `agent7GoverningDocId` | `null` |
| Restatement authorities | doc-a & doc-b both `REVIEW_REQUIRED`, `predecessorDocumentId: null` |
| Package-graph RESTATES | both `UNRESOLVED` |

**Earliest failing authority decision:** `extractRestatementAuthorityEvidence` / `resolvePriorAgreementTargetDocumentId` — Fifth AR names **Fourth** Amended & Restated Credit Agreement dated **July 18, 2023** as “Existing Credit Agreement”, but the sealed package only contains Third AR (`doc-a`, 2020-03-26) and Fifth AR (`doc-b`, 2026-09-14). No in-package unique prior match → no confirmed RESTATES successor governance → `selectedOperativeDocumentId=null`. Fail-closed is correct; not a silent promotion.

Retrieval binding would not by itself flip AutoNation to 1/1 without resolving that prior-agreement identity gap (package completeness or human-approved out-of-package prior policy — out of Agent #7 scope to invent).

## Authority safety (exact tips)

| Tip | Suite | Result |
|---|---|---|
| #283 `50ab46ad` | `tests/operative-restatement-authority` (23) | **23/23 PASS** |
| #293 `8a4beb52` | same minus retrieval-source-binding (20) | **20/20 PASS** |

Guards held on both: caveated ≠ ACTIVE; provisional blocks; CP `NOT_INDEPENDENTLY_PROVEN`; package-graph snapshot non-mutation.

## Merge recommendation

- **Do not** merge #283 or #287 independently without human direction.
- Prefer absorbing the missing retrieval-binding slice into **#293**, then human-approve #293 under branch protection.
- Isolated Agent #7 development **stops** at this reconciliation.
