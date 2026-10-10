# Product Proof 002 — Authenticated Approved Financial Evidence

**Status:** OPEN — explicit downstream dependency of CONMED §7.6 authority closeout  
**Upstream freeze:** CONMED §7.6 authority correction on PR #238 (human-review candidate; not production certification)  
**Pinned authority tip:** `fc7ec44f6d7610c7568b75c677282a478be58ee1`  
**Closeout tip:** e40492d80f1b5db1004481d492056e723c43c78b

## Gap

Cross-document evaluation may return `PERMITTED` under caller-stipulated facts
(`conditionEvidenceAuthority=CALLER_STIPULATED_HYPOTHETICAL`,
`legalOutcomeAuthority=HYPOTHETICAL_UNDER_STIPULATED_FACTS`,
`isVerifiedProductionCapacity=false`).

There is **no** production path that upgrades CSSLR / Event-of-Default (or other
operative financial conditions) to
`AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE`.

That reserved authority must never be inferred from:

- favorable `knownFacts` supplied by the caller
- unlabeled historical ratios
- stale financial snapshots
- harness / CVF / demo fixtures

## Required before verified production capacity

Product Proof 002 must demonstrate, with authenticated and approved evidence:

1. Pro forma Consolidated Senior Secured Leverage for the contemplated transaction
2. Explicit no-Event-of-Default evidence contemporaneous with the evaluation
3. Freshness / as-of alignment (stale snapshots refused without pro forma attestation)
4. Independent conjunction with all other operative restrictions (no single-basket inference)
5. `isVerifiedProductionCapacity=true` only when the above clear — never from stipulation alone

## Non-goals for this proof

- Does not reopen the §7.6(d)/(e) legal correction
- Does not invent certificates or fabricate financial snapshots
- Does not weaken REQUIRE gates, soft≠hard CI, or Phase 3/4 boundaries
- Does not auto-merge PR #238

## Integration

Work on Product Proof 002 proceeds only after the designated canonical integration
owner lands Agent 5 (#218) and reconciles CVF (#238). This workstream does not
independently rebase or merge into `main`.
