# Headroom — Document Onboarding Pipeline: Phase 1 Foundation

**Status: IMPLEMENTED.** This document reports code actually written, migrated, tested, and executed against a real Postgres database — not a design or plan. It covers Phase 1 only (schema, document storage, parsing/chunking, the extraction-provider abstraction, staged LLM extraction, and candidate persistence). Phase 2 (review UI, promotion-to-active-config, onboarding wizard UI, financial onboarding, acceptance tests) is explicitly out of scope and was not touched — see §H.

The product goal this unblocks: today a company can only be added to Headroom by an engineer writing a company-specific population script (Coherent and Matthews were both onboarded this way). This phase builds the foundation for a real UPLOAD → PARSE → EXTRACT → REVIEW → APPROVE → PROMOTE → ACTIVATE pipeline so a new company's credit agreement/indenture can be onboarded through the product itself, with zero company-specific source code.

---

## A. Baseline

Captured before any implementation code was written:

| Check | Result |
|---|---|
| `prisma migrate status` | 13 migrations, "Database schema is up to date!" |
| `prisma validate` | valid |
| Full vitest suite | **266/266 passing** (25 test files) |
| `tsc --noEmit` | clean |
| ESLint | clean |
| Golden-test harness | Coherent 26 passed / 3 failed / 1 flagged / 0 errored; Matthews 2 passed / 4 failed / 10 flagged / 2 errored |

## B. Schema changes

One additive migration: `prisma/migrations/20260825190617_add_document_onboarding_pipeline_foundation/migration.sql`, hand-written (this sandbox's `prisma migrate dev` is non-interactive-hostile — see the repo's own established pattern) and applied with `prisma migrate deploy`.

