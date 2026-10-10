# Graph expansion pause — enforcement mechanism (not policy-only)

**PR #246** · Tip after this doc lands on the remediation branch.  
**Does not** claim database concurrency safety. **Does not** authorize migration or CERTIFIED promotion.

## Open blockers (unchanged)

These remain **explicitly unresolved** and are cited by the refuse error:

1. Application-side discoveryId scan **TOCTOU** until `UNIQUE(discoveryKey)` is authorized and applied  
2. **18,984** historical discoveryId duplicate excess rows in Neon  
3. **93** invalid `AGREEMENT_*` self-loops in Neon  
4. Dedup migration **rollback untested** on an isolated database  

## What is enforced in code

| Entry point | Mechanism |
| --- | --- |
| `runNeonExpandBatch({ live: true })` / `npm run kf:neon-massive-expand` (without `--dry-run`) | `assertCorpusGraphWriteAuthorized("neon-massive-expand")` — requires **both** tokens below |
| `persistProvisionGraph({ dryRun: false })` without `companyId` | `assertCorpusGraphWriteAuthorized("global-provision-graph-persist")` |
| `persistAmendmentGraph({ dryRun: false })` without `companyId` | `assertCorpusGraphWriteAuthorized("global-amendment-graph-persist")` |
| `scripts/product/backfill-relationship-graph.ts` (live) | `assertCorpusGraphWriteAuthorized("relationship-graph-backfill")` before persist |

**Dual operator tokens (both required):**

```bash
KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
KF_GRAPH_REMEDIATION_RESUME=I_RESUME_GRAPH_WRITES_AFTER_REMEDIATION
```

Implementation: `lib/knowledge-factory/continuous/graph-write-gate.ts`  
Tests: `tests/knowledge-factory/graph-write-gate.test.ts`

Absent either token → **throw** before Neon relationship / expand writes. Setting only the legacy mass live-write token is **insufficient**.

No GitHub Actions workflow schedules `neon-massive-expand` (confirmed: no workflow reference). Resume requires a human shell/operator process with both env vars.

## Intentionally not gated by remediation resume

| Path | Reason |
| --- | --- |
| `persistAmendmentGraph({ companyId })` from customer `analyze-upload` | Company-scoped product workflow — not corpus expand / concurrent rebuild |
| Dry-run expand / dry-run persist | No Neon mutations |

## Isolation from verified-execution (#247–#251)

This gate lives under `lib/knowledge-factory/continuous/` and legal-reasoning persist paths only. It does not modify certified sequential / financial certificate / Position-Ask stacks.

## Redirect

After this bounded check, primary engineering effort moves to **Product Proof 002**: generalized compilation of authentic covenant clauses into source-backed IR (see `docs/product-proofs/` / stratified-cert proof tracks as applicable). Graph expansion stays paused.
