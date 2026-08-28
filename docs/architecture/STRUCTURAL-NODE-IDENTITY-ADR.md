# ADR: Structural Node Identity & Index Integrity

Status: **PROPOSED** (this ADR is a design artifact only; no production code has been changed as part of it)
Related: Architecture Invariant #18 (shared-substrate independence weakness); Phase 3F.1.1 residual safety forensics (`docs/phase-3f1-1-residual-safety-forensics.md`)
Follow-up phase this ADR authorizes scoping for: **PHASE 3F.1.2 — STRUCTURAL IDENTITY & INDEX INTEGRITY REMEDIATION** (not implemented here)

---

## 1. Context

Phase 3F.1.1 forensically traced ~79% of the 89 residual dangerous-omission cases on the DSGR known-regression package to a single upstream cause: the Phase 2A structural parser/index (`lib/contract-model/compiler/stage-structure.ts` + `lib/contract-model/compiler/structural-index.ts`) does not give every physical source occurrence a unique identity. It identifies structural nodes by a **human drafting label** (`documentId + normalized sectionRef`), and human drafting labels are not unique: the same section number can legitimately (or spuriously, via extraction/regex false-positive) appear at more than one physical location in a document.

This is not a narrow, one-off bug. It is a structural design choice — `nodeKey` is constructed once, in one place (`stage-structure.ts`), and then treated everywhere downstream as if it were a true occurrence identity, when it is actually a label. This ADR proposes the replacement architecture.

## 2. Problem — reconstructed from production code, not assumed

### 2.1 Where `nodeKey` originates

`lib/contract-model/compiler/stage-structure.ts:244`:

```ts
nodeKey: `${doc.documentId}::${r.sectionRef.replace(/\s+/g, "")}`,
```

`sectionRef` is the fully-qualified drafting citation (e.g. `"6.04"`, `"6.04(a)"`) computed from whatever regex family (`ARTICLE_PATTERNS`, `SECTION_PATTERNS`, `INTEGER_SECTION_PATTERNS`, `BARE_INTEGER_SECTION_PATTERN`, and `clause-hierarchy.ts`'s nested-marker parser) happened to match at that point in the text. **Nothing about this construction is unique per physical occurrence** — it is unique only per *label string*, and the same label string can be produced by more than one physical match:

- an in-text cross-reference sentence that happens to satisfy the (non-line-anchored) heading regex (`Section\s+(\d+\.\d+)\.?\s+(Title)\s*\.`) — proven below;
- a Table of Contents entry;
- malformed/duplicate section numbering in the source;
- amendment text that quotes or restates an existing section's number and title.

`StructuralNode.nodeKey`'s own doc-comment (`lib/contract-model/compiler/types.ts:48`) calls this "the stable identity the task asks for, independent of DB persistence and never derived from fuzzy string matching" — which is true of the *matching* (it's exact-string, not fuzzy) but false of the *uniqueness claim*: nothing enforces that only one physical node can produce a given label.

Note also: `StructuralNode.ordinal` (types.ts:55, "sibling order under the same parent") is already computed per-occurrence during parsing (`ordinalByParent` in `stage-structure.ts:219-225`) but is **not** used as part of `nodeKey` — the disambiguating information already exists on the node and is discarded before identity is formed.

### 2.2 The collision mechanism, in `buildStructuralIndex` (`structural-index.ts:72-89`)

```ts
for (const [documentId, { nodes }] of nodesByDocument) {
  const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
  for (const n of sorted) {
    byKey.set(n.nodeKey, n);                              // (1) last-charStart occurrence silently wins
    allNodesSorted.push(n);
    const parentKey = n.parentSectionRef ? `${documentId}::${normalizeRef(n.parentSectionRef)}` : null;
    if (parentKey) {
      const list = childrenByParentKey.get(parentKey) ?? [];
      list.push(n);                                       // (2) every occurrence's children pushed onto ONE shared list
      childrenByParentKey.set(parentKey, list);
    }
  }
}
```

Two separate, independently-observable defects fall out of this:

1. **Occurrence unreachability.** `byKey` is a `Map<nodeKey, StructuralNode>`. When two physical nodes share a `nodeKey`, `byKey.set` silently discards the earlier one. `getNode`/`getNodeByRef` can never again return it — even though it still physically exists in `allNodes()`. There is no error, no diagnostic, no `console.warn` — ordinary JavaScript `Map.set` overwrite semantics, invoked on a key that was never actually guaranteed unique.
2. **Cross-occurrence child merge.** `childrenByParentKey` is keyed by the same colliding label. It does not check *which physical parent occurrence* a child structurally descends from — only that the child's `parentSectionRef` string matches. If two different physical occurrences of `"6.04"` each have real lettered children, `getChildren("doc::6.04")` returns the union of both, indistinguishably, with no way for a caller to know some of those children belong to the (now-unreachable) other occurrence.

### 2.3 Minimal, generalized reproduction (not DSGR-specific)

`scripts/architecture-proposal-node-identity-repro.ts` (read-only; imports and calls the real, unmodified `parseDocumentStructure` and `buildStructuralIndex`) proves this against a synthetic document with no relation to any real package. Output (preserved at `tests/fixtures/architecture-audits/structural-identity-collision-repro.json`):

- **Case A** — a synthetic Section 6.01 contains an ordinary cross-reference sentence ("...as permitted under Section 6.04 Limitation on Distributions...") that satisfies the SECTION heading regex just as well as Section 6.04's real, later header does. Result: 2 physical nodes with `nodeKey = "synthetic-doc-a::6.04"`. `index.allNodes()` correctly returns both (9 nodes total), but `getNodeByRef(doc, "6.04")` can only ever resolve to the later one (`charStart=252`); the cross-reference-sentence occurrence (`charStart=117`) is permanently unreachable through any identity-based lookup.
- **Case B** — forcing both colliding occurrences to carry their own lettered children makes the merge itself directly observable: `getChildren("synthetic-doc-b::6.06")` returns 3 children — `6.06(a)@139, 6.06(b)@225, 6.06(a)@330` — mixing children from two distinct physical `"6.06"` occurrences under one collided parent key, and producing a **second-level** `"6.06(a)"` collision in the same run (proving the defect recurses at every nesting depth, not only at the top SECTION level).

### 2.4 The same defect is independently re-implemented in the persistence layer

