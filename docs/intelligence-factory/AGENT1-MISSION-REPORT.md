# HEADROOM AGENT 1 — Covenant Intelligence Factory Mission Report

**Branch:** `cursor/covenant-intelligence-factory-f761`  
**Starting SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Ending SHA:** `551940eb8df75222fe5a9089bc97d51ae424e824`  
**Paid inference:** $0  
**Neon mutations:** 0  

## Actual corpus counts (live Neon, read-only)

| Metric | Count |
|---|---:|
| Unique KnowledgeSources (total) | 730 |
| Unique authentic PUBLIC_SEC_EDGAR agreements/docs | 681 |
| Distinct issuers | 200 |
| Distinct original byte hashes | 681 |
| DocumentByteObjects | 711 |
| Covenant summary provision items | 28,831 |
| Docs with V2 summaries | 630 |
| Relationship edges (defs/xrefs/exceptions/conditions/shared) | 8,193 |
| KF CERTIFIED / REVIEWER_VERIFIED sources | 0 |
| SemanticTruthRecord (not queried as KF table; maturity gap noted by Cycle 1) | n/a / 0 per peer baseline |

### By representation level
- DISCOVERED_CANDIDATE: 670
- STRUCTURALLY_INDEXED: 60

### Reusable / verified / inaccessible
| Class | Status |
|---|---|
| PUBLIC_SEC_EDGAR with pgbytea bytes (681) | Reusable, source-backed, not certified |
| Fixture-internal (14) | Reusable for regression |
| Customer-upload / UNREVIEWED (35) | Not treated as public precedent |
| Certified contractual truth | None invented; automation stops before CERTIFIED |

## Demonstrated improvements

1. **Shared-capacity false permission / false recognition defect fixed**
   - Split Pass A `shared_cap` from ordinary `aggregate_ceiling`
   - KF patterns + taxonomy + discovery rank + ask-retrieve aligned
   - Multi-clause EBITDA add-back caps recognized (Superior-style)
2. **CKG holdout `shared_capacity_recognition`: 33.3% → 100%** (3/3)
3. **Mechanic patterns newly represented in KF library:** anti-stacking, grower-basket, lesser-of-basket, aggregate-ceiling (library v2; 26 patterns)
4. **Precedent clause retrieval expanded** with shared capacity, anti-stacking, grower, MFN, maintenance, investments, asset sales, EOD, guarantors
5. **Population registry** locks development / regression / HOLDOUT_DEVELOPMENT (Gibraltar) / HOLDOUT_BLIND (Knife River)
6. **Neon inventory + mechanic sample** script (`kf:agent1-corpus-cycle`) — sample of 80 BYTEA docs shows shared-capacity relationship in 34; aggregate-ceiling-only in remainder of ceiling hits

## Defects recorded (genuine, not papered over)

| Defect | Status |
|---|---|
| Bare aggregate amount treated as shared capacity | **Fixed** (generalizable) |
| instrumentIdentity missing on 671/681 public sources | Dry-run ready; live write gated |
| 180 UNKNOWN documentClass; 13 reclassable without bytes | Dry-run ready; live write gated |
| False-permission synthetic control still 50% incidence | Unchanged (separate synthetic control path) |
| SUP RESTATES / definition / condition CKG gaps | Still open (frozen historical failures) |
| 0 KF CERTIFIED rows | Correct — no silent promotion |

## Tests

```
npx vitest run tests/knowledge-factory/                 # 76/76
npx vitest run tests/product/legal-reasoning.test.ts    # 16/16
npx vitest run tests/covenant-knowledge-generalization/ # pass
npx vitest run tests/contract-model/discovery-pipeline.test.ts # 19/19
npx tsx scripts/ckg-benchmark/run.ts                    # shared_capacity 100%
```

## Costs

| Category | Amount |
|---|---:|
| Paid AI / inference | $0 |
| Neon bulk writes | 0 |
| SEC live fetches this session | 0 |

## Coordination

- Peer Cycle 1 (`cursor/neon-intelligence-baseline-2229`, PR #210): inventory + amendment-graph fix — not duplicated
- This branch = Cycle 2: mechanics precision + holdout eval + population registry + retrieval expansion

## Next highest-value (gated)

1. Owner-gated UNKNOWN reclassify (13) + instrumentIdentity backfill (671)
2. Reprocess Neon BYTEA summaries with pattern library v2 (pattern histograms currently empty in metadata)
3. Capacity math offline matrix (Workstream D)
4. Customer cold-start readiness (Workstream E)
