# Headroom — Precedent Comparison Intelligence

**Status: IMPLEMENTED.** Sidecar analysis over public credit-agreement and indenture source text. Zero Prisma migrations. Zero paid provider calls. Zero certification advancement. Production legal engine (`lib/covenant-engine.ts`, IR compiler, semantic-precedent store, solver) untouched.

---

## A. Mission result

Headroom can now compare how different public agreements draft the same covenant concept — retrieving by family and drafting features, surfacing common/uncommon patterns, exact textual diffs, dependency-aware views, amendment contrasts, and counterexamples — while **never** treating similar drafting as identical legal effect and **never** labeling model/heuristic summaries as reviewed precedent.

| Deliverable | Location |
|---|---|
| Precedent comparison API | `lib/precedent-comparison/api.ts` (`createPrecedentComparisonApi`) |
| Source-backed comparison records | `PrecedentComparisonRecord` in `types.ts` / produced by `compare.ts` |
| Exact textual differences | `lib/precedent-comparison/diff.ts` (token LCS) |
| Dependency-aware comparison views | `lib/precedent-comparison/dependency-view.ts` |
| Searchable examples corpus | `lib/precedent-comparison/corpus/public-credit-provisions.json` |
| Adversarial tests | `tests/precedent-comparison/adversarial.test.ts` |
| Capability tests | `tests/precedent-comparison/api.test.ts` |

## B. Hard constraints honored

1. **No production legal-engine modification** — no edits under `lib/covenant-engine.ts`, `lib/contract-model/compiler/**` (except reading evaluation-v2 signals as a knowledge interface), `lib/solver/**`, or `prisma/schema.prisma`.
2. **No competing database schema** — in-memory / file-backed corpus only (`PrecedentCorpus`), same persistence posture as Phase 3D semantic-precedent V1.
3. **Existing knowledge interfaces** — reuses `extractSignals` / `normalizeText` / `jaccard` from `lib/contract-model/evaluation-v2/signals.ts` (drafting-pattern detectors already proven on credit agreements and indentures).
4. **No paid calls** — deterministic feature detection and LCS only.
5. **No certification advancement** — no pin/cert/eval harness changes.

## C. Epistemic standing (every comparison)

| Standing | Meaning | May be labeled “reviewed precedent”? |
|---|---|---|
| `TEXTUAL_SIMILARITY` | Token/character overlap in source | No |
| `STRUCTURAL_SIMILARITY` | Shared drafting-feature fingerprint | No |
| `SEMANTIC_HYPOTHESIS` | Heuristic reading | **Never** |
| `SOURCE_SUPPORTED_LEGAL_DIFFERENCE` | Difference grounded in cited source excerpts | No (difference, not approval) |
| `REVIEWER_VERIFIED_CONCLUSION` | Requires `APPROVED_PRECEDENT` + attributable `reviewedBy` | Yes only then |

Corpus default for all public excerpts: `reviewStatus: SOURCE_ONLY`. The corpus store **throws** if `APPROVED_PRECEDENT` is added without `reviewedBy`.

## D. Capabilities mapped

| # | Capability | Mechanism |
|---|---|---|
| 1 | Retrieve by family + drafting features | `retrieveComparableProvisions` / `api.retrieve` |
| 2 | Common / uncommon patterns | `identifyDraftingPatterns` rarity bands |
| 3 | Debt, lien, investment, RP, asset-sale, affiliate, junior-debt-prepayment | Corpus families + `JUNIOR_DEBT_PREPAYMENT` feature on `MANDATORY_PREPAYMENTS` |
| 4 | EBITDA and leverage-ratio definitions | `DEFINITIONS_CALCULATION_RULES` + `EBITDA_METRIC` / `LEVERAGE_RATIO_METRIC` |
| 5 | Additional conditions in one but not the other | `asymmetricPhraseDiff` → `PROVISOS` / `CONDITIONS` / `EXCEPTIONS` claims |
| 6 | Borrower / guarantor / restricted-subsidiary / non-guarantor scope | Scope drafting features + `SCOPE` claims |
| 7 | Shared-capacity and reclassification rights | `SHARED_CAPACITY` / `RECLASSIFICATION_RIGHT` from evaluation-v2 signals |
| 8 | Materially different provisos / exceptions | Source-supported claims with verbatim excerpts |
| 9 | Original vs amendments | `compareOriginalAndAmendment` / `documentRole: AMENDMENT` |
| 10 | Counterexamples to proposed interpretations | `retrieveCounterexamples` against claimed necessary/absent features |

## E. Public corpus

27 source-backed excerpts from existing Headroom fixtures (CONMED 2025, FWRG 2021, LSB 2023), sliced from curated article/definition files already in `tests/fixtures/unseen-packages/**`. Every row carries `sourcePath`, `charStart`/`charEnd`, and verbatim `sourceText`. No invented operative language.

Corpus alignment notes (post-exploration cleanup):

- `fwrg-2021:6.07` is `FUNDAMENTAL_CHANGES` (header: Fundamental Changes; Disposition of Assets), tagged for asset dispositions — not a pure asset-sale basket.
- `fwrg-2021:6.08` is `QUALITATIVE_NEGATIVE_COVENANTS` (Restricted Debt amendment/waiver), not mandatory prepayment.
- Junior-debt-prepayment coverage uses `fwrg-2021:6.04b` (voluntary prepayment of Restricted Debt), `conmed-2025:7.9`, and `lsb-2023:6.08`.
- Pure `ASSET_SALES` comparison remains anchored on `conmed-2025:7.5`.

## F. Tests

```
npx vitest run tests/precedent-comparison
# 2 files, 21 tests — all passing
```

Adversarial coverage includes: near-identical drafting ≠ identical effect; hypothesis never “reviewed precedent”; APPROVED without reviewer refused; reviewer-verified only with attributable approval; additional conditions detected; scope divergence; shared-cap/reclass not auto-verified; default corpus all `SOURCE_ONLY`.

## G. Usage

```ts
import { createPrecedentComparisonApi } from "@/lib/precedent-comparison";

const api = createPrecedentComparisonApi();
const hits = api.retrieve({ covenantFamily: "INDEBTEDNESS", anyFeatures: ["RECLASSIFICATION_RIGHT"] });
const record = api.compare(hits[0].provision.provisionId, hits[1].provision.provisionId);
const view = api.dependencyView(record);
const counters = api.counterexamples({
  covenantFamily: "INDEBTEDNESS",
  claimedNecessaryFeatures: ["RECLASSIFICATION_RIGHT"],
});
```

## H. Explicit non-claims

- Not a substitute for legal review.
- Not an authoritative IR compilation path.
- Not a durable multi-tenant precedent store (that remains Phase 3D’s concern if/when persisted).
- Not certification evidence and not a paid-run artifact.
