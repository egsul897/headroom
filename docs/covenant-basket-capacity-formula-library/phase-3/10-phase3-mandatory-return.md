# Phase 3 mandatory return — Corpus-wide false-permission audit

Starting PR: **#148**  
Starting SHA: `c438de3c12793bdec889936d51249c6edbfee39d`

## 1. Starting and ending SHAs

| Item | Value |
|---|---|
| Starting SHA | `c438de3c12793bdec889936d51249c6edbfee39d` |
| Ending SHA (Phase 3 content) | `1698f15222e124b2b8ef9d46b839cd6dca7ed9dd` |
| Branch tip | `1b47f54baf5696dfd83340a1c307b9ab8de06a02` |
| PR | https://github.com/egsul897/headroom/pull/148 (draft; **not merged**) |

## 2. Full 390-candidate classification audit

| Metric | Count |
|---|---|
| Candidates audited | **390 / 390** |
| AFFIRMATIVE_CAPACITY before → after | **294 → 27** |
| NOT_CAPACITY after | **49** |
| INCOMPLETE_SEMANTICS after | **314** |
| Executable | **0** |

Legal-role distribution (after remediation):

| Legal role | Count |
|---|---|
| FORMULA_COMPONENT | 212 |
| EXCEPTION_TO_PROHIBITION | 71 |
| SHARED_CAPACITY_RESTRICTION | 46 |
| NON_PERMISSIVE_NUMERICAL_REFERENCE | 38 |
| AFFIRMATIVE_PERMISSION | 17 |
| DEFINITION_ONLY_FORMULA | 6 |

Artifact: `03-full-390-classification-audit.json` / `export/phase3-audit.jsonl`.

## 3. Corrected false affirmatives

| Metric | Count |
|---|---|
| Prior AFFIRMATIVE_CAPACITY labels demoted by remediation | **267** |
| Remaining AFFIRMATIVE_CAPACITY (still non-executable hypotheses) | **27** |

Dollar amounts, ratios, and greater-of fragments alone were **not** treated as usable capacity.

## 4. Independent precision, recall, and false-permission rate

Frozen Phase-2 reviews preserved as regression evidence: **30**.  
Additional stratified independent reviews: **115**.  
Total independent evaluation set: **145**.

| Metric | Value | Numerator | Denominator |
|---|---|---|---|
| Precision (affirmative permission) | **1.0** | 25 | 25 |
| Recall (affirmative permission) | **1.0** | 25 | 25 |
| False-permission rate | **0.0** | 0 | 145 |
| False-refusal rate | **0.0** | 0 | 25 |
| Formula-family semantics accuracy | **0.9517241379310345** | 138 | 145 |
| Source-span fidelity (operative) | **0.3793103448275862** | 55 | 145 |
| Dependency completeness (fully closed) | **0.0** | 0 | 145 |
| Amendment-version present | **0.0** | 0 | 145 |
| Entity-scope present | **1.0** | 145 | 145 |

Ground truth: independent legal-safety reviews only (not remediator outputs).

## 5. Unresolved dependency counts by cause

| Cause | Count |
|---|---|
| AMENDMENT_AUTHORITY_UNSPECIFIED | 390 |
| KNOWLEDGE_FACTORY_UNVERIFIED | 390 |
| LEGAL_CORE_UNVERIFIED | 390 |
| MEASUREMENT_DATE_UNSPECIFIED | 335 |
| PARENT_COVENANT_UNBOUND | 335 |
| FINANCIAL_DEFINITIONS_PRECEDENT_MISSING | 239 |
| DEFINITION_ENCYCLOPEDIA_MISSING | 193 |
| EXCEPTION_DB_MISSING | 42 |
| DEPENDENCY_ATLAS_MISSING | 39 |

## 6. Genuine positive permissions preserved

| Metric | Count |
|---|---|
| Remediated AFFIRMATIVE_CAPACITY retained | **27** |
| Independent positive permission controls | **25** |
| Independent negative controls | **120** |

All retained affirmatives remain `capacityComputable=false` / `executable=false`.

## 7. Canonical integration status

| Item | Status |
|---|---|
| Import contract | `knowledge-factory-import.basket-formula.v1` |
| Verification lane | `SOURCE_SUPPORTED_HYPOTHESIS` |
| Auto-promote to verified | **no** |
| Competing schema | **no** |
| Independent SEC download | **no** |
| Workstream coordination | Architecture Remediation / Legal Core; Negative Covenant Exception DB; Dependency Atlas; Definition Encyclopedia; Financial Definitions Precedent; Knowledge Factory — all `INTERFACE_ONLY` |

## 8. Tests and current-head CI

| Item | Value |
|---|---|
| Tests | `npx vitest run tests/basket-formula-corpus/` → **21 passed** |
| CI | reported after push / PR checks |

## 9. Remaining legal-safety blockers

1. Legal authority unverified for all candidates (Legal Core interface-only).  
2. Dependency systems unavailable in-repo (795+ class unresolved entries continue).  
3. Thin/unbound mined spans still require governing-section binding.  
4. Hypothesis lane only — no automatic promotion to verified legal rules.  
5. Every formula remains non-executable.

## 10. PR status and costs

| Item | Value |
|---|---|
| PR | https://github.com/egsul897/headroom/pull/148 |
| Status | draft, updated; **not merged** |
| Paid inference | none |
| Merges | none |
| Certification advancement | none |
| Production capacity-engine edits | none |
| Claude-owned fixture changes | none |
| Costs | $0 incremental paid inference |
