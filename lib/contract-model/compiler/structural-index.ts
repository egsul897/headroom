/**
 * Phase 2A - internal navigation API over a parsed structural tree (task
 * §10). Pure, in-memory, built once from a document's own StructuralNode[]
 * plus its detected definitions/references, then queried in O(1)/O(log n)
 * via prebuilt maps - never a full-document rescan per lookup. This is
 * deliberately NOT a customer-facing API; it is the internal substrate a
 * future covenant-discovery/retrieval system calls into.
 *
 * Phase 3F.1.2 - STRUCTURAL IDENTITY & INDEX INTEGRITY REMEDIATION
 * (docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md, "Option D"). The
 * pre-3F.1.2 index keyed every map by `nodeKey` (`documentId::sectionRef`,
 * a human drafting LABEL) and treated it as if it were a unique physical
 * occurrence identity. It is not: the same label can be produced by more
 * than one physical source location (a cross-reference sentence, a
 * table-of-contents entry, amendment-quoted text - proven with a minimal,
 * generalized synthetic reproduction in
 * scripts/architecture-proposal-node-identity-repro.ts). `byKey.set` then
 * silently discarded every earlier same-labeled occurrence (last-charStart
 * wins), and `childrenByParentKey` merged children across colliding parent
 * occurrences with no ownership check.
 *
 * This version makes `StructuralNode.nodeId` (a real per-occurrence
 * identity - documentId+nodeType+charStart, minted once at parse time in
 * stage-structure.ts, never re-derived here) the authoritative key for
 * every identity-bearing map and traversal primitive. `nodeKey`/`sectionRef`
 * remain present on StructuralNode as legal-reference/display fields only -
 * `findNodesByRef`/`resolveUniqueNodeByRef` are the safe way to look a node
 * up BY that label, always cardinality-aware (0/1/many), never a silent
 * singleton pick. The only method that keeps the pre-3F.1.2 `T | undefined`
 * contract is the deprecated `getNodeByRef` compatibility shim, and it is
 * now safe-by-omission (returns undefined rather than an arbitrary wrong
 * occurrence when more than one node shares the requested reference).
 */
import type { StructuralNode } from "./types";
import type { DetectedDefinition } from "./structural-definitions";
import type { DetectedReference } from "./structural-references";

export type TextMode = "OWN" | "DESCENDANTS";

/** Cardinality-aware legal-reference resolution result (task §6B/I13/I14) - never collapses AMBIGUOUS to a silent pick. */
export type RefResolution = { status: "UNIQUE"; node: StructuralNode } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS"; candidates: StructuralNode[] };

