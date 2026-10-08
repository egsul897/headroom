# Mutation suite and anti-overfitting audit

Branch `claude/independent-product-validation`; first run at code SHA `83e6bf1d3ce044bf56c38083b5940e43d92adcd5`
(`mutation-runs/83e6bf1d3ce0/`), re-run after the harness strengthening of §8 (see the latest `mutation-runs/<sha12>/`) (`mutations.json` machine-readable, `mutations.md` per-verdict). Runner:
`npx tsx scripts/product-acceptance/run-mutations.ts` (≈6 s, zero provider calls). Pinned by
`tests/product-acceptance/mutations.test.ts` (22 tests). Nothing under `lib/` was modified; fixtures on disk were not
modified (every mutation is applied in memory and the corpus-integrity test re-pins the bytes).

## 1. What a mutation measures

Each mutation is one controlled legal edit to a pinned package, with three independent measurements:

1. **Expectation delta (HARNESS).** Before running, the mutation states which sections' text must change, which must
   stay byte-identical, which structural node ids should survive, what the operative state must say at given as-of
   dates, and what the hybrid closure (benchmark strategy C) must contain or flag for a question about the edit.
2. **Kill analysis (HARNESS).** The *unchanged* expectation manifest is run against the mutant through the production
   deterministic audits (`auditDeterministic`: structure, definitions, operative state, Pass A, context retrieval,
   non-operative). A new failure = the mutant is KILLED (the acceptance suite would notice this legal change). No new
   failure = SURVIVED: either the edit is legally neutral (EQUIVALENT) or the deterministic layer cannot see it (GAP).
   A prediction (KILLED / EQUIVALENT / GAP, with the stage that kills) is written before the run; a wrong prediction
   is a finding about the harness, never a reason to edit the expectation after the fact.
3. **Product verdicts (PRODUCT).** What Headroom's deterministic stages say about the mutant. A failing product verdict
   is registered in `03-defect-register.json` with evidence `MUTATION`; the mutation test fails if any such verdict is
   unregistered or any registration stops failing.

Survival is a statement about the acceptance harness and the deterministic layer. It is never evidence that Headroom
is correct on the mutant.

## 2. Catalogue and results (run `83e6bf1d3ce0`)

| Mutation | Operator (directive) | Pkg | Legal effect | Mutant | Predicted | Prediction held | Node ids kept | Text hashes kept |
|---|---|---|---|---|---|---|---|---|
| MUT-01 | CHANGED_THRESHOLD | A | 7.01(b) $30m → $45m (same length) | KILLED (STRUCTURE, OPERATIVE_STATE) | KILLED | yes | 10/10 | 9/10 |
| MUT-02 | ADDED_CONDITION | A | 7.01(c) ratio basket gains a no-Default proviso | SURVIVED | GAP | yes | 8/10 | 9/10 |
| MUT-03 | REMOVED_EXCEPTION | D | 7.05(l) deleted; hanging proviso now follows (k) | KILLED (STRUCTURE, DISCOVERY_PASS_A) | KILLED | yes | 20/20 | 19/20 |
| MUT-04 | REVISED_DEFINITION | B | CA "Consolidated EBITDA" loses the stock-comp add-back | KILLED (STRUCTURE: definition text) | KILLED¹ | yes | 2/8 | 7/8 |
| MUT-05 | NEW_AMENDMENT | C | Amendment No. 3 restates 7.01(d) $5m → $8m eff. 2026-05-01 | KILLED (OPERATIVE_STATE) | KILLED | yes | 10/10 | 10/10 |
| MUT-06 | MOVED_COVENANT | A | Liens covenant renumbered 7.02 → 7.04 | KILLED (STRUCTURE, DISCOVERY_PASS_A) | KILLED | yes | 10/10 | 9/10 |
| MUT-07 | CHANGED_ENTITY_SCOPE | I | 7.01(b) widened to Foreign Subsidiaries | KILLED (STRUCTURE: own text) | KILLED¹ | yes | 6/15 | 14/15 |
| MUT-08 | CONFLICTING_DOCUMENT | B | side letter lifts 7.01(b) to $60m "notwithstanding" | SURVIVED | GAP | yes | 8/8 | 8/8 |
| MUT-09 | REORDERED_HIERARCHY | A | 7.02 and 7.03 swap places, text unchanged | SURVIVED | EQUIVALENT | yes | 9/10 | 10/10 |
| MUT-10 | MISSING_REFERENCED_PROVISION | C | 7.02 now points to non-existent 7.01(f) | KILLED (CONTEXT_RETRIEVAL) | KILLED² | yes | 10/10 | 9/10 |
| MUT-11 | CHANGED_THRESHOLD (in amendment) | C | Amendment No. 1 restates at $45m instead of $40m | KILLED (STRUCTURE, OPERATIVE_STATE ×2) | KILLED | yes | 10/10 | 10/10 |
| MUT-12 | CONFLICTING_DOCUMENT (tightening) | B | side letter caps 7.01(b) at $10m "notwithstanding" | SURVIVED | GAP | yes | 8/8 | 8/8 |

