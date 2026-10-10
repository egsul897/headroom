# KF Graph Quality Remediation Plan (read-only design + code fixes)

**Status:** Expansion and production graph promotion **paused**.  
**Neon mutations:** none authorized (dedupe migration is design-only).  
**Paid inference:** $0.  
**PR:** https://github.com/egsul897/headroom/pull/246  
**Tip SHA (rebased onto main):** `8d13b70548f1dc2e5f5e31c8bf726973a9f0d58b`

## 1. Duplicate reconciliation

### Coarse triple `(sourceRecordId, targetSourceId, kind)`

| Metric | Value |
| --- | --- |
| Raw rows | **48,226** |
| Unique triples | **1,416** |
| Excess rows (coarse) | **46,810** |

Coarse triples **overstate** provision duplication: `PROVISION_*` edges intentionally share same-document endpoints (definition / exception / condition within one exhibit). See `duplicate-reconcile.json`.

### True identity: `metadata.discoveryId`

| Metric | Value |
| --- | --- |
| Unique discoveryIds | **29,242** |
| Excess duplicate rows | **18,984** |
| Max multiplicity | **4** (batch rebuild window) |

| Kind | Unique IDs | Raw rows | Excess |
| --- | --- | --- | --- |
| PROVISION_DEFINITION | 18,183 | 34,652 | 16,469 |
| PROVISION_CROSS_REFERENCE | 6,942 | 8,529 | 1,587 |
| PROVISION_CONDITION | 2,039 | 2,395 | 356 |
| PROVISION_EXCEPTION | 1,646 | 1,997 | 351 |
| PROVISION_SHARED_CAPACITY | 206 | 427 | 221 |
| AGREEMENT_* / INDENTURE_SUPPLEMENTAL | 226 | 226 | **0** |

Agreement edges are not discoveryId-duplicated; provision edges were amplified across expand batches (~22:41–23:10 UTC on 2026-10-09). See `discovery-id-reconcile.json`.

## 2. Amplification path → idempotent construction

**Root cause:** `persistProvisionGraph` loaded existing `discoveryId`s with `findMany({ take: 20000 })`. After the first ~20k provision rows, subsequent `neon-massive-expand` batch rebuilds treated existing IDs as new and `createMany`'d up to 8k more per batch. No `UNIQUE` constraint existed on discovery identity.

**Fixes shipped (code, no Neon write):**

1. `loadExistingProvisionDiscoveryIds()` — full SQL `DISTINCT` scan (no cap).
2. Skip-before-insert on that full set; in-batch set updates.
3. Agreement discovery rejects self-targets (`discover.ts` + `amendment-graph.ts`).
4. Unit proof: `tests/product/provision-graph-idempotence.test.ts` (capped scan re-inserts; full scan does not).

## 3. Deduplication migration (DESIGN ONLY — do not execute)

| Artifact | Path |
| --- | --- |
| Forward SQL | `MIGRATION-dedupe-discovery-key.sql` |
| Rollback | `MIGRATION-ROLLBACK.md` |

**Affected tables:**

- `knowledge_relationship_edges` — add `discoveryKey`, unique index, delete excess + self-loops
- `knowledge_relationship_edge_duplicate_archive` — **new** provenance vault

**Preserved:** rationale, confidence, metadata, evidenceStatus on kept + archived rows; all `KnowledgeSource.representationLevel` values (`DISCOVERED_CANDIDATE` / `STRUCTURALLY_INDEXED` ≠ `REVIEWER_VERIFIED` / `CERTIFIED`).

**Requires:** explicit owner authorization naming target Neon branch + expected archive counts.

## 4. Self-loops

| Class | Count | Verdict |
| --- | --- | --- |
| `AGREEMENT_RESTATEMENT` sourceId = targetSourceId | **93** | **Invalid** — restatement also in base class; `pickRelatedBase` scored self. Fixed in discovery. |
| `PROVISION_*` same-document endpoints | **26,026** unique | **Permitted** — definitions/exceptions/conditions within one exhibit. |

## 5. SON operative resolution

**Bug:** `RESTATEMENT` + title `EX-10.1` + filing date → `RESOLVED`.  
**Fix:** `isOpaqueExhibitLabel` / `canResolveRestatementSupersession` — exhibit label, class, or filing order alone never establishes operative authority. Multiple restatements fail closed.

**Gold audit after fix:** SON → `UNRESOLVED_PRECEDENCE` (pass). Operative passRate **1.0** on double-run.

## 6. Amendment-chain adversarial coverage

`tests/product/kf-graph-remediation.test.ts` covers:

- Missing base agreement
- Ambiguous duplicate restatements
- Conflicting effective dates (restatement before base)
- Cross-document refs without section-diff evidence
- Explicit amendatory section language (allowed bind)
- Opaque `EX-10.1` restatement (fail closed)

## 7. Unique-edge quality metrics

From `unique-edge-metrics.json` (deduplicated by discoveryId):

| Metric | Value |
| --- | --- |
| Unique edges | 29,242 |
| Overall high-confidence rate (conf ≥ 0.6) | **0.969** |
| Wilson 95% CI | **[0.967, 0.971]** |
| Evidence on unique edges | **100% DISCOVERED** (0 AUTHENTICATED / REVIEWED) |

Independent source support remains narrow for definitions (38 distinct source records) — confidence is heuristic, not counsel-verified.

**Diversity gaps remain visible:** ABL / intercreditor / guarantee under-represented — corpus must not be called complete.

## 8. Double-run idempotence proof

`quality-gate-double-run.json`:

- Each pass: edge/source/unique counts **unchanged**
- Across passes: **no duplicate growth**
- Authority labels preserved (CERTIFIED / REVIEWER_VERIFIED unchanged)
- Neon mutations: **false**

Isolated disposable-DB migrate+apply of the pending SQL remains **owner-authorized only** (Docker ephemeral DB not available in this environment; migration file is ready).

## 9. Authority separation

All unique relationship edges remain `evidenceStatus=DISCOVERED`. Representation levels on sources untouched. No automatic promotion to `REVIEWER_VERIFIED` / `CERTIFIED`.

## 10. Blockers (no auto-merge)

1. Authorized Neon apply of discoveryKey unique + archive migration
2. Historical 18,984 excess rows remain until that migration
3. 93 invalid agreement self-loops remain in DB until migration deletes/archives them (code prevents new ones)
4. ABL / IC / guarantee diversity gaps
5. Expand / graph promotion stays paused until uniqueness is enforced in DB

## Success criteria mapping

| Criterion | State |
| --- | --- |
| Reproducible unique identity | discoveryId + pending discoveryKey UNIQUE |
| Source-grounded | DISCOVERED only; no silent legal manufacture |
| Idempotent persist | Full ID scan + unit proof; double-run stable |
| Cannot silently manufacture relationships | Operative fail-closed + self-loop refusal + unique constraint (pending auth) |
