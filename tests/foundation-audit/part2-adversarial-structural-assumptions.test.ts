/**
 * Foundation Assurance Audit - Part 2: structural assumptions the 16
 * invariants do NOT cover. Every test drives the REAL production functions
 * (parseDocumentStructure / runStructureStage / buildStructuralIndex) over a
 * real, synthetic (never mocked) document. Each `describe` corresponds to one
 * numbered adversarial question from the audit brief. Findings are asserted
 * as OBSERVED BEHAVIOR (documented in comments), not silently accepted as
 * correct - a passing assertion here means "this is what the system actually
 * does," which the accompanying prose in the final report evaluates for
 * whether it constitutes a defect.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure, runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

function build(documentId: string, text: string): { index: StructuralIndex; nodes: StructuralNode[] } {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { index, nodes };
}

describe("Q1 - a malformed sibling heading is silently absorbed into the PRECEDING section's own charEnd/OWN text", () => {
  it("REPRODUCED: Section 6.02's heading fails every SECTION_PATTERNS regex (colon instead of period, single-line text so line-anchored patterns are also unavailable) -> Section 6.01's own span silently swallows all of 6.02's real prose", () => {
    // Single line (no \n) so the 3 line-anchored SECTION_PATTERNS candidates
    // (^Section...$, ^§...$, ^(\d+\.\d+)...$) can never match regardless of
    // 6.02's own heading shape - isolates the failure to pattern 1 alone.
    // Pattern 1 requires `(\d+\.\d+)\.?\s+TITLE\s*\.` - a colon immediately
    // after the number (no optional-period, no required whitespace before
    // the colon) breaks it for 6.02 specifically, while 6.01 and 6.03 keep
    // the well-formed `Section N.NN Title .` shape pattern 1 matches fine.
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Real section one prose that is genuinely 6.01's own content and nothing else. " +
      "Section 6.02: Liens . Real section two prose that should belong to its OWN section 6.02 but the heading uses a colon instead of a period after the number, which defeats every SECTION_PATTERNS regex candidate. " +
      "Section 6.03 Restricted Payments . Real section three prose, unambiguously 6.03's own.";
    expect(text.includes("\n")).toBe(false);

    const { index, nodes } = build("q1-swallowed-sibling", text);

    // OBSERVED: no node exists for "6.02" at all - Mechanism A (PARSE_COVERAGE_MISS), not an identity collision.
    expect(index.findNodesByRef("q1-swallowed-sibling", "6.02")).toHaveLength(0);
    expect(nodes.some((n) => n.sectionRef === "6.02")).toBe(false);

    const section601 = index.resolveUniqueNodeByRef("q1-swallowed-sibling", "6.01");
    const section603 = index.resolveUniqueNodeByRef("q1-swallowed-sibling", "6.03");
    expect(section601.status).toBe("UNIQUE");
    expect(section603.status).toBe("UNIQUE");
    if (section601.status !== "UNIQUE" || section603.status !== "UNIQUE") return;

    // OBSERVED (the defect): 6.01's OWN text runs all the way to 6.03's charStart -
    // it silently contains the ENTIRE malformed "6.02" heading and body, which
    // real drafting intended as a separate section's own content.
    const ownText601 = index.getNodeText(section601.node.nodeId, "OWN");
    expect(ownText601).toContain("Real section two prose that should belong to its OWN section 6.02");
    expect(ownText601).toContain("Liens");
    expect(section601.node.charEnd).toBe(section603.node.charStart);

    // Every I1-I16 identity invariant nonetheless reports clean - zero ERROR findings.
    // This is the crux of Q1: passing every identity invariant is NOT the same
    // as having materially correct boundaries.
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);

    // The mechanical top-level coverage accounting (structural-coverage.ts,
    // Part 3's subject) ALSO reports this region as fully "covered" - it
    // measures gaps BETWEEN top-level node charStarts, not whether a node's
    // own span was legitimately its own. See Q1/Part-3 cross-reference below.
    const coverage = computeStructuralCoverage("q1-swallowed-sibling", text, nodes);
    expect(coverage.significantUncoveredSpans).toHaveLength(0);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
  });
});

describe("Q2 - text/clauses meant for one section get cross-attributed to a DIFFERENT, structurally VALID, distinct occurrence", () => {
  it("REPRODUCED: when 6.02's heading fails to match (Q1's mechanism), 6.02's OWN lettered clauses become children of 6.01 - a real, valid, but WRONG parent occurrence", () => {
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness. " +
      "Section 6.02: Liens . Neither party shall grant Liens except as follows: " +
      "(a) Liens securing purchase money Indebtedness; " +
      "(b) Liens arising by operation of law. " +
      "Section 6.03 Restricted Payments . Neither party shall make Restricted Payments except as permitted.";
    const { index } = build("q2-cross-attribution", text);

    expect(index.findNodesByRef("q2-cross-attribution", "6.02")).toHaveLength(0);
    const section601 = index.resolveUniqueNodeByRef("q2-cross-attribution", "6.01");
    expect(section601.status).toBe("UNIQUE");
    if (section601.status !== "UNIQUE") return;

    // OBSERVED (the defect): the (a)/(b) clauses that a human drafter/reader
    // would unambiguously read as belonging to Section 6.02 (Liens) are
    // structurally children of Section 6.01 (Indebtedness) - a real,
    // reachable, non-orphaned, identity-valid node, just the WRONG one.
    const children = index.getChildren(section601.node.nodeId);
    expect(children.map((c) => c.sectionRef)).toEqual(["6.01(a)", "6.01(b)"]);
    expect(index.getNodeText(children[0]!.nodeId, "OWN")).toContain("Liens securing purchase money");

    // This is not flagged by any I1-I16 invariant - the attachment is
    // internally self-consistent (same region-boundary computation and the
    // same rank-based stack both agree on 6.01 as parent), so no
    // OVERLAPPING_INCOMPATIBLE_SPAN/IMPOSSIBLE_PARENT/orphan finding fires.
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
    expect(index.orphans()).toHaveLength(0);
  });
});

describe("Q3 - an intervening false-positive heading-shaped match corrupts the RANK-based stack, truncating a real section and misattaching its later real clauses", () => {
  it("REPRODUCED: an ordinary in-text cross-reference sentence that satisfies SECTION_PATTERNS (the ADR's own §2.3 Case A shape) closes the enclosing real section early and adopts its later real lettered clauses as its own children", () => {
    // "Section 6.05 Reserved ." inside 6.01's own prose matches SECTION_PATTERNS
    // pattern 1 just as well as a real heading (proven in the ADR itself as a
    // pure duplicate-nodeKey case). What the ADR's own repro did NOT check:
    // because stage-structure.ts's parent/charEnd assignment is a single
    // GLOBAL rank-based stack pass over ALL raws sorted by charStart (not
    // scoped by which section's own clause-tree call produced a given
    // clause), this spurious SECTION-rank match pops the real enclosing
    // section off the stack at its own charStart position - truncating the
    // real section's OWN span right there, and any real lettered clause
    // physically located AFTER the spurious match (but still textually and
    // drafting-wise part of the real section) attaches to the SPURIOUS node
    // instead of the real one.
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness, except as permitted under Section 6.05 Reserved . and subject to the following exceptions: " +
      "(a) Indebtedness existing on the Closing Date; " +
      "(b) intercompany Indebtedness. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { index, nodes } = build("q3-intervening-false-positive", text);

    // OBSERVED: a spurious extra top-level node for "6.05" really was created.
    const spurious = nodes.find((n) => n.sectionRef === "6.05");
    expect(spurious, "this test requires the spurious in-text 'Section 6.05 Reserved .' match to actually occur, or it is not exercising Q3's scenario").toBeDefined();

    const section601 = index.resolveUniqueNodeByRef("q3-intervening-false-positive", "6.01");
    expect(section601.status).toBe("UNIQUE");
    if (section601.status !== "UNIQUE") return;

    // OBSERVED (the defect): 6.01's real children list is EMPTY - its two
    // real lettered clauses (a)/(b), which appear later in the SAME
    // sentence's continuation, are not its children at all.
    const realChildren = index.getChildren(section601.node.nodeId);

    const spuriousNode = index.resolveUniqueNodeByRef("q3-intervening-false-positive", "6.05");
    expect(spuriousNode.status).toBe("UNIQUE");
    if (spuriousNode.status !== "UNIQUE") return;
    const spuriousChildren = index.getChildren(spuriousNode.node.nodeId);

    // Document exactly which side the (a)/(b) clauses actually land on.
    const allLetteredClauses = index.allNodes().filter((n) => n.nodeType === "SUBSECTION" || n.nodeType === "CLAUSE");
    expect(allLetteredClauses.length).toBeGreaterThan(0);
    const attachedToReal601 = realChildren.filter((c) => c.nodeType === "SUBSECTION" || c.nodeType === "CLAUSE");
    const attachedToSpurious605 = spuriousChildren.filter((c) => c.nodeType === "SUBSECTION" || c.nodeType === "CLAUSE");

    // The defect: the real section's own drafted clauses end up attached to
    // the spurious cross-reference node instead of (or possibly split from)
    // the real section - exactly the "plausible but semantically wrong
    // hierarchy, invisible to I1-I16" scenario Q3 asks about.
    expect(attachedToSpurious605.length + attachedToReal601.length).toBe(allLetteredClauses.length);
    expect(attachedToSpurious605.length, "the real (a)/(b) clauses, which belong under 6.01 by any human reading, are structurally attached to the spurious 6.05 node instead").toBeGreaterThan(0);

    // No I1-I16 invariant flags any of this - both nodes are legitimately
    // distinct, both children lists are internally self-consistent (I6
    // holds - no cross-parent MERGE occurred, only cross-parent MISattachment,
    // which is a different, uncovered failure mode).
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });
});

describe("Q3b - genuinely distinct nesting depths under two different real sections are NOT flattened/confused with each other", () => {
  it("two independent (a)/(b) lists at the same lettered depth under two DIFFERENT real sections stay correctly scoped to their own section (control case - the stack IS depth-aware per-section when no false positive intervenes)", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except:
(a) Permitted Indebtedness of the first kind;
(b) Permitted Indebtedness of the second kind.

Section 6.02 Liens . Neither party shall grant Liens except:
(a) Permitted Liens of the first kind;
(b) Permitted Liens of the second kind.
`.trim();
    const { index } = build("q3b-control-two-independent-lists", text);
    const s601 = index.resolveUniqueNodeByRef("q3b-control-two-independent-lists", "6.01");
    const s602 = index.resolveUniqueNodeByRef("q3b-control-two-independent-lists", "6.02");
    expect(s601.status).toBe("UNIQUE");
    expect(s602.status).toBe("UNIQUE");
    if (s601.status !== "UNIQUE" || s602.status !== "UNIQUE") return;
    expect(index.getChildren(s601.node.nodeId).map((c) => c.sectionRef)).toEqual(["6.01(a)", "6.01(b)"]);
    expect(index.getChildren(s602.node.nodeId).map((c) => c.sectionRef)).toEqual(["6.02(a)", "6.02(b)"]);
    // Positive control: absent a false-positive intervening match (Q3), depth/scope IS correctly distinguished per real section.
    expect(index.healthDiagnostics().filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });
});

describe("Q4 - orphan status is computed but not acted on by any production consumer", () => {
  it("grep-style static confirmation: no file under lib/contract-model/compiler/{discovery,coverage-audit,context-retrieval,amendment,semantic*} calls index.orphans() anywhere in the frozen production tree", async () => {
    const { readFileSync } = await import("node:fs");
    const { execSync } = await import("node:child_process");
    const matches = execSync(
      `grep -rl "\\.orphans(" lib/contract-model/compiler --include=*.ts || true`,
      { cwd: process.cwd(), encoding: "utf-8" }
    ).trim();
    const files = matches ? matches.split("\n").filter(Boolean) : [];
    // OBSERVED: the only production-tree definition site is structural-index.ts
    // itself (the API declaration/implementation) - no CONSUMER file calls it.
    const consumerFiles = files.filter((f) => !f.endsWith("structural-index.ts"));
    expect(consumerFiles, `orphans() is called from: ${JSON.stringify(files)} - if this list grows beyond structural-index.ts itself, re-verify this finding`).toHaveLength(0);
    void readFileSync; // referenced for potential future extension; unused here.
  });

  it("a real orphan-shaped structural anomaly produces NO distinguishable signal from ordinary absence when queried the way a normal consumer would (resolveUniqueNodeByRef/getChildren) - it just looks like nothing is there", () => {
    // Even though the real parser (Part 1 angle 5) essentially never produces
    // a TRUE orphan (parentNodeId pointing to a non-existent id), a lettered
    // clause that gets misattached to the WRONG real parent (Q3) is
    // discoverable ONLY by explicitly calling healthDiagnostics()/orphans()
    // and cross-checking - a normal consumer walking getChildren() from the
    // section it EXPECTS to own that clause will simply see it as absent,
    // indistinguishable from "this section legitimately has no such clause."
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness, except as permitted under Section 6.05 Reserved . and subject to the following: " +
      "(a) Indebtedness existing on the Closing Date. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const { index } = build("q4-silent-absence", text);
    const s601 = index.resolveUniqueNodeByRef("q4-silent-absence", "6.01");
    expect(s601.status).toBe("UNIQUE");
    if (s601.status !== "UNIQUE") return;
    // A consumer looking for "6.01's own exception clauses" via the normal API sees zero - no error, no warning, no ambiguity signal.
    const children = index.getChildren(s601.node.nodeId);
    expect(children.filter((c) => c.nodeType === "SUBSECTION")).toHaveLength(0);
    // The clause DOES exist somewhere reachable in the index (it is not a true orphan/dropped node) - just not where a normal consumer looked.
    expect(index.allNodes().some((n) => n.sectionRef.endsWith("(a)"))).toBe(true);
  });
});

describe("Q5 - structural-coverage.ts's STRUCTURE_HEALTHY verdict checks ONLY top-level span coverage, never rank/level sanity (or even node existence within a top-level span)", () => {
  it("stray lettered clauses directly under an ARTICLE (SECTION/SUBSECTION skipped) get NO structural node at all (clause-tree parsing only ever runs inside a SECTION's own region) - yet the whole malformed region is still reported STRUCTURE_HEALTHY because it falls inside the ARTICLE's own top-level span", () => {
    const text = `
ARTICLE VI COVENANTS
(a) a lettered clause directly under the ARTICLE, skipping SECTION and SUBSECTION entirely - a malformed hierarchy by any drafting convention.
(b) a second one, same malformed nesting.

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness under normal, well-formed hierarchy.
`.trim();
    const { nodes, index } = build("q5-malformed-hierarchy-healthy", text);

    // OBSERVED (stronger than merely "wrong rank"): buildClauseTree is only
    // ever invoked over a SECTION node's own text region (stage-structure.ts's
    // `for (const node of topLevel) { if (node.nodeType !== "SECTION")
    // continue; ... }`) - with NO enclosing SECTION at all, the (a)/(b)
    // markers are never even candidates for clause parsing. No CLAUSE,
    // SUBSECTION, or any other node is created for them whatsoever - this is
    // a total, silent parse-coverage miss (Mechanism A), not merely a
    // mis-ranked attachment.
    expect(nodes.filter((n) => n.nodeType === "SUBSECTION" || n.nodeType === "CLAUSE" || n.nodeType === "SUBCLAUSE")).toHaveLength(0);
    const article = nodes.find((n) => n.nodeType === "ARTICLE");
    expect(article).toBeDefined();
    expect(index.getChildren(article!.nodeId).filter((c) => c.nodeType !== "SECTION")).toHaveLength(0);

    const coverage = computeStructuralCoverage("q5-malformed-hierarchy-healthy", text, nodes);
    // OBSERVED: computeStructuralCoverage only ever inspects ARTICLE/SECTION
    // top-level spans (computeTopLevelSpans filters to exactly those two
    // nodeTypes) - "is every byte inside SOME top-level span," never "does a
    // node actually represent the finer-grained content within that span,
    // at a sane rank." The two dropped clause lines fall inside the
    // ARTICLE's own (correctly-computed) top-level span purely because the
    // ARTICLE's span runs up to the next top-level node (6.01) regardless of
    // whether anything explains the (a)/(b) text in between - so this
    // wholesale silent drop is reported as fully, healthily covered.
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
    expect(coverage.significantUncoveredSpans).toHaveLength(0);
    expect(coverage.coveragePercent).toBe(100);
  });
});

describe("Q6 - a Schedule's own numbered list is structurally indistinguishable from operative covenant body text", () => {
  it("a 'Section N' heading inside a SCHEDULE region parses to an ordinary nodeType SECTION with no marker distinguishing it from Article VI's own operative sections", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness, up to $50,000,000.

SCHEDULE I PERMITTED LIENS

Section 1 General . This Schedule sets forth Permitted Liens as of the Closing Date, up to $75,000,000.

Section 2 Specific Liens . The following specific Liens are permitted hereunder, up to $10,000,000.
`.trim();
    const { nodes } = build("q6-schedule-indistinguishable", text);
    const operative = nodes.find((n) => n.sectionRef === "6.01");
    const scheduleItem = nodes.find((n) => n.sectionRef === "1" && n.nodeType === "SECTION");
    expect(operative).toBeDefined();
    expect(scheduleItem, "the schedule's own 'Section 1 General .' heading must actually parse as a SECTION node for this test to demonstrate the ambiguity").toBeDefined();

    // OBSERVED: the two nodes are STRUCTURALLY IDENTICAL in shape - same
    // nodeType, same field set, nothing on StructuralNode itself (no
    // "isSchedule"/"regionKind" field) distinguishes "this SECTION physically
    // sits inside a Schedule" from "this SECTION is Article VI operative
    // covenant text." A dollar amount inside the Schedule item ($75,000,000,
    // $10,000,000) is textually indistinguishable, at the structural layer,
    // from a real covenant basket dollar threshold.
    expect(operative!.nodeType).toBe(scheduleItem!.nodeType);
    expect(Object.keys(operative!).sort()).toEqual(Object.keys(scheduleItem!).sort());
    // Confirm there is no separate "SCHEDULE" nodeType or region marker anywhere in the parser's own type union / output.
    const nodeTypesProduced = new Set(nodes.map((n) => n.nodeType));
    expect(nodeTypesProduced.has("SCHEDULE" as unknown as StructuralNode["nodeType"])).toBe(false);
  });
});

describe("Q7 - a Table of Contents entry, now correctly given its own distinct nodeId (post-3F.1.2), is otherwise treated exactly like a real operative section", () => {
  it("the ToC occurrence and the real operative occurrence are both ordinary, independently reachable SECTION nodes with no field flagging either as 'this looks like a ToC entry'", () => {
    const text = `
Section 6.01 Indebtedness .
Section 6.02 Liens .

ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.

Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();
    const { index } = build("q7-toc-not-flagged", text);
    const occurrences601 = index.findNodesByRef("q7-toc-not-flagged", "6.01");
    expect(occurrences601.length, "this document must produce 2 real physical '6.01' occurrences (ToC line + real heading) for this test to be meaningful").toBe(2);

    const [tocOccurrence, realOccurrence] = occurrences601.sort((a, b) => a.charStart - b.charStart);
    // OBSERVED: 3F.1.2 correctly makes both independently reachable via getNodeById/findNodesByRef -
    // this is the fix working as designed.
    expect(index.getNodeById(tocOccurrence!.nodeId)).toBeDefined();
    expect(index.getNodeById(realOccurrence!.nodeId)).toBeDefined();

    // OBSERVED (the residual gap Q7 asks about): nothing on StructuralNode
    // distinguishes the ToC occurrence from the real one - same nodeType,
    // same shape. The ToC occurrence's OWN text is genuinely near-empty
    // (just the next ToC line / blank line before the ARTICLE heading), but
    // no field says "ownTextLooksLikeAToCLine" or similar; a downstream
    // consumer iterating allNodes()/findNodesByRef and treating each
    // occurrence as "a candidate section to discover content in" (as
    // discovery/pass-a-signals.ts and coverage-audit/source-inventory.ts do -
    // both iterate index.allNodes() with no ToC/heading-density filter) would
    // process the ToC occurrence exactly like a real section.
    expect(Object.keys(tocOccurrence!).sort()).toEqual(Object.keys(realOccurrence!).sort());
    const tocOwnText = index.getNodeText(tocOccurrence!.nodeId, "OWN").trim();
    const realOwnText = index.getNodeText(realOccurrence!.nodeId, "OWN").trim();
    // The ToC occurrence's own text is drastically shorter (near-empty) - a real, cheap, MECHANICAL signal that exists in the data but that no production field surfaces as a first-class "this is probably not operative text" marker.
    expect(tocOwnText.length).toBeLessThan(realOwnText.length);
  });
});

describe("Q8 - a quoted/historical occurrence and the current occurrence are equally 'live' to any consumer that scans structural nodes directly", () => {
  it("the OLD (pre-amendment) and NEW (post-amendment) physical occurrences of the same section are both ordinary SECTION nodes with nothing marking either as superseded", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except a distribution not exceeding $5,000,000 in the aggregate (the ORIGINAL, now-superseded limit).

Section 6.20 Amendments . Section 6.04 of this Agreement is hereby amended and restated in its entirety to read in full as follows: "Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except a distribution not exceeding $25,000,000 in the aggregate (the CURRENT, amended limit)."
`.trim();
    const docId = "q8-old-vs-new-amendment-quote-doc";
    const { index } = build(docId, text);
    const occurrences = index.findNodesByRef(docId, "6.04");
    expect(occurrences.length, "this document must produce 2 real physical '6.04' occurrences (original + amended-quoted) for this test to be meaningful").toBe(2);
    const [original, amended] = occurrences.sort((a, b) => a.charStart - b.charStart);

    // OBSERVED: both are plain SECTION nodes - StructuralNode carries no
    // "supersededBy"/"isHistorical"/"isCurrentText" field at all. That
    // concept lives ONLY in the separate amendment/operative-state.ts
    // machinery (OperativeProvisionView.supersededSourceNodeIds), which is a
    // SEPARATE, opt-in pipeline stage that must itself already know about
    // the amendment effect and successfully resolve it - it is not derivable
    // from the structural index alone. Any consumer that reads
    // index.allNodes()/findNodesByRef directly (as discovery and
    // coverage-audit's source-inventory both do) sees two equally-shaped,
    // equally "live" SECTION nodes with the $5,000,000 (superseded) and
    // $25,000,000 (current) amounts both structurally present with no
    // structural-layer signal about which one currently governs.
    expect(Object.keys(original!).sort()).toEqual(Object.keys(amended!).sort());
    const originalText = index.getNodeText(original!.nodeId, "DESCENDANTS");
    const amendedText = index.getNodeText(amended!.nodeId, "DESCENDANTS");
    expect(originalText).toContain("$5,000,000");
    expect(originalText).toContain("now-superseded");
    expect(amendedText).toContain("$25,000,000");
    // No field anywhere on either node encodes "superseded" status.
    expect(JSON.stringify(original)).not.toMatch(/supersed/i);
    expect(JSON.stringify(amended)).not.toMatch(/supersed/i);
  });
});
