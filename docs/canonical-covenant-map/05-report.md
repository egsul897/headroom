# Canonical covenant map + LLM execution remediation - mission report

Verdict: **CANONICAL_COVENANT_MAP_ARCHITECTURE_READY** (offline). Zero paid calls. Phase 3 is NOT claimed closed; no
benchmark recovery was run; Phase 4E was not begun; no UI was wired.

Starting SHA `e9f6b9717c25121b28f4f7280e0fec847397a386`; ending SHA = the commit that adds this file (recorded in the
mission return and `git log`). Intermediate commits: `46104f0` (transport layer, bounded caller, owner normalization,
qualitative grounding), `9cc2301` (canonical map package, retrieval and grounding remediation, offline maps).

## Deliverables (where each lives)

| item | location |
|---|---|
| canonical map package | `lib/contract-model/covenant-map/` (types, order, source-content-version, candidate-input, assemble, validate, render, pipeline, callers, index) |
| certified transport | `lib/contract-model/analyzer/{provider-error,pricing,deadline,transport-retry,dispatch-budget}.ts`; `anthropic-analyzer.ts` (`maxRetries: 0`, explicit `thinking`, per-call ceiling, stop reason + thinking tokens) |
| bounded semantic caller | `lib/contract-model/compiler/semantic/bounded-caller.ts` |
| certified configuration | `lib/contract-model/compiler/certified-config.ts` (inventory mode, expansion policy, Pass A policy, identity) |
| Pass A policy (addendum) | `lib/contract-model/compiler/semantic-accountability/{inventory-policy,wire-schema,prompt,inventory,dual-pass}.ts` |
| verifier fixes | `semantic-verification/{finding-owner,qualitative-grounding}.ts`, `reviewer.ts`, `verify.ts` |
| retrieval fixes | `context-retrieval/{pipeline,reference-context,cross-document-context}.ts` |
| operative source | `compiler/candidate-span.ts` (operative-state aware), `semantic-accountability/source-context.ts` |
| evidence v2 | `scripts/p3-conmed-pilot/evidence.ts` (`p3-candidate-evidence.v2`) |
| offline maps | `scripts/canonical-map/build-offline-maps.ts` -> `docs/canonical-covenant-map/maps/` |
| Pass A offline replay | `scripts/canonical-map/pass-a-offline-replay.ts` -> `06-pass-a-offline-replay.json` |
| tests | `tests/contract-model/certified/{transport-layer,bounded-execution,finding-owner,golden-map,architecture,offline-maps,pass-a-bounds}.test.ts` |
| CI | `.github/workflows/canonical-compiler.yml` |
| docs | `00-starting-state.json`, `01-audit.md`, `02-red-team-answers.md`, `03-pilot-module-classification.md`, `04-known-red-tests.md`, `07-pass-a-root-cause.md` |

## Test status

- Targeted (certified + accountability + verifier + retrieval + f7c + durable replay + pilot evidence/preflight):
  22 files / 499 tests green on the final run; `tests/contract-model/certified`: 7 files, 79 tests green.
- Full suite (`npx vitest run`): 382 files, 277 passed / 105 failed; 5,184 tests, 4,511 passed / 149 failed /
  524 skipped. Every failing file is classified in `04-known-red-tests.md`: 101 database-backed (no PostgreSQL in the
  sandbox; identical on the baseline), `chwy` fixture-directory guards (baseline, commit `578c755`), `premium-lock`
  (`/tmp` artifact, baseline), `v31-benchmark-integrity` (asserts a clean tree; green after commit). No new failing
  identity is attributable to the cleanse.
- `tsc --noEmit`: clean apart from the 6 pre-existing `tests/foundation-audit` errors recorded at start.
- `eslint --max-warnings 0` over every changed module: clean. `npm run build` (`next build`): compiled successfully.

## Golden map

`tests/contract-model/certified/golden-map.test.ts`: synthetic agreement + amendment, scripted discovery (2
candidates), scripted dual Pass A, fake provider Pass B (one request per candidate, single-message requests),
scripted verifier. Expected and actual: 5 rules + 3 definitions in source order (3 definitions, 7.01 chapeau,
7.01(a), 7.01(b), 7.01(c), 7.02); edges RULE_MODIFIED_BY_EXCEPTION 3, RULE_SUBJECT_TO_GENERAL_PROHIBITION 3,
RULE_USES_DEFINITION 1, DEFINITION_USES_DEFINITION 2; 7.01(b) = $25,000,000 with a NO_DEFAULT condition; 7.01(c) =
MAX($10,000,000, 5.0% x Consolidated EBITDA); 7.02 compiled from the AMENDED text with the applied effect recorded;
unresolved = 0; every node STRONG identity with `sourceContentVersion`; validation clean; `mapHash` byte-identical
across two runs with fresh callers, budget and cache.

## Offline real maps

- CONMED (preserved run-original evidence, 163 sealed candidates): 95 nodes (64 rules, 28 definitions, 3 shared
  capacities), 60 edges, 302 unresolved items (112 blocking: 53 compile-failed, 57 unserved, 2 no anchor; 190
  review), mapped fraction 0 (every compiled candidate is MAPPED_WITH_REVIEW under the legacy run), `complete: false`,
  validation clean, deterministic hash. `docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.{json,md}`.
- LSB (82 candidates) and FWRG (252 candidates): structure-only maps, every candidate an explicit UNSERVED item.
- DSGR: not buildable offline (no discovery run in the fixture; discovery is a paid call).

## Systemic findings fixed (see `01-audit.md`)

12-turn transcript-replaying tool loop; three retry owners and a timeout that did not cancel; Sonnet pricing for every
model; env-driven inventory mode; verbatim verifier owner ids; null `sourceContentVersion`; sharding on every
expansion region (53 of 161 CONMED candidates); retrieval almost never SUFFICIENT (103 of 104); self
cross-references (14 of 104); amendment leads never resolvable; base text compiled for amended sections; evidence v1
blind to execution mode; Pass A 128k ceiling / provider-default reasoning / unbounded schema / exhortative prompt /
no per-call telemetry (P3-E10..E14).

## Remaining known gaps

Semantic: retrieval BUDGET_EXCEEDED (depth 3 / 60 items / 40k chars) is still the dominant bundle state for real
sections and forces VERIFICATION_INCOMPLETE; gateway behaviour for `thinking: disabled` and
`output_tokens_details.thinking_tokens` on `deepseek/deepseek-v4-flash` is unverified offline; definitions compiled
from context carry no inventory lineage (disclosed as LINEAGE_GAP, non-material); the sealed CONMED population has 2
node keys that do not rehydrate uniquely.

Execution: `zodOutputFormat` sends no `maxItems`/`maxLength` to the provider (bounds live in `max_tokens`, prompt and
parser); the legacy `RealSemanticCaller` and `compile-run.ts#callerFor` still exist for the preserved runs' tests
(quarantined by lint for the map package); the DUAL_PASS second pass is sequential.

## Exact next bounded action

One paid, budget-capped validation of the certified path on ONE tiny CONMED candidate (7.2(c), 529 chars) through
`compileCandidateToVerifiedIR` with `createCertifiedCallers`, a `HardDispatchBudget` ceiling of $0.25 and the
certified config, recording evidence v2 (`passA.calls` with `thinkingTokens` / `rawUsage`) - to confirm on a real
gateway response that `thinking: disabled` is honoured and that Pass A output stays under its derived ceiling
(6,218 tokens). Requires explicit authorization; not run in this mission.
