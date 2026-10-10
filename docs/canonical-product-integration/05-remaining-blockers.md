# Remaining Blockers (severity by severity)

| Severity | Blocker | Notes |
| --- | --- | --- |
| **P0** | No production Identity Provider / session / membership system | `#282` boundary verified; `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION=BLOCKED`. Separate workstream required before any PRODUCTION_AUTHORITY_ACTIVE claim. |
| **P0** | Host trusted-issuer activation still BLOCKED (`#268/#279`) | Even with complete financial/utilization fixtures, production capacity publication remains closed. |
| **P1** | Authentic verified executable IR coverage for new issuers | Fixture/hypothetical IR can simulate; AutoNation Round 1 had 0/10 verified executable IR — not altered here. |
| **P1** | Financial evidence completeness for production issuers | Matthews slice proves pathway; production-grade authenticated metrics + attribution still required per issuer. |
| **P1** | Utilization completeness certificates from trusted authorized issuers | UNKNOWN_HISTORICAL_ACTIVITY correctly refuses remaining; real historical reconstruction + counsel certification pending. |
| **P2** | Operative restatement CP satisfaction | `#283` correctly leaves WOR Fifth A&R as CONFIRMED_OPERATIVE_WITH_CAVEATS — independent CP proof not claimed. |
| **P2** | Recursive context SUFFICIENT rate | WOR 1/10 SUFFICIENT preserved; improving requires evidence, not threshold lowering (`#287`). |
| **P3** | Shared disposable EVAL Neon credential for CI agents | `#291` proved local disposable Postgres; optional env secret for future agents. |
| **Frozen** | `#246` unsafe package-graph expansion | Must not merge. |
| **Closed** | `#281` | Superseded by `#290`; do not merge. |

**Success does not require falsely declaring production readiness.**
