# LCQG P0 Shared-Capacity Independent Replay

**Verdict:** `INDEPENDENTLY_ADJUDICATED` (ADV-FP-01/02 labeling corrected; ticket not CLOSED)

| | SHA |
|---|---|
| Baseline (pre-fix) | `8f87a0633ac31cb7b5f6282cc0787231d365f27c` |
| Fix | `83cde5b985b6bb480ac2500cccf894fe6e497f20` |
| Production tip | `316c22e8041cfed9d94aac8f89a511cac103eb3b` |
| Frozen Phase-1 | `cebec8ab3aaecd894b1903ac0b758828655a88df` (intact) |
| Production PR | #136 |
| Evaluation PR | #153 |

## ADV-FP-01 / ADV-FP-02

| Case | Baseline | Fix |
|---|---|---|
| ADV-FP-01 aggregate without affirmative permission | `shared_cap=true`, `SHARED_CAP_CANDIDATE` | `shared_cap=false`, `aggregate_amount=true`, role `HEADLINE_SECTION_CANDIDATE`, no `SHARED_CAP_MARKER` |
| ADV-FP-02 aggregate limit ≠ shared basket | `shared_cap=true`, `SHARED_CAP_CANDIDATE` | `shared_cap=false`, `aggregate_amount=true`, role `PERMISSION_CANDIDATE`, no `SHARED_CAP_MARKER` |

Both failures **reproduced on baseline** and **corrected on fix**. No new unsafe positive shared-cap labels on ordinary aggregate stimuli.

## Genuine positive controls (no false refusal)

| Control | Fix still detects shared capacity |
|---|---|
| together with + Section cite | yes (`shared_cap` + `SHARED_CAP_CANDIDATE` + `SHARED_CAP_MARKER`) |
| multi-clause reliance (c)+(d) | yes (marker newly true vs baseline) |
| "shared capacity" / when combined with | yes |

## Nearby controls

- Affirmative single-basket: baseline falsely `SHARED_CAP_CANDIDATE` → fix `PERMISSION_CANDIDATE` (improvement).
- Comparator excess-as-capacity: remains non-shared; figure-role threshold refusal undisturbed on fix vitest.
- Remote proviso / ambiguous xref: no new shared_cap unsafe positives.

## Downstream trace

| Path | Baseline | Fix |
|---|---|---|
| Pass A aggregate inside `shared_cap` regex | true | false |
| Coverage-audit `aggregate_amount`→`SHARED_CAP_CANDIDATE` | true | false |
| Structural-context bare aggregate as SHARED_CAP | true | false |
| Context-inventory bare aggregate as SHARED_CAP | true | false |
| Helper module `shared-capacity-signals.ts` | absent | present |

No downstream static consumer still ORs bare `aggregate_amount` into shared-capacity labels on the fix SHA.

## Gibraltar probe

| | Baseline | Fix |
|---|---|---|
| Pass A `shared_cap` | 48 | 18 |
| Pass A `aggregate_amount` | 0 | 92 |
| Frozen fixture (historical) | 51 | 51 (untouched) |

Interpretation: 48→18 is primarily false-positive reduction; 0→92 is intentional reclassification of ordinary ceilings. Residual risk: exotic shared-pool phrasing under-recall among the 30 dropped shared_cap hits.

## Production tests on fix SHA

`59 passed` — shared-capacity-false-permission, figure-role, coverage-audit-pipeline, semantic-verification-reconciliation.

## Closure

- ADV-FP-01 / ADV-FP-02: **CORRECTED** (labeling)
- Defect ticket `LCQG-GIB-FALSE-AFFIRM-SHARED-CAP`: **INDEPENDENTLY_ADJUDICATED** (not CLOSED — capacity-grant path beyond labeling not fully re-certified this unpaid replay)
- Freeze / Claude fixtures / production code on eval branch: **unchanged**
- Paid calls: **0** · Merge: **none**
