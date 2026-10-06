# Red-team questions - answered from the code

Each answer cites the file that makes it true. "Before" refers to HEAD `e9f6b97` (start of the mission).

1. **Where is the map?** `lib/contract-model/covenant-map/types.ts#CanonicalCovenantMap`: ordered `nodes`, typed
   `edges`, `candidates`, `unresolved`, `completeness`, content-derived `mapHash` (`assemble.ts#computeMapHash`,
   telemetry excluded).
2. **What decides node order?** `order.ts#compareSourceOrder`: `(documentOrdinal, charStart, structuralDepth,
   localOrdinal)`, ties broken on `kind|nodeId`. Definitions order by their declaration offset
   (`assemble.ts`, `index.getDefinition(...).charStart`).
3. **What is the ONE operative-source rule?** `compiler/candidate-span.ts#resolveOperativeSource`: the anchor node's
   DESCENDANTS text, or the operative state's RESOLVED current text (`OPERATIVE_STATE_CURRENT_TEXT`). Enforced by
   `tests/contract-model/certified/architecture.test.ts` ("one operative-source builder"): the only module that
   assembles a candidate's `SemanticCompilerInput` is `covenant-map/candidate-input.ts`; the pilot's `buildInput`
   and `operativeTextFor` delegate.
4. **Which model conversation compiles a candidate?** Exactly one: `compiler/semantic/bounded-caller.ts`
   (`MAX_SEMANTIC_CONVERSATIONS = 1`), forced `tool_choice: submit_compilation`, one user message per request.
   Proven by `tests/contract-model/certified/bounded-execution.test.ts` ("normal candidate: exactly ONE request").
5. **When is a second call made, and what does it contain?** Only when the submission itself reports
   `MISSING_CONTEXT` naming a definition/section or an unresolved `dependsOn` target
   (`bounded-caller.ts#unresolvedDependencyRequests`). The gap is retrieved DETERMINISTICALLY through
   `ToolRunner.run("getDefinition"|"getReferencedProvision")`; the refinement request is rebuilt from canonical
   state (same system prompt, first user content, retrieved material, provisional submission as data). No transcript
   replay: every request has `messages.length === 1` (`bounded-execution.test.ts` "no transcript replay",
   "token-amplification gate").
6. **What happens when the refinement still reports a gap?** The honest submission stands; there is never a third
   request (`bounded-execution.test.ts` "non-convergence fails closed").
7. **Who retries?** Only `analyzer/transport-retry.ts#runWithTransportRetry` (maxAttempts 2; 429/5xx/network
   only). Every SDK client is `new Anthropic({ maxRetries: 0 })` (`analyzer/anthropic-analyzer.ts`,
   `covenant-map/callers.ts`); certified shards run `shardMaxAttempts: 1` (`certified-config.ts`). A 402, 4xx, abort
   or schema failure is never retried (`transport-layer.test.ts`).
8. **How does a timeout stop a request?** `analyzer/deadline.ts#createDeadline` produces an `AbortSignal` that is
   passed to `client.messages.stream(params, { signal })` in the bounded caller and to every `runStructuredStage`
   call (`anthropic-analyzer.ts`). The fake-provider test proves the request observes the signal and terminates before
   the candidate is reported ABORTED, and that a pool never exceeds its concurrency
   (`bounded-execution.test.ts` "timeout is a REAL abort", "no zombies").
9. **What stops spend before it happens?** `analyzer/dispatch-budget.ts#HardDispatchBudget.reserve`: committed +
   outstanding + max cost of THIS request must fit the ceiling, checked before every request, inside the compiler
   (bounded caller, `runStructuredStage`). Refusal throws `BudgetRefusedError` with zero requests sent
   (`bounded-execution.test.ts` "budget refusal happens BEFORE dispatch").
10. **How is a 402 recognised?** Structurally: HTTP status 402 or provider code `insufficient_funds` on the SDK error
    object (`analyzer/provider-error.ts#normalizeProviderError`), never by message text. It is CREDIT_EXHAUSTED,
    non-retryable, billing-known zero, and it stops the run (`covenant-map/pipeline.ts#CandidateCallObserver`:
    remaining candidates are UNSERVED, never silently skipped).
