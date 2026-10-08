# Track D — Gibraltar DEVELOPMENT execution

Soft gate. **DEVELOPMENT ≠ CERTIFIED.** **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

Owner grant sha256 `4a5f26122c64fd67539831bd8464e01e2229f5f3e527de4fdb4777d68a54445a` (`docs/architecture/OWNER-GIBRALTAR-DEVELOPMENT-GRANT-2026-10-07.md`). Arch FROZEN sha256 `f782f2f98537c8b76a8a4506c92a51e74c40a0a8eafd203b7343eaa0a21aede3`. `HOLD_FROZEN_BODY_ABSENT` is superseded.

The reserved blind package was not opened. This note separates an immutable historical Haiku run from the current provider-free record. The historical rows are not evidence for the current parser tree and cannot be promoted.

## Current provider-free record

Record: `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/execution.json`.

Regenerated with `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` unset, using the current parser. No paid inference. `passB.executed` is false. `passB.terminal` is `PROVIDER_EXECUTION_REQUIRED`. `discoveredCandidates` is empty. `providerScopedCandidates` is empty. `verificationReservation.executed` is false. `certified` is false. `discoveryIdsMinted` is false. `semanticRolesAssigned` is false. `providerExecutionIdentity` is `PROVIDER_EXECUTION_REQUIRED`. `verificationState` is `NOT_EXECUTED`.

```
PROVIDER_EXECUTION_REQUIRED
provider: VERCEL_AI_GATEWAY
model: anthropic/claude-sonnet-5
command: AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" npx tsx scripts/p3-development-pipeline/execute-gibraltar.ts
sectionsToCall: 121
expected maximum cost: 156.01 USD
pipeline stage unlocked: PASS_B_SEMANTIC_CLASSIFICATION
```

The ceiling is the pre-dispatch reservation in `reservedMaxInputTokens` plus `DEFAULT_MAX_TOKENS` (128000) priced by `maxCostOfRequestUsd` on rate card `headroom-pricing.v1 (2026-09)` for `anthropic/claude-sonnet-5`, summed over the 121 Pass A sections the current tree sends. It is the code's own maximum, not a typical invoice, and not a completed provider run. The earlier no-key preflight of 181.67 USD over 141 sections belonged to the pre-parser tree. Haiku is not on the rate card.

HTML sha256 `6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` and extracted-text sha256 `4131d3c166f8bddb6fe41d31f626057ec27c0d1ad4917ed2ce46d5b89986a5f5` match `provenance.json`. Parsed characters 1,029,323. Chunks 511 (444 with a section ref). Structural nodes 2,081. Definitions 564. References 1,459 (490 resolved, 146 unresolved, 823 ambiguous). Pass A candidates 943. Health findings 867. Supersession index empty, so Pass A status stays `UNKNOWN_SUPERSESSION_STATUS`.

The record binds those source hashes, parser code sha256 `dc3d8f873f8ec33aa67370216c4ea9e26a7ee55ede35463f4fe82bbc70a5b517` (`lib/contract-model/compiler/clause-hierarchy.ts`), the structural-tree hash, the Pass A candidate-set hash, `PROVIDER_EXECUTION_REQUIRED`, `verificationState` `NOT_EXECUTED`, and the producing-code hash of the pipeline sources. A provider candidate set whose parser or tree identity differs from this record is refused. The 2,064-node / 938-candidate figures belonged to the pre-correction tree and are not this record.

## Historical Haiku execution

Immutable audit copy: `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/historical/haiku-pass-b-2087-node-tree/execution.json`. Label file: `MANIFEST.json` in that directory. `label` is `HISTORICAL_PROVIDER_EXECUTION`. `promotable` is false. `currentTreeEvidence` is false.

That copy is the record committed at `fc530e18294c90c6a8f2b31acb93f5400e14ff5a`. It is not rewritten. It records 2,087 structural nodes, 946 Pass A candidates, and 842 Haiku candidates with `passB.terminal` `PASS_B_REAL_PROVIDER`. Provider `VERCEL_AI_GATEWAY`, model `anthropic/claude-haiku-4.5`, `modelCalls` 140, `sectionFailures` 1, `inputTokens` 433,957, `outputTokens` 172,238, `syntheticInvented` false. `providerScopedCandidates` holds 42 rows whose stored role is `BUILDER`. `verificationReservation.executed` is false. `certified` is false. No pin. No matrix row. The gateway key is not in the record. The writer stored the failure count and did not store which section failed.

Its parser identity and structural-tree identity are declared sentinels for the pre-parser 2,087-node tree (`HISTORICAL_PARSER_CODE_SHA256`, `HISTORICAL_STRUCTURAL_TREE_SHA256`). They are not hashes of the current parser, and they do not match the current record. Fail-closed checks reject those 842 candidates against the current parser and tree. Matching node ids whose stored section reference differs from the live tree are rejected. The historical file stays readable for audit and cannot be promoted to current-tree evidence or to certification.