export type StructuralHealthFindingCode =
  | "DUPLICATE_OCCURRENCE_ID"
  | "IMPOSSIBLE_PARENT"
  /**
   * ADR §17's I4/I6 cross-check. Never actually emitted by buildStructuralIndex:
   * each StructuralNode carries exactly one scalar `parentNodeId` field, so a
   * node contributes itself to at most one parent's child list by construction
   * - there is no data shape in which two different parents could both claim
   * the same occurrence. Declared (per the ADR's own health-code table) rather
   * than omitted, so a future data-model change that made parentage plural
   * would have a named condition ready to detect it, not a silent gap.
   */
  | "MULTIPLE_STRUCTURAL_PARENTS"
  | "ORPHANED_NODE"
  | "CYCLE"
  | "INVALID_SOURCE_SPAN"
  | "OVERLAPPING_INCOMPATIBLE_SPAN"
  | "AMBIGUOUS_LEGAL_REFERENCE"
  | "DUPLICATE_LABEL_EXPECTED"
  | "DUPLICATE_NORMALIZED_PATH"
  | "SOURCE_ORDER_VIOLATION"
  | "CROSS_DOCUMENT_PARENT"
  /**
   * Phase 3F.1.4 (Workstream A) - fault-injection finding (docs/foundation-
   * assurance/12-fault-injection-results.json: "overlapping impossible spans
   * between SIBLINGS (not parent/child)", severityIfUndetected P2) and
   * tests/foundation-audit/structural-index-fault-injection.test.ts's own
   * "Fault: overlapping impossible spans between SIBLINGS" case, previously
   * asserted UNDETECTED. OVERLAPPING_INCOMPATIBLE_SPAN (I12) only ever
   * checks parent/child containment; it was structurally blind to two
   * SIBLINGS under the very same parent (or two top-level root nodes)
   * whose own [charStart,charEnd) ranges overlap each other - real data
   * corruption (no two distinct physical occurrences can legitimately
   * share source characters) that no other health code names.
   */
  | "SIBLING_SPAN_OVERLAP"
  /**
   * Phase 3F.1.4 (Workstream A) - fault-injection finding (docs/foundation-
   * assurance/12-fault-injection-results.json: "wrong parent (CLAUSE claims
   * ARTICLE directly, skipping SECTION/SUBSECTION)", affectedInvariant
   * "implicit hierarchy plausibility (no named invariant)") and the
   * consumer-assurance audit's own Q5 (docs/foundation-assurance/
   * 06-structural-consumer-assurance.json: "does 'healthy' check only span
   * coverage, or also rank/level sanity?"). A node's declared parent
   * skipping more than one nesting rank (e.g. a CLAUSE's real parent
   * occurrence being an ARTICLE directly, with no intervening SECTION or
   * SUBSECTION occurrence at all) is legally/drafting-wise implausible in
   * essentially every real contract-numbering convention, yet every other
   * I1-I16 check (span containment, existence, cycle-freedom) passes it
   * silently. Never a normal, expected drafting reality the way
   * DUPLICATE_LABEL_EXPECTED is - real reachable-hierarchy plausibility -
   * so this is an ERROR, not an INFO.
   */
  | "IMPLAUSIBLE_HIERARCHY_RANK"
  /**
   * Phase 3F.1.4 (Workstream A) - Q3/P1-10 investigation (docs/foundation-
   * assurance/06-structural-consumer-assurance.json: an in-text citation
   * that happens to satisfy SECTION_PATTERNS - e.g. "...except as permitted
   * under Section 6.05 Reserved ."- creates a spurious real top-level
   * SECTION occurrence that corrupts stage-structure.ts's own GLOBAL
   * rank-based stack pass, popping the real enclosing section early and
   * misattaching its later real lettered clauses to the spurious node
   * instead). Correcting that misattachment requires changing
   * stage-structure.ts's rank-stack construction itself (parenting logic
   * out of this workstream's authorized scope - see the final report's Q3
   * determination for the full write-up and candidate designs) - this
   * INFO-severity, detection-only signal is the bounded mitigation that IS
   * safely implementable from health-diagnostics alone, with no change to
   * parenting: two same-parent (or same-document top-level) SECTION
   * siblings, in document order, whose decimal section numbers SHARE the
   * same major component but DECREASE (e.g. real "6.01" then spurious
   * "6.05" then real "6.02") - a real, if imperfect (a legitimate
   * non-decimal renumbering convention could false-positive here; deliberately
   * INFO, not ERROR, for exactly that reason), signal that a spurious
   * heading-shaped match may have been accepted as a real top-level node.
   * Never gates on its own - a lead for a human/further-automated review,
   * per this codebase's own INFO-severity discipline.
   */
  | "SECTION_NUMBER_SEQUENCE_ANOMALY";

/**
 * `severity: "INFO"` findings (AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED,
 * DUPLICATE_NORMALIZED_PATH) are NORMAL, expected drafting realities (task
 * §13/I2) - they must never gate anything on their own. Only `"ERROR"`
 * findings (identity-level invariant violations: I1/I5/I6/I7/I9/I10/I11/I12/I14)
 * indicate real structural-index corruption.
 */
export interface StructuralHealthFinding {
  code: StructuralHealthFindingCode;
  severity: "INFO" | "ERROR";
  documentId: string;
  nodeId?: string;
  message: string;
}

export interface StructuralIndex {
  // ---- Occurrence-safe primitives (Phase 3F.1.2, authoritative) ----

  /** Exact lookup by physical occurrence identity - never fuzzy, never label-based. Returns exactly one node or none (I1/I7). */
  getNodeById(nodeId: string): StructuralNode | undefined;
  /** Cardinality-aware legal-reference lookup (I13/I14/I15) - the safe replacement for a singleton-returning getNodeByRef. */
  resolveUniqueNodeByRef(documentId: string, sectionRef: string): RefResolution;
  /** Every node whose sectionRef (normalized) matches, in document order - 0, 1, or many; never silently collapsed. */
  findNodesByRef(documentId: string, sectionRef: string): StructuralNode[];
  /** Children owned by this SPECIFIC physical parent occurrence only (I4/I6) - never merged across same-labeled parents. */
  getChildren(parentNodeId: string): StructuralNode[];
  getParent(nodeId: string): StructuralNode | undefined;
  /** Root-to-parent order (closest ancestor last), never including the node itself. */
  getAncestors(nodeId: string): StructuralNode[];
  /** Every other node sharing the same direct PHYSICAL parent occurrence, in document order - never including the node itself. */
  getSiblings(nodeId: string): StructuralNode[];
  /** Every node structurally beneath this one, at any depth, in document order - occurrence-safe (I6 applied recursively). */
  getDescendants(nodeId: string): StructuralNode[];
  /** "OWN" = this node's own text only (excludes children); "DESCENDANTS" = own text plus every nested descendant. Occurrence-safe: only this node's own (I6-correct) children can truncate its OWN span. */
  getNodeText(nodeId: string, mode: TextMode): string;
  /** Top-level nodes with no parent occurrence, in document order. */
  roots(): StructuralNode[];
  /** Nodes whose declared parentNodeId does not resolve to any real occurrence (I10) - never silently re-rooted or dropped. */
  orphans(): StructuralNode[];
  /** Every structural-health finding for this index (I16) - INFO findings (expected duplicate labels/ambiguity) are never gating; only ERROR findings indicate real corruption. */
  healthDiagnostics(): StructuralHealthFinding[];

