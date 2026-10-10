# Cycle 6 — Recover useful recall without sacrificing safety

**Branch:** `cursor/covenant-intelligence-factory-f761`  
**PR:** https://github.com/egsul897/headroom/pull/217  
**Feature tip (code + measure artifacts):** `061324884e15d8d44d501930ab6e309d821cf0da`  
**CI / PR head:** see PR #217 (mutable; not re-embedded here)  
**Peers:** #225 extraction (merged) · #227 Neon→capacity (merged) · #232 durable lifecycle (closed; utilization authority on main via #237)  
**Paid inference:** $0 · **Neon mutations:** 0 · **CERTIFIED / PRODUCTION_AUTHORITATIVE writes:** 0

## Goal

Recover source-backed **executable formula** recall (FLAT / EBITDA / ASSETS) while preserving Cycle 5 false-permission protections. Discovery ≠ executable ≠ counsel-compile-eligible ≠ production-authoritative.

## Safety preserved (hard)

| Gate | Result |
|---|---|
| Prior 32 false-executables demoted | **32/32** (`executableEligible=false`) |
| Frozen-61 gold− false positives | **0** |
| Events of Default / judgment / indemnity / mandatory prepay / reporting | `BLOCKED_NON_PERMISSION_THRESHOLD` |
| BUILDER / LEVERAGE | Still `BLOCKED_MECHANIC_GATE` (Agents 2/3/5) |
| REVIEW_READY_WITH_GAPS → counsel-compile | **0/6** compile-eligible (forced incomplete) |
| PRODUCTION_AUTHORITATIVE | **Never set** by KF |

## Promotion ladder (explicit)

| State | Meaning | Cycle 6 count (population scan) |
|---|---|---:|
| DISCOVERED | Formula shape only | (blockedReasons) |
| EXECUTABLE_FORMULA_ONLY | Numeric formula may evaluate; **not** a complete legal rule | **307** |
| COUNSEL_COMPILE_ELIGIBLE | Completeness passed; may enter parse→compile path (UNVERIFIED) | **281** (activation-level; audit-backed holdout = 2) |
| REVIEW_READY | Queue for counsel; gaps forced incomplete | holdout RR_UNVERIFIED |
| PRODUCTION_AUTHORITATIVE | Counsel ACCEPT + durable lifecycle only | **0** |

## Frozen-61 recall (HISTORICAL_EXPOSED — not for retuning)

| Metric | Cycle 5 tip | Cycle 6 |
|---|---:|---:|
| True positives (gold+) | 0 | **5** |
| False negatives | 27 | **22** |
| True negatives (gold−) | 32 | **32** |
| False positives | 0 | **0** |
| Precision | — | **1.00** (Wilson 95% 0.57–1.00) |
| Recall | 0.00 | **0.185** (Wilson 95% 0.08–0.37) |

### Unique TP sectionRefs (5)

`6.08` FLAT · `5.14` EBITDA · `6.01(j)` EBITDA · `8.1(a)` ASSETS · `10.4` ASSETS

### False negatives — why legitimate candidates remain blocked

| Reason | n | Ownership / notes |
|---|---:|---|
| BLOCKED_SHARED_CAPACITY | 9 | Agent 5 — stacking / builder-family contamination |
| REVIEW_REQUIRED | 6 | Entity scope or grower not in operative excerpt |
| DISCOVERED_FORMULA | 4 | Non-operative / consolidation / thin source |
| BLOCKED_NON_PERMISSION_THRESHOLD | 3 | Correct — EOD/judgment gold+ mislabels |

Material omissions driving FNs: grower formula only in `materialBasketsThresholds` (not operative excerpt); shared-capacity / builder precedence; missing lexical entity on sub-clauses; article-level headings.

### False favorable

**0** on frozen-61 gold−. Non-permission monetary thresholds are not treated as affirmative capacity.

## Cycle 5 RR-WITH_GAPS (6)

All six forced `BLOCKED_INCOMPLETE_OPERATIVE` / not counsel-compile-eligible. Completeness reasons include missing chapeau, conditions only in full window, shared capacity only in full window, non-permission thresholds. Abbreviated operative excerpts cannot promote to legally complete rules.

## New blind holdout (salt `0xc6c6`)

| | |
|---|---|
| Status | **BLIND_UNEVALUATED_FOR_TUNING** |
| n | 14 (quota 12/8/6 unmet — stricter executable pool) |
| Excluded | 77 exposed keys + Gibraltar / Knife River |
| Formula precision | 8/14 (57%) |
| Threshold precision | (see `recall-report.json`) |
| False-executable rate | 6/14 (43%) — **do not retune gates on this cohort** |
| False favorable | 0 |
| Counsel-compile-eligible (audit-backed) | 2 |
| Blocked incomplete | majority |

## Historical cohorts (exposed)

See `historical-cohorts.json`:

- Frozen 61 → `HISTORICAL_EXPOSED`
- Cycle 5 holdout 16 → `HISTORICAL_EXPOSED`
- Cycle 6 blind holdout → future evaluation only

## Source-backed modeling changes (this cycle)

1. Operative completeness module (`completeness.ts`) — abbreviation, chapeau, conditions, non-permission  
2. `counselCompileEligible` / `promotionState` distinct from formula-executable  
3. Non-permission family/heading gates (EOD, judgment, indemnity, prepay, reporting)  
4. Entity nouns: Credit Parties, Holdings, Company, Issuer, Obligor, Restricted Subsidiar(y|ies)  
5. Growers require **"greater of" in operative excerpt** (not baskets-only)  
6. Article-level `Negative Covenants` / `Affirmative Covenants` headings blocked  
7. Builder-family + baskets-only/stacked greater-of → shared-capacity / Agent3 block  
8. Softened structured `conditions[]` for formula-executable only; compile still requires completeness  

## Coordination

| Agent | Ownership |
|---|---|
| 2 | Definitions + financial inputs for growers |
| 3 | Builder / leverage formula after defs (still blocked) |
| 5 | Structure `conditions[]` + shared-capacity before counsel-compile |

## Artifacts

- `docs/intelligence-factory/cycle-6/recall-report.json`
- `docs/intelligence-factory/cycle-6/new-blind-holdout.json`
- `docs/intelligence-factory/cycle-6/historical-cohorts.json`
- `npm run kf:cycle-6-recall`

## Verdict

**Partial success:** meaningful source-backed recall recovery (0→5 gold+ TPs; population executables 107→307) with **32/32** unsafe exclusions preserved, **0** frozen FPs, **0** gaps compile-eligible, **0** production-authoritative. Remaining recall requires Agent 2/3/5 modeling — not gate relaxation.
