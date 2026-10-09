# WS-VIC Phase 3 — Non-promoting integration gate

**PR:** https://github.com/egsul897/headroom/pull/146  
**Integration Lead:** WS-PAR (`docs/architecture/parallel-agents/14-continuous-main-integration-dashboard.json`)  
**Reviewed head (pre-gate):** `0dbe81f4f67a7eb5b453b596376925e7f52c1f8a`  
**Gate start SHA:** `0dbe81f4f67a7eb5b453b596376925e7f52c1f8a`

## Merge conflict resolution

| Item | Detail |
| --- | --- |
| Why not mergeable | `mergeable=CONFLICTING` / `mergeStateStatus=DIRTY` — branch ~246 commits behind `origin/main` |
| Conflicting paths | **Only** `.gitignore` |
| Resolution | Union both sides: keep main’s peer-workstream ignores (`data/`, `.local-knowledge-corpus/`, `.cache/`, `.local-amendment-research/`, `.local-dependency-atlas/`) **and** VIC bulk ignores (`covenant-knowledge-data/`, `.ollama/`, `.vllm/`, `*.gguf`) |
| Other conflicts | None |

## Corpus labeling (no CKF/EHB misrepresentation)

| Claim | Status |
| --- | --- |
| 38 authentic on-disk bodies | MEASURED fixture/curated/extracted/raw packages under `tests/fixtures/unseen-packages/**` |
| Newly acquired CKF/EHB bodies | **0** — reports retain `NO_CONSUMABLE_EXPORTS` / `newEdgarDownloadsThisSession: 0` |
| EHB on current main | `docs/edgar-historical-backfill/ckf-handoff-summary.json`: **149 FETCHABLE URLs**, `storageStatus=COMMITTED_DOCS_SUMMARY` — **not** downloaded source bodies |
| CKF exclusive trees on main | `lib/knowledge-factory/**` / `docs/knowledge-factory/**` **absent** on merged tip |
| URLs counted as documents | **Forbidden / not done** |

## Preserved Phase 3 semantics

| Invariant | Status |
| --- | --- |
| Extraction v2: family-signal → SEMANTIC_UNCERTAINTY | Preserved (`deterministic-covenant-extraction.v2`) |
| AMENDMENT_AUTHORITY_GUESS only with AMENDMENT_RELATIONSHIP | Preserved |
| Six genuine unresolved amendment-precedence cases | Preserved in `10-phase3-amendment-authority-audit.json` (`GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE: 6`) |
| VicRunStore noncanonical | Explicit in schema/store; path under `inference/run-store`; refuses model auto-`INDEPENDENTLY_VERIFIED` |
| No production legal-rule / executable-capacity writes | No edits to certification boards, sealed evidence, or ContractRule production writers |

## Real-export integration status

**`NO_CONSUMABLE_EXPORTS` preserved.**  
Peer metadata exports (DEF encyclopedia JSON, amendment-chain KF export, EHB URL handoff, source-to-covenant dataset) are **not** authentic financing source bodies for VIC corpus ingestion. No second registry created; existing VicRunStore not treated as CKF adapter.

## Changed-path scope (vs `origin/main`)

56 paths: VIC exclusive docs/scripts/tests + `lib/contract-model/compiler/{inference,deterministic-extraction,local-semantic,selective-compilation}/**` + colocated `tests/contract-model/{inference,deterministic-extraction,local-semantic,selective-compilation}/**` + `.gitignore`.  
No frozen Claude fixtures, certification alterations, or duplicate Knowledge Factory infrastructure.

## Non-blocking limitations (for Integration Lead)

1. Candidate discovery ≠ legal certification.  
2. CKF durable bodies still not consumable on this workspace.  
3. Six genuine amendment-precedence cases still require amendment-pipeline consume + independent verification.  
4. FWRG/LSB excerpt-only packages; some raw HTML `Section N.` grammar unsupported.  
5. No local/open-weight semantic runtime; $0 paid.

## Verdict

**`NONPROMOTING_MERGE_READY`**

| Item | Value |
| --- | --- |
| Starting SHA | `0dbe81f4f67a7eb5b453b596376925e7f52c1f8a` |
| Ending SHA (exact head) | `bd90f79167058131797e8797b74f6d5631b0a86c` |
| Merge conflict resolutions | `.gitignore` union only (see above) |
| `gh` mergeable | `MERGEABLE` (was `CONFLICTING`/`DIRTY` pre-merge) |
| Draft → ready for review | Marked ready after exact-head CI green |
| Focused VIC tests | 20/20 pass |
| `tsc --noEmit` | exit 0 |
| Exact-head CI | `certified path (provider-free)` **pass** (+ soft gates pass) |
| Real-export status | `NO_CONSUMABLE_EXPORTS` |

Candidate discovery remains **not** legal certification.
