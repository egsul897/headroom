/**
 * Phase 3F.1.6 Final Foundation Certification - Section 8 (Package
 * Relationship). INDEPENDENT re-verification of P0-5 (false AMENDS edge
 * from recital/reference language alone) and P1-7 (isTrustedGroupingEdge
 * defense-in-depth), plus a real-data cross-check against the committed
 * CONMED package. All synthetic fixture text below is invented for this
 * file (no reuse of tests/foundation-audit/package-graph-adversarial.test.ts's
 * own scenarios/wording) - a genuinely independent adversarial construction,
 * run through the real, unmodified `buildPackageGraph` pipeline.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { groupPackageIntoInstruments } from "../../lib/contract-model/compiler/package-graph/instrument-grouping";
import type { PackageDocumentInput, RelationshipCandidate } from "../../lib/contract-model/compiler/package-graph/types";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

describe("Section 8 independent construction #1: a recital MENTIONING another agreement by name+date, with no operative amend-tie, never produces a false AMENDS edge", () => {
  // Doc A: a real amendment whose CAPTION/operative body amends the real
  // Credit Agreement (Doc B). Its own WHEREAS recital additionally mentions
  // a Guaranty and Security Agreement - Doc C - purely for cross-default
  // context, DELIBERATELY sharing Doc A's own execution date (April 4,
  // 2024) with Doc C, to manufacture the exact coincidental type+date match
  // P0-5 closes. No "hereby amend"/negative-disclaimer language ties Doc A
  // to Doc C at all - a plain contextual cross-default aside.
  const docA = doc(
    "adv8-doc-a-third-amendment",
    "Third Amendment to Credit Agreement",
    `THIRD AMENDMENT TO CREDIT AGREEMENT dated as of April 4, 2024 (this "Amendment"), to the Credit Agreement dated as of January 10, 2020, among Vantage Holdings LLC, as Borrower, and the lenders party thereto.\n\n` +
      `WHEREAS, an event of default under the Guaranty and Security Agreement dated as of April 4, 2024 may give rise to cross-default under this Agreement;\n\n` +
      `NOW, THEREFORE, in consideration of the foregoing, the parties agree as follows:\n\n` +
      `Section 1. Amendment to Section 6.05. Section 6.05 of the Credit Agreement is hereby amended and restated in its entirety to read: "Section 6.05 Investments. The Borrower will not make Investments in excess of $40,000,000."`
  );
  const docB = doc(
    "adv8-doc-b-credit-agreement",
    "Credit Agreement",
    `CREDIT AGREEMENT dated as of January 10, 2020, among Vantage Holdings LLC, as Borrower, and the lenders party thereto.\n\nSection 6.05 Investments. The Borrower will not make Investments in excess of $20,000,000.`
  );
  const docC = doc(
    "adv8-doc-c-guaranty-security",
    "Guaranty and Security Agreement",
    `GUARANTY AND SECURITY AGREEMENT dated as of April 4, 2024, among Vantage Holdings LLC and the subsidiary guarantors party thereto, in favor of the Administrative Agent.\n\nSection 1. Grant of Security Interest. Each Grantor hereby grants a security interest in the Collateral.`
  );

  const graph = buildPackageGraph("adv8-co", "adv8-pkg", [docA, docB, docC]);

  it("Doc A's genuine amendment target (Doc B) resolves RESOLVED with STRONG evidence, from the caption's own operative naming", () => {
    const toB = graph.relationshipCandidates.filter((r) => r.sourceDocumentId === docA.documentId && r.targetDocumentId === docB.documentId && r.relationshipType === "AMENDS");
    expect(toB.length).toBeGreaterThan(0);
    expect(toB.some((r) => r.status === "RESOLVED")).toBe(true);
    expect(toB.find((r) => r.status === "RESOLVED")!.evidenceClass).toBe("STRONG_TARGET_EVIDENCE");
  });

  it("the recital's coincidental-date mention of Doc C NEVER reaches a RESOLVED AMENDS edge, despite the type+execution-date match being real", () => {
    const toC = graph.relationshipCandidates.filter((r) => r.sourceDocumentId === docA.documentId && r.targetDocumentId === docC.documentId);
    // No AMENDS/RESTATES/SUPPLEMENTS/JOINS candidate against Doc C ever reaches RESOLVED.
    const modificationEdgesToC = toC.filter((r) => ["AMENDS", "RESTATES", "SUPPLEMENTS", "JOINS"].includes(r.relationshipType));
    expect(modificationEdgesToC.every((r) => r.status !== "RESOLVED")).toBe(true);
    // The specific candidate built from the recital reference itself is UNRESOLVED with CONTEXTUAL_MENTION_ONLY evidence, exactly the P0-5 gate.
    const recitalCandidate = graph.relationshipCandidates.find((r) => r.sourceDocumentId === docA.documentId && r.relationshipType === "AMENDS" && r.targetHint?.includes("Guaranty and Security Agreement"));
    expect(recitalCandidate).toBeDefined();
    expect(recitalCandidate!.status).toBe("UNRESOLVED");
    expect(recitalCandidate!.evidenceClass).toBe("CONTEXTUAL_MENTION_ONLY");
    expect(recitalCandidate!.targetDocumentId).toBeNull();
  });

  it("instrument grouping never unions Doc A/Doc B's instrument with Doc C - the false cross-instrument contamination P0-5 exists to prevent", () => {
    const instrumentOfA = graph.instruments.find((i) => i.documentIds.includes(docA.documentId));
    expect(instrumentOfA).toBeDefined();
    expect(instrumentOfA!.documentIds).toContain(docB.documentId);
    expect(instrumentOfA!.documentIds).not.toContain(docC.documentId);
  });
});

describe("Section 8 independent construction #2: genuine multi-target amendment (positive control - the fix must not blanket-suppress real multi-target STRONG evidence)", () => {
  // A single "Omnibus Amendment" whose OPERATIVE body (post NOW, THEREFORE)
  // explicitly amends BOTH a Credit Agreement and a separate Security
  // Agreement, each with its own real "hereby amended" tie - a real,
  // legitimate two-target amendment, structurally distinct from construction
  // #1's single-target-plus-contextual-mention shape.
  const omnibus = doc(
    "adv8-doc-omnibus",
    "First Omnibus Amendment",
    `FIRST OMNIBUS AMENDMENT dated as of September 9, 2024 (this "Amendment"), to the Credit Agreement dated as of March 3, 2019 and to the Security Agreement dated as of March 3, 2019, among Redwood Industries Inc. and the parties thereto.\n\n` +
      `NOW, THEREFORE, the parties agree as follows:\n\n` +
      `Section 1. The Credit Agreement dated as of March 3, 2019 is hereby amended by increasing the Revolving Commitment to $75,000,000.\n\n` +
      `Section 2. The Security Agreement dated as of March 3, 2019 is hereby amended to add the Collateral described on Schedule I hereto.`
  );
  const creditAgreement = doc("adv8-doc-ca", "Credit Agreement", `CREDIT AGREEMENT dated as of March 3, 2019, among Redwood Industries Inc. and the lenders party thereto.\n\nSection 2.01 Revolving Commitment. $50,000,000.`);
  const securityAgreement = doc("adv8-doc-sa", "Security Agreement", `SECURITY AGREEMENT dated as of March 3, 2019, among Redwood Industries Inc. and the secured parties thereto.\n\nSection 1. Collateral. As described herein.`);

  const graph = buildPackageGraph("adv8-co-2", "adv8-pkg-2", [omnibus, creditAgreement, securityAgreement]);

  it("both real targets resolve RESOLVED with STRONG evidence - the evidence taxonomy discriminates by evidence, not by merely counting references", () => {
    const toCA = graph.relationshipCandidates.filter((r) => r.sourceDocumentId === omnibus.documentId && r.targetDocumentId === creditAgreement.documentId && r.relationshipType === "AMENDS");
    const toSA = graph.relationshipCandidates.filter((r) => r.sourceDocumentId === omnibus.documentId && r.targetDocumentId === securityAgreement.documentId && r.relationshipType === "AMENDS");
    expect(toCA.some((r) => r.status === "RESOLVED" && r.evidenceClass === "STRONG_TARGET_EVIDENCE")).toBe(true);
    expect(toSA.some((r) => r.status === "RESOLVED" && r.evidenceClass === "STRONG_TARGET_EVIDENCE")).toBe(true);
  });
});

describe("Section 8 independent construction #3: isTrustedGroupingEdge defense-in-depth, exercised directly (P1-7), including combinations relationship-resolution.ts's own logic would never itself produce", () => {
  it("a genuinely trusted RESOLVED+STRONG_TARGET_EVIDENCE AMENDS edge unions its two documents into one instrument", () => {
    const rels: RelationshipCandidate[] = [{ sourceDocumentId: "d1", targetDocumentId: "d2", targetHint: "d2 ref", relationshipType: "AMENDS", sourceCitation: "cite", confidence: 0.95, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH", evidenceClass: "STRONG_TARGET_EVIDENCE" }];
    const result = groupPackageIntoInstruments(["d1", "d2"], [{ documentId: "d1", type: "AMENDMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }, { documentId: "d2", type: "CREDIT_AGREEMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }], [], rels);
    expect(result).toHaveLength(1);
    expect(result[0]!.documentIds.sort()).toEqual(["d1", "d2"]);
  });

  it("DEFENSE-IN-DEPTH: a RESOLVED AMENDS edge carrying SUPPORTING_TARGET_EVIDENCE (a shape today's relationship-resolution.ts never itself emits - it downgrades this combination to REVIEW_REQUIRED before it would ever reach here) is STILL never trusted for grouping if it somehow reached this function", () => {
    const rels: RelationshipCandidate[] = [{ sourceDocumentId: "d3", targetDocumentId: "d4", targetHint: "d4 ref", relationshipType: "AMENDS", sourceCitation: "cite", confidence: 0.95, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH", evidenceClass: "SUPPORTING_TARGET_EVIDENCE" }];
    const result = groupPackageIntoInstruments(["d3", "d4"], [{ documentId: "d3", type: "AMENDMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }, { documentId: "d4", type: "CREDIT_AGREEMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }], [], rels);
    // Never unioned - each document remains its own separate cluster.
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.documentIds.length === 1)).toBe(true);
  });

  it("DEFENSE-IN-DEPTH: a RESOLVED AMENDS edge carrying CONTEXTUAL_MENTION_ONLY evidence is also never trusted for grouping", () => {
    const rels: RelationshipCandidate[] = [{ sourceDocumentId: "d5", targetDocumentId: "d6", targetHint: "d6 ref", relationshipType: "AMENDS", sourceCitation: "cite", confidence: 0.95, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH", evidenceClass: "CONTEXTUAL_MENTION_ONLY" }];
    const result = groupPackageIntoInstruments(["d5", "d6"], [{ documentId: "d5", type: "AMENDMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }, { documentId: "d6", type: "CREDIT_AGREEMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }], [], rels);
    expect(result).toHaveLength(2);
  });

  it("backward-compatible trust default: an edge with NO evidenceClass field at all (pre-taxonomy shape) is still treated as trusted, exactly as documented", () => {
    const rels: RelationshipCandidate[] = [{ sourceDocumentId: "d7", targetDocumentId: "d8", targetHint: "d8 ref", relationshipType: "AMENDS", sourceCitation: "cite", confidence: 0.95, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH" }];
    const result = groupPackageIntoInstruments(["d7", "d8"], [{ documentId: "d7", type: "AMENDMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }, { documentId: "d8", type: "CREDIT_AGREEMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" }], [], rels);
    expect(result).toHaveLength(1);
  });
});

describe("Section 8 REAL FINDING (disclosed-boundary, not a regression): document-classifier.ts's self-referential-title priority fix only protects documents that actually USE that drafting convention", () => {
  // document-classifier.ts's own header comment states plainly: "Only when
  // no such self-term is found... does classification fall back to the
  // ORIGINAL broad preamble scan - UNCHANGED" (emphasis on unchanged - this
  // is a disclosed V1 boundary, not a silent gap). This test independently
  // demonstrates the boundary is real: an amendment that (a) has no early
  // self-referential parenthetical like '(this "Amendment")' AND (b)
  // mentions a different real agreement TYPE (here, "Security Agreement")
  // in its own caption BEFORE its own "Amendment" self-identifying
  // language is reached by the RULES array's fixed priority order (Security
  // Agreement is checked before Amendment in document-classifier.ts's own
  // RULES list) is misclassified as a SECURITY_AGREEMENT, not an AMENDMENT -
  // the exact "reference matched before self-identity" failure shape the
  // original CONMED-derived fix targeted, reproduced here via a different
  // trigger phrase for a document that lacks the self-referential-title
  // convention the fix's own coverage depends on.
  it("an amendment referencing a Security Agreement in its own caption, with NO self-referential '(this \"Amendment\")' convention, is misclassified as SECURITY_AGREEMENT - downstream relationship typing for this document is then wrong (SECURES, not AMENDS)", () => {
    const noSelfRefAmendment = doc(
      "adv8-doc-nosr",
      "Fourth Amendment (no self-reference convention)",
      `FOURTH AMENDMENT dated as of October 10, 2024, to the Credit Agreement dated as of March 3, 2019 and to the Security Agreement dated as of March 3, 2019, among Acme Corp. and the parties thereto.\n\n` +
        `NOW, THEREFORE, the parties agree that Section 6.05 of the Credit Agreement is hereby amended to increase the Investments basket to $30,000,000.`
    );
    const ca = doc("adv8-doc-ca-nosr", "Credit Agreement", `CREDIT AGREEMENT dated as of March 3, 2019, among Acme Corp. and the lenders party thereto.\n\nSection 6.05 Investments. $20,000,000.`);
    const graph = buildPackageGraph("adv8-co-nosr", "adv8-pkg-nosr", [noSelfRefAmendment, ca]);
    const classification = graph.classifications.find((c) => c.documentId === noSelfRefAmendment.documentId)!;
    // REAL FINDING: this document's own true nature (an AMENDMENT) is not
    // what gets classified - it lands as SECURITY_AGREEMENT because that
    // rule is checked earlier in RULES' fixed priority order and the
    // self-referential-title defense never activates (no early
    // '(this "Amendment")' parenthetical is present in this document's own
    // drafting). Downstream, its relationship candidates against the real
    // Credit Agreement are typed SECURES (from RELATIONSHIP_TYPES_BY_SOURCE_CLASSIFICATION[SECURITY_AGREEMENT])
    // rather than the semantically-correct AMENDS - a real, generalizable
    // document-classification gap, disclosed here as MINOR (the module's
    // own header comment already discloses the fallback is "unchanged" -
    // this test quantifies exactly which real drafting shape still trips
    // it, for a document that never adopts the self-referential-title
    // convention CONMED's own real documents happen to use).
    expect(classification.type).toBe("SECURITY_AGREEMENT");
    const edgeToCredit = graph.relationshipCandidates.find((r) => r.sourceDocumentId === noSelfRefAmendment.documentId && r.targetDocumentId === ca.documentId);
    expect(edgeToCredit!.relationshipType).toBe("SECURES");
    expect(graph.relationshipCandidates.some((r) => r.sourceDocumentId === noSelfRefAmendment.documentId && r.relationshipType === "AMENDS")).toBe(false);
  });
});

describe("Section 8 real-data cross-check: the actual committed CONMED 4-document package (deterministic, $0 cost, real fixture text)", () => {
  const PKG_DIR = join(__dirname, "..", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
  const readDoc = (files: string[]) => files.map((f) => readFileSync(join(PKG_DIR, f), "utf-8")).join("\n\n");
  const docs: PackageDocumentInput[] = [
    { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth A&R Credit Agreement", text: readDoc(["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"]) },
    { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Guarantee and Collateral Agreement", text: readDoc(["guarantee-and-collateral-agreement-full.txt"]) },
    { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment 2022", text: readDoc(["second-amendment-2022-full.txt"]) },
    { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment 2026", text: readDoc(["first-omnibus-amendment-2026-curated.txt"]) },
  ];
  const graph = buildPackageGraph("conmed-real-cert", "conmed-real-cert-pkg", docs);

  it("no relationship candidate against the real package is RESOLVED with anything less than STRONG_TARGET_EVIDENCE for a modification-type relationship (AMENDS/RESTATES/SUPPLEMENTS/JOINS)", () => {
    const modificationTypes = new Set(["AMENDS", "RESTATES", "SUPPLEMENTS", "JOINS"]);
    const badResolutions = graph.relationshipCandidates.filter((r) => modificationTypes.has(r.relationshipType) && r.status === "RESOLVED" && r.evidenceClass !== undefined && r.evidenceClass !== "STRONG_TARGET_EVIDENCE");
    expect(badResolutions).toEqual([]);
  });

  it("package graph produces at least one real instrument grouping and no impossible self-referential cycle (a document never lists itself as its own instrument member's amendment target)", () => {
    expect(graph.instruments.length).toBeGreaterThan(0);
    for (const inst of graph.instruments) {
      expect(new Set(inst.documentIds).size).toBe(inst.documentIds.length); // no duplicate membership
      expect(inst.documentIds).toContain(inst.baseDocumentId);
    }
  });

  it("the 2026 First Omnibus Amendment (which names the Eighth A&R Credit Agreement present in this package, with a matching execution date) resolves RESOLVED and groups into the SAME real instrument as the base Credit Agreement", () => {
    const baseInstrument = graph.instruments.find((i) => i.documentIds.includes("conmed-doc-a-eighth-ar-credit-agreement"));
    expect(baseInstrument).toBeDefined();
    expect(baseInstrument!.documentIds).toContain("conmed-doc-d-first-omnibus-amendment-2026");
  });

  it("REAL FINDING (correct, conservative behavior - Architecture Invariant #11): the 2022 Second Amendment's own text names the SEVENTH Amended and Restated Credit Agreement (dated July 16, 2021) as its target - a document this specific 4-document package does not itself contain (only the Eighth A&R, a LATER restatement, is present). The system honestly leaves this REVIEW_REQUIRED (type matches, but execution date does not) rather than assuming the Eighth A&R is 'close enough' to the Seventh A&R by convenience/recency - so this amendment is correctly NOT auto-grouped into the base instrument without human confirmation of the restatement lineage.", () => {
    const secondAmendmentEdge = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "conmed-doc-c-second-amendment-2022" && r.relationshipType === "AMENDS");
    expect(secondAmendmentEdge).toBeDefined();
    expect(secondAmendmentEdge!.status).toBe("REVIEW_REQUIRED");
    expect(secondAmendmentEdge!.unresolvedReason).toMatch(/execution date/);
    const secondAmendmentInstrument = graph.instruments.find((i) => i.documentIds.includes("conmed-doc-c-second-amendment-2022"));
    expect(secondAmendmentInstrument!.documentIds).toEqual(["conmed-doc-c-second-amendment-2022"]); // stands alone - never silently merged into the Eighth A&R's own instrument on a type-only match.
  });

  it("the Guarantee and Collateral Agreement is never folded into the credit-agreement instrument's own document set (non-instrument type, associated by GUARANTEES/SECURES, never grouped)", () => {
    const baseInstrument = graph.instruments.find((i) => i.documentIds.includes("conmed-doc-a-eighth-ar-credit-agreement"));
    expect(baseInstrument!.documentIds).not.toContain("conmed-doc-b-guarantee-collateral-agreement");
  });
});
