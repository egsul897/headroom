# NCEDB Phase 3 — Mission Report

Dataset: `ncedb.phase3.v1`  
Starting PR: #143 @ `b9699fd8b00290ce38d373636834bd73addb19a6`  
Branch: `cursor/negative-covenant-exception-db-21b5`  
Mode: offline research — no paid inference, no merge, no certification advancement, no production Permission writes.

## 1. Unconditional-classification audit

Audited **4** `UNCONDITIONAL_SOURCE_VERIFIED` records. Downgraded **4**. Survivors: **0**.

| exceptionId | from | to | categorical local? | unconditional legal permission? |
|---|---|---|---|---|
| `conmed-7.2-a-loan-document-debt` | UNCONDITIONAL_SOURCE_VERIFIED | CONDITIONAL | True | False |
| `gibraltar-7.06-b-1-loan-docs-burdensome-exception` | UNCONDITIONAL_SOURCE_VERIFIED | CONDITIONAL | False | False |
| `dsgr-6.01-a-secured-obligations` | UNCONDITIONAL_SOURCE_VERIFIED | CONDITIONAL | True | False |
| `riot-5.02-a-i-facility-liens` | UNCONDITIONAL_SOURCE_VERIFIED | CONDITIONAL | True | False |

Principle: categorical local carve-out ≠ unconditional legal permission. Incomplete controlling context forces downgrade. No production capacity inferred.

## 2. Negative controls

- `LOCAL_CONDITIONS`: 2
- `REMOTE_CONDITIONS`: 2
- `NO_ADDITIONAL_CONDITIONS`: 3
- `AMBIGUOUS_CONDITION_SCOPE`: 8
- `PROHIBITION_NO_EXCEPTION`: 2
- `NUMERIC_THRESHOLD_NOT_PERMISSION`: 4
- `CONSTRAINED_BY_OTHER_DOCUMENT`: 1

Case types covered: AMENDMENT_CHANGE, CATEGORICAL_VS_PERMISSION, CONDITIONAL_RATIO, CROSS_DOCUMENT_CONSTRAINT, DEFINED_TERM_RESTRICTION, HANGING_PROVISO, NESTED_EXCEPTION, NUMERIC_THRESHOLD_NOT_PERMISSION, PROHIBITION_NO_EXCEPTION, SHARED_BASKET

## 3. Distinct authentic documents added

Batch size: **25** / 25 (synthetic padding: **false**).

Kinds: `{"CREDIT_AGREEMENT": 4, "AMENDMENT": 16, "RESTATEMENT": 1, "SUPPLEMENTAL_INDENTURE": 3, "INDENTURE": 1}`  
Issuers in batch: AZZ, CNMD, COHR, DSGR, INAP, LYV, MATW, RIOT, SUP

Identity fields tracked separately: issuer, instrument, document, accession, sourceIdentityKey.

## 4. Independent precision/recall

Held-out: Gibraltar §7.06 (detector **not** tuned on ROCK; GT authored independently of detector/catalog).

| metric | value | numerator | denominator |
|---|---|---|---|
| exception discovery precision | 1.0 | 16 | 16 |
| exception discovery recall | 1.0 | 16 | 16 |
| incorrect unconditional-classification rate | 1.0 | 16 | 16 |
| source-span accuracy (ROCK catalog rows) | 1.0 | 1 | 1 |

Catalog invariants are **not** reported as measured accuracy.

## 5. Remote-condition and proviso results

| metric | value | numerator | denominator |
|---|---|---|---|
| remote-condition recall | 0.0 | 0 | 6 |
| proviso attachment accuracy | 0.0 | 0 | 2 |
| entity-scope accuracy | 0.0 | 0 | 2 |
| cross-reference accuracy | 0.0 | 0 | 3 |

## 6. Source-provenance failures

Exact-span failures (non-control catalog rows): **0** (ok=13).

## 7. Import integration status

**ALIGNED_FOR_REVIEW** — canonical `lib/knowledge-factory` schema absent on this branch.
Local proofs: idempotent re-import, duplicate handling, source-version preservation, amendment-aware key separation, no Permission promotion.

## 8. Remaining legal uncertainties

See `08-unresolved-legal-questions.json` (ULQ-P3-1 … ULQ-P3-4).

## 9. SHA / tests / CI / PR

Exact SHA: `26f1082a4f91abde1a335a3569eecc2e8ef9b307`
Tests: `npx vitest run tests/negative-covenant-exception-database/phase2-catalog.test.ts tests/negative-covenant-exception-database/phase3-catalog.test.ts` — 16/16 passed locally.
PR: #143 (draft, do not merge).
