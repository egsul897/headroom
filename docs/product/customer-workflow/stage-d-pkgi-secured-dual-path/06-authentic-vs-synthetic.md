# Authentic versus synthetic coverage (Stage D Cycle 6)

## Synthetic (this cycle)

| Field | Value |
|---|---|
| Package | `pkg-i-secured-debt-lien` Stage D acceptance |
| Provenance | `SYNTHETIC_LABELED_TECHNICAL_DEMO` |
| Guard | `entity-scope-consistency-guard.v6` |
| Dual-path secured sim | **SATISFIED** ($15M principal against §7.01(b) + §7.02(b)) |
| Customer-grade claim | **No** |

Artifacts: `00-execution-report.md`, `04-capacity-require.json`, `05-phase4d-dual-path-simulation.json`.

## Authentic / PINNED_OFFLINE (separate)

| Field | Value |
|---|---|
| Package | CONMED authenticated VEP (`docs/product/customer-workflow/authenticated-vep/`) |
| Pin status | **PINNED_OFFLINE** (stratified board) — **not CERTIFIED** |
| Secured dual-path | **Not demonstrated** — authentic package is unsecured §7.2(c) / incomplete companions |
| Capacity REQUIRE | Historically **REFUSED** (`CROSS_RULE_GATE_NOT_EXECUTABLE`) without certified companions |
| Customer-grade claim | **No** |

PINNED_OFFLINE is an offline pin of authentic source text and compiled artifacts. It is **not** a substitute for live CERTIFY / customer-grade readiness.

## Rule

Do not claim customer-grade readiness from synthetic evidence. Do not treat PINNED_OFFLINE as CERTIFIED.
