# Parallel agents — coordination pack (WS-PAR)

**Workstream:** `WS-PAR` / `WS-AEC` — Parallel Agent Operating Rules + Autonomous Engineering Coordinator  
**Owner agents:** `bc-01a11d87-7950-77b8-8141-e448c7e00e3f` (PAR bootstrap) · `bc-01a122be-22d2-7ace-bfd2-863f2b0110ff` (AEC 2026-10-09)  
**Branch (current):** `cursor/engineering-coordinator-10ff`  
**Base:** `origin/main` @ `bae24ced33fdd6963d0615265a1e67cb181233e8` (fetched 2026-10-09)  
**Status:** ACTIVE coordination contract — does not auto-merge; does not certify product readiness

## Purpose

Publish exclusive ownership, soft gates, and interface contracts so concurrent Cursor Cloud Agents can ship independently without silently rewriting each other’s contracts, sealed evidence, certification status, or Claude-owned acceptance expectations.

## Pack contents

| Path | Role |
| --- | --- |
| `00-operating-rules.md` | Binding operating rules for this fleet |
| `01-workstream-map.json` | Machine-readable workstream + exclusive ownership map (v6; peer-path reconciled) |
| `10-live-integration-inventory.json` | Live branch/PR/SHA/data-class inventory |
| `11-concrete-integration-plan.md` | Executable integration plan + conflict resolutions |
| `12-core-four-role-lock.md` | Binding CKF/VIC/CCA/GIB role lock |
| `13-shared-corpus-manifest.json` | Shared corpus manifest + contributing datasets |
| `14-continuous-main-integration-dashboard.json` | Live Integration Lead dashboard (merged SHAs, blockers, next five) |
| `15-e2e-product-proof-execution-board.json` | End-to-end product-proof gates A1–C1 + first broken arrow |
| `16-product-specialist-fleet.json` | Eight product specialists + adversarial lane exclusive ownership |
| `17-progress-manifest.json` | Shared engineering progress manifest (session-facing) |
| `18-pr-integration-sequence.json` | Recommended PR order / do-not-merge (no auto-merge) |
| `daily/` | Daily integration summaries + session reports |
| `02-interface-contracts.md` | Published contracts peers may depend on before unfinished work lands |
| `03-progress-ledger.md` | Append-only progress ledger for WS-PAR |
| `04-canonical-identity-contract.json` | Logical corpus IDs → existing schema mappings |
| `05-sec-request-scheduler-contract.md` | Single SEC fair-access scheduler contract |
| `06-dataset-delivery-contract.json` | Required fields for importable datasets |
| `07-integration-gates.md` | Hard integration gates + merge sequence |
| `08-integration-queue.json` | Shared integration queue / conflict ledger |
| `09-dependency-map.md` | Who can proceed independently; anti-duplication |
| `README.md` | This index |
| `scripts/parallel-agents/check-ownership-boundaries.ts` | CLI ownership checker |
| `scripts/parallel-agents/mocks/sec-scheduler-mock.ts` | Mock scheduler for blocked peers |

## Soft gates (FAIL for this workstream)

- Do not edit peer exclusive production trees listed in `01-workstream-map.json`.
- Do not rewrite sealed evidence packets.
- Do not change certification status or Phase-3 percentage boards.
- Do not modify Claude-owned independent acceptance fixtures / expectations.
- Do not make paid provider calls or provision paid infrastructure without founder authorization.
- Do not introduce company-specific legal logic or silently certify AI-generated interpretations.
- Do not merge without authorization.

## Controlling product docs (read-only for WS-PAR)

- `docs/headroom-north-star-v2.md` (controlling)
- `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`
- `docs/headroom-north-star-reconciliation/07-next-implementation-gate.json`
- `docs/architecture/NS-4-PARALLEL-CHARTER.md` / soft gates (adjacent parallel track; not absorbed here)
