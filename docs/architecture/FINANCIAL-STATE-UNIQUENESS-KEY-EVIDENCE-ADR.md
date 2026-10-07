# ADR: FinancialState uniqueness key evidence (HOLD)

**Status:** ACCEPTED (after COO PASS; docs-only architecture lock)
**Date:** 2026-10-07
**Base:** main @ `b0453bda9b84e1f501224d0b4a3984841b31a844` (#101 Snapshot unique)
**Does not authorize:** FinancialState `@@unique`; P3-FFC2d; `createManualFinancialState` product rem; promotion always-create; identity-filter rem; live/paid cert; NS-4 S3
**Related:**
- `lib/financial-identity.ts` HOLD
- `docs/p3-ffc2-review-audit-identity-checklist.md` / `docs/p3-ffc2b-write-side-financial-identity-checklist.md` / `docs/p3-ffc2c-financial-snapshot-unique-checklist.md`
- `docs/generalized-financial-analytics-architecture.md` §C.1 / §T
- `docs/architecture/EVIDENCE-PACKET-VERSIONING-ADR.md` (pattern only)
- Plan FROZEN sha256 `ef7b6c574deafdff0e53aa13c3df944db60b50aa306ed3fbff47134eee15b664`
- Ranking `PHASE-3-KEEP-WORKING-AFTER-101` FROZEN sha256 `9754322b0824b813f6f569942fe21126968021d5de43d4a7cde0762658ca47fb`

This ADR locks **tip evidence and unlock conditions**. It does not choose a uniqueness key. Soft gates; invent-absence forever; **IMPLEMENTED ≠ CERTIFIED**; **PINNED_OFFLINE ≠ CERTIFIED**.

---

## 1. Context

P3-FFC2c (#101) landed `FinancialSnapshot @@unique([companyId, asOfDate])`. A second Snapshot row for that pair is refused by the database. `FinancialState` did not receive that constraint. State remains multi-row capable for a given `(companyId, asOfDate)`.

`lib/financial-identity.ts` and the FFC2 / FFC2b / FFC2c checklists already HOLD State `@@unique`: State has `periodType` and `scope`. Do not invent a uniqueness shape that ignores those columns. The helper itself does not pick a key. It counts rows for the caller's existing `where` (0 → UNKNOWN, 1 → that row, >1 in the exact set or the latest `asOfDate` cohort → AMBIGUOUS).

A deeper scan at tip `b0453bda…` shows the remaining ambiguity is **call-site disagreement**, not a missing line that already names one agreed key:

1. Schema carries `periodType` and `scope` and has no `FinancialState @@unique`.
2. Live identity resolves use `(companyId, asOfDate)` or `{ companyId }` only. They do not filter `periodType` or `scope`.
3. Design doc §T names query-by-`(companyId, asOfDate, periodType)` without naming `@@unique` and without `scope`. §C.1 includes both `periodType` and `scope`.
4. Writes hardcode `periodType: "ACTUAL"` and `scope: "CONSOLIDATED"`. Those are write defaults, not proof that uniqueness is the Snapshot 2-column key.

Snapshot's landed pair is not a template for State. Copying it would ignore columns the HOLD already names.

---

## 2. Evidence table

Cite table at tip `b0453bda9b84e1f501224d0b4a3984841b31a844`. Paths and filter shapes match the ranking scan. Line numbers were re-read on that tip.

| Call site | Filter / write shape | Includes `periodType`? | Includes `scope`? |
|---|---|---|---|
| `prisma/schema.prisma` `FinancialState` ~L1376–1414 | Columns `periodType` + `scope` present; **no** `@@unique`; indexes `(companyId, asOfDate)` + `(companyId, periodType)` only | schema yes | schema yes |
| `lib/financial-identity.ts` header | HOLD: do not invent uniqueness ignoring `periodType`/`scope` | n/a (helper uses caller's `where`) | n/a |
| `lib/onboarding/financial.ts` upsert exact resolve ~L501–503 | `where: { companyId, asOfDate }`, `selection: "exact"` | **no** | **no** |
| `lib/financial-core-db/adapter.ts` `loadFinancialState` ~L118–120 | `where: { companyId, asOfDate: { lte }, effectiveDateFilter }`, `latest-cohort` | **no** | **no** |
| `lib/dashboard-service.ts` `resolveDefaultAsOfDate` ~L172–174 | `where: { companyId }`, `latest-cohort` | **no** | **no** |
| `lib/covenant-overview-service.ts` `resolveDefaultAsOfDate` ~L65–67 | `where: { companyId }`, `latest-cohort` | **no** | **no** |
| `createManualFinancialState` / upsert creates ~L271–272, L580–581, L598–599 (`lib/onboarding/financial.ts`) | Writes hardcode `periodType: "ACTUAL"`, `scope: "CONSOLIDATED"` | write default only | write default only |
| `app/[companyId]/onboarding/activate/actions.ts` ~L18 | `findFirst({ where: { companyId }, orderBy: asOfDate desc })` — **silent pick**; not on FFC2 reader list | **no** | **no** |
| Design doc `docs/generalized-financial-analytics-architecture.md` §T ~L661 | Query-by-`(companyId, asOfDate, periodType)` (table rationale) — **no** `@@unique` named; **omits `scope`** | design 3-tuple | **omits** |
| Design doc §C.1 ~L89–99 | Model includes both `periodType` and `scope: EntityScopeRef` | yes | yes |

**Thinning verdict:** Call sites do not agree on one identity tuple. Schema forbids ignoring `periodType` / `scope`. Design §T's 3-tuple omits `scope`. Identity resolves are a date pair or company-only. Write defaults are not a uniqueness key. **P3-FFC2d State `@@unique` remains HOLD.**

---

## 3. Decision

**FinancialState `@@unique` remains HOLD.** This ADR documents the disagreement. It does not select 2-column, 3-column, or 4-column uniqueness.

### Forbidden invent shapes

A later chunk must not treat any of these as already chosen by this ADR or by the current tip:

| Shape | Why it is not an invent-safe residual today |
|---|---|
| 2-column `(companyId, asOfDate)` | Ignores `periodType` and `scope`. Copies the Snapshot key the HOLD already forbids copying onto State. |
| 3-column `(companyId, asOfDate, periodType)` | Ignores `scope`. Matches the §T query rationale and contradicts the schema HOLD and §C.1, which include `scope`. |
| 4-column `(companyId, asOfDate, periodType, scope)` | Not positively named by a tip checklist or HOLD line as the residual to land. Schema presence of the columns is not that naming. |

No other composite is implied. Effective-dating (`effectiveFrom` / `effectiveTo`) is part of the `loadFinancialState` filter and is not, by this ADR, folded into a unique.

### Unlock conditions

These conditions are normative for **future FFC2d eligibility**. Meeting them is not claimed here. This ADR does **not** authorize FFC2d, a schema rem, or a migration.

FFC2d may be stamped only when all three are true on the tip being stamped:

1. Tip identity call sites **agree** on one composite filter that includes every column the chosen unique would constrain.
2. A tip checklist or HOLD line **positively names** that composite as the residual to land.
3. The design-doc query shape is reconciled with `scope`: either `scope` is in the unique, or a tip-grounded rationale says `scope` is orthogonal / unconstrained. That rationale must be tip-cited. It must not be invented in the rem.

Until then, readers and writers stay as cited. 0 / 1 / >1 semantics stay as implemented. Duplicate State inserts remain possible. Ambiguous cohorts stay fail-closed where the identity helper is already wired. The activate `findFirst` stays a silent pick outside the FFC2 reader list; wiring it is not authorized here.

### Honesty bindings (unchanged)

- Fail closed. Invent-absence forever.
- No invented `discoveryId`s or `sectionRef`s. No stratified pin or matrix cell. No silent winner, majority, or last-approved-wins.
- Do not weaken FFC1, FFC1b, FFC2, FFC2b, or FFC2c. Preserve P3-R0 C6. PERMISSION duplicate-ref skip stays.
- No live/paid §7.5(j). No related-series A/C. No NS-4 Slice 3. No SFG-1. No Rem H. No Ask ANSWER / KPI theater. No sealed A/B reopen.
- No CERTIFIED claim. This docs lock is not certification credit. A green soft-gate run is not certification credit.
- This chunk does not clear the post-#101 invent-safe implement exhaustion for FFC2d, createManual, or the promotion trio.

---

## 4. Consequences

**Positive:** A future FFC2d cannot claim an "obvious" 2-column, 3-column, or 4-column State key without tip convergence on the unlock conditions above.

**Negative:** State duplicate inserts remain possible until a later invent-safe chunk that satisfies those conditions. This ADR does not close that gap.

**Forbidden:** Treating this ADR as a GRANT for a schema rem, a Prisma migration, `createManualFinancialState` product behavior, promotion always-create, or an identity-filter change.

---

## 5. Out of scope

- P3-FFC2d implementation, any FinancialState `@@unique`, and any migration
- `createManualFinancialState` product rem
- Promotion always-create for EXTERNAL_INPUT, covenant activation, and permissionRelationship
- `app/[companyId]/onboarding/activate/actions.ts` `findFirst` rem
- MODEL_CONTRACT diagnostic code
- Matrix, pins, stratified certification, SFG-1, NS-4 Slice 3, WITH_BUILDERS, Chunk A, OAuth path-filter
- Reader or writer `where` changes, including inventing a `periodType` or `scope` filter

---

## 6. Acceptance

- This ADR is the architecture lock at `docs/architecture/FINANCIAL-STATE-UNIQUENESS-KEY-EVIDENCE-ADR.md` with Status **ACCEPTED** after COO PASS.
- The evidence table matches tip `b0453bda9b84e1f501224d0b4a3984841b31a844`.
- Decision is HOLD. Unlock conditions are listed. FFC2d is not authorized.
- Optional pointers are docstring / markdown only: `lib/financial-identity.ts` header, and the FinancialState `@@unique` HOLD lines on the FFC2, FFC2b, and FFC2c checklists. They do not change 0 / 1 / >1 behavior.
- No `prisma/schema.prisma` change. No migration. No identity resolve change. IMPLEMENTED ≠ CERTIFIED.
