# Knife River §7.01 — justified refusal (readiness probe)

## Verdict

**JUSTIFIED_REFUSAL / LIVE_PATH_NOT_IMPLEMENTED** — this script is a **credential/readiness probe**, not a working live interpretation harness. No verified rule produced; no paid calls initiated; no IR fabricated.

## What was established (credential-independent)

| Check | Result |
|---|---|
| Base doc-a §7.01 structural section | Present (`Indebtedness`) |
| Pass A hit on base §7.01 | 1 (SIGNAL_ONLY_NOT_EXECUTABLE) |
| Canonical instrument members | `documentIds = [doc-a]` only |
| Provisional discovery associations | `provisionalDocumentIds = [doc-b, doc-c]` |
| Amendment consolidation | **Forbidden** |
| Operative authority scope | `BASE_AGREEMENT_DOC_A_ONLY` |
| Offline replay corpus for KR 7.01 | Absent |
| `verifiedRule.count` | **0** |
| `interpretation.attempted` | **false** |
| Cost | $0 |

## Gate order (do not skip)

1. Implement certified live path (`createCertifiedCallers` → `compileCandidateToVerifiedIR` → certify)
2. Positive `KNIFE_RIVER_701_BUDGET_CEILING_USD`
3. Certified model ids configured
4. Only then: API credentials + `KNIFE_RIVER_701_INFERENCE_AUTHORIZED=1` + `--live`

Credentials are **not** requested while step 1 is unimplemented.

## Non-goals observed

- No consolidation of provisional First/Second Amendments into operative text
- No invented interpretation or synthetic IR
- No `LIVE_PATH_ENTERED` claim without interpretation actually running
