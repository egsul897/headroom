# Stage 5 — Position / Simulate / Ask (#213)

**Branch:** `cursor/unified-stage5-position-ask-f673`  
**Base:** Stage 4 tip `f6322ed7`  
**Merged tip:** `#213` @ `696bd7fad4fcaec7237384b33814661497f95183` (rechecked; superseded reported `de5742a5` / interim `4ea51390`)

## Conflicts resolved

| File | Resolution |
|------|------------|
| `transaction-analysis.ts` | **#213 verified-simulate + executableOutcomes** + Stage 4 `crossDocumentVerdict` / `permissionLayers` |
| `legacy-simulate-bridge.ts` | Took **#213** (completeness / effects / #237 remaining honesty) |
| certified-vs-legacy demo docs/json | Took **#213** |

## Shared inputs (Position / Simulate / Ask)

- Same draft fields via `parseTransactionDraft` + `buildSimulateHandoffHref`
- Same verified package optional input (never fabricated)
- Same `enumerateCertifiedPaths` + `attemptVerifiedSimulate` (REQUIRE gates)
- Same legacy simulate bridge (labeled LEGACY_ENGINE; not certified)
- Same cross-document verdict when operative facts supplied
- Same #237 utilization / completeness gates on remaining claims

## Fail-closed

- Missing VEP / incomplete gates → verified path not executable; UI shows blockers
- No fallback that invents favorable certified capacity when verified refuses
- Legacy figures remain clearly labeled and separate from CERTIFIED_4E

## Local gates

`tsc` clean; unified-position + transaction-analysis + cross-doc Ask honesty + Stage D / sequential / architecture / utilization — **137** tests pass in the Stage 5 focused suite.
