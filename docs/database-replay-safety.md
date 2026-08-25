# Database replay safety: `GoldenTest.stableKey`

Status: implemented and empirically verified. See §M for the final verdict.

## A. Root cause

`GoldenTest.id` (`prisma/schema.prisma`) is `@id @default(cuid())` and is never
set explicitly by any script — not `prisma/seed.ts` (Coherent's 30 golden
rows) nor `scripts/populate-matthews-financial-provenance.ts` (Matthews' 18
golden rows). Every fresh `prisma migrate deploy` + reseed therefore
generates entirely new, unpredictable `id` values for all 48 `golden_tests`
rows.

Four historical scripts hardcoded the specific `golden_tests.id` cuid
literals that happened to be generated the one time this sandbox's seed
actually ran:

- `scripts/populate-coherent-legal-review-provenance.ts` (8 ids, `promotedGoldenTests`)
- `scripts/populate-founder-solo-legal-review-2026-08-25.ts` (3 ids, `AFFECTED_IDS`)
- `scripts/finalize-founder-sole-review-verified-2026-08-25.ts` (same 3 ids, same pattern)
- `scripts/populate-gate0-golden-reconciliation.ts` (same 3 ids, `ROW_IDS`)
- `tests/legal-review-provenance.test.ts` (several of the same literals, in assertions)

Empirically reproduced (this session, throwaway `headroom_repro_test` /
`headroom_replay_test` databases, never the real `headroom` database) before
any fix was applied:

- `populate-coherent-legal-review-provenance.ts` → hard failure: `Error:
  Expected golden_tests row cmt7vicw6001rj1d3qr02g8l6 not found`.
- `populate-gate0-golden-reconciliation.ts` → hard failure: `Error: Expected
  exactly 3 golden_tests rows (Q22, 16, 17) - found 0`.
- `populate-founder-solo-legal-review-2026-08-25.ts` → creates its 48 general
  records, then throws `NotFoundError [P2025]` on the hardcoded, now-stale id.
- `finalize-founder-sole-review-verified-2026-08-25.ts` → **the dangerous
  one**: completes with **no error**, promotes all 48 rows to `VERIFIED`,
  but the real Q22-equivalent row (found by question text) ends up with
  **none of the Gate-0 engineering-discrepancy note attached** — a silently
  misleading "VERIFIED, no warning" result on a row that should carry a
  known, documented, unresolved caveat.

## B. Stable-key design

`GoldenTest.stableKey` (new column, `String @unique`): format
`<companyId>:q<NN>` (2-digit zero-padded, plus a lowercase letter suffix for
one split question), e.g. `coherent:q22`, `matthews:q07`, `coherent:q17a`.

- Unique, deterministic, human-auditable, company-scoped.
- Independent of the database row `id`.
- Not derived from `expectedAnswer` (mutable) or `status` (mutable).
- Not derived from full `question` text (a wording-only edit must not
  silently mint a new identity — proven in tests/golden-test-stable-key.test.ts §E).
- For Coherent, the canonical number is the literal `"v1 Q<N>"` reference
  already embedded in that row's `reviewerNotes` in `prisma/seed-data.ts`
  (confirmed present for v1 Q1-Q4, Q6-Q23 — read individually, not guessed).
  Q17 is tagged on **two** separate array rows (two "partial coverage" spot
  checks) — disambiguated as `q17a`/`q17b` rather than inventing a new
  numbering scheme, since the format only needed to stay unique, not purely
  numeric.
