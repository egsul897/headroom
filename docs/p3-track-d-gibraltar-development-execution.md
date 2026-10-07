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

`ANALYZER_MODEL=anthropic/claude-haiku-4.5` through `VERCEL_AI_GATEWAY`. The persisted rerun is `PASS_B_REAL_PROVIDER`. `modelCalls` 140. `sectionFailures` 1. `finalCandidateCount` 842. `inputTokens` 433,957. `outputTokens` 172,238. `syntheticInvented` false. `certified` false. `pinnedOffline` false. No pin. No matrix row. The gateway key is not in the record. The writer stores the failure count and does not store which section failed.

`priceUsage` returns `UNKNOWN_MODEL` for this id. List prices in `scripts/semantic-accountability-cost-plan.ts` are $1 per million input and $5 per million output. On the stored token counts that is $1.30. That is a list-price arithmetic, not a rate-card invoice.

`discoveredCandidates` holds all 842 rows. `providerScopedCandidates` holds the 42 rows whose role is `BUILDER`. No row carried family `ASSET_SALES` or `DISPOSITIONS`. Investigation rows still store `discoveryId: null` and do not seal a role.

## Cross-cut read

The read uses the persisted rows. It does not write an edge, select a node, or seal a role.

**Builders.** 42 rows have role `BUILDER`. Zero of them sit on the two nodes that contain the phrase "Available Amount Builder Basket". Fifteen rows have a `7.05` source ref. One of those is role `BUILDER` and describes the 50% Consolidated Net Income prong. One `FINANCIAL_TEST` at `7.05` names the Available Amount Builder Basket inside a capacity formula. The cite `7.05(a)(y)` remains `NOT_FOUND`.

**Reclass.** One persisted row intersects a reclass window: `7.05(c)`, role `EXCEPTION`, about payments outside Restricted Payments. The window's own text is the divide/classify/reclassify sentence. `reclassEdgeWritten` is false. No category was mapped to a target rule.

**Asset dispositions.** Thirteen row-slots (eleven distinct discovery ids; two ids are repeated) match `7.04` or a `7.04` node. Roles include `GENERAL_PROHIBITION`, `PERMISSION`, `BASKET`, `EXCEPTION`, `CONDITION`, and `PROVISO`. Every one of those rows has an empty family list. Bare `7.04` remains `AMBIGUOUS`. `assetNodeSelected` is false.

No generalized code change follows. The resolver still refuses the missing `(y)` cite and the duplicate `7.04` label. Haiku's `BUILDER` labels on pro forma clauses are model output, not a reason to retarget the phrase nodes.

## Verification reservation

Verification was not run. There is no verification command in `scripts/p3-development-pipeline/`. The reservation treats each of the 842 discovery rows as one compiled candidate, which these rows are not.

| Basis | USD |
|---|---|
| Sonnet, frozen Chewy observation: $0.3293 semantic review plus 5 × $0.0114 condition-suspicion | 325.26 |
| Same token observation scaled by Haiku list prices ($1/$5, half of Sonnet $2/$10) | 162.63 |

Source: `docs/phase-3-final-chewy/02-cost-preflight.json` and `scripts/semantic-accountability-cost-plan.ts`. Not a rate-card price. That table was the price of a review, not a compile.

## Compile-then-verify

`scripts/p3-development-pipeline/verify-gibraltar.ts` compiles each persisted Haiku row with `compileCovenantToIR` and, when that compile emits at least one rule or definition, calls `verifyCompiledCandidate`. The discovery id is the compiler's `candidateRef`. Operative text comes from the rebuilt structural index. No new discovery id is minted.

`priceUsage` has no Haiku card. Tokens are priced at the list rates in `scripts/semantic-accountability-cost-plan.ts` ($1 input / $5 output per million). The dry reservation from `scripts/p3-conmed-pilot/reservation-policy.ts` at those rates, with a 128000 output request, is $15.83484 for a typical row and $27.83484 for the largest. Across 788 dispatchable rows the sum is $12,561.65. Forty-five `REPRESENTATION` rows are skipped by `isEligibleForSemanticCompilation`. Nine duplicate discovery ids are kept once.

The run's hard ceiling is the $162.63 Haiku figure from the table above. Compilation and verification share it. A call is not started when its reservation would meet that ceiling. The first section, `7.05(c)`, executed 11 shard attempts against the CONMED conversation cap of 5 and spent $1.05. That cap is recorded and does not stop this run. Input-token or output-token exceedance still stops it. The 480s abort cut that section off with no rules (`SHARD_INCOMPLETE`). Later attempts use a 15 minute abort. The dollar reservation is unchanged, because output was already capped at 128000 tokens.

