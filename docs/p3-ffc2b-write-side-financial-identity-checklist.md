# P3-FFC2b reviewer checklist

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. **PINNED_OFFLINE ≠ CERTIFIED.** A green `p3-r0-soft-gate` run is not certification credit. Coding authorization is not merge authorization.

FROZEN sha256 `2358d77f0b00591fd99c2451701455fd72c20a3422ca0c962c98c0c4be21a06d`. Base tip `7d882bde4d875d933ba2f65b0da718927197774b` (main after #99 P3-FFC2).

Write-side same-date resolve in `upsertFinancialFactsForDate` uses `resolveCanonicalFinancialIdentity` with `selection: "exact"` and `where: { companyId, asOfDate }`. `lib/financial-identity.ts` 0 / 1 / >1 semantics are unchanged. FinancialSnapshot `@@unique([companyId, asOfDate])` landed in P3-FFC2c. FinancialState `@@unique` stays HOLD.

## Permanent reviewer questions

1. **WHEN ZERO SAME-DATE ROWS EXIST, DOES THE WRITE TREAT IDENTITY AS UNKNOWN AND KEEP THE ABSENT PATH?**

   Yes. Snapshot and State resolutions of UNKNOWN are absent. A batch that does not cover every required field is skipped. Nothing is fabricated as 0. A prior-date snapshot is not a seed (P3-R0 C6). A batch that covers all eight required fields creates the same-date rows.

2. **WHEN EXACTLY ONE SAME-DATE ROW EXISTS, DOES THE WRITE USE THAT UNIQUE ROW?**

   Yes. UNIQUE uses that row. Identical corroboration does not rewrite stored numbers. A snapshot with no state row still gets the missing state created from the snapshot's own canonical numbers, with fresh wrappers. A same-date state with no snapshot is still rewritten through the carry-aware builder.

3. **WHEN MORE THAN ONE SNAPSHOT OR STATE ROW CLAIMS THE SAME `(companyId, asOfDate)`, DOES THE WRITE FAIL CLOSED WITH NO SILENT PICK AND NO REWRITE?**

   Yes. Either table AMBIGUOUS fails the whole batch. Every fact in that call is `applied: false` with a skipReason that includes `FINANCIAL_IDENTITY_AMBIGUOUS`. Neither table is rewritten. No majority. No last-row. No insertion-order collapse.

4. **UNDER A UNIQUE SAME-DATE ROW, DOES W ≠ V STILL FAIL CLOSED AS `CONFLICTING_FINANCIAL_FACTS`?**

   Yes. Applied honesty stays. The canonical value is not overwritten. A corroborating sibling can still apply. PERMISSION duplicate-ref skip stays in place.

5. **UNDER A UNIQUE SAME-DATE STATE, DOES A REWRITE STILL CARRY UNCHANGED PROVENANCE WRAPPERS?**

   Yes. Unchanged numeric values keep their prior wrappers. A changed value gets a fresh `fact(...)`. FinancialSnapshot stays plain columns. This chunk does not invent per-field snapshot provenance.

## HOLD follow-ons (not this PR)

- FinancialState `@@unique`. State has `periodType` and `scope`. Do not invent a uniqueness shape that ignores those columns. Evidence lock: `docs/architecture/FINANCIAL-STATE-UNIQUENESS-KEY-EVIDENCE-ADR.md` (HOLD; does not authorize FFC2d). FinancialSnapshot `@@unique([companyId, asOfDate])` landed in P3-FFC2c. The migration aborts when a pair already has more than one Snapshot row. It does not collapse those rows.
- `createManualFinancialState` always-create duplicate risk. The Snapshot half now fails at the database on a duplicate pair. Wizard product semantics stay HOLD.
- EXTERNAL_INPUT always-create. Covenant activation create-per-candidate. permissionRelationship always-create.
- Reconciliation amplifier.
- Matrix / pins / stratified certification. SFG-1. Simulate. NS-4 Slice 3. Ask theater. Invented discoveryIds.

Merge stays HOLD until Architect COMMENT, Trust (+IR), Notes/Cert, tip CI SUCCESS on this soft gate, and COO MERGE AUTHORIZED.
