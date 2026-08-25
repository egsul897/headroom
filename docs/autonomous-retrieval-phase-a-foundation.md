# Headroom — Autonomous Information Retrieval: Phase A Foundation

**Status: IMPLEMENTED.** This document reports code actually written, migrated, tested, and executed against a real Postgres database and the real, live SEC.gov — not a design or plan. It covers Phase A only: the connector/registry/ingestion foundation that lets a company connect data sources (SEC EDGAR for documents, CSV upload for financial figures) and have Headroom autonomously discover, fetch, classify, dedupe, and extract what it needs, converging with the EXISTING manual-upload path (Phase 1/2, `docs/document-onboarding-pipeline-foundation.md` / `docs/company-onboarding-v1-implementation.md`) into one unified pipeline. Phase B (a later, separate pass) builds reconciliation, the canonical company-state aggregation service, and the review-queue UI on top of what is built here — see §H for the exact scope boundary.

---

## A. Baseline

Captured before any Phase A code was written (this session's worktree branch was initially several commits behind `origin/claude/headroom-scaffold-covenant-engine-jrijk8` — a plain, non-destructive `git merge` brought it current before any Phase A work started, the same pattern §N of the Phase 2 report documents for an identical situation):

| Check | Result |
|---|---|
| `prisma migrate status` | 15 migrations, up to date |
| `prisma validate` | valid |
| Full vitest suite | **335/335 passing** (35 test files) |
| `tsc --noEmit` | clean |
| ESLint | clean |
| `npx tsx scripts/golden-test.ts coherent` | 26 passed / 3 failed / 1 flagged / 0 errored |
| `npx tsx scripts/golden-test.ts matthews` | 2 passed / 4 failed / 10 flagged / 2 errored |
| `npm run build` | succeeds |
| Live data | only `coherent`/`matthews` exist in `companies` |

## B. Schema changes (§1 of the brief)

One additive migration: `prisma/migrations/20260825210000_add_autonomous_ingestion_foundation/migration.sql`, hand-written (this sandbox's `prisma migrate dev` is non-interactive-hostile — same established pattern as every prior migration) and applied with `prisma migrate deploy`.

**New models** (all additive, zero rows for Coherent/Matthews as of this migration):

- **`CompanySourceConnection`** — one row per company-per-connector-type. `capabilities` is a plain `String[]` (not a Prisma enum array — capability sets are per-instance, documented in the schema). `credentialRef` is an opaque reference only; every EDGAR connection this phase creates has `credentialRef: null` since EDGAR needs no credential. `@@unique([companyId, connectorType])` is the database-enforced guarantee behind "every company has exactly one `DOCUMENT_UPLOAD` connection" — `getOrCreateUploadConnection` (`lib/connectors/registry.ts`) upserts on this constraint, lazily on first use.
- **`SourceArtifact`** — the dedup ledger. `@@unique([companyId, contentHash])` IS the dedup mechanism. **Provenance choice for "arrived via 2 sources"**: a duplicate arrival appends to the EXISTING row's `provenanceMetadata.duplicateSources[]` array rather than creating a second row or a new join table — the smallest correct representation, proven by `tests/connectors/dedup.test.ts`.
- **`IngestionJob` / `IngestionJobStage`** — mirrors `ExtractionRun`/`ExtractionStage`'s exact proven discipline. `IngestionJobStage.output` (`Json?`) is each stage's own durable, stage-scoped result payload — read back by the NEXT stage via a fresh DB query, never threaded in-memory. `IngestionStageStatus` is a genuinely independent enum (same 4-value shape as `ExtractionStageStatus`, not a reuse of the literal Postgres type) so it can evolve independently later. `@@unique([ingestionJobId, stage])` is the retry/resume unit, identical contract to `ExtractionStage`'s own constraint.
- **`SourcePriorityRule`** — table only, per the brief's own instruction (Phase B implements the reconciliation logic that reads it). Seeded with 9 sensible global default rows (3 metrics × 3 connector types: `DOCUMENT_UPLOAD` outranks `EDGAR` outranks `CSV_FINANCIAL`, lower number = higher priority).

**Existing model extended**: `ExtractionCandidateKind` gained one additive enum value, `FINANCIAL_FACT` (`ALTER TYPE ... ADD VALUE`, same pattern as every prior enum extension in this codebase) — the key reuse decision (§C).

## C. The reuse decision: `FINANCIAL_FACT` candidates

`FinancialFactValueSchema` (`lib/extraction/schemas.ts`) — `{ metricName: string, value: number, asOfDate: string, unit?: string, sourceRecordRef?: string }` — added alongside the seven existing `*ValueSchema`s, following the exact same `proposalSchema()`-adjacent pattern.

`lib/onboarding/review.ts`'s `VALUE_SCHEMA_BY_KIND` gained one entry. **`reviewCandidate()` itself was not modified at all** — proven directly by `tests/connectors/financial-fact-review.test.ts`: a `FINANCIAL_FACT` candidate is approved, edited (proving `proposedValue` is never overwritten, and an invalid edit is rejected against the schema), and rejected, each producing a `CandidateReviewEvent` audit row, using the unmodified Phase 2 functions. `getCandidatesForReview()`/`getReviewProgress()` also needed zero changes; the review workspace's generic JSON `ValueTable` component already renders an unknown `proposedValue` shape correctly — the only UI change needed anywhere in `app/[companyId]/onboarding/review/**` was one label-map entry (`FINANCIAL_FACT: "Financial facts (connector-discovered)"`).

**A structural note on `sourceDocumentId`**: `ExtractionCandidate.sourceDocumentId` is a required FK to `Document`. A `FINANCIAL_FACT` candidate from a CSV row has no governing contract document — so `lib/connectors/ingestion.ts`'s `ensureFinancialFactContainer` creates one lightweight, idempotent "container" `Document` row per CSV connection (`source: "connector-financial-records:<connectionId>"`, type `OTHER`) plus its own `ExtractionRun`/`ExtractionStage` (`stage: FINANCIAL_INPUTS`, marked `COMPLETE` directly — no LLM call, matching the brief's "no LLM needed" instruction) to hang the real FK chain off of. This is genuine provenance, not a workaround: the CSV upload really is the "document" a financial fact was sourced from. Documented in code; no schema change was needed to make this work.

## D. Connector abstraction (`lib/connectors/`)

`lib/connectors/types.ts` defines `SourceConnector` exactly per the brief's verbatim method signatures (`capabilities`/`discover`/`fetch`/`syncSince`/`healthCheck`), plus `ConnectorCapability`, `DiscoveredSourceItem`, `RawSourceArtifact`, `SourceDelta`, `ConnectorHealth`. One documented, deliberate extension: `DiscoverOptions.rawInput?: Buffer` — a push-based connector (CSV, upload) has no remote source to poll; this field lets it accept bytes the caller already has in hand through the SAME interface, rather than inventing a second parallel contract. `EdgarConnector` (a genuine pull-based connector) ignores it.

### `lib/connectors/edgar-connector.ts` — real, working, verified against live SEC.gov

- Ticker→CIK resolution via `https://www.sec.gov/files/company_tickers.json`, `User-Agent: "Headroom/1.0 (contact: engineering@headroom-app.example)"` on every request (SEC rejects requests without one — confirmed empirically before writing the rest of the connector).
- `discover()` walks `filings.recent` (8-K/10-K/10-Q, `filings.files` for older filings deliberately not implemented per the brief's own "don't over-engineer"), opens each qualifying filing's own `-index.htm` page (a small, targeted regex table-row parser — not a general HTML parser), and returns one `DiscoveredSourceItem` **per matching exhibit**, not per filing — filtered by a pragmatic keyword heuristic against the exhibit's filename+description+type text: `/credit agreement|indenture|amendment|intercreditor/i`, restricted to prose file extensions (`.htm`/`.html`/`.txt`).
- `fetch()` downloads the actual exhibit bytes and computes a real sha256.
- `healthCheck()` is a real GET against the same tickers file.
- **Additive discovery made along the way**: real SEC exhibits are almost always `.htm`, not PDF/DOCX/TXT — `lib/extraction/parse.ts` gained one new branch, `parseHtml` (a small regex-based tag-stripper, no new dependency), so a fetched EDGAR exhibit can actually be parsed and chunked by the existing Phase 1 pipeline. This is the one place Phase A touched a Phase 1 file, and it is purely additive (a new `if` branch on content type; PDF/DOCX/TXT logic is byte-for-byte unchanged).

### `lib/connectors/csv-financial-connector.ts` + `csv-parse.ts`

A hand-rolled, full character-level RFC 4180-style CSV parser (quoted fields, embedded commas, escaped `""` quotes) — deliberately not a naive `split(",")`, deliberately not a new dependency (this parser is genuinely simple enough to hand-roll safely). `CsvFinancialConnector.discover()` validates every row against a zod schema; a malformed row (non-numeric value, blank value, unparseable date, missing metricName) is skipped and reported via `getLastParseErrors()` — **never coerced to 0, never silently dropped without a trace** (proven by 6 fail-closed test cases).

### `lib/connectors/upload-connector.ts` — manual-upload convergence

`uploadDocumentThroughIngestion` computes the dedup hash **before** touching storage or the database; on a hit, returns `{ duplicate: true }` and the existing artifact's id **without calling `uploadAndChunkDocument` at all** (no duplicate blob write, no duplicate `Document` row); on a miss, uploads exactly as before and links the new `SourceArtifact` to the resulting `Document` via the company's auto-created `DOCUMENT_UPLOAD` connection. `uploadAndChunkDocument`'s own logic (`lib/onboarding/documents.ts`) was **not modified**.

## E. Dedup + classification (`lib/connectors/dedup.ts`)

`computeContentHash` (sha256), `findDuplicateArtifact`, `upsertArtifactWithDedup` (the one function ingestion code calls to create a `SourceArtifact` — dedup-checks first, creates or records-duplicate, never throws on a duplicate). `canonicalizeFinancialRecord` gives a `FINANCIAL_RECORD` row the same deterministic-hash treatment a `DOCUMENT`'s raw bytes get (sorted-key JSON encoding), so two CSVs with the same row in a different column order still dedup correctly.

**Classification is not a new classifier**: `lib/connectors/ingestion.ts`'s `CLASSIFY_DEDUPE` stage materializes a `DOCUMENT` artifact into a real `Document` row (`type: "OTHER"`, `typeConfirmedByUser: false`) and hands it to the EXACT SAME `createExtractionRun`/`runAllPendingStages` pipeline Phase 1/2 already built via `runExtractionForDocument` — the `STRUCTURE` stage's existing `DOCUMENT_RELATIONSHIP` proposal is what actually classifies it, unchanged.

## F. Ingestion job runner (`lib/connectors/ingestion.ts`)

`runIngestionJobStage(jobId, stage)` mirrors `runExtractionStage`'s exact contract: load the stage row, refuse if already `COMPLETE` (`IngestionStageAlreadyCompleteError`), mark `IN_PROGRESS`, assemble input from **persisted** prior-stage `output` JSON only, run the stage, persist its own `output`, mark `COMPLETE` — or, on any failure, mark `FAILED` with a clear error, touching no other stage's row. `runAllPendingIngestionStages(jobId)` drives every pending stage in order, stopping at the first failure.

**Stage set per `IngestionJobKind`** (documented per the brief's "use your judgment, document it" instruction):

| Kind | Stages |
|---|---|
| `INITIALIZE` | `DISCOVER → FETCH → CLASSIFY_DEDUPE → EXTRACT → RECONCILE → COMPLETE` (full pipeline) |
| `SYNC` | `DISCOVER → FETCH → CLASSIFY_DEDUPE → EXTRACT → COMPLETE` (skips `RECONCILE` — the brief's own named example; Phase B hasn't wired real reconciliation for any job kind yet, so carrying the stub through every incremental sync would be pure busywork) |
| `AMENDMENT_PROCESS` | Same full set as `INITIALIZE` — not exercised by any test in this phase (named in the schema for Phase B to specialize), documented as a deliberate placeholder |

**Per-stage behavior**: `DISCOVER` calls `connector.discover()` (or `syncSince(cursor)` for a `SYNC` job) and persists tagged `DiscoveredSourceItem[]` as its own `output`. `FETCH` calls `connector.fetch()` per item, dedup-checks **before** writing to blob storage (so a duplicate never wastes a storage write), and creates/records via `upsertArtifactWithDedup`. `CLASSIFY_DEDUPE` materializes un-materialized `DOCUMENT` artifacts into real, chunked `Document` rows. `EXTRACT` kicks off the real extraction pipeline for newly-materialized documents and creates `FINANCIAL_FACT` candidates directly for `FINANCIAL_RECORD` artifacts (idempotent on retry via `proposedValue.sourceRecordRef` tracking — an artifact already converted is never double-created). `RECONCILE` is a **legitimate, clearly-labeled Phase A stub** — marked `COMPLETE` with an explicit note in its own persisted `output`, never a fake/silent success. `COMPLETE` updates the connection's `lastSuccessfulSyncAt`/`cursor`/`status`.

**Scope decision, documented**: a Phase A `IngestionJob` is always connector-scoped (`sourceConnectionId` required, even though the schema leaves it nullable for a future multi-connector job Phase B may build) — this phase does not implement cross-connector job orchestration. `DOCUMENT_UPLOAD` does not run through this job machinery at all (see §D) — a manual upload is a synchronous, single-file, human-initiated action with nothing to discover or poll.

## G. Source registry (`lib/connectors/registry.ts`)

`connectSource` — the one place `config` is validated per connector type; EDGAR resolves+stores the CIK via a **real** `resolveCikForTicker` call at connect time, failing closed (storing nothing) on an unresolvable ticker. `getOrCreateUploadConnection` — the lazy, idempotent `DOCUMENT_UPLOAD` connection. `getConnectorForConnection` — the one factory branching on `connectorType`, mirroring `lib/document-storage/index.ts`'s and `lib/extraction/get-provider.ts`'s own established pattern.

## H. What Phase A explicitly does NOT build

Per the brief's own §48 "do not overbuild": reconciliation logic (`RECONCILE` is a documented stub); the canonical company-state aggregation service; a polished UI (the bare-minimum `/[companyId]/onboarding/sources` page is the one UI addition, deliberately unpolished); the review-queue UI extension (unnecessary — the existing generic review workspace already renders `FINANCIAL_FACT` correctly with one label added); amendment-processing acceptance flow, change feed, human-effort/quality metrics; every connector beyond EDGAR/CSV (the interface is pluggable, nothing else is implemented); any new heavy dependency (no CSV library, no job queue — `IngestionJob`/`IngestionJobStage` rows in Postgres ARE the durable job state).

## I. Real EDGAR connector test results (live SEC.gov, no mocks)

Run via `npx tsx scripts/verify-edgar-connector.ts <TICKER> [limit]` and proven again by `tests/connectors/edgar-connector.integration.test.ts` (7 tests) and `tests/connectors/edgar-full-ingestion.test.ts` (the full 6-stage job, real data, real extraction).

**Ford Motor Co (ticker `F`, CIK `0000037996`)**, `limit=100` (scanning the 100 most recent qualifying 8-K/10-K/10-Q filings, ~68s of real sequential SEC.gov requests):

| Metric | Result |
|---|---|
| Filings scanned | 100 (8-K/10-K/10-Q) |
| Distinct filings with ≥1 matching exhibit | 2 |
| Total matching exhibits discovered | 4 |
| First exhibit fetched | `exhibit4amendmentno5totbpp.htm` — 14,552 bytes, sha256 `9ec87633c3...` |
| Parsed to real prose | 4,347 chars, opening: *"AMENDMENT NO. 5 to TAX BENEFIT PRESERVATION PLAN..."* |

**Honest finding**: of the 4 matches, 3 are genuine credit-facility documents (Twentieth Amendment to the Credit Agreement, Fifth Amendment to the Supplier/Receivables Facility, Second Amendment to the 364-Day facility — all filed 2023-04-26) and 1 is a false positive (a Tax Benefit Preservation Plan amendment, which matched only on the keyword "Amendment" — an unrelated corporate-governance document, not a debt instrument). This is exactly the tradeoff the brief's own "pragmatic heuristic, not NLP" framing anticipates — precision is not perfect, but every real match was found, and the connector correctly never fabricated a match with no textual basis.

**American Airlines Group (ticker `AAL`, CIK `0000006201`)**, default `limit=25` (~2s):

| Metric | Result |
|---|---|
| Filings scanned | 25 |
| Distinct filings with ≥1 matching exhibit | 2 |
| Total matching exhibits discovered | 2 |
| Both matches | Real Term Loan Credit Agreement amendments — "FOURTH AMENDMENT TO TERM LOAN CREDIT AND GUARANTY AGREEMENT" (filed 2026-07-23, EX-10.1) and a First Amendment (filed 2026-02-18, EX-10.145) |
| First exhibit fetched | 1,579,730 bytes, sha256 `da496e13e3...`, parsed to 711,427 chars of real contract prose |

This ticker's own two most-recent qualifying filings both contained genuine, correctly-classified credit-facility exhibits with zero false positives — used as the fixture for `tests/connectors/edgar-full-ingestion.test.ts`'s full end-to-end run: `connectSource → createIngestionJob(INITIALIZE) → runAllPendingIngestionStages` against **live SEC.gov data** completed in **~2.8 seconds**, producing 2 real `SourceArtifact` rows, 2 real materialized+chunked `Document` rows, 2 real `ExtractionRun`s (via `SyntheticExtractionProvider` — no `ANTHROPIC_API_KEY` in this sandbox, same posture every prior phase report has documented), and real `ExtractionCandidate` rows including at least one `DOCUMENT_RELATIONSHIP` proposal per document.

**Conclusion: the EDGAR connector genuinely works end-to-end against real SEC.gov data** — discovery, fetch, hashing, HTML parsing, storage, deduplication, Document materialization, and the existing extraction pipeline, all exercised for real, not mocked, not stubbed.

## J. Required tests — what was written (45 new tests, all passing)

| File | Tests | Proves |
|---|---|---|
| `tests/connectors/edgar-connector.integration.test.ts` | 7 | Real ticker→CIK resolution, real healthCheck, real discover(), real fetch() with correct sha256, real HTML→text parse, fail-closed on an unknown ticker |
| `tests/connectors/edgar-full-ingestion.test.ts` | 1 | The FULL 6-stage job against live SEC.gov (AAL) — DISCOVER through COMPLETE, real Document materialization+chunking+extraction |
| `tests/connectors/csv-financial-connector.test.ts` | 15 | Hand-rolled CSV parsing (quotes, escapes) + 5 fail-closed row-validation cases + connector contract |
| `tests/connectors/dedup.test.ts` | 3 | **The required proof**: two artifacts, identical content, two different source connections (`DOCUMENT_UPLOAD` + a simulated EDGAR connection) → exactly ONE `SourceArtifact` row, second arrival recorded as `duplicateSources` provenance; plus per-company dedup scoping |
| `tests/connectors/ingestion-stage-discipline.test.ts` | 2 | The exact partial-failure/retry contract `tests/extraction/run-stage.test.ts` already proved, now for `IngestionJobStage` — a REAL storage outage (blob genuinely deleted) fails FETCH, DISCOVER stays byte-for-byte untouched, restoring the real bytes lets FETCH retry and succeed, DISCOVER is STILL untouched, re-running DISCOVER is refused (`IngestionStageAlreadyCompleteError`) |
| `tests/connectors/financial-fact-review.test.ts` | 6 | `FINANCIAL_FACT` candidates approved/edited/rejected via the UNMODIFIED `reviewCandidate()`/`getCandidatesForReview()` |
| `tests/connectors/registry.test.ts` | 7 | `connectSource` validation/idempotency/real EDGAR resolution, `getConnectorForConnection` factory |
| `tests/connectors/upload-connector.test.ts` | 4 | Auto-created, idempotent `DOCUMENT_UPLOAD` connection; a re-uploaded byte-identical file never creates a second `Document` |

## K. Hard constraints — confirmed

- **Company/scenario agnosticism**: `grep`-checked — zero `companyId === "..."`-shaped branching anywhere in `lib/connectors/**`. Every function takes `companyId` as a plain parameter; the dedicated tests exercise it against fixture company ids that are neither `coherent` nor `matthews`, and the real EDGAR tests exercise it against real companies (Ford, American Airlines) with zero company-specific code paths.
- **Fail closed, always**: `EdgarConnector` fails closed on an unresolvable ticker (throws, storing nothing); `CsvFinancialConnector` fails closed on a malformed row (skipped + reported, never coerced to 0/blank-as-zero); `getConnectorForConnection` throws on an EDGAR connection with no resolved `cik` rather than guessing one; a source that returns zero discovered items is reported as zero, never silently upgraded to "confirmed absent" anywhere in this code.
- **No secrets in the DB or logs**: `CompanySourceConnection.credentialRef` is the only credential-adjacent column, and it is `null` for every connection this phase creates (EDGAR needs none). No connector logs a credential (there is none to log).
- **`prisma migrate dev`/`db push` avoided**: one hand-written migration SQL file, applied via `prisma migrate deploy`, matching every prior migration in this repo exactly.
- **Reuse the existing ontology**: `FINANCIAL_FACT` is one more `ExtractionCandidateKind`, reviewed by the unmodified `reviewCandidate()`, audited by the unmodified `CandidateReviewEvent` table — no parallel review/audit system exists anywhere in this phase's code.
- **AI/connectors never become the solver**: nothing in `lib/connectors/**` writes to `Permission`/`PermissionRelationship`/`FinancialState`/`FinancialSnapshot`/etc. Every discovered fact lands as a reviewable `ExtractionCandidate` (`FINANCIAL_FACT`) or an unreviewed `Document` (subject to the existing, unmodified `STRUCTURE`-stage classification and eventual `lib/onboarding/promotion.ts` gate) — confirmed by direct inspection: `lib/onboarding/promotion.ts` was not touched by this phase at all.
- **Non-mutating scenarios**: `lib/scenario-runner.ts` was not touched.
- **Coherent/Matthews untouched**: confirmed by direct row-count query before and after every test run in this session (`companies`: 2, unchanged; `documents`: 4, unchanged; `permissions`: 29, unchanged; `golden_tests`: 48, unchanged) and by the unchanged golden-test harness results below.

## L. Regression suite — final state

| Check | Result |
|---|---|
| `npx prisma validate` | valid |
| `npx prisma migrate status` | 16 migrations, up to date |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx vitest run` | **380/380 passing** (43 test files — 335 baseline + 45 new) |
| `npx tsx scripts/golden-test.ts coherent` | 26 passed / 3 failed / 1 flagged / 0 errored — **unchanged** |
| `npx tsx scripts/golden-test.ts matthews` | 2 passed / 4 failed / 10 flagged / 2 errored — **unchanged** |
| `npm run build` | succeeds — all routes compile, including the new `/[companyId]/onboarding/sources` route |
| Live-data row counts (companies/documents/permissions/golden_tests) | unchanged before/after |

## M. Deviations from the brief, and why

- **`lib/extraction/parse.ts` gained HTML support** (§D) — not named in the brief's file inventory, but required for the EDGAR connector's own explicit "this MUST actually work" requirement: real SEC exhibits are HTML, and the pipeline had no way to parse them otherwise. Purely additive; zero existing PDF/DOCX/TXT logic touched.
- **`RECONCILE` stage exists but is a documented stub for every job kind**, not implemented per-connector-differently — the brief names this exact tradeoff as acceptable ("a legitimate scoped stub, not a fake success").
- **`AMENDMENT_PROCESS` job kind is defined and stage-mapped but not exercised by any test** — named in the schema/stage-set table for Phase B to specialize once amendment-specific reconciliation exists; building a real amendment-triggered workflow was judged out of scope for a foundation phase with no reconciliation layer yet to feed.
- **A Phase A `IngestionJob` is always connector-scoped** (§F) — the schema's `sourceConnectionId` nullability (for a future multi-connector job) is preserved but not exercised; implementing real multi-connector job orchestration was judged unnecessary scope expansion for a foundation phase.
- **CSV upload's "discovery" happens via bytes persisted through `lib/document-storage` at job-creation time**, referenced through the DISCOVER stage's own `output.inputStorageRef`, rather than a fifth interface parameter — keeps `SourceConnector` to the brief's exact five methods while still letting FETCH reconstruct a fully-hydrated connector from persisted state alone (never in-memory), matching the "always re-query the DB" discipline `lib/extraction/run-stage.ts` established.

## N. File inventory

```
prisma/migrations/20260825210000_add_autonomous_ingestion_foundation/migration.sql

lib/connectors/{types,edgar-connector,csv-financial-connector,csv-parse,upload-connector,dedup,registry,ingestion}.ts

scripts/verify-edgar-connector.ts

tests/connectors/{edgar-connector.integration,edgar-full-ingestion,csv-financial-connector,dedup,ingestion-stage-discipline,financial-fact-review,registry,upload-connector}.test.ts

app/[companyId]/onboarding/sources/{page,actions}.tsx
```

Also touched: `prisma/schema.prisma` (the new models + one additive enum value, §B), `lib/extraction/schemas.ts` (`FinancialFactValueSchema`, §C), `lib/onboarding/review.ts` (`VALUE_SCHEMA_BY_KIND` entry, §C — `reviewCandidate()` itself unmodified), `app/[companyId]/onboarding/review/page.tsx` (one label-map entry), `lib/extraction/parse.ts` (additive HTML support, §D/§M), `app/[companyId]/onboarding/page.tsx` (one new stage-list entry pointing at `/sources`).

## O. Deployment reality — what remains unverified pending real Vercel deployment

Same posture every prior phase report has honestly carried forward:

- **`EdgarConnector` itself IS verified end-to-end from this sandbox** — real SEC.gov, no mocks (§I). This is the one connector in this whole codebase's onboarding pipeline that has actually been exercised against its real, live upstream — unlike `AnthropicExtractionProvider`/`VercelBlobStorageProvider`, which remain unverified for the same reason every prior phase report names (no credentials available in this sandbox).
- **`CsvFinancialConnector`/`UploadConnector`** are pure local logic (no external dependency) — fully verified by their own unit tests; there is nothing further to verify against a live deployment.
- **The `/[companyId]/onboarding/sources` UI** was verified via `npm run build`'s successful compilation and by its server actions being thin, directly-tested wrappers over `lib/connectors/**` — it was **not** click-tested in a live browser (no browser available in this sandbox, the same limitation Phase 2's own report documents for its own UI).
- No new environment variables were introduced — EDGAR needs no credential, and `.env.example` is unchanged.

---

**Regression summary for the orchestrating session**: 380/380 vitest (335 baseline + 45 new, all passing including 8 tests that make REAL network calls to live SEC.gov), `tsc`/`eslint` clean, golden-test harness UNCHANGED for both Coherent and Matthews, `npm run build` clean, live Coherent/Matthews data UNCHANGED, zero company-specific branching anywhere in the new code.
