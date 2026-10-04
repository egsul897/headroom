# First certified live validation - CONMED §7.2(c) - report

Run: `live-7.2c-first-certified-2026-10-04T14:11:35.579Z`, starting SHA ee26dbfe7a6c8bb8e66ee2c1fcb57630fef1ad28, clean tree,
canonical-compiler CI green at that SHA (run 36876454126), `npm run test:phase3-certification` 17 files / 215 tests green and
`npx tsc --noEmit -p .` green immediately before dispatch. Runner: `scripts/phase-3-live-validation/run-7-2c-first-certified.ts`
(decides where to write and what to assert; builds nothing semantic). Path: `certifyDiscoveredCovenantPackage` over a
one-candidate PARTIAL_TARGET_SET population -> `compileCandidateToVerifiedIR` (build input -> dual Pass A -> frozen inventory ->
bounded composition -> identity stamping -> snapshot -> verify -> verified package v2 -> certifyCandidate).

## Target identity (01-target-identity.json)
discovery-candidate:7a3f36589dacd05c41331a80, document conmed-doc-a-eighth-ar-credit-agreement, §7.2(c), resolved by production
rehydration to one structural node; operative text 529 chars, sha256 d1d9ba7d8d98729d30df82d6b5e3ac4016a7e9155917786247592d57d3477472
(identical to both preserved runs); single occurrence of the ref in the document. Operative state: none supplied (the amendment
pipeline is a paid stage call; both preserved runs show 7.2(c) carried no operative lineage) - recorded in 00-preflight.json.

## Budget and execution
Hard ceiling $0.25 through the production HardDispatchBudget (6 reservations, 0 refusals). Exact spend $0.010140314, retained
unknown $0, committed $0.010140314. One candidate attempt; transport attempts 2 (= semantic conversation + one bounded
refinement), no transport retry. Wall clock 249 s, deadline 480 s, not timed out. Provider-returned model on every response:
deepseek/deepseek-v4-flash (requested unsuffixed; no substitution).

## Pass A (04-pass-a-calls.json, 03-transport-observations.json)
DUAL_PASS_ENSEMBLE: pass-1 b1 (5 slots) max_tokens 6,218 -> 959 output tokens, end_turn, 5 items; pass-2 b1 max_tokens 6,218 ->
992 output tokens, 5 items; pass-2 gap g1 (slots 3-4) max_tokens 3,058 -> 429 output tokens, 2 items. Every request carried
`thinking: {type:"disabled"}` and was accepted (HTTP 200). Raw usage carries input/output/cache tokens only - no
output_tokens_details, so reasoning tokens are ABSENT, not provably zero: REASONING_DISABLED_ACCEPTED_BUT_TELEMETRY_INCONCLUSIVE.
No request used the legacy 128,000 ceiling. Items rejected over bound 0, unverifiable 0, duplicates merged 4. Frozen inventory:
7 canonical items, 4 corroborated, 3 CRITICAL/MATERIAL single-run, 0 conflicted -> INVENTORY_OK with supportReviewRequired
true (certified policy: review required until independently resolved). Old architecture on the same text: 116,913 and 36,761
output tokens; new: 959 / 992 / 429.

Semantic quality against the source: the inventory captures the permission + §7.3(g) reference (item 1, CORROBORATED), the
proviso / pro-forma compliance condition (items 2-5), the §7.1 reference and recomputation date basis (item 6), and the
first-day-of-period testing basis (item 7). Entity scope "Parent Borrower" appears as a referenced term. No proposition was
invented beyond the operative text; unaccountedSource and uninventoriedValues are empty.

## Composition (06-compilation.json, 07-ir-human-readable.md)
1 semantic conversation + 1 bounded refinement (the model named Section 7.3(g) and Section 7.1 as missing dependencies; the
runner retrieved both deterministically - 2 getReferencedProvision records). Input 17,880 / output 4,443 tokens for composition.
Compilation REVIEW_REQUIRED (OPERATIVE_STATE_UNRESOLVED, SEMANTIC_SUPPORT_REVIEW_REQUIRED). Units: 2 rules, 0 definitions,
0 shared capacities:
- ir-rule:11f0445de25e714a1a3cfe31 - §7.2(c) QUANTITATIVE_PERMISSION / PERMISSION / INCUR_DEBT, UNLIMITED_CAPACITY with
  gatedBy null, one condition whose expression is AND[UNSUPPORTED] (the model emitted a non-IR kind "REQUIRES"), an AS_OF
  condition with an unspecified date, two UNRESOLVED cross-unit dependencies (Section 7.3(g), Section 7.1) whose free-text
  descriptions restate figures (80%, 3.75:1, 5.50:1, 2.75:1) that are not in the operative text; sufficiency PARTIAL.
