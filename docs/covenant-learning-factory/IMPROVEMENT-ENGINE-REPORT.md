# Learning Factory → Measurable Improvement Engine

## Exact tip

| Item | Value |
|---|---|
| **SHA** | `f3b5c586bf6e7ff32f2b6e7b60c0a14244ca247a` |
| **Branch / PR** | `cursor/covenant-learning-factory-c387` / #356 |
| **Compiler** | `offline-package-compile.v1` + `greater-of-assets-basket.v1.1` |

## 1. Refusal root-cause distribution (856 units, 4 packages)

Source: `docs/covenant-learning-factory/unit-dumps/*.units.json` → `refusal-audit.json`.

| Root cause | Count | Legal structure |
|---|---:|---|
| `NOT_EXCEPTION_CATALOG_CLAUSE` | **646** | General prohibition / section chapeau / non-clause discovery |
| `QUALITATIVE_PERMISSION_NO_NUMERIC_CAP` | **185** | Qualitative exception (no $ / % capacity) |
| `FIXED_DOLLAR_COMPLEX_FORMULA_HANDOFF` | **10** | Facility-difference / other growers (correct refuse) |
| `VERIFIED_EXECUTABLE` | **8** | Fixed-dollar / greater-of / **percent-of-assets sole-cap** |
| `RATIO_GATED_CAPACITY` | **3** | Ratio-incurrence, no fixed dollar |
| `FIXED_DOLLAR_CAP_ROLE_MISSED` | **2** | Dollar present, not cap-role phrasing |
| `BUILDER_OR_AVAILABLE_AMOUNT` | **1** | Available Amount / builder |
| `FIXED_DOLLAR_MULTI_AMOUNT` | **1** | Multiple distinct dollar figures |

**Why 848 refused:** vertical slices only attempt lettered/numbered **exception-catalog limbs**. 646/856 units are not catalog limbs. Of the remainder, most are qualitative permissions. Only fixed-dollar, greater-of-assets, and percent-of-assets sole-cap can elevate to `VERIFIED_EXECUTABLE`.

## 2. supportedStructureUnits=0 vs verifiedExecutableUnits=8

| Metric | What it measures |
|---|---|
| `supportedStructureUnits` | `supportStatus === SUPPORTED_STRUCTURE` (catalog support **and** no unresolved context). All four packages are **PARTIAL** → **0**. |
| `verifiedExecutableUnits` | Vertical-slice elevation after fidelity PASS. **Independent** of `supportStatus`. |

Dashboard `metricDefinitions` document this; they are not contradictory.

## 3. dangerousOmissions

**`NOT_MEASURED`** unless an independently adjudicated completeness oracle is supplied. Heuristic gaps → `DISCOVERY_GAP` / `COVERAGE_GAP` errors. Measured zero ≠ unknown.

## 4. Bounded improvement

**Structure selected:** sole `% of Total Assets` capacity (`PERCENT_OF_ASSETS_SOLE_CAP`).

**Canonical change:** `lib/contract-model/compiler/greater-of-assets-basket/{classify,compile,verify-fidelity}.ts` → **`greater-of-assets-basket.v1.1`**

Authentic exemplar: MTN Permitted Debt (k) — *“maximum aggregate amount not to exceed 5% of Total Assets …”*

## 5. Before / after evidence

| Case | Result |
|---|---|
| MTN Permitted Debt (k) authentic text | failing-before → **VE + fidelity PASS** |
| Facility-diff / EBITDA% / no cap-role / $ hybrid | still refused |
| MHK greater-of §7.01(u)/§7.03(g) | regression green |

Tests: `tests/contract-model/greater-of-assets-basket/percent-of-assets-sole-cap.test.ts` (+ existing greater-of adversarial suite).

## 6. Coverage (force reprocess, same packages)

| Package | Cohort | VE before | VE after | Δ |
|---|---|---:|---:|---:|
| MTN | TRAIN_DEV | 3 | **4** | **+1** |
| MHK | HELD_OUT | 4 | **4** | 0 |
| ROCK | TRAIN_DEV | 0 | 0 | 0 |
| CHWY | TRAIN_DEV | 0 | 0 | 0 |
| **Total** | | **7** | **8** | **+1** |

Refused: 849 → **848**. Held-out MHK fidelity PASS; no golden edits; refusal on unsupported structures unchanged.

## 7. Persistence / Neon

- File-backed: audit manifests, unit dumps, `refusal-audit.json`, `dashboard.json`, `demo-unseen.json`
- Migration ready: `prisma/migrations/20261013180000_covenant_learning_factory/`
- **Neon live: NO** — `NEON_TRANSPORT=https` (`PrismaNeonHTTP`) reaches Neon auth over 443; **auth rejected** (`28P01` for `neondb_owner`). See `neon-https-status.json`. `clf:neon-apply` / `clf:neon-verify` shipped; secret refresh required before persist.

## 8. Authority

No auto-promotion. Production capacity refused. Honesty flags all false. No self-merge.
