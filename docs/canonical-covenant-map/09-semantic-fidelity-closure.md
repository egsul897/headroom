# 09 - Semantic fidelity closure (what the first real certified run exposed, and what changed)

Starting SHA `c047a7ccaa13b95312ea87b163577cd90d4c8a25`. Zero paid model calls: every result below is deterministic replay of
the preserved live evidence (`docs/phase-3-live-validation/7.2c-first-certified/`, immutable; byte-hashed by
`tests/fixtures/phase-3-live-replay/7.2c-first-certified/evidence-manifest.json`) or a scripted synthetic fixture.

## 1. The invariant

A candidate compiler owns only its operative source, uses context to understand that source without minting foreign
rules, represents contractual references as typed dependencies instead of copying referenced economics into prose,
preserves every operative qualifier and condition, and emits only valid IR whose legal meaning is traceable to source.

## 2. What the live §7.2(c) run exposed, and the generic remediation

| # | Observed in the live run | Root cause | Remediation (agreement-agnostic) |
|---|---|---|---|
| 1 | A second rule for the §7.2 umbrella prohibition, owned by the child | Context could own: no check that an emitted unit's source lies inside the candidate's operative region | `semantic/unit-ownership.ts` (`semantic-unit-ownership.v1`): SELF/DESCENDANT owned; PARENT/SIBLING foreign by reference; OTHER_SECTION judged fail-closed against the structural index when an anchor is known; definitions owned only where their defining text lies in the operative source, quarantined when the index or bundle locates them elsewhere. Foreign units become `CONTEXT_ONLY_UNIT_EMISSION` (kept as evidence in `contextOnlyEmissions`, never in the certified IR). Without any structural context the decision is `OWNERSHIP_UNDETERMINED` (kept, disclosed). |
| 2 | Parent scope still needed (prohibition, obligor scope) | - | `IRRule.inheritedAttributes` with `sourceAuthority: "PARENT_SCOPE"` (governingProhibition, entityScope), evidence = the parent lead-in |
| 3 | Entity scope downgraded by "...of the Parent Borrower and its Subsidiaries for which financial statements are available" | Every entity mention treated as an applicability binding | `entity-scope-consistency-guard.v2`: deterministic mention-role classification OBLIGOR vs MEASUREMENT_CONTEXT (lead/follow phrase patterns: "of the", "for which financial statements", "EBITDA of", ...); only OBLIGOR mentions bind; PARENT_SCOPE tier confirms inherited applicability when the child's own text binds no obligor |
| 4 | References to §7.3(g) / §7.1 as `IRUnresolvedDependency` with target thresholds (80%, 3.75:1, 5.50:1, 2.75:1) in free text | No first-class reference representation; model prose authoritative | `IRSourceDependency` / `IRSourceTargetRef` (`exactSourceTargetRef`, `normalizedTargetRef`, `resolvedStructuralTarget`, `owningCandidateRefs`, `boundSemanticTargetIds` (always `[]` on a compiled unit), `resolutionStatus` SOURCE_REFERENCE_RESOLVED / SEMANTIC_TARGET_BOUND / DEPENDENCY_UNKNOWN, `targetDefinedTerm` for named conditions); deterministic descriptions from relationship + reference; model prose kept only in `dependencyProseDiagnostics`; figures the operative source never states are excluded (`TARGET_ECONOMICS_IN_DEPENDENCY_PROSE`) and redacted from sufficiency reasons / descriptions |
| 5 | `kind: "REQUIRES"` invented inside a boolean condition | No representation for "another rule set must be satisfied"; the prompt did not enumerate IR kinds | `IRCondition.referencesRuleTargets[]` (one-to-many) + `targetCombination`; `findInvalidWireKinds` -> `SEMANTIC_WIRE_KIND_INVALID` (non-success, tolerant transport kept); prompt block generated from `IR_EXPRESSION_KINDS` |
| 6 | `METRIC_REFERENCE` typed MONEY for "compliance with the financial covenants" | Type check missing | `COMPLIANCE_CONDITION_MISTYPED`: compliance/satisfaction is BOOLEAN, expressed through `referencesRuleTargets`, never a quantity metric |
| 7 | `AS_OF asOfDate "(unspecified)"` despite explicit relative language | Placeholder accepted | AS_OF without a selector is UNSUPPORTED; `IRConditionEvaluationBasis` {proForma, transactionEffect, asOfSelector, deemedEffectiveAt, testingPeriod} carries the contractual selector verbatim (no bespoke enum) |
| 8 | Dual-pass Pass A: 3 CRITICAL/MATERIAL SINGLE_RUN for one proviso segmented differently | Support = byte-identical item identity | `semantic-ensemble.v2`: SOURCE_COVERAGE corroboration (same region, containment / >=50% overlap of the narrower span, same role or compatible effect, value-set subset, compatible refs, no parent/child pairs); support groups separate from canonical identity; anti-collapse controls in `f5-3c-coverage-corroboration.test.ts` |
| 9 | One findingId for three different ratios | Id excluded the assertion | `phase-3c-semantic-verifier.v2`: id binds the normalized assertion key (kind, value, unit, currency, raw text) |
| 10 | `OPERATIVE_STATE_UNRESOLVED` | Runner supplied `operativeState: null` | Fail-closed behavior kept. `scripts/phase-3-live-validation/operative-state.ts` adapts the preserved Phase-2G report into `OperativeContractState`; the runner supplies it plus the full sealed population, and writes to a new evidence directory (writing into `7.2c-first-certified/` is refused) |
| 11 | `BUDGET_EXCEEDED: maxCrossReferenceDepth (3)` | See §3 | Depth bounds stop only when something is actually withheld; ownership boundary `STOP_AT_SEPARATELY_OWNED_SEMANTIC_UNIT` recorded for every referenced provision owned by another candidate |
| 12 | Verifier forgave a non-locatable excerpt when the unit cited an inventory item | Lineage rescued fabricated excerpts | `qualitative-grounding.v3`: a provenance excerpt the admissible source lacks is FABRICATED whatever the lineage |

