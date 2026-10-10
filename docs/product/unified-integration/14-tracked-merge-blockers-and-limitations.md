# Tracked blockers / limitations — PR #253 closeout

**Audited semantic-safety tip:** `4ff3374a6d4e0ddbfe47ba7f2249b46e355932f5`  
**Semantic safety:** accepted (EXECUTABLE / path identity) — `SEMANTIC_SAFETY_ACCEPTED_INTEGRATION_REVIEW_PENDING`.  
**Do not merge / certify / paid-infer / Neon-write from this agent.**  
**Green CI ≠ resolution** of FA-P1/P2 defects or FA-CONC concurrency proofs below.

## Owners and acceptance criteria

Default owner: **Headroom platform engineering** (human).  
Acceptance requires live evidence on reachable Postgres/Neon (or an explicit human waiver).

| ID | Severity | Title | Owner | Acceptance criteria | Blocks #253 merge? |
|----|----------|-------|-------|---------------------|--------------------|
| **FA-P1-01** | P1 limitation | Upload path lacks byte-identical dedup (`uploadAndChunkDocument` vs `uploadDocumentThroughIngestion`) | Platform / ingestion | Either wire UI action through dedup wrapper **or** document intentional dual-row behavior with customer-facing identity note; prove with `document-source-identity-overload` 1a on live DB | **Soft** — not certified-path; human must acknowledge before production onboarding claims |
| **FA-P2-01** | P2 defect | `ContractReferenceEdge` SetNull FK vs CHECK `target_matches_type` collision on RULE targets | Platform / schema | Schema/migration fix so DELETE completes without uncaught constraint violation; Job 2 #5 P2 test passes or is rewritten to assert fixed behavior | Soft |
| **FA-P2-02** | P2 defect | Bare `prisma.document.create` defaults `typeConfirmedByUser=true` (review landmine) | Platform / review | Default false / require explicit confirmation; review-state-staleness 4a updated to prove safe default | Soft |
| **FA-LIM-01** | Limitation | `supersedesDocumentId` unused by capacity/amendment calculation | Modeling | Either consult supersession in operative filter **or** keep display-only with documented limitation | Soft |
| **FA-CONC-01** | Proof gap | Concurrent `persistStructuralNodes` unique-key race | Platform / persistence | Pass Job 2 #6 on reachable Postgres | Soft — re-verify only |
| **FA-CONC-02** | Proof gap | Concurrent `recordClaimReview` first-create (AUD-S24-01) | Platform / claims | Pass race repro without 5s timeout / unhandled P2002 on reachable Postgres | Soft |
| **FA-ENV-*** | Env | Neon unreachable in agent / some CI contexts | Infra | Reachable `DATABASE_URL` for foundation-audit job **or** explicit skip when unreachable (fail-closed, not silent pass) | Soft for #253 certified path |
| **OUT-VEP-01** | Outstanding | Authentic VEP retrieval not wired on Simulate page (`verifiedPackage: null`) | Product | Real package load path; never invent/fixture-substitute | Soft — correctly NOT EXECUTABLE today |
| **OUT-NS4-01** | Outstanding | NS-4 APPROVED financial authority / completeness certs for live epochs | Product / finance | APPROVED snapshots + completeness certificates before customer remaining claims | Soft — #237 fail-closed |

## Explicit non-blockers for semantic-safety merge review

| Item | Status at tip |
|------|----------------|
| EXECUTABLE affirmative gates | Accepted — do not modify without reproducible defect |
| Exact pathId / PATH_NOT_FOUND | Accepted |
| Shared-lien aggregate conservation | **Disproved as defect** — see `tests/.../shared-lien-aggregate-conservation.test.ts` (4/4) |
| GitHub Actions certified-path CI | Green at tip |

## Verdict implication

Human may merge #253 for **semantic-safety + Stages 2–5 integration** only after acknowledging FA-P\* / OUT-\* as **post-merge tracked work**, not as cleared production readiness.  
Production readiness / legal certification is **not** declared.
