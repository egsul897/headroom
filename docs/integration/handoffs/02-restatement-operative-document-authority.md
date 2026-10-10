# Handoff 02 — Restatement / operative-document authority

**Priority:** 2  
**Owner:** next bounded remediation agent  
**Source:** HEADROOM-3/5 — WOR doc-a/doc-b both classify as `AMENDED_AND_RESTATED_AGREEMENT`; whole-document restatement without unique provision targets remains unsupported (`WHOLE_DOCUMENT_RESTATEMENT_WITHOUT_RESOLVED_OPERATIVE_DOCUMENT`).

## Problem

Package-graph handoff correctly fails closed on provisional identity, but authentic A&R pairs still lack a confirmed operative-document succession rule that selects which restated agreement governs which provision as-of a query date.

## In scope

- Deterministic operative-document selection for A&R → A&R succession using trusted edges + effective dating.
- Extend `buildOperativeHandoffBundle` classifications for restatement supersession without inventing provision text.
- Tests: confirmed succession, ambiguous multi-target, future-dated restatement, provisional bridge refusal.
- Keep PR #246 graph expansion **off**.

## Out of scope

- Broad relationship backfill / TOCTOU uniqueness activation from #246
- Customer UI changes
- Paid inference

## Acceptance

- For a confirmed A&R chain, handoff marks post-effective provisions `CONFIRMED_OPERATIVE` with sourceDocumentId = governing restatement.
- Ambiguous / provisional chains remain `PROVISIONAL_IDENTITY_BLOCKED` or `AMBIGUOUS`.
- Offline compiler gate continues to refuse executable elevation on provisional identity.