## 3. Context budget: the traversal graph of the live bundle (diagnosis before any limit change)

Reconstructed from the preserved bundle's own edges (`05-context-bundle-as-retrieved.json`), depth = BFS from the operative item:

```
7.2(c) [OPERATIVE_SOURCE, depth 0]
├─ REFERENCES ─> 7.3(g)   [CROSS_REFERENCE, depth 1]  (classified CROSS_REFERENCE: no recursion)
├─ REFERENCES ─> 7.1      [CROSS_REFERENCE, depth 1]  (classified CROSS_REFERENCE: no recursion)
├─ DEPENDS_ON_DEFINITION ─> Parent Borrower [DEFINITION_DEPENDENCY, depth 1]
└─ DEPENDS_ON_DEFINITION ─> Indebtedness   [DEFINITION, depth 1, 2,920 chars]
   ├─ REFERENCES ─> Article VIII [CROSS_REFERENCE, depth 2]
   ├─ ─> Capital Stock, Finance Lease Obligations, Obligations, Swap, Lien, Property  [DEFINITION_DEPENDENCY, depth 2]
   │     Finance Lease Obligations ─> Agreement (49 chars), Obligations
   │     Obligations ─> Agreement, Loan (65 chars), Swap
   └─ depth 3 leaves: "Agreement", "Loan"  - neither text mentions any Section or Article
```

The stop fired in `retrieveCrossReferencesFromDefinitionText` at depth 4 for the two depth-3 leaves BEFORE checking
whether their text contained any reference to follow. Nothing was withheld: the bound was declared "exceeded" by a leaf
with nothing further to retrieve. No limit was raised. The fix (`phase-2d-context-retrieval.v4`): every depth bound now
computes what it would withhold first; a leaf with no unretrieved references or term mentions is not a stop; a real
withholding is recorded as `DEPTH_LIMIT_WITH_UNRETRIEVED_DEPENDENCIES` naming the withheld targets and still counts as
BUDGET_EXCEEDED. Separately, every cross-reference target owned by another sealed-population candidate is recorded as
`STOP_AT_SEPARATELY_OWNED_SEMANTIC_UNIT` (its dependency tree is delegated to that unit) and never recursed into.

| | old (live) | new (offline replay) |
|---|---|---|
| sufficiency | BUDGET_EXCEEDED | SUFFICIENT |
| stop reason | CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (3) reached | none |
| items / chars | 19 | 19 (identical set) |
| max cross-reference depth reached | 3 (via the definition chain) | 1 |
| ownership stops | - | 7.3(g) -> discovery-candidate:082c8083...; 7.1 -> a2697012..., e3735236... |

## 4. Package-level dependency resolution (`p3-package-dependency-resolution.v1`)

