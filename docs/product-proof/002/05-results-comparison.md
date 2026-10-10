# Results comparison

Machine scorecard: `artifacts/quantitative-scorecard.json`.

## Phase 3 — MTN regression (no issuer hardcoding)

Fixture: PP001 frozen MTN package via `manifests/mtn-regression.json`.

| Target | Result |
|---|---|
| §10.4 → Permitted Debt | **PASS** (`§10.4→Permitted Debt` in catalog prohibition refs) |
| Permitted Debt definition + clauses | **PASS** — 16 clauses `(a)–(p)` |
| Secured debt basket (l) | **PASS** — text retains Maximum Facility Amount / Facility Amount difference |
| §10.5 → Permitted Liens | **PASS** (`§10.5→Permitted Liens`) |
| Permitted Liens definition + clauses | **PASS** — 17 clauses `(a)–(q)` |
| Lien permission for secured debt | **PASS** — Liens `(d)` → Debt `(l)` cross-link + unit `DEFINITION_CLAUSE_CROSS_REF` |
| Facility Amount dependencies | **PASS** — Debt `(l)` unit emits `FACILITY_CAP_DEPENDENCY` + `FORMULA_DIFFERENCE_DEPENDENCY` |
| Financial / ratio mentions | **PARTIAL** — Leverage / Interest Coverage surfaced on some units; not verified executable |
| False executable classifications | **0** |
| Capacity | **REFUSED_NO_VEP** |

Production logic contains no MTN ticker, provision IDs, or numerical thresholds (verified by ripgrep).

## Phase 4 — MHK unseen holdout

Freeze preceded legal reference. Same pipeline, no holdout-specific production edits after freeze.

| Metric | Value |
|---|---|
| Provision recall (§7.01, §7.03) | **1.0** |
| Provision precision | **1.0** |
| Clause markers §7.01 | expected `a–w` / found `a–w` — exact |
| Clause markers §7.03 | expected `a–l` / found `a–l` — exact |
| Clause TP / FP / FN | **35 / 0 / 0** |
| Material basket §7.01(i) $100M | found |
| Material shared basket §7.01(u) / §7.03(g) | found + cross-linked |
| Material §7.03(f) $700M receivables | found |
| False executable classifications | **0** |
| Unsupported affirmative permissions | **0** |
| Capacity | **REFUSED_NO_VEP** |
| Structural nodes | **0** (Pass A / coverage regions unavailable; catalogs still discovered from raw text) |

### Material omissions / unsupported semantics

- Executable greater-of / % TCA formulas not modeled as verified IR (excerpts + PARTIAL only)
- §7.12 financial covenant not emitted as an exception catalog (correct — not that drafting pattern)
- Unit supportStatus is PARTIAL (unresolved context under synthetic discovery), not SUPPORTED executable
- Some prohibition-candidate attribution noise on non-catalog matches (catalog-level § refs are correct)

### Source citation accuracy

Catalog candidates cite `documentId §N.N(marker)` or `def:Term (marker)` with document char spans when available. No silent rewriting of source thresholds.

## Issuer-agnostic proof

Synthetic Acme fixture in unit tests discovers `Permitted Widget Debt/Liens` with facility-difference basket and debt↔lien link; JSON blob must not contain MTN/MHK/Vail/CONMED.
