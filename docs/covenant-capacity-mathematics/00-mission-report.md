# AGENT 3 — Covenant capacity mathematics

## Verdict

The production Phase-4C/4D capacity path (`evaluateCapacityState` / `applyCapacityStateTransition` / `simulateTransaction`) reproduces independently derived capacity figures across the supportable covenant-mechanics universe. **No parallel calculator was introduced.** **No generalizable production defects were demonstrated.** Prior capacity suites remain green (234/234 capacity; 334/334 with expression + transaction + legacy semantics).

## Mechanics coverage

| Mechanic | Matrix coverage | Engine path |
|---|---|---|
| Fixed baskets | below / at / above / zero-usage | 4C state |
| Greater-of baskets | grower below / at / above flat | 4C MAX |
| Lesser-of baskets | below / at / above | 4C MIN |
| Asset-based growers | % of Total Assets; missing input | 4C MUL+METRIC |
| EBITDA-based growers | greater-of flat/% EBITDA + usage | 4C |
| Ratio debt | room below/at/above; gated unlimited | 4C SUB(NUM×METRIC, METRIC); UNLIMITED+COMPARE |
| Incremental facilities | sum of fixed + prepays + ratio bucket | 4C ADD |
| Available Amount builders | definition-expanded SUM; partial MAX bound | 4C + DEFINED_TERM |
| Restricted payments | family-tagged flat + AA builder | 4C (family-agnostic) |
| Investments | flat + lesser-of grower | 4C |
| Debt and lien capacity | family-tagged flats + asset grower | 4C |
| Shared baskets | pool tighter / member tighter | 4C shared constraints |
| Anti-stacking | unquantified SHARES_CAPACITY_WITH; ambiguous usage | 4C fail-closed |
| Historical utilization | sum; supersession; as-of cutoff; missing attribution | 4C ledger |
| Reclassification | below / at / above source usage | 4C transition |
| Currency treatment | EUR≠USD fail-closed; same-currency OK | 4C units |
| Financial period selection | DURING_PERIOD exact key; wrong period missing | 4B+4C |
| Pro forma adjustments | DELTA overlay; absent base refused | 4D simulate |
| Conditions unsatisfied | dollars present + failed ratio condition | 4D conditions |
| Taxonomy | missing ≠ zero ≠ unsupported ≠ unlimited ≠ gate-fail | 4A/4C kinds |

## Calculation pass/fail

| Suite | Result |
|---|---|
| New matrix `capacity-mathematics-matrix.test.ts` | **53/53 pass** |
| Prior `tests/contract-model/runtime/capacity/**` | **234/234 pass** |
| Expression + Phase-4D synthetic + legacy capacity semantics | **334/334 pass** (includes capacity) |

Every matrix case records: operative authority (section/family label), formula, financial inputs, utilization, conditions, independent expectation, engine result, difference (none), classification (**CORRECT**).

## Critical defects

**None.** Fixture mistakes during authoring (underscore amount strings; RULE_REFERENCE without resolver-bound rules) were test bugs, not engine defects.

### Observations (not defects)

1. **Over-consumption withholding** — ledger usage above gross → `REVIEW_REQUIRED`; signed deficit under `provisional`, published amounts `NOT_DETERMINED`.
2. **Negative ratio room** — formula-negative MONEY stays `AVAILABLE` with a signed amount (distinct from ledger `OVER_CONSUMPTION`).
3. **Ratio scalars** — room uses `NUMBER×MONEY`; `RATIO×MONEY` is a unit mismatch; ratio *gates* use `COMPARE`.
4. **No FX** — cross-currency operations fail closed; never invent conversion.

## Regression tests

- New: `tests/contract-model/runtime/capacity/capacity-mathematics-matrix.test.ts`
- Helpers extended (test-only): `NUM`, `SUB`, `SUM`, `IF`, `DURING`, `TERM`, `BOOL`, `AND`/`OR`, period helper, operator-aware `CMP` (two-arg LTE preserved)
- Artifacts: `docs/covenant-capacity-mathematics/01-matrix-results.json`

## Distinctions preserved

| Kind | Representation |
|---|---|
| Unlimited | `CapacityAmount.kind = UNLIMITED` |
| Gate unsatisfied | `GATE_NOT_SATISFIED` |
| Missing input | `NEEDS_INPUT` + `NOT_DETERMINED` |
| Unsupported | `UNSUPPORTED` + `UNSUPPORTED_EXPRESSION` |
| Zero capacity | `AVAILABLE` + amount `"0"` |
| Unknown / untested | not claimed; never aliased to the above |

## Cost

**$0** — no paid model or provider calls.

## SHA / PR

Filled at commit/PR time in the boxed mission return.