  // ---- Legacy compatibility (deprecated) ----

  /**
   * @deprecated Use `getNodeById`. Kept only so already-migrated callers
   * that happen to pass a real `nodeId` keep working during a staged
   * rollout; it is a plain alias, not a label lookup.
   */
  getNode(nodeId: string): StructuralNode | undefined;
  /**
   * @deprecated Use `resolveUniqueNodeByRef`/`findNodesByRef`. Preserved
   * ONLY for backward compatibility with not-yet-migrated legacy callers
   * that need the pre-3F.1.2 `T | undefined` shape. Made SAFE (not merely
   * kept): returns the node only when resolution is UNIQUE; returns
   * `undefined` for both NOT_FOUND and AMBIGUOUS - it can no longer
   * silently hand back an arbitrary wrong occurrence the way the
   * pre-3F.1.2 `byKey.get` did.
   */
  getNodeByRef(documentId: string, sectionRef: string): StructuralNode | undefined;

  // ---- Definitions / references / whole-index access (unchanged surface) ----

  /**
   * `documentId`, when supplied, disambiguates a term declared in more
   * than one document of the SAME multi-document index (task §21's own
   * cross-instrument-isolation requirement, discovered as a real,
   * previously-dormant gap by Phase 2D: a flat term->definition map is
   * only safe when the index covers exactly one document at a time, which
   * was true for every caller before Phase 2D's own multi-document
   * package index). Omitting it preserves the original single-document
   * behavior (first/only match) for every existing caller.
   */
  getDefinition(term: string, documentId?: string): DetectedDefinition | undefined;
  /**
   * Phase 2D extension (docs/phase-2d-covenant-context-retrieval.md §8) -
   * `getDefinition`'s own DetectedDefinition only carries a bounded
   * 200-char excerpt (structural-definitions.ts's own EXCERPT_LENGTH); a
   * downstream analyzer needs the FULL definition body, which real
   * drafting never marks with an explicit end boundary. Computed
   * structurally, never by content heuristics: a definition's own span
   * runs from its declaration's charStart to the NEXT definition
   * declaration's charStart in the same document (or that document's own
   * text end for the last definition) - the same "use structural
   * boundaries, not arbitrary chunks" discipline this codebase already
   * applies everywhere else (Phase 2B's own batching rule, task §23).
   */
  getDefinitionFullText(term: string, documentId?: string): string | undefined;
  /** Every definition detected in the whole package, in document order - lets a caller scan for known-term mentions without re-deriving the definitions list Phase 2A already built this index from. */
  allDefinitions(): DetectedDefinition[];
  /** Every reference whose source is this node (or a descendant of it, when includeDescendants is true). */
  findReferencesFrom(nodeId: string, includeDescendants?: boolean): DetectedReference[];
  /** Reverse lookup (task §9): every reference that resolves TO this node. */
  findReferencesTo(nodeId: string): DetectedReference[];
  searchStructuralNodes(predicate: (node: StructuralNode) => boolean): StructuralNode[];
  /** Every node, in document order - the same evidence a coverage/audit pass needs without a second parse. */
  allNodes(): StructuralNode[];
  /** Phase 2F.1 §6 - one document's own full raw text, exactly as parsed. Needed by structural-coverage.ts to compute uncovered spans (a node's own OWN/DESCENDANTS text can never reveal a span no node covers at all - by definition nothing points to it) - the same underlying text this index was built from, never re-fetched or re-normalized. */
  getDocumentText(documentId: string): string | undefined;
}

function normalizeRef(ref: string): string {
  return ref.replace(/\s+/g, "");
}

