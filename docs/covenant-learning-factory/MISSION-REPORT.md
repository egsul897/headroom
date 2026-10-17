# Covenant Learning Factory — Mission Report

## Verdict

**PARTIAL_LIVE_BLOCKED_NEON — OFFLINE_FACTORY_OPERATIONAL**

Headroom can now run a resumable, issuer-agnostic precedent learning loop over authentic packages using the canonical offline compiler. File-backed knowledge, evaluation, error ledger, improvement proposals, and dashboard are working. Live Neon inventory/persist remains blocked on **credential auth** (`28P01` / `P1010` for `neondb_owner`); the pooler host is network-reachable over TCP/TLS/IPv4 (secret refresh required).

This run did **not** train a model, certify a rulebook, or grant production authority.

## Required outputs

| # | Output | Status |
|---|---|---|
| 1 | Baseline inventory | `BASELINE-INVENTORY.md` / `inventory-status.json` — 17 reusable, 2 incomplete, 1 fixture-specific, 0 missing |
| 2 | Precedent ingestion + processing pipeline | `lib/covenant-learning-factory` + `npm run clf:batch` (reuses KF sources + `compileFrozenDebtPackage`) |
| 3 | Neon-backed versioned knowledge repo | Additive migration `20261013180000_covenant_learning_factory`; file store online; Neon apply blocked |
| 4 | Independent benchmark + error ledger | Per-package audit manifests + `learning_error_ledger_entries` schema |
| 5 | Automated regression / improvement loop | Eval → error classify → bounded proposals (`autoApply: false`) → dashboard |
| 6 | Dashboard / report | `dashboard.json` |
| 7 | Multi-issuer demo (same compiler) | `demo-unseen.json` — MTN, MHK, ROCK, CHWY |

## Demo results (paid inference $0)

| Package | Cohort | Nodes | Candidates | VE units | Fidelity | Status |
|---|---|---:|---:|---:|---|---|
| MTN | TRAIN_DEV | 1976 | 344 | 3 | PASS | OK |
| MHK | HELD_OUT | 910 | 142 | 4 | PASS | OK |
| ROCK | TRAIN_DEV | 1519 | 205 | 0 | unknown | OK + `COVERAGE_GAP` proposal |
| CHWY | TRAIN_DEV | 1210 | 165 | 0 | unknown | OK + `COVERAGE_GAP` proposal |

Compiler version for all: `offline-package-compile.v1`. Dangerous omissions: **0**. Error ledger: 2× `COVERAGE_GAP` (bounded proposals, not auto-applied).

## Honesty

- trained: **false**
- certified: **false**
- generalized: **false**
- productionReady: **false**
- autoPromotedLegalAuthority: **false**

## Reproduce

```bash
npm run clf:inventory
npm run test:clf
npm run clf:demo-unseen
npm run clf:dashboard
```

## Next (when Neon is live)

1. `prisma migrate deploy`
2. `npm run clf:batch -- --persist-neon --max=10`
3. Resume `flywheel:inventory` for corpus-wide denominators
4. Expand registry via KF mass-precedent SEC batch (authorized write only)