`covenant-map/package-dependencies.ts` binds every typed source dependency and cross-rule condition target of every
RULE node to the owning candidate's unit(s) at (or under) the referenced structural node (a named condition binds to the
DEFINITION unit of that term). Bindings are derived artifacts carrying the target units' ids and `sourceContentVersion`s;
no verified unit is touched (every map node's unit stays byte-identical to the persisted verified unit). Statuses:
`BOUND` (executable only when source and every target are CERTIFIED), `TARGET_CANDIDATE_NOT_IN_TARGET_SET` (a partial
run: known external candidate), `TARGET_CANDIDATE_NOT_COMPILED`, `TARGET_UNIT_NOT_FOUND`, `DEPENDENCY_UNKNOWN`. Bound
bindings become IR-backed map edges (`IR_SOURCE_DEPENDENCY`, authority CERTIFIED_SEMANTIC when both ends are certified);
unbound ones are `UNRESOLVED_SOURCE_DEPENDENCY` items. Package certification (`phase3-package-certification.v2`) adds
`UNBOUND_EXECUTABLE_BINDING` (REVIEW), `DEPENDENCY_TARGET_NOT_IN_TARGET_SET` (PARTIAL), `DEPENDENCY_TARGET_NOT_BOUND`
(REVIEW) and `DEPENDENCY_UNKNOWN` (FAILED), and reports binding counts. Candidate certification raises
`DEPENDENCY_INVALID` only for DEPENDENCY_UNKNOWN; a resolved-but-unbound reference is `SEMANTIC_BINDING_PENDING_PACKAGE`.
Map schema `canonical-covenant-map.v3`, assembly `covenant-map-assembly.v3`.

## 5. Phase 4

`verified-execution.ts` refuses any package whose rule carries a cross-rule condition (`referencesRuleTargets`) or a
REQUIRES / LIMITED_BY source dependency with `CROSS_RULE_GATE_NOT_EXECUTABLE`
("PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE"). The runtime (`lib/contract-model/runtime/`) is untouched; there is no
certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and an UNLIMITED_CAPACITY behind
it never executes - before or after package binding. This mission did not redesign Phase 4.

## 6. Regressions (all offline)

- `tests/contract-model/certified/live-7-2c-replay.test.ts` - evidence immutability; the frozen failures; the bad
  submission through the new validators; finding identity (old collision, new ids); the Pass-A ensemble replay
  (old 7/4/3 -> new 7/4 exact/3 coverage/0 single-run/4 groups); context depth old vs new with the traversal graph;
  the real Phase-2 operative state (no governing provision for the target; the relied-upon "Indebtedness" definition is
  HISTORICAL_ONLY because an amendment effect's effective date is CONDITIONAL_UNRESOLVED - an upstream Phase-2 defect,
  reported, not resolved); the §55 token guard over the changed production modules.
- `tests/contract-model/certified/xref-harness.ts` + `xref-fixtures.test.ts` - a synthetic agreement with fixtures A
  (scope reference), B (compliance reference), C (named condition), D (one-to-many), E (referenced numeric basket) and a
  7.05<->7.06 cycle; ten candidates all CERTIFIED, package CERTIFIED, 10/10 bindings bound and executable; the
  live-equivalent child's shape (§41/§42); no target economics in the child artifact; verified units unmutated; partial
  target set -> TARGET_CANDIDATE_NOT_IN_TARGET_SET / package PARTIAL; Phase 4 refused; entity-scope roles; retrieval
  cycle recorded once.
- `tests/contract-model/semantic-accountability/f5-3c-coverage-corroboration.test.ts` - segmentation robustness and the
  §29 anti-collapse controls (two dollar baskets, permission + condition, two near-identical exceptions, two ratio tests,
  conflicting functions).

## 7. Remaining semantic limitations (honest)

1. The real Phase-2 state for the instrument is itself REVIEW_REQUIRED: the "Indebtedness" definition the target relies
   on has an amendment effect whose effective date Phase 2 could not establish. A rerun of §7.2(c) with real state will
   therefore still carry `OPERATIVE_STATE_UNRESOLVED` - correctly - until Phase 2 resolves that effective date.
2. Pro-forma transaction timing is represented by `IRConditionEvaluationBasis` (strings preserved verbatim from source);
   it is not yet evaluable by the runtime (Phase 4 fails closed on every cross-rule gate).
3. A named-condition reference resolves only when the structural index knows the defined term; an undefined named
   condition is DEPENDENCY_UNKNOWN (certification blocks it), by design.
4. Ownership of an OTHER_SECTION reference is judged only when a structural anchor is available; standalone
   normalizations without an anchor keep such units as OWNERSHIP_UNDETERMINED (disclosed, not certified as owned).
5. The IR schema identifier stays `headroom-covenant-ir.v1` (the new fields are additive and optional; 400+ preserved
   fixtures pin it); cache invalidation rides on `semantic-accountability-compiler.v5` / prompt v6.
