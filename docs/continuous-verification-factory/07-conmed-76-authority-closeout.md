# CONMED §7.6 Authority Correction — Human-Review Closeout

**Status:** `HUMAN_REVIEW_CANDIDATE` — not production certification  
**Workstream:** FROZEN after this handoff  
**PR:** #238 (`cursor/continuous-verification-factory-5d11`)  
**Base:** `cursor/cross-document-covenant-reasoning-5d11` (Agent 5 / #218)  
**Exact SHA (closeout tip):** (filled at commit)  
**Typecheck-clean authority tip:** `fc7ec44f6d7610c7568b75c677282a478be58ee1`

## Acceptance

The authority-boundary correction is accepted as a **candidate for human review**.
It is **not** production certification and must not be treated as verified capacity.

Preserved invariants (do not regress):

| Invariant | Enforcement |
|-----------|-------------|
| `CALLER_STIPULATED_HYPOTHETICAL` ≠ `AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE` | Distinct `ConditionEvidenceAuthority` values; latter never set from knownFacts |
| Hypothetical PERMITTED ≠ verified capacity | `isVerifiedProductionCapacity=false`; `legalOutcomeAuthority=HYPOTHETICAL_UNDER_STIPULATED_FACTS` |
| Pro forma CSSLR | Requires `seniorSecuredLeverageIsProFormaForContemplatedTransaction=true` |
| Explicit EOD evidence | Requires `noEventOfDefault`; bare `noDefault` does not clear |
| Stale-snapshot refusal | Stale `financialSnapshotAsOf` without pro forma attestation → unresolved |
| Finite basket ≠ absolute ceiling | §7.6(d) $40M basket separate from §7.6(e) unlimited conditional path |
| Cross-family OR blocked | Investment §7.8 INAPPLICABLE for Restricted Payment |

## Integration dependency

| Item | Value |
|------|-------|
| Depends on | Agent 5 cross-document work — PR #218 / branch `cursor/cross-document-covenant-reasoning-5d11` |
| Must not | Independently rebase onto `main`, retarget #238 to `main`, or auto-merge |
| Owner | **Designated canonical integration owner** reconciles #218 → #238 → `main` |

## Downstream dependency

**Product Proof 002** — authenticated approved financial evidence upgrade path  
Artifact: `docs/continuous-verification-factory/product-proof-002-authenticated-financial-evidence.md`

Until Product Proof 002 lands, no production surface may promote a hypothetical
PERMITTED outcome into verified capacity.

## Freeze

- No further broad authority audit from this workstream
- No parallel compiler implementation from this workstream
- No Neon writes, paid inference, REQUIRE weakening, or auto-merge
- Further production-authority work routes through Product Proof 002 + integration owner

## Unresolved production-authority limitations

1. `AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE` is reserved and never assigned — Product Proof 002 gap.
2. Hypothetical PERMITTED remains available to harness/tests under stipulated facts (labeled only).
3. Ask/API/certified paths do not inject knownFacts today; that boundary must hold after integration.
4. #238 cannot land on `main` until Agent 5 / #218 is reconciled by the canonical integration owner.
