# Cursor Cloud compute — Phase 3 measured results

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.**  
No paid GPU or model calls. Raw EDGAR bodies are **not** in git (`data/` gitignored).

**PR:** https://github.com/egsul897/headroom/pull/141  
**Starting SHA:** `bc1abd6934f4ee037ada161695f906506dd6f13d`  
**Checkpoint:** `phase3-2026-10-08T22-52-47-268Z-e49360ba`  
**Portable JSON:** `docs/cursor-cloud-compute/results/phase3-phase3-2026-10-08T22-52-47-268Z-e49360ba.json`  
**Handoff checksums (155 docs):** `docs/cursor-cloud-compute/results/phase3-handoff-checksums-e49360ba.jsonl`  
**Research quarantine:** `docs/cursor-cloud-compute/results/RESEARCH_ARTIFACTS.md`

## Coordination

| Workstream | Role |
|---|---|
| WS-PAR | Ownership map + SEC scheduler contracts (consumed RO) |
| WS-EHB | **SEC acquisition owner**; manifests / queues consumed RO |
| WS-CKF | Handoff consumer; peer transport |
| WS-CCA (this) | Exclusive: `docs\|lib\|scripts\|tests/cursor-cloud-compute/**` |

Fleet SEC: `HEADROOM_SEC_FETCH_OWNER=WS-EHB` + shared budget file + authorized contact User-Agent. Process-local limiters are **not** claimed as fleet-wide.

## 1. Coverage (honest)

| Metric | Value |
|---|---|
| Distinct financing docs available (union pilot∪scale) | **155** |
| Unique issuers (pilot) | **48** |
| Scale-1000 new docs beyond pilot | **0** |
| Scale-1000 issuers completed | **55 / 1000** (discovery incomplete; acquisition queue empty) |

WS-CCA did **not** launch discovery. 1,000-doc target is **blocked on EHB coverage**, not Cursor CPU.

## 2. STRUCTURE_EMPTY (42) — root causes

| Root cause | Count | Recoverable? |
|---|---:|---|
| STRUCTURAL_PARSER_LIMITATION | 35 | Yes (parser/heading-shape) |
| HTML_VS_TEXT_FORMAT | 3 | Yes (HTML→text interaction) |
| WRONG_DOCUMENT_CLASSIFICATION | 2 | No (short 8-K bodies mislabeled as CA) |
| INCORRECT_EXHIBIT_BODY_SELECTION | 1 | No (8-K wrapper / pointer, not exhibit body) |
| MISSING_SOURCE_BODY | 1 | Unsupported (`fullText` 186 chars) |

- Recoverable parser failures: **38**
- Genuinely unsupported / non-recoverable selection-or-class: **4**
- Per-document forensic JSON quarantined from infra merge (see `results/RESEARCH_ARTIFACTS.md`; recoverable from branch history + artifact CAS)

Zero-node outcomes are quality failures even when download/parse did not throw.

## 3. MISSING_DEFINITIONS (23) — root causes

| Root cause | Count |
|---|---:|
| PRESENT_BUT_MISSED | 20 |
| ABSENT_FROM_SOURCE | 3 |

- Recovery rate if definition grammar/parser fixed (present-but-missed / 23): **86.96%**
- Remaining gap (absent from source): **3 / 23 (13.04%)**
- No definitions fabricated.

## 4. Durable handoff

| Item | Value |
|---|---|
| Contract | `cca-handoff-v1` |
| Processing version | `cca-phase3-pipeline-v1` |
| Documents in package | 155 (154 distinct source hashes) |
| Artifact tarball | `/opt/cursor/artifacts/cursor-cloud-compute/handoff-phase3-…e49360ba.tar.gz` (7.9 MiB) |
| Tarball sha256 | `c2cb47e331e39f1ae35f7cb848b98ea7cb364108fdbd3301ba139668a523222b` |
| Git-tracked checksums | `docs/cursor-cloud-compute/results/phase3-handoff-checksums-e49360ba.jsonl` (155 content hashes; **not** corpus durability alone) |
| Independent reconstruct proof | **proved** — 155/155 source + structural hash matches from tarball into fresh temp root |
| SEC refetch hash sample | **5/5** match via WS-EHB transport |

VM-local `data/` working corpus is **not** claimed as durable infrastructure.

## 5. Fleet SEC fair-access

- Designated owner: **WS-EHB**
- Shared budget path configured (cooperative token/lease file)
- Authorized User-Agent required (operator contact; placeholders rejected)
- Live exhibit GETs only through EHB `SecAccessCoordinator`
- Process-local RPS ≠ fleet-wide; honest in contract + gate report

## 6. Benchmarks (warm reprocess of pilot corpus)

Acquisition metrics remain Phase 2 cold figures (no new downloads at scale). Processing remeasured:

| Metric | Phase 2 cold | Phase 3 warm reprocess |
|---|---:|---:|
| Unique docs OK | 154 | 154 |
| Processing-only docs/s | 79.01 | **88.88** |
| End-to-end wall | 33.57 s (incl. download) | **1.81 s** (cache) |
| Peak RSS | 186 MiB | 470 MiB |
| Storage / doc | ~603 KiB | ~623 KiB |
| External paid cost | $0 | **$0** |

## 7. Independent quality sample (n=50, 29 issuers)

Source-text comparison — **not** legal-semantic accuracy; output is never its own ground truth.

| Measure | Value |
|---|---:|
| Mean structural coverage | 0.552 |
| False structural nodes | 0 |
| Missing sections (heading-shape vs nodes) | 161 total across sample |
| Missing definitions estimate | 1 |
| Incorrect / unresolved section-ref targets | 3789 (unresolved refs; not guessed) |
| Document-type classification plausible | 100% |

## 8. 1,000-document readiness

**Not ready.** Exact blockers:

1. EHB `scale-1000` discovery incomplete (55/1000 issuers; `queuedForAcquisition=0`)
2. Zero additional authentic financing docs beyond pilot-100 available to consume
3. Further live SEC acquisition must stay under WS-EHB ownership / shared budget

## Repro

```bash
export HEADROOM_CKF_ROOT=/tmp/peer-worktrees/ckf
export HEADROOM_EHB_ROOT=/tmp/peer-worktrees/ehb
export HEADROOM_SEC_FETCH_OWNER=WS-EHB
export SEC_EDGAR_CONTACT_EMAIL='AUTHORIZED_OPERATOR@email'
npm run test:cursor-cloud-compute
npm run compute:phase3-forensic
npm run compute:phase3
```