/**
 * Phase 3F.1.4 - expected nesting depth per DocumentNodeType, used ONLY for
 * the IMPLAUSIBLE_HIERARCHY_RANK health-diagnostics check below (never for
 * parenting/identity itself - that remains entirely stage-structure.ts's
 * responsibility, out of this workstream's scope). Deliberately NOT
 * imported from stage-structure.ts's own (private, unexported) RANK table:
 * this module must stay able to validate ANY StructuralNode[] handed to
 * it - including a hand-constructed/synthetic array, or one reloaded from
 * persistence - never assuming its own most common producer's internal
 * constants. Mirrors the same ARTICLE < SECTION < SUBSECTION < CLAUSE <
 * SUBCLAUSE ordering documented on StructuralNode.nodeType itself
 * (types.ts).
 */
const NODE_TYPE_RANK: Record<StructuralNode["nodeType"], number> = { ARTICLE: 0, SECTION: 1, SUBSECTION: 2, CLAUSE: 3, SUBCLAUSE: 4 };

export function buildStructuralIndex(nodesByDocument: Map<string, { text: string; nodes: StructuralNode[] }>, definitions: DetectedDefinition[], references: DetectedReference[]): StructuralIndex {
  const allNodesSorted: StructuralNode[] = [];
  // ---- Authoritative, occurrence-safe maps (I1/I4/I6/I7) ----
  const nodesById = new Map<string, StructuralNode>();
  const childrenByParentId = new Map<string, StructuralNode[]>();
  const parentByChildId = new Map<string, string>(); // nodeId -> parentNodeId, only when the parent occurrence actually resolved
  const health: StructuralHealthFinding[] = [];

  // ---- Legal-reference / label multimaps (I2/I3/I15) - always many-valued, never a singleton overwrite ----
  const nodesByLegalRefKey = new Map<string, StructuralNode[]>(); // `${documentId}::${normalizedSectionRef}` -> ALL matching physical occurrences

  for (const [documentId, { nodes }] of nodesByDocument) {
    const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
    for (const n of sorted) {
      // I1/I5 - duplicate occurrence id is a hard-fail health finding, never a silent overwrite. Should be
      // structurally impossible under Option D's construction (documentId+nodeType+charStart), so any
      // occurrence here is a genuine construction-time collision, not an ordinary label duplicate.
      if (nodesById.has(n.nodeId)) {
        health.push({ code: "DUPLICATE_OCCURRENCE_ID", severity: "ERROR", documentId, nodeId: n.nodeId, message: `Two physical occurrences share nodeId ${n.nodeId} - the later occurrence was NOT inserted (no silent overwrite); this document's structural trust should be downgraded until investigated.` });
        continue; // never overwrite - the first-seen occurrence remains authoritative, and the collision is surfaced, not hidden.
      }
      nodesById.set(n.nodeId, n);
      allNodesSorted.push(n);

      const legalRefKey = `${documentId}::${normalizeRef(n.sectionRef)}`;
      const list = nodesByLegalRefKey.get(legalRefKey) ?? [];
      list.push(n);
      nodesByLegalRefKey.set(legalRefKey, list);

      if (n.parentNodeId) {
        const kids = childrenByParentId.get(n.parentNodeId) ?? [];
        kids.push(n);
        childrenByParentId.set(n.parentNodeId, kids);
        parentByChildId.set(n.nodeId, n.parentNodeId);
      }
    }
  }
  allNodesSorted.sort((a, b) => a.charStart - b.charStart);

  // ---- Post-construction health pass (I2/I8/I9/I10/I11/I12/I14 diagnostics) ----
  for (const [legalRefKey, matches] of nodesByLegalRefKey) {
    if (matches.length > 1) {
      health.push({ code: "DUPLICATE_LABEL_EXPECTED", severity: "INFO", documentId: matches[0]!.documentId, message: `${matches.length} physical occurrences share legal reference "${legalRefKey}" - normal drafting/extraction reality (repeated section numbers, cross-references, ToC entries), not a defect. resolveUniqueNodeByRef returns AMBIGUOUS for this reference; findNodesByRef returns all ${matches.length} candidates.` });
      // I15 - a distinct, separately-named finding from DUPLICATE_LABEL_EXPECTED
      // above (same underlying condition, different diagnostic lens per the
      // ADR's own §17 table): this one documents that resolveUniqueNodeByRef
      // itself will return AMBIGUOUS for this exact reference, never a silent pick.
      health.push({ code: "AMBIGUOUS_LEGAL_REFERENCE", severity: "INFO", documentId: matches[0]!.documentId, message: `resolveUniqueNodeByRef/getNodeByRef for legal reference "${legalRefKey}" returns AMBIGUOUS/undefined (${matches.length} candidates) rather than an arbitrary pick - callers needing a specific occurrence must disambiguate via findNodesByRef or nodeId.` });
    }
  }
  for (const n of allNodesSorted) {
    if (n.parentNodeId && !nodesById.has(n.parentNodeId)) {
      health.push({ code: "IMPOSSIBLE_PARENT", severity: "ERROR", documentId: n.documentId, nodeId: n.nodeId, message: `Declared parentNodeId ${n.parentNodeId} does not resolve to any indexed occurrence.` });
    }
    if (n.parentNodeId) {
      const parent = nodesById.get(n.parentNodeId);
      if (parent && parent.documentId !== n.documentId) {
        health.push({ code: "CROSS_DOCUMENT_PARENT", severity: "ERROR", documentId: n.documentId, nodeId: n.nodeId, message: `Node's parent occurrence belongs to a different document (${parent.documentId}) - document boundary violated.` });
      } else if (parent && !(n.charStart >= parent.charStart && n.charEnd <= parent.charEnd)) {
        // I12 - a node's own full span must be nested inside its declared physical parent's own full span.
        health.push({ code: "OVERLAPPING_INCOMPATIBLE_SPAN", severity: "ERROR", documentId: n.documentId, nodeId: n.nodeId, message: `Node's own span [${n.charStart},${n.charEnd}) is not nested within parent occurrence ${n.parentNodeId}'s span [${parent.charStart},${parent.charEnd}).` });
      }
      // Phase 3F.1.4 - IMPLAUSIBLE_HIERARCHY_RANK: independent of span
      // containment (which this can pass cleanly - a CLAUSE physically
      // nested inside an ARTICLE's own span is not itself a span error),
      // does this parent/child edge skip more than one real nesting rank?
      if (parent && NODE_TYPE_RANK[n.nodeType] - NODE_TYPE_RANK[parent.nodeType] > 1) {
        health.push({
          code: "IMPLAUSIBLE_HIERARCHY_RANK",
          severity: "ERROR",
          documentId: n.documentId,
          nodeId: n.nodeId,
          message: `Node type ${n.nodeType} (rank ${NODE_TYPE_RANK[n.nodeType]}) is a direct child of ${parent.nodeType} occurrence ${parent.nodeId} (rank ${NODE_TYPE_RANK[parent.nodeType]}) - a malformed/implausible hierarchy edge that skips at least one intermediate rank (e.g. a CLAUSE attached directly under an ARTICLE with no intervening SECTION/SUBSECTION occurrence at all).`,
        });
      }
    }
    if (!(n.charStart >= 0 && n.charStart < n.charEnd)) {
      health.push({ code: "INVALID_SOURCE_SPAN", severity: "ERROR", documentId: n.documentId, nodeId: n.nodeId, message: `Invalid span charStart=${n.charStart} charEnd=${n.charEnd} (must satisfy 0 <= charStart < charEnd).` });
    }
    const doc = nodesByDocument.get(n.documentId);
    if (doc && n.charEnd > doc.text.length) {
      health.push({ code: "INVALID_SOURCE_SPAN", severity: "ERROR", documentId: n.documentId, nodeId: n.nodeId, message: `charEnd=${n.charEnd} exceeds document text length ${doc.text.length}.` });
    }
  }
  // I9/I11 - cycle detection via ancestor-chain walk with a guard set (defensive; parentNodeId is assigned
  // strictly top-down from a stack during parsing, so a cycle should be structurally impossible, but this is
  // verified rather than assumed).
  for (const n of allNodesSorted) {
    const seen = new Set<string>([n.nodeId]);
    let cur: string | undefined = n.parentNodeId ?? undefined;
    let cycleFound = false;
    while (cur) {
      if (seen.has(cur)) {
        cycleFound = true;
        break;
      }
      seen.add(cur);
      cur = nodesById.get(cur)?.parentNodeId ?? undefined;
    }
    if (cycleFound) health.push({ code: "CYCLE", severity: "ERROR", documentId: n.documentId, nodeId: n.nodeId, message: `Ancestor chain from ${n.nodeId} contains a cycle.` });
  }
  // I11 (source order) - siblings under the same parent must already be charStart-ascending by construction
  // (raws are sorted before parentNodeId assignment); verified here rather than assumed.
  for (const [parentId, kids] of childrenByParentId) {
    for (let i = 1; i < kids.length; i++) {
      if (kids[i]!.charStart < kids[i - 1]!.charStart) {
        health.push({ code: "SOURCE_ORDER_VIOLATION", severity: "ERROR", documentId: kids[i]!.documentId, nodeId: kids[i]!.nodeId, message: `Child of ${parentId} is out of charStart order relative to its preceding sibling.` });
      }
    }
  }
  // Phase 3F.1.4 - SIBLING_SPAN_OVERLAP (docs/foundation-assurance/
  // 12-fault-injection-results.json: "overlapping impossible spans between
  // SIBLINGS (not parent/child)", previously entirely undetected - see
  // tests/foundation-audit/structural-index-fault-injection.test.ts).
  // Checked over every real sibling group: (a) each parent's own children
  // (childrenByParentId, already charStart-sorted per I11 above), and (b)
  // each document's own top-level roots (which are one another's siblings
  // too, and were equally unchecked before this fix). Two DISTINCT physical
  // occurrences can never legitimately share source characters, regardless
  // of nesting depth - this is a plain ERROR, never a normal drafting
  // reality.
  function checkSiblingSpanOverlaps(siblingGroups: Iterable<StructuralNode[]>): void {
    for (const kids of siblingGroups) {
      const sorted = [...kids].sort((a, b) => a.charStart - b.charStart);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const cur = sorted[i]!;
        if (cur.charStart < prev.charEnd) {
          health.push({
            code: "SIBLING_SPAN_OVERLAP",
            severity: "ERROR",
            documentId: cur.documentId,
            nodeId: cur.nodeId,
            message: `Sibling occurrence ${cur.nodeId} [${cur.charStart},${cur.charEnd}) overlaps the immediately preceding sibling ${prev.nodeId} [${prev.charStart},${prev.charEnd}) - two distinct physical occurrences can never legitimately share source characters.`,
          });
        }
      }
    }
  }
  checkSiblingSpanOverlaps(childrenByParentId.values());
  {
    const rootsByDocumentForOverlapCheck = new Map<string, StructuralNode[]>();
    for (const n of allNodesSorted) {
      if (n.parentNodeId !== null) continue;
      const arr = rootsByDocumentForOverlapCheck.get(n.documentId) ?? [];
      arr.push(n);
      rootsByDocumentForOverlapCheck.set(n.documentId, arr);
    }
    checkSiblingSpanOverlaps(rootsByDocumentForOverlapCheck.values());
  }
  // Phase 3F.1.4 - SECTION_NUMBER_SEQUENCE_ANOMALY (Q3/P1-10 bounded
  // mitigation - see the health-code's own doc-comment above for the full
  // rationale and the final report for the complete Q3 determination).
  // Detection-only: reuses the exact same sibling groupings as the overlap
  // check above (each parent's own children, plus each document's own
  // top-level roots) - never touches parentNodeId/childrenByParentId
  // themselves.
  function parseDecimalSectionNumber(sectionRef: string): { major: number; minor: number } | null {
    const m = /^(\d+)\.(\d+)/.exec(sectionRef.trim());
    if (!m) return null;
    return { major: Number(m[1]!), minor: Number(m[2]!) };
  }
  function checkSectionNumberSequenceAnomalies(siblingGroups: Iterable<StructuralNode[]>): void {
    for (const kids of siblingGroups) {
      const sections = kids.filter((k) => k.nodeType === "SECTION").sort((a, b) => a.charStart - b.charStart);
      for (let i = 1; i < sections.length; i++) {
        const prev = parseDecimalSectionNumber(sections[i - 1]!.sectionRef);
        const cur = parseDecimalSectionNumber(sections[i]!.sectionRef);
        if (!prev || !cur || prev.major !== cur.major) continue;
        if (cur.minor < prev.minor) {
          health.push({
            code: "SECTION_NUMBER_SEQUENCE_ANOMALY",
            severity: "INFO",
            documentId: sections[i]!.documentId,
            nodeId: sections[i]!.nodeId,
            message: `Section "${sections[i]!.sectionRef}" (occurrence ${sections[i]!.nodeId}) appears immediately after "${sections[i - 1]!.sectionRef}" (occurrence ${sections[i - 1]!.nodeId}) in document order, but its decimal number is LOWER within the same major component (${cur.major}.${cur.minor} < ${prev.major}.${prev.minor}) - a real, if imperfect, signal that one of these two occurrences (most often the earlier one) may be a spurious in-text citation heading-shaped match rather than a genuine top-level section, corrupting the real section-numbering sequence. Informational only - not proof of corruption (a legitimate non-decimal renumbering convention could also produce this).`,
          });
        }
      }
    }
  }
  checkSectionNumberSequenceAnomalies(childrenByParentId.values());
  {
    const rootsByDocumentForSequenceCheck = new Map<string, StructuralNode[]>();
    for (const n of allNodesSorted) {
      if (n.parentNodeId !== null) continue;
      const arr = rootsByDocumentForSequenceCheck.get(n.documentId) ?? [];
      arr.push(n);
      rootsByDocumentForSequenceCheck.set(n.documentId, arr);
    }
    checkSectionNumberSequenceAnomalies(rootsByDocumentForSequenceCheck.values());
  }
  // §8/§18 - a distinct diagnostic from DUPLICATE_LABEL_EXPECTED (which fires
  // on a single shared leaf-level sectionRef): this one detects two ENTIRE
  // subtrees sharing the identical normalized ancestor path (e.g. a fully
  // duplicated numbering branch, not just one repeated leaf label) - real
  // drafting/extraction reality (ToC-plus-operative duplication at scale),
  // informational only, never gating (I2's own discipline extended to whole paths).
  {
    const nodesByNormalizedPath = new Map<string, StructuralNode[]>();
    const pathCache = new Map<string, string>();
    const computeNormalizedPath = (nodeId: string): string => {
      const cached = pathCache.get(nodeId);
      if (cached !== undefined) return cached;
      const parts: string[] = [];
      const guard = new Set<string>();
      let cur: string | undefined = nodeId;
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        const node = nodesById.get(cur);
        if (!node) break;
        parts.unshift(`${node.nodeType}:${normalizeRef(node.sectionRef)}`);
        cur = parentByChildId.get(cur);
      }
      const path = parts.join("/");
      pathCache.set(nodeId, path);
      return path;
    };
    for (const n of allNodesSorted) {
      const key = `${n.documentId}::${computeNormalizedPath(n.nodeId)}`;
      const list = nodesByNormalizedPath.get(key) ?? [];
      list.push(n);
      nodesByNormalizedPath.set(key, list);
    }
    for (const [path, matches] of nodesByNormalizedPath) {
      if (matches.length > 1) {
        health.push({ code: "DUPLICATE_NORMALIZED_PATH", severity: "INFO", documentId: matches[0]!.documentId, message: `${matches.length} physical occurrences share the identical normalized ancestor path "${path}" - a duplicated structural branch, not merely one duplicated leaf label; each occurrence remains independently addressable by its own nodeId.` });
      }
    }
  }

  const definitionsByNormalizedTerm = new Map(definitions.map((d) => [d.normalizedTerm, d] as const));
  const definitionsByDocumentSorted = new Map<string, DetectedDefinition[]>();
  for (const d of definitions) {
    const list = definitionsByDocumentSorted.get(d.documentId) ?? [];
    list.push(d);
    definitionsByDocumentSorted.set(d.documentId, list);
  }
  for (const list of definitionsByDocumentSorted.values()) list.sort((a, b) => a.charStart - b.charStart);

  const referencesBySourceId = new Map<string, DetectedReference[]>();
  const referencesByTargetId = new Map<string, DetectedReference[]>();
  for (const r of references) {
    // Phase 3F.1.2: references detected before this index existed may only carry the legacy label-shaped
    // sourceNodeKey/targetNodeKey (structural-references.ts's own detection pass runs pre-index). Resolve
    // them to a real nodeId here, defensively, via the same safe-by-omission legal-ref lookup rather than
    // assuming they already carry a real nodeId.
    const sourceId = r.sourceNodeId ?? undefined;
    const targetId = r.targetNodeId ?? undefined;
    if (sourceId) {
      const list = referencesBySourceId.get(sourceId) ?? [];
      list.push(r);
      referencesBySourceId.set(sourceId, list);
    }
    if (targetId) {
      const list = referencesByTargetId.get(targetId) ?? [];
      list.push(r);
      referencesByTargetId.set(targetId, list);
    }
  }

  function getChildren(parentNodeId: string): StructuralNode[] {
    return [...(childrenByParentId.get(parentNodeId) ?? [])];
  }

  function getDescendants(nodeId: string): StructuralNode[] {
    const out: StructuralNode[] = [];
    const stack = [...getChildren(nodeId)];
    while (stack.length > 0) {
      const n = stack.shift()!;
      out.push(n);
      stack.push(...getChildren(n.nodeId));
    }
    return out.sort((a, b) => a.charStart - b.charStart);
  }

  function resolveUniqueNodeByRef(documentId: string, sectionRef: string): RefResolution {
    const matches = nodesByLegalRefKey.get(`${documentId}::${normalizeRef(sectionRef)}`) ?? [];
    if (matches.length === 0) return { status: "NOT_FOUND" };
    if (matches.length === 1) return { status: "UNIQUE", node: matches[0]! };
    return { status: "AMBIGUOUS", candidates: [...matches] };
  }

  function findNodesByRef(documentId: string, sectionRef: string): StructuralNode[] {
    return [...(nodesByLegalRefKey.get(`${documentId}::${normalizeRef(sectionRef)}`) ?? [])];
  }

  const rootsList = allNodesSorted.filter((n) => n.parentNodeId === null);
  const orphansList = allNodesSorted.filter((n) => n.parentNodeId !== null && !nodesById.has(n.parentNodeId));

  return {
    getNodeById: (nodeId) => nodesById.get(nodeId),
    resolveUniqueNodeByRef,
    findNodesByRef,
    getChildren,
    getParent: (nodeId) => {
      const parentId = parentByChildId.get(nodeId);
      return parentId ? nodesById.get(parentId) : undefined;
    },
    getAncestors: (nodeId) => {
      const out: StructuralNode[] = [];
      const guard = new Set<string>();
      let currentId: string | undefined = nodeId;
      while (currentId) {
        const parentId: string | undefined = parentByChildId.get(currentId);
        if (!parentId || guard.has(parentId)) break; // malformed-input safety: never infinite-loop on a cyclic parent chain.
        guard.add(parentId);
        const parent = nodesById.get(parentId);
        if (!parent) break;
        out.unshift(parent);
        currentId = parentId;
      }
      return out;
    },
    getSiblings: (nodeId) => {
      const parentId = parentByChildId.get(nodeId);
      const pool = parentId ? getChildren(parentId) : rootsList.filter((n) => n.documentId === nodesById.get(nodeId)?.documentId);
      return pool.filter((n) => n.nodeId !== nodeId);
    },
    getDescendants,
    getDefinition: (term, documentId) => {
      const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
      if (documentId) return (definitionsByDocumentSorted.get(documentId) ?? []).find((d) => d.normalizedTerm === normalized);
      return definitionsByNormalizedTerm.get(normalized);
    },
    getDefinitionFullText: (term, documentId) => {
      const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
      const def = documentId ? (definitionsByDocumentSorted.get(documentId) ?? []).find((d) => d.normalizedTerm === normalized) : definitionsByNormalizedTerm.get(normalized);
      if (!def) return undefined;
      const doc = nodesByDocument.get(def.documentId);
      if (!doc) return undefined;
      const sameDocumentDefs = definitionsByDocumentSorted.get(def.documentId) ?? [];
      const ownIndex = sameDocumentDefs.findIndex((d) => d.charStart === def.charStart && d.normalizedTerm === def.normalizedTerm);
      const next = ownIndex >= 0 ? sameDocumentDefs[ownIndex + 1] : undefined;
      const spanEnd = next ? next.charStart : doc.text.length;
      return doc.text.slice(def.charStart, spanEnd);
    },
    allDefinitions: () => [...definitions],
    findReferencesFrom: (nodeId, includeDescendants = false) => {
      const direct = referencesBySourceId.get(nodeId) ?? [];
      if (!includeDescendants) return [...direct];
      const descendantIds = new Set(getDescendants(nodeId).map((n) => n.nodeId));
      const nested = [...descendantIds].flatMap((id) => referencesBySourceId.get(id) ?? []);
      return [...direct, ...nested].sort((a, b) => a.charStart - b.charStart);
    },
    findReferencesTo: (nodeId) => [...(referencesByTargetId.get(nodeId) ?? [])],
    getNodeText: (nodeId, mode) => {
      const node = nodesById.get(nodeId);
      if (!node) return "";
      const doc = nodesByDocument.get(node.documentId);
      if (!doc) return "";
      if (mode === "DESCENDANTS") return doc.text.slice(node.charStart, node.charEnd);
      const children = getChildren(nodeId);
      const ownEnd = children.length > 0 ? Math.min(...children.map((c) => c.charStart)) : node.charEnd;
      return doc.text.slice(node.charStart, ownEnd);
    },
    searchStructuralNodes: (predicate) => allNodesSorted.filter(predicate),
    allNodes: () => [...allNodesSorted],
    getDocumentText: (documentId) => nodesByDocument.get(documentId)?.text,
    roots: () => [...rootsList],
    orphans: () => [...orphansList],
    healthDiagnostics: () => [...health],

    // ---- Legacy compatibility (deprecated) ----
    getNode: (nodeId) => nodesById.get(nodeId),
    getNodeByRef: (documentId, sectionRef) => {
      const result = resolveUniqueNodeByRef(documentId, sectionRef);
      return result.status === "UNIQUE" ? result.node : undefined;
    },
  };
}
