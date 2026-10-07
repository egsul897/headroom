# P3-FFC2c reviewer checklist

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. **PINNED_OFFLINE ≠ CERTIFIED.** A green `p3-r0-soft-gate` run is not certification credit. Coding authorization is not merge authorization.

FROZEN sha256 `6cf204ae0d83c28e455eaceb9e4ba6aa3c0458378e01e771c2be21cce4fbfcbb`. Base tip `2b98f3ec7891289618f191b760d485e1cb3e1e62` (main after #100 P3-FFC2b).

`FinancialSnapshot` has `@@unique([companyId, asOfDate])`. The migration counts pairs with more than one row and aborts. It does not remove rows. `FinancialState` has no `@@unique`. `lib/financial-identity.ts` 0 / 1 / >1 semantics are unchanged.

## Permanent reviewer questions

1. **DOES ONE `(companyId, asOfDate)` SNAPSHOT INSERT SUCCEED?**

   Yes. U1 inserts one row and reads that row back.

2. **DOES A SECOND SNAPSHOT FOR THE SAME PAIR FAIL WITHOUT STORING A SECOND ROW?**

   Yes. U2 rejects the second insert with Prisma `P2002`. The first row is unchanged.

3. **DO DISTINCT DATES AND DISTINCT COMPANIES STILL INSERT?**

   Yes. U3 keeps two dates for one company. U4 keeps one date across two companies.

4. **DOES FINANCIALSTATE STILL ALLOW TWO ROWS FOR THE SAME `(companyId, asOfDate)`?**

   Yes. U5 reads the `FinancialState` model and finds no `@@unique`. Two State rows for the same pair insert. State still has `periodType` and `scope`. This chunk does not invent a State key.

5. **WHEN PRE-MIGRATION DUPLICATE SNAPSHOTS EXIST, DOES THE MIGRATION ABORT AND DOES THE WRITE STILL FAIL CLOSED?**

   Yes. The migration `RAISE`s when a grouped count is greater than one. U6 runs that precheck against seeded duplicate rows and expects the abort. `upsertFinancialFactsForDate` returns `FINANCIAL_IDENTITY_AMBIGUOUS` for every fact in the batch. Neither row is rewritten. No majority. No last-row. No insertion-order collapse.

6. **UNDER THE UNIQUE BASELINE, DO FFC1 AND FFC1b STAY IN PLACE?**

   Yes. A disagreeing value is `CONFLICTING_FINANCIAL_FACTS` and does not overwrite the canonical row. A corroborating sibling can still apply. An unchanged State wrapper is carried. A changed value gets a fresh wrapper. FinancialSnapshot stays plain columns. The PERMISSION duplicate-ref skip stays in place.

## HOLD follow-ons (not this PR)

- FinancialState `@@unique`. State has `periodType` and `scope`. Do not invent a uniqueness shape that ignores those columns.
- `createManualFinancialState` always-create. The Snapshot half now fails at the database on a duplicate pair. Wizard product semantics stay HOLD.
- EXTERNAL_INPUT always-create. Covenant activation create-per-candidate. permissionRelationship always-create.
- Reconciliation amplifier.
- Matrix / pins / stratified certification. SFG-1. Simulate. NS-4 Slice 3. Ask theater. Invented discoveryIds. Snapshot per-field provenance.

Merge stays HOLD until Architect COMMENT, Trust (+IR), Notes/Cert, tip CI SUCCESS on this soft gate, and COO MERGE AUTHORIZED.