`lib/contract-model/compiler/persistence.ts:29-31` defines `nodeLookupKey(documentId, sectionRef)`, with a doc-comment stating (verbatim) that it is "identical in format to `StructuralNode.nodeKey`... so the map `persistStructuralNodes` returns doubles as the nodeKey->id map... — one real identity scheme, not two." That comment's premise is exactly the bug: it treats the label scheme as *the* identity, by design, in a second, independent module. `persistStructuralNodes` (persistence.ts:45-64) upserts `DocumentNode` rows keyed by `computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef)` — no `charStart`, no occurrence disambiguation. For two physical occurrences sharing a label, the second upsert's `update` branch **silently overwrites the first occurrence's persisted row** (heading/ordinal/charStart/charEnd) with the second's values, and the subsequent parent-linking pass (lines 56-62) sets `parentId` on whichever row happens to still exist — i.e., the same unreachability-and-merge defect, now committed to the database, not just in memory. **A structural-identity fix confined to `structural-index.ts` alone would leave the persistence layer equally broken** — the two modules independently re-derive the same fragile label-based scheme rather than one deriving from the other.

### 2.5 Downstream propagation into DSGR (evidence already gathered, not re-derived here)

Per Phase 3F.1.1: DSGR's `stage1-all-nodes.json` has 4,149 total nodes, 3,469 distinct `nodeKey`s, **546 duplicated `nodeKey`s (680 excess duplicate instances)**. 58 of the 89 residual dangerous-omission cases have `node === null` (a ground-truth section reference matched by *no* structural node at all — a related but distinct parser-coverage gap, see §2.6) or `hasDuplicateNodeKey && ownTextCorrupted` (the exact mechanism proven above). 12 of 13 `R11_MATERIALITY_INHERITANCE_NOT_TRIGGERED` cases have this as a secondary cause (their immediate parent node is itself duplicate-key-corrupted). Combined primary+secondary attribution: 70/89 (78.7%). Quadrant analysis found 15 of the 20 cases where *both* Phase 2B discovery and Phase 3E audit independently missed the same provision are attributable to this same shared substrate — direct, empirical confirmation of Architecture Invariant #18's named risk.

### 2.6 Two distinct mechanisms, both producing "unreachable," must not be conflated

- **Mechanism A — PARSE_COVERAGE_MISS.** No regex family in `stage-structure.ts`/`clause-hierarchy.ts` ever matches the real heading text at all, so *no node is created* for a real provision. This is a pattern-completeness gap in the parser's recognizers, not an identity/uniqueness defect — fixing identity does not create a node that was never parsed. It is a distinct, out-of-scope-for-this-ADR problem (see §12, non-goals).
- **Mechanism B — OCCURRENCE_IDENTITY_COLLISION.** A node *is* parsed (possibly more than once, for the same logical provision or for two entirely unrelated things that share a label) but the identity scheme cannot tell physically distinct occurrences apart. This is squarely this ADR's subject.

Both currently present as "the ground-truth provision has no reachable, correctly-scoped node" and were combined under `R17_STRUCTURAL_PARSER_EFFECT` in the Phase 3F.1.1 taxonomy; this ADR treats them as related but separately-remediated (§12).

## 3. Identity responsibilities currently overloaded into `nodeKey`

A single string field is currently asked to serve as all of the following simultaneously:

| Responsibility | Evidence it's overloaded here |
|---|---|
| Map key for `byKey`/`childrenByParentKey`/persistence upsert | `structural-index.ts:74,80`; `persistence.ts:48` |
| Human-readable structural label (what a reviewer would cite) | Derived directly from `sectionRef`, no separate label field |
| The thing routing/reconciliation/reference-resolution treat as "the provision" | `router.ts`, `unit-hypothesis.ts`, `cross-reference-audit.ts` all key exclusively off `nodeKey` |
| A stable identity across reruns | Assumed, not verified; label collisions make it non-unique, so "stable" is true only in the degenerate sense that the same *wrong* winner is picked deterministically |
| A partial input to IR rule identity | `lib/contract-model/ir/identity.ts`'s `computeRuleId(companyId, instrumentKey, sourceSectionRef, discriminator)` folds the same label (there called `sourceSectionRef`) into a downstream content hash |

No single one of these responsibilities is wrong to need — the problem is that one string is being asked to satisfy all of them at once, and the uniqueness property only the map-key and stable-identity roles actually require was never established.

## 4. Required identity separation