Cross-cut order is the phrase nodes, then reclass windows, then `7.04`, then `7.05`, then the rest. No persisted row sits on either phrase node, so nothing was dispatched at that rank.

Results below are list-price charges from the in-progress record `development-pipeline/verification.json`. DEVELOPMENT. `certified` false. `pinnedOffline` false. `eligibleClaimed` false. No pin.

| Section | Chars | Compile | Verify | Compile list price |
|---|---:|---|---|---:|
| 7.05(c) | 4,626 | FAILED, 0 rules (two attempts; first cut off at 480s) | not called | 2.6444 |
| 7.04 | 39 | PARTIAL, 4 / 10 / 7 rules | MATERIAL_DISCREPANCY | 0.8580 |
| 7.04 | 39 | FAILED, 0 rules | not called | 0.3550 |
| 7.04(a) | 5,722 | PARTIAL, 4 rules | MATERIAL_DISCREPANCY | 0.6677 |
| 7.04(a)(1) | 568 | FAILED, 0 rules | not called | 0.0611 |
| 7.04(a)(2) | 2,573 | REVIEW_REQUIRED, 1 rule | MATERIAL_DISCREPANCY | 0.1266 |
| 7.04(a)(2)(i) | 20 | FAILED, 0 rules | not called | 0.1394 |

The three 39-character `7.04` rows are the table-of-contents line `Section 7.04 Asset Dispositions 233`. The verifier's findings say that heading is the operative text and the compiled rules add content the line does not contain. The longer `7.04` body was not selected. `7.04(a)` and `7.04(a)(2)` also verified as `MATERIAL_DISCREPANCY`. One finding quotes a compiled proviso that replaced the five deemed-cash clauses with placeholder tests. Committed list price at this snapshot is $5.07 of $162.63. The process is still dispatching. Uncalled rows are not evidence of absence.

## Offline stages that ran

`scripts/p3-development-pipeline/execute-gibraltar.ts` re-parsed the in-repo HTML with `parseDocument`, then ran `chunkDocument`, `parseDocumentStructure`, `detectStructuralDefinitions`, `detectStructuralReferences`, `buildStructuralIndex`, and `runPassADeterministicSignals` on `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/`.

HTML sha256 and extracted-text sha256 match `provenance.json`. Counts match the #112 structure summary: 1,029,323 characters, 511 chunks (444 with a section ref), 2,087 nodes, 564 definitions, 1,459 references (491 resolved), 946 Pass A candidates. Supersession index was empty, so Pass A status is `UNKNOWN_SUPERSESSION_STATUS`. Record: `development-pipeline/execution.json`.

Pass B minted discovery ids and assigned semantic roles. Those are DEVELOPMENT output. No pin. No matrix row. `eligible` was not set true.

## Investigations

**Builders.** The phrase "Available Amount Builder Basket" occurs on two nodes. The definition node cites Section 7.05(a)(y). `resolveUniqueNodeByRef` of `7.05(a)(y)` is `NOT_FOUND`. The operative sentence is node `structural-node:99a53df526604251c4688760`, section ref `7.05(a)(4)(ii)(vi)(B)`, 95 characters: the greater-of prong printed as clause `(B)` under `(vi)`, whose own text says "the foregoing clause (y)". Pass A `builder_language` also fires on "cumulative" and on "Retained Excess Cash Flow". The Haiku read did not place role `BUILDER` on either phrase node.

**Reclass.** Seven own-text windows match the existing reclass heuristic. The §7.01 windows are `7.01(b)(a)`, `7.01(b)(b)`, and `7.01(b)(j)`. The first two mention a Section reference, so they are not category-only. No `RECLASSIFIABLE_TO` edge was written. Category labels were not mapped to `targetRuleId`. The identifier `PHASE3_CATEGORY_RECLASS_UNSUPPORTED` is not in this tip, and this run does not mint it.

**Asset dispositions.** Bare ref `7.04` is `AMBIGUOUS`: a 39-character table-of-contents node and a 5,767-character "Asset Dispositions" body. Neither was selected.

No generalized code change follows. The resolver already refuses the missing `(y)` cite and the duplicate `7.04` label. Rewriting the printed `(vi)` marker from the parenthetical, or picking the longer `7.04` span, would be a silent choice the current index does not make.
