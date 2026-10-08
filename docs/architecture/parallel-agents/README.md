# Parallel agents — coordination pack (WS-PAR)

**Workstream:** `WS-PAR` — Parallel Agent Operating Rules / fleet coordination  
**Owner agent:** Cursor Cloud `bc-01a11d87-7950-77b8-8141-e448c7e00e3f`  
**Branch:** `cursor/parallel-agent-operating-rules-0e3f`  
**Base:** `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f` (fetched 2026-10-08)  
**Status:** DRAFT coordination contract — does not merge itself; does not certify product readiness

## Purpose

Publish exclusive ownership, soft gates, and interface contracts so concurrent Cursor Cloud Agents can ship independently without silently rewriting each other’s contracts, sealed evidence, certification status, or Claude-owned acceptance expectations.

## Pack contents

| Path | Role |
| --- | --- |
| `00-operating-rules.md` | Binding operating rules for this fleet |
| `01-workstream-map.json` | Machine-readable workstream + exclusive ownership map |
| `02-interface-contracts.md` | Published contracts peers may depend on before unfinished work lands |
| `03-progress-ledger.md` | Append-only progress ledger for WS-PAR |
| `README.md` | This index |

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
