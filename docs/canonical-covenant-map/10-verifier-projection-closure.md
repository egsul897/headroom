# 10 - Verifier projection integrity closure (P3-VP1)

Starting SHA `4cf5cb0d63f1dd38713f0bd63ecabedf2078d31a`. Zero paid calls. Live evidence under
`docs/phase-3-live-validation/7.2c-first-certified/` and `docs/phase-3-live-validation/7.2c-rerun-operative-state/` is
byte-identical (both directories are sha256-pinned by regression suites).

## The defect (P3-VP1 - STALE_MANUAL_VERIFIER_PROJECTION)

The second certified live run compiled the materially correct child unit for §7.2(c), yet Layer 2 recorded a MATERIAL
finding that the §7.3(g) lien limitation had been dropped ("no reference to Section 7.3(g) appears anywhere in the
rule"). `reviewer.ts` hand-built `proposedIr` from a fixed field subset that predated the typed `sourceDependencies`:

| included (old) | omitted (old) |
|---|---|
| ruleId, sourceSectionRef, action, posture, capacityExpression, conditions, exceptions, dependsOn, entityScope, entityScopeExcluded, sufficiency | ruleType, covenantFamily, transactionScope, **sourceDependencies**, unresolvedDependencies, inheritedAttributes, sufficiencyReasons, inventory lineage, operative lineage, provenance, entityScopeAudit |
| definitions: definitionId, termName, calculationExpression, dependsOnTerms, sufficiency | covenantFamily, sufficiencyReasons, lineage |
| - | **sharedCapacities: not projected at all** |

The pre-fix reviewer content over the frozen compiled unit is captured verbatim in
`tests/fixtures/phase-3-live-replay/7.2c-rerun-operative-state/pre-fix-reviewer-user-content.txt` with the probe record
`P3-VP1-pre-fix-projection-probe.json` (contains referencesRuleTargets: true; sourceDependencies: false; 7.3(g): false;
sharedCapacities: false).

## The repair

`lib/contract-model/compiler/semantic-verification/projection.ts` (`phase-3c-verification-projection.v1`) is the ONE
semantic review projection. Every field of IRRule / IRDefinition / IRSharedCapacity is classified REVIEW_SEMANTIC,
REVIEW_CONTEXTUAL or EXCLUDE_INTERNAL_METADATA in maps declared `satisfies Record<keyof ..., ProjectionClass>`: a new IR
field without a classification is a compile error, and a unit carrying an unclassified key is refused at runtime.
`buildSemanticVerificationProjection` projects every unit (rules, definitions, shared capacities) with every REVIEW_SEMANTIC
field verbatim (internal ids such as exprId stripped), sufficiency under `compilerSufficiencyClaim` (labelled a claim),
and contextual fields under `reviewContext` (the entity-scope audit labelled "DETERMINISTIC COMPILER-SIDE AUDIT - NOT
SOURCE EVIDENCE"). It adds, infers, repairs and replaces nothing. `computeSemanticVerificationProjectionHash` (sha256 of
the canonical, key-sorted JSON; no timestamps) is recorded on every verification result
(`verificationProjection {version, hash, shownToReviewer}`) and `verify.ts` refuses a review whose shown content hash
differs from the compilation being verified. The reviewer, the runner's human-readable IR and tests all consume it.

Versions: verifier prompt v1 -> v2 (explains sourceDependencies, SOURCE_REFERENCE_RESOLVED with empty bindings in a
partial run, cross-rule conditions and evaluation basis, inherited attributes, ruleType/covenantFamily/transactionScope as
claims, shared capacities as reviewed units, sufficiency and audit as claims); verifier algorithm v2 -> v3 (identical
source + IR could yield a materially different Layer-2 result under v2, where material fields were hidden; finding ids
change with the version; historical ids untouched). No finding suppression, no materiality or certification change.

## Manual IR projection audit (§28)

| site | role | class | action |
|---|---|---|---|
| semantic-verification/reviewer.ts proposedIr | Layer-2 input | AUTHORITATIVE, was DANGEROUS_STALE_PROJECTION | replaced by projection.ts |
| scripts/phase-3-live-validation runner renderIR | human-readable IR | DIAGNOSTIC, stale (no sourceDependencies / shared caps) | now renders the production projection |
| semantic-verification/ir-inventory.ts | Layer-1 deterministic signal inventory (numeric / structural items; DEPENDENCY items used only for reclassification counts) | PURPOSE-SPECIFIC (not a semantic review projection); does not yet list typed sourceDependencies / referencesRuleTargets as DEPENDENCY items - an under-count that can only raise a review signal, never hide semantics | unchanged; recorded as follow-up |
| semantic-verification/numeric-assertion.ts field table | numeric grounding walk (walks dependsOn / unresolvedDependencies descriptions; typed sourceDependency descriptions are deterministic and figure-free) | PURPOSE-SPECIFIC | unchanged |
| verified-units.ts stableContentJson / identityOfUnit | content hashing (excludes verifiedAt / createdAt / fromCache only) | AUTHORITATIVE, exhaustive by construction (whole unit minus named volatile keys) | unchanged |
| phase3-certification/phase4-adapter.ts, verified-execution.ts | pass whole verified units | AUTHORITATIVE, exhaustive (no field list) | unchanged |
| covenant-map/assemble.ts node fields (kind, family, ruleType, posture, termName, sufficiency ...) + `unit` | map node summary; the full unit travels in `node.unit` | PURPOSE-SPECIFIC | unchanged |
| covenant-map/package-dependencies.ts targets | binding record | PURPOSE-SPECIFIC | unchanged |
| scripts/p3-conmed-pilot/evidence.ts | evidence (copies whole compilation / verification) | DIAGNOSTIC, exhaustive | unchanged |
| scripts/semantic-accountability-shared-cap-trace.ts, scripts/f7b2-replay.ts | ad-hoc traces | DIAGNOSTIC, selective by design | unchanged |

## Regressions

`tests/contract-model/semantic-verification/projection.test.ts` (22 tests): evidence manifest for the rerun directory;
P3-VP1 pre-fix pin and post-fix assertions over the exact frozen compiled unit (7.3(g) REQUIRES SOURCE_REFERENCE_RESOLVED
owner 082c8083..., 7.1 OTHER_RULE_SATISFIED ALL_SATISFIED, proForma/asOfSelector/deemedEffectiveAt/testingPeriod, no target
economics); the false-finding mechanism replayed with a scripted reviewer (old content -> MISSING_CONDITION; new content
-> none, dependency provably received); verifyCompiledCandidate persisting the projection identity; VP2-VP9 field
visibility on a maximal synthetic unit; VP10 exhaustive classification (compile-time and runtime); VP11 independence;
VP12 projection == snapshot == persisted verified units (same hash), no mutation; shared-cap attack visible and rejected,
source-backed shared cap visible and accepted.

## Expected next live residue

The offline gate proves only that Layer 2 is now shown the correct proposed semantics; it does not claim a real model
returns zero findings. The upstream Phase-2 condition (Indebtedness amendment effective date CONDITIONAL_UNRESOLVED) is
unchanged, so the next §7.2(c) rerun is expected to end REVIEW_REQUIRED solely for operative state, package PARTIAL.
