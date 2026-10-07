# P3-FFC1 reviewer checklist

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. **PINNED_OFFLINE ≠ CERTIFIED.** A green `p3-r0-soft-gate` run is not certification credit.

FROZEN sha256 `c6857edd01124cf82bba22b3d583b7cccbb783cf18d79a3d3b7f19d84705382f`. Base tip `129724b3f3b945a5c06f87f9630c9d3c6b87cb73`. This chunk supersedes FROZEN/GRANT `435c47fc…`.

## Permanent reviewer question

**WHAT HAPPENS WHEN TWO VALID INPUTS CLAIM DIFFERENT VALUES FOR THE SAME CANONICAL IDENTITY?**

For a FINANCIAL_FACT same-date canonical field, the field group fails closed as `CONFLICTING_FINANCIAL_FACTS` and is surfaced as `REVIEW_REQUIRED`. No iteration-order winner. No majority vote. No last-approved-wins. An existing same-date value V stays V when a batch proposes W ≠ V. `applied: true` only when the candidate contributed the value that lands. Candidates that did not contribute do not get `promotedAt`.

## Applied honesty vs wrapper carry

Applied-contribution honesty is in this chunk. Non-conflicted field groups may still apply. Conflicted keys are `applied: false`. Unchanged same-date canonical numbers are not overwritten, and this path does not rebuild an existing FinancialState just to echo them.

**P3-FFC1b (successor chunk):** provenance-wrapper carry for unchanged FinancialState fields is the follow-on, not a change to this conflict checklist's semantics. See `docs/p3-ffc1b-provenance-wrapper-carry-checklist.md`. FinancialSnapshot still has no per-field provenance. FFC1 conflict semantics are unchanged.

## HOLD follow-ons (not this PR)

Confirmed same-class cites, left untouched because the FINANCIAL_FACT surfacing edit is local to the financial-fact block:

- **P3-FFC1b** — successor chunk (provenance-wrapper carry). Not an open edit inside the FFC1 conflict rules. See `docs/p3-ffc1b-provenance-wrapper-carry-checklist.md`.
- **DEFINED_TERM** — upsert last-write-wins and both candidates promoted (`lib/onboarding/promotion.ts` defined-term block).
- **DOCUMENT_RELATIONSHIP** — successive overwrite of type/supersession by approved-candidate order (document-relationship block).
- **Reconciliation amplifier** — `lib/onboarding/reconciliation.ts` same-source duplicate skip. No majority invent was added.
- **EXTERNAL_INPUT_REQUIREMENT** — always creates a new row.
- **Covenant activation** — create-per-candidate.
- **permissionRelationship** — always create.
- **PERMISSION duplicate-ref skip** — preserved. Do not weaken.

Merge stays HOLD until Architect COMMENT, Trust (+IR), Notes/Cert, tip CI SUCCESS on this soft gate, and COO MERGE AUTHORIZED.
