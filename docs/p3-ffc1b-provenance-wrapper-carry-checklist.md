# P3-FFC1b reviewer checklist

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. **PINNED_OFFLINE ≠ CERTIFIED.** A green `p3-r0-soft-gate` run is not certification credit. Coding authorization is not merge authorization.

FROZEN sha256 `ce41ede5d04eee977603ce377eaf7eb5f96266c016109ce99c0d45f9ef731671`. Base tip `2087d4e9bfdc0955fb76e6ba5550fa98e549963d`.

## Permanent reviewer question

**WHEN A SAME-DATE FINANCIALSTATE REWRITE CHANGES ONLY SOME FIELDS, DO UNCHANGED FIELDS KEEP THEIR PRIOR PROVENANCE WRAPPERS?**

Yes. `financialStateFactsFromInput` takes optional prior FinancialState fact groups. A field whose numeric value equals the prior wrapper's `value` reuses that wrapper's `value`, `sourceType`, `reviewStatus`, `notes`, `asOfDate`, and `staleness`. A changed or new value gets a fresh `fact(...)` (`REPORTED` / `UNVERIFIED`). A prior that is not a usable ProvencancedFact is not carried and is not repaired into one.

Optional facts omitted from the write keep a usable prior wrapper. A first insert with no prior state still builds fresh wrappers. A prior-date row is not a carry source.

Identical corroboration does not rewrite stored numbers. When no rewrite runs, prior wrappers stay byte-stable. An existing same-date value V against a batch value W ≠ V stays `CONFLICTING_FINANCIAL_FACTS` / `REVIEW_REQUIRED`. No auto winner. No majority. No last-approved-wins. R0 C6 stays in place. PERMISSION duplicate-ref skip stays in place.

A same-date snapshot with no FinancialState row gets the missing state created from the snapshot's own canonical numbers. Those wrappers are fresh, because there is no prior state to carry. The conflicting batch value is not written into that new state.

## Snapshot honesty

FinancialSnapshot stays plain numeric columns. This chunk does not invent per-field snapshot provenance. A snapshot write, including a column update when one happens, does not store `sourceType`, `reviewStatus`, `staleness`, or a provenance object on that row.

## HOLD follow-ons (not this PR)

- **DEFINED_TERM** — upsert last-write-wins and both candidates promoted.
- **DOCUMENT_RELATIONSHIP** — successive overwrite of type/supersession by approved-candidate order.
- **Reconciliation amplifier** — same-source duplicate skip. No majority invent.
- **EXTERNAL_INPUT_REQUIREMENT** — always creates a new row.
- **Covenant activation** — create-per-candidate.
- **permissionRelationship** — always create.
- **PERMISSION duplicate-ref skip** — preserved. Do not weaken.

Merge stays HOLD until Architect COMMENT, Trust (+IR), Notes/Cert, tip CI SUCCESS on this soft gate, and COO MERGE AUTHORIZED.
