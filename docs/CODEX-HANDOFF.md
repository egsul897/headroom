# Headroom — Engineering Handoff

Orientation doc for whoever (human or agent) picks this codebase up next. This
is not a phase report — those live individually under `docs/*.md` and are
linked below. This file is the map.

## What Headroom is

A covenant-capacity / financial-analytics platform: given a company's actual
credit agreements/indentures (modeled as `Permission`/`PermissionRelationship`/
`SharedCapacityConstraint`/`CollateralPool`/etc. rows) and its financial state,
it answers "how much more debt/liens can this company incur, under which
provision, and why" — with full source-provenance and fail-closed semantics
(an unmodeled or ambiguous provision is `NOT_TESTED`/`REVIEW_REQUIRED`, never
a fabricated `$0` or `Unlimited`).

## Architecture map

| Layer | Where | Docs |
|---|---|---|
| Deterministic solver (eligibility, election, stacking, coverage) | `lib/solver/**` | `docs/solver-architecture-design.md`, `docs/solver-implementation-phases-0-7-report.md`, `docs/solver-hardening-live-integration-report.md` |
| Legacy + solver-native covenant engine (capacity computation, coverage-gap fallback) | `lib/covenant-engine.ts` | `docs/legal-model-remediation-design.md` |
| Generalized financial analytics (liquidity/maturity/leverage, provenance-wrapped facts) | `lib/financial-core/**` | `docs/generalized-financial-analytics-architecture.md`, `docs/financial-core-vertical-slice-implementation.md` |
| App-facing aggregation (never compute in JSX) | `lib/dashboard-service.ts`, `lib/scenario-runner.ts` | `docs/phase10-product-ui-implementation.md` |
| Generalized product UI, any company via `[companyId]` routing | `app/[companyId]/{overview,capital-structure,capacity,simulate,documents}` | `docs/phase10-product-ui-implementation.md` |
| Document onboarding: storage, parsing/chunking, staged LLM extraction | `lib/document-storage/**`, `lib/extraction/**` | `docs/document-onboarding-pipeline-foundation.md` |
| Document onboarding: review, transactional promotion, financial/facility onboarding, wizard UI | `lib/onboarding/**`, `app/companies/new`, `app/[companyId]/onboarding/**` | `docs/company-onboarding-v1-implementation.md` |
| Golden-test / legal-review replay safety | `GoldenTest.stableKey` | `docs/database-replay-safety.md` |
| Legal-review status model (`VERIFIED` = founder's own review, always tooltip-explained) | `components/ui.tsx` (`LEGAL_REVIEW_STATUS_EXPLANATION`) | `docs/legal-review-status-model.md`, `docs/founder-legal-review-2026-08-25.md` |

Two live, fully-onboarded companies: **Coherent** (`coherent`) and **Matthews
International** (`matthews`) — both onboarded the *old* way (an engineer
reading executed filings and hand-writing a `scripts/populate-*.ts` script).
They are the ground truth the onboarding pipeline's own real-precedent
acceptance test (`scripts/onboarding-precedent-acceptance.ts`) is graded
against. **Never modify their data** except through a genuinely-generalized
code path that would apply identically to any company.

## Company onboarding pipeline — current state

The full UPLOAD → PARSE → EXTRACT → REVIEW → APPROVE → PROMOTE → ACTIVATE
workflow is implemented and locally verified (Phase 1 + Phase 2, see the two
docs linked above). A new company can be onboarded through the product itself
(`/companies/new` → `/[companyId]/onboarding` wizard) with **zero
company-specific source code**.

Two swappable factories, both following the same pattern (branch on an env
var's presence, nowhere else):
- `lib/document-storage/index.ts`'s `getDocumentStorageProvider()` — `Vercel
  Blob` (`BLOB_READ_WRITE_TOKEN` set) or local filesystem fallback
  (`.local-blob-storage/`, gitignored, dev/test only).
- `lib/extraction/get-provider.ts`'s `getExtractionProvider()` — the real
  `AnthropicExtractionProvider` (`ANTHROPIC_API_KEY` set) or
  `SyntheticExtractionProvider` (deterministic, regex-based, zero network
  calls — what every test and the acceptance scripts in this sandbox
  actually ran against).

**Neither `AnthropicExtractionProvider` nor `VercelBlobStorageProvider` has
ever been exercised against the real Claude API or a real Blob store.** No
API key or blob token has ever been available in the sandbox environment this
work was built in. Both are written and type-checked against the real
published SDK types (not guessed), and their request-shaping logic has unit
coverage against stubs, but live behavior is unverified. This is the single
most important thing for whoever deploys this next: **budget time to actually
exercise a real document upload → real Anthropic extraction → real Blob
storage round-trip against a live deployment before trusting it in
production.**

## Deployment state (as of this handoff)

- **Hosted Postgres (Neon)**: initialized and verified working — see
  `docs/database-replay-safety.md` and the `initialize-neon` GitHub Action
  (`.github/workflows/initialize-neon.yml`, `workflow_dispatch` only,
  already run successfully once). Contains Coherent + Matthews' full data,
  confirmed against the same baseline this sandbox's local DB carries.
- **Vercel deployment**: Vercel-readiness fixes (`postinstall: prisma
  generate`, `force-dynamic` on DB-backed static segments) are in place and
  were confirmed to fix the original build failure, but **this sandbox has no
  Vercel API/dashboard access and cannot confirm what SHA is actually live**,
  whether the onboarding pipeline's new routes/env vars work against the real
  deployment, or whether a real document has ever been onboarded through the
  live app. Treat "deployed" as unverified until someone with Vercel access
  confirms it directly.
- **Required env vars** (names only — see `.env.example`, never commit
  values): `DATABASE_URL` (Neon, pooled), `BLOB_READ_WRITE_TOKEN` (Vercel
  Blob — omit to silently fall back to local-fs storage, which does **not**
  work on Vercel's read-only/ephemeral filesystem, so this must be set for
  onboarding uploads to work in production), `ANTHROPIC_API_KEY` (omit to
  silently fall back to the synthetic provider, which produces low-fidelity,
  demo-quality extraction — see the precision/recall numbers in
  `docs/company-onboarding-v1-implementation.md` §I), `EXTRACTION_MODEL`
  (optional, defaults to `claude-opus-5`).

## Known limitations / next recommended work

1. **Verify `AnthropicExtractionProvider` and `VercelBlobStorageProvider`
   against real credentials once deployed** — the single highest-value next
   step; everything else in the pipeline is proven, this is the one
   real-world unknown.
2. **`SyntheticExtractionProvider`'s regex limitations**, documented in full
   in `docs/company-onboarding-v1-implementation.md` §I (no `$X,000,000`
   full-precision parsing, no `GREATER_OF_FLAT_OR_PCT_EBITDA` pattern
   recognition, no ratio-covenant recognition, plural "Liens" missed, no
   lettered-subclause citation precision) — irrelevant to production once
   `AnthropicExtractionProvider` is live, but worth knowing if the synthetic
   provider is ever used as a cheap fallback in production.
3. **Onboarding wizard UI has not been click-tested in a live browser** — the
   underlying server actions/data layer are proven by the acceptance test,
   but real-browser file-upload/form UX is unverified (no browser available
   in this sandbox).
4. **Golden-test proposal generation only covers cross-document
   secured/unsecured capacity** (2 rows per onboarded company) — the legacy
   `scripts/golden-test.ts` harness's other `queryType`s
   (`PROVISION_CAPACITY`/`DOCUMENT_CAPACITY`/`CROSS_DOCUMENT_CAPACITY`) only
   read the legacy, non-solver-native engine path, so a purely solver-native
   onboarded company can't be meaningfully golden-tested beyond
   `DEBT_SIMULATION` today — an existing architecture boundary, not a bug
   introduced by onboarding.
5. **Two parallel financial models remain unmerged**: `FinancialSnapshot`
   (legacy, what `lib/covenant-engine.ts` hard-requires) and `FinancialState`
   (`lib/financial-core/**`, the newer provenance-wrapped model). Onboarding's
   manual-entry action writes both from one form submission rather than
   unifying them — a real architectural debt, out of scope for this phase per
   its own "no unnecessary solver redesign" boundary.

## Non-negotiable conventions (read before changing anything)

- **No company-specific branching**, ever, anywhere (`if (companyId ===
  "coherent")` and equivalents are grep-checked as part of every phase's
  regression).
- **`VERIFIED` in the legal-review sense** (`GoldenTestStatus.VERIFIED`,
  `LegalReviewStatus.VERIFIED`) means Headroom founder's own review — always
  rendered with `components/ui.tsx`'s explanatory tooltip, never a bare
  label, never auto-set by any pipeline. A *different*, pre-existing
  `DefinedTermStatus.VERIFIED` (used by `DefinedTerm.status`,
  `Permission.reviewStatus`, `ExternalInputRecord.reviewStatus`) means plain
  data-fidelity confirmation and is a completely separate dimension — don't
  confuse the two enums.
- **`prisma migrate dev`/`db push` are non-interactive-hostile in this
  sandbox** — every migration in this repo was hand-written SQL applied with
  `prisma migrate deploy`. Keep doing that; never reset/force a real database.
- **Non-mutating scenarios** — `lib/scenario-runner.ts`'s simulate path must
  never persist by default.
- **AI never becomes the solver** — `lib/onboarding/promotion.ts` is the only
  code that ever turns an `ExtractionCandidate` into a real `Permission`/etc.
  row, and only for human-reviewed (`APPROVED`/`EDITED`) candidates.
