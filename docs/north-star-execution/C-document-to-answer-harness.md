# Workstream C — Document-to-answer acceptance harness

**Module:** `lib/product/document-to-answer-harness/`  
**Version:** `document-to-answer-harness.v1`  
**Mode:** `NON_AUTHORITATIVE` (default; `PRODUCTION_AUTHORITY` always refused)  
**Controlling North Star:** `docs/headroom-north-star-v2.md` §§1–8, Ask Headroom §7  
**Phase gates:** trusted-identity BLOCKED; no AVAILABLE publication; Phase 3
certification not claimed.

## Trace stages

1. `source_documents` — refuse empty / missing  
2. `compilation` — `compileOperativeCovenantPackage` (PROVIDER_FREE)  
3. `operative_authority` — confirmed vs ambiguous; OA/calc mismatch → REFUSE  
4. `financial_state` — APPROVED facts only; else NEEDS_INPUT / REFUSE  
5. `capacity_simulation` — diagnostic gross−ledger only; **AVAILABLE always null**  
6. `output` — non-authoritative summary; blockers + provenance

## Integrity invariants

| Invariant | Enforced |
|---|---|
| Uncertainty preserved across stages | Yes |
| AVAILABLE never published | Yes (`availableCapacityUsd: null`) |
| PRODUCTION_AUTHORITY mode refused | Yes |
| OA/calculation mismatches refuse numeric claims | Via compile diagnostics |
| No invented financials / ledger / pro-forma | Missing → NEEDS_INPUT |

## Tests

`tests/product/document-to-answer-harness.test.ts`

## Explicitly not claimed

- Authoritative remaining capacity  
- Full Ask Headroom orchestration  
- Certified VerifiedExecutionPackage path  
- Shared-cap / reclassification completeness  

## Recommended next bounded task

Wire one representative Matthews + one MHK question through the harness into a
sealed JSON artifact under `docs/north-star-execution/traces/` with tip SHA, then
extend to an incomplete-package refusal case from the Workstream B corpus.
