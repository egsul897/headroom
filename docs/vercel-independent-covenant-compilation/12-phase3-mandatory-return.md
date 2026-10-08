# WS-VIC Phase 3 — Mandatory Return

**PR:** https://github.com/egsul897/headroom/pull/146 (draft; **not merged**)  
**Starting SHA:** `e1e4ad528338c0e7bfffdfa4c115fe5c37c64ee5`  
**Ending SHA:** _(git tip after this commit)_  

Label key: **MEASURED** | **UNAVAILABLE** | **HISTORICAL**

## 1. Starting and ending SHAs

| | SHA |
| --- | --- |
| Start | `e1e4ad528338c0e7bfffdfa4c115fe5c37c64ee5` |
| End | see branch tip after push (this document committed with Phase 3 code) |

## 2. Authentic documents processed

| Metric | Value | Label |
| --- | ---: | --- |
| Distinct authentic on-disk bodies processed | **38** | MEASURED |
| EXTRACTED_TEXT / RAW_HTML / CURATED_EXCERPT | 12 / 16 / 10 | MEASURED |
| New CKF/EHB acquired bodies consumed | **0** | MEASURED |
| Discovered URLs counted as documents | **0** (forbidden) | MEASURED |
| Target 100 reached | **false** | MEASURED |

Gap: CKF/EHB export paths empty (`NO_CONSUMABLE_EXPORTS`). Expanded within existing authentic fixture packages (including curated twins); no independent SEC crawler.

## 3. Amendment-authority root causes

Audited **1,318** Phase-2A claims previously labeled AMENDMENT_AUTHORITY (family-signal template).

| Root cause | Count | Label |
| --- | ---: | --- |
| OVERBROAD_UNCERTAINTY_CLASSIFICATION | **1,307** | MEASURED |
| GENUINE_UNRESOLVED_AMENDMENT_PRECEDENCE | **6** | MEASURED |
| FALSE_AMENDMENT_DETECTION | **5** | MEASURED |
| MISSING_OPERATIVE_DOCUMENT | 0 (see structural excerpts) | MEASURED |
| INCORRECT_VERSION_SELECTION | 0 | MEASURED |
| MISSING_EFFECTIVE_DATE_CONDITION | 0 | MEASURED |
| MISSING_PARENT_AGREEMENT_IDENTITY | 0 | MEASURED |
| OTHER | 0 | MEASURED |

**Fix shipped:** deterministic extraction v2 — family-signal hypotheses are **SEMANTIC_UNCERTAINTY**, not amendment-chain precedence. Genuine amendment hypotheses require `AMENDMENT_RELATIONSHIP` evidence.  
**Rule honored:** do not resolve uncertainty merely because a later filing exists.  
Coordinate: Amendment Chain Research APIs consumed read-only. Detail: `10-phase3-amendment-authority-audit.json`.

## 4. Structural and source recovery

| Item | Disposition |
| --- | --- |
| Phase-2 empty parses (4) | Re-investigated with exact bodies |
| CONMED guarantee raw HTML | **UNSUPPORTED_HEADING_GRAMMAR** (`Section N.` / table fragments); curated twin **252 nodes RECOVERED** |
| DSGR fourth-amendment raw HTML | **UNSUPPORTED_HEADING_GRAMMAR** (extracted twin preferred) |
| FWRG/LSB definitions + joinder excerpts | **UNSUPPORTED_OR_EXCERPT_FORMAT** / missing full filing |
| Phase-2 missing-source (5 excerpts) | Confirmed **EXCERPT_NOT_FULL_FILING** — not URL discoveries |
| Empty after preserve-structure strip | **6** of 38 (excerpts + unsupported HTML grammar) |

HTML newline-collapse defect addressed via `stripHtmlPreserveStructure` (VIC-owned). Does not rewrite Phase 2A parser.

## 5. Independent precision and recall

Held-out set: **Riot** reconciled GT (`docs/phase-3f2-unseen-validation/resume/08-reconciled-ground-truth.json`) — issuer-disjoint; two independent reviewers + adjudicator. **Not used for tuning.**

| Metric | Value | Label |
| --- | ---: | --- |
| Material GT claims | 113 | MEASURED |
| Candidate recall (section/def proxy) | **95/113 = 84.1%** | MEASURED |
| Candidate precision proxy (Pass A §§ covering GT) | **108/156 = 69.2%** | MEASURED proxy |
| Definition-dependency section coverage | **52/97 = 53.6%** | MEASURED |
| Amendment-version accuracy | NOT_SCORED_AS_RESOLVED | — |
| Heuristic flags counted as verified defects | **false** | — |

These are **candidate-generator** metrics, not certified legal-completeness or permission accuracy.

## 6. False-permission findings

| Probe set | False permissions | Label |
| --- | ---: | --- |
| DETERMINISTIC_ONLY independent probes (threshold / shall-not / except-basket) | **0** | MEASURED |

Unsupported-case refusal: deterministic compile emits no affirmative permission rules on probes.

## 7. CKF/EHB integration status

| Item | Status |
| --- | --- |
| CKF exclusive tree | MUST NOT TOUCH |
| EHB / SEC crawler | not launched |
| Consumable exports in checked paths | **0** (`NO_CONSUMABLE_EXPORTS`) |
| VicRunStore | noncanonical inference artifacts only (`covenant-knowledge-data/phase3/run-store`) |
| Canonical corpus authority | Knowledge Factory |

## 8. Runtime throughput and cost

| Metric | Value | Label |
| --- | ---: | --- |
| Wall clock (Phase 3 script) | **12,010 ms** | MEASURED |
| Docs / sec | ≈ **3.16** | MEASURED |
| Paid inference | **$0.00** | MEASURED |
| Ollama / vLLM | **unavailable** | UNAVAILABLE |
| Unauthorized weight download | none | — |

## 9. Tests and CI

| Item | Value |
| --- | --- |
| Focused VIC tests | `tests/vercel-independent-compilation/**` — **9** (run-store + amendment triage / HTML strip / extraction v2) |
| CI | `certified path (provider-free)` on tip after push |
| Soft gates | no paid calls; no merge; no cert advancement; no production legal-rule edits; no Claude-owned fixture edits |

## 10. Remaining legal-safety blockers

1. No authorized local/open-weight semantic runtime — model-arm accuracy unmeasured.  
2. CKF/EHB have not delivered ≥100 newly acquired authentic EDGAR bodies.  
3. FWRG/LSB remain excerpt-only (missing full operative filings).  
4. Six genuine unresolved amendment-precedence cases still require amendment pipeline + independent verification (not auto-resolved).  
5. Held-out metrics cover **candidate generation**, not certified capacity/permission records.  
6. VicRunStore hypotheses remain **UNVERIFIED**; must not write production legal rules.  
7. Raw HTML with `Section N.` heading grammar still fails Phase 2A structural parse (unsupported format vs curated twin).

## Artifacts

- `10-phase3-amendment-authority-audit.json`
- `11-phase3-report.json`
- `12-phase3-mandatory-return.md`
- `05-integration-contract.md` (Phase 3 addendum)
- `lib/contract-model/compiler/inference/amendment-authority-triage.ts`
- `lib/contract-model/compiler/deterministic-extraction/{html-text.ts, extract.ts v2}`
