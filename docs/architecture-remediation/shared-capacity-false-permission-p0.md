# P0 — Shared-capacity false-permission remediation

**Branch:** `cursor/architecture-remediation-7cc2`  
**Independent evidence:** Live Corpus Quality Gate Phase 3 (PR #153) ADV-FP-01 / ADV-FP-02  
**Certification:** NONE claimed · no merge · freeze / Claude fixtures untouched

## Root cause

Three production classification paths labeled ordinary aggregate monetary restrictions as shared capacity:

1. **Pass A** (`discovery/pass-a-signals.ts`) — `shared_cap` regex included `aggregate(?:d)? (?:amount|basket)`.
2. **Coverage-audit role assignment** (`coverage-audit/source-inventory.ts`) — `aggregate_amount` OR `shared_cap` → `SHARED_CAP_CANDIDATE`.
3. **Sibling / context typing** (`context-retrieval/structural-context.ts`, `coverage-audit/context-inventory.ts`) — bare `in the aggregate` / `aggregate amount` typed as `SHARED_CAP`.

Semantic-verification inventory already excluded bare aggregate amount; figure-role already refused comparator-as-capacity. The defect was upstream labeling that downstream consumers could treat as affirmative shared-capacity evidence.

## Fix

- Central gate: `lib/contract-model/compiler/shared-capacity-signals.ts`
  - `shared_cap` requires multi-permission relationship language
  - bare aggregate → `aggregate_amount` only (never shared_cap)
- Pass A emits distinct `aggregate_amount` vs `shared_cap`
- Coverage-audit: only `shared_cap` → `SHARED_CAP_CANDIDATE`
- Context sibling typing narrowed to relationship language
- Semantic SHARED_CAP_MARKER aligned (multi-clause / together-with cite)

## Interactions

- **Comparator-as-capacity** (`figure-role.ts`, commits `ec7d5df` / `9acebd3` / `8f87a06`): regression tests confirm threshold-as-capacity refusal undisturbed.
- **PR #130** (`unlimited-carveout-fail-closed-3953`): no shared files in this change set; carve-out fail-closed path orthogonal.

## Gibraltar offline probe (post-fix)

Pass A on Gibraltar extracted text: `shared_cap` candidates ≈ **18** (was fixture 51); `aggregate_amount` ≈ **92** as separate economic recall. Frozen LCQG fixtures not modified.

## Independent replay handoff (LCQG)

Proposed fix SHA: `83cde5b985b6bb480ac2500cccf894fe6e497f20`  

Independent test command:

```bash
npx vitest run tests/contract-model/shared-capacity-false-permission.test.ts \
  tests/contract-model/figure-role.test.ts \
  tests/contract-model/coverage-audit-pipeline.test.ts \
  tests/contract-model/semantic-verification-reconciliation.test.ts
```

Acceptance for LCQG ADV-FP-01/02: ordinary aggregate text must not classify as `shared_cap` / `SHARED_CAP_CANDIDATE` / `SHARED_CAP_MARKER`; genuine together-with / multi-clause / shared-capacity language must still fire.

## Remaining risks

- Exotic shared-pool phrasing outside the relationship regex may under-recall (fail-closed to aggregate_amount / REVIEW_REQUIRED — preferred to false affirmative).
- Frozen Phase-1 `pass-a-shared-cap.json` (51 hits) remains historical evidence until a new evaluation epoch.
- Pass A is still a recall-oriented candidate generator — shared_cap hits are not capacity grants; consumers must still require affirmative permission + relationship IR.
