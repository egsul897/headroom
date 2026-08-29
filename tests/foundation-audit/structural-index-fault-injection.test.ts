/**
 * Foundation Audit (Section 19) - Part 1: Systematic Fault Injection.
 *
 * AUDIT-ONLY. Injects faults directly into StructuralNode/DetectedDefinition
 * fixtures at the appropriate real layer (post-parse, pre-index) and checks
 * whether buildStructuralIndex (lib/contract-model/compiler/structural-index.ts,
 * post-3F.1.2) actually detects them, and whether detection is independent
 * of the layer broken. Nothing here modifies production code; findings are
 * recorded in this file's own describe/it names plus the narrative report
 * handed back to the caller.
 *
 * Phase 3F.1.4 (Workstream A) update: production code was frozen when the
 * "wrong parent (CLAUSE claims ARTICLE directly...)" and "overlapping
 * impossible spans between SIBLINGS" tests below were originally written to
 * DOCUMENT that buildStructuralIndex's healthDiagnostics() had no check for
 * either condition (docs/foundation-assurance/12-fault-injection-results.json
 * fault-injection rows for both). Both are now detected
 * (IMPLAUSIBLE_HIERARCHY_RANK, SIBLING_SPAN_OVERLAP respectively) - their own
 * assertions were UPDATED below to assert the new, fixed, fail-closed ERROR
 * findings instead of continuing to assert "UNDETECTED," the same precedent
 * already set by
 * tests/contract-model/architecture-proposal-node-identity.test.ts's own
 * header comment. Every other test in this file is unchanged.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex, type StructuralHealthFinding } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";

function n(overrides: Partial<StructuralNode> & Pick<StructuralNode, "documentId" | "nodeType" | "sectionRef" | "charStart" | "charEnd">): StructuralNode {
  return {
    documentId: overrides.documentId,
    nodeType: overrides.nodeType,
    heading: overrides.heading ?? overrides.sectionRef,
    sectionRef: overrides.sectionRef,
    nodeKey: overrides.nodeKey ?? `${overrides.documentId}::${overrides.sectionRef.replace(/\s+/g, "")}`,
    nodeId: overrides.nodeId ?? `synthetic:${overrides.documentId}:${overrides.nodeType}:${overrides.charStart}`,
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    ordinal: overrides.ordinal ?? 0,
    parentSectionRef: overrides.parentSectionRef ?? null,
    parentNodeId: overrides.parentNodeId ?? null,
  };
}

function findingsByCode(findings: StructuralHealthFinding[], code: string): StructuralHealthFinding[] {
  return findings.filter((f) => f.code === code);
}

const TEXT = "x".repeat(2000);

describe("Fault: duplicate occurrence ID (I1/I5)", () => {
  it("two distinct StructuralNode objects forced to share nodeId - first wins, collision surfaced, never silently overwritten", () => {
    const a = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 10, charEnd: 100, nodeId: "COLLIDED_ID", heading: "First" });
    const b = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.02", charStart: 200, charEnd: 300, nodeId: "COLLIDED_ID", heading: "Second" }); // same nodeId, different everything else
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [a, b] }]]), [], []);
    const dup = findingsByCode(index.healthDiagnostics(), "DUPLICATE_OCCURRENCE_ID");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.severity).toBe("ERROR");
    // First-seen occurrence remains authoritative (by charStart sort order, "First" sorts before "Second").
    expect(index.getNodeById("COLLIDED_ID")!.heading).toBe("First");
    expect(index.allNodes()).toHaveLength(1); // "Second" was dropped, not merged - a real data-loss side effect worth noting even though it fails closed (ERROR finding raised).
  });
});

describe("Baseline (known-safe post-3F.1.2): duplicate legal label", () => {
  it("two distinct physical occurrences sharing a label persist as two nodes; resolveUniqueNodeByRef reports AMBIGUOUS, never a silent pick", () => {
    const a = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 10, charEnd: 100 });
    const b = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 200, charEnd: 300 }); // same label, different physical occurrence
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [a, b] }]]), [], []);
    expect(index.allNodes()).toHaveLength(2);
    const res = index.resolveUniqueNodeByRef("d1", "6.01");
    expect(res.status).toBe("AMBIGUOUS");
    expect(index.getNodeByRef("d1", "6.01")).toBeUndefined(); // deprecated shim is safe-by-omission
    const info = findingsByCode(index.healthDiagnostics(), "DUPLICATE_LABEL_EXPECTED");
    expect(info).toHaveLength(1);
    expect(info[0]!.severity).toBe("INFO"); // expected, non-gating
  });
});

describe("Fault: wrong parent (structurally real but semantically implausible - CLAUSE claiming ARTICLE directly, skipping SECTION/SUBSECTION)", () => {
  it("Phase 3F.1.4 FIX VERIFIED: IMPLAUSIBLE_HIERARCHY_RANK now detects a parent/child nodeType nesting distance greater than one rank", () => {
    const article = n({ documentId: "d1", nodeType: "ARTICLE", sectionRef: "6", charStart: 0, charEnd: 1000, nodeId: "art-6" });
    // A CLAUSE whose parentNodeId points directly at the ARTICLE, skipping SECTION and SUBSECTION entirely - legally nonsensical (a clause is never a direct child of an article) but structurally "valid" under every I1-I16 check (span nesting holds, parent exists, no cycle).
    const clause = n({ documentId: "d1", nodeType: "CLAUSE", sectionRef: "6.01(a)", charStart: 10, charEnd: 20, parentNodeId: "art-6", nodeId: "clause-1" });
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [article, clause] }]]), [], []);
    const health = index.healthDiagnostics();
    const errors = health.filter((f) => f.severity === "ERROR");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("IMPLAUSIBLE_HIERARCHY_RANK");
    expect(errors[0]!.nodeId).toBe("clause-1");
    // The parent/child edge itself is still real and unaltered - this fix is
    // a detection-only health signal, never a parenting/identity change (out
    // of this workstream's scope).
    expect(index.getParent(clause.nodeId)!.nodeType).toBe("ARTICLE");
  });
});

describe("Fault: missing parent (I10 orphan)", () => {
  it("parentNodeId points to a nonexistent id - flagged IMPOSSIBLE_PARENT (ERROR) and surfaced via orphans()", () => {
    const orphan = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 10, charEnd: 100, parentNodeId: "does-not-exist" });
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [orphan] }]]), [], []);
    const errs = findingsByCode(index.healthDiagnostics(), "IMPOSSIBLE_PARENT");
    expect(errs).toHaveLength(1);
    expect(errs[0]!.severity).toBe("ERROR");
    expect(index.orphans().map((o) => o.nodeId)).toEqual([orphan.nodeId]);
  });
});

describe("Fault: child attached to wrong (but real, structurally plausible) parent", () => {
  it("two SECTIONs both structurally plausible as a SUBSECTION's parent; child picks the wrong one - accepted silently as long as span nesting holds", () => {
    const parentCorrect = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 500, nodeId: "sec-601" });
    const parentWrong = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.02", charStart: 500, charEnd: 1000, nodeId: "sec-602" });
    // Child's real text position belongs under 6.01 by content, but parentNodeId was mis-assigned to 6.02.
    // To remain a health-check-passing "real but wrong" parent, its span must still nest inside 6.02's span.
    const child = n({ documentId: "d1", nodeType: "SUBSECTION", sectionRef: "6.02(a)", charStart: 600, charEnd: 650, parentNodeId: "sec-602", nodeId: "sub-1" });
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [parentCorrect, parentWrong, child] }]]), [], []);
    const errors = index.healthDiagnostics().filter((f) => f.severity === "ERROR");
    expect(errors).toHaveLength(0); // UNDETECTED: no mechanism checks "is this really the semantically intended parent," only "does the declared parent exist and geometrically contain this span."
    expect(index.getChildren("sec-601")).toHaveLength(0);
    expect(index.getChildren("sec-602")).toHaveLength(1); // wrong parent silently owns the child.
  });
});

describe("Fault: deleted section (a node removed from the array entirely)", () => {
  it("no 'gap' detection - a hole where 6.02 should be is structurally invisible; 6.03's parent/sibling relations look complete", () => {
    const article = n({ documentId: "d1", nodeType: "ARTICLE", sectionRef: "6", charStart: 0, charEnd: 1000, nodeId: "art-6" });
    const sec601 = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 10, charEnd: 300, parentNodeId: "art-6", nodeId: "sec-601" });
    // 6.02 deliberately omitted entirely (simulates a deleted/dropped section).
    const sec603 = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.03", charStart: 600, charEnd: 900, parentNodeId: "art-6", nodeId: "sec-603" });
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [article, sec601, sec603] }]]), [], []);
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
    // The gap between sec601.charEnd (300) and sec603.charStart (600) - 300 chars of "vanished" text - is never flagged.
    // getSiblings looks completely normal (two siblings, no indication a third once existed or should exist).
    expect(index.getSiblings("sec-601").map((s) => s.sectionRef)).toEqual(["6.03"]);
  });
});

describe("Fault: truncated extraction / invalid charEnd beyond text.length (I12 self-check)", () => {
  it("charEnd exceeding the document's own text length IS caught - INVALID_SOURCE_SPAN, ERROR", () => {
    const shortText = "x".repeat(50);
    const truncated = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 10, charEnd: 500 }); // charEnd far beyond shortText.length
    const index = buildStructuralIndex(new Map([["d1", { text: shortText, nodes: [truncated] }]]), [], []);
    const errs = findingsByCode(index.healthDiagnostics(), "INVALID_SOURCE_SPAN");
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(errs[0]!.severity).toBe("ERROR");
  });
});

describe("Fault: corrupted source span (charStart > charEnd, or negative)", () => {
  it("charStart > charEnd is caught (INVALID_SOURCE_SPAN)", () => {
    const bad = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 500, charEnd: 100 });
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [bad] }]]), [], []);
    expect(findingsByCode(index.healthDiagnostics(), "INVALID_SOURCE_SPAN")).toHaveLength(1);
  });

  it("negative charStart is caught (INVALID_SOURCE_SPAN)", () => {
    const bad = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: -5, charEnd: 100 });
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [bad] }]]), [], []);
    expect(findingsByCode(index.healthDiagnostics(), "INVALID_SOURCE_SPAN")).toHaveLength(1);
  });
});

describe("Fault: overlapping impossible spans between SIBLINGS (not parent/child nesting)", () => {
  it("Phase 3F.1.4 FIX VERIFIED: SIBLING_SPAN_OVERLAP now detects two sibling SUBSECTIONs under the same parent with overlapping charStart..charEnd ranges", () => {
    const parent = n({ documentId: "d1", nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 1000, nodeId: "sec-601" });
    const siblingA = n({ documentId: "d1", nodeType: "SUBSECTION", sectionRef: "6.01(a)", charStart: 100, charEnd: 400, parentNodeId: "sec-601", nodeId: "sub-a" });
    const siblingB = n({ documentId: "d1", nodeType: "SUBSECTION", sectionRef: "6.01(b)", charStart: 300, charEnd: 600, parentNodeId: "sec-601", nodeId: "sub-b" }); // overlaps siblingA's [100,400) at [300,400)
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [parent, siblingA, siblingB] }]]), [], []);
    const errors = index.healthDiagnostics().filter((f) => f.severity === "ERROR");
    // OVERLAPPING_INCOMPATIBLE_SPAN (I12) still only fires for parent/child span-containment violations, never sibling-vs-sibling overlap - that remains a materially different check.
    expect(errors.filter((f) => f.code === "OVERLAPPING_INCOMPATIBLE_SPAN")).toHaveLength(0);
    const overlapErrors = errors.filter((f) => f.code === "SIBLING_SPAN_OVERLAP");
    expect(overlapErrors).toHaveLength(1);
    expect(overlapErrors[0]!.nodeId).toBe("sub-b");
    // SOURCE_ORDER_VIOLATION still does not fire here (unchanged, correct
    // behavior): it only checks that a sibling's charStart never precedes the
    // PRECEDING sibling's charStart - siblingB.charStart(300) > siblingA.charStart(100),
    // so ascending order holds even though the spans overlap; SIBLING_SPAN_OVERLAP
    // is the correct, distinct code for THIS condition.
    expect(index.healthDiagnostics().filter((f) => f.code === "SOURCE_ORDER_VIOLATION")).toHaveLength(0);
  });
});

describe("Fault: missing definition (a term used in operative text with no DetectedDefinition anywhere)", () => {
  it("getDefinition returns undefined for an undefined term - the index itself does not flag this; a caller must independently check", () => {
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [] }]]), [], []);
    expect(index.getDefinition("nonexistent term", "d1")).toBeUndefined();
    // The structural-index layer never raises a health finding for "operative text mentions a capitalized term with no matching definition" -
    // that is coverage-audit/context-comparison.ts's job (MISSING_DEFINITION finding type), a SEPARATE, independent subsystem. Confirmed present in that file (see narrative).
  });
});

describe("Fault: wrong definition target (definition exists for a different, similarly-named term)", () => {
  it("getDefinition uses exact normalized-term match only - a similarly-named term never fuzzily resolves to the wrong definition", () => {
    const def: DetectedDefinition = { documentId: "d1", exactTerm: "Permitted Indebtedness", normalizedTerm: "permitted indebtedness", sourceNodeKey: null, sourceNodeId: null, charStart: 0, charEnd: 10, definitionExcerpt: "means ..." };
    const index = buildStructuralIndex(new Map([["d1", { text: TEXT, nodes: [] }]]), [def], []);
    expect(index.getDefinition("Permitted Indebtedness", "d1")).toBeDefined();
    expect(index.getDefinition("Permitted Liens", "d1")).toBeUndefined(); // similarly-shaped but different term - correctly NOT resolved (no fuzzy match). Good: fails closed.
  });
});

describe("Fault: cross-document definition leakage - is the documentId-scoped branch ALWAYS used?", () => {
  const defA: DetectedDefinition = { documentId: "docA", exactTerm: "Permitted Indebtedness", normalizedTerm: "permitted indebtedness", sourceNodeKey: null, sourceNodeId: "nodeA", charStart: 0, charEnd: 10, definitionExcerpt: "docA's own definition" };
  const defB: DetectedDefinition = { documentId: "docB", exactTerm: "Permitted Indebtedness", normalizedTerm: "permitted indebtedness", sourceNodeKey: null, sourceNodeId: "nodeB", charStart: 0, charEnd: 10, definitionExcerpt: "docB's OWN, DIFFERENT definition of the same term name" };

  it("WITH documentId supplied: correctly scoped, no leakage", () => {
    const index = buildStructuralIndex(new Map([["docA", { text: TEXT, nodes: [] }], ["docB", { text: TEXT, nodes: [] }]]), [defA, defB], []);
    expect(index.getDefinition("Permitted Indebtedness", "docA")!.definitionExcerpt).toBe("docA's own definition");
    expect(index.getDefinition("Permitted Indebtedness", "docB")!.definitionExcerpt).toBe("docB's OWN, DIFFERENT definition of the same term name");
  });

  it("WITHOUT documentId: the flat definitionsByNormalizedTerm map silently returns whichever document's definition was inserted LAST - real cross-document leakage if any caller omits documentId", () => {
    const index = buildStructuralIndex(new Map([["docA", { text: TEXT, nodes: [] }], ["docB", { text: TEXT, nodes: [] }]]), [defA, defB], []);
    const leaked = index.getDefinition("Permitted Indebtedness"); // no documentId - the API explicitly allows this.
    expect(leaked).toBeDefined();
    expect(leaked!.documentId).toBe("docB"); // last-definition-in-array wins; docA is invisible via this call shape.
    // getDefinitionFullText has the identical leakage shape.
    const leakedFullText = index.getDefinitionFullText("Permitted Indebtedness");
    expect(leakedFullText).toBe(TEXT.slice(0, TEXT.length)); // resolves against docB's document text, not docA's - see narrative for real callers that intentionally use this as a cross-document FALLBACK.
  });
});
