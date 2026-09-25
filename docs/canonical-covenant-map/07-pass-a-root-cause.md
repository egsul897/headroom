# Pass A semantic inventory - root cause and structural fix (mandatory addendum)

Zero paid calls. Every number below is either read from preserved evidence or computed offline.

## What the benchmark recovery showed

Every served attempt on the eight targets timed out INSIDE Pass A (semantic inventory); no composition, no
verifier. Preserved side-call telemetry (`docs/phase-3-conmed-benchmark-recovery/run-segment-*/02-costs.json`):

| target | source chars | Pass A output tokens (observed) |
|---|---|---|
| 7.1 | 3,275 | 42,396 |
| 7.13 | 1,212 | 43,846 |
| 7.14 | 1,106 | 45,028 |
| 7.16 | 1,144 | 63,943 |
| 7.17 | 795 | 40,605 |
| 7.2(c) attempt 1 | 529 | 116,913 |
| 7.2(c) attempt 2 | 529 | 36,761 |

## Defect ledger

| id | defect | where it was | fix |
|---|---|---|---|
| P3-E10 | generic 128k analyzer output ceiling inherited by semantic inventory | `analyzer/anthropic-analyzer.ts` `DEFAULT_MAX_TOKENS = 128000`, used by every `runStructuredStage`; `inventory.ts` called `getStageCaller()` with it | `StageCallOptions.execution.maxOutputTokens` per call; Pass A derives it from the slots (`inventory-policy.ts#deriveInventoryOutputBound`) |
| P3-E11 | Pass A reasoning effort / provider behaviour not explicitly controlled | no `thinking` parameter was ever sent; DeepSeek v4 flash is a reasoning model | `execution.reasoning` -> Messages `thinking` (`{type:"disabled"}` for the certified policy; MINIMAL = enabled with a 1,024 budget; PROVIDER_DEFAULT = omitted); the policy is part of the certified identity, evidence and cache identity |
| P3-E12 | inventory wire schema permitted unbounded output cardinality/text | `wire-schema.ts`: unbounded `items[]`, `proposition`, `excerpt`, `referencedTerms[]`, `referencedSections[]`, `relatedRefs[]`, `overallNotes[]` | bounded schema built per call (`buildSubmitSemanticInventorySchema(bounds, maxItems)`); `overallNotes` removed; proposition 120, excerpt 400, values 8, terms 6, sections 6, relatedRefs 4, ambiguityReason 120 |
| P3-E13 | inventory prompt encouraged unconstrained decomposition despite deterministic source slots | `prompt.ts` v5: 12 numbered "mandatory obligations" ("exhaustively", "never omit", "at least twelve items"), a 7-item worked example; ~11k chars | v6: 1,646-char mechanical prompt, task stated once, per-slot allowance ("up to N items"), deterministic SIGNALS per slot (values, references, defined terms); completeness enforced by code |
| P3-E14 | per-call execution telemetry could not distinguish reasoning from structured output | `AnalyzerCallTelemetry` carried input/output tokens only; the SDK's `usage.output_tokens_details.thinking_tokens` was never read; raw usage not preserved | telemetry adds `stopReason`, `requestedMaxOutputTokens`, `reasoningPolicy`, `thinkingTokens`, `visibleOutputTokens`, `rawUsage`; `FrozenSemanticInventory.calls[]` records every Pass A call (pass, batch, slot ids, ceiling, policy, tokens, latency, stop reason, schema outcome, item counts); evidence v2 `passA` |

## A1 - reasoning-token visibility in the preserved telemetry

- `VISIBLE_STRUCTURED_OUTPUT_TOKENS`: not recorded (no preserved record separates them).
- `REASONING_TOKENS`: not recorded. The Anthropic SDK (0.120.0) types `usage.output_tokens_details.thinking_tokens`,
  but the analyzer never read it and no raw usage object was preserved; whether the AI Gateway populates that field
  for `deepseek/deepseek-v4-flash` is unknown offline.
- `COMBINED_OUTPUT_TOKENS`: the values in the table above are `usage.output_tokens` as reported, which per the
  gateway's documentation may include reasoning tokens. 116,913 tokens were NOT assumed to be emitted JSON.
- Prospective fix: every call now records `thinkingTokens` / `visibleOutputTokens` when reported and `rawUsage`
  verbatim, so the next real call answers the question directly.

## A3 - how reasoning is represented on the wire

