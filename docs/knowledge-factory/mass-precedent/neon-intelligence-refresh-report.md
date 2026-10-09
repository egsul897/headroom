# Neon covenant intelligence refresh (cost-constrained)

**Verdict:** `NEON_INTELLIGENCE_REFRESHED_ZERO_PAID_INFERENCE`  
**Branch tip (pre-commit):** current working tree on `cursor/covenant-intelligence-ipv04-af81`  
**Constraint compliance:** no Vercel AI Gateway; no paid bulk inference; reused existing Neon BYTEA; no new database / pipeline / architecture.

## What was already durable

Read-only consolidation dry-run (`npm run kf:consolidation-dry-run`) against shared Neon:

| Metric | Count |
|---|---|
| KnowledgeSource rows | 724 |
| document_byte_objects | 710 |
| Proposed new byte inserts | **0** |
| Identical reuse | 29 |

**Action taken:** skipped byte re-import. Processed only missing summaries and identified definition-discovery defects.

## Code lever (deterministic)

`discoverDefinitions` now normalizes SEC HTML entity curly quotes (`&#x201C;` / `&#x201D;`) and CP1252 C1 smart quotes (`\u0093` / `\u0094`) before scanning. Regression coverage in `tests/knowledge-factory/definition-discovery-authentic.test.ts`.

## Neon metadata refresh (existing `kf:backfill-covenant-summaries`)

Pipeline: load Neon BYTEA → `processAcquiredDocument` (paid AI disabled) → write `metadata.analysis` + `metadata.covenantSummary` (v2) + `metadata.definitionRefresh`.

| Pass | Updated | Failed | Paid calls |
|---|---|---|---|
| `--missing-only` | 62 | 0 | 0 |
| `--force-thin-defs` (batched) | ~253 financing docs with `<50` defs | 0 | 0 |
| Chronic thin re-pass after markers | 0 considered | 0 | 0 |

## Resulting Neon intelligence (metadata aggregates)

See `neon-intelligence-refresh-totals.json`:

| Metric | Value |
|---|---|
| Sources with durable bytes | 724 |
| Sources with analysis metadata | 722 |
| Sources with v2 covenant summary items | 666 |
| Total definitions discovered (sum) | 30,000 |
| Total covenant candidates (sum) | 37,605 |
| Sources with ≥50 definitions | 169 |
| Sources with ≥200 definitions | 41 |
| `promotedToLegalTruth` | **0** (Phase 3 boundary preserved) |

### Example recoveries (defs before → after entity-aware scan)

| Source | Before | After |
|---|---|---|
| `research:cbcfl:alks-unknown-alks-ex10_1` (Alkermes) | 0 | 359 |
| `research:cbcfl:aeo2-unknown-aeo-ex10_1` (AEO) | 0 | 379 |
| `ehb:2264bf8701d3f0cea7b4273e` (Seaboard term loan) | 0 | 157 |
| `fixture:dsgr-…:doc-b-2024-third-amendment.htm` | 0 | 328 |
| `edgar:…:a4ff-crownseventhamendment.htm` | 7 | 532 |

## Explicit non-claims

- Metadata analysis ≠ CERTIFIED operative authority.
- PRECEDENT ≠ OPERATIVE AUTHORITY across issuers.
- Remaining ~33 large financing docs with `<50` defs after refresh are stamped `definitionRefresh.scanner=definition-scan.v2-entities` and will not be re-burned until the scanner changes (amendments / guarantees / sparse definition sections).
- No bulk `KF_CONSOLIDATION_LIVE_WRITE` byte import was required; bytes already present.

## Commands to resume (idempotent)

```bash
npm run kf:consolidation-dry-run   # expect insertBytesAndRegistry: 0
npm run kf:backfill-covenant-summaries -- --missing-only
npm run kf:backfill-covenant-summaries -- --force-thin-defs --limit=40
```
