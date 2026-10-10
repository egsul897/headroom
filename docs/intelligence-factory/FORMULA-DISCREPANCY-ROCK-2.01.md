# Formula discrepancy — ROCK §2.01 (10/11 score)

## Provision

| Field | Value |
|---|---|
| Authentic source | `edgar:0001140361-26-003087:ef20064499_ex10-1.htm` (Gibraltar Industries / ROCK credit agreement exhibit) |
| Section | **2.01** |
| Matrix case | `rock-2.01-unsupported-incremental` |
| Summary language | “Incremental path: Voluntary Prepayment / Prepayment-Based Incremental Amount.” |

## Expected vs actual

| | |
|---|---|
| **Expected** | No executable dollar formula — `KNOWN_NOT_MODELED` refusal (prepayment-based incremental requires historical voluntary prepayments, not a fixed basket). |
| **Actual compiled** | `modelingStatus: KNOWN_NOT_MODELED`, `thresholdValue: 0`, missingFields `[thresholdValue, formulaType]`, notes: “Could not parse a numeric basket/threshold — not minting MODELED Permission”. |
| **Prior score artifact** | Counted as 1 of 11 tested but **not** in “correct formulas” (10), because the metric only counted SUCCESS + missing-assets refusal. |

## Root cause

1. **Metric definition (primary):** `correctFormulas` = successes + missing-assets refusal. A correct `KNOWN_NOT_MODELED` refusal was tested but excluded from that numerator — producing 10/11 without an incorrect parse.
2. **Prior expected row error:** the matrix previously listed `formulaType: FLAT_AMOUNT` / `thresholdValue: 0` as the “expected formula,” which incorrectly implied a flat-zero model. Correct expectation is **no modeled formula**.
3. **Underlying mechanic:** voluntary prepayment incremental capacity is not a static basket; inventing `FLAT_AMOUNT 0` as MODELED capacity would be wrong.

## False favorable risk

| Scenario | Risk |
|---|---|
| Current behavior (`KNOWN_NOT_MODELED`) | **None** — fail-closed; no Permission minted. |
| If parser minted `MODELED` `FLAT_AMOUNT` @ 0 | **Yes** — could present zero/empty capacity as an executable modeled rule. |
| If parser invented a dollar floor from unrelated text | **Yes** — false favorable capacity. |

## Disposition

**Justified refusal / formula-applicable exclusion.** Not an incorrect executable formula.

- Matrix now flags `formulaApplicable: false`, `justifiedExclusion: true`.
- Formula accuracy among applicable provisions: **10/10** when this exclusion is applied (plus missing-assets refusal counted as correct formula+refusal path).
- Permanent regression: `tests/intelligence-factory/rock-2.01-incremental-refusal.test.ts`.

## Generalizable production rule

Prepayment-based / voluntary-prepayment incremental paths without a numeric basket in the summary **must** remain `KNOWN_NOT_MODELED`. Do not coerce missing thresholds to `FLAT_AMOUNT 0`.
