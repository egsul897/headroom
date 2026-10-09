# IBR denominator reconciliation (pilot-100-v2)

Three counters are **not** interchangeable. Verified against
`data/edgar-historical-backfill/pilot-100-v2` (EPHEMERAL_WORKSPACE).

| Counter | Value | Denominator / definition |
| --- | ---: | --- |
| Engine `checkpoint.stats.ibrResolved` | **80** | Pre-dedupe second-pass completions: each exhibit where `completeIbrFromOriginalIndex` sets `resolutionStatus === "RESOLVED"` increments the counter **before** `dedupeExhibits`. Includes later-collapsed duplicates. |
| Residual classifier `RESOLVED` | **45** | Post-dedupe kept exhibits with `isIncorporatedByReference` **and** `resolvedSourceUri` + `resolvedFilename` (`classifyIbrResidual`). |
| Queue `IBR_RESOLVED` | **41** | Ranked acquisition-queue items whose `resolutionStatus === "IBR_RESOLVED"` (fetchable IBR subset that passed relevance / ranking into the queue). |

## Residual rollup (post-dedupe IBR exhibits)

| Residual | Count |
| --- | ---: |
| RESOLVED | 45 |
| MISSING_ACCESSION | 19 |
| NEEDS_ORIGINAL_INDEX | 10 |
| **totalIbr** | **74** |

`totalIbr = 74` = all kept IBR exhibits after dedupe (`RESOLVED` + unresolved residual buckets).
Manifest `resolutionStatus` cross-check: `RESOLVED=45`, `PARTIAL=29` (19+10).

## Arithmetic identity (not a bug)

```
engine.ibrResolved (80)
  − duplicates collapsed among second-pass RESOLVED rows (≈35)
  = residual RESOLVED (45)

residual RESOLVED (45)
  − ranked out / below queue relevance threshold (4)
  = queue IBR_RESOLVED (41)

queue FETCHABLE_INLINE (108) + queue IBR_RESOLVED (41) = 149 CKF handoff docs
```

No counter correction required. Reporting must cite the denominator when quoting any of these figures.
