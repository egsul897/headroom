# Authentic evidence required for operative restatement authority

A newer filing is **not** automatically an operative replacement. Agent #7 confirms restatement authority only when the following authentic signals are present (generalized — never issuer-specific).

## Restatement identity (successor → predecessor)

| Evidence | Why required | Absent → |
| --- | --- | --- |
| Amended-and-restated caption / ordinal label | Identifies the instrument as a restatement, not a side letter or unrelated filing | `UNSUPPORTED` / weak |
| Prior-agreement recital naming type + execution date **and** binding `Existing Credit Agreement` (or equivalent) | Uniquely identifies the predecessor; WHEREAS alone without operative use is insufficient for package-graph STRONG, but is necessary for target naming | `REVIEW_REQUIRED` if no unique in-package match; `AMBIGUOUS` if multiple |
| Operative restatement language (`NOW THEREFORE` and/or Article “Amendment and Restatement of Existing Credit Agreement” stating amended/superseded/restated in entirety) | Performs the legal act; WHEREAS narrative is not enough by itself | `REVIEW_REQUIRED` |
| Facility continuity (admin agent, revolving/commitment markers; borrower `f/k/a` when names change) | Prevents cross-facility contamination | `UNSUPPORTED` on hard mismatch |
| Novation disclaimer (when present) | Confirms continuity of the same facility rather than a new unrelated deal | Recorded; not required alone |

## Effectiveness

| Evidence | Why required | Absent → |
| --- | --- | --- |
| Execution / signature block (`IN WITNESS WHEREOF`, signature pages) | Proves the agreement was executed | `REVIEW_REQUIRED` — never invent effectiveness |
| Dated-as-of / identity execution date | Calendar anchor for as-of comparisons | `REVIEW_REQUIRED` |
| Conditions precedent stated in the restatement clause (e.g. §4.01) | Effectiveness may be conditional | Disclosed as `NOT_INDEPENDENTLY_PROVEN` — **never manufactured as satisfied** |

When signatures + dated-as-of are present but CP satisfaction is not independently proven from package artifacts, Agent #7 may infer effectiveness with an explicit caveat (`INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION` + `CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN`). Consumers (Agent #10) must surface the caveat and must not treat CP satisfaction as proven.

## Provision-level authority

| Instrument | Governing rule |
| --- | --- |
| Original agreement | Governs until an effective restatement/amendment replaces it |
| Full restatement | Successor governs **all** provisions on/after effective date |
| Partial restatement | Successor governs **only** listed provision refs; others stay on predecessor |
| Amendment | Overlay on targeted provisions only |
| Supplement / waiver / side letter | Overlay only; never whole-document supersession |
| Pre-effective successor | Predecessor remains governing (`NOT_YET_EFFECTIVE`) |
| Conflicting same-date targets | `AMBIGUOUS` |
| Provisional instrument identity (#274) | `PROVISIONAL_IDENTITY_BLOCKED` |

## Package-graph integration contract

- Consume #274 `ConfirmedInstrumentIdentityView` when available (`mayConsolidateOperative`, confirmed ids only).
- **Do not** mutate package-graph `RESTATES` status or `evidenceClass`.
- A package-graph `REVIEW_REQUIRED` / `SUPPORTING_TARGET_EVIDENCE` edge may coexist with additive `OPERATIVE_AUTHORITY_CONFIRMED` when §11.01-style operative language + unique prior match exist. The additive layer does not rewrite the edge.
- Expose `OperativeAuthorityHandoffBundle` for Agent #6 retrieval and Agent #10 execution.
