# Agent 2 — Financial and Compliance Certificate Engine (next mission)

**Mission:** Approval→execution bridge, sequential financial effects, expanded contractual metrics/reconciliation, authentic capacity integration, shared Position/Simulate/Ask financial view.  
**Branch:** `cursor/financial-certificate-engine-8d31`  
**PR:** https://github.com/egsul897/headroom/pull/220  
**SHA:** _(set at commit)_  
**Cost:** $0 paid inference (deterministic extraction; no provider calls).

---

## Preserved behavior (from prior tip)

- GAAP ≠ contractual EBITDA (never substituted).
- Source-fact reconciliation with provenance.
- Strict capacity inputs (`projectEngineRunToCapacitySnapshotStrict`).
- NS-4 propose without auto-approve.

---

## P0 — Approval-to-execution bridge

Lifecycle wired in `approval-bridge.ts`:

```
extract → reconcile → propose ContractInputSnapshot (DRAFT|REVIEW_REQUIRED)
  → attributable approve → APPROVED snapshot
  → loadVerifiedFinancialCapacityInput → verified capacity / simulation inputs
```

| Guard | Behavior |
|---|---|
| `assertSnapshotAuthoritative` | Throws on DRAFT / REVIEW_REQUIRED / SUPERSEDED / ABSENT |
| `loadVerifiedFinancialCapacityInput` | Ignores non-APPROVED rows; returns `NOT_AUTHORITATIVE` when snapshotId is non-approved |
| Propose path | `authoritative: false` always |
| Persistence | Existing Prisma `ContractInputSnapshot` / Neon NS-4 store only — no competing truth store |

---

## P0 — Sequential financial effects (coord TE-D3 / Agent 4)

`sequential-financial.ts` chains financial-core `runScenario` pro forma state:

1. Transaction changes debt/cash (borrow+dividend = net-debt rise).
2. Pro forma state updated; contractual ratios recomputed.
3. Next step uses chained state (not stale base metrics).
4. Missing fixed charges → `MISSING_FIXED_CHARGES` uncertainty (not invented).
5. `reusedStaleMetrics: false` always; non-authoritative base refuses to run steps.

---

## P1 — Contractual metric derivation

`derived-metrics.ts` covers (when evidence supports):

Consolidated EBITDA · Total debt · Secured debt · Net debt · Interest expense · Fixed charges · Total assets · Total net leverage · Interest coverage · Fixed-charge coverage.

Missing evidence → `MISSING_INPUT` / `REVIEW_REQUIRED`. No invented addbacks.

Authentic expansion: Matthews Q1 FY2025 + Coherent FY2026 + Coherent Q1 FY2027 incomplete feed-queue period (seed-aligned).

---

## P1 — Certificate reconciliation cases

| Case | Finding |
|---|---|
| Different reporting periods | `PERIOD_MISMATCH` |
| Stale certificates | `STALE_PERIOD` |
| Conflicting values | `MATERIAL_DIFFERENCE` (both values preserved) |
| Different currencies | `CURRENCY_MISMATCH` |
| Unit mismatches | `UNIT_MISMATCH` (no silent rescaling) |
| Different obligor scopes | `OBLIGOR_SCOPE_MISMATCH` |
| Pro forma acquisitions | `PRO_FORMA_ACQUISITION` |
| Covenant addbacks without amounts | `ADDBACK_WITHOUT_AMOUNT` |
| Missing supporting schedules | `MISSING_SCHEDULE` |

Source provenance and reviewer decisions preserved on NS-4 propose/approve path.

---

## P1 — Authentic capacity (coord Agent 3 / PR #230)

`authentic-capacity-bridge.ts`:

- Loads APPROVED FCE capacity snapshot.
- Evaluates authentic provisions via `evaluateProvision` + approved financials.
- **Gross capacity** reported separately from **remaining**.
- Remaining claimed only with attributed historical utilization; otherwise null (Agent 3 finding: ledger not provision-attributed).
- Incorrect-favorable tripwire: refuses remaining=gross when unattributed.

---

## P2 — Position / Simulate / Ask shared view

`financial-view.ts` — one `SharedFinancialCertificationView` for all three surfaces:

`asOfDate` · `sourcePeriod` · `approvalStatus` · `assumptions` · `missingInputs` · derived metrics · certification metadata.

Coordinates with unified-customer (PR #221) without forking financial state.

---

## Required return checklist

1. **Authentic financial sources:** Matthews Q1 FY2025, Coherent FY2026, Coherent Q1 FY2027 (incomplete).
2. **Derived contractual metrics:** EBITDA/debt/cash/net debt/interest/fixed charges/assets/leverage/coverage where evidenced.
3. **Conflicts & stale:** synthetic + authentic cases above.
4. **Approved vs unapproved:** DRAFT/REVIEW_REQUIRED never authoritative; APPROVED loads verified capacity.
5. **Verified capacity:** contractual EBITDA-bound `FinancialSnapshotInput`; authentic provision gross capacity.
6. **Sequential tests:** debt/cash propagate; next txn uses updated state; missing FC → uncertainty.
7. **Incorrect favorable:** remaining ≠ gross without attribution; GAAP never used as capacity EBITDA.
8. **Tests / CI / PR / SHA / cost:** see below.

---

## Tests

| File | Coverage |
|---|---|
| `tests/financial-certificate-engine/engine.test.ts` | Authentic extract/reconcile/capacity |
| `tests/financial-certificate-engine/ns4-propose.test.ts` | No auto-approve |
| `tests/financial-certificate-engine/approval-bridge.test.ts` | Authority guards + propose→approve→verified |
| `tests/financial-certificate-engine/sequential-financial.test.ts` | Chained pro forma effects |
| `tests/financial-certificate-engine/derived-and-reconcile.test.ts` | Metrics + recon stress |
| `tests/financial-certificate-engine/authentic-capacity-bridge.test.ts` | Gross vs remaining + shared view |

**Result:** 32 passed · **Cost:** $0

---

## Module map

```
lib/financial-certificate-engine/
  identity.ts | extract.ts | reconcile.ts | snapshot.ts
  capacity-bridge.ts | pipeline.ts | types.ts | index.ts
  approval-bridge.ts | sequential-financial.ts | derived-metrics.ts
  financial-view.ts | authentic-capacity-bridge.ts
  fixtures/   (Matthews, Coherent FY2026, Coherent Q1 FY2027, synthetic)
```
