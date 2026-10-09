# CKF PR #154 — main reconcile integration gate

**Verdict (local):** `CKF_NONPROMOTING_MERGE_READY` pending GitHub mergeability + tip CI  
**Durability:** `DURABILITY_NOT_PROVEN` (does not block non-promoting hub merge)

## SHAs

| Field | Value |
|---|---|
| Starting PR head | `0e5b3e75b284caee2072444847d8ebf9a01938e2` |
| origin/main at reconcile | `4fb1ab7e6ab34a722f901a69e5a29906b27e4f68` |
| Post-merge reconcile tip | see `main-reconcile-results.json` → `reconcileHead` |

## Conflicts resolved

Only two content conflicts vs `origin/main`:

1. **`.gitignore`** — union: keep `.local-knowledge-corpus/` (CKF) + main’s `data/`, `.cache/`, `.local-amendment-research/`, `.local-dependency-atlas/`.
2. **`package.json` scripts** — union: keep all main scripts (`research:*`, `definition-encyclopedia:*`, `ckg-*`, `compute:*`) + all `kf:*` / `test:knowledge-factory`.

No Prisma model conflicts. `KnowledgeSource*` additions remain additive-only at end of `schema.prisma`.

## Scope audit

Changed paths vs main are limited to:

- `lib/knowledge-factory/**`
- `docs/knowledge-factory/**`
- `scripts/knowledge-factory/**`
- `tests/knowledge-factory/**`
- `prisma/migrations/20261008220000_knowledge_factory_foundation/**`
- additive `prisma/schema.prisma` KF models + `Company.knowledgeSources`
- `.gitignore`, `package.json` (union only)
- `.env.example` (from main merge; SEC contact docs)

No duplicate registry under `lib/contract-model/covenant-knowledge/**`.  
No edits to `lib/covenant-engine.ts`, `lib/contract-model/ir/**`, or certification sealed evidence.  
Promotion guards keep automation below `REVIEWER_VERIFIED` / `CERTIFIED`; consumers hard-code `promotedToLegalTruth: 0`.

## Real-source export (Gibraltar EX-10.1)

Authentic fixture: `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm`  
Source id: `edgar:0001140361-26-003087:ef20064499_ex10-1.htm`

| Metric | Result |
|---|---|
| Body bytes | 2,266,666 |
| Structural nodes | 2,071 |
| Covenant candidates | 203 |
| Definitions | 4 |
| Conditions/exceptions | 400 |
| Representation level | `DISCOVERED_CANDIDATE` (not certified) |
| Alias re-ingest | `wasDuplicate: true` → same canonical sourceId |
| Export schema | `knowledge-factory.consumer-export.v1` |
| Export durabilityClaim | `NONE` |
| Safety flags | all auto-promotion / paid / certification false |

## Consumer integration

Forward consumers in CKF tree (idempotent pass-2):

| Consumer | Fresh Gibraltar export | Committed export v1 (125 sources) |
|---|---|---|
| Definition Encyclopedia adapter | pass1 upsert 1 src / 4 defs; pass2 idempotent; promote 0 | 125 / 257; pass2 idempotent; promote 0 |
| Dependency Atlas adapter | 1 src / 3495 nodes / 1203 edges; pass2 idempotent; promote 0 | 125 / 69230 / 23876; pass2 idempotent; promote 0; shared sourceIds with DEF |

Note: on-main `lib/definition-encyclopedia/kf-import-adapter.ts` is the **reverse** direction (encyclopedia → CKF-shaped records). Forward `consumer-export.v1` consume is `lib/knowledge-factory/consumers/definition-encyclopedia-import.ts`.

## Durability

`DURABILITY_NOT_PROVEN` — `probeDurability` reports `LOCAL_ONLY_NOT_CROSS_VM_DURABLE`, missing shared `DATABASE_URL` + blob token. Committed manifests/hashes enable recovery, not durability. Per mission: do not delay non-promoting hub merge solely for this unfinished milestone.

## Tests

- `npx vitest run tests/knowledge-factory` → **27/27 passed**
- `npx tsc --noEmit` → **clean**
- Ownership + DEF smoke → passed (DEF corpus artifacts restored after smoke)

Machine twin: `main-reconcile-results.json`.
