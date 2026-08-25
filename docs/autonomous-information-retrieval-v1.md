# Headroom — Autonomous Information Retrieval v1 (Phase B)

**Status: IMPLEMENTED.** This document reports code actually written, migrated (zero new migrations - Phase B is additive logic only, no schema changes), tested, and executed against a real Postgres database and real, live SEC.gov — not a design or plan. It covers Phase B: everything Phase A's own scope boundary (docs/autonomous-retrieval-phase-a-foundation.md §H) deliberately left undone — real multi-source reconciliation, the `FINANCIAL_FACT` promotion gap, the canonical company-state aggregation service, amendment-processing verification (and one genuine fix it found), continuous sync, and human-effort/quality metrics reporting.

---

## A. Executive result

Every deliverable in the brief is implemented and proven with real tests, including two real, live SEC.gov acceptance runs and one full synthetic-company acceptance test exercising the entire pipeline end-to-end (connect → discover → fetch → classify/dedupe → extract → reconcile → review → promote → canonical state → dashboard). Regression: **408/408 vitest tests passing** (380 baseline + 28 new, across 50 files, 43 baseline + 7 new), `tsc`/`eslint` clean, `prisma validate`/`migrate status` clean with **zero new migrations**, golden-test harness **unchanged** for both Coherent (26/3/1/0) and Matthews (2/4/10/2), `npm run build` succeeds, Coherent/Matthews live row counts **unchanged** (companies: 2, documents: 4, permissions: 29, golden_tests: 48), zero company-specific branching anywhere in new code.

One genuine, honestly-reported finding: writing the required amendment-processing test (§5 of the brief, "verify first") surfaced a real gap — promotion confirmed an amendment's own `effectiveFrom`/`effectiveTo`/`supersedesDocumentId`, but never propagated the amendment's `effectiveFrom` onto the **base** document's `effectiveTo`, the one column `loadCompanyCovenantData`'s date-range filter actually reads to retire a superseded document. Fixed as the smallest correct addition (§N).

## B. Connector architecture (recap)

Unchanged from Phase A — `lib/connectors/types.ts`'s `SourceConnector` interface (`capabilities`/`discover`/`fetch`/`syncSince`/`healthCheck`), `EdgarConnector`, `CsvFinancialConnector`, `UploadConnector`, the `CompanySourceConnection`/`SourceArtifact`/`IngestionJob`/`IngestionJobStage`/`SourcePriorityRule` schema. Full detail in docs/autonomous-retrieval-phase-a-foundation.md; not repeated here. Phase B extends this foundation without modifying its interfaces — no connector's `capabilities()`/`discover()`/`fetch()`/`syncSince()`/`healthCheck()` signature changed.

## C. Source registry (recap)

Unchanged (`lib/connectors/registry.ts`) — `connectSource`, `getOrCreateUploadConnection`, `getConnectorForConnection`. Phase B reads `CompanySourceConnection.connectorType`/`sourcePriority` (via `SourceArtifact.sourceConnection`) inside reconciliation's join, but writes nothing new to this table.

## D. Document connector (EDGAR) — recap + new real-run numbers

Recap: real ticker→CIK resolution, real filing/exhibit discovery, real fetch+hash, real HTML parsing (docs/autonomous-retrieval-phase-a-foundation.md §D/§I).

**New Phase B real run** (`tests/connectors/edgar-acceptance-phase-b.test.ts`, American Airlines Group, ticker `AAL`, live SEC.gov, ~3s):

| Metric | Result |
|---|---|
| Filings scanned | 2 |
| Exhibits fetched | 2 |
| Documents materialized | 2 |
| Extraction candidates produced | 67 |
| RECONCILE groups | 0 (single connector connected — see §L) |
| `SourceArtifact`/`Document`/`ExtractionRun` counts | all consistent, real sha256 hashes, real chunked/parsed text |

This is the **same** live SEC.gov data Phase A's own `edgar-full-ingestion.test.ts` exercises (both tests are independent, both pass against the real upstream), now additionally run through Phase B's real `RECONCILE` stage (not the Phase A stub) and through `getCanonicalCompanyState`/`getHumanEffortMetrics`.

