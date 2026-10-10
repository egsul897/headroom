# Stage 6 — Independent Acceptance

**Tree tip:** `230505709e4350eb6634b6f23d3032fc160dfa95` (`cursor/unified-stage5-position-ask-f673`)  
**Main baseline:** `7f1dd3a202b026b9a862ef727480a1a9f284523a`

## Suites run

| Suite | Result |
|-------|--------|
| `tsc --noEmit` | **pass** |
| `npm run test:phase3-certification` | **481/481 pass** |
| Architecture + verified-execution + shared-capacity | pass (in p3 cert) |
| FCE (financial engine) | pass |
| Sequential + recipes + verified-boundary | pass |
| Utilization (#237) + A8 + remediation R8 | pass |
| Cross-document + Stage D entity-scope/dual-path | pass |
| Unified Position/Simulate/Ask | pass |
| Adversarial verification | pass |
| Foundation-audit (DB race / cache / orchestrator) | **14 failures** — all 5s **timeouts** or cache-spy env flakes; **not** attributable to integration surface changes |

## False favorables / false refusals (independent expectations)

| Scenario | Expected | Observed |
|----------|----------|----------|
| Secured $15M dual-path | SATISFIED debt∩lien; post $35M/$5M | Pass |
| Aggregate draws $30M ≠ economic principal $15M | Label + per-basket $15M draws | Pass |
| Debt-only SATISFIED | Not secured dual-path permission | Pass |
| Missing VEP on Ask/Simulate verified bridge | Refuse with blockers; not executable | Pass |
| Cross-document missing authority | Refuse / unknown — not satisfied | Pass (FP=0 adversarial corpus) |
| Failed gate capacity | NOT_SATISFIED / not AVAILABLE (#229) | Pass (A8 13/13) |
| Remaining without completeness | GROSS_ONLY / supportsRemainingClaim false (#237) | Pass |
| Unauthorized RESTORE | REFUSED UNAUTHORIZED_CAPACITY_RESTORE | Pass (boundary gate) |

Expectations were **not** rewritten to match engine outputs.

## Product readiness

**Not declared.** Tests pass on the integrated tree; customer-grade / legal certification still require human review and authentic package promotion. Synthetic demos remain labeled `SYNTHETIC_LABELED_TECHNICAL_DEMO`.

## Next smallest integration batch

1. Human merge review of stacked PRs **#247 → #248 → #249 → #250** (or squash-merge tip of #250 once CI green).  
2. Thin adapter: collapse FCE `utilization-honesty.ts` to call `#237` `lib/capacity/utilization-authority.ts` (remove mirror types).  
3. Optionally stabilize foundation-audit DB race timeouts (environment / testTimeout) — out of product-integration scope.  
4. Close superseded open PRs (#223, #243, #220, #218, #233, #213) after tip lands — do not merge stale capacity from #218.