| Concept | Definition | Uniqueness scope | Stability scope |
|---|---|---|---|
| **`nodeId`** (new) | Unique source-occurrence identity, minted once at parse time | Unique per document, forever, by construction | Stable across identical (source bytes + parser version); NOT guaranteed across parser/extraction version changes (§8) |
| **`label`** (renamed from what `sectionRef` currently overloads for identity purposes; `sectionRef` itself is kept, just no longer treated as a key) | Human-readable structural citation, e.g. `"6.04(a)"` | Not unique — duplicates are normal (§7 below) | N/A — display only |
| **`structuralPath`** (new, non-identity) | Ancestry-aware position, built from parent `nodeId`s | Not authoritative for identity; debug/display aid only | Derived, not stored independently |
| **`sourceSpan`** (formalized) | `{documentId, charStart, charEnd}` — exact location | One span per `nodeId` | Stable within one parse; is itself part of `nodeId`'s construction (see §5) |
| **`semanticReference`** (conceptually `sectionRef` as used today, kept) | Normalized legal citation, used for lookup/query, never for identity | Many-to-many with `nodeId` | N/A |
| **`documentId`** (existing, unchanged) | Instrument boundary | Global | Stable for the life of the document row |
| **Amendment/version lineage** (out of scope here, see §11) | Connects a `nodeId` across document versions | Separate mechanism (Phase 2G's own amendment-effect/lineage machinery) | Explicitly NOT the same concept as `nodeId` |

## 5. Source-occurrence identity — candidate designs evaluated

### Option A — Span-primary (`documentId + nodeType + charStart`)

```ts
nodeId = computeStableKey("structural-node", documentId, nodeType, String(charStart))
```

Reuses the exact hashing convention already established repo-wide (`lib/contract-model/stable-keys.ts`'s `computeStableKey` — sha256 hex, safe separator, same pattern `ir/identity.ts` and `persistence.ts` already use) — no new convention invented.

- Determinism: yes — `parseDocumentStructure` is a pure function of `doc.text` (no Map-iteration-order dependency reaches `charStart` computation); same source bytes + same parser version ⇒ same `charStart`s ⇒ same `nodeId`s.
- Uniqueness: two nodes of the *same type* can never legitimately share a `charStart` in one parse pass (`overlapsAny` already prevents accepting two overlapping matches into the same candidate set); cross-type collisions at the same offset are not proven impossible but are exceptionally unlikely and are caught by explicit collision detection (§10), never silently resolved.
- Collision risk: near-zero by construction; residual risk handled by fail-closed detection, not assumed away.
- Stability: Level A only (same bytes + same parser version) — deliberately does **not** promise stability across a parser algorithm change or a re-extraction. That is the correct scope per the task's own framing: cross-version stability is a *lineage* concern (§11), not an occurrence-identity concern.
- Readability: low (opaque hash) — mitigated by keeping `sectionRef`/`heading`/`charStart` as separate, always-present display fields on the same node; nothing about `nodeId` needs to be human-readable.
- Performance: O(1) to compute, no extra text scan, no dependency on text content at all.
- Migration complexity: low — `charStart` is already computed and already present on every `StructuralNode`.
- Extraction-version sensitivity: high (as intended — a re-extraction is a source-representation change, and node identity should NOT survive it silently; see §14).

### Option B — Ancestry path + occurrence ordinal

```ts
nodeId = `${documentId}::${ancestryPathOfParentNodeIds.join("/")}#${occurrenceOrdinalAtThisPath}`
```

- Pros: encodes hierarchy directly in the id; intuitively debuggable.
- Cons: **circular bootstrapping** — a node's id depends on its parent's id, which depends on its own parent, all the way to the root; but "which physical node is the parent" is exactly the question under dispute when labels collide, so this option needs the collision already resolved to compute itself, at every level. Also fragile to reordering: if two candidate matches tie on `charStart` (see §5's residual-risk case) or if a future parser version changes intra-region iteration order, `occurrenceOrdinal` can silently shift for nodes that did not themselves move. Rejected as the *primary* mechanism; retained as a **derived, non-identity `structuralPath` display field** computed from `nodeId`s once they exist (§4's `structuralPath` concept).

### Option C — Content-derived hash + source position

```ts
nodeId = computeStableKey("structural-node", documentId, nodeType, sectionRef, sha256(ownText.slice(0, 120)))
```

- Pros (superficial): "feels" more like it survives whitespace-only re-extraction changes.
- Cons (disqualifying): (1) **Introduces new collisions instead of removing them** — real drafting contains verbatim-repeated boilerplate opening language across genuinely distinct provisions (e.g. two different baskets both opening "(a) Indebtedness incurred..." across different sections); content-hashing the opening text can make two *legitimately distinct* occurrences collide, which is the opposite of this ADR's goal. (2) **Circular dependency on the very defect being fixed** — "own text" for a node is only known once children are correctly (i.e., occurrence-safely) attributed, which is downstream of identity, not independent of it. (3) Costs an extra text scan + hash per node for no benefit Option A doesn't already provide via `charStart`. **Rejected.**

### Option D — Hybrid: span-primary identity + path/ordinal disambiguation metadata (**preferred**)

Identical `nodeId` construction to Option A, plus two **non-identity** derived fields carried alongside every indexed node once the index is built:
- `structuralPath: string[]` — sequence of ancestor `nodeId`s (Option B's useful idea), computed top-down *after* `nodeId`s already exist, purely for display/debugging/health diagnostics — never consulted for equality or lookup.
- `occurrenceOrdinal: number` — Option B's sibling-occurrence counter, likewise derived and display-only, distinct from the existing `ordinal` (sibling order) field.

This is exactly the design the task's own §7D anticipates ("hybrid deterministic identity (e.g. span-primary with path-ordinal disambiguation)"). It gets Option A's determinism/uniqueness/cheapness as the actual identity mechanism, and Option B's human-legibility as strictly-additive metadata that can never itself cause a collision because it plays no role in `Map` keys or lookups.

### Option E — corroborating prior art already in this repository (not itself a candidate mechanism)

`prisma/schema.prisma`'s `DocumentNode` model (line ~2380, a separate, earlier persistence layer used by `lib/contract-model/validators.ts`/`service.ts`/`stage-dependency-resolution.ts`) already solves parent/child ownership correctly: `parentId` is a real foreign key to another row's own server-generated `id` (`@@unique([companyId, stableKey])`, `@@index([parentId])`), never a label match. This confirms the general *direction* (occurrence-safe identity, parent/child by identity not label) is not a novel idea for this codebase — it is already the working pattern one layer over; Phase 2A's `structural-index.ts` (built later, for the in-memory compiler pipeline) diverged from it by re-deriving identity from labels instead of carrying an explicit occurrence id through. This is evidence, not itself a candidate for `nodeId`'s construction (the task explicitly excludes DB autoincrement/cuid dependence, §7's constraint list, for the in-memory index — a DB round-trip has no place in a pure in-memory parse step).

### Selected: Option D

**Why:** it is the only option that is simultaneously (a) collision-proof by construction against the exact drafting patterns that caused the DSGR residuals (repeated labels, ToC entries, cross-reference false positives, amendment-quoted text — none of which move `charStart`'s uniqueness), (b) cheap and non-circular to compute, (c) consistent with the repo's own existing `computeStableKey` convention (no new hashing scheme), and (d) does not sacrifice the debuggability a pure opaque hash would cost, by keeping the humane fields (label, path, ordinal) present as metadata rather than baking them into — and thereby fragilizing — the identity itself.

## 6. Source-span stability (task §8)

`charStart`/`charEnd` are:
- **Stable across (A) identical source bytes + same parser version** — yes, by construction (pure function, no hidden state).
- **Not guaranteed stable across (B) parser algorithm version changes** — a future change to `SECTION_PATTERNS`/`clause-hierarchy.ts` could shift where a match starts (e.g. trimming vs. not trimming leading whitespace). This is correct and desired: a `nodeId` should change when the parser's own understanding of where a node starts changes, and downstream consumers (caches, persisted rows) should be invalidated, not silently kept pointing at stale data (§17 versioning).
- **Not guaranteed stable across (C) source extraction changes** (PDF vs. HTML extraction, redline/strikethrough handling) — same reasoning; an extraction change is a different source representation and should mint different occurrence identities, not silently reuse old ones.
- **Not guaranteed, and not attempted, across (D) amendments/document versions** — a new document version is a different document; cross-version lineage is Phase 2G's own amendment-effect/operative-state machinery, a semantic concept layered ON TOP of source occurrences, never conflated with them (§11).

## 7. Duplicate labels are normal, not exceptional

The architecture must treat these as ordinary, expected drafting/extraction realities, not edge cases requiring special-casing:
- multiple Sections each containing their own `(a)`;
- multiple `(i)` beneath different parents at different nesting depths;
- a cross-reference sentence that happens to satisfy the heading regex (proven in §2.3 Case A);
- a Table of Contents entry duplicating a real heading;
- an amendment quoting or restating an existing section's number and title;
- a schedule restarting numbering from a low integer that collides with an unrelated section number elsewhere;
- malformed/OCR-damaged duplicate section numbers.

Under the preferred design (Option D), **none of these can collide `nodeId`s** — they collide `sectionRef` (label) values, which was never the identity, and multiplicity there is exactly what `findByLabel`/`findByLegalRef` (§10) is designed to return as a set, not a singleton.

## 8. Duplicate full structural paths

Even a *normalized ancestry path* is not provably unique (§5's rejection of Option B as primary): incomplete parent detection, region-concatenation from extraction, amendment-quoted text reproducing an entire sub-tree's labels, or restarted schedule numbering can all produce two physically distinct subtrees with identical normalized paths. Because `structuralPath` under the preferred design is a *derived display field*, not the identity, this is a non-issue for correctness — it can only ever affect how ambiguity is *displayed*, never whether two occurrences are (mis)treated as one.

## 9. Human legal references are not IDs

`sectionRef` (renamed conceptually to `semanticReference` in `§4`'s table, field itself unchanged) remains exactly what it always was: the citation text a reviewer would recognize ("Section 6.01(a)"). Under the preferred design it becomes purely a **lookup/query key**, resolved via `findByLegalRef` (§10) which returns zero, one, or many `StructuralNode`s — never silently disambiguated by collision. A legal reference is allowed to be ambiguous, relative ("clause (ii) above"), malformed, or repeated across instruments; none of that is this layer's job to resolve unilaterally (context-dependent relative-reference resolution stays Phase 2D's job, §16).

## 10. Structural invariants (task §13, I1-I16, extended)

| # | Invariant |
|---|---|
| I1 | No two source occurrences share `nodeId` within one document — enforced by construction (Option D) + explicit collision detection (never silent overwrite). |
| I2 | Duplicate `sectionRef`/label values are allowed and expected (§7). |
| I3 | Duplicate legal-reference candidates are allowed but represented explicitly as a set, never collapsed to one. |
| I4 | Parent-child ownership (`parentId`, not `parentSectionRef`-as-label) uses occurrence identity — never label. |
| I5 | No silent map overwrite — any construction-time collision on the identity map itself is a hard-fail / health-diagnostic event, never a quiet last-write-wins. |
| I6 | No child-list merging across distinct occurrences — `getChildren(parentNodeId)` returns only children whose own `parentNodeId` (not `parentSectionRef` string) equals the queried id. |
| I7 | Every indexed node is retrievable by `nodeId` — `getNode(nodeId)` never returns `undefined` for a `nodeId` that appears in `allNodes()`. |
| I8 | Every indexed source span belongs to the correct occurrence — `getNodeText(nodeId, "OWN")`'s boundary computation only ever consults *that node's own* children (via I6), never a merged list. |
| I9 | Traversal reaches every indexed node exactly once from its intended structural root, except explicitly orphaned/ambiguous nodes (I10). |
| I10 | Orphaned nodes (no resolvable parent occurrence) are explicit — surfaced in `orphans()`, not silently rooted or silently dropped. |
| I11 | Cycles are impossible by construction (parent identity is assigned strictly top-down from already-existing ancestor ids) or explicitly detected and reported if a future parser change could introduce one. |
| I12 | Source spans satisfy deterministic validity checks: `charStart < charEnd`, `charEnd <= documentText.length`, own-span nested correctly inside parent's full span. |
| I13 | Sibling ordering is source order (`charStart` ascending) — unchanged from today. |
| I14 | Document boundary is part of the identity domain — `nodeId` is never valid or comparable across two different `documentId`s (§11). |
| I15 | Ambiguous legal-reference lookups return multiple candidates rather than silently choosing one by collision (§9/§10). |
| I16 | Structural-health diagnostics surface every invariant violation as a named, queryable condition (§15), never as a silent `undefined`/empty result indistinguishable from "this legitimately doesn't exist." |

## 11. Document boundary & amendment/version lineage — explicitly separated concepts

`nodeId` is document-scoped by construction (`documentId` is always the first hashed part) — cross-instrument collision is impossible by construction, not merely by convention (I14), closing the one part of today's scheme (`documentId::sectionRef`) that already worked correctly and must not regress.

Amendment/quoted-text cases (a later amendment quoting "Section 6.01 is hereby amended...") produce a **new, distinct `nodeId`** for the quoted occurrence — it is a different physical span in a different (or the same, later-in-time) document text. This is correct: source-occurrence identity answers "what physical text is this," not "which logical, amendment-tracked provision does this ultimately represent." The latter is **Phase 2G's own amendment-effect/operative-state lineage** — a semantic layer that should *reference* source-occurrence `nodeId`s as evidence (exactly as it already does via `sourceNodeKey`-shaped fields) but must never be asked to double as the occurrence-identity mechanism itself, and vice versa. No change to Phase 2G's own amendment-resolution logic is proposed or required by this ADR.

## 12. Non-goal: parser pattern-coverage (Mechanism A, §2.6)

This ADR's `nodeId` design does not, and cannot, retroactively create a node for a heading that no regex family in `stage-structure.ts`/`clause-hierarchy.ts` ever matched — that is a separate pattern-completeness gap. It is named here (and tracked as a candidate future workstream, §21) so that a future implementer does not mistake "the identity architecture is fixed" for "every one of the 58 `node === null` forensic cases will now resolve" — some of them will (the ones that were actually parsed twice under a colliding label, where the *correct* occurrence was simply unreachable), and some genuinely require widening what the parser recognizes as a heading in the first place, which is out of this proposal's scope.

## 13. Index data structure — proposed API (conceptual, not implemented)

Replacing `byKey`/`getNode`/`getNodeByRef` singleton semantics with an explicit cardinality contract:

```
nodesById: Map<nodeId, StructuralNode>                 — 1:1, the only true identity lookup
childrenByParentId: Map<nodeId, StructuralNode[]>       — parent nodeId -> ordered children, occurrence-safe (I4/I6)
parentByChildId: Map<nodeId, nodeId>                    — inverse of the above
nodesByLegalRef: Map<documentId+normalizedRef, StructuralNode[]>  — MANY, never auto-collapsed (I3/I15)
nodesByDisplayLabel: Map<label, StructuralNode[]>       — MANY (I2)
nodesBySourceSpan: interval-indexed structure           — supports "what node(s) cover offset X" (§15 reachability)
roots(): StructuralNode[]
orphans(): StructuralNode[]                             — I10
ambiguities(): AmbiguityReport[]                         — every place a lookup would otherwise have silently disambiguated
healthDiagnostics(): StructuralHealthFinding[]           — I16
```

## 14. No silent singleton lookups (task §20)

Every replacement API is one of exactly three shapes, and no other:
- `getByOccurrenceId(nodeId) → StructuralNode | HARD_FAILURE` (never `undefined` for a live id; a truly-missing id is a caller bug, not a data ambiguity, and should throw or return a typed `NotFound`, distinguished from "zero legitimate matches").
- `findByLabel(...) / findByLegalRef(...) / resolveCitation(...) → StructuralNode[]` with an explicit `AmbiguityReport` when the result has more than one element — callers must handle 0/1/many, never assume 1.
- `getChildren(parentNodeId) → StructuralNode[]` — ordered, owned exclusively by that one parent occurrence (I6).

`index.getChildren(nodeKey)`'s current signature (taking a raw string key with no distinction between "a real node's key" and "an arbitrary label string") is exactly the shape this section prohibits and must not survive into the new API.

## 15. Text boundary integrity — own-text vs. subtree-text

`getNodeText(nodeId, "OWN")`'s boundary computation (`structural-index.ts:189-198`) already correctly distinguishes "own text" (up to the first child's `charStart`) from "subtree text" (`charStart..charEnd`) *in principle* — the defect is not in that distinction, it is that `getChildren` (I6's replacement) can currently return children that do not belong to this occurrence at all (§2.2's merge). Once child ownership is occurrence-safe, this exact same boundary computation becomes correct with no further change needed — this is a case where fixing identity fixes a second-order symptom for free, not a place requiring its own separate remediation.

## 16. Reference resolution (Phase 2D) — preserved, not redesigned

Phase 2D's context-retrieval layer already resolves *relative* references ("clause (ii) above") using ancestor/sibling context, not global label lookup — that logic is unaffected in kind by this ADR; it must simply be re-pointed to consume `nodeId`-keyed `getParent`/`getSiblings`/`getAncestors` instead of label-keyed ones. Absolute citation resolution (`getNodeByRef`) becomes `resolveCitation` returning a set (§10); Phase 2D callers that currently assume a singleton result must be updated to handle the (rare, but now explicit) multi-match case — an adaptation, not a redesign of Phase 2D's own reference semantics.

## 17. Structural health integration (task §22)

New diagnostics, added to the existing structural-health concept:

```
DUPLICATE_OCCURRENCE_ID        — I1 violation (should be impossible by construction; a hard-fail signal if seen)
IMPOSSIBLE_PARENT               — parentSectionRef/parentNodeId points to a document-scope violation or a node that doesn't exist
MULTIPLE_STRUCTURAL_PARENTS     — a node claimed by more than one parent's child list (should be impossible under I4/I6)
ORPHANED_NODE                   — I10
CYCLE                           — I11
INVALID_SOURCE_SPAN             — I12
OVERLAPPING_INCOMPATIBLE_SPAN   — two nodes' spans overlap without a clean ancestor/descendant relationship
AMBIGUOUS_LEGAL_REFERENCE       — I15 (informational, not an error — expected to fire routinely)
DUPLICATE_LABEL_EXPECTED        — informational only; explicitly NOT unhealthy (I2) — logged so the reachability invariant (§18) can be measured, not as a defect signal
DUPLICATE_NORMALIZED_PATH       — informational (§8)
SOURCE_ORDER_VIOLATION          — I13
```

**Explicit requirement:** `DUPLICATE_LABEL_EXPECTED` must never itself gate anything or be treated as a health failure — only the identity-level invariants (I1, I5, I6, I7) are hard failures. This distinction is the single most important design discipline this ADR asks a future implementer to hold: today's system conflates "label duplicated" with "identity broken"; the new one must not.

## 18. Shared-substrate safety (Architecture Invariant #18) and source reachability

The proposal does **not** recommend a second, independent structural parser (§19). Instead, it proposes a **mechanical source-reachability invariant**, measurable without any semantic understanding:

> Every byte of a document's raw text is either (a) inside some node's own span, or (b) explicitly accounted for as inter-node text (whitespace, un-headed preamble/recitals) — with no unexplained gap between the end of one node's full span and the start of the next sibling/next-ranked node at the same or shallower rank.

This is purely mechanical (span arithmetic over `allNodes()`, no LLM, no semantic judgment) and can be computed today, on the corrected index, as a **coverage/gap report**: total document length, bytes covered by some node's own span, bytes in unexplained gaps, count of nodes with `INVALID_SOURCE_SPAN`/`OVERLAPPING_INCOMPATIBLE_SPAN`. A large unexplained gap is a strong, cheap, structural-layer-only signal that something is unreachable — independent of whether it turns out to matter semantically (Phase 3E's own job). This gives Phase 2B discovery and Phase 3E audit a shared, structural-layer-only early-warning signal that does not require them to actually diverge into two different parsers to gain some real independence from a corrupted substrate: if the reachability gate fails for a document, both consumers can be told "structural integrity degraded here" and fall back to raw-source scanning (§19) rather than silently trusting a corrupted index the same way both did in the DSGR forensic cases.

## 19. Second independent parser? — No (with reasoning)

Explicitly evaluated and **rejected**. A second parser would (a) cost real engineering effort to build and maintain, (b) introduce its own, different bugs, and (c) create a disagreement-resolution problem with no principled tie-breaker ("parser A says node X exists, parser B disagrees — which is authoritative?") that is *harder*, not easier, than the current problem. The reachability invariant (§18) plus **raw-source fallback that does not itself depend on the structural index's identity map** (§20) gives the independence Architecture Invariant #18 actually needs — real span/text-level evidence that a structural read is trustworthy — without doubling the parsing surface area or its bug count. **Recommendation: a robust primary parser + independent mechanical source-coverage checks, not a second parser.**

## 20. Raw-source fallback independence audit

Phase 2F.1's raw-source fallback concept must be audited (future implementation work, not performed here since it requires reading `lib/contract-model/compiler/structural-coverage.ts`'s Phase 2F.1 fallback logic in full) to confirm it does not itself resolve gaps via the same `byKey`/label-collision-prone lookups. If it does, it inherits the same blindness the reachability invariant (§18) is meant to catch. This is flagged as an open verification item for the implementation phase (§21), not resolved here.

## 21. Provenance

Provenance objects should be able to express, distinctly and without conflation: `documentId` + `nodeId` (the actual physical source occurrence) + `sourceSpan` (`charStart`/`charEnd`, or the excerpt itself) + `sectionRef` (the human legal citation, which may be ambiguous or duplicated). Today's provenance (`DetectedReference.sourceNodeKey`/`targetNodeKey`, IR's `sourceSectionRef`) already carries most of these pieces separately but has the citation-vs-occurrence conflation baked in via `nodeKey`. Migrating provenance to carry `nodeId` (once it exists) alongside the unchanged `sectionRef` closes this: a reviewer can trace a rule to the exact physical text (`nodeId` → span → excerpt), not merely to a citation that might be ambiguous.

`lib/contract-model/ir/identity.ts`'s `computeRuleId(companyId, instrumentKey, sourceSectionRef, discriminator)` folds the same ambiguous label into IR rule identity. This is a **lower-severity, downstream ergonomics concern**, not a blocking dependency: because `discriminator` already adds independent entropy per rule, outright `ruleId` collisions from this alone are unlikely, but nothing today *proves* they can't happen. A future, optional improvement (not required to close this ADR) would let `computeRuleId` accept `nodeId` in place of (or in addition to) `sourceSectionRef` once it exists.

## 22. Downstream consumer impact — summary

(Full file-by-file inventory: `tests/fixtures/architecture-audits/structural-identity-consumer-inventory.json`, built from a systematic repo audit covering `lib/` and `app/`.)

Every module that imports `StructuralIndex` or reads `StructuralNode.nodeKey`/`.parentSectionRef` inherits today's collision risk, because none of them perform their own independent occurrence disambiguation — they all trust the index's identity semantics completely. The audit found **~55 distinct unguarded singleton-lookup call sites** (a `.get()`/`getNode`/`getNodeByRef`/`getParent`/`getChildren`/`.find()` style lookup keyed by `nodeKey` or a normalized `sectionRef` label, with no signal when more than one physical node could match) and **at least 6 independent, hand-written re-implementations of the exact same `${documentId}::${normalizedSectionRef}` key-construction template**, scattered across `stage-structure.ts:244` (canonical origin), `persistence.ts:29-31` (`nodeLookupKey`), `discovery/pass-c-neighborhood.ts:18-22` (`resolveRelativeRef`), and four inline re-derivations inside `structural-index.ts` itself (`getNodeByRef`/`getParent`/`getAncestors`/`getSiblings`) plus two more inside `structural-references.ts:172-176,190-193`. This duplication is itself an architecture risk independent of the collision bug: a future fix to the canonical construction in `stage-structure.ts` would silently fail to propagate to any of these re-implementations unless they are also updated or (better) eliminated in favor of one shared constructor function.

This spans every Headroom phase that touches structure:

- **Phase 2A structural** (origin: `stage-structure.ts`, `structural-index.ts`) — plus a *second*, upstream instance of the identical last-write-wins `Map` pattern in `structural-references.ts:220-221` (`byKey`/`bySectionRef`, built independently of `structural-index.ts`, before it even runs), and `structural-definitions.ts:148` (captures `sourceNodeKey` from a genuinely-correct, position-based `findEnclosingNode` lookup — itself collision-safe — but the captured key becomes ambiguous the moment anything looks it back up via `.get()`). Counter-example worth preserving as the template for a collision-safe consumer: `structural-coverage.ts` never uses `nodeKey` as identity at all — it operates purely on `charStart`/`charEnd` arithmetic over the raw node array, and is therefore already immune.
- **Phase 2B discovery** (`discovery/pass-a-signals.ts`, `pass-c-neighborhood.ts`, `pass-d-reconcile.ts`, `pipeline.ts`) — **highest-consequence non-LLM-facing finding**: `pass-d-reconcile.ts:27-28` builds `mergeKey = `${primaryNodeKey}::${item.role}`` and deliberately merges any two independently-discovered candidates that share it, per the module's own documented invariant ("two candidates are merged only when they resolve to the EXACT same primary structural node AND the same role"). If two **physically distinct** sections collide onto the same label-derived key, Pass D silently folds two genuinely separate covenant provisions into one `DiscoveredCandidate` — a direct violation of its own stated provenance-preservation invariant, and a plausible independent contributor to Phase 2B under-discovery on top of the router/materiality mechanisms already forensically confirmed.
- **Phase 2D context retrieval** (`structural-context.ts`, `reference-context.ts`, `region-expansion.ts`, `context-retrieval/pipeline.ts`) — the densest consumer cluster; `pipeline.ts:127` and `coverage-audit/pipeline.ts:78` both independently treat `candidate.structuralNodeKeys[0]` / `bundle.originatingStructuralNodeKeys[0]` as *the* primary anchor with no merge-detection if two array entries turn out to be the same colliding key.
- **Phase 2E coverage auditor** (`coverage-audit/*.ts`) — `source-inventory.ts:89` and `definition-audit.ts:50` both fold `node.nodeKey`/`item.structuralNodeKey` into new derived finding/region identities, propagating any collision into the audit's own identity scheme. `discovery-comparison.ts` is a **positive counter-example**: its candidate-matching uses array-membership (`.includes()`/`Set` membership) rather than `Map.get()`, which is naturally collision-tolerant (multiple entries CAN share a key without one clobbering another) — worth citing in the implementation phase as the safer pattern already present in the codebase.
- **Phase 3E semantic-coverage router/materiality/reconciliation** (`semantic-coverage/router.ts`, `unit-hypothesis.ts`, `cross-reference-audit.ts` — the exact layer the Phase 3F.1.1 forensics identified as most affected) — confirms the forensic mechanism at the code level: `unit-hypothesis.ts:328-382`'s contextual-materiality-floor elevation (the Phase 3F.1 §19-21 mechanism that produces `R11_MATERIALITY_INHERITANCE_NOT_TRIGGERED` when it fails to fire) computes `const parentNode = index.getParent(nodeKey)` (line 380) and then looks up `bestUnitByNodeKey.get(parentNode.nodeKey)` (line 382) — if the parent's own `nodeKey` is duplicate-collided, `getParent` can silently resolve to the wrong physical ancestor, or resolve to an ancestor whose "best unit" was computed from a *different* physical occurrence, and the elevation never fires. This is the exact mechanism Phase 3F.1.1's independent second-pass review (92.3% agreement) confirmed by a different method (direct parent-corruption check) — this consumer-inventory audit now confirms it again, independently, by reading the code path itself. `router.ts` (39 nodeKey-touching lines) builds its entire hierarchical-closure logic — seed admission, sibling/chapeau/proviso expansion (`SIBLING_IN_ROUTED_EXCEPTION_LIST`, `CHAPEAU_OF_ROUTED_ENUMERATION`, `TRAILING_PROVISO_OF_ROUTED_REGION`) — on `index.getParent`/`getChildren`/`getNodeText`, with zero independent disambiguation; this is the `R1_ROUTER_SEED_MISS`/closure-boundary population's direct code-level explanation.
- **Phase 2G amendment/operative-state** (`amendment/*.ts`) — `operative-state.ts:53,57` accumulate `currentSourceNodeKey`/`supersededSourceNodeKeys: string[]` as a de facto supersession chain; a collision could conflate two physically distinct provisions' amendment histories. A genuine, separate bug was also surfaced here (noted for completeness, not part of this identity architecture and explicitly not fixed under the production freeze): `independent-verification.ts:62` compares `index.getNodeByRef(...) !== null`, but `getNodeByRef` returns `StructuralNode | undefined`, never `null` — so this existence check is always `true` regardless of whether the target actually resolved. Flagged as a candidate fix for whichever future phase touches this file next; out of scope here.
- **Phase 3A IR** (`ir/types.ts`, `ir/identity.ts`) — confirms `SourceProvenance.sourceNodeKey` is a real, documented field, currently only ever written as `null` by the two producers found (`ir/legacy-adapter.ts:38`, `semantic/normalize.ts:59`) — meaning today's IR provenance does not yet actually exercise the collision risk end-to-end, but is architecturally ready to the moment Phase 3B's real semantic-compiler output path (not read in this pass) populates it. `computeRuleId` folding `sourceSectionRef` into rule identity (§21) confirmed.
- **Phase 3B semantic compiler tools** (`semantic/tools.ts`) — **highest-severity finding overall**: every evidence-retrieval tool exposed to the LLM (`getOperativeProvision`, `getParentClause`, `getChildren`, `getSiblingClauses`, `getReferencedProvision`, `getSourceSpan`) is a thin wrapper directly over the collision-prone index, and **none of them distinguish "lookup miss" from "wrong-occurrence hit"** — every `refuse(...)` branch fires only on a true miss; a silently-wrong occurrence is returned with the same full-confidence framing as a correct one, handed straight to the model as ground truth with no ambiguity signal at all. `ToolRunner.run`'s `seenRequests` dedup cache (keyed on a stringified request, including sectionRef) can also silently suppress a legitimately-different request that happens to share a colliding label.
- **Persistence** (§2.4, confirmed independently) — the DB-level `stableKey` collision (`persistence.ts:48`, no `charStart`/occurrence component) is the single highest-severity persistence-layer finding: it is a **silent row overwrite**, not merely a wrong in-memory read.
- **UI (`app/`)** — zero current exposure: `grep` across `app/`/`components/` for `nodeKey`/`structuralNodeKey`/`sourceNodeKey` returns no matches. All UI `sectionRef` display today comes from the legacy `ContractRule.sourceSectionRef` Prisma column, not from Phase 2A's `StructuralIndex`. No UI blast radius exists yet, but will the moment Phase 3B/3C output is wired into any citation/provenance-display component.

No consumer needs to change its own *logic* — every one of them needs only to be repointed from label-keyed lookups to `nodeId`-keyed ones, and (where they currently assume a singleton) updated to handle the now-explicit multi-match case (§14). This is the basis for the migration's bounded scope claim (§25): it is a substitution of the identity substrate underneath unchanged consumer logic, not a redesign of any consumer's semantics.

## 23. Persistence / schema impact

`DocumentNode` (Prisma) already has the right shape for occurrence-safe persistence (`parentId` as a real FK, §5 Option E) — it is `persistStructuralNodes`'s own `stableKey` derivation (`computeStableKey("document-node", companyId, node.documentId, node.nodeType, node.sectionRef)`, §2.4) that needs to include the disambiguating component (e.g. `charStart`, mirroring the new `nodeId` construction) instead of `node.sectionRef` alone. **This is a `stableKey` formula change, not a schema/migration change** — no new column, no new model, no Prisma migration is strictly required to close the persistence-layer half of this defect; only the value computed for the existing `stableKey` string column needs the extra disambiguating input. (If a future implementer wants an explicit, queryable "which physical occurrence" column for debugging, that would be an additive, optional column — not required for correctness.)

## 24. Cache invalidation

Any cache keyed directly or indirectly off today's `nodeKey` (or off a stage output hash that itself incorporates `nodeKey`, e.g. `structureOutputHash` at `stage-structure.ts:261-263`, which already hashes `documentId|nodeType|sectionRef|charStart` — notably **already includes `charStart`**, so the stage-level cache-invalidation hash is *more correct* than the identity scheme it's caching the output of) must be understood as invalidated by an identity-scheme change. A `STRUCTURAL_INDEX_VERSION` constant (§26) participating in every derived cache/artifact key is the proposed mechanism — bump it once, on the implementation phase, and every downstream cache naturally misses and recomputes rather than serving stale pre-remediation structure under a new identity scheme.

## 25. Historical artifact compatibility

No historical Phase 2/3/3F/3F.1/3F.1.1 artifact is rewritten by this ADR or by the future implementation it scopes. Those artifacts freeze `nodeKey` values under the **legacy** scheme by construction (they are point-in-time JSON snapshots). A future implementation should tag new output with `structuralIdentityVersion` (or reuse `STRUCTURAL_INDEX_VERSION`, §26) so that legacy frozen artifacts (which have no such tag) are unambiguously distinguishable from new-scheme output, without needing any migration of the frozen files themselves — old evidence stays readable exactly as-is, forever, as a historical snapshot under the scheme that was current when it was captured.

## 26. Legacy adapter policy

If a temporary compatibility shim proves useful during migration (§29 dual-run), it must be: (a) explicit and named as legacy, (b) one-way (new `nodeId` → legacy label-shaped `nodeKey` string, for any caller not yet migrated — never the reverse, since the reverse direction is exactly the ambiguous one), (c) never treated as authoritative by any new code, and (d) scheduled for deletion once the consumer inventory (§22) is fully migrated. Legacy `nodeKey` must never remain the hidden canonical identity behind a `nodeId`-shaped wrapper — that would just move the bug one layer down, not fix it.

## 27. Identity versioning

`STRUCTURAL_INDEX_VERSION` (a simple integer or semver-shaped constant) should participate in: (a) `structureOutputHash`-style stage cache keys, (b) any persisted-artifact schema version tag, (c) the historical-compatibility tag (§25). It must bump whenever `nodeId`'s own construction changes (a new hashed part, a change to what counts as "the same occurrence") — never for a change that only affects unrelated stage logic.

## 28. Determinism, collision handling, and residual-risk fail-closed behavior

Per §5 Option A/D: same source bytes + same parser version ⇒ same `nodeId`s, verified by (i) repeated-run equality, (ii) shuffled construction-input-ordering equality (index construction must not depend on `Map`/array iteration order for anything but display ordering), (iii) serialize/deserialize round-trip equality, (iv) process-restart equality. A source reorder that changes charStart values (a genuine source-text change) is legitimately allowed to change identity — that is not a determinism violation, it is a different input. Even though genuine `charStart` collisions between two different `nodeType`s at the exact same offset are believed near-impossible, the architecture must never silently resolve one via last-write-wins: any detected `nodeId` collision at construction time must produce a hard-fail structural-health finding (`DUPLICATE_OCCURRENCE_ID`, §17) and downgrade that document's structural trust rather than silently pick a winner — directly closing the exact silent-overwrite failure mode this whole ADR exists to eliminate.

## 29. Migration strategy (staged, illustrative — safest sequence, not a mandate)

- **Stage A** — introduce `nodeId` (Option D) alongside today's `nodeKey`, computed and carried on every `StructuralNode`, with zero consumer changes yet (`nodeKey` still authoritative for all existing callers).
- **Stage B** — dual-run invariant comparison (§30): build both the legacy index and a new occurrence-safe index from the same parsed nodes; diff node count, reachable-occurrence count, parent/child ownership, source spans, reference-resolution results; use disagreements as a generalized (not DSGR-tuned, §31) correctness signal.
- **Stage C** — migrate structural consumers one Headroom phase at a time (2A → 2B → 2D → 2E/3E → 2G → 3A/3B), in dependency order, each with its own targeted regression before moving to the next — never a big-bang rewrite across all consumers at once.
- **Stage D** — remove authoritative legacy `nodeKey`-as-map-key usage everywhere; `nodeKey`/`sectionRef` remain present as display fields only.
- **Stage E** — rerun the known-package regression sequence (§32).
- **Stage F (separate, later workstream)** — scorer/reconciliation semantic-match correction (§33) — explicitly NOT bundled into the same phase.
- **Stage G** — a genuinely new unseen-package validation (Phase 3F.2), only after both E and F have independently gated green.

## 30. Dual-run recommendation

**Recommended: yes**, for Stage B specifically (not as a permanent architecture). Building both indexes from the same parsed-node input and diffing them on node count / reachable-occurrence count / parent-child ownership / source spans / reference-resolution output gives strong, cheap migration evidence with no ongoing maintenance cost (it is discarded after Stage B, not a permanent dual-parser architecture — which §19 already rejected). The legacy output must never be allowed to *constrain* what counts as correct in the new index — it is a diff target for understanding blast radius, not a source of truth.

## 31. Compatibility risk — expected changes vs. regressions

Explicitly **not** regressions, if they occur after the fix: previously-merged contexts splitting apart into their correct distinct occurrences; source spans becoming smaller/more precise (an "own text" that used to silently include another occurrence's children shrinking to its true own boundary); reference resolution returning multiple candidates where it used to silently return one; caches invalidating (§24, expected once); golden/fixture outputs changing where the old output was demonstrably wrong (a corrupted merge); semantic candidate counts changing accordingly. A **genuine regression** is any output change for a document/section that had NO duplicate-key involvement at all (i.e., a case with zero collisions before and after) — that should be provably impossible under Option D (a non-colliding node's `nodeId` construction is a strict superset of information, never a different answer for the non-ambiguous case) and must be a release-blocking finding if observed.

## 32. No benchmark tuning / contamination

The implementation must contain zero DSGR names, section numbers, hierarchy patterns, or FWRG/LSB-specific collision exceptions. Contamination check for the future implementation: grep the diff for `dsgr`, `fwrg`, `lsb`, `conmed` (case-insensitive) outside of test/script/doc paths, and a manual read of any conditional branching in `stage-structure.ts`/`structural-index.ts` for anything keyed on a literal section number or document name rather than a general structural property. This is the same discipline already enforced in every prior phase of this project (Phase 3F.1's and 3F.1.1's own benchmark-contamination greps) and needs no new mechanism, only continued application.

## 33. Performance estimate

Option D's `nodeId` computation is O(1) per node (one `computeStableKey` hash call, already the repo's standard sha256-hex-slice pattern used elsewhere at the same volume). Index construction remains a single O(n log n) sort + O(n) map-population pass, identical in asymptotic shape to today's `buildStructuralIndex` — the only addition is one more map (`nodesById` alongside, eventually replacing, `byKey`) and one more hash computation per node at parse time. `childrenByParentId`/`parentByChildId` are the same shape as today's `childrenByParentKey`, just keyed by `nodeId` instead of a label string — no complexity-class change. For "hundreds-page debt packages" (thousands of nodes, per DSGR's own 4,149-node census), this remains comfortably linear-ish in practice; no pathological lookup pattern is introduced. `nodesByLegalRef`/`nodesByDisplayLabel` (§13) are ordinary multi-maps, no different in cost from today's single-valued maps except returning (usually length-1) arrays instead of scalars.

## 34. Tenant / document isolation

`nodeId`'s construction always begins with `documentId` (§5), making cross-document collision structurally impossible, not merely conventionally avoided — the same guarantee `documentId::sectionRef` already provided today for cross-document isolation (§11, I14), preserved unchanged. No lookup API proposed here (§13) offers a "search across all documents/tenants by short label" shape; every lookup is either by an already-scoped `nodeId` (which embeds `documentId`) or explicitly parameterized by `documentId` (mirroring `getNodeByRef(documentId, sectionRef)`'s existing, correct pattern). No new cross-tenant surface is introduced.

## 35. What this ADR does NOT do

- Does not modify `structural-index.ts`, `stage-structure.ts`, `persistence.ts`, or any other production file.
- Does not migrate any consumer.
- Does not fix the scorer/reconciliation false-credit defect Phase 3F.1.1 separately identified (26 cases, 14-16 suspected false credits) — that is explicitly Stage F, a separate future workstream (§33 of the governing task), because the structural fix does not mechanically resolve semantic-match-quality questions.
- Does not rerun DSGR as a remediation exercise, does not inspect a new unseen package, does not begin Phase 4 work.
- Does not weaken, and is not itself, the zero-dangerous-omissions gate that must still be met (via structural remediation AND the separate scorer/other-residual-cause workstreams) before Phase 3F.2.

## 36. Decision

**Adopt Option D** (span-primary `nodeId` via the existing `computeStableKey` convention, with `structuralPath`/`occurrenceOrdinal` as derived non-identity metadata) as the target architecture. Scope the next implementation phase as **PHASE 3F.1.2 — STRUCTURAL IDENTITY & INDEX INTEGRITY REMEDIATION**, bounded to Stages A-E of §29, explicitly excluding scorer remediation (Stage F) and any new unseen-package validation (Stage G).

## Consequences

- **Positive:** closes the dominant (~79%) DSGR residual root cause at its true source rather than patching each downstream symptom; closes an equivalent, previously-undiscovered defect in the persistence layer (§2.4) as a side effect of fixing the same root construction; gives Phase 2B/3E a real, cheap, mechanical independence signal (§18) directly responsive to Architecture Invariant #18, without the cost/complexity of a second parser (§19); every downstream consumer's own semantic logic is untouched, only its identity substrate is substituted (§22).
- **Negative / costs:** touches ~20-30 files across most Headroom phases (bounded, not deep, per §22); requires careful staged migration (§29) to avoid a big-bang regression; some existing outputs will legitimately change (§31) and must be triaged, not blanket-accepted or blanket-rejected; does not by itself close the zero-dangerous-omissions gate (non-structural residual causes and the scorer defect remain separate, required workstreams).
- **Rejected alternatives:** Option B (ancestry+ordinal) as primary identity — circular/fragile; Option C (content hash) — introduces new collisions, circular dependency; a second independent parser (§19) — cost/complexity/disagreement-resolution problems outweigh the marginal independence gain over the cheaper reachability-invariant approach.