## E. Financial connector (CSV) — recap

Unchanged (`lib/connectors/csv-financial-connector.ts` + `csv-parse.ts`) — hand-rolled RFC 4180 parser, fail-closed row validation. Phase B's synthetic acceptance test (§K) drives a full 8-metric CSV upload through this connector into a real promoted `FinancialSnapshot`/`FinancialState`.

## F. Upload convergence — recap

Unchanged (`lib/connectors/upload-connector.ts`). Phase B's synthetic acceptance test uses `uploadDocumentThroughIngestion` directly for both the base credit agreement and the amendment document, proving manual upload's convergence into the same `SourceArtifact`/extraction pipeline still holds under Phase B's new promotion/reconciliation code.

## G. Discovery / H. Classification / I. Deduplication

Unchanged (Phase A). No Phase B code touches `lib/connectors/dedup.ts`'s dedup mechanism or the `CLASSIFY_DEDUPE` stage's document-materialization logic.

## J. Document chains / amendment processing

See §N below (the dedicated section) — this is Phase B's own new work, not a recap.

## K. Financial extraction (recap)

Unchanged — the `EXTRACT` stage still creates `FINANCIAL_FACT` candidates directly from `FINANCIAL_RECORD` artifacts, no LLM call, idempotent on retry (Phase A, `lib/connectors/ingestion.ts`'s `runExtractStage`).

## L. Reconciliation (`lib/connectors/reconciliation.ts` + `lib/connectors/ingestion.ts`'s `runReconcileStage`)

### The pure function

`reconcileFinancialFacts(candidates, priorityRules, options)` — genuinely pure (proven by a dedicated purity test: identical inputs called twice produce identical, deep-equal output, and input arrays are never mutated). Design decisions, all documented in the file's own header comment:

- **Period** = calendar month of `asOfDate`, encoded `"YYYY-MM"` in **UTC** (never local time zone, for determinism).
- **Tolerance** = 1% relative difference (`DEFAULT_RELATIVE_TOLERANCE`), pairwise across every value in a group.
- **Staleness** = a per-metric threshold (`STALENESS_DAYS_BY_METRIC`), explicitly CONFIGURATION not universal truth: `cash: 1`, `total_debt`/`secured_debt: 30`, `covenant_ebitda`/`interest_expense`/`cumulative_net_income`/`equity_proceeds`/`assumed_new_debt_rate_pct: 90`, default `180` for anything unlisted.
- **Classification precedence**: STALE_SOURCE is checked FIRST, before value agreement — an agreeing-but-stale pair of sources is still flagged, since agreement between two stale figures is not the same as a current, trustworthy one.
- **MISSING_SOURCE**: type defined for forward-compatibility, never produced — detecting "a connected FINANCIAL_FACTS-capable connector produced nothing for an expected metric" would require inventing an "expected metrics registry" this codebase has no other reason to have (a fabricated expectation, not a fail-closed inference). Documented as the task's own explicit v1 simplification.
- **Scope**: only groups with 2+ candidates from **different** `sourceConnectionId`s are classified; a single-source metric/period is not reconciliation's concern at all.
- **Priority resolution** (`resolvePriority`): a company-specific `SourcePriorityRule` for `(metricName, connectorType)` wins if present, else a global (`companyId: null`) rule for the same pair, else the candidate's own connection-level `CompanySourceConnection.sourcePriority` as a generic fallback.

10 unit tests (`tests/connectors/reconciliation.test.ts`) cover MATCH, MATERIAL_DIFFERENCE (priority resolves it), CONFLICTING_SOURCE (tied/no priority), STALE_SOURCE, a metric with no configured threshold falling back to the 180-day default, single-source groups never being returned, period-scoping across months, company-specific rule overriding global, and connection-level fallback when no rule matches at all.

### Wiring into the RECONCILE stage

`runReconcileStage(companyId)` replaces Phase A's documented stub. Real example from `tests/connectors/reconcile-stage.test.ts`: a CSV_FINANCIAL cash fact of $5.0M and a DOCUMENT_UPLOAD cash fact of $5.8M for the same date — beyond 1% tolerance, DOCUMENT_UPLOAD outranks CSV_FINANCIAL per the seeded global `SourcePriorityRule` rows — produces exactly one `MATERIAL_DIFFERENCE` group; the CSV candidate is flagged `REVIEW_REQUIRED` with rationale `"Conflicts with a higher-priority DOCUMENT_UPLOAD value of 5800000 USD as of 2026-... - see candidate <id>. ..."`; the DOCUMENT_UPLOAD candidate (the winner) is left completely untouched (`reviewStatus: PENDING`, `rationale: null`).

- **MATCH** → no writes, normal PENDING flow proceeds.
- **MATERIAL_DIFFERENCE** → every non-winner candidate → `REVIEW_REQUIRED` + rationale naming the winner.
- **CONFLICTING_SOURCE** → every candidate in the group → `REVIEW_REQUIRED` (no winner exists — never silently picked).
- **STALE_SOURCE** → every candidate in the group → `REVIEW_REQUIRED` + staleness rationale.

**Comparison scope vs. write scope** (a deliberate, documented distinction added specifically to satisfy "never silently overwrite the approved one," proven by the synthetic acceptance test §K.5): the candidates *compared* include every non-`REJECTED` `FINANCIAL_FACT` candidate company-wide — `APPROVED`/`EDITED`/already-`promotedAt`-set ones too — so a newly-arrived fact that conflicts with an already-decided or already-promoted one is still genuinely detected. The candidates actually *written to* are a strict subset: only ones still open (`reviewStatus` PENDING or REVIEW_REQUIRED **and** `promotedAt IS NULL`). An approved, edited, or promoted candidate is never flipped back by this system process, regardless of which side of a conflict it's on.

**Audit-trail decision** (documented, "your call" per the brief): this is a SYSTEM-initiated status change, not a human decision, so it deliberately does **not** go through `reviewCandidate()` (which requires a real `reviewedBy` and throws `MissingReviewerError` otherwise) — a direct `prisma.extractionCandidate.update` is the correct, narrower write. No `CandidateReviewEvent` row is written for it either: that table's own schema comment frames it as "one row per review DECISION," bracketed by a human-attributable `CandidateReviewAction`; overloading it with a reviewer-less system row would blur "who decided this" for every real reviewer inspecting a candidate's history. The `RECONCILE` stage's own persisted `output` JSON (`classificationCounts`, and one summary object per group with `metricName`/`period`/`classification`/`candidateIds`/`winnerCandidateId`/`rationale`) is a complete, durable, re-inspectable audit trail on its own — `IngestionJobStage` rows are never deleted.

**Idempotency**: re-running RECONCILE (it scans the whole company, not just one job's own candidates) is a true no-op when nothing relevant changed — a candidate already exactly `REVIEW_REQUIRED` with the identical rationale is skipped, never re-written, never double-counted in `recordsChanged`.

**SYNC now includes RECONCILE** (a deliberate change from Phase A's stub-era decision, documented in `STAGE_SET_BY_KIND`'s own comment): Phase A skipped RECONCILE for SYNC jobs specifically because it was pure busywork with no real logic behind it. Now that it's real, a SYNC pulling fresh data should be reconciled against already-approved/pending facts for the same metric/period — exactly the brief's own named example. All three `IngestionJobKind`s now run the full six-stage pipeline.

## M. Source priority

Unchanged table/seed (Phase A) — 9 seeded global rows (`DOCUMENT_UPLOAD` (0) > `EDGAR` (10) > `CSV_FINANCIAL` (20) for `cash`/`total_debt`/`covenant_ebitda`). Phase B is the first code that actually *reads* this table (§L's `resolvePriority`) and demonstrates company-specific overrides working correctly alongside the global defaults (`tests/connectors/reconciliation.test.ts`'s override test; `tests/onboarding/phase-b-synthetic-acceptance.test.ts`'s test 5 adds a real company-specific override and confirms it takes precedence).

## N. Amendment processing

Per the brief's own instruction ("verify first, extend only if genuinely missing"), `tests/onboarding/amendment-processing.test.ts` was written **before** any new product code — it uploads a synthetic "Credit Agreement" and a synthetic "Amendment No. 2" referencing it (via `uploadAndChunkDocument`, the exact real upload path), runs both through the real `STRUCTURE`-stage extraction, review, and promotion.

**What was already correct, unmodified**: the amendment is correctly classified `AMENDMENT`; a reviewer sees the proposed `supersedesDocumentRef`/`effectiveFrom`/`effectiveTo` directly in the review workspace's existing generic `ValueTable` (`app/[companyId]/onboarding/review/page.tsx`) — no new UI code was needed for this; approving it correctly sets the amendment document's own `type`/`supersedesDocumentId`/`effectiveFrom`/`effectiveTo`, `typeConfirmedByUser`, `amendmentRelationshipConfirmedByUser`.

**What was genuinely missing (two small, honestly-reported gaps)**:

1. **`lib/onboarding/promotion.ts`** never propagated the amendment's `effectiveFrom` onto the **base (superseded)** document's own `effectiveTo` — the one column `loadCompanyCovenantData`'s date-range filter (`lib/covenant-engine.ts`'s `effectiveDateFilter`) actually reads to treat a document as no-longer-effective, per `Document.effectiveTo`'s own schema comment ("When an amendment supersedes this document, set THIS document's effectiveTo to the amendment's effectiveFrom"). Fixed as one additional `tx.document.update` call in the same promotion transaction, applied only when the amendment candidate actually proposed an `effectiveFrom` (a supersession link with no date does not retroactively cut off the base document). Also added case-insensitive `supersedesDocumentRef` matching (real filing text and a `Document.name` row rarely share exact casing).
2. **`lib/extraction/synthetic-provider.ts`** (a test/demo-only fixture provider — `AnthropicExtractionProvider` already prompts a real LLM for exactly this) never proposed a `supersedesDocumentRef`/`effectiveFrom` at all for an amendment document. Added a small, honest regex pattern (`/(?:to|amends?)\s+the\s+"([^"]{2,120})"/i` for the base-document reference, `/Effective\s+Date:?\s*([^\n]+)/i` for the date) — same "heuristic over ChunkRefs, never real NLP" discipline this file's other extraction methods already use.

**Confirmed working end-to-end** (`tests/onboarding/amendment-processing.test.ts`, 3 tests): before the amendment's effective date, `loadCompanyCovenantData` returns the base document and NOT the amendment; on/after that date, it returns the amendment and NOT the base document; the base document's row is **never deleted** — it remains fully queryable directly by id, just excluded from the date-filtered "currently effective" set. This is exactly the historical-preservation behavior the brief requires.

No general-purpose diffing engine was built (§32's "show proposed diff" requirement): the review workspace's existing generic `ValueTable` already displays `documentType`/`supersedesDocumentRef`/`effectiveFrom`/`effectiveTo` as structured fields, plus the candidate's own quoted `sourceExcerpt` — judged sufficient "proposed diff" information for this phase; a separate diffing engine was out of scope per the brief's own §48.

## O. Source mapping / financial extraction promotion (`lib/onboarding/financial.ts`, `lib/onboarding/promotion.ts`)

**`FINANCIAL_METRIC_FIELD_MAP`** (`lib/onboarding/financial.ts`) — the small, fixed, explicit mapping the brief's §17 requires, from the 8-value `metricName` vocabulary to `ManualFinancialStateInput`'s own fields:

| `metricName` | Target field |
|---|---|
| `cash` | `cash` |
| `total_debt` | `totalDebtPrincipal` |
| `secured_debt` | `securedDebtPrincipal` |
| `covenant_ebitda` | `ebitda` |
| `interest_expense` | `interestExpense` |
| `cumulative_net_income` | `cumulativeNetIncomeSinceIssue` |
| `equity_proceeds` | `equityProceedsSinceIssue` |
| `assumed_new_debt_rate_pct` | `assumedNewDebtRatePct` |

An unrecognized `metricName` is a **documented skip with a clear reason**, never an error, never a fabricated mapping — proven by `tests/onboarding/financial-fact-promotion.test.ts`'s 9th CSV row (`some_unrecognized_metric`).

**The batching design decision** (the one non-trivial engineering problem this promotion block had to solve): `FinancialSnapshot`/`FinancialState` require a **full** set of 8 numeric fields per row — they were designed around one human typing in a complete snapshot at once. A single connector-discovered `FINANCIAL_FACT` candidate only ever supplies ONE of those 8. Resolving facts strictly one-at-a-time (each looking for a "base" row before any others in the same batch have been written) would make **every** fact in a brand-new company's very first CSV upload fail closed, even though the batch as a whole collectively covers all 8 fields. `lib/onboarding/promotion.ts` groups all promotable `FINANCIAL_FACT` candidates in a batch **by `asOfDate`**, and `lib/onboarding/financial.ts`'s `upsertFinancialFactsForDate` merges an entire date-group at once against:

1. an existing row for that exact date (if one exists — created by a prior manual entry or a prior promotion for the same date) — updated in place;
2. else the company's most recent **prior** row (`asOfDate <` this batch's) — seeds the other fields, new row created;
3. else — if the batch itself still doesn't collectively cover all 8 required fields — **fails closed**: every affected fact in the batch is skipped with a clear reason (`"No existing or prior FinancialSnapshot ... to seed the missing required field(s) from, and this batch does not itself cover: ..."`), never a fabricated `0`.

Proven by `tests/onboarding/financial-fact-promotion.test.ts`: a brand-new company with **zero** prior `FinancialSnapshot` promotes all 8 recognized metrics from one CSV upload into **exactly one** snapshot/state row (not 8), with the unrecognized 9th metric skipped separately.

**Refactor, not duplication**: `createManualFinancialState` (the existing Phase 2 manual-entry writer) was refactored to extract `snapshotFieldsFromInput`/`financialStateFactsFromInput` — the *exact same* field-writing logic both the manual-entry path and the new promotion path now call. No parallel writer was built.

**Transactional participation**: `upsertFinancialFactsForDate`/`upsertFinancialFactForDate` accept an optional Prisma client parameter (`Prisma.TransactionClient | PrismaClient`, defaulting to the global client), so `lib/onboarding/promotion.ts` calls them with its own `tx` — the FINANCIAL_FACT promotion block participates in the **same** all-or-nothing `prisma.$transaction` every other candidate kind already does, not a separate, non-atomic write.

**The dashboard needs zero changes** — proven directly, not just asserted: `tests/onboarding/financial-fact-promotion.test.ts`'s own second test calls `getCompanyDashboard` after promotion and asserts the promoted value is reflected, AND runs `git diff --stat HEAD -- lib/dashboard-service.ts` as part of the test itself, asserting empty output. Confirmed independently at the end of this phase's work (`git diff --stat HEAD -- lib/dashboard-service.ts` → empty).

## P. Canonical company state (`lib/company-state/canonical-state.ts`)

`getCanonicalCompanyState(companyId, asOfDate?)` — a **computed, read-time aggregation**, deliberately not a new persisted table (avoids a second source of truth). Composes, without reimplementing:

- `listCompanySourceConnections` (Phase A)
- `getReviewProgress`/`getCandidatesForReview` (Phase 2, unmodified)
- `getCoverageSnapshot` (Phase 2, unmodified — the same `lib/solver/coverage.ts` predicate promotion itself uses)
- `getCompanyDashboard`/`getDocumentDetails` (Phase 10/11, unmodified)
- a new reconciliation-summary query, re-running `reconcileFinancialFacts` **fresh** against current data

**Design decision, documented**: reconciliation is re-run fresh rather than reading back the most recent `RECONCILE` `IngestionJobStage.output` — a persisted stage output reflects a snapshot from whenever that job's stage last ran, which can be stale relative to review actions taken since (a candidate approved/rejected after the job completed). Re-running fresh is the more honest choice for a "current state" view, and it's read-only (no writes to `reviewStatus`, unlike the actual `RECONCILE` stage) — calling `getCanonicalCompanyState` never mutates anything. `lib/connectors/metrics.ts`'s `getLastReconciliationSummary`, by contrast, DOES read the persisted stage output — a legitimate, differently-scoped choice for "what did the last real ingestion run actually do," documented in that file.

`dashboard` is `undefined` (never fabricated) when no `FinancialState`/`FinancialSnapshot` exists yet for the requested date — a brand-new connected-but-not-yet-promoted company legitimately has no dashboard to show.

Proven by `tests/company-state/canonical-state.test.ts` (2 tests: correct composition with a live conflict; correct behavior around a skipped promotion) and `tests/onboarding/phase-b-synthetic-acceptance.test.ts`'s test 4 (full real composition after a real promotion).

A minimal UI consumer was added (`app/[companyId]/onboarding/sources/page.tsx`) — a small reconciliation/review summary card, reusing `getCanonicalCompanyState` directly, shown only when there's something to show. Not a polished dashboard, per the brief's own scope boundary.

## Q. Contract extraction (recap)

Unchanged from Phase 1/2 — `lib/extraction/provider.ts`'s staged pipeline, `AnthropicExtractionProvider`/`SyntheticExtractionProvider`. The one addition (§N) is purely additive to `SyntheticExtractionProvider`'s `extractDocumentStructure` method; every other extraction stage/method is byte-for-byte unchanged.

## R. Exception workflow

Every genuine exception this phase produces routes through the **existing** `ExtractionCandidate.reviewStatus` machinery — `REVIEW_REQUIRED` for a reconciliation conflict or staleness flag (§L), `PENDING` for an ordinary newly-discovered fact, a documented skip (never a silent failure) for an unrecognized `metricName` or an unbuildable financial snapshot (§O). No new "review item" or "exception" table exists anywhere in Phase B's code — the central reuse rule this task (and every prior phase) holds to.

## S. Continuous sync

The "Sync Now" action already built by Phase A (`app/[companyId]/onboarding/sources/actions.ts`'s `syncConnectionAction`, creating a `SYNC`-kind job and calling `runAllPendingIngestionStages`) required **no changes** — it already picks `INITIALIZE` vs. `SYNC` based on `lastSuccessfulSyncAt`, and now automatically benefits from real reconciliation since `SYNC` jobs include `RECONCILE` as of this phase (§L). Verified working with real reconciliation via `tests/connectors/reconcile-stage.test.ts`'s third test (a SYNC job runs all 6 stages, including a real RECONCILE, successfully) and `tests/onboarding/phase-b-synthetic-acceptance.test.ts`'s test 5 (a SYNC-triggered RECONCILE correctly flags a conflicting fact).

## T. Change impact

Full "recompute affected analytics on change" is already inherent in `lib/dashboard-service.ts` — every dashboard function (`getCompanyDashboard`, `getScenarioInputs`, etc.) reads live `FinancialState`/`FinancialSnapshot`/`Permission` rows directly from the database on every request, with no caching layer anywhere in this codebase. Once a `FINANCIAL_FACT` is promoted (§O), the very next request to any dashboard page reflects it — confirmed directly by `tests/onboarding/financial-fact-promotion.test.ts` and `tests/onboarding/phase-b-synthetic-acceptance.test.ts`. **No invalidation/staleness machinery was built, because none is needed** — this is a genuine confirmation, not an assumption: this phase's own code never introduces a cache, a materialized view, or a denormalized read model anywhere.

## U. Compliance certificates (recap)

Unchanged — Phase 1/2's `certifyExternalInputRecord` flow (`lib/onboarding/financial.ts`) is untouched by this phase; `FINANCIAL_FACT` promotion is a structurally separate, additive code path in the same file.

## V. Human effort metrics (`lib/connectors/metrics.ts`)

`getHumanEffortMetrics(companyId)` — real counts, grouped by `ExtractionCandidateKind`, of discovered/pending/approved/edited/rejected/review-required/promoted candidates, plus company-wide totals and a `reviewCompletionRate` (`reviewed / discovered`, `NaN` — never `0` — when nothing has been discovered yet, an honest "undefined" rather than a fabricated zero). "Auto-accepted" is always `0` and reported as such rather than omitted, since no candidate is ever auto-approved anywhere in this codebase — the absence of an auto-accept path is made visible in the metrics themselves, not just asserted in prose.

**Real numbers, this phase's own EDGAR acceptance run** (AAL, §D): 67 candidates discovered (2 `DOCUMENT_RELATIONSHIP` — one per materialized document — plus whatever the `SyntheticExtractionProvider`'s other stages proposed from the real, parsed exhibit text), 0 promoted (nothing reviewed yet in that test), `reviewCompletionRate` reflecting the un-reviewed state honestly.

## W. Quality metrics (`lib/connectors/metrics.ts`)

`buildEdgarPrecisionReport({ filingsScanned, exhibitsDiscovered, genuineCreditFacilityCount })` — a callable function version of Phase A's own real Ford Motor Co finding (§I of the Phase A report), reused rather than re-scraped: **100 filings scanned, 4 exhibits discovered, 3 genuine credit-facility documents, 1 false positive** (a Tax Benefit Preservation Plan amendment matching only on the keyword "Amendment") → **75% precision**. `recallNote` states plainly, per the task's own explicit instruction: *"Recall not measurable without a ground-truth index of every credit-facility exhibit that exists for this company across its full EDGAR filing history — no such index exists in or outside this codebase, so no recall figure is reported (never fabricated)."*

`getLastReconciliationSummary(companyId)` — reads the most recent completed `RECONCILE` stage's persisted `output` for a quick "how much did reconciliation actually do" figure (classification counts, candidates flagged), for use in acceptance tests/reports without re-running reconciliation.

## X. Security

Confirmed, same posture as every prior phase: no secrets in the database or logs (`CompanySourceConnection.credentialRef` remains an opaque reference only, `null` for every connection created in this phase's tests — EDGAR needs none, CSV/upload need none). No new environment variable was introduced. No credential-adjacent column was added by Phase B's work (zero new schema, §A).

## Y. Tests

45 Phase A tests + **28 new Phase B tests**, all passing, across 7 new files:

| File | Tests | Proves |
|---|---|---|
| `tests/connectors/reconciliation.test.ts` | 10 | Pure `reconcileFinancialFacts` — every classification, purity, period/tolerance/staleness/priority-resolution rules |
| `tests/connectors/reconcile-stage.test.ts` | 3 | Real RECONCILE stage: MATERIAL_DIFFERENCE flags the loser with a clear rationale + leaves the winner untouched; MATCH is a true no-op; SYNC jobs now include RECONCILE |
| `tests/onboarding/financial-fact-promotion.test.ts` | 3 | Batched FINANCIAL_FACT promotion into one snapshot/state row; unrecognized-metric skip; dashboard reflects it with a `git diff`-verified empty `lib/dashboard-service.ts` diff; promotion is idempotent |
| `tests/company-state/canonical-state.test.ts` | 2 | `getCanonicalCompanyState` composes correctly, including a live conflict and a correctly-absent dashboard |
| `tests/onboarding/amendment-processing.test.ts` | 3 | Full amendment classification/review/promotion/effective-dating chain, including the base-document effectiveTo fix this test itself found necessary |
| `tests/onboarding/phase-b-synthetic-acceptance.test.ts` | 5 | Full synthetic-company acceptance: CSV ingestion → document + amendment upload → review/promote → canonical state + dashboard → a real conflicting re-upload produces REVIEW_REQUIRED without touching the approved/promoted fact |
| `tests/connectors/edgar-acceptance-phase-b.test.ts` | 2 | Real-source acceptance: full 6-stage job against live SEC.gov (AAL) composed through the new canonical-state/metrics layer; Ford precision report reused honestly |

One pre-existing Phase A test (`tests/connectors/ingestion-stage-discipline.test.ts`) was updated (not weakened) to reflect the SYNC-now-includes-RECONCILE change, with a comment explaining why.

## Z. Vercel deployment

Not attempted from this phase — the orchestrating session's job, same posture as every prior phase report.

## AA. Live acceptance

Not attempted from this phase against the production Vercel deployment. This phase's own live acceptance is against real SEC.gov data directly from this sandbox (§D, §W), the same posture Phase A established and re-confirmed here.

## AB. Known limitations

- **`MISSING_SOURCE` is defined but never produced** (§L) — detecting "a connected connector produced nothing for an expected metric" needs an expected-metrics registry this codebase deliberately does not build (would be a fabricated expectation).
- **Reconciliation only compares candidates from genuinely different `sourceConnectionId`s.** A company has exactly one connection per `ConnectorType` (`@@unique([companyId, connectorType])`), so a second CSV upload through the SAME CSV_FINANCIAL connection reporting a different value for a previously-approved fact is a same-source **restatement** question, not a cross-source **disagreement** question — genuinely out of this phase's reconciliation scope (documented directly in `tests/onboarding/phase-b-synthetic-acceptance.test.ts`'s own test 5 comment, which works around this honestly by using a genuinely different connector for its conflict scenario rather than papering over the limitation).
- **A single connected FINANCIAL_FACTS-capable connector has nothing to reconcile against**, structurally and correctly (§D/§W's real EDGAR run: 0 reconciliation groups, reported honestly rather than fabricated).
- **`upsertFinancialFactsForDate` fails closed, not gracefully-partial**, when a brand-new company's very first batch of facts doesn't collectively cover all 8 required `FinancialSnapshot` fields — every fact in that batch is skipped until either a full manual snapshot exists or a subsequent batch completes the picture. This is the correct fail-closed behavior per the hard constraints, but it does mean a company onboarding via connector alone, with a source that reports fewer than all 8 metrics for its first period, will not auto-populate the dashboard until either a human enters a manual snapshot or enough connector data accumulates.
- **Permission-level effective dating is untouched by the amendment fix** (§N) — the fix propagates `effectiveTo` onto the superseded **Document** row (what `loadCompanyCovenantData`'s legacy engine reads), which is exactly what the brief's own test scenario asks for. A solver-native company's `Permission` rows have their own independent `effectiveFrom`/`effectiveTo` columns (design doc §H) that promotion does not currently set from a `DOCUMENT_RELATIONSHIP` candidate at all — a pre-existing gap from Phase 1/2, not introduced or touched by this phase, and out of this phase's scope to fix (the brief's own test scenario is scoped to the legacy `loadCompanyCovenantData` filter, which this fix correctly closes).

## AC. Next connector roadmap (short, honest list)

- **NetSuite/ERP connector** (`FINANCIAL_FACTS`/`DEBT_BALANCES`/`CASH_BALANCES` capabilities) — would need OAuth credential storage behind `CompanySourceConnection.credentialRef` (an opaque reference into a secrets manager, never a raw token in this table), a REST/SuiteQL client, and a `metricName` mapping from NetSuite's own GL account taxonomy into the existing `FINANCIAL_METRIC_FIELD_MAP` vocabulary (§O) — the promotion/reconciliation layer needs zero changes to accept it, since it only ever sees `FINANCIAL_FACT` candidates through the same interface.
- **SAP connector** — same shape as NetSuite; would need SAP's own OData/RFC client and its own metric-name mapping. No schema change needed.
- **A second EDGAR-like public-filings connector for non-US issuers** (e.g. SEDAR+ for Canadian filers) — would reuse the entire `SourceConnector` interface and the `DOCUMENTS` capability path verbatim; only `discover()`/`fetch()` need a new implementation.
- **A lender/agent-bank portal connector** (compliance certificates, borrowing-base certificates) — `COMPLIANCE_INPUTS` capability, would most naturally feed `ExternalInputRecord` via the existing `certifyExternalInputRecord` path (§U) rather than `FINANCIAL_FACT`, since certificate values already have their own certification-status lifecycle.

---

**Regression summary for the orchestrating session**: 408/408 vitest (380 baseline + 28 new, all passing, including live SEC.gov network calls), `tsc`/`eslint` clean, `prisma validate`/`migrate status` clean with zero new migrations, golden-test harness UNCHANGED for both Coherent (26/3/1/0) and Matthews (2/4/10/2), `npm run build` clean, live Coherent/Matthews data UNCHANGED (companies: 2, documents: 4, permissions: 29, golden_tests: 48), `lib/dashboard-service.ts` UNCHANGED (`git diff --stat` empty, asserted both by a test and independently), zero company-specific branching anywhere in the new code.