Determined by request-construction tests with a fake fetch (`tests/contract-model/certified/pass-a-bounds.test.ts`,
"request construction on the wire"): the request body carries `max_tokens: <derived>` and
`thinking: {"type":"disabled"}` for the certified policy; `PROVIDER_DEFAULT` sends no `thinking`; `MINIMAL` sends
`{"type":"enabled","budget_tokens":1024}`. The Anthropic-Messages `thinking` parameter is the gateway's documented
reasoning control for Anthropic-compatible requests; if a provider ignored it, `max_tokens` still bounds the whole
output (reasoning + visible), so the pathological volume stays impossible.

Selected policy: `DISABLED` (Pass A is slot classification with deterministic completeness checks; the lowest level
that preserves inventory quality is the one that spends no tokens reasoning about what code already enforces).

## A4/A5 - the derivation (no arbitrary ceiling)

For each slot: `maxPropositions = clamp(1 + ceil(chars/150) + values + references, 1, 8)` where values and
references are deterministic scans of the slot's own text. For each item: `perItemMaxChars` = the sum of every
field's bound, with the excerpt capped at the slot's own length, values at `found + 1`, sections at `found + 1`,
terms at `found + 2`. Per call: `maxItems = sum(maxPropositions) + 2 unslotted`; `maxSerializedChars =
sum(maxPropositions x perItemMaxChars) + 32`; `max_tokens = ceil(maxSerializedChars x 0.4) + 256`. Batches carry at
most 24 slots and 6,000 primary chars; a pass makes at most 12 calls.

Note (measured, not assumed): the SDK's `zodOutputFormat` folds `maxItems` / `maxLength` into schema descriptions
rather than JSON-schema keywords, so the provider-side grammar does not enforce cardinality. The mechanical bound on
the wire is `max_tokens`; the allowance is stated in the prompt; the parser re-enforces every bound.

## A17 - offline replay of the eight targets (new policy)

`docs/canonical-covenant-map/06-pass-a-offline-replay.json`, produced by `scripts/canonical-map/pass-a-offline-replay.ts`
from the exact preserved operative text (chars match the recovery records), the deterministic source context (certified
CONTEXT_ONLY: operative region only), the slot partition and the batches:

| target | chars | slots | batches | max legitimate items | NEW max_tokens | OLD ceiling | observed old output |
|---|---|---|---|---|---|---|---|
| 7.1 | 3,275 | 44 | 2 | 111 | 26,364 (largest call) | 128,000 | 42,396 |
| 7.2 | 8,843 | 95 | 5 | 227 | 30,168 (largest call) | 128,000 | timed out |
| 7.10 | 1,995 | 20 | 1 | 49 | 23,238 | 128,000 | timed out |
| 7.2(c) | 529 | 5 | 1 | 13 | 6,218 | 128,000 | 116,913 / 36,761 |
| 7.13 | 1,212 | 12 | 1 | 27 | 12,766 | 128,000 | 43,846 |
| 7.14 | 1,106 | 13 | 1 | 28 | 13,072 | 128,000 | 45,028 |
| 7.16 | 1,144 | 12 | 1 | 26 | 12,117 | 128,000 | 63,943 |
| 7.17 | 795 | 12 | 1 | 26 | 11,864 | 128,000 | 40,605 |

7.2(c): five deterministic slots, one reference, no numeric literal in the operative text. The allowance is 13
items; every item is bounded to at most ~1,150 serialized chars (excerpt capped by the slot itself); the whole
response is bounded to 14,903 chars -> the request is sent with `max_tokens = 6,218`. A 116,913-token response is
not a possible outcome of that request: the provider stops generation at 6,218 tokens, the parser reports a schema
failure if the JSON was cut, and the inventory is INVENTORY_FAILED with the call record - never a 480-second timeout
burning 19x the legitimate maximum.

## A9 - atomicity vs duplication

Identity remains the SOURCE PROPOSITION (slot + coordination sub-index + values; `computeInventoryItemId`);
`semanticRole` + `additionalRoles` describe what one proposition does (`semantic-functions.ts` derives the function
set). The v6 prompt says so once ("one proposition that serves several roles is ONE item with additionalRoles, never
several items") and no longer instructs separate PERMISSION / CONDITION / REFERENCE / VALUE / SHARED_CAP items.

## A11 - what did not change

Deterministic source coverage, the quantitative scanner, exact excerpt verification, gap detection, frozen
inventory, dual-pass ensemble and support semantics are untouched. The gap pass (A12) uses the same bounded call
(`boundedInventoryCall`) over the affected slots only, with its own derived ceiling, and counts against the same
per-pass call cap. Both passes of DUAL_PASS_ENSEMBLE (A13) run under the same policy; each call record carries its
pass id.
