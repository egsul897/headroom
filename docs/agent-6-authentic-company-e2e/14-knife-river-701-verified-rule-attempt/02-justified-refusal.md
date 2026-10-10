# Knife River §7.01 — justified refusal (no invented IR)

## Verdict

**JUSTIFIED_REFUSAL / OPERATIONAL_CREDENTIAL** — no verified rule produced; legal interpretation was not attempted and was not fabricated.

## What was established (credential-independent)

| Check | Result |
|---|---|
| Base doc-a §7.01 structural section | Present (`Indebtedness`) |
| Pass A hit on base §7.01 | 1 (SIGNAL_ONLY_NOT_EXECUTABLE) |
| Amendment consolidation | **Forbidden** — `PROVISIONAL_FAMILY`, `mayConsolidateOperativeAgreement=false` |
| Operative authority scope | `BASE_AGREEMENT_DOC_A_ONLY` (doc-b / doc-c excluded) |
| Offline replay corpus for KR 7.01 | Absent |
| `verifiedRule.count` | **0** |
| Cost | $0 |

## Exact inputs required to proceed (any one live path)

1. `AI_GATEWAY_API_KEY` **or** `ANTHROPIC_API_KEY`
2. `KNIFE_RIVER_701_INFERENCE_AUTHORIZED=1`
3. Explicit budget ceiling (USD) for certified compile/inventory/verify
4. `certifiedConfig` model IDs for `createCertifiedCallers`
5. Run: `npx tsx scripts/agent6/attempt-knife-river-701-verified-rule.ts --live`

**Alternative:** an approved offline replay corpus at `tests/fixtures/phase-3-live-replay/knife-river-7.01` (does not exist today).

## Production path when authorized

`createCertifiedCallers` → `buildCandidateCompilerInput(doc-a §7.01)` → `compileCandidateToVerifiedIR` → verify/certify → (optional) `evaluateVerifiedCapacity` under REQUIRE only if CERTIFIED.

## Non-goals observed

- No consolidation of provisional First/Second Amendments into operative text
- No invented interpretation or synthetic IR
- Not a discovery scorecard — refusal is the deliverable until credentials/spend land
