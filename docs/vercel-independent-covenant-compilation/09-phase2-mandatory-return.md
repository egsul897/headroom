# WS-VIC Phase 2 — Mandatory Return

**Workstream:** WS-VIC  
**PR:** https://github.com/egsul897/headroom/pull/146  
**HEAD:** `3dfe43d3104049de8b29cedd7f7bc722071876d9` (plus follow-up triage commit if present)  
**Label key:** MEASURED = observed this session; UNAVAILABLE = runtime/corpus absent; HISTORICAL = prior gateway-era artifacts (not current VIC accuracy).

## 1. Actual new authentic documents processed

| Metric | Value | Label |
| --- | ---: | --- |
| Authentic on-disk financing documents processed (Phase 2A) | **21** | MEASURED |
| Newly acquired EDGAR bodies this session (CKF/EHB) | **0** | MEASURED |
| Discovered EDGAR URLs counted as documents | **0** (forbidden) | MEASURED |
| Target | 100 | — |
| Reached 100 | **false** | MEASURED |
| Gap | CKF/EHB open PRs delivered 0 bulk new bodies; only authentic fixture packages on disk | MEASURED |

Packages: chwy, conmed, dsgr, fwrg, gibraltar, lsb, riot, final-lightweight-unseen-sup.  
Source classes: EXTRACTED_TEXT 12, RAW_HTML 4, CURATED_EXCERPT 5.

## 2. Full structural-index and discovery counts

| Metric | Value | Label |
| --- | ---: | --- |
| Structural nodes | **14,627** | MEASURED |
| Definitions | **4,474** | MEASURED |
| Cross-references | **10,763** | MEASURED |
| Pass A (Phase 2B deterministic) candidates | **6,680** | MEASURED |
| Lightweight splitter windows | **1,506** | MEASURED |
| Docs with empty structural parse | **4** | MEASURED |
| Session wall clock (Phase 2A script) | **56,514 ms** | MEASURED |

Candidate counts are **not** legal completeness.

## 3. Source-backed covenant candidates

| Metric | Value | Label |
| --- | ---: | --- |
| VicRunStore `COVENANT_CANDIDATE` records | **5,109** | MEASURED |
| Cap per doc in persist loop | 500 Pass A seeds | — |
| Verification | all `UNVERIFIED` | MEASURED |
| Held-out CKB (#145) ingested | **false** | MEASURED |

Persist fields per doc: source identity, structural nodes, definitions, cross-refs, covenant candidates, missing dependencies, source hashes, compiler version, uncertainty.

## 4. Semantic hypotheses and verification status

| Metric | Value | Label |
| --- | ---: | --- |
| Semantic hypotheses stored (report) | **34** | MEASURED |
| Independently verified representations | **0** | MEASURED |
| Auto-promoted to verified | **0** (refused by VicRunStore) | MEASURED |
| Local model hypotheses | **0** | UNAVAILABLE (no Ollama/vLLM) |
| Historical gateway accuracy used as VIC score | **no** | — |

## 5. Independently established false-permission results

| Probe | Mode | False permission | Status |
| --- | --- | ---: | --- |
| fp-threshold | DETERMINISTIC_ONLY | **0** | UNVERIFIED probe |
| fp-shall-not | DETERMINISTIC_ONLY | **0** | UNVERIFIED probe |
| **Total false permissions** | | **0** | MEASURED (deterministic emits no permission rules) |

44 Phase-1 `MISSING_LEGAL_RESTRICTION` ledger flags remain **heuristic-only**, not confirmed legal defects (15 risk-stratified samples reviewed).

## 6. Unresolved issue breakdown

### Prior reported 956 (Phase 1 checkpoint)

Formula: `SEMANTIC_HYPOTHESIS_store + extraction_hypothesisCount` (not a legal-defect census).

Residual Phase-1 knowledge-store uncertainty claims classified at triage (**785** on disk):

| Cause | Count |
| --- | ---: |
| MISSING_SOURCE | 0 |
| MISSING_DEFINITION | 0 |
| MISSING_FINANCIAL_INPUT | 0 |
| STRUCTURAL_PARSER_FAILURE | 0 |
| SEMANTIC_UNCERTAINTY | 302 |
| AMENDMENT_AUTHORITY | 483 |
| CROSS_DOCUMENT_RESTRICTION | 0 |
| OTHER | 0 |

### Phase 2A VicRunStore uncertainty claims (**1,911**)

| Cause | Count |
| --- | ---: |
| MISSING_SOURCE | 5 |
| MISSING_DEFINITION | 0 |
| MISSING_FINANCIAL_INPUT | 0 |
| STRUCTURAL_PARSER_FAILURE | 4 |
| SEMANTIC_UNCERTAINTY | 582 |
| AMENDMENT_AUTHORITY | 1,320 |
| CROSS_DOCUMENT_RESTRICTION | 0 |
| OTHER | 0 |

## 7. Model runtime and measured throughput

| Runtime | Status | Throughput |
| --- | --- | --- |
| DETERMINISTIC_ONLY | available | Phase 2A: 21 docs / 56.5s ≈ **0.37 docs/s** (full parse+Pass A) |
| Ollama | **unavailable** | — |
| vLLM | **unavailable** | — |
| OFFLINE_REPLAY | adapter present | not scored for accuracy this session |
| Historical provider | labeled HISTORICAL only | not compared as current VIC accuracy |

Reproducible plan: `docs/vercel-independent-covenant-compilation/08-model-experiment-plan.md`.

## 8. Actual external costs

| Cost | Amount | Label |
| --- | ---: | --- |
| Paid inference (Vercel / providers) | **$0.00** | MEASURED |
| Paid infra / weight downloads | **$0.00** | MEASURED |

## 9. Integration conflicts

| Conflict | Disposition |
| --- | --- |
| **C-DUP-KF** | **RESOLVED** — deleted `lib/contract-model/covenant-knowledge/**`; VicRunStore at `inference/run-store` |
| WS-CKF | mustNotTouch `lib/knowledge-factory/**` |
| WS-CDA | mustNotTouch dependency atlas |
| WS-DEF | mustNotTouch definition encyclopedia |
| Legal Core / Structural Compiler | consume only (`parseDocumentStructure`, Pass A) |
| Contract | `docs/vercel-independent-covenant-compilation/05-integration-contract.md` |

## 10. Exact SHA, PR, tests, and CI

| Item | Value |
| --- | --- |
| PR | [#146](https://github.com/egsul897/headroom/pull/146) (draft; **not merged**) |
| Branch | `cursor/vercel-independent-covenant-compilation-6d1d` |
| CI workflow | `canonical-compiler` / `certified path (provider-free)` |
| CI on `3dfe43d` | **success** (run [37853084251](https://github.com/egsul897/headroom/actions/runs/37853084251)) |
| Focused VIC tests | `tests/vercel-independent-compilation/run-store.test.ts` — **3/3 pass** |
| Soft gates | no paid calls; no cert/sealed-evidence/Claude-fixture edits; no merge |
