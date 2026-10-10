# AGENT 3 — Gross capacity → verified remaining capacity

## Verdict

Preserved PR #230 authentic gross matrix (**51** represented, **45** independently correct gross, **6** correct refusals, **0** incorrect). Closed the product utilization gap with a generalized resolver that **never invents zero**. Debt-intelligence no longer publishes `COMPUTED` remaining from an empty/unattributed ledger. Phase 4C adapter now represents LEVERAGE / COVERAGE / RATIO_GATE / BUILDER as IR METRIC trees (**PARTIAL**, not certified). Attributed remaining demonstrated with **SYNTHETIC_LABELED** usage; authentic Neon attribution remains blocked.

Cost **$0**.

## Required return

| # | Item | Result |
|---|---|---|
| 1 | Authentic gross calculations preserved | **Yes** — 51 / 45 / 6 / 0 unchanged; synthetic 53/53 green; capacity suite **236/236** |
| 2 | Attributed utilization examples | **SYNTHETIC_LABELED**: gross 100 − attributed 35 = remaining **65** (`05-verified-remaining-demo.json`). Authenticity labeled. |
| 3 | Verified remaining-capacity results | Supported only when utilization is `KNOWN_ATTRIBUTED` or `VERIFIED_ZERO`. Empty ledger → `UNKNOWN` / `GROSS_ONLY`. |
| 4 | Correct refusals | Coverage threshold ≤ 0; gate failed → not AVAILABLE; unattributed legacy basket → no remaining claim; auto-link liens (from #230) preserved |
| 5 | False favorable outcomes | **Closed** in debt-intelligence: empty ledger no longer yields remaining = gross `COMPUTED` / AVAILABLE |
| 6 | Phase 4C adapter coverage | Prior refusals classified as **(1) missing representation support** — fixed for LEVERAGE, COVERAGE, RATIO_GATE, BUILDER. BUILDER sectionRefs are citation labels (leaf-confirmed), not cross-lookups. Still `PARTIAL` / `compilerVersion: null`. Invalid coverage threshold → class **(2)**. |
| 7 | Financial chaining | Debt `DELTA` on approved snapshot reduces LEVERAGE room by the same amount (100×4.5−200=250 → after +50 debt = 200). Same snapshot chain; no invented facts. |
| 8 | Position / Simulate / Ask consistency | `buildSharedProductCapacityViews` — one verified result projected to three surfaces; consistency assert green |
| 9 | Tests and independent expected answers | `tests/capacity/utilization-and-remaining.test.ts` (12); legacy-compatibility F3a–d; preserved matrices |
| 10 | PR / SHA / CI / cost | see below |

## Utilization knowledge kinds

`KNOWN_ATTRIBUTED` · `VERIFIED_ZERO` (certificate required) · `UNKNOWN` · `PARTIALLY_KNOWN` · `SUPERSEDED_EXCLUDED` · `RECLASSIFIED` · `SHARED_POOL` · `UNATTRIBUTED_LEGACY_BASKET`

**Never** default missing historical usage to zero. Empty DB table ≠ verified zero.

## Real-data blocker (authentic attributed usage)

Neon `contract_ledger_usages` attributed to Permission/Provision ids are not populated for Coherent/Matthews. Only basket-family `LedgerEntry` rows exist. Remaining after *authentic* utilization cannot be claimed without inventing history — reported separately from the labeled synthetic demo.

## Product display fields (shared view)

Gross capacity · Known utilization · Unknown utilization · Supported remaining · Governing conditions · Cross-document constraints · Source citations · Certification status.

## Artifacts

- `lib/capacity/*` — types, resolver, verified-remaining, product view
- `lib/contract-model/ir/legacy-adapter.ts` — ratio/builder IR trees
- `lib/product/customer-intelligence/debt-intelligence.ts` — A8-01 gate
- `scripts/capacity/verified-remaining-demo.ts`
- `docs/covenant-capacity-mathematics/05-verified-remaining-demo.json`
- Preserved: `02-authentic-execution-matrix.json`, synthetic matrix

## PR / SHA / cost

| Field | Value |
|---|---|
| Continues | PR #230 (`bf10361d`) |
| PR | https://github.com/egsul897/headroom/pull/234 |
| Branch | `cursor/verified-remaining-capacity-b580` |
| SHA | `78d2b8e7dd0698f6a73bee430944fa6d8c13941b` |
| CI | **green** (6/6 checks on tip) |
| Capacity suite | **236/236** |
| New utilization tests | **12** |
| Cost | **$0** |
