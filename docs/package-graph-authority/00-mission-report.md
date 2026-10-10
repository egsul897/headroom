# HEADROOM-3 — Package Graph and Amendment Authority

**Verdict:** see final boxed report in the PR / agent closeout  
**Branch:** `cursor/package-graph-authority-610f`  
**Base:** `main` @ starting SHA recorded in closeout  

## What landed on main before this PR

- Trusted-only union-find in `instrument-grouping.ts` (`RESOLVED` + `STRONG_TARGET_EVIDENCE`).
- Mature Phase 2G operative state (`computeOperativeContractState`) with provision-level chains, effective dating, conflict detection, and supersession index.
- Package-graph persistence with idempotent edge/effect upserts — but **no** provisional association layer, **no** stale `instrumentId` clearing, **no** orphan instrument cleanup.

## What this PR adds (bounded)

| Scope | Change |
| --- | --- |
| A | Provisional discovery associations + bridge blockers; confirmed `documentIds` only for canonical identity |
| B | Persist assigns `Document.instrumentId` only from confirmed members; clears stale; deletes empty orphans |
| C | `document-roles.ts` — original / amendment / restatement / supplemental / waiver / side letter (+ dates) |
| D | `operative-handoff.ts` — deterministic HEADROOM-1 contract; fails closed on provisional identity |
| E | Adversarial tests under `tests/package-graph-authority/` |

## Explicitly NOT activated (PR #246 blockers preserved)

- Uniqueness / TOCTOU protection for relationship-edge writes
- Large duplicate-row population remediation
- Self-loop graph expansion cleanup
- Untested migration rollback
- Graph-wide backfill / Neon expand resume
- DISCOVERED → CERTIFIED promotion
- Broad KF graph expansion from PR #246

These appear in `OperativeHandoffBundle.unsupportedCases` as `PR246_*` markers.

## Integration handoff (HEADROOM-1)

Consume:

```ts
import { buildOperativeHandoffBundle } from
  "lib/contract-model/compiler/package-graph/operative-handoff";
```

For each provision, the bundle returns canonical instrument key (only when confirmed), source span, amendment chain, as-of date, supersession status, authority classification, unresolved conflicts, and provenance. Do not treat `provisionalDocumentIds` as membership.

## Guardrails observed

- No paid inference
- No production company Neon writes (EVALUATION fixture tenants only in DB tests)
- No unapproved migration
- No graph-wide backfill
- No auto-merge / certification promotion
- No compiler-internal or product-UI changes
