# Learning Factory → Measurable Improvement Engine

## Exact tip

- **SHA:** see git tip at report generation (`git rev-parse HEAD`)
- **Branch / PR:** `cursor/covenant-learning-factory-c387` / #356

## 1. Refusal root-cause distribution (856 units across 4 packages)

Source: `docs/covenant-learning-factory/unit-dumps/*.units.json` + `refusal-audit.json`.

| Root cause | Count | Legal structure |
|---|---:|---|
| `NOT_EXCEPTION_CATALOG_CLAUSE` | ~1071→**646** on dumps-only* | General prohibition / section chapeau / non-clause discovery noise |
| `QUALITATIVE_PERMISSION_NO_NUMERIC_CAP` | dominant among catalog limbs | Qualitative exception (loan-doc liens, tax liens, ordinary-course, etc.) |
| `VERIFIED_EXECUTABLE` | **8** after improvement (was 7) | Fixed-dollar / greater-of / **percent-of-assets sole-cap** |
| `RATIO_GATED_CAPACITY` | low | Ratio-incurrence without fixed dollar |
| `FIXED_DOLLAR_COMPLEX_FORMULA_HANDOFF` | residual | Facility-difference / other growers (correctly refused) |
| `BUILDER_OR_AVAILABLE_AMOUNT` | residual | Available Amount / builder baskets |
| `FIXED_DOLLAR_MULTI_AMOUNT` / `CAP_ROLE_MISSED` | residual | Multi-dollar or non-cap dollar mentions |

\*Exact dump-only totals are in `refusal-audit.json` after `npm run clf:audit-refusals`.

**Why ~849 refused:** executable vertical slices only attempt lettered/numbered **exception-catalog limbs**. Most discovery units are general prohibitions / TOC / non-basket text (`NOT_EXCEPTION_CATALOG_CLAUSE`). Among catalog limbs, most are qualitative permissions with no numeric capacity pattern. Only fixed-dollar, greater-of-assets, and (now) percent-of-assets sole-cap elevate to `VERIFIED_EXECUTABLE`.

## 2. supportedStructureUnits=0 vs verifiedExecutableUnits>0

| Metric | Meaning |
|---|---|
| `supportedStructureUnits` | `supportStatus === SUPPORTED_STRUCTURE` (catalog support **and** no unresolved context). All four demo packages currently yield **PARTIAL** support because context bundles report unresolved deps → **0**. |
| `verifiedExecutableUnits` | Vertical-slice elevation after independent fidelity PASS (fixed-dollar / greater-of / percent-of-assets). Independent of `supportStatus`. |

These are **not** contradictory. Dashboard now includes `metricDefinitions` stating this explicitly.

## 3. dangerousOmissions

Replaced misleading `0` success signal with **`NOT_MEASURED`** unless an independently adjudicated completeness oracle is supplied. Heuristic discovery gaps are `DISCOVERY_GAP` / `COVERAGE_GAP` errors — never reported as measured dangerousOmissions=0.

## 4. Bounded improvement

**Structure:** sole `% of Total Assets` capacity (`PERCENT_OF_ASSETS_SOLE_CAP`) — e.g. MTN Permitted Debt (k): *“maximum aggregate amount not to exceed 5% of Total Assets …”*

**Implementation:** `lib/contract-model/compiler/greater-of-assets-basket/` → compiler version **`greater-of-assets-basket.v1.1`**

- Classify NTE + % of Total Assets when no “greater of” and no dollar limb
- Compile `MULTIPLY(PERCENT, METRIC)` (+ qualitative gates)
- Fidelity requires no fabricated fixed limb / no MAX
- Production capacity still refused without authenticated financial evidence

## 5. Before / after evidence

| Case | Result |
|---|---|
| Authentic MTN Permitted Debt (k) | **failing-before** (NOT_GREATER_OF / complex_formula handoff) → **passing-after** (VE + fidelity PASS) |
| Adversarial: facility-diff, EBITDA%, no cap-role, dollar hybrid | Still **NOT_GREATER_OF_ASSETS** (refused) |
| Existing greater-of MHK §7.01(u)/§7.03(g) | Unchanged regression green |

Tests: `tests/contract-model/greater-of-assets-basket/percent-of-assets-sole-cap.test.ts`

## 6. Coverage measurement (same packages, force reprocess)

| Package | Cohort | VE before | VE after | Δ |
|---|---|---:|---:|---:|
| MTN | TRAIN_DEV | 3 | **4** | +1 |
| MHK | HELD_OUT | 4 | **4** | 0 (no held-out golden changes) |
| ROCK | TRAIN_DEV | 0 | 0 | 0 |
| CHWY | TRAIN_DEV | 0 | 0 | 0 |
| **Total** | | **7** | **8** | **+1** |

Refused: 849 → **848**. Held-out MHK fidelity still PASS; no weakening of refusal on unsupported structures.

## 7. Persistence / Neon

- File-backed: package audit manifests, unit dumps, `refusal-audit.json`, `dashboard.json`, `demo-unseen.json`
- Neon migration prepared: `prisma/migrations/20261013180000_covenant_learning_factory/`
- **Neon live:** unreachable (`DATABASE_URL` host not reachable) — **do not claim live Neon success**

## 8. Authority gates preserved

No auto-promotion to `Permission` / ledger / APPROVED snapshots. Production capacity refused. Honesty flags all false.
