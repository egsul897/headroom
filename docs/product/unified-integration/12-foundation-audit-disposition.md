# Foundation-audit disposition (PR #253 semantic safety)

**Source disclosure:** `docs/product/unified-integration/06-stage6-independent-acceptance.md`  
reported **14 failures** — all 5s timeouts or cache-spy env flakes.

**Scope of this remediation:** semantic safety of EXECUTABLE / path identity / amount
validation. Foundation-audit suites are **not** on the certified-path CI gate and
were not re-run against Neon (no production Neon writes). Classification below is
from the Stage 6 disclosure, suite inventory, and prior integration notes.

## Classification matrix

| Class | Count (disclosed) | Evidence | Merge blocker for #253? |
|-------|-------------------|----------|-------------------------|
| **Environmental / DB race timeouts** | majority of 14 | Stage 6 text: “all 5s timeouts or cache-spy env flakes”; suites under `tests/foundation-audit/repro-connection-race.test.ts`, `repro-claim-review-create-race.test.ts`, `cascade-and-concurrency.test.ts`, `real-db-duplicate-physical-occurrence.test.ts`, `database-integrity-certification.test.ts` hit live Prisma/Neon concurrency | **No** — out of certified-path product surface; do not raise timeouts to conceal races |
| **Cache-spy / env flake** | subset | `semantic-cache-cross-tenant.test.ts`, `cache-invalidation-audit.test.ts` — spy/env timing | **No** |
| **Unresolved product defect on #253 surface** | **0** attributed | Stage 6: “not attributable to integration surface changes”; no foundation-audit file imports `certified-simulate-bridge` | **No** |
| **Test instability (non-product)** | possible residual | Orchestrator wiring tests (`structural-ambiguity-*-orchestrator-wiring.test.ts`) historically flaky under load | **No** for this PR |

## Disposition

1. **Not a merge blocker** for canonical PR #253 semantic-safety tip, provided certified-path CI is green.
2. **Do not** increase Vitest `testTimeout` solely to greenwash races — that would conceal environmental defects.
3. **Follow-up (separate batch):** stabilize foundation-audit DB races with deterministic fixtures / serialized Prisma access / explicit skip when `DATABASE_URL` unreachable — tracked outside product integration.
4. Re-run of full `tests/foundation-audit/**` against production Neon is **out of scope** for this remediation (guardrail: no production Neon writes).

## Residual authentic-production limitations (unchanged)

- Simulate page still passes `verifiedPackage: null` (documented) until authentic VEP retrieval is wired.
- MODELED / EVALUATION_SEED_NOT_NS4_APPROVED labels remain; not NS-4 APPROVED production remaining.
- Completeness certificates for live Neon epochs may be absent → remaining fail-closed under #237.