- ir-rule:c9757e8a02da1880d66214f2 - the §7.2 umbrella prohibition, sufficiency AMBIGUOUS, no inventory lineage.
Both carry sourceContentVersion = sscv1:b30330eb… (stamped before the snapshot).

## Verification (08-verification.json)
MATERIAL_DISCREPANCY; semantic review invoked (1 verifier call, 16,127 output tokens); condition classifier not invoked
(semantic review ran directly). Findings: 3 MATERIAL (MISSING_CONDITION - the "secured by Liens permitted by §7.3(g)" scope
limit is absent from the executable IR; OTHER_MATERIAL x2 - the compliance condition's only operand is an UNSUPPORTED
placeholder; the recomputation date is unspecified and the §7.1 metric typed MONEY), 4 UNCERTAIN (UNSUPPORTED_NUMERIC_ASSERTION
for 80%, 3.75:1, 5.50:1, 2.75:1 in unresolved-dependency descriptions), 1 NON_MATERIAL. Finding owners canonical: every
semantic finding OWNER_EXACT on ir-rule:11f0445d…, irPaths resolve to real paths. Numeric grounding: 4 assertions, all
UNGROUNDED (figures come from retrieved §7.1/§7.3(g) text the verifier did not admit as supporting the asserting unit).
Qualitative lineage: rule 1 GROUNDED, rule 2 LINEAGE_GAP (posture/ruleType/family cited but not tied to inventory).
Source reconciliation: 4 IR_ONLY, 2 POSSIBLY_ACCOUNTED_FOR, materialUnresolvedCount 4.

## Artifacts (09-verified-units.json, 10-certification.json)
snapshotHash f312180cd1da95081cd2f2bbb2458edd54639caffcddf06d802904d94931cee4 (2 units); package p3-verified-unit-package.v2,
packageHash 8008cff3661a22ce2c8ca26b1a67bbc2cc755bd5cb192e8af7d045762d408207, complete true, 2 persisted, 0 unpaired, 0 problems.
Certification REVIEW_REQUIRED; identities STRONG (scv1:da3e85c0…, sscv1:b30330eb…, attribution RELIED_UPON: items
OPERATIVE_SOURCE 7.2(c), PARENT_SCOPE 7.2, AMENDMENT_LEAD Indebtedness; retrievals Section 7.1 and Section 7.3(g) by content
hash; no unattributed terms or refs). Blockers (all REVIEW): COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE
(bundle BUDGET_EXCEEDED at cross-reference depth 3), DEPENDENCY_INVALID, OPEN_MATERIAL_OR_UNCERTAIN_FINDING (7),
OPERATIVE_STATE_UNACCEPTABLE (unresolved AMENDMENT_LEAD on "Indebtedness" - a consequence of running without an operative
state), SUPPORT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN. No warnings.
Package certification PARTIAL (PARTIAL_TARGET_SET, DISCOVERY_POPULATION_UNSEALED, plus the candidate's review blockers) -
expected and not a defect. Phase 4 adapter not attempted (candidate not CERTIFIED); nothing entered Phase 4.

## Observations recorded, not fixed (mission §19)
1. The compiler dropped the "secured by Liens permitted by §7.3(g)" scope limit from the executable IR, keeping it only in an
   unresolved-dependency description - the verifier caught it as MATERIAL MISSING_CONDITION.
2. The compiler emitted a non-IR expression kind ("REQUIRES") inside a condition; normalization preserved it as UNSUPPORTED.
3. Three UNCERTAIN numeric-assertion findings for distinct figures in the same description share one findingId
   (8832f946…) - the id does not include the asserted value; the blocker list therefore repeats the id.
4. Running without an operative state (zero probe calls) leaves the "Indebtedness" AMENDMENT_LEAD unresolved and raises
   OPERATIVE_STATE_UNACCEPTABLE; a product run supplies Phase 2's operative state.
5. The context bundle hit its cross-reference depth budget (CONTEXT_BUDGET_EXCEEDED).

## Verdict
PHASE3_LIVE_VALIDATION_REVIEW_REQUIRED. Execution structurally succeeded under the certified architecture (bounded Pass A,
one conversation plus one bounded refinement, no timeout, no 128k ceiling, thinking policy as certified, exact
snapshot/artifact identity proven, nothing entered Phase 4); the semantic output is not clean and certification is honestly
REVIEW_REQUIRED.
