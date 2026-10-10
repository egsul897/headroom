# Continuous Neon massive corpus expansion

Restartable, idempotent path to grow Neon’s institutional debt-finance corpus beyond demonstration companies.

## Principles

- Authentic SEC EDGAR / committed public bytes only — no invented documents.
- Idempotent on `sourceId` + `originalBytesHash`.
- Representation stops at discovery / deterministic validation — **never** auto-promotes to `CERTIFIED`.
- Synthetic calculation cases are labeled `inputKind: "synthetic"`; expected results are separate from `enginePrediction`.
- Customer tenant rows stay isolated from the public precedent registry.

## Commands

```bash
# Read-only baseline
npm run kf:neon-baseline

# Dry-run (no Neon writes)
npm run kf:neon-massive-expand -- --dry-run --max=5

# Live batch — PAUSED under quality remediation (dual operator tokens, code-enforced).
# See docs/knowledge-factory/quality-gate/remediation/EXPAND-PAUSE-ENFORCEMENT.md.
# Do not resume while TOCTOU/UNIQUE, 18984 duplicates, 93 self-loops, or untested
# migration rollback remain open. Does not claim DB concurrency safety.
export HEADROOM_SEC_FETCH_OWNER=WS-CKF
export KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
export KF_GRAPH_REMEDIATION_RESUME=I_RESUME_GRAPH_WRITES_AFTER_REMEDIATION
export SEC_EDGAR_CONTACT_EMAIL='authorized@email'
npm run kf:neon-massive-expand -- --max=25 --issuers=12
```

## Stages

1. Discover (CBCFL committed bytes → EHB handoff → live EDGAR diversity targets)
2. Dedupe against Neon `sourceId` / content hash
3. Fetch (rate-limited) or read committed bytes
4. Persist BYTEA + `KnowledgeSource`
5. Structural parse + covenant candidates + v2 summaries
6. Relationship graphs (amendment / provision / document)
7. Synthetic calculation example library
8. `KnowledgeImportBatch` checkpoint + QC metrics

## Artifacts

| Path | Role |
| --- | --- |
| `docs/knowledge-factory/continuous/latest-batch.json` | Last batch metrics |
| `docs/knowledge-factory/continuous/calculation-examples.json` | Synthetic calc library |
| `docs/knowledge-factory/continuous/*-MISSION-REPORT.md` | Session reports |