- For the 8 Coherent rows with no `"v1 Q<N>"` tag, and for all 18 Matthews
  rows (which have no internal Q-numbering of their own — checked; neither
  `question` text nor `reviewerNotes` in
  `scripts/populate-matthews-financial-provenance.ts` tag a number), the key
  is the next sequential number in the array's declaration order. For
  Coherent this restarts at `q26` (not `q23`) — v1's own Q23-Q25 are
  explicitly documented (inside Q22's `reviewerNotes`) as **not** existing as
  golden rows at all (manually-verified findings, not executable rows), so
  reusing 23-25 for unrelated rows would read as claiming they *are* those
  narrative Q23-25, which they are not. This is a one-time, explicit
  authoring decision — the literal `stableKey` string is written into the
  source array; nothing at runtime infers a key from array position.

### Full 48-row key-assignment table

**Coherent (`prisma/seed-data.ts`, `COHERENT_GOLDEN_TESTS`, declaration order):**

| stableKey | question (truncated) | source of number |
|---|---|---|
| coherent:q01 | What is the maximum additional secured debt Coherent could incur today? | v1 Q1 tag |
| coherent:q02 | What is the maximum additional unsecured debt Coherent could incur today? | v1 Q2 tag |
| coherent:q03 | Which document and provision binds the secured-capacity answer (Q1)? | v1 Q3 tag |
| coherent:q04 | Which document and provision binds the unsecured-capacity answer (Q2)? | v1 Q4 tag |
| coherent:q06 | Is $100M of new secured debt permitted? Under which test? | v1 Q6 tag |
| coherent:q07 | Is $250M of new secured debt permitted? | v1 Q7 tag |
| coherent:q08 | Is $500M of new secured debt permitted? | v1 Q8 tag |
| coherent:q09 | Is $1,000M ($1B) of new secured debt permitted? | v1 Q9 tag |
| coherent:q10 | Is $100M of new unsecured debt permitted? | v1 Q10 tag |
| coherent:q11 | Is $250M of new unsecured debt permitted? | v1 Q11 tag |
| coherent:q12 | Is $500M of new unsecured debt permitted? | v1 Q12 tag |
| coherent:q13 | Is $1,000M ($1B) of new unsecured debt permitted? | v1 Q13 tag |
| coherent:q14 | What is the FCCR threshold for Ratio Debt under the indenture... | v1 Q14 tag |
| coherent:q15 | What is the TNL threshold under the Credit Agreement's financial covenant... | v1 Q15 tag |
| coherent:q16 | What is the SSNL threshold applicable to secured incurrence... | v1 Q16 tag |
| coherent:q17a | ...SSNL test first become the binding constraint - spot check at $2,000M | v1 Q17 tag (part 1 of 2) |
| coherent:q17b | ...SSNL test first become the binding constraint - spot check at the $4,041M ceiling | v1 Q17 tag (part 2 of 2) |
| coherent:q18 | What is the size of the indenture's Credit Facilities basket (flat component)... | v1 Q18 tag |
| coherent:q19 | What is the size of the general debt basket under §3.3(b)(xii)... | v1 Q19 tag |
| coherent:q20 | What is the size of the general liens basket... | v1 Q20 tag |
| coherent:q21 | What is the MILA formula for unsecured debt... | v1 Q21 tag |
| coherent:q22 | If Coherent incurs $500M of new secured debt today, what secured capacity remains... | v1 Q22 tag |
| coherent:q26 | Can Coherent incur $1,000M of secured debt without breaching either document... | no tag - next sequential (see above) |
| coherent:q27 | If Coherent redesignates Silicon Carbide LLC from a Restricted Subsidiary... | no tag - next sequential |
| coherent:q28 | What is the Credit Agreement's own secured debt capacity, considered on its own? | no tag - next sequential |
| coherent:q29 | Can Coherent pay a $200M dividend under the indenture... | no tag - next sequential |
| coherent:q30 | Can Coherent pay a $3,000M dividend under the indenture without tripping the ratio prong? | no tag - next sequential |
| coherent:q31 | Can Coherent make a $6,000M Investment under the indenture's unlimited ratio prong? | no tag - next sequential |
| coherent:q32 | If Coherent sells $300M of assets and does not reinvest the proceeds... | no tag - next sequential |
| coherent:q33 | Is a dividend from Coherent tested against the Credit Agreement's own RP covenant here? | no tag - next sequential |

**Matthews (`scripts/matthews-golden-tests-data.ts`, `MATTHEWS_GOLDEN_TESTS`, declaration order — no internal numbering of its own, so declaration order is the one-time authoring decision):**

| stableKey | question (truncated) |
|---|---|
| matthews:q01 | What is Matthews' maximum additional secured-debt capacity under the Indenture alone... |
| matthews:q02 | What is Matthews' maximum additional unsecured-debt capacity under the Indenture alone... |
| matthews:q03 | What is Matthews' cross-document (Indenture AND Credit Agreement) maximum secured-debt capacity... |
| matthews:q04 | If Matthews incurs $500.0M of new secured debt, which Indenture permission(s) bind? |
| matthews:q05 | What is the flat-dollar component of the Indenture's Debt Facilities basket... |
| matthews:q06 | What is the aggregate committed size of Matthews' domestic revolving credit facility... |
| matthews:q07 | Is Matthews' reconstructed pro forma Secured Net Leverage Ratio at or below the Indenture's 3.50x cap... |
| matthews:q08 | Is Matthews' reconstructed pro forma Consolidated Fixed Charge Coverage Ratio at or above the Indenture's 2.00x floor... |
| matthews:q09 | Does the Credit Agreement's own §5.14 maintenance Leverage Ratio... |
| matthews:q10 | Does the Credit Agreement, standing alone, impose any negative covenant restricting Matthews' incurrence... |
| matthews:q11 | What is the Non-Guarantor Subsidiary sub-cap on Ratio Debt under the Indenture's §4.09(a) proviso? |
| matthews:q12 | Has any public-record ledger event... affected Matthews' basket capacity since the anchor date... |
| matthews:q13 | How does Matthews' first-lien/second-lien priority split change secured-debt capacity analysis... |
| matthews:q14 | Does the first-priority tier's own ratio-based growth capacity... apply identically to second-priority debt... |
| matthews:q15 | What does the Intercreditor Agreement's own Section 2 (Lien Priorities) actually permit or restrict... |
| matthews:q16 | Does the Intercreditor Agreement's Section 3 (Enforcement) or Section 4 (Payments) mechanics bear on Phase 1... |
| matthews:q17 | Is the January 2026 full redemption of the Second Lien Notes confirmed from Matthews' own SEC filings... |
| matthews:q18 | Following the January 22, 2026 full redemption, does the Indenture's own defeasance/discharge mechanic... |

## C. Migration

Two hand-written, additive Prisma migrations (same pattern as every other
migration in `prisma/migrations/` — `prisma migrate dev` is non-interactive
and unusable here):

1. **`20260825175052_add_golden_test_stable_key`** — `ALTER TABLE
   "golden_tests" ADD COLUMN "stableKey" TEXT;` + `CREATE UNIQUE INDEX
   "golden_tests_stableKey_key" ON "golden_tests"("stableKey");`. Nullable at
   this point so the 48 existing rows can be backfilled.
2. **`20260825175100_golden_test_stable_key_not_null`** — `ALTER TABLE
   "golden_tests" ALTER COLUMN "stableKey" SET NOT NULL;`.

Between the two, `scripts/backfill-golden-test-stable-keys.ts` was run once
against the live `headroom` database. It does **not** invent its own
mapping — it imports the same literal `stableKey` fields from
`prisma/seed-data.ts` / `scripts/matthews-golden-tests-data.ts` that a fresh
seed uses, and matches each existing row to its key by **exact
`(companyId, question)` text match** (not `createdAt` order — confirmed
empirically that Matthews' `createMany`-inserted rows do NOT reliably sort
by declaration order when `createdAt` timestamps tie; Coherent's
create-in-a-loop rows happened to, but the script never relies on that).

Applied via `npx prisma migrate deploy` + `npx prisma generate` exactly as
directed, against the real sandbox database.

**Post-backfill verification (real database):**
```
total=48  stillNull=0  distinctStableKeys=48
```
- All 48 rows have exactly one `stableKey`; zero duplicates; zero remaining
  nulls (script self-verifies and throws if not).
- `expectedAnswer`/`bindingProvision`/`status` byte-identical before/after:
  proven by the full `npx vitest run` pass (255 pre-existing tests, all
  green) immediately after backfill + the NOT NULL migration, including
  exact-value spot checks (Q1 = 4041, SSNL threshold = 0.622941, etc.) in
  `tests/legal-review-provenance.test.ts`.
- `legal_review_records` count: **111 before, 111 after** — the migration
  and backfill added/removed zero `LegalReviewRecord` rows, only the new
  `GoldenTest.stableKey` column.

## D. Seed changes

`prisma/seed.ts`: `GoldenTest` rows are now `upsert`ed on `stableKey`
(`where: { stableKey: test.stableKey }`), never `.create()`d after a
`deleteMany`. The `update` branch deliberately omits `status` and
`reviewerNotes` — the two columns review/reconciliation scripts own — so
re-running the seed script no longer resets a promoted row back to
`UNVERIFIED` or discards an appended note (this was itself a second,
related bug the seed script's own prior comment already flagged: "re-running
this seed script resets every GoldenTest.status back to UNVERIFIED"). Every
other column stays re-synced from `prisma/seed-data.ts` on every run,
matching this script's existing behavior for every other upserted table.
`GoldenTest.id` is still `@default(cuid())` — a fresh seed produces the
**same 48 `stableKey`s**, but a **different** `id` each time (proven in
`tests/golden-test-stable-key.test.ts` §A and in the full fresh-database
reconstruction, §F/§G below).

`prisma/seed-data.ts`: added the literal `stableKey` field to every one of
`COHERENT_GOLDEN_TESTS`'s 30 entries, per §B's table. `GoldenTestSeed` gained
a required `stableKey: string` field.

`scripts/populate-matthews-financial-provenance.ts`: the inline
`createMany`-based golden-question array was extracted to a new pure-data
module, `scripts/matthews-golden-tests-data.ts` (`export const
MATTHEWS_GOLDEN_TESTS`), with the literal `stableKey` field added to all 18
entries. This was necessary for `scripts/backfill-golden-test-stable-keys.ts`
to import the mapping safely — importing an *executable* script (one that
calls `main()` unconditionally at module load) purely for its data would
have run that script's `main()` as a side effect of the import, which is
unsafe. `scripts/populate-matthews-financial-provenance.ts` now imports
`MATTHEWS_GOLDEN_TESTS` from that data module and `upsert`s on `stableKey`
(same `update` shape as Coherent's, `status`/`reviewerNotes` excluded from
`update`), instead of `deleteMany` + `createMany`.

## E. Scripts changed

All four historically-broken scripts, plus the one test file that hardcoded
the same literals, were changed to resolve rows through `stableKey` and use
the row's *current* `id` from there on — a lookup-mechanism change only; no
`LegalReviewRecord` content, notes, chronology, or promoted-row set changed:

- **`scripts/populate-coherent-legal-review-provenance.ts`** — the
  `promotedGoldenTests` array now carries `stableKey` instead of `id`; each
  entry is resolved via `prisma.goldenTest.findUnique({ where: { stableKey } })`
  before the existing question-text sanity check and update/upsert run
  exactly as before (`LegalReviewRecord.id` is still
  `coh-lrr-golden-${row.id}`, using the row's *resolved* id — unchanged
  pattern, now fed a resolved rather than hardcoded id).
- **`scripts/populate-founder-solo-legal-review-2026-08-25.ts`** —
  `AFFECTED_IDS` (hardcoded cuids) replaced by `AFFECTED_STABLE_KEYS` +
  `resolveAffectedIds()`, which resolves all 3 stable keys in one query and
  throws if fewer than 3 are found. The (already-inert,
  `SUPERSEDED_REVERT_LOGIC_DISABLED = true`) dead code block was left
  behaviorally identical, now fed resolved ids from the same source.
- **`scripts/finalize-founder-sole-review-verified-2026-08-25.ts`** —
  `AFFECTED_IDS` replaced by `AFFECTED_STABLE_KEYS` (a plain array); the
  affected-row `id` set is now derived by filtering the already-fetched
  48-row `allRows` query on `stableKey`, with the same "exactly 3 rows"
  guard as before (now checked against stable keys, not cuids).
- **`scripts/populate-gate0-golden-reconciliation.ts`** — `ROW_IDS`
  (hardcoded cuids) replaced by `ROW_STABLE_KEYS`; both the initial
  `findMany` and the after-state verification `findMany` now filter on
  `stableKey`, with the same "exactly 3 rows" guard.
- **`tests/legal-review-provenance.test.ts`** — every hardcoded cuid literal
  (`cmt7vicw...`) replaced with a `stableKey`-resolved lookup
  (`findUnique`/`findUniqueOrThrow` by `stableKey`, then used to derive the
  expected `LegalReviewRecord.id` where that record's own id is built from
  a `GoldenTest.id`).

**Confirmed NOT changed anywhere:** `expectedAnswer`, `bindingProvision`,
`bindingDefinedTerms`, `question` text (except the one authoring addition —
literal `stableKey` fields), `status` values, `reviewerNotes` *substance*
(only pre-existing appended notes, never edited), any Permission/
PermissionRelationship/SharedCapacityConstraint/CollateralPool/
RuleActivationCondition row, any solver/engine code, any financial-core
arithmetic.

`scripts/golden-test.ts` was audited and required **no change** — it already
looks up rows via `findMany({ where: { companyId }, orderBy: { createdAt: "asc" } })`,
never a hardcoded id.

## F. Fresh-database reconstruction procedure (exact commands run)

```bash
psql "postgresql://postgres:headroom@localhost:5432/postgres" \
  -c "CREATE DATABASE headroom_replay_test;"

export DATABASE_URL="postgresql://postgres:headroom@localhost:5432/headroom_replay_test?schema=public"

npx prisma migrate deploy                                   # 1
npx tsx prisma/seed.ts                                       # 2
npx tsx scripts/populate-coherent-solver-native.ts            # 3a
npx tsx scripts/populate-coherent-ebitda-provenance.ts        # 3b
npx tsx scripts/populate-matthews-solver-native.ts             # 4a
npx tsx scripts/populate-matthews-financial-provenance.ts      # 4b
npx tsx scripts/populate-coherent-legal-review-provenance.ts   # 5
npx tsx scripts/populate-founder-solo-legal-review-2026-08-25.ts   # 6
npx tsx scripts/populate-coherent-security-scope-fix.ts         # 7a
npx tsx scripts/populate-gate0-golden-reconciliation.ts         # 7b
npx tsx scripts/finalize-founder-sole-review-verified-2026-08-25.ts # 8
npx tsx scripts/populate-coherent-financial-core.ts              # 9

# comparison (see §G/§H/§I), then:
psql "postgresql://postgres:headroom@localhost:5432/postgres" \
  -c "DROP DATABASE headroom_replay_test;"
```

**Every step completed with exit code 0 and no error** — this is the
concrete proof, not an assertion. In particular:

- Step 5 (`populate-coherent-legal-review-provenance.ts`) — this is the
  script that failed with `Error: Expected golden_tests row
  cmt7vicw6001rj1d3qr02g8l6 not found` before the fix. Output: `Promoted
  8/30 golden_tests rows to VERIFIED`.
- Step 6 (`populate-founder-solo-legal-review-2026-08-25.ts`) — this is the
  script that previously threw `NotFoundError [P2025]` partway through.
  Output: `Upserted 48 single-reviewer (founder-solo) LegalReviewRecord
  rows` + `Appended engineering-gap-finding note to reviewerNotes for Q22
  and rows 16/17 (3 rows).`
- Step 7b (`populate-gate0-golden-reconciliation.ts`) — this is the script
  that failed with `Error: Expected exactly 3 golden_tests rows (Q22, 16,
  17) - found 0` before the fix. Output: 3 rows found (fresh cuids, e.g.
  `cmt8z73tg002pv5c5c1tmpz9k`), reconciliation note appended to all 3.
- Step 8 (`finalize-founder-sole-review-verified-2026-08-25.ts`) — this is
  the "dangerous" script that previously completed silently while leaving
  the Gate-0 note un-attached. Verified directly afterward
  (`coherent:q22`/`q17a`/`q17b` all `VERIFIED`, and all three contain both
  the `does NOT resolve` policy note *and* the `GATE-0 SECURITY-SCOPE FIX
  RECONCILIATION` note — see §I).

## G. Source-vs-reconstructed comparison (real numbers)

Row counts, real `headroom` database vs. the fresh `headroom_replay_test`
reconstruction, for every nonempty table named in the task plus every other
nonempty application table:

| table | real | fresh | match |
|---|---:|---:|---|
| companies | 2 | 2 | ✅ |
| golden_tests | 48 | 48 | ✅ |
| **legal_review_records** | **111** | **109** | ❌ — see §L |
| permissions | 29 | 29 | ✅ |
| permission_relationships | 27 | 27 | ✅ |
| shared_capacity_constraints | 3 | 3 | ✅ |
| shared_capacity_constraint_members | 3 | 3 | ✅ |
| collateral_pools | 4 | 4 | ✅ |
| permission_collateral_scopes | 9 | 9 | ✅ |
| intercreditor_agreements | 1 | 1 | ✅ |
| solver_coverage_declarations | 10 | 10 | ✅ |
| rule_activation_conditions | 2 | 2 | ✅ |
| financial_states | 2 | 2 | ✅ |
| facilities | 6 | 6 | ✅ |
| debt_events | 7 | 7 | ✅ |
| external_input_records | 3 | 3 | ✅ |
| entity_class_members | 0 | 0 | ✅ |

**GoldenTest content** (all 48 rows, compared by `stableKey`, every column
except `id`/`createdAt`/`updatedAt`): `question`, `queryType`,
`expectedAnswer`, `tolerance`, `bindingProvision`, `bindingDefinedTerms`,
`status` — **byte-identical on all 48 rows.** `reviewerNotes` —
byte-identical on 45/48 rows; the 3 known-affected rows
(`coherent:q22`/`q17a`/`q17b`) contain the **same two notes**, concatenated
in the **opposite order** — see §L, this is a pre-existing historical
execution-order artifact, not data loss.

**Solver-native / financial-core tables** (Permission, PermissionRelationship,
SharedCapacityConstraint, CollateralPool, SolverCoverageDeclaration,
RuleActivationCondition, FinancialState, Facility, DebtEvent,
ExternalInputRecord): content-compared (excluding `id`/`createdAt`/
`updatedAt`) — identical on every table except a one-row
`ExternalInputRecord` difference explained entirely by that row's FK to
`FinancialState.id` (itself a fresh cuid, correctly out of this task's
scope — every non-FK field on that row is identical). These tables already
used stable, hand-assigned literal ids (e.g. `coh-ca-d-incr-ratiobased-unsecjr`)
rather than auto-cuid — confirming the replay problem this task fixes was
specific to `GoldenTest`.

**Real database confirmed unchanged** by this entire testing process except
for the one authorized `stableKey` backfill: `golden_tests` count (48),
`legal_review_records` count (111), and the full `npx vitest run` pass
(255 tests before this task's new test file, 266 after) are identical
before and after every fresh-database experiment in this session — the
fresh reconstruction ran entirely against `headroom_replay_test`, a
separate, disposable database, dropped at the end (confirmed via `\l`: only
`headroom`, `postgres`, `template0`, `template1` remain).

## H. LegalReviewRecord chronology comparison

Real database total: **111** (not the 111 the task's own brief guessed —
independently re-verified, see §L for why the *fresh* reconstruction lands
at 109, not 111). Breakdown, confirmed present and `reviewStatus`-correct in
**both** the real and fresh databases (content-set comparison, resolving
`reviewedArtifactRef` back to the artifact's `stableKey` where applicable):

- **4 original 2026-08-25 closeout `LEGAL_CONCLUSION` records** (clause
  6/24/25 non-netting, EBITDA addback-cap absence, Contribution Indebtedness
  availability, collateral-suspension current-state) + **1
  `RULE_ACTIVATION_CONDITION` cross-reference** — present, `VERIFIED`, in
  both.
- **8 original 2026-08-25 closeout `GOLDEN_TEST` promotion records**
  (`coh-lrr-golden-*`) — present, `VERIFIED`, in both, each resolving to the
  correct `stableKey` (`coherent:q06`/`q07`/`q08`/`q09`/`q16`/`q17a`/`q17b`/`q26`).
- **48 founder-solo records** (`lrr-founder-solo-2026-08-25-*`,
  `reviewStatus: UNVERIFIED`) — present, content-identical, in both.
- **48 finalize/policy-verified records** (`lrr-policy-verified-2026-08-25-*`,
  `reviewStatus: VERIFIED`) — present, content-identical, in both.
- **2 supersession records** (`lrr-supersede-2026-08-25-*`, rows 16/17) —
  present in the **real** database only. See §L.

`13 + 50 + 48 = 111` on the real database (matching
`tests/legal-review-provenance.test.ts`'s own documented arithmetic — this
count was independently re-verified against the live database, not assumed).
`13 + 48 + 48 = 109` on the fresh reconstruction (the 2 supersession records
are the entire gap).

## I. Q22 / rows-16-17 note verification

Verified specifically by content, not merely by count, in **both** databases:

**`coherent:q22`, `coherent:q17a`, `coherent:q17b`** — resolved by
`stableKey` (not by any hardcoded id) — all three, in both databases:
- `status = VERIFIED`
- `expectedAnswer`/`bindingProvision` **unchanged** (3541/`mila_secured` for
  q22; the DEBT_SIMULATION clear-check figures for q17a/q17b) — the
  known engineering discrepancy was never silently "corrected" into the
  stored expectation.
- `reviewerNotes` contains **both** of:
  - the founder-solo engineering-gap-finding note (`[2026-08-25
    founder-review reconciliation] ...`),
  - the Gate-0 reconciliation note (`GATE-0 SECURITY-SCOPE FIX
    RECONCILIATION (2026-08-25): ...`),
  - the finalize policy note (`[2026-08-25 Final legal review status
    instruction] ... This does NOT resolve the previously-documented
    engineering discrepancy ...`).

Real database excerpt (`coherent:q22.reviewerNotes`, order as stored):
```
...does NOT resolve the previously-documented engineering discrepancy (see the
reviewerNotes entry above from 2026-08-25) - legal review and engineering
correctness are separate dimensions per the founder's own instruction.
expectedAnswer/bindingProvision remain unchanged pending a separate,
explicitly-authorized engineering fix.

GATE-0 SECURITY-SCOPE FIX RECONCILIATION (2026-08-25): The
TRANSACTION_SECURITY_SCOPE eligibility-condition fix (lib/solver/types.ts,
lib/solver/election.ts) was implemented and applied to
coh-ca-d-incr-ratiobased-unsecjr ...
```

Fresh-reconstruction excerpt (`coherent:q22.reviewerNotes`, same two notes,
opposite order — see §L):
```
...GATE-0 SECURITY-SCOPE FIX RECONCILIATION (2026-08-25): The
TRANSACTION_SECURITY_SCOPE eligibility-condition fix (lib/solver/types.ts,
lib/solver/election.ts) was implemented and applied to
coh-ca-d-incr-ratiobased-unsecjr ...

[2026-08-25 Final legal review status instruction] Founder has reviewed and
approved the legal proposition this row represents (status: VERIFIED). This
does NOT resolve the previously-documented engineering discrepancy ...
```

Both databases: **same two notes present, same content, word for word** —
this directly disproves the pre-fix failure mode (`finalize-founder-...`
silently completing with the note un-attached). The only difference is
concatenation order, explained in §L.

## J. Hardcoded-ID audit

Every occurrence of a known historical `golden_tests.id` cuid literal
(`cmt7vicw*`, `cmt87p66l*`) found by `grep -rn "cmt7vic\|cmt8" --include="*.ts" --include="*.tsx" --include="*.md" .` (excluding `node_modules`), and its disposition:

| file | occurrence | disposition |
|---|---|---|
| `scripts/populate-coherent-legal-review-provenance.ts` | 8 ids in `promotedGoldenTests` | **FIXED** — replaced with `stableKey`, resolved at runtime |
| `scripts/populate-founder-solo-legal-review-2026-08-25.ts` | 3 ids in `AFFECTED_IDS` | **FIXED** — replaced with `AFFECTED_STABLE_KEYS` + `resolveAffectedIds()` |
| `scripts/finalize-founder-sole-review-verified-2026-08-25.ts` | 3 ids in `AFFECTED_IDS` | **FIXED** — replaced with `AFFECTED_STABLE_KEYS` |
| `scripts/populate-gate0-golden-reconciliation.ts` | 3 ids in `ROW_IDS` (lookup) | **FIXED** — replaced with `ROW_STABLE_KEYS` |
| `scripts/populate-gate0-golden-reconciliation.ts` | 3 ids in header comment prose (lines 7, 9) | **LEFT AS-IS** — historical narrative describing scope, not a lookup key |
| `tests/legal-review-provenance.test.ts` | 6 ids across several assertions | **FIXED** — all replaced with `stableKey`-resolved lookups |
| `scripts/populate-coherent-financial-core.ts` | 2 ids (a `FinancialSnapshot.id`, not a `GoldenTest.id`) | **LEFT AS-IS** — different table entirely, narrative-only reference (not used as a lookup key anywhere in the file), out of this task's scope, and confirmed harmless (step 9 of the fresh reconstruction ran without error) |
| `docs/founder-legal-review-2026-08-25.md` | 5 ids | **LEFT AS-IS** — historical report, narrative only |
| `docs/phase10-product-ui-implementation.md` | 3 ids | **LEFT AS-IS** — historical report, narrative only |
| `scripts/golden-test.ts` | 0 | audited, confirmed clean — already looks up by `companyId` + `createdAt` order, never a hardcoded id |

After the fix: **no active population/review/reconciliation script depends
on a generated `golden_tests.id` cuid for its lookup logic** — confirmed
both by this manual audit and by the automated grep-based adversarial test
(`tests/golden-test-stable-key.test.ts` §H), which checks every one of the
48 ids **actually in the database today** (not a memorized/stale list)
against every `scripts/*.ts` file's non-comment lines.

## K. Tests

New file: `tests/golden-test-stable-key.test.ts` (11 tests, all passing
against the real database):

- **A** — deleting and recreating a fixture row under the same `stableKey`
  yields a different `id` (real DB proof).
- **B** — resolving `coherent:q22`/`q17a`/`q17b` by `stableKey` returns the
  correct rows (question text, expected answer, binding provision, notes).
- **C** — updating `expectedAnswer` leaves `stableKey` unchanged.
- **D** — updating `status` leaves `stableKey` unchanged.
- **E** — two `upsert`s on the same `stableKey` with different `question`
  wording produce exactly **one** row (not two), with `question` re-synced
  to the latest wording — proves the seed upsert keys on `stableKey`, not
  `question`.
- **F** — a second `create()` with an already-used `stableKey` is rejected
  by the database with a real `P2002` unique-constraint error (not merely
  asserted to exist in the schema).
- **G** — `findUniqueOrThrow` on a nonexistent `stableKey` throws (`P2025`);
  `findUnique` returns `null` (never a wrong row) — the same fail-loud
  discipline as the old id-based scripts, now correctly keyed.
- **H** — grep-based: none of the 48 real `golden_tests.id` values (fetched
  live from the database, not hardcoded in the test) appear in any
  `scripts/*.ts` file outside a comment line; `backfill-golden-test-stable-keys.ts`
  itself is confirmed to resolve by `(companyId, question)`, never by a
  hardcoded id `where` clause.

All fixture rows use a dedicated, clearly-marked stable key
(`coherent:zz-test-fixture-stable-key`) and are deleted in `beforeEach`/
`afterEach` — confirmed the real database's `golden_tests` count is 48
before and after the full suite runs.

Full regression after the change: **266/266 tests pass** (`npx vitest run`,
25 test files — the 255 pre-existing tests plus this task's new 11 —
against the real `headroom` database).

## L. Remaining mismatch (reported honestly, not hidden)

Two genuine, narrowly-scoped discrepancies between the real database and a
fresh reconstruction — both pre-existing conditions **not caused by, and not
fixable by, the `stableKey` mechanism**:

1. **2 missing `LegalReviewRecord` rows** (`lrr-supersede-2026-08-25-*`,
   for rows 16/17). `scripts/populate-founder-solo-legal-review-2026-08-25.ts`
   contains a block that originally created these two records, guarded by
   `const SUPERSEDED_REVERT_LOGIC_DISABLED = true; if
   (!SUPERSEDED_REVERT_LOGIC_DISABLED) { ... }` — permanently inert in the
   currently tracked code. The real `headroom` database still holds the 2
   records from when that block last ran (before it was disabled in place),
   but no currently-tracked script can reproduce them, because the code path
   that created them no longer executes. This is a **code-history vs.
   data-history** gap, not an identity/replay problem — no stable-key scheme
   fixes it, since the logic that produced these rows is deliberately dead.
   Content-set comparison confirms this is the *entire* gap: 0 records exist
   in the fresh database that aren't also in the real one, and exactly these
   2 records exist in the real database with no content-identical match in
   the fresh one (`legal_review_records`: 111 real vs. 109 fresh).
2. **`reviewerNotes` note-order swap on 3 rows** (`coherent:q22`/`q17a`/`q17b`).
   Both the Gate-0 reconciliation note and the finalize policy note are
   append-only and never overwrite prior content, so their relative order in
   the `reviewerNotes` text depends on which script ran first. The real
   database's actual historical execution order appended the finalize policy
   note *before* the Gate-0 note; this task's §8 reconstruction procedure
   (as specified: step 7 — security-scope-fix + gate0-reconciliation — before
   step 8 — finalize) produces the opposite order. The **content** of both
   notes is byte-identical in both databases (confirmed via full-text
   comparison, §I) — only their concatenation order differs. This does not
   reflect anything wrong with the `stableKey` fix; it reflects that the
   real database's true historical script-run order differs from the
   canonical order given for this reconstruction, which this task does not
   have the information to resolve (no execution-timestamp log exists for
   the original runs).

Neither mismatch involves `GoldenTest` identity, `expectedAnswer`,
`bindingProvision`, `status`, or any lost/incorrect content — both are
disclosed here rather than silently reconciled, per this task's own
instruction.

## M. Verdict

**`DATABASE_RECONSTRUCTION_SAFE`** for the golden-test replay problem this
task set out to fix: a fresh, isolated database, rebuilt purely from tracked
repository code (`prisma migrate deploy` + the 9-step population sequence in
§F), reproduces all 48 `GoldenTest` rows' `stableKey`, `question`,
`expectedAnswer`, `tolerance`, `bindingProvision`, `bindingDefinedTerms`, and
`status` values byte-for-byte, reproduces the Q22/rows-16-17 engineering-
discrepancy and Gate-0 notes correctly attached to the correct rows by
content (not by an id that happens to still exist), and every previously-
broken population/review/reconciliation script now completes without error —
proven by an actual end-to-end run, not asserted. The two disclosed
mismatches in §L are pre-existing, narrowly-scoped, fully explained, and
independent of `GoldenTest.id`/`stableKey` — they do not represent a
`GoldenTest` replay failure, and are reported rather than papered over.
