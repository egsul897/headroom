# Module execution matrix

**Main SHA (base):** `617dbd4738d469fbe4bf123694839950adc222e9`  
**Integration tip:** see `STATUS-BOARD.md`  
**Neon:** `neondb` · migrations 33/33 · `document_byte_objects` **absent** (undeployed)

Legend: ✅ executes · ⚠ partial · ❌ blocked · ○ not app-consumed

| MODULE | EXECUTES | PERSISTS | CONSUMED BY APP | TESTED | BLOCKER |
|---|---|---|---|---|---|
| Document acquisition (KF/EHB) | ⚠ scripts | Metadata manifests | ○ | KF tests | Live SEC fetch needs owner + UA; local corpus empty |
| Original document storage (local FS) | ✅ | VM-local `.local-blob-storage` | ✅ CONMED docs | document-storage tests | Not cross-VM durable |
| Original document storage (Postgres BYTEA) | ✅ code | Pending migrate | Pending | provider + KF tests | **Migrate deploy not authorized** |
| Original document storage (Vercel Blob) | ✅ code | Optional | Optional | blob tests | Token not required / not present |
| Structural indexing (KF pipeline) | ✅ | Export JSON / local corpus | ⚠ via export | pipeline-fixtures | Durable Neon bind pending |
| Definition extraction / Encyclopedia | ✅ build + KF import adapter | File corpus | ○ UI not DEF-native | DEF/KF tests | Not Neon-persisted as encyclopedia rows |
| Covenant discovery (KF candidates) | ✅ | Export shards | ⚠ CONMED uses GT catalog | KF tests | Discovery ≠ executable capacity |
| Canonical Knowledge Factory | ✅ | Export + pending Neon | ○ except durability scripts | KF suite | KnowledgeSource rows = 0 until live import |
| Dependency Atlas | ⚠ adapters | File/docs | ○ | consumer import tests | `.local-dependency-atlas` absent |
| Basket Formula Library | ⚠ file corpus | File | ○ | basket tests | 0 executable/verified; no Prisma |
| Covenant Research | ⚠ CLI/corpus | File | ○ | research tests | RESEARCH_ONLY |
| Amendment/version engine | ✅ Document effective dates | Prisma Document | ✅ load filters | engine tests | Doc C out-of-package remains unresolved |
| Contract compiler / Legal IR | ✅ provider-free path | Run artifacts | ○ product UI | verified-execution 29✅ | #136 certified path FAILURE — keep isolated |
| Capacity graph / evaluator | ✅ `lib/covenant-engine` | Via Document.capacityFormulas | ✅ Position/Simulate (Coherent) | verified-execution + product-acceptance | CONMED has no formulas — honest NOT DETERMINABLE |
| Financial snapshots | ✅ | Prisma (3 rows preserved) | ✅ Coherent | core tests | CONMED has none |
| Ledger | ✅ | Prisma | ✅ `/ledger` | mutations tests | CONMED empty (no invented history) |
| Transaction simulation | ✅ | Ephemeral result | ✅ `/simulate` | product-acceptance | Not legal approval; CONMED not-determinable |
| Next.js product routes | ✅ build | RSC/Prisma | ✅ | HTTP 200 + manual UI | Overview KPIs still UNKNOWN |

## Package choices

| Purpose | Package | Why |
|---|---|---|
| Durability proof (bytes) | **Gibraltar** EX-10.1 | Exact byte/SHA acceptance criteria |
| Covenant/capacity workspace | **CONMED** `conmed-demo` | Authentic multi-doc; navigable; capacity blockers truthful |
| Engine-complete Position/Simulate | **Coherent** (EVALUATION) | Seeded capacityFormulas + ledger — not masquerading as CONMED |

## Live-write gates (STOP)

1. `prisma migrate deploy` for `20261009013000_document_byte_objects` + `20261009020000_knowledge_import_batches`
2. `KF_CONSOLIDATION_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE` for Gibraltar/corpus BYTEA backfill
3. Do not modify existing non-demo company records