`priceUsage` returns `UNKNOWN_MODEL` for `anthropic/claude-haiku-4.5`. List prices in `scripts/semantic-accountability-cost-plan.ts` are $1 per million input and $5 per million output. On the stored token counts that is $1.30. That is list-price arithmetic on a historical run, not a new invoice and not a rate-card charge.

Two stored section references on that snapshot do not match the current tree:

| nodeId | historical sectionRef | current sectionRef |
|---|---|---|
| `structural-node:99a53df526604251c4688760` | `7.05(a)(4)(ii)(vi)(B)` | `7.05(a)(y)(vi)(B)` |
| `structural-node:7254026c586c453960bc7646` | `1.01(9)(c)(46)` | `1.01(6)(A)(46)` |

The historical cross-cut read below describes those 842 rows only. It is not a read of the current tree.

**Historical builders.** 42 rows have role `BUILDER`. Zero of them sit on the two nodes that contain the phrase "Available Amount Builder Basket". Fifteen rows have a `7.05` source ref. One of those is role `BUILDER` and describes the 50% Consolidated Net Income prong. One `FINANCIAL_TEST` at `7.05` names the Available Amount Builder Basket inside a capacity formula. On that snapshot the cite `7.05(a)(y)` was `NOT_FOUND`.

**Historical reclass.** One persisted row intersects a reclass window: `7.05(c)`, role `EXCEPTION`, about payments outside Restricted Payments. `reclassEdgeWritten` is false. No category was mapped to a target rule.

**Historical asset dispositions.** Thirteen row-slots (eleven distinct discovery ids; two ids are repeated) match `7.04` or a `7.04` node. Roles include `GENERAL_PROHIBITION`, `PERMISSION`, `BASKET`, `EXCEPTION`, `CONDITION`, and `PROVISO`. Every one of those rows has an empty family list. On that snapshot bare `7.04` was `AMBIGUOUS` and `assetNodeSelected` was false.

## Verification reservation

Verification was not run on either record. There is no verification command in `scripts/p3-development-pipeline/`. The historical reservation treated each of the 842 discovery rows as one compiled candidate, which those rows are not. The current provider-free reservation has candidate count 0 and both USD fields 0.

| Basis | USD |
|---|---|
| Sonnet, frozen Chewy observation: $0.3293 semantic review plus 5 × $0.0114 condition-suspicion, times 842 | 325.26 |
| Same token observation scaled by Haiku list prices ($1/$5, half of Sonnet $2/$10), times 842 | 162.63 |

Source: `docs/phase-3-final-chewy/02-cost-preflight.json` and `scripts/semantic-accountability-cost-plan.ts`. Not a rate-card price. Not executed. Not a reason to promote the historical rows.

## Current investigations

**Builders.** The phrase "Available Amount Builder Basket" occurs on two current nodes. The definition node `1.01(3)(31)(ii)` (`structural-node:87f014fc8c17c129a3c0e15f`) cites Section 7.05(a)(y). `resolveReferenceTarget` of `7.05(a)(y)` is `UNIQUE` to the parent capacity clause, one candidate. That resolved node is not the printed basket sentence. The basket sentence remains node `structural-node:99a53df526604251c4688760`, current section ref `7.05(a)(y)(vi)(B)`, 95 characters: the greater-of prong printed as clause `(B)` under `(vi)`, whose own text says "the foregoing clause (y)". The printed `(vi)` marker and the parenthetical "clause (y)" are not collapsed. No capacity is inferred. No `BUILDER` role is forced. `discoveryId` is null. `sealedRole` is null. Pass A `builder_language` also fires on "cumulative" and on "Retained Excess Cash Flow".

**Reclass.** Seven own-text windows match the existing reclass heuristic. The §7.01 windows include `7.01(b)(a)`. Windows that mention a Section reference are not category-only. No `RECLASSIFIABLE_TO` edge was written. Category labels were not mapped to `targetRuleId`.

**Asset dispositions.** Bare ref `7.04` is `UNIQUE_AFTER_DEGENERATE_EXCLUSION`. The table-of-contents node `structural-node:a744dbebadfcae7ddeac6525` is 39 characters and is the excluded degenerate candidate. The body node `structural-node:a80b8b3639f39c55e5617fd7` is 5,767 characters. Both candidates stay on the investigation. `selected` is false. This is not a forced choice between two substantive sections, and it does not assign a role.

These investigations do not certify Gibraltar and do not complete Pass B. The current record was regenerated, with no provider key, after the glued alphabetic-marker parser correction. The live section ref of `structural-node:7254026c586c453960bc7646` is `1.01(6)(A)(46)`. The historical ref `1.01(9)(c)(46)` still fails closed. That live ref is not a certification of the Permitted Lien path.
