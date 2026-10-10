# Agent #11 Round 2B — Independent Acceptance of Canonical PR #293

**Final verdict:** `CANONICAL_293_AUTHENTIC_ACCEPTANCE_UNCHANGED`

## Identity

| Field | Value |
|---|---|
| MAIN_SHA (Round 2 baseline) | `4f1a0b81207364373d9a4cb9fe515d4a1a002e56` |
| PR_293_EVALUATED_SHA | `8a4beb52712a6e31e5458fe2a005026fadedd4f1` |
| ACCEPTANCE_HARNESS evidence HEAD | `3f655d95f023327f4a37d5c1ee56525e28108986` |
| SEALED_REFERENCE_HASH | `393facc432182df08dae690e3fc0e751a4c3a410b71c0e7b93a54122915fa1bd` (unchanged: **true**) |
| Package | AutoNation Third→Fifth A&R |
| Paid inference | $0 |
| Production Neon writes | None |
| Production code edits | None |

### Package hashes

| Doc | Extracted SHA256 |
|---|---|
| doc-a | `3b40cf207df8970a384fa70fba766550bcacc40f52d4d611c4eb80fc039fdcdc` |
| doc-b | `5c932a0f1f2eeccab12627e36a5ee87e6dada826b7ffd55cbbba887ec3d8aa26` |

## Stage results

| Stage | Class | Notes |
|---|---|---|
| 1_UPLOAD | VERIFIED | Offline sealed load of authentic EDGAR exhibits; not a live SaaS upload path. |
| 2_IDENTIFY_DOCUMENTS | VERIFIED | classifications=[{"id":"doc-a","type":"AMENDED_AND_RESTATED_AGREEMENT"},{"id":"doc-b","type":"AMENDED_AND_RESTATED_AGREEMENT"}]; module=package-graph@8a4beb52 |
| 3_RESOLVE_OPERATIVE | BLOCKED | operativeDocumentId=null; agent7=null; amendmentPipeline=null; docBAuthority=REVIEW_REQUIRED; cp=NOT_STATED; confirmedWithCaveats=false; unconditional=false; productionDisposition=PRODUCTION_AUTHORITY_REFUSED; verdict=OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL |
| 4_DISCOVER_COVENANTS | VERIFIED | passAHits=10/10 |
| 5_RETRIEVE_CONTEXT | BLOCKED | SUFFICIENT=0/10 (threshold for VERIFIED: ≥80%) |
| 6_COMPILE_VERIFIED_IR | BLOCKED | verifiedExecutable=0/10; paid inference blocked; local DETERMINISTIC_ONLY is UNVERIFIED |
| 7_ATTACH_FINANCIAL_EVIDENCE | BLOCKED | module=true; AN authenticated financial package attached=false; completeness=0/1; stipulatedProductionAuthoritative=false |
| 8_RECONSTRUCT_UTILIZATION | VERIFIED | Empty/partial history correctly yields knowledge=KNOWN_ATTRIBUTED; supportsRemainingClaim=false; UNKNOWN≠0 |
| 9_EVIDENCE_REVIEWER_AUTHORITY | VERIFIED | Forged issuer actorId not-in-registry mayPublish=false |
| 10_HYPOTHETICAL_TRANSACTION | HYPOTHETICAL_ONLY | Caller-stipulated leverage HYPOTHETICAL_ONLY; unifiedTxn={"attempted":true,"refusedOrErrored":true,"error":"Cannot read properties of undefined (reading 'length')","classification":"BLOCKED_BY_EVIDENCE_OR_CONTRACT"} |
| 11_PRODUCTION_AUTHORITY | VERIFIED | capacityMayPublish=false; mayUseProductionInput=false; operativePromotion=PRODUCTION_AUTHORITY_REFUSED; unconditionalOperative=false |
| 12_SURFACE_DISPLAY | VERIFIED | customerWorkflowHonest=true; sharedViewOk=true; live SaaS UI NOT browser-tested |

