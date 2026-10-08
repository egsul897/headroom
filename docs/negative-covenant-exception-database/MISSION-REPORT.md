# Mission Report — Negative Covenant Exception Database

## Verdict

`DATASET_READY_OFFLINE` — source-backed searchable exception dataset + adversarial
suite delivered on a dedicated branch. Production legal engine untouched. No paid
inference, merges, or certification advancement.

## Deliverables

| Path | Contents |
| --- | --- |
| `docs/negative-covenant-exception-database/` | Offline dataset package |
| `docs/negative-covenant-exception-database/catalogs/exceptions.json` | 34 source-backed exception records |
| `docs/negative-covenant-exception-database/adversarial/cases.json` | 15 adversarial examples |
| `docs/negative-covenant-exception-database/structural-patterns/patterns.json` | Recurring remote-constraint patterns |
| `tests/fixtures/negative-covenant-exception-database/` | Schema + deterministic search (isolated) |
| `tests/negative-covenant-exception-database/catalog-search.test.ts` | Offline vitest suite |
| `scripts/ncedb-generate-catalog.py` | Regenerator |

## Coverage by priority family

| Family | Count |
| --- | --- |
| Debt incurrence | 8 |
| Liens | 2 |
| Restricted payments | 6 |
| Investments | 5 |
| Asset sales | 3 |
| Affiliate transactions | 2 |
| Fundamental changes | 2 |
| Junior-debt prepayments | 3 |
| Subsidiary restrictions | 3 |

Sources: CONMED Art. VII (19), LSB Art. VI (9), FWRG Art. VI (6). Source files
sha256-pinned in `02-source-manifest.json`.

## Remote-condition attention

Every catalog record carries at least one remote constraint signal. Highlighted
patterns:

1. **Cross-section gates** — e.g. CONMED §7.2(c) debt usable only with §7.3(g) Liens
   and pro forma §7.1 covenants.
2. **Defined-term gates** — LSB `Payment Conditions` shared across debt, RP,
   Investments, and debt payments; FWRG `Available Amount` builder elections.
3. **Hanging / section-wide provisos** — CONMED §7.8 trailing valuation; LSB §6.03
   single proviso opening all fundamental-change exceptions; CONMED §7.2 classify/
   reclassify paragraph.
4. **Notwithstanding** — LSB §6.04(b) Notes Priority Collateral sales override local
   ABL caps but import Secured Notes Documents; CONMED §7.1 step-ups move the
   §7.8(j) investment ratio target.
5. **Article-level chapeaux** — CONMED Art. VII / LSB Art. VI entity + duration scope
   binds every basket.
6. **Affiliate / burdensome meta-gates** — exceptions that only re-import other NC
   permissions.

## Seemingly permissive but constrained (examples)

| Exception | Naive misread | Actual constraint |
| --- | --- | --- |
| CONMED §7.6(e) | Unlimited RP | CSSLR ≤ 3.50 + no EOD + defined-term math |
| CONMED §7.8(i) | Open foreign advances | Entire quantum is residual §7.2(k) (+ §6.9) |
| LSB §6.11(c) | Unlimited RP | Remote `Payment Conditions` only |
| LSB §6.04(b) | Notwithstanding = free sales | Secured Notes Documents control |
| FWRG §6.04(a)(iii) | Full Available Amount per use | Shared builder elections across RP/Investments/RDP |

## Invariants enforced by tests

- `unconditionalCapacity === false` on every record
- All nine priority families present
- Source sha256 pins match on-disk fixtures
- Search filters: family, remote conditions, hanging proviso, shared capacity,
  defined term, section ref, free text
- Adversarial suite covers hanging provisos, article chapeaux, defined-term gates,
  cross-section conditions, notwithstanding, and shared capacity
- Verdict artifact asserts no paid inference / no certification advancement /
  production engine untouched

## Explicit non-goals honored

- No modifications under `lib/contract-model/**`
- No paid model calls
- No merge
- No certification pin / stratified-cert advancement
