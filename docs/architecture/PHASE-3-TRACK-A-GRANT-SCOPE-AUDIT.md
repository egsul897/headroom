# Audit finding — PHASE-3-TRACK-A frozen grant scope

**Status:** finding only. The frozen grant is not amended by this document. Soft gate. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.

## What is frozen

`docs/architecture/PHASE-3-TRACK-A.FROZEN.md` is the grant preimage. Its bytes are not edited here. This finding does not say that the implementation merged in #130 was authorized by that grant.

## Historical violation

PR #130 merged at `857804867ae19efb3d502628a513bd0c94bcc2e2`. The implementation commit inside that history is `aec5010eca0f7bc95cb1c4fe8ac785399354b35c`.

The frozen grant's invent-safe file scope is workflow and test paths only. Its CI item is a soft-gate path filter plus `npx vitest run tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts`. Its residual describes sufficiency PARTIAL for the qualitative pair and says ambiguous attribution leaves the input unchanged.

`aec5010` changed compiler behavior in:

- `lib/contract-model/compiler/semantic/unlimited-carveout-honesty.ts`
- `lib/contract-model/compiler/semantic/normalize.ts`
- `lib/contract-model/compiler/semantic/types.ts` (`semantic-accountability-compiler.v12`)

and appended the suite to `npm run test:phase3-certification`, which `.github/workflows/canonical-compiler.yml` runs in the job named `certified path (provider-free)`. No soft-gate workflow gained a path filter or a dedicated invocation of the suite.

That is outside the frozen grant. Merging #130 did not rewrite the grant into an authorization.

## This follow-up

Current `main` still dropped an UNSUPPORTED condition when excerpt and description were exactly the two qualitative gates while `expression`, `referencesDefinitionId`, `referencesRuleTargets`, `evaluationBasis`, or a non-gate `rawModelExcerpt` carried a further restriction. A clause excerpt with an independent restriction suppressed the manner gate. A selected pair whose `bindExcerpt` returned null left sufficiency COMPLETE.

Those paths are remediated on a later commit. The compiler algorithm version moves to `semantic-accountability-compiler.v13` so a v12 cache is not served. Prompt version stays `semantic-accountability-compiler-prompt.v9`. The suite is invoked from `p3-r0-soft-gate`. That invocation is a soft gate. It is not certification credit.
