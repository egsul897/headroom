# Track D — Gibraltar DEVELOPMENT execution

Tip base `62a40be22b9598d9732e9ce2574d86d2228d6270`. Soft gate. **DEVELOPMENT ≠ CERTIFIED.** **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

Owner grant sha256 `4a5f26122c64fd67539831bd8464e01e2229f5f3e527de4fdb4777d68a54445a` (`docs/architecture/OWNER-GIBRALTAR-DEVELOPMENT-GRANT-2026-10-07.md`). Arch FROZEN sha256 `f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3`. `HOLD_FROZEN_BODY_ABSENT` is superseded.

The reserved blind package was not opened.

## PROVIDER_EXECUTION_REQUIRED

```
PROVIDER_EXECUTION_REQUIRED
provider: VERCEL_AI_GATEWAY
model: anthropic/claude-sonnet-5
command: AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts
workflow: getStageCaller selects VERCEL_AI_GATEWAY when AI_GATEWAY_API_KEY is set. Model is DEFAULT_GATEWAY_ANALYZER_MODEL unless ANALYZER_MODEL is set. runDiscoveryPipeline calls runPassBSemanticClassification once per Pass A section (stage covenant_discovery_section). Pass C and Pass D run in that same call after real Pass B items return. SyntheticStageCaller is not used.
expected maximum cost: 181.67 USD
pipeline stage unlocked: PASS_B_SEMANTIC_CLASSIFICATION
```

The ceiling is the pre-dispatch reservation in `reservedMaxInputTokens` plus `DEFAULT_MAX_TOKENS` (128000) priced by `maxCostOfRequestUsd` on rate card `headroom-pricing.v1 (2026-09)` for `anthropic/claude-sonnet-5`, summed over 141 Pass A sections. It is the code's own maximum, not a typical invoice. That figure is what the no-key preflight prints. Haiku is not on the rate card, so the preflight does not reprice it.

## Haiku Pass B

`ANALYZER_MODEL=anthropic/claude-haiku-4.5` through `VERCEL_AI_GATEWAY`. One structured-output probe succeeded, then `execute-gibraltar.ts` called all 141 Pass A sections. `passB.terminal` is `PASS_B_REAL_PROVIDER`. `modelCalls` 141. `sectionFailures` 0. `finalCandidateCount` 838. `syntheticInvented` false. `certified` false. `pinnedOffline` false. No pin. No matrix row. The gateway key is not in the record.

The writer does not persist token totals, and `priceUsage` returns `UNKNOWN_MODEL` for this id, so this file does not state a dollar invoice. Investigation rows still store `discoveryId: null`. This run's writer dropped `providerScopedCandidates` before writing the file. A later commit returns that array, and a merge must not fill it with the refusal path's empty list. The 838 candidates are counted and not listed.

## Offline stages that ran

`scripts/p3-development-pipeline/execute-gibraltar.ts` re-parsed the in-repo HTML with `parseDocument`, then ran `chunkDocument`, `parseDocumentStructure`, `detectStructuralDefinitions`, `detectStructuralReferences`, `buildStructuralIndex`, and `runPassADeterministicSignals` on `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/`.

HTML sha256 and extracted-text sha256 match `provenance.json`. Counts match the #112 structure summary: 1,029,323 characters, 511 chunks (444 with a section ref), 2,087 nodes, 564 definitions, 1,459 references (491 resolved), 946 Pass A candidates. Supersession index was empty, so Pass A status is `UNKNOWN_SUPERSESSION_STATUS`. Record: `development-pipeline/execution.json`.

Pass B minted discovery ids and assigned semantic roles. Those are DEVELOPMENT output. No pin. No matrix row. `eligible` was not set true.

## Investigations

**Builders.** The phrase "Available Amount Builder Basket" occurs on two nodes. The definition node cites Section 7.05(a)(y). `resolveUniqueNodeByRef` of `7.05(a)(y)` is `NOT_FOUND`. The operative sentence is node `structural-node:99a53df526604251c4688760`, section ref `7.05(a)(4)(ii)(vi)(B)`, 95 characters: the greater-of prong printed as clause `(B)` under `(vi)`, whose own text says "the foregoing clause (y)". Pass A `builder_language` also fires on "cumulative" and on "Retained Excess Cash Flow". Those hits are the existing generalized signal. No role `BUILDER` was assigned.

**Reclass.** Seven own-text windows match the existing reclass heuristic. The §7.01 windows are `7.01(b)(a)`, `7.01(b)(b)`, and `7.01(b)(j)`. The first two mention a Section reference, so they are not category-only. No `RECLASSIFIABLE_TO` edge was written. Category labels were not mapped to `targetRuleId`. The identifier `PHASE3_CATEGORY_RECLASS_UNSUPPORTED` is not in this tip, and this run does not mint it.

**Asset dispositions.** Bare ref `7.04` is `AMBIGUOUS`: a 39-character table-of-contents node and a 5,767-character "Asset Dispositions" body. Neither was selected.

No generalized code change follows. The resolver already refuses the missing `(y)` cite and the duplicate `7.04` label. Rewriting the printed `(vi)` marker from the parenthetical, or picking the longer `7.04` span, would be a silent choice the current index does not make.