Totals: 12 mutants, 8 killed, 4 survived (1 equivalent, 3 declared gaps), 12/12 predictions held on the committed run,
109/109 HARNESS verdicts, PRODUCT verdicts 9 pass / 4 fail (all four registered as IPV-16).

¹ First-run predictions for MUT-04 and MUT-07 were GAP: I had assumed definition bodies and clause own-text were not
pinned deterministically. They are (`definitions.exact[].mustContain`, `structure.exact[].ownTextContains`), so the
mutants were killed at STRUCTURE. The predictions were corrected and the correction is recorded in the catalogue
(`survivalReason`). The entity scope itself and the definition semantics remain checked only at the mocked semantic
stage; what the deterministic layer sees is a text fragment.

² First run: SURVIVED. Every manifest declares `crossReferences[].mustResolve`, but `auditContextRetrieval` never
checked it. The audit was added (structural reference from the clause, or a bundle item reached through a retrieved
definition, landing in the declared document). Its first version accepted only `CROSS_REFERENCE`-typed items and
reported package J's 7.08(d) as missing its sibling (registered as IPV-17); the package-K control in §8 showed the
sibling was present under a different item type, and IPV-17 was closed as a harness false positive.

### 2.1 Survivors, one by one

- **MUT-02 (added condition) — GAP, expected.** A new "provided that no Default…" on the ratio basket changes no
  pinned fragment: conditions are only represented at the semantic stage, which is mocked. Consequence for the
  product: a deterministic-only pipeline cannot notice a new condition; detection depends entirely on the model stage
  plus Layer-1 accountability (inventory coverage of the new proviso). Recommendation for the harness: pin a
  whitespace-normalised text hash per covenant node in the manifest so any textual change to an operative clause is a
  deterministic kill (cheap, no model needed). Not implemented yet because it is a harness-strength change that
  should be made at the same time as the hash-keyed cache recommendation in §3.
- **MUT-08 / MUT-12 (conflicting document) — GAP, and a product defect.** See IPV-16 (§4). The hybrid closure does
  include the side letter (`side-letter#1`) and the package graph records a REVIEW_REQUIRED cross-document lead, but
  the amendment pipeline yields zero effects (zero interpreter calls) and the operative state stays
  `OPERATIVE_STATE_RESOLVED` with the base text. The unchanged manifest's `CURRENT` expectation therefore keeps
  passing — which, for MUT-12, is exactly the false permission.
- **MUT-09 (re-order) — EQUIVALENT, correct.** No manifest check depends on document order. The identity finding in
  §3 is the only effect.

## 3. Structural identity under edits (finding, not a defect)

Node ids are `computeStableKey("structural-node", documentId, nodeType, charStart)`
(`lib/contract-model/compiler/stage-structure.ts:1210`): positional. Measured on the committed run:

| edit class | example | node ids kept | text hashes kept | what it means |
|---|---|---|---|---|
| same-length replacement | MUT-01, MUT-06, MUT-11 | all | all but the edited node | ids are a usable cache key only by luck of length |
| insertion / deletion | MUT-02 (+95 chars), MUT-04 (−42), MUT-07 (+31) | 8/10, 2/8, 6/15 | all but the edited node | every node after the edit gets a new id although its text is unchanged |
| section swap | MUT-09 | 9/10 | all | 7.03 inherits 7.02's former id (same offset): positional identity can silently re-label a node |

Consequences, stated without modifying anything:

- Anything keyed by node id across document versions (discovery `structuralNodeIds`, provision views'
  `currentSourceNodeId`, supersession indexes, context-item ids, evidence lineage) is invalidated by any edit earlier
  in the document, and can be *mis-matched* by a re-order. Within one version the ids are sound.
- The semantic cache key (`computeCacheKey`, `semantic/cache.ts`) hashes `operativeSourceText` and the bundle's
  `contentIdentity`, not node ids, so compiled units *do* survive an upstream insertion; the benchmark's incremental
  recompilation estimate (doc 08 §7) relies on this and the mutation run confirms the text hashes survive.
- Recommendation (handoff, not implemented): a content-addressed identity (document id + node type + normalised
  own-text hash + occurrence ordinal) alongside the positional id, or an explicit cross-version node mapping, before
  any "amendment diff" or "what changed since last compile" feature is built on node ids.

