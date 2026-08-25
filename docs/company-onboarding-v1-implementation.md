# Headroom — Company Onboarding v1: Phase 2 Implementation

**Status: IMPLEMENTED.** This document reports code actually written, migrated, tested, and executed against a real Postgres database — not a design or plan. It covers Phase 2: everything from "candidates exist in `ExtractionCandidate`" (where Phase 1 stopped, see `docs/document-onboarding-pipeline-foundation.md`) through "the company is live in the generalized product UI" — review workspace, transactional promotion, post-promotion coverage-gate evaluation, financial onboarding, debt-instrument-to-facility mapping, compliance-certificate confirmation, golden-test proposal generation, and the `/companies/new` + `/[companyId]/onboarding` wizard.

The product goal this completes: a new company can now be onboarded through the product itself — UPLOAD → PARSE → EXTRACT → REVIEW → APPROVE → PROMOTE → ACTIVATE — with **zero company-specific source code**. Proven end-to-end by a real acceptance test (§H), not asserted.

---

## A. Baseline

Captured before any Phase 2 code was written (after merging Phase 1's `claude/headroom-scaffold-covenant-engine-jrijk8` commits into this worktree — see §N for why that merge was necessary):

| Check | Result |
|---|---|
| `prisma migrate status` | 14 migrations, up to date |
| `prisma validate` | valid |
| Full vitest suite | **310/310 passing** (32 test files) |
| `tsc --noEmit` | clean |
| ESLint | clean |
| `npx tsx scripts/golden-test.ts coherent` | 26 passed / 3 failed / 1 flagged / 0 errored |
| `npx tsx scripts/golden-test.ts matthews` | 2 passed / 4 failed / 10 flagged / 2 errored |

## B. Schema changes

One additive migration: `prisma/migrations/20260825200000_add_candidate_review_events/migration.sql`, hand-written (this sandbox's `prisma migrate dev` is non-interactive-hostile — same established pattern as every prior migration in this repo) and applied with `prisma migrate deploy`.

**New model** (additive, zero rows for Coherent/Matthews as of this migration):
- `CandidateReviewEvent` — one row per review DECISION ever made on an `ExtractionCandidate` (`action: APPROVE|EDIT|REJECT|REVIEW_REQUIRED`, `previousStatus`/`newStatus`, `editedValue?`, `note?`, `reviewedBy?`, `createdAt`). `ExtractionCandidate.reviewedAt`/`reviewedBy` only ever hold the LATEST decision; this table is the full audit trail the review workspace surfaces (`details` panel on every candidate card) — never mutated or deleted, a later decision on the same candidate is always a new row.

**Zero other schema changes.** No column was added to, removed from, or retyped on any existing table. `ExtractionCandidate.promotedAt`/`promotedToId` (unused columns Phase 1 left for this phase) are now written by `lib/onboarding/promotion.ts`.

## C. Review workspace (`lib/onboarding/review.ts`, `app/[companyId]/onboarding/review/**`)

```ts
reviewCandidate({ candidateId, action: "APPROVE"|"EDIT"|"REJECT"|"REVIEW_REQUIRED", editedValue?, note?, reviewedBy })
```

- Every call runs in one `prisma.$transaction`: updates the candidate's `reviewStatus`/`reviewerEditedValue`/`reviewedAt`/`reviewedBy`, AND inserts a `CandidateReviewEvent` row — both or neither.
- `proposedValue` is **never** written by this function — only `reviewerEditedValue`, validated on EDIT against the exact same per-kind zod schema `lib/extraction/schemas.ts` already defines (`VALUE_SCHEMA_BY_KIND`), so an invalid edit is rejected with a clear error, never silently coerced.
- `reviewedBy` is **required** and never fabricated (`MissingReviewerError` if blank). This app has no auth/session concept (confirmed — no `lib/auth.ts` or equivalent exists anywhere in the repo), so the review UI's `ReviewerNameField` (`components/ReviewerNameField.tsx`) is a plain, required text input the human reviewer types their own name/email into, remembered per-browser via `localStorage` as a convenience only.
- A candidate that has already been promoted (`promotedAt` set) refuses any further review decision — "a promoted candidate's decision is final," proven in the acceptance test (§H).
- `getCandidatesForReview(companyId)` / `getReviewProgress(companyId)` / `getReviewHistoryForCompany(companyId)` / `getChunkContext(chunkId)` are the review workspace's entire data layer — company-agnostic, no branching.

**UI** (`app/[companyId]/onboarding/review/page.tsx`): organized by `ExtractionCandidateKind`, each candidate card shows reviewStatus, confidence, source document/section/page, a click-through link to `app/[companyId]/onboarding/review/chunk/[chunkId]` (the full `DocumentChunk` text, not just the trimmed `sourceExcerpt`), the proposed value as a key/value table, any reviewer edit (proposedValue kept visibly separate), rationale, and the full review-history audit trail. Review actions are plain HTML `<form>`s calling server actions (`app/[companyId]/onboarding/review/actions.ts`) — Approve / Reject / Flag for review are one click each; Edit opens a `<details>` panel with the current value pre-filled as JSON (one generic editor across all 8 kinds, rather than eight bespoke per-kind forms — a deliberate v1 scope decision, see §M).

## D. Transactional promotion (`lib/onboarding/promotion.ts`)

`promoteCompanyCandidates(companyId, asOfDate?)` is **the only code in this codebase that writes to `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/`CollateralPool`/`PermissionCollateralScope`/`RuleActivationCondition`/`ExternalInputRecord`/`DefinedTerm`/`Document` FROM an `ExtractionCandidate`**, and only ever for candidates with `reviewStatus IN (APPROVED, EDITED)` — confirmed by the acceptance test's `reviewCandidate` call sites and by direct inspection: `promoteCompanyCandidates`'s only query is `findMany({ where: { reviewStatus: { in: ["APPROVED","EDITED"] } } })`.

**Two-phase design** — a pure planning pass (decides exactly what to create/update/skip and why) executed entirely inside one `prisma.$transaction(async (tx) => { ... })` call. "Skip" is a planning-time business decision (documented in the returned `skipped[]` array with a reason), never a partial-transaction failure; if the transaction throws unexpectedly, Postgres rolls back every write in it. This is what makes promotion genuinely all-or-nothing.

**Fail-closed, by construction, not by convention**: a `PERMISSION` candidate's EFFECTIVE value (`reviewerEditedValue ?? proposedValue`) is read; if `modelingStatus === "KNOWN_NOT_MODELED"`, it is **excluded from promotion entirely** — even if a human explicitly APPROVED it (approving a gap-placeholder candidate means "yes, this really is an unmodeled gap," not "model it"). The acceptance test exercises exactly this case: the §2.3 gap candidate is APPROVED by a reviewer, then confirmed still un-promoted with `promotedToId: null` and a `skipped[]` entry reading `"modelingStatus=KNOWN_NOT_MODELED - excluded from promotion per fail-closed policy"`.

**`*Ref` cross-reference resolution** (per `lib/extraction/schemas.ts`'s own header comment): `permissionRef`/`fromPermissionRef`/`toPermissionRef`/`memberPermissionRefs` are resolved to real `Permission.id` via a map built from (a) every `Permission` promoted so far in this batch, plus (b) every `Permission` already promoted in a prior pass for this company (matched by its stored `code`, always set to the candidate's own `permissionRef` at promotion time) — so a `RELATIONSHIP`/`COLLATERAL_SCOPE`/`SHARED_CONSTRAINT`/`ACTIVATION_CONDITION` candidate can reference a permission from an earlier run, not just this batch. An unresolvable ref is skipped with a specific reason, never silently dropped.

**`DOCUMENT_RELATIONSHIP`** candidates update the `Document` row itself (`type`, `supersedesDocumentId` resolved by matching the AI's `supersedesDocumentRef` against this company's other document names/ids, `effectiveFrom`/`effectiveTo`) and set `typeConfirmedByUser`/`amendmentRelationshipConfirmedByUser: true` — this **is** the amendment/operative-document-set human confirmation step the brief requires (§M has an honest note on why this is folded into the generic review-and-edit flow rather than a bespoke page).

**`EXTERNAL_INPUT_REQUIREMENT`** candidates are promoted to an `ExternalInputRecord` **placeholder** — `value: null`, `reviewStatus: "UNVERIFIED"`, always, regardless of the candidate's own review outcome. Promoting the *requirement* (an AI-identified need for a certified input) is never conflated with *certifying* a value — that is deliverable 6's job (§F).

**Never auto-VERIFIED**: every promoted `Permission.reviewStatus` (the `DefinedTermStatus` data-fidelity dimension) starts `UNVERIFIED`, never inferred from the review action. `GoldenTest.status` is likewise never written as `VERIFIED` by any code in this phase (§G).

### Post-promotion coverage-gate evaluation

Uses `lib/solver/coverage.ts`'s **existing** `classifyCompanyCoverage`/`determineCoverage` predicate — no new gap logic was written. For every `(documentId, grantType)` scope that now has at least one promoted `MODELED` `Permission`, promotion writes a `SolverCoverageDeclaration` (`secured` + `unsecured` for `DEBT_INCURRENCE`, `secured` only for `LIEN` — mirroring `scripts/populate-coherent-solver-native.ts`'s own established convention, since `determineCoverage` scopes purely by `(documentId, grantType)`, never by side). `isComplete` is `true` only when **zero** non-`REJECTED`, non-promoted `PERMISSION` candidates remain for that document (a deliberately conservative, per-document — not per-grantType — gap check, documented in code). `Company.onboardingStatus` is then set: `ACTIVE_WITH_LIMITATIONS` if any scope is not `SOLVER_NATIVE` (or zero scopes exist yet), `ACTIVE` otherwise. Never `ACTIVE` while a real, undismissed gap remains; never blocked/errored either — `ACTIVE_WITH_LIMITATIONS` is a preferred, non-error terminal state, exactly as specified.

Promotion is **idempotent/incremental**: only candidates with `promotedAt IS NULL` are considered, so re-running it after further review activity promotes only what's newly ready, proven directly in the acceptance test (a second call with nothing new approved promotes exactly 0).

## E. Financial onboarding (`lib/onboarding/financial.ts`, `app/[companyId]/onboarding/financials/**`)

Manual entry only — no ERP integration, per explicit scope. `createManualFinancialState` writes **both** a `FinancialState` row (`lib/financial-core/**`, wrapped in `ProvencancedFact`/`fact()` — reused verbatim, never reinvented, `sourceType: "REPORTED"`, `reviewStatus: "UNVERIFIED"`) **and** a legacy `FinancialSnapshot` row from the same form submission.

**Real discovery, not assumed**: this codebase currently has TWO parallel financial models that both remain live consumers for a solver-native company. `lib/covenant-engine.ts`'s `loadCompanyCovenantData` — which `computeRemainingCapacityAfterDebtIncurrence`, and therefore every Overview/Capacity capacity figure `lib/dashboard-service.ts` exposes, depends on — still hard-requires a legacy `FinancialSnapshot` row (`throw new Error("No financial snapshot found...")` if absent), a fact confirmed empirically by querying Coherent's own data: it carries **one row in each table**, not one-or-the-other. Writing only `FinancialState` (the newer model) would have left an onboarded company's capacity pages silently broken. This was caught by the acceptance test itself (§H) before it reached the report, not discovered after the fact.

## F. Debt-instrument-to-facility mapping (deliverable 5) + compliance-certificate confirmation (deliverable 6)

`suggestPermissionMatches(companyId, instrumentName)` ranks every promoted `Permission` by a cheap, dependency-free token-overlap similarity against the permission's `action` text, `code`, and governing document name — surfaced to a human in `app/[companyId]/onboarding/facilities/page.tsx` as checkboxes (pre-checked above a score threshold, never auto-applied) for confirm/correct, never exact-name-matched only. `createFacilityWithMapping` writes the `Facility` row with the human-confirmed `originatingPermissionIds`.

`certifyExternalInputRecord(externalInputRecordId, value, asOfDate, sourceRef?)` is the **only** place a promoted `EXTERNAL_INPUT_REQUIREMENT` placeholder (§D) is ever given a real value and marked `reviewStatus: "VERIFIED"` (the `DefinedTermStatus` data-fidelity dimension — a human confirmed a real figure against its certificate source — explicitly **not** the separate `LegalReviewStatus`/`GoldenTestStatus` "founder legal review" dimension, per `prisma/schema.prisma`'s own documented distinction). Extraction alone never counts as certified.

## G. Golden-test proposal generation (`lib/onboarding/golden-tests.ts`)

`generateGoldenTestProposals(companyId, asOfDate)` proposes cross-document secured/unsecured debt-capacity golden rows by **actually running** `computeRemainingCapacityAfterDebtIncurrence` (the same function `lib/dashboard-service.ts`'s Overview page and `scripts/golden-test.ts`'s own solver-native-aware `DEBT_SIMULATION`/`remainingAfterAmount` branch both call) — `expectedAnswer` is always a real, freshly-computed figure, never guessed. A side whose cross-document capacity isn't determinable (a genuine coverage gap) is proposed as an `OUT_OF_SCOPE` row instead, flagged for human review rather than silently skipped or fabricated as 0.

Uses `GoldenTest.stableKey` exactly as `docs/database-replay-safety.md` specifies — format `<companyId>:q<NN>`, continuing this company's own existing sequence, resolved via a content-derived "slot" tag embedded in `reviewerNotes` so a re-run **updates** the same row instead of minting a new key every call (a real bug found and fixed while building the acceptance test — see §H). Every proposed row starts `status: "UNVERIFIED"` — this function never writes `VERIFIED`; that status is reserved for the founder's own legal review, per `components/ui.tsx`'s `LEGAL_REVIEW_STATUS_EXPLANATION`, and no code in this phase ever writes it.

## H. Synthetic-company acceptance test (`tests/onboarding/synthetic-acceptance.test.ts`, 13/13 passing)

Exercises the **full real workflow**, zero company-specific code, against a company id (`synthco-onboarding-acceptance`) that is neither `coherent` nor `matthews`:

`create company (ONBOARDING)` → `uploadAndChunkDocument` (a generic synthetic `.txt` credit-agreement fixture — Article/Section markers, a `"Term" means` EBITDA definition, two dollar-anchored Lien/Indebtedness baskets, one deliberate ordinary-course Indebtedness mention with no dollar figure to exercise the coverage-gap path) → `runExtractionForDocument` via `SyntheticExtractionProvider` → `reviewCandidate` (approve, **edit** a threshold then re-approve by a second reviewer, reject) → `promoteCompanyCandidates` → post-promotion coverage-gate evaluation → `createManualFinancialState` → `suggestPermissionMatches`/`createFacilityWithMapping` → `certifyExternalInputRecord` → `generateGoldenTestProposals` → `getCompanyDashboard`/`getDocumentDetails`/`listCompanies` (the **exact same** `lib/dashboard-service.ts` functions every other company's pages call).

**Real bugs found and fixed while building this test** (proof the test is doing real work, not rubber-stamping):
1. `resolveEffectiveValue` in promotion originally checked `reviewStatus === "EDITED"` to decide whether to read `reviewerEditedValue` — a candidate EDITED then re-APPROVED by a second reviewer was silently reverting to the AI's original `proposedValue` on promotion. Fixed to always prefer `reviewerEditedValue` when present, independent of current status.
2. Financial onboarding wrote only `FinancialState`, not the legacy `FinancialSnapshot` — `loadCompanyCovenantData` threw immediately. Fixed as described in §E.
3. Golden-test proposal generation minted a brand-new `stableKey` on every call instead of updating the same slot. Fixed via the slot-tag mechanism in §G.

**What the test proves, concretely** (assertions, not narration): the KNOWN_NOT_MODELED gap candidate is excluded from promotion even when APPROVED; `onboardingStatus` transitions `ACTIVE_WITH_LIMITATIONS → ACTIVE` exactly when the human resolves (rejects) the gap and promotion is re-run; a promoted candidate refuses further review; `reviewedBy` is required and never fabricated; `proposedValue` is never overwritten by an edit; promotion is idempotent; the company appears in `getCompanyDashboard` with real, non-`undefined` `remainingCapacity` on both sides once fully solver-native.

## I. Real-precedent acceptance test (`scripts/onboarding-precedent-acceptance.ts`)

**Precedent source located and used**: `docs/coherent-credit-agreement-amendment-reconstruction.md` — verbatim operative Credit Agreement language for Coherent (a real, already-onboarded company), itself reconstructed from actual SEC-filed executed amendments (accession numbers cited in that document's own §A table). This is the only raw-prose real-contract source text anywhere in this repo; Coherent's and Matthews' own onboarding was performed by an engineer reading the executed filings and hand-populating `scripts/populate-*-solver-native.ts` directly — there is no other candidate source. No new real company was researched or onboarded to satisfy this requirement.

The script builds a synthetic `.txt` "document" from that quoted language (§6.01(k) General Debt Basket, §6.02(kk) parallel lien basket, the Cash-Capped Incremental Facility, and the §6.11(a)/(b) TNL/ICR maintenance covenants — using the **real, unmodified SEC dollar notation** "$786,000,000"/"$1,428,000,000", not this repo's own "$X million" fixture shorthand), runs it through the real pipeline via `SyntheticExtractionProvider` (the only provider runnable in this sandbox — no `ANTHROPIC_API_KEY`), and compares the extracted `PERMISSION` candidates against Coherent's own real, already-modeled `Permission` rows (`scripts/populate-coherent-solver-native.ts`) as ground truth. Writes only to a clearly test-labeled company id (`coherent-precedent-test`), cleaned up at the end; the real `coherent` company is read-only ground truth throughout, never touched (confirmed — §L).

**Results** (4 ground-truth items: 3 dollar-anchored baskets + 1 pure-ratio covenant):

| Metric | Result |
|---|---|
| Recall (real items found at all) | **75%** (3/4) |
| Precision (of what was extracted, how much maps to a real item) | **100%** (3/3) |
| Threshold value numerically correct | **0/3** |
| `formulaType` correct | **0/3** |
| `grantType` correct | **2/3** |
| Citation (top-level section number) correct | **3/3** |

**Findings, reported honestly**:
- **False negative, with no gap flag either**: the §6.11(a)/(b) TNL/ICR maintenance covenants (4.25x, 2.50x — no dollar sign at all) are invisible to `SyntheticExtractionProvider` end to end — `extractPermissions` requires a dollar-anchored figure, and `extractCoverageGaps` *also* requires the literal keyword "Indebtedness"/"Lien" to fire, which a ratio-covenant sentence doesn't contain. A real maintenance covenant silently produces **zero** candidates of any kind. This is a genuine blind spot of the regex-only synthetic provider specifically (the pipeline architecture itself has no such limitation — a real LLM-based provider would be expected to recognize a maintenance-covenant clause without requiring those literal keywords; unverified in this sandbox).
- **Unit-scale bug, real SEC notation**: `SyntheticExtractionProvider`'s dollar regex only scales the "$X million"/"$X billion" shorthand this repo's own fixtures use; real SEC-filed "$786,000,000" notation passes through unscaled, producing `thresholdValue: 786000000` against a real value of `786` ($ millions) — a 10⁶× error on every dollar-anchored basket found.
- **Formula-type collapse**: the provider always emits `FLAT_AMOUNT`; it has no pattern recognizing "greater of $X and Y% of Adjusted EBITDA" as `GREATER_OF_FLAT_OR_PCT_EBITDA`, so the percentage-of-EBITDA growth component is silently dropped from every basket it does find.
- **grantType miss**: §6.02(kk)'s own real text — "**Liens** securing Indebtedness..." — was classified `DEBT_INCURRENCE`, not `LIEN`. Root cause, confirmed by inspection: the provider's `/\blien\b/i` regex requires the word boundary immediately after "lien," which the plural "Lien**s**" fails (word characters on both sides of the boundary) — this repo's own synthetic fixtures happen to always use the singular "Lien," so this bug was never exercised until real legal prose (which favors the plural) was run through it.
- **Sub-clause citation loss**: the chunker (`lib/extraction/chunk.ts`) only recognizes numbered `SECTION` headers, not lettered sub-clauses like `(k)`/`(kk)` — every candidate under one `SECTION` shares that section's top-level citation, with no sub-clause-level precision.

None of these are pipeline-architecture defects — every one is a specific, fixable limitation of the deliberately-simple regex-based `SyntheticExtractionProvider`, exactly the reason `AnthropicExtractionProvider` exists as the real production path (unverified end-to-end from this sandbox — no `ANTHROPIC_API_KEY` available, same posture Phase 1 already established).

## J. Live-data regression (Coherent/Matthews, before/after)

Confirmed via direct query against the real database, both before writing any Phase 2 code and after every acceptance-test run in this session:

| table | coherent | matthews | matches `docs/database-replay-safety.md` baseline |
|---|---:|---:|---|
| `permissions` | 22 | 7 | 29 total ✓ |
| `permission_relationships` | 19 | 8 | 27 total ✓ |
| `shared_capacity_constraints` | 2 | 1 | 3 total ✓ |
| `golden_tests` | 30 | 18 | 48 total ✓ |
| `legal_review_records` | 75 | 36 | 111 total ✓ |

Only `coherent` and `matthews` exist in the `companies` table after every test run in this session — every synthetic/precedent test company (`synthco-onboarding-acceptance`, `coherent-precedent-test`) is fully cleaned up (`Company.delete` cascades every child row via the schema's existing `onDelete: Cascade` chain) via each test/script's own `beforeAll`/`afterAll`/end-of-`main()` cleanup, confirmed empirically, not merely intended.

## K. Regression suite — final state

| Check | Result |
|---|---|
| `npx prisma validate` | valid |
| `npx prisma migrate status` | 15 migrations, up to date |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx vitest run` | **323/323 passing** (33 test files — 310 baseline + 13 new) |
| `npx tsx scripts/golden-test.ts coherent` | 26 passed / 3 failed / 1 flagged / 0 errored — **unchanged** |
| `npx tsx scripts/golden-test.ts matthews` | 2 passed / 4 failed / 10 flagged / 2 errored — **unchanged** |
| `npm run build` | succeeds — all 21 routes compile, including 8 new onboarding routes |

## L. Hard constraints — confirmed

- **Company/scenario agnosticism**: zero `companyId === "..."`-shaped branching anywhere in `lib/onboarding/**` or any new `app/[companyId]/onboarding/**` route — every function takes `companyId` as a plain parameter (grepped and manually audited; the acceptance test itself is the strongest proof, exercising every function against an id that is neither `coherent` nor `matthews`).
- **AI never becomes the solver**: `lib/onboarding/promotion.ts` is the only writer of real `Permission`/etc. rows from an `ExtractionCandidate`, gated to `APPROVED`/`EDITED` only — no auto-approve path exists anywhere (searched: `reviewStatus:` is never set to `APPROVED`/`EDITED` by any code outside `lib/onboarding/review.ts`'s own human-invoked `reviewCandidate`).
- **Fail closed**: `KNOWN_NOT_MODELED` permissions are excluded from promotion even when approved (§D); coverage declarations default to incomplete/absent, which `lib/solver/coverage.ts`'s own existing fallback logic (unmodified) resolves to `NOT_TESTED`, never a fabricated `SOLVER_NATIVE`.
- **Non-mutating scenarios**: `lib/scenario-runner.ts` was not touched by this phase at all.
- **VERIFIED-label discipline**: no code in `lib/onboarding/**` ever writes `GoldenTestStatus.VERIFIED` or `LegalReviewStatus.VERIFIED`. `Permission.reviewStatus`/`ExternalInputRecord.reviewStatus` (the separate `DefinedTermStatus` data-fidelity dimension) DO reach `VERIFIED` via `certifyExternalInputRecord` — a human confirming a figure against its certificate source, the same established meaning `DefinedTerm.status` already carries elsewhere, explicitly not the legal-review dimension (§F).
- **Transactional promotion**: one `prisma.$transaction` call per `promoteCompanyCandidates` invocation (§D).
- **Coherent/Matthews untouched**: confirmed by §J's row-count comparison and by the unchanged golden-test harness results (§K).

## M. Deviations from the brief, and why

- **No separate amendment-confirmation page**: the brief asks for "a human confirmation step for `supersedesDocumentId`/`effectiveFrom`/`effectiveTo`." This is implemented as part of the generic review-and-edit flow on the `DOCUMENT_RELATIONSHIP` candidate (§D) rather than a bespoke wizard page — the reviewer can edit `supersedesDocumentRef`/`effectiveFrom`/`effectiveTo` via the same raw-JSON editor every other candidate kind uses, and approving it sets `amendmentRelationshipConfirmedByUser: true`. This satisfies the requirement functionally but with less guided UX than a dedicated page (e.g. a document picker) would give; a follow-up phase could build a friendlier dedicated control without changing the underlying promotion logic.
- **Single generic JSON editor for EDIT**, not eight bespoke per-kind forms. A deliberate v1 scope decision given the number of candidate kinds; server-side validation is identical either way (the same `VALUE_SCHEMA_BY_KIND` zod schemas), so correctness is not weakened, only discoverability/UX for a non-technical reviewer.
- **Coverage-gap check is per-document, not per-(document, grantType)**: §D's `evaluatePostPromotionCoverage` marks a document's declarations incomplete if ANY `PERMISSION` candidate for that document (regardless of `LIEN` vs `DEBT_INCURRENCE`) remains unpromoted — a conservative, documented simplification rather than a finer-grained check. This only ever makes `ACTIVE_WITH_LIMITATIONS` more likely, never `ACTIVE` when a real gap exists — fail-closed direction, not fail-open.
- **Golden-test proposal generation only covers cross-document secured/unsecured capacity** (2 rows per company), not a broader battery. `scripts/golden-test.ts`'s only solver-native-aware `queryType` is `DEBT_SIMULATION` (confirmed by reading its own switch statement — `PROVISION_CAPACITY`/`DOCUMENT_CAPACITY`/`CROSS_DOCUMENT_CAPACITY` all read the LEGACY `computeCovenantPosition`, which has no `solverContext` parameter at all), so a solver-native-only onboarded company (no legacy `CovenantProvision` rows) can only be meaningfully golden-tested via that one queryType today — an existing architecture boundary this phase did not touch, per the "no unnecessary solver redesign" scope boundary.
- **No new `lib/solver/**`/`lib/covenant-engine.ts` logic was written or needed to change** beyond the one additive `CompanySummary.onboardingStatus` field read (`lib/dashboard-service.ts`) for onboarding-aware navigation — confirmed by `git diff` scope.

## N. A note on the worktree/branch state at session start

This session's worktree branch (`worktree-agent-ae2e1ea93b7284128`) was initially based on a commit (`312c3d2`, a merge of PR #7 into `main`) that predated Phase 1's three commits (`acb3ae7`/`5052b49`/`7cd85c4`/`fab078a`) actually landing on `origin/claude/headroom-scaffold-covenant-engine-jrijk8` — i.e. Phase 1's own code (`lib/extraction/**`, `lib/document-storage/**`) was genuinely absent from this worktree at the start of this session, despite the task brief's correct statement that Phase 1 is merged and pushed. Diagnosed via `git log`/`git diff` (confirmed the local branch's tip commit was tree-identical to the merge-base, i.e. carried zero unique content of its own) and resolved with a plain, non-destructive `git merge` of `origin/claude/headroom-scaffold-covenant-engine-jrijk8` into the worktree branch before any Phase 2 code was written — not a reset, not a force-push, no history rewritten.

## O. Deployment reality — what remains unverified pending real Vercel/Anthropic deployment

Same posture as Phase 1, extended to this phase's own new surface:

- **`AnthropicExtractionProvider`** (used by `lib/extraction/get-provider.ts`'s factory whenever `ANTHROPIC_API_KEY` is set) remains unverified end-to-end from this sandbox — no API key available here. `lib/extraction/get-provider.ts` type-checks cleanly and mirrors the exact factory pattern `lib/document-storage/index.ts` already established; its live behavior can only be confirmed once deployed with real credentials.
- **`VercelBlobStorageProvider`** (used by `uploadAndChunkDocument` whenever `BLOB_READ_WRITE_TOKEN` is set) remains unverified end-to-end from this sandbox for the same reason — no live Blob store reachable here. Every acceptance-test/script run in this session used `LocalFilesystemStorageProvider` (the automatic fallback), confirmed via `getDocumentStorageProvider()`'s own environment check.
- **The onboarding wizard's actual browser-rendered UI** (file `<input>` behavior, form styling, the review workspace's JSON-edit textarea UX) was verified via `npm run build`'s successful static-page generation and type-checking, and via `lib/onboarding/**`'s functions being exercised directly by the acceptance test — but was **not** click-tested in a running browser against a live dev server in this sandbox (no browser/display available here). The underlying server actions and data layer are proven correct by the acceptance test; the presentation layer's real-browser behavior is unverified.
- No new environment variables were introduced by this phase — `.env.example` is unchanged; `ANTHROPIC_API_KEY`/`EXTRACTION_MODEL`/`BLOB_READ_WRITE_TOKEN` were already documented by Phase 1.

## P. File inventory

```
prisma/migrations/20260825200000_add_candidate_review_events/migration.sql

lib/onboarding/review.ts
lib/onboarding/promotion.ts
lib/onboarding/financial.ts
lib/onboarding/golden-tests.ts
lib/onboarding/documents.ts
lib/extraction/get-provider.ts

app/companies/new/{page,actions}.tsx|ts
app/[companyId]/onboarding/page.tsx
app/[companyId]/onboarding/documents/{page,actions}.tsx|ts
app/[companyId]/onboarding/review/{page,actions}.tsx|ts
app/[companyId]/onboarding/review/chunk/[chunkId]/page.tsx
app/[companyId]/onboarding/financials/{page,actions}.tsx|ts
app/[companyId]/onboarding/facilities/{page,actions}.tsx|ts
app/[companyId]/onboarding/activate/{page,actions}.tsx|ts

components/ReviewerNameField.tsx

tests/onboarding/synthetic-acceptance.test.ts
scripts/onboarding-precedent-acceptance.ts
```

Also touched: `prisma/schema.prisma` (the one additive model, §B), `lib/dashboard-service.ts` (`CompanySummary.onboardingStatus`, additive field), `components/CompanyNav.tsx` + `app/[companyId]/layout.tsx` (onboarding-aware nav), `app/page.tsx` (company-landing "New company" entry + onboarding-status-aware routing), `app/globals.css` (additive `textarea`/`.button-danger`/`.onboarding-*`/`.candidate-*`/`.review-history-entry` rules, nothing removed or changed), `next.config.mjs` (`experimental.serverActions.bodySizeLimit` for document uploads).
