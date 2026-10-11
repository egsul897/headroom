# Next legal-context improvement handoff (post–HEADROOM-6)

**Status:** Agent #6 complete — do not reopen without a demonstrated regression.  
**Source tip:** PR #287 (`b2bff75e` verified; see `17-final-disposition.json` for reconciled tip).  
**Sealed scorecard to preserve:** WOR Layer C = **1/10 SUFFICIENT**, **9/10 REVIEW_REQUIRED**, **0 false SUFFICIENT** (unless independently supported improvements are demonstrated).

## Do not

- Lower sufficiency thresholds to inflate SUFFICIENT.
- Invent missing schedules, definition text, or amendment/operative authority.
- Silently convert REVIEW_REQUIRED / BUDGET_EXCEEDED into SUFFICIENT.
- Bypass `candidate-span.resolveOperativeSource` (IPV-04).

## Remaining coverage limitations (honest)

1. **Definition morphology** — `"Equivalent Amount" of any currency … means` (and Equivalent Currency) still surface as `UNRESOLVED_DEFINED_TERM` because the structural detector requires quote-adjacent `means`.
2. **Schedules / exhibits** — `Schedule 1.02`, `6.03`, `2.01`, `Exhibit A` are absent from the structural index → `MISSING_SCHEDULE` → REVIEW_REQUIRED (correct fail-closed).
3. **Nested / soft budget continuation** — deep trees and large historical docs emit MEDIUM `BUDGET_EXCEEDED_DEPENDENCY` after closure starts (continuation, not silent truncate).
4. **Operative-document succession** — owned by **#283 / HEADROOM-7** (`bindCandidateToOperativeRetrievalSource`); not in Agent #6 scope.

## Suggested next workstream (bounded)

| Priority | Work | Acceptance |
|---|---|---|
| A | Definition-detector support for post-quote qualifiers before `means` (generic, not WOR-hardcoded) | Equivalent Amount family resolves without false SUFFICIENT elsewhere |
| B | Structural indexing / package inclusion of schedules & exhibits when present in source text | MISSING_SCHEDULE only when truly absent |
| C | Consume #283 governing-document binding in offline WOR probes once #283 merges | Same Layer C scorecard or independently evidenced improvement |

## Integration contract with #283

1. #283 selects `governingDocumentId` / production gate (**never** invented by retrieval).
2. Remap candidate `documentId` / anchors via `bindCandidateToOperativeRetrievalSource`.
3. Call `buildCovenantContextBundle` unchanged; honor `contextManifest` + `sufficiencyState`.
4. If authority is provisional/blocked, do not elevate retrieval SUFFICIENT into production capacity.
