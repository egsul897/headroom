# KF Graph Quality — Pre-merge Integration Review (PR #246)

**Exact SHA:** `79f8be362667415dc7f9b5fe1c41d000bf35e9d7`  
**PR:** https://github.com/egsul897/headroom/pull/246  
**Verdict:** **READY_FOR_HUMAN_MERGE**  
**Neon migrations executed:** no · **Expansion resumed:** no · **Auto-merge:** no · **Paid inference:** $0

Production graph promotion and the dedupe migration remain **BLOCKED** until an authorized isolated-DB apply+rollback proof and `UNIQUE(discoveryKey)` are in place (see unresolved risks).

---

## 1. Concurrent-writer idempotence (vs sequential double-run)

| Check | Result |
| --- | --- |
| Sequential double-run / full discoveryId scan | Passes (unit + prior quality-gate double-run) |
| Concurrent TOCTOU race before UNIQUE | **Fails closed as unsafe** |

**Finding:** `loadExistingProvisionDiscoveryIds()` → `createMany` is a classic check-then-act race. Two expand workers can both observe the same missing discoveryId set and both insert. `createMany({ skipDuplicates: true })` is a **no-op** until a matching unique constraint exists (none on `knowledge_relationship_edges` today). Simulation: 50 identities → 100 insert attempts (2× amplification) under concurrent snapshots.

**Implication:** Application-side scan alone does **not** make the graph concurrent-idempotent. Database `UNIQUE(discoveryKey)` (pending authorized migration) is required before any concurrent persist / resume of expand.

Artifact: `premerge-audit.json` → `concurrentRace`.

## 2. Same-document provisions vs agreement self-loops

| Class | Behavior |
| --- | --- |
| `PROVISION_*` same-document endpoints | **Preserved** (26,026 unique in Neon; unit + sample supported) |
| `AGREEMENT_*` self-loops | **Rejected in discovery** going forward; **93 historical rows remain** until migration |

`discover.ts` filters self-targets; solo RESTATEMENT no longer self-links; restatement→distinct base still discovered.

## 3. Independent unique-edge evidence sample

56 unique discoveryId edges sampled (stratified by kind). Factual verdicts are **independent of confidence**:

| Factual verdict | n | Mean confidence |
| --- | ---: | ---: |
| FACTUALLY_SUPPORTED | 50 | 0.686 |
| WEAK_OR_OPAQUE | 1 | 0.700 |
| SELF_LOOP_INVALID | 5 | 0.700 |

Confidence does **not** separate factual support from invalid self-loops (same ~0.70). Sampled AGREEMENT_RESTATEMENT self-loops include opaque filenames / amendment-titled restatements — consistent with known historical defect. All sampled edges remain `DISCOVERED` (not CERTIFIED).

## 4. SON + amendment precedence (no exhibit/filing-alone)

Operative premerge suite: **7/7 pass** (opaque EX-10.1 / Exhibit 10.2 / empty title+RESTATEMENT class refuse; substantive A&R may resolve; missing base / duplicate restatements fail closed). Vitest remediation + customer-intelligence: **27/27 pass**.

## 5. Deduplication migration design audit

| Requirement | Status |
| --- | --- |
| Archives displaced duplicate rows | Designed yes (`knowledge_relationship_edge_duplicate_archive`) |
| Preserves provenance (rationale/confidence/metadata/evidence/createdAt) | Designed yes |
| Conflicting duplicate metadata | Earliest `createdAt` kept live; later rows archived intact (not merged/destroyed) |
| Self-loops archived then deleted | Designed yes (`INVALID_AGREEMENT_SELF_LOOP`; note: `kept_edge_id` equals deleted id — archive is source of truth) |
| **Tested rollback on isolated database** | **NOT DONE** — Neon env has no `createdb`; disposable `headroom_test_*` path unavailable here |

**Do not authorize production apply** until isolated migrate→verify→rollback is proven on a disposable DB/branch.

## 6. DiscoveryId lookup benchmark

| Metric | Value |
| --- | --- |
| Distinct provision discoveryIds loaded | ~29,016 |
| Mean wall time (5 runs) | ~246 ms (p50 ~134 ms after warmup) |

**Scalability limits:** JSON `metadata->>'discoveryId'` table scan (no index); full ID set held in app memory; TOCTOU without UNIQUE; 8k write cap multiplies race windows across callers. Indexed `discoveryKey` column (migration) is the intended scale path.

## 7. Historical debt still explicitly unresolved

| Metric | Live Neon | Status |
| --- | ---: | --- |
| Excess discoveryId duplicate rows | **18,984** | Unresolved until authorized migration |
| Invalid AGREEMENT self-loops | **93** | Unresolved until authorized migration |
| Raw / unique | 48,226 / 29,242 | Unchanged by this PR (read-only) |

## 8. Reconciliation with main and #247–#251

| PR | Topic | File overlap with #246 KF graph paths |
| --- | --- | --- |
| #247 Stage 2 verified sequential | none on operative/provision/discover/quality-gate |
| #248 Stage 3 financial certificate | none |
| #249 Stage 4 entity-scope / cross-doc | none |
| #250 Stage 5 Position/Ask | none |
| #251 certified sequential / Coherent floor | none |

`origin/main` is an ancestor of tip `79f8be36`. #246 does **not** overwrite newer verified-execution behavior in the #247–#251 stack (disjoint paths). Prefer merge order that lands verified-execution stack without rebasing KF remediation on top of unrelated churn unless conflicts appear later.

CI at tip: MERGEABLE / CLEAN / 6/6 green (prior tip).

---

## Regression results

- `tests/product/kf-graph-remediation.test.ts` — pass  
- `tests/product/provision-graph-idempotence.test.ts` — pass  
- `tests/product/customer-intelligence.test.ts` — pass  
- Premerge operative cases — 7/7  
- Concurrent race simulation — documents failure mode (expected)

## Unresolved risks (do not clear by merging alone)

1. **Concurrent persist race until UNIQUE(discoveryKey)** — silent duplicate amplification still possible if expand resumes with parallel workers.  
2. **Isolated migration rollback unproven** — production Neon apply unauthorized.  
3. **18,984 excess + 93 self-loops remain in live DB**.  
4. **Confidence ≠ factual correctness** — do not treat high-confidence DISCOVERED edges as certified authority.  
5. **ABL / intercreditor / guarantee diversity gaps** remain; corpus incomplete.

## Verdict

**READY_FOR_HUMAN_MERGE** — tip `79f8be362667415dc7f9b5fe1c41d000bf35e9d7` is appropriate for human review/merge of remediation code + design docs, with expansion paused and migration withheld.

**Not ready for:** production migration apply, resume expansion, or concurrent graph rebuild.