**Extended existing models (additive only):**
- `DocumentType` — added `AMENDMENT`, `INTERCREDITOR_AGREEMENT`, `COMPLIANCE_CERTIFICATE` (same `ALTER TYPE ADD VALUE` pattern as `ExternalInputKind.PUBLIC_FILING_RECONSTRUCTION`).
- `Document` — added `storageRef`/`storageProvider`/`originalFilename`/`uploadedAt` (upload/storage provenance, all nullable), `source` (defaults to `"engineer-authored"` for every pre-existing row; the upload flow will pass `"user-upload"` explicitly), `typeConfirmedByUser`/`amendmentRelationshipConfirmedByUser` (both default `true` for every pre-existing row — Coherent/Matthews' `type`/`supersedesDocumentId` were set directly by an engineer reading the executed document, not proposed-then-reviewed by this pipeline, so they are already "confirmed" in the sense these flags record). `Document.supersedesDocumentId`/`effectiveFrom`/`effectiveTo` — the existing amendment-precedence mechanism — were **not** touched or duplicated.
- `Company` — added `onboardingStatus` (enum `ONBOARDING | ACTIVE_WITH_LIMITATIONS | ACTIVE`, default `ACTIVE` for existing rows), `currency` (default `"USD"`), `asOfDate`.
- `Facility.originatingPermissionIds` — confirmed already present (verified against the live schema before writing anything); no duplicate field added.

**New models** (all additive, zero rows for Coherent/Matthews as of this migration):
- `DocumentChunk` — `documentId`, `chunkIndex`, `page?`, `articleRef?`, `sectionRef?`, `heading?`, `text`, `charStart?`, `charEnd?`. Indexed on `documentId`.
- `ExtractionRun` — `companyId`, `documentId` (the one document this run's chunks are read from), `provider`, `model`, `promptVersion`, `schemaVersion`, `startedAt`, `updatedAt`.
- `ExtractionStage` — `extractionRunId`, `stage` (enum), `status` (enum `PENDING|IN_PROGRESS|COMPLETE|FAILED`), `error?`, `attemptCount`, `startedAt?`, `completedAt?`. **Unique on `(extractionRunId, stage)`** — the partial-failure/retry unit; a retry updates this row in place, never duplicates it.
- `ExtractionCandidate` — the single, `kind`-discriminated candidate table (used the task's own explicit permission for "a simpler normalized equivalent" instead of 8 separate `Candidate*` tables, matching this codebase's existing `EligibilityCondition.kind`/`RuleActivationCondition.predicateConfig` pattern). Fields: `extractionRunId`, `extractionStageId`, `companyId`, `kind` (enum, 8 members), `sourceDocumentId`, `sourceChunkIds[]`, `sourcePage?`, `sourceSectionRef?`, `sourceExcerpt?`, `proposedValue` (JSON, zod-validated before write), `confidence?`, `rationale?` (short, structured — never chain-of-thought), `reviewStatus` (enum, default `PENDING`), `reviewerEditedValue?` (never overwrites `proposedValue`), `reviewedAt?`, `reviewedBy?` (never fabricated), `promotedAt?`/`promotedToId?` (unused columns for Phase 2 to fill), `createdAt`, `updatedAt`.

### Stage → candidate-kind mapping

| `ExtractionStageKind` | Candidate `kind`(s) it produces |
|---|---|
| `STRUCTURE` | `DOCUMENT_RELATIONSHIP` — proposed `Document.type` + `supersedesDocumentId` + article/section outline, exactly what `Document.typeConfirmedByUser`/`amendmentRelationshipConfirmedByUser` gate |
| `DEFINITIONS` | `DEFINED_TERM` |
| `PERMISSIONS` | `PERMISSION`, `COLLATERAL_SCOPE` |
| `RELATIONSHIPS` | `RELATIONSHIP`, `SHARED_CONSTRAINT`, `ACTIVATION_CONDITION` |
| `COVERAGE` | `PERMISSION` (a `KNOWN_NOT_MODELED` gap placeholder — `reviewStatus: REVIEW_REQUIRED`, derived from the proposal's own `modelingStatus`, not from which stage produced it) |
| `FINANCIAL_INPUTS` | `EXTERNAL_INPUT_REQUIREMENT` |

`GoldenTest` proposals were deliberately **not** built here — Phase 2's job, reusing `GoldenTest`/`stableKey` directly.

## C. Document storage abstraction (`lib/document-storage/**`)

```ts
export interface DocumentStorageProvider {
  store(params: { companyId: string; filename: string; contentType: string; data: Buffer }): Promise<{ storageRef: string; provider: string }>;
  retrieve(storageRef: string): Promise<Buffer>;
}
```

- **`VercelBlobStorageProvider`** (`@vercel/blob@2.8.0`) — every write uses `access: 'private'` + `addRandomSuffix: true`. **Precisely what this buys you**: 2.8.0 genuinely supports a private access tier — `get()` requires the store's own read-write token, not merely an unguessable public pathname (older Blob SDK versions were limited to the latter). That said, the guarantee this pipeline actually depends on is **not** Vercel Blob's own ACL nuance — `retrieve()` is the only code path that ever calls `get()`, and every caller of it must run server-side (a route handler or server action, never a client component); `storageRef` (the blob's own URL) must never reach a client bundle. That discipline is enforced by convention, not by the type system, and Phase 2's upload/review routes must uphold it. **Unverified end-to-end from this sandbox** — no live Vercel Blob store is reachable here; written and type-checked against the package's own published types (read from `node_modules/@vercel/blob/dist`, never guessed), confirmed to compile cleanly, and its request-shaping logic is covered by `tests/document-storage/vercel-blob-provider.test.ts` (stubbed `put`/`get`). Live behavior can only be confirmed once deployed with real Vercel credentials.
- **`LocalFilesystemStorageProvider`** — dev/test fallback under gitignored `.local-blob-storage/`, sanitizes both `companyId` and `filename` as path segments (path-traversal-safe — tested). Used automatically whenever `BLOB_READ_WRITE_TOKEN` is unset.
- **`getDocumentStorageProvider()`** — the **only** place in this codebase that branches on environment (`BLOB_READ_WRITE_TOKEN` presence) to pick an implementation.

## D. Document parsing (`lib/extraction/parse.ts`)

- **PDF**: [`unpdf`](https://www.npmjs.com/package/unpdf) — zero hard dependencies (its only dependency, `@napi-rs/canvas`, is an *optional peer* needed only for image rendering, which this file never calls), a serverless-optimized PDF.js build with no native addon to compile. Chosen specifically because a `pdf-parse`/`canvas`-style native-binding library would break in Vercel's serverless runtime. `extractText(pdf, { mergePages: false })` gives per-page text directly, which is what `DocumentChunk.page` needs.
- **DOCX**: [`mammoth`](https://www.npmjs.com/package/mammoth) — also pure JS, no native deps. `extractRawText()` only — this pipeline needs prose, not visual formatting.
- **TXT**: read directly, no library.
- Unsupported content types **throw**, never silently return empty text.

Tested against real, byte-accurate, hand-built fixture files (`tests/extraction/fixtures/build-pdf.ts` computes actual xref offsets; `build-docx.ts` builds a genuine OOXML zip via `jszip`) — unpdf/mammoth actually parse these, not stubs.

## E. Chunking (`lib/extraction/chunk.ts`)

A pragmatic regex/heuristic segmenter — deliberately **not** a general-purpose NLP layout parser and **not** a vector-embeddings/retrieval-index pipeline ("not infrastructure for its own sake"). Recognizes `ARTICLE <roman-or-digit>`, `SECTION <n.n>`, and standalone ALL-CAPS heading lines; tracks `articleRef`/`sectionRef`/`heading` state across boundaries (an Article boundary resets `sectionRef`, so a stale prior-Article section number never leaks forward). Oversized sections (>6000 chars) are sub-split into overlapping (500-char) windows so a cross-reference near a sub-split boundary stays interpretable from either side. Un-headed preamble text is kept, not dropped. Every chunk carries `page`/`charStart`/`charEnd` provenance that round-trips exactly against the source text.

## F. Extraction provider abstraction (`lib/extraction/provider.ts`, `schemas.ts`, `synthetic-provider.ts`, `anthropic-provider.ts`)

```ts
export interface ContractExtractionProvider {
  extractDocumentStructure(input: StructureExtractionInput): Promise<StructureExtractionResult>;
  extractDefinitions(input: DefinitionExtractionInput): Promise<DefinitionExtractionResult>;
  extractPermissions(input: PermissionExtractionInput): Promise<PermissionExtractionResult>;
  extractRelationships(input: RelationshipExtractionInput): Promise<RelationshipExtractionResult>;
  extractCoverageGaps(input: CoverageGapInput): Promise<CoverageGapResult>;
  extractFinancialInputs(input: FinancialInputExtractionInput): Promise<FinancialInputExtractionResult>;
}
```

Each stage's input carries this document's own `ChunkRef[]` (id/page/articleRef/sectionRef/heading/text) plus the prior stage's already-**persisted** context (never in-memory state threaded across calls — `lib/extraction/run-stage.ts` always re-queries the database, which is what makes retry-from-persisted-state possible). `RELATIONSHIPS`/`COVERAGE` additionally read company-wide context (every candidate the company has from its *other* extraction runs too), since a cross-document relationship or a coverage gap can only be detected by looking beyond one document.

Every stage's output shape is a `zod` (v4) schema in `schemas.ts` — one `*ProposalSchema` per candidate kind, composed into one `*StageResultSchema` per stage (a `z.union` where a stage can produce more than one kind). `z.record()` uses v4's two-argument form throughout.

- **`SyntheticExtractionProvider`** — fully deterministic, zero network calls, company-agnostic by construction (every proposal is derived from generic textual patterns already in the chunk text — Article/Section markers, `"Term" means` sentences, dollar-figure mentions, Lien/Indebtedness keywords — never from `companyId`/`documentId` branching). `extractPermissions` only proposes a `MODELED` candidate when a concrete dollar figure anchors `thresholdValue`; a keyword-only match with no figure is left genuinely unmodeled, which is exactly what `extractCoverageGaps` exists to flag as a `KNOWN_NOT_MODELED` placeholder instead of a fabricated `$0`/low-confidence "modeled" row. This is what this repo's own tests use, and what a later phase's synthetic-company acceptance test is expected to build on.
- **`AnthropicExtractionProvider`** — the real implementation, `@anthropic-ai/sdk@0.120.0`. Every stage is one `client.messages.parse()` call with `output_config: { format: zodOutputFormat(<stage schema>) }` — the SDK's own recommended structured-outputs path. Deliberately never sets `thinking` — the response is exactly the parsed JSON object, so there is no reasoning-trace content to strip in the first place; `ExtractionCandidate.rationale` is capped at 1000 chars by the schema as a second line of defense. Model: `EXTRACTION_MODEL` env var, defaulting to `claude-opus-5` (Anthropic's current, most capable generally-available model as of this writing — see `shared/live-sources.md` in the `claude-api` skill for how this was confirmed, not guessed). Auth: `ANTHROPIC_API_KEY`, the SDK's own standard env var. **Unverified end-to-end from this sandbox** — no `ANTHROPIC_API_KEY` is available here; written and type-checked against the SDK's own published types (read from `node_modules/@anthropic-ai/sdk`), confirmed to compile cleanly. Live behavior can only be confirmed once deployed with real credentials.

Regardless of which provider produced a result, `lib/extraction/run-stage.ts` **independently re-validates** the full `{ candidates: [...] }` envelope against the matching schema before persisting anything — a provider's own validation (the SDK's, for Anthropic; none, for Synthetic) is never trusted as sufficient on its own.

## G. Staged execution + partial failure/retry (`lib/extraction/run-stage.ts`, `pipeline.ts`)

`runExtractionStage(extractionRunId, stage, provider)`:
1. Loads the `ExtractionStage` row (throws if it doesn't exist yet); **refuses outright** (`StageAlreadyCompleteError`) if already `COMPLETE` — a completed stage's candidates can never be silently clobbered by re-invoking this function.
2. Marks `IN_PROGRESS`, increments `attemptCount`.
3. Assembles the stage's input by querying `DocumentChunk` rows for this document and prior-stage `ExtractionCandidate` rows (this run's own, plus company-wide where the stage needs it) — always from the database, never from in-memory state passed between calls.
4. Calls the matching `ContractExtractionProvider` method.
5. Re-validates the result against the stage's zod schema.
6. On success: in one transaction, deletes this stage's own prior candidates (a no-op in the normal case, since nothing is persisted before a successful validation), inserts the new candidates (`reviewStatus` derived from `modelingStatus`, never fabricated), and marks the stage `COMPLETE`.
7. On **any** failure (provider error, schema violation, thrown exception): marks the stage `FAILED` with a clear `error`, leaving every sibling stage's row and every already-persisted candidate from a prior successful stage **completely untouched**.

`createExtractionRun()` creates the run + its six `PENDING` `ExtractionStage` rows. `runAllPendingStages()` drives `STAGE_ORDER` (`STRUCTURE → DEFINITIONS → PERMISSIONS → RELATIONSHIPS → COVERAGE → FINANCIAL_INPUTS`), skipping already-`COMPLETE` stages and stopping at the first `FAILED` one (a later stage's input depends on an earlier stage's output, so continuing past a failure would only produce context-starved results) — it does not itself retry; calling `runExtractionStage` again on the fixed cause does.

**Proven with a real test** (`tests/extraction/run-stage.test.ts`, against live Postgres): `STRUCTURE` completes → `DEFINITIONS` is forced to fail → `STRUCTURE`'s row/candidates are unchanged → `DEFINITIONS` is retried and completes → `STRUCTURE` is *still* unchanged → re-running `STRUCTURE` (already `COMPLETE`) is refused.

## H. What Phase 1 explicitly does NOT build

Per the task brief, left entirely alone: the review workspace UI, review actions (approve/edit/reject), the promotion-to-active-config transaction, coverage-gate integration after promotion, financial onboarding UI, instrument mapping UI, golden-test proposal generation, `/companies/new` or `/[companyId]/onboarding` routes, and any full end-to-end acceptance test. `ExtractionCandidate.promotedAt`/`promotedToId` exist as unused columns for Phase 2 to fill. Nothing in this phase writes to `Permission`/`PermissionRelationship`/`SharedCapacityConstraint`/etc. — every extracted fact lands in `ExtractionCandidate` with `reviewStatus: PENDING` (or `REVIEW_REQUIRED`), full stop.

## I. Hard constraints — confirmed

- **Company agnosticism**: zero `companyId === "..."`-shaped branching anywhere in `lib/document-storage/**` or `lib/extraction/**`; every function takes `companyId`/`documentId` as plain parameters.
- **Fail closed**: no fabricated high `confidence`; a `KNOWN_NOT_MODELED`/no-evidence case is explicitly flagged (`REVIEW_REQUIRED`), never silently treated as "not applicable."
- **AI does not become the solver**: nothing here writes a real `Permission`/etc. row.
- **Untouched**: `lib/solver/**`, `lib/covenant-engine.ts` logic (one type-only enum widening — see §J), `lib/financial-core/**` logic, `app/**`, `components/**`, and all existing Coherent/Matthews data/golden-test rows.
- **No secrets committed**: `.env.example` documents `BLOB_READ_WRITE_TOKEN`/`ANTHROPIC_API_KEY`/`EXTRACTION_MODEL` names only.

## J. One unavoidable touch to `lib/covenant-engine.ts`

`DocumentType`'s additive enum values (§B) broke `tsc --noEmit` on `tests/versioning.test.ts`, because `lib/covenant-engine.ts` hand-rolls its own `DocumentType` union type (a structural mirror of the Prisma enum, used for typing query results) rather than importing the Prisma-generated one. Widened that one type alias to include the three new members — **type-only, zero logic touched** — with a comment explaining why. This was the narrowest possible fix to keep the regression suite's own `tsc --noEmit` clean, which the task requires.

## K. Regression suite — final state

| Check | Result |
|---|---|
| `npx prisma validate` | valid |
| `npx prisma migrate status` | 14 migrations, up to date |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx vitest run` | **310/310 passing** (32 test files — 266 pre-existing + 44 new) |
| `npx tsx scripts/golden-test.ts coherent` | 26 passed / 3 failed / 1 flagged / 0 errored — unchanged |
| `npx tsx scripts/golden-test.ts matthews` | 2 passed / 4 failed / 10 flagged / 2 errored — unchanged |
| `npm run build` | see final commit's report |

## L. File inventory

```
prisma/migrations/20260825190617_add_document_onboarding_pipeline_foundation/migration.sql
lib/document-storage/{types,local-fs-provider,vercel-blob-provider,index}.ts
lib/extraction/{parse,chunk,schemas,provider,synthetic-provider,anthropic-provider,run-stage,pipeline,persist-chunks}.ts
tests/document-storage/{local-fs-provider,vercel-blob-provider,factory}.test.ts
tests/extraction/{parse,chunk,schemas,run-stage}.test.ts
tests/extraction/fixtures/{build-pdf,build-docx}.ts
```

Also touched: `lib/covenant-engine.ts` (§J, type-only), `.eslintrc.json` (`root: true` — an unrelated worktree/`npm install` interaction, not a pipeline change; see the commit that introduced it), `.gitignore` (`.local-blob-storage/`), `.env.example` (new env var names).