## 4. Product defects found by the suite

| id | severity | stage | found by | one line |
|---|---|---|---|---|
| IPV-16 | CRITICAL_FALSE_PERMISSION (tightening) / UNSUPPORTED_AS_COMPLETE (loosening) | OPERATIVE_STATE | MUT-12, MUT-08 | a "notwithstanding … shall not … exceeding $10,000,000" side letter is not a modification candidate; 0 effects, 0 unattached, instrument RESOLVED on the base text |
| IPV-17 | — (CLOSED, harness false positive) | CONTEXT_RETRIEVAL | the cross-reference audit MUT-10 forced | first reported as 7.08(d) missing its sibling; the sibling was in the bundle as a CALCULATION_PROVISION item (7.06(c) carries a ratio test), not as CROSS_REFERENCE; the package-K control is symmetric. Residual observation: a definition-mediated sibling's bundle item type depends on the sibling's own content |
| IPV-18 | UNSUPPORTED_AS_COMPLETE (fail-closed) | SEMANTIC_COMPOSITION | package K | no covenant family for prepayments of junior debt; the normalizer relabels the unit QUALITATIVE_NEGATIVE_COVENANTS with action null, so a three-way builder pool cannot be represented |

IPV-16 and IPV-18 are deterministic, reproduce from the register's `repro`, and are handed to the Cursor track with the
handoff fields in `03-defect-register.json`. IPV-16's hypothesis (override/waiver drafting forms are outside
`modification-candidates.ts`'s vocabulary) is a hypothesis from observed behaviour, not a traced fix. IPV-17 is kept
in the register as a closed entry so the false positive and its correction are on the record.

## 5. Anti-overfitting audit of production code

Question: does any production code path depend on an issuer name, a fixture id, a hard-coded document or provision
id, or a company-specific branch? Method: grep over `lib/` (`.ts`), classifying every hit as code or comment, and
checking who imports each file. Commands and raw counts are in the mutation run's sibling log (`mutations.md` header)
and reproduce with the greps below.

```
grep -rniE "conmed|gibraltar|\bCNMD\b" lib --include=*.ts            # issuer / dataset tokens
grep -rnE  "conmed-doc-[a-z]|discovery-candidate:[0-9a-f]{8}|structural-node:[0-9a-f]{8}" lib --include=*.ts
grep -rnE  "if \(.*(companyId|documentId|instrumentKey) *===? *\"" lib --include=*.ts
grep -rnE  "Chewy|DSGR|FWRG|\bLSB\b|CONMED" lib/contract-model/compiler lib/contract-model/runtime --include=*.ts | grep -vE ":\s*(\*|//)"
```

Findings:

| class | files | verdict |
|---|---|---|
| Issuer / dataset names in **comments** of compiler code (rationale "confirmed real on CONMED Document D", "not CONMED-specific") | `compiler/discovery/normalization.ts`, `discovery/types.ts`, `structural-coverage.ts`, `amendment/{schedule-modification,markup-exhibit,effective-date,pipeline,operative-state,independent-verification,types}.ts`, `package-graph/{document-classifier,relationship-resolution,modification-candidates}.ts`, `stage-structure.ts`, `semantic/prompt.ts` | comments only; the one non-comment hit is a rule's `rationale` string in `normalization.ts:110` saying a pattern is *not* CONMED-specific. No issuer token influences control flow. Residual risk: these patterns were *derived from* one issuer's drafting; generality is argued in comments, not evidenced — the synthetic corpus here is the first independent evidence and it exposed IPV-06/07/08/11. |
| Issuer-specific **code** in evaluation tooling | `evaluation-v2/adapters/legacy-package.ts` (imports `@/tests/fixtures/unseen-packages/{conmed,fwrg,lsb}-*/human-ground-truth`), `evaluation-v2/runner/run-*.ts`, `run-adversarial.ts` (imports `@/tests/evaluation-v2/*`) | `lib/` code importing test fixtures. Not imported by `compiler/` or `runtime/` (verified: no `evaluation-v2` import from either). Evaluation plumbing, not product; flagged as a layering smell. |
| Issuer-inspired **fixtures** under `lib/` | `runtime/input/store/certificate/fixtures/conmed-form-inspired.ts` (exported from `fixtures/index.ts`) | fixture data living in `lib/`; `types.ts:106` states store code never hardcodes CONMED/Chewy sectionRefs, and no non-fixture file imports `fixtures/`. Layering smell only. |
| Hard-coded provision ids, fixture ids, document ids | — | none found. |
| Company-specific branches (`if (companyId === "…")` etc.) | — | none found. |
| Section-number literals (`"7.0x"`) | `semantic-accountability/source-coverage.ts:323,479`, `semantic/governing-scope.ts:49` | comments/examples of the section grammar only. |
| Dollar / ratio literals | `semantic/prompt.ts`, `semantic-verification/prompt.ts`, `structural-ambiguity-classifier.ts:191`, `semantic-coverage/unit-hypothesis.ts`, `value-anchors.ts`, `numeric-assertion.ts`, `reconciliation.ts`, `semantic-accountability/inventory.ts` | few-shot prompt examples (§9.02/§9.03 synthetic text), doc comments, and normalisation examples. None compares a source figure to a constant. |

