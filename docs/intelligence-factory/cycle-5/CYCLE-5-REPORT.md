# Cycle 5 — Legal correctness remediation

**Branch:** `cursor/covenant-intelligence-factory-f761`  
**PR:** https://github.com/egsul897/headroom/pull/217  
**Peers:** #225 extraction · #227 Neon→capacity · #232 durable lifecycle  
**Paid inference:** $0 · **Neon mutations:** 0 · **CERTIFIED writes:** 0

## Goal

Reduce unsafe executable classifications and material legal omissions while preserving useful discovery recall — not grow candidate volume.

## P0 — Eliminate unsafe executables (prior 32)

| Metric | Cycle 4 | Cycle 5 |
|---|---:|---:|
| Prior false-executable in frozen 61 | 32 | — |
| Remediated (no longer `executableEligible`) | — | **32/32** |
| Still production-reachable false executable | 32 | **0** |
| Population `EXECUTABLE_FORMULA_CANDIDATE` | 2,254 | **107** |
| Formula discoveries retained | 21,994+ | **~22,225** |

### Root-cause categories (prior 32)

| Category | Count | Generalizable fix |
|---|---:|---|
| Missed conditions | 14 | Hard gate: condition language ⇒ `conditions[]` required |
| Builder misclassify / ungated | 8+5 | `BLOCKED_MECHANIC_GATE`; greater-of before builder; strong builder signal |
| Entity scope | 5 | Lexical Borrower/Guarantor/RS required in operative excerpt |
| Leverage ungated | 3 | `BLOCKED_MECHANIC_GATE` |
| Shared capacity ungated | 2 | `BLOCKED_SHARED_CAPACITY` fail-closed |
| Operative / non-basket section | (ALKS 2.20, 1.01) | Block definitional + incremental section refs; gates use operative excerpt only |
| Threshold/formula mismatch | 1 | Grower proximity evidence |

### Eligibility gates (formula discovery ≠ legal permission)

Hard gates for `EXECUTABLE_FORMULA_CANDIDATE`:

1. Source text sufficiently complete  
2. Operative document identified  
3. Governing entity scope established (lexical)  
4. Applicable definitions resolved  
5. Material conditions represented  
6. Shared-capacity resolved or **blocked**  
7. Financial inputs identified (ownership → Agent 2)  
8. Historical utilization status established (pending ledger)  
9. Legal review status preserved (not auto-ACCEPTED)  
10. High-confidence mechanic only (FLAT / ASSETS grower / EBITDA grower)  
11. Formula/threshold evidenced in **operative** excerpt  

Otherwise: `DISCOVERED_FORMULA` / `REVIEW_REQUIRED` / `BLOCKED_*` — never authoritative executable permission.

## P1 — High-confidence mechanics

- **Priority path:** FLAT, ASSETS growers, EBITDA growers (with resolved defs)  
- **Strict review:** BUILDER, LEVERAGE — ownership handoff in `ownership-handoff.json` (Agents 2/3/5)

## P1 — Review-ready recheck (prior 27)

| Metric | Value |
|---|---:|
| Prior Cycle 4 review-ready | 27 |
| Surviving under Cycle 5 gates + operative recheck | **0** |

Expected: prior “review-ready” included condition gaps and was **not** counsel-accepted. Dropped into `REVIEW_REQUIRED` / `DISCOVERED_FORMULA` / `BLOCKED_SHARED_CAPACITY`.

**New** holdout counsel-compile-eligible records: **13** (path #225/#227/#232; `REVIEW_READY_UNVERIFIED` only).

## P1 — Measurement design

| Cohort | Role | n | Formula prec. | Threshold prec. | False exec | False favorable | Material omission |
|---|---|---:|---:|---:|---:|---:|---:|
| Fixed 61 (Cycle 4 freeze) | Regression — do not retune | 61 | 31/60 (52%)† | 26/60 (43%)† | audit label‡ | **0/60** | 48/60 |
| New holdout (salt `0xc5c5`) | Independent validation | 16 | **15/16 (94%)** | **16/16 (100%)** | **1/16 (6%)** | **0/16** | 8/16 (50%) |

† Fixed cohort rescores include demoted BUILDER/LEVERAGE/non-basket rows still present as discovery — not the production executable set.  
‡ Distinguishes **wrong extracted candidate** (audit false-exec label) from **production-reachable false permission** (**0** remaining).

Blind Gibraltar / Knife River: **untouched** (not used for tuning).

## Coordination

| Owner | Assignment |
|---|---|
| Agent 2 | Definitions, financial inputs, Available Amount |
| Agent 3 | Builder/leverage formula correctness, grower proximity |
| Agent 5 | `conditions[]`, shared capacity |
| Neon activation (#232) | Durable reviewed-rule lifecycle |
| Coordinator | PR #217 integration |

## Artifacts

- `fixed-cohort-61.json` — frozen regression  
- `remediation-report.json` — full metrics  
- `false-executable-root-causes.json`  
- `review-ready-recheck.json`  
- `new-holdout-audit.json`  
- `ownership-handoff.json`  

## Tests

- `tests/knowledge-factory/activation-eligibility-gates.test.ts` (9)  
- KF + live-false-permission: **102** passed  
