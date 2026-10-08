# Concrete integration plan (not strategy theater)

**As of:** 2026-10-08T22:10:30Z  
**Base main:** `9de4e5737166fcec84a35fdc9a3404870549211f`  
**Inventory:** `10-live-integration-inventory.json`  
**Owner:** WS-PAR (coordinator). Does not rewrite CKF/VIC/CCA/GIB components.

## 1. One canonical import contract + schema owners

| Concern | Owner | Artifact |
| --- | --- | --- |
| Logical record identities | **WS-PAR** | `04-canonical-identity-contract.json` |
| Importable dataset envelope (10 fields) | **WS-PAR** | `06-dataset-delivery-contract.json` |
| Knowledge-factory Prisma models / KF migration | **WS-CKF** | `prisma/migrations/20261008220000_knowledge_factory_foundation` + KF schema slice |
| SEC fair-access scheduler | **WS-CKF** impl (`lib/knowledge-factory/edgar/*`) | Contract `05-sec-request-scheduler-contract.md`; mock under PAR |
| Model adapters | **WS-VIC** | `lib/extraction/providers/**` (not yet on origin) |
| Phase-3 IR / legal engine | **Out of fleet** | do not touch |

**Rule:** Corpus PRs export datasets that satisfy `06-*`. CKF is the only agent that promotes into KF Prisma tables. No second registry.

## 2. Central ingestion / integration queue

Live queue: `08-integration-queue.json` (append statuses; do not rewrite history in `03-progress-ledger.md`).

Ingest order for datasets:

1. CKF opens draft PR + publishes `docs/knowledge-factory/manifests/corpus-manifest.json` conforming to `06-*`.
2. DEF / CDA / later corpus agents drop `knowledge-factory-export.json` shaped records into the queue item list with counts + verificationStatus.
3. CKF import job validates gates G1–G10 before upsert.
4. EHB discovery metadata joins via `filing_id` / accession after scheduler façade exists.

## 3. Path reconciliation already applied (map v4)

| Workstream | Proposed (v2/v3) | Peer-shipped (authoritative) |
| --- | --- | --- |
| WS-CKF | `covenant-knowledge*` / `lib/covenant-knowledge/**` | `docs|lib|scripts|tests/knowledge-factory/**` |
| WS-CCA | `compute-assessment/**` | `cursor-cloud-compute/**` |
| WS-EHB / DEF / CDA | as proposed | matches |

Coordinator will **not** force peers to rename shipped trees.

## 4. Conflicts and bounded resolutions

| Conflict | Resolution |
| --- | --- |
| Multiple SEC clients (CKF edgar/* + EHB sec-access) | CKF exposes `SecRequestScheduler`; EHB calls it or PAR mock; no parallel flood |
| `package.json` edits in DEF/CCA/CKF | Each PR only adds its own npm script key; rebase on main; never delete peer scripts |
| CKF edits `prisma/schema.prisma` | CKF sole KF schema owner; other agents must not migrate KF tables |
| Large fixture corpora vs live EDGAR | Label dataClass honestly; do not claim bulk EDGAR growth until CKF/EHB publish accession-backed counts |
| VIC/GIB not on origin | Proceed with mocks/contracts; do not block corpus overlays |

## 5. Executable next steps (ordered)

1. **CKF:** open draft PR from `cursor/covenant-knowledge-factory-7327`; add scheduler façade; publish dataset-compliant corpus manifest.  
2. **EHB:** open draft PR; route `sec-access` through scheduler/mock; append pilot discovery counts to queue.  
3. **DEF #139 / CDA #140:** add missing `06-*` fields to exports if absent; keep verificationStatus ≤ REVIEW_REQUIRED for unreviewed rows.  
4. **CCA #141:** land measured benchmark numbers under `docs/cursor-cloud-compute/`; no paid GPUs.  
5. **VIC:** publish first adapter PR (deterministic/offline).  
6. **GIB:** when present, cost-analyze existing Pass B artifacts only.  
7. **PAR:** refresh inventory/queue on each peer tip; run ownership checker on PAR tree only.

## 6. Merge sequence (legal-safety first)

Follow `07-integration-gates.md`. No automatic merges. No paid spend. No sealed-evidence edits. No Claude-owned fixture edits.

## 7. Daily integration summary fields

Publish under `docs/architecture/parallel-agents/daily/` (WS-PAR exclusive) with:

- corpus growth (accession-backed vs fixture)
- verified knowledge growth (verificationStatus=VERIFIED counts only)
- high-risk defects / gate failures
- conflicts
- CI statuses for fleet PRs
- cloud costs (must remain $0 unless founder-authorized)