Verdict: **no company-specific logic in the compiler or runtime**. The overfitting risk is of the softer kind — pattern
vocabularies (modification candidates, document classifier, effective-date forms, schedule/markup amendments) were
grown against one issuer's package and are documented as general without independent evidence. The mutation suite's
IPV-16 is a direct instance: the amendment vocabulary covers the forms that issuer used (amend, restate, replace,
delete, markup exhibit, schedule modification) and not a waiver/side-letter override.

## 6. What this changes in the readiness picture

- Acceptance run refreshed at `acceptance-runs/83e6bf1d3ce0/`: 444 checks, 388 pass / 42 fail / 14 not tested
  (was 431: 376/41/14). The 13 new checks are the cross-reference audits (12 pass, 1 fail = IPV-17).
- Register: IPV-01…IPV-18 (IPV-16 and IPV-18 new and deterministic; IPV-17 opened and closed as a harness false
  positive). Priority-0 class (false permission / dangerous omission / source authority) now holds IPV-01, IPV-02,
  IPV-03, IPV-16; F-R runtime cases unchanged.
- The "can Headroom cheaply establish the legal universe" answer from doc 08 gets one qualification: the
  deterministic closure finds the override document (hybrid scope includes `side-letter#1`) but the operative-state
  layer, which the certified path consumes for lineage, does not. Until IPV-16 is fixed, any package containing a
  waiver, consent or side letter must be treated as `OPERATIVE_STATE` unknown for the sections it names.

## 7. Harness strengthening after the first run (same day)

1. **Text-hash pinning.** Every manifest covenant now carries `textSha256` (sha256 of the whitespace-normalised
   DESCENDANTS text of its node, written by `pin-corpus.ts`, checked by `auditStructure` as `structure:text:<id>`).
   MUT-02 (added proviso) is now KILLED at STRUCTURE; the catalogue records the first-run survival and the fix.
2. **Side-letter / consent family** (MUT-13 A, MUT-14 C after two real amendments, MUT-15 H, MUT-16 I consent). All
   four behave like MUT-08/12: zero amendment effects, instrument RESOLVED on the base text. Registered as additional
   IPV-16 signatures (packages A, B, C, H, I). MUT-16 also found a gap in the *evaluation model*: the hybrid closure's
   family-cue + normative-verb scan missed a consent that reads "hereby consent to …" (no modal verb); the closure now
   also pulls in a section of another operative document that names an in-scope section of a document it refers to.
   The benchmark results did not change.
3. **Package K** (`pkg-k-three-way-builder`): one Available Amount shared by 7.06(c), 7.08(d) and 7.09(b) (prepayments
   of junior debt). Control for IPV-17: every basket retrieves the other two symmetrically (as CROSS_REFERENCE items),
   which exposed the J report as a false positive. K also surfaced IPV-18 (no family for junior-debt prepayments) and
   two more IPV-09 plural-term omissions.
4. **Adversarial plans for I, J, K.** I-P2 (scope widening on 7.01(b)) is refused, but for an unrelated reason (the
   context contract is unacceptable because of the DEFINITION_CYCLE on "Subsidiary"), so it is not evidence that the
   scope guard would catch it; J-P1 (dropping the ratio test and the definition-sourced Default kill-switch) is refused
   in both variants (MATERIAL_DISCREPANCY), unlike A-P1 where the lineage-on-rule variant certifies (IPV-03); J-P3 and
   K-P2 refused. I-P1/I-P3 and J-P2/K-P1 are question-level or representation-gap claims and are exercised by the
   benchmark (BM-01, BM-14) and IPV-15 respectively, not by a Pass B submission.

## 8. Repro

```
npx vitest run tests/product-acceptance/mutations.test.ts      # 26 tests
npx tsx scripts/product-acceptance/run-mutations.ts            # writes mutation-runs/<sha12>/
npx tsx scripts/product-acceptance/run-all.ts                  # writes acceptance-runs/<sha12>/
```
