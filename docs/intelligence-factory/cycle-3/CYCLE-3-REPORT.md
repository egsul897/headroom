# Agent 1 — Cycle 3 Report (Activate & Expand Neon)

## False-permission forensic (Priority 0)

### Exact adversarial control (CKG offline metric)

| Field | Value |
|---|---|
| Numerator (failures) | **1** |
| Denominator (evaluated) | **2** |
| Incidence | **50%** |
| Failing case | `syn-false-perm-general-prohibition` |
| Success case | `syn-false-perm-carveout-present` |
| Fixture | `tests/fixtures/covenant-knowledge-generalization/system-outputs/synthetic-offline.json` |
| Prediction source | `SYNTHETIC_ADVERSARIAL_OUTPUT` |
| Injected output | `{ "permitted": true, "status": "PERMITTED" }` |
| Affirmative legal permission? | **Injected adversarial failure** — not Headroom live output |
| Production-reachable? | **No** — frozen evaluation fixture only |
| Certification gates | N/A for adversarial fixture; scorer proves detection works |

**Do not treat 50% as a live production defect.** It is a deliberate control that the CKG scorer counts false permissions when a system emits `PERMITTED` under `shouldDeny: true`.

### Live production path (Ask → verify → certification bridge)

| Field | Value |
|---|---|
| Numerator (failures) | **0** |
| Denominator | **2** |
| Incidence | **0%** |
| Phase-4 usable | **false** on both cases |
| Permission authority | `DISCOVERY_NON_AUTHORITATIVE` |
| Release-blocking | **No** |

Artifact: `docs/intelligence-factory/cycle-3/false-permission-forensic.json`

## Activation of existing knowledge (Priority 1)

Read-only scan of **400** Neon PUBLIC_SEC_EDGAR sources → **21,994** provision items examined.

| Result | Count |
|---|---:|
| Independently checked executable formula candidates | **2,254** |
| FLAT_AMOUNT | 2,023 |
| BUILDER_BASKET | 150 |
| GREATER_OF_FLAT_OR_PCT_EBITDA | 50 |
| GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS | 24 |
| LEVERAGE_RATIO_ROOM | 7 |
| Certified / Permission writes | **0** |

Synthetic capacity demos (5 greater-of EBITDA candidates) ran through `evaluateProvision` with **SYNTHETIC_LABELED_FINANCIAL_INPUTS_NOT_COMPANY_CAPACITY**. Not claimed as company capacity.

Artifacts: `activation-candidates.json`, `executable-candidates.json`

## Authentic expansion (Priority 2)

| Item | Status |
|---|---|
| New Neon documents ingested this cycle | **0** (no SEC UA / no live-write token) |
| EHB handoff plan (limit 25) | 21 already in Neon; **4 pending authorized fetch** |
| SEC fetch / Neon write | **Not authorized** — batch only |

Artifact: `ehb-ingest-batch.json`

## Metadata repairs (Priority 3)

| Repair | Proposed | Applied |
|---|---:|---:|
| instrumentIdentity backfill | 675 | **0** |
| UNKNOWN → safe metadata reclass | 13 | **0** |
| UNKNOWN hold for byte review | 167 | 0 |

Batch is reviewable + idempotent; apply requires `KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE`.

Artifact: `metadata-repair-batch.json`

## Relationship / holdout (Priority 4)

| Metric | Before | After |
|---|---:|---:|
| amendment_reconstruction | 66.7% | **100%** |
| unseen_document_performance | 0% | **100%** |
| shared_capacity_recognition | 100% | **100%** |
| false_permission_rate (adversarial control) | 50% | **50%** (control retained) |

**Fix:** `pickRelatedBase` excluded self — RESTATEMENT class was linking to itself and missing SUP doc-b→doc-a RESTATES.

Gibraltar HOLDOUT_DEVELOPMENT and Knife River HOLDOUT_BLIND untouched for rule development.

## Executable path demo (Priority 5)

Authentic Neon summary item → independently checked `GREATER_OF_FLAT_OR_PCT_EBITDA` → `evaluateProvision` with labeled synthetic finance → modeled capacity. Candidates remain `NOT_CERTIFIED`; no Permission rows written.

## Costs / Neon writes

| | |
|---|---:|
| Paid inference | $0 |
| Neon mutations | **0** |
| SEC live fetches | 0 |
````