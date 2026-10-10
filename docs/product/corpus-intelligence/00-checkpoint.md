# Corpus Intelligence Flywheel — Checkpoint

**As of:** 2026-10-10  
**Integration tip:** PR #250 `2795ddc9` + merge-gate hardening (this branch tip after push)  
**Neon live access this session:** **FAILED** — TCP/TLS OK; `28P01 password authentication failed for user neondb_owner`  
**Classification:** infrastructure / credential, not application defect

## Inventory sources (ranked)

| Rank | Source | Status |
|------|--------|--------|
| 1 | Live Neon read-only | BLOCKED (auth) |
| 2 | PR #246 snapshot `neon-corpus-stats-final.json` (2026-10-09) | USED — last known live counts |
| 3 | In-repo fixtures (CONMED, Chewy, Coherent docs) | USED — Batch 1 packages |
| 4 | Local KF CorpusStore | EMPTY in this environment |

## Last-known Neon corpus (2026-10-09, #246)

- Knowledge sources: **769** (716 public SEC EDGAR)
- Distinct issuers: **212–213**
- Document byte objects: **746**
- Covenant summary items: **30,469 → 31,689** after batch5
- Knowledge relationships: **48,226** (⚠ #246 remediates duplicate edges — do not treat raw edge count as unique legal knowledge)
- Representation: mostly `DISCOVERED_CANDIDATE` (702); **0 CERTIFIED** promotions
- DB size ≈ **257 MB**

Coordinate with **PR #246** before trusting relationship-edge denominators.

## Batch 1 packages (offline / source-backed)

1. **Coherent** — evaluation seed + Indenture/CA stacking docs (`docs/coherent-*`)
2. **CONMED 2025 facility** — `tests/fixtures/unseen-packages/conmed-2025-credit-facility/` + human ground truth
3. **Chewy 2026 CA** — `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/`

See `01-batch1-package-dissection.md`.

## Engineering landed this session (generalizable)

- Secured debt∩lien: path existence ≠ coverage — capacity, entity scope, shared headroom, collateral priority fail closed (`lib/solver/election.ts` + adversarial tests)

## Next batch (when Neon auth restored)

1. Re-run `scripts/neon-corpus-inventory.ts` — require live counts, not snapshot.
2. Select 3 **unseen** issuer packages not in Batch 1 (prefer ABL + indenture + multi-amendment from #246 operative-audit FAIL cases, e.g. SON restatement precedence).
3. Do not re-count Coherent/CONMED/Chewy for coverage inflation.
4. Prefer #246 deduped unique-edge metrics over raw `knowledgeRelationships`.

## Resume command

```bash
npx tsx scripts/neon-ping.ts          # must print PRISMA_OK
npx tsx scripts/neon-corpus-inventory.ts > docs/product/corpus-intelligence/neon-live-inventory.json
```
