# Agent #213 → Canonical Product Integration (#247–#250)

**Date:** 2026-10-10  
**Authorized branch:** `cursor/unified-stage5-position-ask-f673` (PR **#250**)  
**Do not merge #213 independently.**

## Ancestry

| Ref | Tip SHA | Role |
|-----|---------|------|
| main | `7f1dd3a202b026b9a862ef727480a1a9f284523a` | #237 utilization authority |
| #213 | `696bd7fad4fcaec7237384b33814661497f95183` | Unified Position/Simulate/Ask gate |
| #247 | `0838455d0ef4a7336d998284bbfc2fb8585bd0a8` | Stage 2 verified sequential |
| #248 | `dd727d2b7813d909331ce46dc2f2d28765749ec3` | Stage 3 FCE |
| #249 | `f6322ed70f6712fda83504f7df7cd2360a717397` | Stage 4 entity-scope + cross-doc |
| #250 | (this tip after reconcile commit) | Stage 5–6 full stack — **contains #213 as ancestor** |
| #251 | `887d701168ccc87f37193b22c11d2e9e8a598088` | Parallel post-237 sequential floor (not stacked here) |
| #220 / #231 | open | Superseded into #248 / not required for Stage 5 product surfaces |

**Finding:** `git merge-base --is-ancestor 696bd7fa origin/pr-250` → **YES**.  
Key #213 product files are **byte-identical** on #250 except `transaction-analysis.ts`, where #250 **adds** Stage 4 `crossDocumentVerdict` / `permissionLayers` / deferred Ask numerical layer (stronger honesty).

## Retained from #213 (strongest)

| Capability | Location | Status on #250 |
|------------|----------|----------------|
| 4C attributed utilization + #237 remaining withhold | `attributed-utilization.ts` + overview builder | Retained |
| ~$10.079B false favorable closed | `KNOWN_ATTRIBUTED_ONLY` / remaining null | Retained |
| Verified simulate REQUIRE bridge | `certified-simulate-bridge.ts` | Retained |
| LEGACY labeled separate from verified | SimulateClient / AskShell / VerifiedSimulatePanel | Retained |
| Fixture ≠ Coherent | demo + integration-gate | Retained |
| Ask↔Simulate handoff | `simulate-handoff.ts` | Retained |

## Superseded / not duplicated

| Item | Disposition |
|------|-------------|
| Standalone merge of #213 | **Superseded** by #250 Stage 5 integrate commit `23050570` |
| Competing utilization authority | **Not introduced** — uses `lib/capacity` (#237) |
| Competing sequential runtime | **Not introduced** — Stage 2 REQUIRE adapter (#247/#243) |
| #213-only `transaction-analysis` without cross-doc layers | **Superseded** by Stage 4+5 combined file |

## Added this reconcile

- `tests/product/unified-product-adversarial-gate.test.ts` — missing VEP, missing approved financials, incomplete utilization, synthetic approvals, inconsistent as-of, Position/Simulate/Ask disagreement, LEGACY non-promotion
- Soft skip when Neon unreachable (no invented pass; no production Neon writes)

## Authority distinctions preserved

1. Gross modeled capacity  
2. Known attributed utilization (TRACKED used)  
3. Verified remaining (completeness cert only)  
4. Legal permission (verified REQUIRE / cross-doc layers — not LEGACY match)  
5. Synthetic demonstration (`fixtureOnlyDemonstrations` / `SYNTHETIC_LABELED`)
