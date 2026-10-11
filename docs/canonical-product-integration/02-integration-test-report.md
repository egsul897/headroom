# Integration Test Report

**Tip under test:** `cursor/canonical-product-integration-5a28` (post-merge wiring)  
**Starting main:** `4f1a0b81207364373d9a4cb9fe515d4a1a002e56`

## Commands and results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| `npm run build` | **PASS** (Next.js production build) |
| Focused workstream vitest (ute + adversarial + operative-authority + identity + financial-util + context-retrieval + membership-plan) | **110 passed / 0 failed / 0 skipped** (10 files) |
| Broader: financial-evidence-adversarial + trusted-identity + package-graph-authority | **57 passed / 4 skipped** (persistence-identity skipped without `HEADROOM3_ALLOW_EVAL_DB`; evidence preserved via #291) |
| `tests/contract-model/certified/**` | **308 passed / 0 failed** (19 files) |
| `tests/capacity/cross-surface-authority-integration.test.ts` | **11 passed** |
| `npx tsx scripts/product/run-unified-transaction-execution-trace.ts` | **EXECUTED_HYPOTHETICAL / HYPOTHETICAL_ONLY / SATISFIED** |

### Persistence baseline (#291)

Preserved: 42 migrations, 9/9 on disposable local EVAL Postgres, 4 live persistence tests executed, DB disposed, no production Neon writes. Not re-run against production. Not re-provisioned (integration did not change persistence schema/behavior).

### Adversarial integration cases (12)

All covered in `tests/product/canonical-product-integration-adversarial.test.ts` (+ deep coverage in workstream suites):

1. Provisional operative — PASS refuse  
2. Unproven CP — PASS refuse production promotion  
3. Conflicting amendments — PASS refuse  
4. Incomplete recursive definitions — PASS (manifest API; WOR baseline suite owns scores)  
5. Missing financial metrics — PASS refuse  
6. UNKNOWN historical utilization ≠ zero — PASS  
7. Forged reviewer approval — PASS refuse  
8. Cross-tenant injection — PASS refuse  
9. Fixture-bound IR remains non-production — PASS  
10. Hypothetical otherwise-satisfied stays non-production — PASS (IdP BLOCKED)  
11. Shared capacity incomplete usage — PASS no completeness cert  
12. Position/Ask/Simulate shared entrypoint — PASS  

## Skips (explicit, not silent success)

- `persistence-identity.test.ts` ×4 — opt-in EVAL DB unset (expected; #291 archived live proof)
