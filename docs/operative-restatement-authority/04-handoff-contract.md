# Operative authority handoff — Agents #6 / #10

**Owner:** HEADROOM Agent #7  
**Module:** `lib/contract-model/compiler/operative-authority/`  
**Entry:** `buildOperativeAuthorityHandoffBundle`

## Entry point

```ts
import { buildOperativeAuthorityHandoffBundle } from
  "@/lib/contract-model/compiler/operative-authority";

const bundle = buildOperativeAuthorityHandoffBundle({
  companyId,
  packageKey,
  asOfDate: "2026-08-31",
  documents,
  packageGraph, // from buildPackageGraph — edges consumed, never mutated
  provisions: [{ sectionRef: "6.01" }],
  instrumentDocumentIds: ["doc-a", "doc-b"],
  baseDocumentId: "doc-a",
  // Optional — from HEADROOM-3 (#274) when merged/available:
  confirmedInstrumentIdentity: {
    instrumentKey: "instrument:…",
    confirmedDocumentIds: ["doc-a", "doc-b"],
    provisionalDocumentIds: [],
    mayConsolidateOperative: true,
  },
});
```

## Fields consumers must honor

| Field | Consumer rule |
| --- | --- |
| `restatementAuthorities[].status` | Only `OPERATIVE_AUTHORITY_CONFIRMED` authorizes successor governance (after as-of). |
| `restatementAuthorities[].caveats` | Must be surfaced; especially `CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN`. |
| `provisions[].governingDocumentId` | Source document for retrieval (#6) / execution (#10). Null ⇒ refuse. |
| Retrieval binding | Offline compile calls `bindCandidateToOperativeRetrievalSource` before `buildCovenantContextBundle` (Agent #6 body-anchor / recursive closure). Remap only when classification is `CONFIRMED_OPERATIVE`, `CONFIRMED_OPERATIVE_WITH_CAVEATS`, or `NOT_YET_EFFECTIVE` (predecessor still governs) **and** `governingDocumentId` is non-null. Provisional / ambiguous / review-required never silently consolidate onto a successor. |
| `provisions[].authorityClassification` | `CONFIRMED_OPERATIVE` may authorize unconditional operative-text authority. `CONFIRMED_OPERATIVE_WITH_CAVEATS` is **HYPOTHETICAL_OR_DISCLOSED_ONLY** — usable for retrieval/disclosure, **never** `PRODUCTION_AUTHORITY_ACTIVE`. `REVIEW_REQUIRED` / `AMBIGUOUS` / `PROVISIONAL_IDENTITY_BLOCKED` / `UNSUPPORTED` / `NOT_YET_EFFECTIVE` ⇒ fail closed. |
| Production gate | Call `evaluateProductionAuthorityPromotion` / `summarizeBundleProductionAuthority({ attemptPromotionToProduction: true })` before elevating. Caveated / unproven-CP authority always refuses ACTIVE. |
| `unsupportedCases` | Explicit refusals / non-mutations preserved for audit. |
| `doesNotMutatePackageGraphRelationship` | Always `true` on authority rows — package-graph identity remains #274’s job. |

## WOR demonstration (sealed #276 texts)

See `02-wor-resolution.json`:

- As of `2026-08-30` → `doc-a` (`NOT_YET_EFFECTIVE` for Fifth AR)
- As of `2026-08-31` → `doc-b` (`CONFIRMED_OPERATIVE_WITH_CAVEATS`)
- Package-graph `doc-b RESTATES doc-a` remains `REVIEW_REQUIRED` / `SUPPORTING_TARGET_EVIDENCE`