## ROUND_1 vs ROUND_2_MAIN vs ROUND_2B_CANONICAL_293

| Metric | R1 | R2 main | R2B #293 | Δ vs R2 |
|---|---|---|---|---|
| Structural recall | 10/10 | 10/10 | 10/10 | 0 |
| Operative authority accuracy | 0/1 | 0/1 | 0/1 | 0 |
| Context SUFFICIENT | 1/10 | 0/10 | 0/10 | 0 |
| Verified executable IR | 0/10 | 0/10 | 0/10 | 0 |
| Financial completeness | 0/1 | 0/1 | 0/1 | 0 |
| Correct refusal | 5/5 | 5/5 | 5/5 | 0 |
| False favorables | 0/12 | 0/12 | 0/12 | 0 |
| Customer-surface consistency | 1/1 | 1/1 | 1/1 | 0 |

## Operative authority

- **Wrong-document production promotion diagnostic:** true — Agent #7 marks doc-a provisions  / bundle  while restatement authorities for doc-a/doc-b remain  and sealed expected operative is doc-b. Capacity-layer AVAILABLE still refused (false favorables 0/12). Independent doc-b promotion probe: .


- Selected operative document: `null`
- Agent #7 doc-b status: `REVIEW_REQUIRED`
- Conditions precedent: `NOT_STATED`
- Confirmed with caveats: **false**
- Unconditional operative authority: **false**
- Production promotion disposition: `PRODUCTION_AUTHORITY_REFUSED`
- Bundle verdict: `OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL`

## Context regression (AN-B-RESTATE)

- Round 1: SUFFICIENT (unresolvedCount=0)
- Round 2 main: `BUDGET_EXCEEDED` (unresolved=22)
- Round 2B #293: `BUDGET_EXCEEDED` (unresolved=23)
- Regression fixed: **false**
- See `17-context-regression.json`

## Verified executable IR

`0/10` — DETERMINISTIC_ONLY UNVERIFIED; fixture IR not counted; paid inference forbidden.

## Financial completeness

`0/1` — module exercised; authenticated AN financial package **absent** (missing source evidence, not a false favorable).

## False favorables

`0/12`

## Top root causes

1. **RC-OPERATIVE** (CODE_OR_AUTHORITY_GAP) — 10 cases — doc-b authority=REVIEW_REQUIRED; cp=NOT_STATED; unconditional=false; amendment pipeline still REVIEW_REQUIRED
2. **RC-CONTEXT-BUDGET** (INFERENCE_BUDGET_LIMITATION) — 10 cases — SUFFICIENT 0/10; AN-B-RESTATE=BUDGET_EXCEEDED; budgets not raised
3. **RC-VERIFIED-IR** (INFERENCE_BUDGET_LIMITATION) — 10 cases — No paid inference; DETERMINISTIC_ONLY remains UNVERIFIED
4. **RC-FINANCIAL-EVIDENCE** (MISSING_SOURCE_EVIDENCE) — 1 cases — No authenticated AN financial statements in sealed package
5. **RC-UTILIZATION-HISTORY** (MISSING_SOURCE_EVIDENCE) — 1 cases — No historical utilization ledger for AN; correct refusal of incomplete

## Production authority status

REFUSED — capacity mayPublish=false; mayUseProductionInput=false; operativePromotion=PRODUCTION_AUTHORITY_REFUSED; host IdP activation not ACTIVE.

## Reproduction

```bash
git fetch origin pull/293/head
git checkout cursor/agent11-round2b-acceptance-509f
# production code under test: 8a4beb52712a6e31e5458fe2a005026fadedd4f1
npm ci && npx prisma generate
npx tsx scripts/agent-11/run-round2b-acceptance.ts
# Artifacts: docs/agent-11-round2b-acceptance/ (does not overwrite Round 1/2)
```

Elapsed: 759 ms.
