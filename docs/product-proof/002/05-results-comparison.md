# Results comparison

Machine scorecard: `artifacts/quantitative-scorecard.json`.  
Vertical-slice narrative: `12-vertical-slice-phases.md`.

## Metrics separation (mandatory)

| Layer | MTN | MHK | Notes |
|---|---|---|---|
| A. Clause discovery | Debt 16 + Liens 17 catalogs | **35 TP / 0 FP / 0 FN** | Sealed reference unchanged |
| B. Legal classification (fixed-dollar) | 3 attempted | 2 attempted | Growers excluded |
| C–E. Completeness + fidelity + evaluator | 3 PASS | 2 PASS | |
| F. Verified executable authority | **3** | **2** | Hypothetical gates |
| G. Production-authoritative capacity | **0** | **0** | REFUSED |

Do not combine discovery recall with executable-rule coverage.

## Phase 3 — MTN regression (no issuer hardcoding)

Fixture: PP001 frozen MTN package via `manifests/mtn-regression.json`.

| Target | Result |
|---|---|
| §10.4 → Permitted Debt | **PASS** |
| Permitted Debt definition + clauses | **PASS** — 16 clauses `(a)–(p)` |
| Secured debt basket (l) | **PASS** discovery; executable **UNSUPPORTED** (facility-difference) |
| §10.5 → Permitted Liens | **PASS** |
| Permitted Liens definition + clauses | **PASS** — 17 clauses `(a)–(q)` |
| Lien permission for secured debt | **PASS** discovery cross-link |
| Fixed-dollar VERIFIED_EXECUTABLE | **PASS** — Debt `(n)` $100M, Debt `(o)` $50M, Liens `(p)` $250k |
| False executable classifications | **0** |
| Capacity | **VERTICAL_SLICE_PASSED_PRODUCTION_CAPACITY_REFUSED** |

Production logic contains no MTN ticker, provision IDs, or numerical thresholds.

## Phase 4 / 5 — MHK unseen holdout

Freeze preceded legal reference. Same pipeline; sealed markers not rewritten.

| Metric | Value |
|---|---|
| Provision recall / precision | **1.0 / 1.0** |
| Clause TP / FP / FN | **35 / 0 / 0** |
| Structural nodes | **910** (was 0; NNBSP/WS bare-decimal fix) |
| Fixed-dollar VERIFIED_EXECUTABLE | **§7.01(i)** $100M; **§7.03(f)** $700M |
| False executable | **0** |
| Capacity | **VERTICAL_SLICE_PASSED_PRODUCTION_CAPACITY_REFUSED** |

### Material omissions / unsupported semantics

- Greater-of / % TCA shared baskets (§7.01(u)/§7.03(g)) — discovery only
- Facility-difference MTN Debt (l) — discovery only
- Ratio-conditioned permissions — unsupported
- Unit `supportStatus` remains PARTIAL for most catalog units under synthetic discovery; executable authority is a separate gate

## Issuer-agnostic proof

Acme sole-cap fixtures in `fixed-dollar-basket.test.ts`; IR JSON must not contain MTN/MHK/Vail/CONMED/Mohawk.
