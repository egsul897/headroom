# Phase 2E — Independent Covenant Coverage & Context Auditor V1: Final Report

**Central question this phase answers:** can an independent mechanism
inspect the source contractual universe and reliably tell us when
Headroom's covenant-discovery or context-retrieval pipeline failed to
notice material information — including information the primary pipeline
itself does not know it missed? **Answer: yes, at V1 scope, with
adversarial evidence, not by pointing to the primary pipeline's own
passing tests.** A source-side auditor that never reads Phase 2B/2D
conclusions during candidate generation (mechanically enforced) catches
100% of 12 injected material defects, independently rediscovers both
already-known real structural limitations (the LSB comma-list gap and the
FWRG clause-boundary mis-scoping) from source alone, and — the central
deliverable — independently re-audited Phase 2D's own "12-case, zero
material misses" benchmark and found **5 real, previously unreported
material context gaps in FWRG** that Phase 2D's own less-adversarial
ground truth did not catch.

**Starting SHA:** `136f8b4` (Phase 2D's own final commit)
**Final SHA:** see the commit this report ships in.

## 2. Independence Contract

**Allowed inputs during independent inventory generation:** raw indexed
source text; structural nodes/spans (Phase 2A's `StructuralIndex`); source
spans; deterministic document structure; package identity; instrument
topology; document relationship topology (Phase 2C's `PackageGraphResult`
— a topology fact, not a Phase 2B/2D semantic conclusion); source-side
defined-term locations and explicit source-side references (Phase 2A's own
definition/reference index); independently derived deterministic
legal/economic signals (this phase's own `signals.ts`, authored from
scratch against the task's own signal list, never by reading
`discovery/pass-a-signals.ts`); independently selected structural regions;
low-level provenance/source metadata.

**Forbidden inputs during independent inventory generation:** Phase 2B
`DiscoveredCandidate[]`; Phase 2B semantic conclusions/family
classifications; Phase 2D `CovenantContextBundle`; Phase 2D dependency
lists/sufficiency states; compiler rule outputs; primary-pipeline
"coverage" conclusions; benchmark expected answers.

**Comparison stage only:** after the independent inventory exists,
`discovery-comparison.ts`, `context-comparison.ts`, and
`definition-audit.ts` MAY read Phase 2B/2D/2C real output — solely to
classify whether independently identified material was
discovered/retrieved/omitted. Primary outputs are comparison targets, not
discovery inputs.

**Mechanical enforcement:**
`tests/contract-model/coverage-audit-independence.test.ts` (7 tests)
statically parses every `coverage-audit/*.ts` file's own import
statements and fails if `source-inventory.ts`, `signals.ts`,
`materiality.ts`, or `context-inventory.ts` (the independent-inventory-
generation modules) import anything beyond low-level structural
infrastructure (`structural-index`, `structural-references`,
`structural-definitions`, `hashing`, `types`, `package-graph/types`) — not
even `discovery/types.ts` or `context-retrieval/types.ts` type-only. A
separate test enumerates every file and confirms only the three declared
comparison-stage modules import those conclusion types at all.

**Unavoidable independence limitation, disclosed:** the auditor's own
`context-comparison.ts`/`definition-audit.ts` necessarily read the real
`CovenantContextBundle` to perform the comparison itself (per the task's
own design) — independence is enforced at the *generation* boundary
(the independent inventory is built with zero knowledge of the bundle),
never at the comparison boundary, exactly as the contract specifies.

## 3–4. Existing COVERAGE architecture audited

Three pre-existing, genuinely distinct mechanisms were found and audited:

1. **`lib/contract-model/compiler/stage-coverage.ts`** (Phase C's own
   COVERAGE stage) — compares an LLM-generated `InventoryStageOutput`
   (itself a real, paid semantic call reading full document text) against
   `CandidateContractRule[]`/`CandidateDefinedTerm[]` from the *same*
   Contract Compiler run, at **SECTION-level granularity only** (never a
   sub-clause/basket level). Operates entirely on the LLM Contract
   Compiler pipeline's own types — never touches `DiscoveredCandidate` or
   `CovenantContextBundle` at all. **Not reused**: it is section-coarse, is
   itself a real LLM call (not independent of semantic reasoning), and
   targets an entirely different pipeline (Phase C's stage-based
   `ContractCompilerRun`, not the Phase 2A→2B→2C→2D deterministic-discovery
   track this phase continues).
2. **`lib/contract-model/analyzer/coverage.ts`** (Phase C0's own
   `detectStructuralCoverageGaps`) — a flat regex clause-marker scan
   diffed against a citedSectionRefs list, explicitly disclosed in its own
   docstring as "a floor, not a correctness check" with no nesting
   awareness. **Not reused**: superseded functionally by Phase 2A's real
   clause-tree parser, which this phase's own `source-inventory.ts` builds
   on directly instead.
3. **`lib/contract-model/analyzer/verify.ts`** (Phase C0's own
   source-proximity verification) — checks a modeled rule's own cited
   section/threshold appear near each other in source text; a
   *post-hoc correctness check on already-modeled rules*, not a
   *pre-modeling independent inventory*. Different question entirely
   (task's own distinction preserved, not duplicated).

**Conclusion:** none of the three operates at the granularity or
independence level this phase requires (sub-clause/basket-level, zero
primary-pipeline input during generation, targeting the Phase 2B/2D
deterministic track specifically) — a new system was warranted, and no
responsibility overlaps with any of the three above.

## 5–13. Auditor architecture, source-side inventory, CoverageRegion, deterministic candidate generation

New module: `lib/contract-model/compiler/coverage-audit/` (11 files, ~1,159
lines). `source-inventory.ts` scans every Phase 2A `StructuralNode` in a
document (never assuming material content lives only in conventional
covenant articles — task §5) against `signals.ts`'s independently-authored
deterministic signal table (prohibitory/permissive, economic, mechanic,
family-headline — task's own exact §5 list). A node becomes a
`CoverageRegion` (task §6's exact minimum field set: region identity,
company/package/instrument/document, structural node, source span/
citation, detected signals, probable role, audit status via the coverage
map, algorithm version, provenance) if it fires ≥1 real signal, or is a
headline-titled SECTION with no other signal (mirroring, not copying,
Phase 2B's own "must never drop a signal-free chapeau" rationale — checked
LAST as a fallback, not first, so a specific role is never masked by the
generic headline bucket).

**Genuinely new, non-obvious detection**: `countInlineEnumerationMarkers`
independently detects enumerated markers ("(i)", "(ii)") inside a node's
own text that do NOT correspond to a separate child `StructuralNode` —
`possibleUnstructuredMultiItem` — the same real class of gap as the known
LSB `6.14(b)/(c)/(d)` comma-list limitation, detected here from first
principles, never hardcoded to that specific section. A real precision
problem was found and fixed during this phase's own construction: a naive
marker count over-fired on bare **citation lists** ("Indebtedness
permitted under clauses (j), (m), (n)(ii)(C), (u)...") — fixed by requiring
a minimum amount of real content (or a substantive economic/legal
keyword) between consecutive markers before counting an item as genuine,
a generic, non-package-specific precision rule (disclosed in §40 below,
including its own remaining false-positive rate).

## 10. Materiality logic

`materiality.ts`: MATERIAL = a prohibitory/permissive-or-mechanic signal
**combined with** a real economic signal. UNCERTAIN = either category
alone (a real qualitative restriction/condition with no quantified
threshold, or a bare number with no framing) — **never suppressed to
improve precision** (task §10's own explicit instruction, verified by
synthetic test 38 and reflected in the real FWRG/LSB run's own 93/108 and
6/10 uncertain-finding counts, reported honestly rather than hidden).
NON_MATERIAL = neither category — no finding is ever fabricated over it.

## 9/12/13. Discovery comparison, partial discovery, multi-basket auditing

`discovery-comparison.ts` classifies each region via
`DISCOVERED_EXACTLY`/`_BY_DESCENDANT`/`_BY_ANCESTOR`/`PARTIALLY_DISCOVERED`/
`NOT_DISCOVERED`/`AMBIGUOUS` (never exact-string-equality — task §9) using
Phase 2A's own ancestor/descendant/sibling navigation. Ancestor-only credit
is **only** accepted for a genuinely single-child region (no siblings at
all); any region with siblings gets `PARTIALLY_DISCOVERED` instead (task
§9's own "do not over-credit a coarse parent candidate" — a real, inverted
version of this check was found and fixed during construction: an earlier
draft granted ancestor credit whenever *any* sibling had its own
candidate, which is backwards — it should always deny it when siblings
exist, since a sibling's own individuation says nothing about whether
*this* region was). `DISCOVERED_SEMANTICALLY_EQUIVALENT` is reserved,
never produced (deterministic-only V1 — see §14 below).

**Structural-vs-discovery attribution (task §22/§30) is a genuinely
separate code path, not a label**: `possibleUnstructuredMultiItem` always
produces its own `STRUCTURAL_COVERAGE_GAP` finding
(`rootCauseSubsystem: STRUCTURAL_SUBSTRATE`), completely independent of
what the primary candidate list says — proven directly by the real FWRG/
LSB run rediscovering the already-known LSB `6.14` gap and the FWRG
`6.01(x)`-family gap this way. A *second*, additive finding
(`PARTIAL_DISCOVERY`, `rootCauseSubsystem: DISCOVERY_PHASE_2B`) is emitted
only when the one candidate touching that exact node also failed to flag
`multipleRulesLikely` despite having the node's own full text available —
the two are never collapsed into one finding (task §22's explicit
instruction), since fixing one does not fix the other.

## 14–20. Context comparison: parent/child/sibling/definition/xref/proviso/shared-cap/amendment/cross-document auditing

`context-inventory.ts` independently derives what context a covenant
needs from raw structure alone: ancestor chain (excluding ARTICLE),
direct children, **clause-level siblings only** (a real false-positive
class was found and fixed here: a sibling that is itself a top-level
SECTION/ARTICLE — i.e. an entirely different covenant family — was
initially still scanned for proviso/exception signals, incorrectly
flagging e.g. Section 6.01's own "except:" wording as "missing" context
for an unrelated Section 6.07 candidate; fixed by excluding SECTION/
ARTICLE-type siblings from this scan entirely), recursive same-document
definitions (own small administrative denylist — "Code", "GAAP", etc. —
independently authored, found necessary after "Code" alone produced a
false `MISSING_DEFINITION` against every real covenant mentioning it),
material cross-references (a calculation/interpretation-signal check
against the whole covenant's own text, not a per-reference offset — see
Errors below), and amendment/cross-document leads read directly from
Phase 2C's real `PackageGraphResult.modificationCandidates`/
`crossDocumentReferenceLeads` (task §19's own explicit instruction: "Use
Phase 2C package topology independently from Phase 2D bundle
conclusions"). `context-comparison.ts` (comparison stage) diffs this
inventory against the real bundle's `items`/`unresolvedDependencies`,
producing `MISSING_PARENT_CONTEXT`/`_CHILD_CONTEXT`/`_PROVISO`/
`_SHARED_CAP`/`_EXCEPTION`/`_CONDITION`/`_DEFINITION`/
`_DEFINITION_DEPENDENCY`/`_AMENDMENT_LEAD`/`_CROSS_DOCUMENT_REFERENCE`, or
`SILENT_UNRESOLVED_DEPENDENCY` when something independently material is
present in **neither** `items` **nor** `unresolvedDependencies` (the
dangerous, fully-silent case — task §15's central distinction from "did
Phase 2D retrieve what it already knew about").

`definition-audit.ts` (task §16) independently re-reads a definition's own
REAL full text (`getDefinitionFullText`) for sub-structure signals
(inclusion/exclusion/addback/deduction/cap/time-limit/anti-duplication/
entity-scope) and flags `MISSING_DEFINITION_DEPENDENCY` when the bundle's
own stored excerpt dropped sub-structure the real text contains —
retrieving the top-level definition alone is not credited as sufficient.

**Materiality nuance found during the real audit**: `CONDITION` and
`ENTITY_SCOPE` sibling signals are the two weakest, most ambiguous
categories (a sibling clause containing "so long as" or an entity-type
mention could be a genuine global modifier, or simply an unrelated,
independently-operative sibling basket) — these produce `UNCERTAIN`
findings; `PROVISO`/`EXCEPTION`/`SHARED_CAP` (stronger, standard
"trailing modifier" drafting signals) remain `MATERIAL`. This distinction
was added after the real FWRG/LSB run, never suppressing the ambiguous
findings, just not fabricating false certainty about them (task §10).

## 21–23. Finding model, attribution, no mutation

`AuditFinding` carries every field task §21 requires: stable
content-derived `findingId`, company/package/instrument/document,
structural node/citation, `findingType` (the exact 18-member taxonomy from
§21), `materiality`, `sourceEvidence` (the actual missing unit, never
"section incomplete" — task §11), `auditorReasoning`, `comparisonResult`,
`rootCauseSubsystem` (§22's exact 5-value attribution enum),
`affectedDiscoveryId`/`affectedBundleId`, `resolutionStatus`, algorithm/
semantic-prompt/provider identity, provenance. The auditor never writes to
`DiscoveredCandidate`, `CovenantContextBundle`, or any compiler/
verification/promotion state (task §23) — every function in
`coverage-audit/*` is a pure function returning findings; nothing is
persisted or mutated anywhere in the primary pipeline.

## 8/33. Semantic audit layer

**Not built.** Deterministic recall proved sufficient for every required
synthetic scenario and the 100%-required fault-injection gate (§41 below)
— per the task's own instruction ("Do not start with semantic auditing" /
"only if deterministic recall is insufficient"), no semantic call was
ever needed, matching Phase 2B/2C/2D's own precedent exactly.
`semanticPromptVersion`/`providerIdentity` fields exist on every finding
and are `null` throughout. **Zero model calls, zero tokens, $0.00 cost.**
No cost estimate was required since no semantic call was made.

## 24. Synthetic corpus (task's exact 38 required scenarios)

`tests/contract-model/coverage-audit-pipeline.test.ts` — **all 37
non-redundant assertions covering the full 38-item list** (item 9/10 are
combined into one test, per the task's own "9-10. greater-of/grower
basket" pairing) — Discovery attacks (1–18), Context attacks (19–32),
Auditor quality controls (33–38). No FWRG/LSB-specific section numbers,
thresholds, company names, or benchmark answers appear anywhere in this
file (task §7). Notable finding during construction: test 27 (a relative
reference, e.g. "the preceding paragraph") revealed a genuine, disclosed
V1 limitation — the auditor only independently detects **absolute**
SECTION/ARTICLE/SCHEDULE/EXHIBIT references (reusing Phase 2A's own
node-anchored index), never relative ones; the test asserts the auditor
correctly produces **no finding at all** about such text rather than
fabricating a false claim either way.

## 25–27. Fault injection (mandatory, task's exact 12-item list)

`tests/contract-model/coverage-audit-fault-scenarios.ts` builds ONE
structurally rich, CORRECT synthetic covenant (parent prohibition, a
lettered basket with its own candidate, a trailing proviso, a shared cap,
an entity-scope condition, a top-level definition, a nested definition, a
material calculation cross-reference, a real Phase 2C `ModificationCandidate`
targeting it) via the REAL `buildCovenantContextBundle` (Phase 2D's own
pipeline, not a hand-mocked bundle), then deliberately removes/corrupts
exactly one material item per the task's own 12 `InjectedDefectType`
values and asserts the auditor independently rediscovers each one -
**never encoding a test-only "missing item" flag into the production
`coverage-audit/*` modules** (the removal logic lives entirely in the test
file). `runFaultInjectionManifest()` persists the exact machine-readable
record task §26 requires (injectionId, location, defect type, materiality,
expected behavior, actual finding IDs, caught/not-caught, reason) —
reproducible directly via `npx tsx` or the vitest gate below, never
summarized only in prose.

**Two real bugs found and fixed by this fault-injection construction
itself** (not the synthetic-corpus tests, which used cleaner fixtures):
1. The ancestor-credit inversion described in §12/§13 above — caught by
   `REMOVE_BASKET` initially returning `DISCOVERED_BY_ANCESTOR` (silently
   skipped) instead of a real finding.
2. Context-comparison functions require auditing the covenant from the
   *leaf* candidate's own perspective (siblings), not the parent's
   (children) — `REMOVE_TRAILING_PROVISO`/`REMOVE_SHARED_CAP`/
   `REMOVE_ENTITY_SCOPE` initially produced zero findings because the
   fixture's bundle was anchored at the parent node, where Phase 2D
   retrieves those same clauses as plain `CHILD_RULE`, not `PROVISO`/
   `SHARED_CAP`/`ENTITY_SCOPE` — fixed by anchoring the fault-injection
   bundle at the leaf candidate, matching real production usage.

## Coverage map, persistence/versioning, incrementality, idempotency, isolation

**Coverage map** (`coverage-map.ts`, task §35): `AUDITED_NO_GAP_FOUND`/
`AUDITED_GAP_FOUND`/`AUDIT_UNCERTAIN`/`NOT_AUDITED`/
`STRUCTURALLY_UNAVAILABLE` per region — "audited" is never equated with
"correct" (tested directly: a clean region is `AUDITED_NO_GAP_FOUND`, one
with only an `UNCERTAIN` region-level materiality and no finding is
`AUDIT_UNCERTAIN`, never silently folded into "clean").

**Persistence/versioning** (task §36): same standalone, in-memory,
content-hash-identity discipline as Phase 2B/2C/2D — `computeContentIdentity`
hashes company/package, structural-parser version, this phase's own
`auditAlgorithmVersion`, semantic-prompt/provider identity (both `null`),
and every region's own read span. No new Prisma schema — `DiscoveredCandidate`
and `CovenantContextBundle` are themselves not yet persisted (Phase 2B/2D's
own disclosed limitations), so a dependent auditor table would sit on
sand; deterministic recomputation from unchanged inputs is the real,
tested persistence story here, exactly as it was for the three prior
phases.

**Incrementality** (task §37): structural, not special-cased — `regionId`/
`findingId` are pure functions of `(documentId, nodeKey, signal-set)` and
`(documentId, nodeKey, findingType, evidence)` respectively, so changing
one document's text only changes that document's own regions/findings;
nothing about another document or instrument's identity depends on it.
Not separately re-proven with a dedicated multi-document incrementality
test in this phase (a real limitation, disclosed below) — the identity
scheme itself is the mechanism, matching Phase 2D's own "content hash IS
the invalidation boundary" precedent.

**Idempotency** (task §38, tested directly): `tests/contract-model/coverage-audit-map-and-isolation.test.ts`
proves two identical runs produce byte-identical `contentIdentity`, the
same sorted `regionId`/`findingId` sets, and zero duplicate identities
within either run.

**Tenant/instrument isolation** (task §39, tested directly): a
company-A-only run's every region/finding carries `companyId: "company-a"`
and the full serialized result contains zero mention of any other
company; cross-instrument definition isolation was already proven in the
synthetic corpus (test 31 — two documents with identically-named,
differently-bodied "Consolidated EBITDA" never cross-resolve).

## 32–37. Fault-injection recall metrics (task §40, computed from the persisted manifest, never combined)

| Metric | Value |
|---|---|
| Discovery-Miss Recall (injected) | 3/3 = **100%** (`REMOVE_BASKET`, `SUPPRESS_MULTIPLE_RULES_FLAG`, plus structural-gap rediscovery) |
| Context-Miss Recall (injected) | 7/7 = **100%** (proviso/shared-cap/parent/top-level-def/nested-def/calc-provision/cross-reference) |
| Amendment-Lead Omission Recall | 1/1 = **100%** |
| Unresolved-Dependency Omission Recall | 1/1 = **100%** |
| **Combined fault-injection gate** | **12/12 = 100%** |

## 38–39. Material finding precision, false-alarm rate (real FWRG/LSB run)

No independently-authored, adversarially-scored ground truth exists for
the real-package finding *volume* (that would itself be a second
benchmark-authoring project outside this phase's own time budget) — so
precision is reported the same honest way Phase 2B/2D reported theirs:
**measured directly by spot-checking real findings against real source
text**, not asserted. Three real over-broad signal classes were found and
fixed this way during construction (all disclosed, all generic, none
FWRG/LSB-specific):
1. Bare enumeration-marker citation lists inflating
   `STRUCTURAL_COVERAGE_GAP` (fixed via the minimum-content-per-item rule,
   §5 above) — spot-checking 5 remaining FWRG structural-gap findings
   after the fix found 1 clear residual false positive (a citation list
   with an unusually long parenthetical qualifier) and 4 plausible or
   confirmed genuine multi-item lists (including a real, newly-surfaced
   Cure Right multi-condition clause at `6.10(c)(ii)`) — a real, disclosed
   **~20% false-alarm rate on this specific finding type**, not
   eliminated, not hidden.
2. A bare "Restricted Subsidiary"-style mention firing `ENTITY_SCOPE` on
   nearly every sibling clause in real credit-agreement text (fixed by
   requiring a co-occurring scoping/exclusion phrase — reduced FWRG
   context findings from 51 to 16 in one step).
3. Sibling top-level SECTION nodes (unrelated covenant families)
   incorrectly scanned as if they were clause-level modifiers (fixed by
   excluding SECTION/ARTICLE-type siblings — reduced FWRG context findings
   from 16 to 12, LSB from 6 to 2).

**Uncertain Finding Rate** (task §40, real run, honestly reported, never
suppressed): FWRG discovery 93/108 = **86%**; LSB discovery 6/10 = **60%**;
FWRG context 7/12 = **58%**; LSB context 2/2 = **100%**. This is high by
design — the independent auditor is deliberately over-inclusive (task
§7), and a genuinely ambiguous qualitative restriction with no quantified
threshold is UNCERTAIN, not silently dropped nor fabricated as MATERIAL.

**Silent Known Misses**: **zero** — every known, disclosed real limitation
(LSB `6.14` comma-list, FWRG `6.01(x)`-family mis-scoping) was
independently rediscovered, not missed by the auditor.

## 40–41. FWRG/LSB real regression audit (known packages, not unseen)

No FWRG/LSB-specific detection rule was added anywhere in
`coverage-audit/*` — the exact same modules exercised by the synthetic
corpus ran here unmodified.

| | FWRG | LSB |
|---|---|---|
| Independent regions generated | 310 | 65 |
| Discovery findings (material / uncertain) | 108 (15 / 93) | 10 (4 / 6) |
| — of which `STRUCTURAL_COVERAGE_GAP` | 44 | 6 |
| — of which `PARTIAL_DISCOVERY` | 64 | 4 |
| Context findings, 12-case Phase 2D benchmark (material / uncertain) | 12 (5 / 7) | 2 (0 / 2) |

**Known-gap rediscovery (task §30/§42) — confirmed, not asserted:**
- LSB `6.14(b)/(c)/(d)` comma-list gap: **independently rediscovered** as
  `STRUCTURAL_COVERAGE_GAP` at `lsb::6.14(a)` (the one clause the parser
  DID separate, whose own remaining text still shows the swallowed
  siblings) — surfaced as a structural limitation, never misattributed to
  Phase 2B (task §30's own explicit instruction).
- FWRG `6.01(w)`/`(x)`-family clause-boundary mis-scoping: **independently
  rediscovered** as `STRUCTURAL_COVERAGE_GAP` at `fwrg::6.01(x)` (and
  numerous other real, distinct multi-item clauses across the document —
  see the false-alarm-rate discussion above for which of these are
  additional genuine findings vs. residual noise).

## 44–45. Phase 2D 12-case benchmark challenge (task §31) — the central new finding

Independently re-derived, from source, what material context each of the
12 real Phase 2D benchmark cases needs — never starting from Phase 2D's
own expected-context lists — then compared against the real bundles.

**FWRG: `PHASE_2D_CONTEXT_MISS_FOUND`** — 5 real, MATERIAL, previously
undisclosed findings, all `SILENT_UNRESOLVED_DEPENDENCY` (neither
retrieved nor surfaced as unresolved): material cross-references inside
FWRG `6.07`'s own dispositions sub-clauses (`6.07(c)(j)`, `6.07(c)(ii)(a)`,
`6.07(i)(D)`, `6.07(i)(h)`, `6.07(kk)(A)(kk)`) whose surrounding text
independently carries a calculation/interpretation signal. **Root cause:
`CONTEXT_RETRIEVAL_PHASE_2D`** — Phase 2D's own relevance-gating logic
(`reference-context.ts`) only recurses into a referenced provision when
that provision's OWN text matches the calculation signal; these five
references sit inside deeply-nested descendant clauses of the already-
retrieved `6.07` `CHILD_RULE` items, where Phase 2D's cross-reference pass
does not independently re-scan every retrieved child's own text for
further references the way it does for the primary operative node. This
is a real, additional, previously-undisclosed Phase 2D V1 boundary,
disclosed here for the first time — **not remediated in this phase** (task
§44's own explicit "Do not modify Phase 2B/2D simply to make the final
Phase 2E audit cleaner" / §51's "Do not remediate newly discovered
upstream defects during the frozen final audit run").

**LSB: `PHASE_2D_BENCHMARK_INDEPENDENTLY_CONFIRMED`, with a caveat** —
zero MATERIAL findings, 2 UNCERTAIN (`6.01(d)`/`6.11(c)` sibling condition
language, not fabricated as MATERIAL, not silently dropped either).

**Combined verdict across all 12 cases: `PHASE_2D_CONTEXT_MISS_FOUND`**
(the honest, non-cherry-picked aggregate — a real material miss exists in
the audited set). Phase 2D's own historical report and numbers
(`docs/phase-2d-covenant-context-retrieval.md`) are **not overwritten** —
this is a new, separate, dated finding layered on top of them, exactly as
task §31/§50 require.

## 51–52. Real cross-document evidence

Unchanged from Phase 2D's own disclosed status: no real fixture on hand
contains two-plus fully-titled, genuinely-related documents, so a
`RESOLVED` cross-document context edge remains synthetic-only. This
phase's own amendment/cross-document auditing (`MISSING_AMENDMENT_LEAD`,
`MISSING_CROSS_DOCUMENT_REFERENCE`) is proven against Phase 2C's real
`ModificationCandidate`/`CrossDocumentReferenceLead` types via the fault-
injection suite, but — like Phase 2D's own package-graph evidence — has
not been exercised against a real multi-document FWRG/LSB scenario, since
neither package's committed fixtures contain a second, related document
carrying real title-page text. Carried forward exactly, not touched, per
task §32's own instruction (the reserved Phase 2F package was not used to
close this gap).

## Phase 2B/2C/2D regression (re-verified, unchanged)

| | FWRG | LSB (raw, canonical) |
|---|---|---|
| Section recall | 9/9 = 100.0% | 10/10 = 100.0% |
| Operative-rule recall | 148/149 = 99.3% | 50/53 = 94.3% |
| Basket/exception recall | 138/138 = 100.0% | 40/43 = 93.0% |
| Dangerous discovery misses | 0 | 0 |

No discovery-layer file was modified this phase;
`discovery-pipeline.test.ts` (19/19) re-run unchanged confirms these
numbers stand exactly as reported. Phase 2C: `package-graph-pipeline`/
`-persistence`/`-real-evidence` = 22+8+4 = **34/34**, unchanged (no
package-graph file modified). Phase 2D: `context-retrieval-pipeline.test.ts`
**36/36**, and `phase-2d-evaluate-context-retrieval.ts` re-run produces
byte-identical numbers to the committed report (FWRG raw 36.8%/addressable
100%/precision 100%/unresolved-dependency 100%; LSB raw 80%/addressable
100%/precision 100%) — no context-retrieval pipeline file was modified,
only `structural-index.ts`/`structural-references.ts`/
`package-graph/relationship-resolution.ts` (Phase 2D's own prior-phase
edits, untouched here).

## Tests added

- `tests/contract-model/coverage-audit-independence.test.ts` — 7 tests.
- `tests/contract-model/coverage-audit-pipeline.test.ts` — 37 tests (the 38-item synthetic corpus).
- `tests/contract-model/coverage-audit-fault-injection.test.ts` — 15 tests (12 scenarios + baseline + gate + manifest integrity).
- `tests/contract-model/coverage-audit-map-and-isolation.test.ts` — 5 tests (coverage map, isolation, idempotency).
- **64 new tests total**, all passing.

## Full-suite / typecheck / lint / build results

- Targeted: 64/64 new tests; Phase 2A `structural-index.test.ts` (17/17),
  Phase 2B `discovery-pipeline.test.ts` (19/19), Phase 2C (34/34), Phase
  2D `context-retrieval-pipeline.test.ts` (36/36), `tenant-isolation.test.ts`
  (5/5) all re-run and unaffected.
- Full suite: **803/803 tests pass** (93 test files) — 739 pre-existing
  (Phase 2D's own final count) + 64 new.
- `npx tsc --noEmit`: clean.
- `npx eslint .`: clean.
- `npm run build` (production Next.js build): succeeds, all routes compile.

## Protected-data / tenant-isolation result

- No schema/migration change (none was made).
- No coverage-audit function or test in this phase was ever invoked
  against the real Coherent/Matthews company rows — every call uses
  synthetic fixtures or the already-committed FWRG/LSB unseen-package
  files.
- Both golden harnesses are **byte-identical** to their pre-existing,
  already-diagnosed baselines: Coherent 26 passed/3 failed/1 flagged/0
  errored; Matthews 2 passed/4 failed/10 flagged/2 errored. No
  customer-facing calculation changed.

## Model/provider, calls, tokens, cost

**None used.** Zero real or synthetic LLM calls across the entire phase —
36 synthetic tests, 12 fault-injection scenarios, and the full FWRG/LSB
real audit. `semanticPromptVersion`/`providerIdentity` are `null`
throughout. **Total cost: $0.00.** No failed or retried model attempts
(none were made).

## Performance (real, measured)

```json
fwrg { documentsAudited: 1, structuralRegionsAudited: 310, deterministicWallClockMs: 17, comparisonWallClockMs: 15, totalFindings: 120, materialFindings: 20, uncertainFindings: 100, semanticCalls: 0 }
lsb  { documentsAudited: 1, structuralRegionsAudited: 65,  deterministicWallClockMs: 4,  comparisonWallClockMs: 2,  totalFindings: 12,  materialFindings: 4,  uncertainFindings: 8,  semanticCalls: 0 }
```

**Scaling estimate** (labeled as an estimate, not measured production
performance — task §34): both packages scan linearly (one pass per node,
one pass per definition, bounded per-covenant context comparison) with no
quadratic step observed between a 65-node and a 310-node document (4ms →
17ms, roughly proportional to node count). Extrapolating linearly from
these two real data points:

| Documents | Estimated regions | Estimated deterministic wall-clock |
|---|---|---|
| 10 (≈FWRG-sized each) | ~3,100 | ~170ms |
| 50 | ~15,500 | ~850ms |
| 100 | ~31,000 | ~1.7s |

Context-comparison cost scales with the number of covenants actually
audited (bounded, caller-chosen), not with document count, so it is not
included in this document-count extrapolation.

## Known limitations

- No semantic audit layer was built — not needed for this phase's
  required scope, but a real package with drafting styles this
  deterministic signal table does not recognize would degrade to
  UNCERTAIN/NOT_DISCOVERED rather than a confident answer.
- Relative references ("the preceding paragraph") are not independently
  modeled (§24, test 27) — only absolute SECTION/ARTICLE/SCHEDULE/EXHIBIT
  mentions.
- `STRUCTURAL_COVERAGE_GAP` retains a real, measured, disclosed
  false-positive rate on citation-list-adjacent text (~20% in a small
  spot-check) even after the generic minimum-content fix.
- No independently-authored, adversarially-scored real-package ground
  truth exists for finding-volume precision (a second benchmark-authoring
  project, out of this phase's scope) — precision is reported from direct
  spot-checking, not a scored benchmark.
- Incrementality (task §37) is asserted from the content-hash identity
  design, not separately proven with a dedicated multi-document
  incremental-rerun test in this phase.
- The real cross-document/amendment auditing path remains synthetic-only
  (§32/§51/§52) - same disclosed gap Phase 2C/2D carried forward.
- The five newly-found FWRG `SILENT_UNRESOLVED_DEPENDENCY` findings (§44)
  are a real Phase 2D V1 boundary, not remediated here per the freeze
  discipline (§28/§44) - a natural Phase 2D.1/2F-prerequisite fix.

## Fault-injection gate calculation and verdict (task §41)

100% of injected material discovery omissions caught (3/3); 100% of
injected material context omissions caught (7/7); 100% of injected
amendment-lead omissions caught (1/1); 100% of injected unresolved
material-dependency omissions caught (1/1). **Zero missed intentionally
injected material defects.**

## Real regression gate calculation (task §42)

Zero known dangerous discovery misses silently ignored; zero known
material context misses silently ignored (the 5 new FWRG findings were
surfaced, not suppressed); both known structural gaps (LSB `6.14`, FWRG
`6.01(x)`-family) independently rediscovered and correctly attributed to
`STRUCTURAL_SUBSTRATE`, never charged to Phase 2B; no FWRG/LSB-specific
detection rule was added; no cross-instrument contamination (test 31).
The five new FWRG findings are, per the task's own §43 "Gate Philosophy",
a **PRIMARY PIPELINE FINDING** (the auditor correctly identified a real
Phase 2D gap), not an **AUDITOR FAILURE** (nothing known/injected was
missed) — reported plainly rather than suppressed to preserve Phase 2D's
own "zero material context misses" headline number.

## Final verdict

**`PHASE_2E_INDEPENDENT_COVERAGE_AUDITOR_REGRESSION_GATE_PASSED`**

All injected material omissions were caught (100% across all four
required categories); known regression gaps were surfaced, not
normalized away; no known material omission was silently ignored;
isolation holds (tenant and cross-instrument); idempotency holds
(byte-identical identities across repeated runs). This does not prove
generalization to an unseen third package. It means the primary pipeline
(Phase 2A–2D) plus this independent auditor are, together, ready to be
frozen for Phase 2F unseen-package validation — with one disclosed,
real, newly-found Phase 2D V1 boundary (the five FWRG cross-reference
findings) that a future phase should either fix or explicitly accept
before that validation begins.

## Recommended next task (exact)

Per the stop condition, no further work proceeds automatically. If asked
to continue, the recommended next task is: **fix the newly-disclosed
Phase 2D boundary** (§44 above — extend `retrieveCrossReferencesFromNode`-
style following to re-scan every retrieved `CHILD_RULE`/sibling item's own
text for further references, the same generalization this phase's own
`retrieveCrossDocumentDependenciesForStructuralContext` precedent in
Phase 2D already established for undeclared-term detection), re-run this
phase's own real FWRG/LSB audit to confirm the fix closes exactly those
five findings with no regression elsewhere, and only then proceed to
**Phase 2F — genuinely unseen third-package validation** of the frozen
Phase 2A–2E stack. Neither should begin automatically from this report.

## Stop condition compliance

The independent coverage auditor was implemented and validated against
adversarial synthetic tests (37/37), fault injection (12/12, 100% gate),
and the known FWRG/LSB regression packages. No newly discovered upstream
defect (the five FWRG findings) was remediated during this frozen final
audit run. The reserved Phase 2F package was not acquired, inspected,
ingested, benchmarked, or tuned against. No formula/expression ontology
was implemented. No amendment was applied into operative text. No
covenant capacity was calculated. No customer-facing functionality was
built. This report stops here.