11. **Is usage separated from cost?** Yes: telemetry carries tokens; `analyzer/pricing.ts#priceUsage` prices them
    per model with a pricing version and status (`PRICED | UNKNOWN_MODEL | CACHED_UNKNOWN | NO_USAGE`). Before, every
    non-Opus model was priced as Sonnet (`telemetry.ts#rateCardForModel`, now deprecated): the 7.8 telemetry showed
    $3.52 for a $0.21 DeepSeek call.
12. **Why DUAL_PASS_ENSEMBLE?** `certified-config.ts` header: the accountability support signals
    (`supportReviewRequired`, `materialSingleRun`, `materialConflicted`) exist only when two independent Pass A
    executions are reconciled (`semantic-accountability/dual-pass.ts`); the phase-3 closure runs were validated in
    that mode. The mode is an explicit field; the certified path never reads `SEMANTIC_INVENTORY_MODE`
    (`bounded-execution.test.ts` "inventory mode comes from the explicit config").
13. **Why was sharding common?** `compiler/semantic/shard-planner.ts#deriveUnits` made every expansion region an owned
    `EXPANSION_REGION` unit and `packBlocks` flushes on region change, so any candidate with a cross-reference
    expansion planned >= 2 shards. Measured offline on the sealed CONMED population (zero cost): 53 of 161
    non-empty candidates would have been SHARDED (shard counts up to 7). The certified `expansionRegionPolicy:
    CONTEXT_ONLY` narrows Pass A / Pass C / planning to the OPERATIVE region(s) (`compile.ts#accountabilityContext`);
    expansion regions stay in Pass B's context.
14. **Why was retrieval almost never SUFFICIENT?** 103 of 104 preserved CONMED bundles were non-SUFFICIENT
    (62 BUDGET_EXCEEDED, 39 REVIEW_REQUIRED). `context-retrieval/pipeline.ts#computeSufficiencyState` demoted on ANY
    unresolved entry, including LOW-severity disclosures ("bounded descendant selection excluded a clause"). LOW no
    longer demotes; MEDIUM -> REVIEW_REQUIRED; HIGH -> INCOMPLETE. BUDGET_EXCEEDED (depth/items/chars) is unchanged
    and reported as an open finding in `01-audit.md`.
15. **Why did a section reference itself?** `structural-references.ts` detects the section's own label
    ("SECTION 7.01") as a reference; `reference-context.ts` then expanded the candidate's own node as a
    CROSS_REFERENCE region (14 of 104 CONMED bundles). Self and ancestor references are now skipped.
16. **Why was every amendment lead "unresolved"?** `cross-document-context.ts#addAmendmentLeadItem` always attached
    `OPERATIVE_STATE_UNRESOLVED` even when the instrument's `OperativeContractState` had RESOLVED that exact
    section with that document's effect applied. The lead is now CURRENT when a RESOLVED provision view proves it
    (`resolvedProvisionFor`).
17. **Does the compiler compile amended text?** Yes when the operative state RESOLVED the provision:
    `candidate-span.ts` returns `provision.currentText` (origin `OPERATIVE_STATE_CURRENT_TEXT`); the source-context
    resolver treats it as complete by construction (`source-context.ts`); the verifier recognises that the compiled
    text is the current text rather than flagging the superseded base node (`verify.ts`). The golden map proves
    7.02's compiled text is the amendment's text (`golden-map.test.ts`).
18. **How is a fabricated verifier owner handled?** `semantic-verification/finding-owner.ts#normalizeFindingOwner`:
    an exact unit id is kept; a fabricated id is repaired from `irPath` when it resolves to one unit; a multi-unit
    path leaves the owner null (`VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT`); the finding id is computed from the
    normalized owner. Regressions use the real 7.16(a) and 7.6(b) shapes from preserved evidence
    (`finding-owner.test.ts`).
19. **How are qualitative claims grounded?** `semantic-verification/qualitative-grounding.ts` (v2): a unit's
    provenance excerpt must be a locatable substring of the admissible source (operative text, source-context
    regions, bundle excerpts) or the unit must cite a frozen inventory item. FABRICATED excerpt -> MATERIAL;
    UNCITED under accountability -> MATERIAL; a lineage gap -> NON_MATERIAL. The verifier still imports nothing
    from the accountability layer (`semantic-accountability-independence.test.ts`).
