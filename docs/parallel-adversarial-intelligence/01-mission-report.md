# Parallel Adversarial Intelligence — Mission Report

## Starting SHA

`67027b8f499921a12cee7b9b9f04d832898b6384` (`main` at mission start; matches `origin/main` after fetch)

**Branch:** `cursor/parallel-adversarial-intel-44cd`  
**Production code modified:** No  
**Evaluation fixtures modified:** No  
**Phase gates advanced / self-certified:** No

**Controlling docs read before audit:**
- `docs/headroom-north-star-v2.md`
- `docs/headroom-north-star-reconciliation/06-revised-roadmap.md`
- `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json`
- `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`
- `docs/intelligence-factory/SILENT-ZERO-CONSUMER-AUDIT.md`
- `docs/agent8-independent-adversarial/02-critical-defects.json` (A8-01/A8-02 CLOSED — not reopened)

## Exact affected modules

| Area | Modules |
|---|---|
| Whole-doc operative tip | `lib/contract-model/compiler/amendment/chain.ts`, `operative-state.ts` |
| Provision authority | `lib/contract-model/compiler/operative-authority/governing-provision.ts` |
| Customer operative UX | `lib/product/customer-intelligence/operative-resolution.ts` |
| Capacity remaining | `lib/contract-model/runtime/capacity/state.ts` |
| Transaction entity scope | `lib/contract-model/runtime/transaction/simulate.ts` |
| Legacy formula eval | `lib/covenant-engine.ts` |
| Product labeling | `lib/dashboard-service.ts`, `lib/home/load-overview.ts`, `lib/customer-workflow/position-view.ts` |
| Readiness / Ask | `lib/product/north-star-workflow/transaction-readiness.ts`, `lib/ask/shell-runner.ts` |
| NCE cross-ref | `lib/negative-covenant-exceptions/cross-reference.ts` |
| Contrasting safeguards | `lib/capacity/utilization-authority.ts`, `verified-remaining.ts`, Agent #7 production gate |

## Severity-ranked findings

See `02-severity-ranked-findings.md` (PAI-01 … PAI-12).

**Highest-signal architectural weaknesses:**
1. **Cross-phase remaining fork:** Phase-4C publishes AVAILABLE remaining = gross on empty ledger; utilization-authority / verified-remaining refuse the same fact.
2. **Whole-document tip honesty gap:** `computeOperativeDocument` ignores as-of and accepts REVIEW_REQUIRED edges as RESOLVED tips, while provision-level Agent #7 is largely fail-closed.
3. **Entity omission → SATISFIED** on simulate/VTE consume paths.

## Minimal reproduction / failing-before evidence

Deterministic suite under `tests/adversarial-intelligence/` (`it.fails` locks). Details in `04-failing-before-evidence.md`.

```bash
npx vitest run tests/adversarial-intelligence
```

## Existing safeguards that already prevent suspected defects

- A8-01 / A8-02 closed and independently retested (32/32)
- Solver `currentUsageAuthoritative` fail-closed
- Product `computeVerifiedRemaining` → GROSS_ONLY without completeness authenticity
- UNSUPPORTED expressions do not become UNLIMITED/Infinity
- IR adapter refuses missing grower %
- Agent #7 as-of, later-unresolved successor, wrong-document, CP caveat gates
- Phase 4D simulate isolation (`commitPlan.executed === false`)

## Smallest bounded remediation

Per-finding in `02-severity-ranked-findings.md`. Preferred order: PAI-01/02 → PAI-03 → PAI-04 → PAI-07 → PAI-06 → product labeling → P2 cleanups. No issuer-specific shortcuts.

## Mission 4 — Customer acceptance

Independently executable specification: `03-customer-acceptance-specification.md`. Does **not** claim support for unrestricted-subsidiary designation end-to-end or certified 4E RP path enumeration beyond what architecture represents.

## CI status at tip

**PR:** https://github.com/egsul897/headroom/pull/323  
**Evidence commit:** `e0a27d7a6832ba188a9aa4fa3ff1e637f2fae198` (suite + docs); CI recorded against that tip before this status note.

| Check | Status |
|---|---|
| Local `npx vitest run tests/adversarial-intelligence` | **25/25 passed** (incl. `it.fails` locks) |
| Vercel @ `e0a27d7a` | **SUCCESS** |
| Vercel Preview Comments @ `e0a27d7a` | **SUCCESS** |
| GitHub Actions on this branch | none triggered (path-filtered / not applicable) |

Production tree unchanged on this branch.

## Unresolved blockers

- Phase 3 reliability / stratified certification still open (roadmap steps 1–3) — out of this mission’s remediating scope
- NS-4 certificate→snapshot adapter not started — financial persistence gaps remain structural
- Dual truth streams (`LedgerEntry` vs `DebtEvent`) remain FUTURE_ENFORCED per invariant 35 note
- Nested Phase-4C AVAILABLE vs product publication honesty split requires an explicit status-model decision (gross vs remaining)

## Recommended integration order

1. PAI-01 + PAI-02 (whole-doc tip)
2. PAI-03 (UNKNOWN scope)
3. PAI-04 (Phase-4C / utilization alignment)
4. PAI-07 (entity omission)
5. PAI-06 (customer-intelligence as-of)
6. PAI-05/08 (gross vs remaining labeling)
7. Remaining P2

Coordinate via small independently reviewable PRs; do not merge remediation with fixture retuning.
