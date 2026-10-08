# Concrete integration plan — one functioning covenant knowledge factory

**As of:** 2026-10-08T22:14:30Z  
**Mandate:** PARALLEL KNOWLEDGE PRODUCTION CONTROL  
**Inventory:** `10-live-integration-inventory.json` v2  
**Base main:** `9de4e5737166fcec84a35fdc9a3404870549211f`  
**Coordinator:** WS-PAR (contracts/queue only — does not rewrite CKF/VIC/CCA/GIB)

## 0. Blocker that must clear before “one factory”

| ID | Problem | Required fix (owner) | Done when |
| --- | --- | --- | --- |
| **C-DUP-KF** | VIC #146 added `lib/contract-model/covenant-knowledge/**` store alongside CKF `lib/knowledge-factory/**` | **WS-VIC:** delete store **or** replace with thin client calling CKF APIs; do not migrate a second corpus schema | #146 no longer contains a parallel corpus persistence layer |
| **C-001** | CKF + EHB both speak SEC HTTP | **WS-CKF:** expose `SecRequestScheduler`; **WS-EHB:** call it or PAR mock | EHB has zero direct SEC fetch in production paths |

Until C-DUP-KF clears, **do not merge** VIC corpus-store files into main.

## 1. Canonical import contract + schema owner

| Concern | Owner | Path |
| --- | --- | --- |
| Importable dataset envelope (10 fields) | **WS-PAR** | `06-dataset-delivery-contract.json` |
| Logical identities (13 IDs) | **WS-PAR** | `04-canonical-identity-contract.json` |
| KF Prisma models + ingest upsert | **WS-CKF** | `lib/knowledge-factory/**` + KF migration |
| SEC fair-access scheduler | **WS-CKF** | `lib/knowledge-factory/edgar/*` → `05-sec-request-scheduler-contract.md` |
| Inference adapters | **WS-VIC** | `lib/contract-model/compiler/inference/**` (not a second corpus DB) |
| Held-out eval | **WS-CKB** | #145 — never used for tuning (G6) |
| Phase-3 IR / legal engine | **Out of fleet** | do not touch |

Every corpus PR must preserve: source identity, version, content hashes, exact spans, uncertainty labels, `verificationStatus` (never silent VERIFIED).

## 2. Central ingestion queue

Live queue: `08-integration-queue.json`  
Shared manifest: `13-shared-corpus-manifest.json`

**Ingest algorithm (executable):**

1. Producer opens draft PR under its `exclusiveOwn` trees only.  
2. Producer attaches export satisfying all **10** `06-*` fields + logical IDs from `04-*`.  
3. Queue item status → `READY_FOR_CKF_IMPORT`.  
4. CKF validates gates **G1–G10** (`07-integration-gates.md`).  
5. CKF upserts into KF Prisma / corpus-store; records `actualRecordCounts` in KF manifests.  
6. Daily summary (`daily/YYYY-MM-DD-integration-summary.json`) recounts accession-backed vs fixture vs verified.

## 3. Who has real EDGAR-derived data today?

| Class | Workstreams | Verdict |
| --- | --- | --- |
| EDGAR-capable infra | CKF (branch, no PR), EHB #142 | Client/pilot present |
| **Bulk live EDGAR corpus in open PRs** | — | **None evidenced (count = 0 in daily summary)** |
| Fixture / research / synthetic | DEF #139, CDA #140, NED #143, PCI #144, RCD #147, CCA #141, CKF fixture manifests, VIC docs JSON | Real work, not live EDGAR bulk |
| Held-out eval | CKB #145 | Not corpus growth |

## 4. Ordered next tasks (do these, in order)

1. **VIC #146** — resolve C-DUP-KF (remove/thin-client `lib/contract-model/covenant-knowledge/**`).  
2. **CKF** — open draft PR from `cursor/covenant-knowledge-factory-7327`; publish `SecRequestScheduler` façade; publish `corpus-manifest` with 06 fields.  
3. **EHB #142** — route `sec-access` through scheduler/mock; append pilot accession counts to queue.  
4. **DEF #139 / CDA #140 / NED #143 / PCI #144 / RCD #147** — add missing 06-field blocks + honest `verificationStatus` + `actualRecordCounts`.  
5. **CCA #141** — land measured 100-doc results; $0 GPU spend.  
6. **CKB #145** — remain isolated; publish metrics only.  
7. **GIB** — when agent exists, cost-analyze existing Pass B artifacts only.  
8. **PAR** — refresh inventory/daily summary after each tip; no merges; $0 paid calls.

## 5. Merge sequence (legal-safety first)

PAR contracts → CKF factory+scheduler → EHB (scheduler consumer) → VIC adapters (**after** C-DUP-KF) → corpus overlays → CCA/GIB measurements → CKB stays parallel/non-contaminating.

**Never:** auto-merge, paid spend without auth, sealed-evidence edits, Claude-owned fixture edits, source-only→verified, hypothesis→approved capacity, superseded→operative.

## 6. Independence rule

If blocked: use PAR mocks (`scripts/parallel-agents/mocks/sec-scheduler-mock.ts`) and exclusive-tree datasets; do **not** invent a second factory, scheduler, or registry.