20. **What is `sourceContentVersion`?** `covenant-map/source-content-version.ts`: sha256 over (documentId,
    structural node id, operative text hash, provision key, applied effect ids); STRONG when anchored and
    non-empty. Stamped on every rule/definition the certified path emits (`covenant-map/pipeline.ts`); before it was
    `null` on every unit.
21. **What are the edge types and where do they come from?** `types.ts#COVENANT_MAP_EDGE_TYPES`;
    derivations in `assemble.ts`: IR `dependsOn` (RULE_DEPENDS_ON_RULE), DEFINED_TERM_REFERENCE nodes and
    `dependsOnTerms` (RULE_USES_DEFINITION / DEFINITION_USES_DEFINITION), shared-capacity members, exception
    `permissionRuleId` (RULE_MODIFIED_BY_EXCEPTION and the reverse RULE_SUBJECT_TO_GENERAL_PROHIBITION),
    structural ancestry and PARENT_SCOPE items (general prohibition), PROVISO / CONDITION / CROSS_DOCUMENT_REFERENCE
    bundle items, operative-state superseded nodes (AMENDMENT_SUPERSEDES). One edge per (type, from, to).
22. **What is an unresolved item?** `types.ts#CovenantMapUnresolvedItem`: BLOCKING (no node here: unserved,
    failed, empty text, no anchor, not verified) or REVIEW (a node exists but must not be relied on: compile
    review, verification not passed, sufficiency, dangling dependency, unresolved term, weak identity, operative
    state). `validate.ts` checks the arithmetic and that `complete` is honest.
23. **Is the golden map byte-identical across runs?** Yes: `golden-map.test.ts` runs the pipeline twice with fresh
    callers, budget and cache and compares `mapHash` and the telemetry-stripped JSON.
24. **Does the certified path reach the legacy Phase C?** No: `.eslintrc.json` bans `compiler/orchestrator`,
    `RealSemanticCaller`, `getSemanticCaller`, `getStageCaller` from `covenant-map/**`;
    `architecture.test.ts` greps for the same; `tests/foundation-audit/legacy-phase-c-quarantine.test.ts` remains.
25. **Was Phase 4 touched?** No file under `lib/contract-model/verified-units`, `verified-execution` or `runtime`
    was modified (module hashes in `00-starting-state.json`; `git diff --stat e9f6b97 -- <dirs>` is empty).
26. **Was anything paid?** No. Zero provider calls: every new test uses fake clients; the offline maps are built from
    preserved evidence and fixture discovery runs (`scripts/canonical-map/build-offline-maps.ts`, `paidCalls: 0`).
27. **What does the CI job run?** `.github/workflows/canonical-compiler.yml`: typecheck, the certified suites, the
    verifier/retrieval suites the cleanse touched, the pilot evidence/persistence suites, a credential-literal scan
    and eslint on the certified path - with `AI_GATEWAY_API_KEY` deliberately empty.

## Pass A addendum

28. **Why did tiny clauses burn 40k-117k output tokens?** `inventory.ts` called the generic `getStageCaller()`,
    whose analyzer sends `max_tokens: 128000` and no `thinking` parameter to a reasoning model, with an unbounded
    wire schema and a prompt that demanded exhaustive atomic decomposition (`07-pass-a-root-cause.md`, P3-E10..E13).
29. **What bounds a Pass A call now?** `inventory-policy.ts#deriveInventoryOutputBound`: the derived `max_tokens`
    (7.2(c): 6,218), the per-call schema `maxItems`, the per-slot allowance in the prompt, `thinking: disabled`, a
    per-call deadline, and a per-pass call cap. Proven offline by `pass-a-bounds.test.ts` (request bodies captured
    with a fake fetch) and by the eight-target replay.
30. **Can the preserved telemetry say whether those tokens were reasoning?** No (P3-E14). The SDK types
    `usage.output_tokens_details.thinking_tokens`; the analyzer never read it. Every call now records it, plus the raw
    usage object, the stop reason and the requested ceiling.
