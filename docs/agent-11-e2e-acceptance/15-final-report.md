# Agent #11 — Independent End-to-End Product Acceptance

**Verdict:** `END_TO_END_ACCEPTANCE_EVALUATION_COMPLETE`  
**Product-ready:** `NOT_DECLARED` (does **not** imply `END_TO_END_PRODUCT_READY`)

## Identity

| Field | Value |
|---|---|
| Starting main SHA | `b23e312afedb53ea6771c2ead1afbcdd758edd86` |
| Seal commit | `ca667446df228984bb5d6b50b44c3c98b45f0730` |
| Evaluation tip |  |
| Package | AutoNation (AN) Third→Fifth A&R (`an-2020-2026-credit-facility`) |
| Unseen claim | **NOT claimed** (authentic evaluation package distinct from tuning fixtures) |
| Paid inference | $0 |
| Production Neon writes | None |
| Production code edits | None |

### Package hashes

| Doc | Extracted SHA256 |
|---|---|
| doc-a Third AR 2020-03-26 | `3b40cf207df8970a384fa70fba766550bcacc40f52d4d611c4eb80fc039fdcdc` |
| doc-b Fifth AR 2026-09-14 | `5c932a0f1f2eeccab12627e36a5ee87e6dada826b7ffd55cbbba887ec3d8aa26` |

Legal references frozen at seal; post-run hash match: **true**.

## Merged vs proposed (at evaluation)

**Merged / available on main:** #274 HEADROOM-3, #276 HEADROOM-5 (WOR exposed), #268 authenticity/issuer, #237 utilization authority, #250 unified stack portions, #269 shared-cap fix.

**Proposed / NOT assumed:** #266 HEADROOM-1, #273 HEADROOM-2, #275 HEADROOM-4, #278 five-agent integration, Agent #6/#8 open PRs, #253/#258 canonical finish.

## Stage classifications

| Stage | Class | Notes |
|---|---|---|
| 1_UPLOAD | VERIFIED | Offline sealed load of authentic EDGAR exhibits; not a live SaaS upload path. |
| 2_IDENTIFY_DOCUMENTS | VERIFIED | classifications=[{"id":"doc-a","type":"AMENDED_AND_RESTATED_AGREEMENT"},{"id":"doc-b","type":"AMENDED_AND_RESTATED_AGREEMENT"}] |
| 3_RESOLVE_OPERATIVE | BLOCKED | operativeDocumentId=null; operativeDocStatus=REVIEW_REQUIRED; stateStatus=OPERATIVE_STATE_REVIEW_REQUIRED; handoffBlocked=false |
| 4_DISCOVER_COVENANTS | VERIFIED | passAHits=10/10 |
| 5_RETRIEVE_CONTEXT | BLOCKED | SUFFICIENT=1/10 (threshold for VERIFIED: ≥80%) |
| 6_COMPILE_VERIFIED_IR | BLOCKED | verifiedExecutable=0/10; paid inference blocked; local DETERMINISTIC_ONLY is UNVERIFIED |
| 7_ATTACH_FINANCIAL_EVIDENCE | UNSUPPORTED | HEADROOM-2 (#273) financial-evidence.ts NOT on main — PROPOSED_UNSUPPORTED |
| 8_RECONSTRUCT_UTILIZATION | VERIFIED | Empty/partial history correctly yields knowledge=KNOWN_ATTRIBUTED; supportsRemainingClaim=false |
| 9_EVIDENCE_REVIEWER_AUTHORITY | VERIFIED | Forged issuer actorId not-in-registry mayPublish=false |
| 10_HYPOTHETICAL_TRANSACTION | HYPOTHETICAL_ONLY | Caller-stipulated leverage illustration labeled HYPOTHETICAL_ONLY |
| 11_PRODUCTION_AUTHORITY | VERIFIED | Production remaining correctly refused without authenticated complete evidence |
| 12_SURFACE_DISPLAY | VERIFIED | HEADROOM-4 (#275) lib/customer-workflow absent — consistency verified via buildSharedProductCapacityViews (Position/Ask/Simulate shared view) only; live route UI status contract NOT_TESTED |

## Scorecard (denominators)

| Metric | Value |
|---|---|
| Structural recall | 10/10 |
| Operative-document accuracy | 0/1 (observed `null`) |
| Pass A discovery recall | 10/10 |
| Context SUFFICIENT | 1/10 |
| Complete operative spans | 7/10 |
| Verified executable IR | 0/10 |
| False favorable capacity | 0/12 |
| Production refusal | CORRECT |
| Surface consistency (shared view) | PASS |

## Two tracks

- **Track 1 HYPOTHETICAL:** Caller-stipulated CTA/EBITDA/leverage illustration labeled `HYPOTHETICAL_ONLY` — see `10-capacity-tracks.json`.
- **Track 2 PRODUCTION AUTHORITY:** Correctly refused without authenticated financials, utilization completeness, and trusted reviewer approval.

## Adversarial

See `12-adversarial-matrix.json` (12 cases). Critical product gaps remain operative-document resolution and verified IR compilation.

## Failure handoffs

See `14-failure-handoffs.json` (5 items). Agent #11 does not fix these.

## Reproduction

```bash
git checkout cursor/agent11-e2e-acceptance-509f
npm ci
npx prisma generate
npx tsx scripts/agent-11/run-offline-acceptance.ts
# Artifacts: docs/agent-11-e2e-acceptance/10-*.json … 15-final-report.md
```

Elapsed: 588 ms.
