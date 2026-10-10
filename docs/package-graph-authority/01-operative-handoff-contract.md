# Operative provision resolution — HEADROOM-1 handoff

**Owner:** HEADROOM-3 (package graph + amendment authority)  
**Consumer:** HEADROOM-1 (compiler / verified-rule path)  
**Module:** `lib/contract-model/compiler/package-graph/operative-handoff.ts`

## Entry point

```ts
import { buildOperativeHandoffBundle } from
  "@/lib/contract-model/compiler/package-graph/operative-handoff";

const bundle = buildOperativeHandoffBundle({
  packageGraph,          // PackageGraphResult from buildPackageGraph
  asOfDate: "2024-06-01",
  operativeStates,       // OperativeContractState[] from computeOperativeContractState
});
```

HEADROOM-3 does **not** modify compiler internals. Callers compute `OperativeContractState` themselves and pass it in.

## Per-provision fields

| Field | Meaning |
| --- | --- |
| `canonicalInstrumentKey` | Set only when instrument membership is confirmed (trusted edges, no provisional associations). Null otherwise. |
| `sourceDocumentId` + `sourceSpan` | Governing source document and citation/node identity |
| `applicableAmendmentChain` | Full chain with `appliedAsOfQuery` flags |
| `effectiveAsOfDate` | Query date |
| `supersessionStatus` | `CURRENT_OPERATIVE` / `KNOWN_SUPERSEDED` / `PARTIALLY_SUPERSEDED` / `UNKNOWN` |
| `authorityClassification` | See below |
| `unresolvedConflicts` | Conflict + sequencing issues |
| `provenance` | Operative-state status, target resolution, structural health, association kind |

## Authority classification (fail closed)

| Value | When |
| --- | --- |
| `CONFIRMED_OPERATIVE` | Confirmed identity + resolved unique provision + attached text |
| `PROVISIONAL_IDENTITY_BLOCKED` | Provisional / unconfirmed instrument — never consolidate |
| `NOT_YET_EFFECTIVE` | Chain exists but only after as-of date |
| `SUPERSEDED_SOURCE` | Attempted replacement text without unique target attach |
| `AMBIGUOUS` | Duplicate section refs / multi-candidate target |
| `REVIEW_REQUIRED` | Missing effective date, partial evidence, etc. |
| `CONFLICTED` | Competing same-date effects |
| `UNSUPPORTED` | No safe projection |

## Instrument identity rules for consumers

- Use `instruments[].confirmedDocumentIds` for canonical membership.
- Never treat `provisionalDocumentIds` as `Document.instrumentId` candidates.
- `mayConsolidateOperative === false` means refuse operative consolidation.
- `bridgeBlockers` explain refused provisional merges.

## Unsupported / preserved blockers

`bundle.unsupportedCases` always includes PR #246 markers:

- `PR246_TOCTOU_UNIQUENESS`
- `PR246_DUPLICATE_ROW_POPULATION`
- `PR246_SELF_LOOPS`
- `PR246_UNTESTED_ROLLBACK`

Do not activate broad graph expansion until those are independently remediated.
