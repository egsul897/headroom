/**
 * Phase 3F.1.6.RX Workstream D - BLOCKER-8 + AUDIT-F4: CLAIM IDENTITY V2.
 *
 * AUDIT-F4 froze the residual gap the prior BLOCKER-8 fix
 * (docs/phase-3f1-6-r-blocker-remediation/11-claim-identity-remediation.json)
 * explicitly disclosed but did not close: "SAME FAMILY + SAME ROLE + SAME
 * SOURCE NODE DOES NOT IMPLY SAME CLAIM." This file builds and runs the
 * full 9-case adversarial matrix this workstream's own task charter
 * requires (docs/phase-3f1-6-rx-final-blocker-closure/06-claim-identity-v2.json),
 * through the REAL production functions - runPassCNeighborhoodExpansion /
 * runPassDReconciliation (discoveryId/candidateRef) and
 * hypothesizeUnitsForDocument (semanticUnitId) - never re-derived
 * stand-ins, matching every prior claim-identity test file's own
 * discipline (tests/contract-model/claim-identity-blocker8-remediation.test.ts,
 * tests/foundation-audit/section15-claim-identity-adversarial.ts).
 *
 * Every case is numbered exactly as the task's own required matrix names
 * it, so this file's own test names double as the matrix's evidence trail.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { hypothesizeUnitsForDocument } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";
import { runPassCNeighborhoodExpansion } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { extractGroundedValueAnchors, extractValueAnchors, verifyDistinguishingQuote } from "../../lib/contract-model/compiler/value-anchors";
import type { SemanticRuleItem } from "../../lib/contract-model/compiler/discovery/pass-b-semantic";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";

function indexFor(doc: CompilerDocumentInput) {
  const nodes = parseDocumentStructure(doc);
  const nodesByDocument = new Map([[doc.documentId, { text: doc.text, nodes }]]);
  return buildStructuralIndex(nodesByDocument, [], []);
}

function rule(overrides: Partial<SemanticRuleItem>): SemanticRuleItem {
  return {
    relativeRef: "",
    families: [],
    role: "OTHER_RELEVANT_RULE",
    roleRaw: "OTHER_RELEVANT_RULE",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test rule",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    confidence: 0.8,
    needsReview: false,
    ...overrides,
  };
}

/** Real production discoveryId function, never a re-derived stand-in. */
function discover(documentId: string, text: string, sectionRef: string, items: SemanticRuleItem[]) {
  const index = indexFor({ documentId, label: documentId, text });
  const section = index.getNodeByRef(documentId, sectionRef)!;
  const { candidates, discoveryId } = runPassCNeighborhoodExpansion(index, documentId, section.nodeId, sectionRef, items, "v1");
  const { candidates: reconciled } = runPassDReconciliation({
    documentId,
    discoveryRunVersion: "v1",
    expanded: candidates,
    discoveryId,
    deterministicByNodeId: new Map(),
  });
  return { index, reconciled };
}

function unitsFor(documentId: string, text: string) {
  const index = indexFor({ documentId, label: documentId, text });
  const routing = routeDocument(documentId, index);
  return hypothesizeUnitsForDocument(routing, index, CTX);
}

const CTX = { companyId: "c", packageKey: "p", instrumentKey: null, operativeVersionRef: null };

// ---------------------------------------------------------------------------
// Unit-level sanity checks on the shared value-anchors utility itself
// ---------------------------------------------------------------------------

describe("value-anchors.ts: canonicalization is formatting-invariant (case 9 building block)", () => {
  it("currency: $50,000,000 / $50 million / $50MM all canonicalize to the identical anchor", () => {
    expect(extractValueAnchors("a basket of $50,000,000")).toEqual(["usd:50000000"]);
    expect(extractValueAnchors("a basket of $50 million")).toEqual(["usd:50000000"]);
    expect(extractValueAnchors("a basket of $50MM")).toEqual(["usd:50000000"]);
  });

  it("percentage and ratio canonicalize independent of decimal formatting", () => {
    expect(extractValueAnchors("5% of Consolidated EBITDA")).toEqual(["pct:5"]);
    expect(extractValueAnchors("5.0% of Consolidated EBITDA")).toEqual(["pct:5"]);
    expect(extractValueAnchors("a ratio of 3.00 to 1.00")).toEqual(["ratio:3"]);
    expect(extractValueAnchors("a ratio of 3:1.00")).toEqual(["ratio:3"]);
  });

  it("grounding: a value only in the candidate text (never in real source) is discarded, never trusted", () => {
    const grounded = extractGroundedValueAnchors("a hallucinated $99,000,000 basket", "the real source text says $50,000,000 only");
    expect(grounded).toEqual([]);
  });

  it("grounding: a value present in BOTH candidate text and real source verifies", () => {
    const grounded = extractGroundedValueAnchors("a $50,000,000 basket", "Indebtedness not to exceed $50,000,000 in the aggregate");
    expect(grounded).toEqual(["usd:50000000"]);
  });

  it("verifyDistinguishingQuote: rejects an unverifiable (not actually in source) quote", () => {
    expect(verifyDistinguishingQuote("this text is not in the source", "Indebtedness under the Revolving Facility")).toBeNull();
  });

  it("verifyDistinguishingQuote: rejects a too-short quote even if it does substring-match (avoids generic-word false positives)", () => {
    expect(verifyDistinguishingQuote("the Company", "the Company shall not incur Indebtedness")).toBeNull();
  });

  it("verifyDistinguishingQuote: accepts a genuine verbatim quote, whitespace-normalized", () => {
    expect(verifyDistinguishingQuote("Indebtedness   under the\nRevolving Facility", "...may incur Indebtedness under the Revolving Facility...")).toBe("indebtedness under the revolving facility");
  });
});

// ---------------------------------------------------------------------------
// CASE 1: two Indebtedness baskets in the same sentence (the exact
// motivating example: $50m acquisition debt + $25m working-capital debt)
// ---------------------------------------------------------------------------

describe("CASE 1: two INDEBTEDNESS baskets, same sentence, different dollar amounts", () => {
  const text = "Section 6.11. Indebtedness. Indebtedness in an aggregate principal amount not to exceed $50,000,000 to finance Permitted Acquisitions, or Indebtedness in an aggregate principal amount not to exceed $25,000,000 for working capital purposes, shall be permitted.";

  it("discovery layer: 2 distinct discoveryIds (grounded value anchors from description, zero Pass B schema dependency)", () => {
    const { reconciled } = discover("case1-disc", text, "6.11", [
      rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "$50,000,000 acquisition debt basket" }),
      rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "$25,000,000 working-capital debt basket" }),
    ]);
    expect(new Set(reconciled.map((c) => c.discoveryId)).size).toBe(2);
  });

  it("coverage layer: 2 distinct semanticUnitIds via findCoordinateClauseSplit's same-family value-anchor generalization", () => {
    const units = unitsFor("case1-cov", text);
    const indebtednessUnits = units.filter((u) => u.family === "INDEBTEDNESS");
    expect(indebtednessUnits.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(indebtednessUnits.map((u) => u.semanticUnitId));
    expect(ids.size).toBe(indebtednessUnits.length);
    expect(indebtednessUnits.some((u) => u.excerptText.includes("50,000,000"))).toBe(true);
    expect(indebtednessUnits.some((u) => u.excerptText.includes("25,000,000"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CASE 2: two Lien baskets in the same sentence
// ---------------------------------------------------------------------------

describe("CASE 2: two LIENS baskets, same sentence, different dollar amounts", () => {
  const text = "Section 6.12. Liens. Liens securing Indebtedness not to exceed $15,000,000 incurred to finance the acquisition of fixed assets, or Liens securing Indebtedness not to exceed $5,000,000 incurred in the ordinary course of business, shall be permitted.";

  it("discovery layer: 2 distinct discoveryIds", () => {
    const { reconciled } = discover("case2-disc", text, "6.12", [
      rule({ relativeRef: "", role: "BASKET", families: ["LIENS"], description: "$15,000,000 fixed-asset lien basket" }),
      rule({ relativeRef: "", role: "BASKET", families: ["LIENS"], description: "$5,000,000 ordinary-course lien basket" }),
    ]);
    expect(new Set(reconciled.map((c) => c.discoveryId)).size).toBe(2);
  });

  it("coverage layer: 2 distinct semanticUnitIds", () => {
    const units = unitsFor("case2-cov", text);
    const liensUnits = units.filter((u) => u.family === "LIENS");
    expect(liensUnits.length).toBeGreaterThanOrEqual(2);
    expect(new Set(liensUnits.map((u) => u.semanticUnitId)).size).toBe(liensUnits.length);
  });
});

// ---------------------------------------------------------------------------
// CASE 3: two Restricted Payment baskets, same family
// ---------------------------------------------------------------------------

describe("CASE 3: two RESTRICTED_PAYMENTS baskets, same sentence, different dollar amounts", () => {
  const text = "Section 6.13. Restricted Payments. Restricted Payments in an aggregate amount not to exceed $8,000,000 to pay dividends on common stock, or Restricted Payments in an aggregate amount not to exceed $2,000,000 to redeem Equity Interests, shall be permitted.";

  it("discovery layer: 2 distinct discoveryIds", () => {
    const { reconciled } = discover("case3-disc", text, "6.13", [
      rule({ relativeRef: "", role: "BASKET", families: ["RESTRICTED_PAYMENTS"], description: "$8,000,000 dividend basket" }),
      rule({ relativeRef: "", role: "BASKET", families: ["RESTRICTED_PAYMENTS"], description: "$2,000,000 redemption basket" }),
    ]);
    expect(new Set(reconciled.map((c) => c.discoveryId)).size).toBe(2);
  });

  it("coverage layer: 2 distinct semanticUnitIds", () => {
    const units = unitsFor("case3-cov", text);
    const rpUnits = units.filter((u) => u.family === "RESTRICTED_PAYMENTS");
    expect(rpUnits.length).toBeGreaterThanOrEqual(2);
    expect(new Set(rpUnits.map((u) => u.semanticUnitId)).size).toBe(rpUnits.length);
  });
});

// ---------------------------------------------------------------------------
// CASE 4: a chapeau clause plus a SAME-FAMILY exception clause
// ---------------------------------------------------------------------------

describe("CASE 4: chapeau (GENERAL_PROHIBITION) + same-family exception (EXCEPTION), fused, no sub-ref", () => {
  it("discovery layer: role is already an independent identity dimension - a same-family chapeau and exception never collide even with no distinguishing value/quote", () => {
    const text = "Section 6.14. Indebtedness. The Company shall not incur Indebtedness, except Indebtedness incurred under the Working Capital Facility.";
    const { reconciled } = discover("case4-disc", text, "6.14", [
      rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["INDEBTEDNESS"], description: "chapeau: no Indebtedness generally" }),
      rule({ relativeRef: "", role: "EXCEPTION", families: ["INDEBTEDNESS"], description: "exception: Working Capital Facility Indebtedness permitted" }),
    ]);
    const ids = new Set(reconciled.filter((c) => c.description.startsWith("chapeau") || c.description.startsWith("exception")).map((c) => c.discoveryId));
    expect(ids.size).toBe(2);
  });

  it("coverage layer regression guard (enumerated shape): chapeau + 2 same-family exception children remain 3 distinct units", () => {
    // Reuses the existing enumerated chapeau-vs-child mechanism (unaffected by this workstream's
    // change) - both exception items and the chapeau classify to the SAME family via headingHint.
    const text = "Section 6.04. Restricted Payments. The Company shall not make Restricted Payments, except: (a) dividends up to $500,000 per year; (b) redemptions of Equity Interests.";
    const units = unitsFor("case4-cov", text);
    expect(units).toHaveLength(3);
    expect(new Set(units.map((u) => u.family))).toEqual(new Set(["RESTRICTED_PAYMENTS"]));
    expect(new Set(units.map((u) => u.semanticUnitId)).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// CASE 5: identical dollar value, different object
// ---------------------------------------------------------------------------

describe("CASE 5: identical dollar value ($10,000,000), different object/family (Indebtedness vs Investments)", () => {
  const text = "Section 6.15. Basket. The Company may incur Indebtedness not to exceed $10,000,000, or make Investments not to exceed $10,000,000, in either case in any fiscal year.";

  it("discovery layer: families already distinguish these - identical value never causes a false merge", () => {
    const { reconciled } = discover("case5-disc", text, "6.15", [
      rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "$10,000,000 of Indebtedness" }),
      rule({ relativeRef: "", role: "BASKET", families: ["INVESTMENTS"], description: "$10,000,000 of Investments" }),
    ]);
    expect(new Set(reconciled.map((c) => c.discoveryId)).size).toBe(2);
  });

  it("coverage layer: cross-family split still fires even though both sides share the identical dollar value", () => {
    const units = unitsFor("case5-cov", text);
    const relevant = units.filter((u) => u.family === "INDEBTEDNESS" || u.family === "INVESTMENTS");
    expect(relevant.length).toBeGreaterThanOrEqual(2);
    expect(new Set(relevant.map((u) => u.family))).toEqual(new Set(["INDEBTEDNESS", "INVESTMENTS"]));
    expect(new Set(relevant.map((u) => u.semanticUnitId)).size).toBe(relevant.length);
  });
});

// ---------------------------------------------------------------------------
// CASE 6: identical action, different (numeric) conditions
// ---------------------------------------------------------------------------

describe("CASE 6: identical action ('may incur Indebtedness'), different numeric-gated conditions, fused with no sub-ref", () => {
  // The right-hand clause deliberately does NOT restate "may" (real drafting convention - the modal
  // verb governs both clauses via the initial "may... or..." construction) so this exercises the
  // genuine coordinate-clause split path rather than the RIGHT_CLAUSE_RESTATES_MODAL guard (which
  // exists for a DIFFERENT shape - "shall not, and shall not permit... to" restating the SAME
  // obligation's subject, not a second independent permission).
  const text = "Section 6.16. Indebtedness. The Company may incur Indebtedness if the Leverage Ratio does not exceed 3.00 to 1.00, or incur Indebtedness if the Fixed Charge Coverage Ratio is not less than 1.50 to 1.00.";

  it("discovery layer: 2 distinct discoveryIds (grounded ratio anchors differ)", () => {
    const { reconciled } = discover("case6-disc", text, "6.16", [
      rule({ relativeRef: "", role: "PERMISSION", families: ["INDEBTEDNESS"], description: "Indebtedness permitted at 3.00 to 1.00 Leverage Ratio" }),
      rule({ relativeRef: "", role: "PERMISSION", families: ["INDEBTEDNESS"], description: "Indebtedness permitted at 1.50 to 1.00 Fixed Charge Coverage Ratio" }),
    ]);
    expect(new Set(reconciled.map((c) => c.discoveryId)).size).toBe(2);
  });

  it("coverage layer: 2 distinct semanticUnitIds (same-family value-disjoint split fires on the differing ratio)", () => {
    const units = unitsFor("case6-cov", text);
    const indebtednessUnits = units.filter((u) => u.family === "INDEBTEDNESS");
    expect(indebtednessUnits.length).toBeGreaterThanOrEqual(2);
    expect(new Set(indebtednessUnits.map((u) => u.semanticUnitId)).size).toBe(indebtednessUnits.length);
  });

  it("pre-existing shape (sub-refs present) still passes unaffected - regression guard", () => {
    const textWithRefs = "Section 6.08. Restricted Payments. (a) The Company may pay dividends if no Default has occurred. (b) The Company may pay dividends if the Leverage Ratio is below 3.00:1.00.";
    const { reconciled } = discover("case6-subref", textWithRefs, "6.08", [
      rule({ relativeRef: "(a)", role: "PERMISSION", description: "dividends conditioned on no default" }),
      rule({ relativeRef: "(b)", role: "PERMISSION", description: "dividends conditioned on leverage ratio" }),
    ]);
    expect(new Set(reconciled.filter((c) => c.role === "PERMISSION").map((c) => c.discoveryId)).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CASE 7: identical text in TWO DIFFERENT PHYSICAL source occurrences - must
// NOT collapse, since they are genuinely distinct claims (different source
// locations).
// ---------------------------------------------------------------------------

describe("CASE 7: identical boilerplate basket language repeated in two different sections - distinct claims, must not collapse", () => {
  const boilerplate = "Indebtedness in an aggregate principal amount not to exceed $5,000,000 shall be permitted.";

  it("discovery layer: same document, two different sections with byte-identical text and description -> 2 distinct discoveryIds (documentId+normalizedSourceRef already distinguishes physical occurrence)", () => {
    const text = `Section 6.17. First Basket. ${boilerplate}\n\nSection 6.18. Second Basket. ${boilerplate}`;
    const index = indexFor({ documentId: "case7-disc", label: "case7-disc", text });
    const sectionA = index.getNodeByRef("case7-disc", "6.17")!;
    const sectionB = index.getNodeByRef("case7-disc", "6.18")!;
    const itemA = rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "$5,000,000 basket (first occurrence)" });
    const itemB = rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "$5,000,000 basket (second occurrence)" });
    const expA = runPassCNeighborhoodExpansion(index, "case7-disc", sectionA.nodeId, "6.17", [itemA], "v1");
    const expB = runPassCNeighborhoodExpansion(index, "case7-disc", sectionB.nodeId, "6.18", [itemB], "v1");
    const idA = expA.discoveryId(expA.candidates[0]!);
    const idB = expB.discoveryId(expB.candidates[0]!);
    expect(idA).not.toBe(idB);
  });

  it("coverage layer: identical text in two different documents never collides (documentId is part of the anchor key)", () => {
    const textA = `Section 6.17. First Basket. ${boilerplate}`;
    const textB = `Section 6.18. Second Basket. ${boilerplate}`;
    const unitsA = unitsFor("case7-cov-a", textA);
    const unitsB = unitsFor("case7-cov-b", textB);
    const idsA = new Set(unitsA.map((u) => u.semanticUnitId));
    const idsB = new Set(unitsB.map((u) => u.semanticUnitId));
    expect([...idsA].some((id) => idsB.has(id))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CASE 8: the exact same true claim independently detected TWICE by
// different pipeline stages (a genuine duplicate) - MUST still deduplicate.
// ---------------------------------------------------------------------------

describe("CASE 8: genuine duplicate detection of the SAME real claim, worded differently by two independent detections - must still merge (no identity explosion)", () => {
  it("discovery layer: two detections of the same $50,000,000 basket, differently worded/formatted, still merge into ONE candidate", () => {
    const text = "Section 6.19. Indebtedness. Indebtedness in an aggregate principal amount not to exceed $50,000,000 shall be permitted.";
    const { reconciled } = discover("case8-disc", text, "6.19", [
      rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "up to $50,000,000 of Indebtedness permitted" }),
      rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "a basket of $50 million for Indebtedness" }),
    ]);
    expect(reconciled).toHaveLength(1);
    expect(new Set(reconciled.map((c) => c.discoveryId)).size).toBe(1);
  });

  it("discovery layer: two detections with NO numeric value at all (the pre-existing scenario-18 shape) still merge - value-anchor addition never regresses the families-only duplicate path", () => {
    const index = indexFor({ documentId: "case8b", label: "case8b", text: "Section 6.01. Indebtedness. Except: (a) up to a basket." });
    const section = index.getNodeByRef("case8b", "6.01")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "BASKET" }), rule({ relativeRef: "(a)", role: "BASKET", description: "second, overlapping signal for the same basket" })];
    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, "case8b", section.nodeId, "6.01", items, "v1");
    const { candidates: reconciled, duplicatesBeforeReconciliation } = runPassDReconciliation({ documentId: "case8b", discoveryRunVersion: "v1", expanded, discoveryId, deterministicByNodeId: new Map() });
    expect(reconciled.filter((c) => c.role === "BASKET")).toHaveLength(1);
    expect(duplicatesBeforeReconciliation).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CASE 9: formatting-perturbation stability - irrelevant whitespace/
// punctuation differences must produce the SAME identity.
// ---------------------------------------------------------------------------

describe("CASE 9: formatting-perturbation stability - reformatted whitespace/punctuation never changes discoveryId", () => {
  it("discoveryId is byte-identical when re-run with the IDENTICAL documentId/text/description (pure determinism)", () => {
    const text = "Section 6.20. Indebtedness. Indebtedness in an aggregate principal amount not to exceed $50,000,000 shall be permitted.";
    const items: SemanticRuleItem[] = [rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "up to $50,000,000 of Indebtedness" })];
    const run = () => discover("case9-determinism", text, "6.20", items).reconciled.find((c) => c.role === "BASKET")!.discoveryId;
    expect(run()).toBe(run());
  });

  it("discoveryId is UNCHANGED when the source text and description are reformatted (extra whitespace, trailing punctuation) but the documentId/section/role/family/value are otherwise identical", () => {
    const compactText = "Section 6.20. Indebtedness. Indebtedness in an aggregate principal amount not to exceed $50,000,000 shall be permitted.";
    const spacedText = "Section  6.20.   Indebtedness.  Indebtedness  in an aggregate principal amount   not to exceed $50,000,000,  shall be permitted.";
    const idFor = (text: string, description: string) => discover("case9-reformat-shared", text, "6.20", [rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description })]).reconciled.find((c) => c.role === "BASKET")!.discoveryId;
    expect(idFor(compactText, "up to $50,000,000 of Indebtedness")).toBe(idFor(spacedText, "up to $50,000,000  of Indebtedness."));
  });

  it("discoveryId DOES change across genuinely different documentIds, even with identical text (case 7's own distinctness contract - formatting invariance never means IGNORING real source identity)", () => {
    const text = "Section 6.20. Indebtedness. Indebtedness in an aggregate principal amount not to exceed $50,000,000 shall be permitted.";
    const items: SemanticRuleItem[] = [rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "up to $50,000,000 of Indebtedness" })];
    const idA = discover("case9-doc-a", text, "6.20", items).reconciled.find((c) => c.role === "BASKET")!.discoveryId;
    const idB = discover("case9-doc-b", text, "6.20", items).reconciled.find((c) => c.role === "BASKET")!.discoveryId;
    expect(idA).not.toBe(idB);
  });

  it("extractGroundedValueAnchors is insensitive to reformatting on both the candidate and ground-truth side", () => {
    const a = extractGroundedValueAnchors("up to $50,000,000 of Indebtedness", "Indebtedness in an aggregate principal amount not to exceed $50,000,000 shall be permitted.");
    const b = extractGroundedValueAnchors("up to $50,000,000  of Indebtedness.", "Indebtedness  in an aggregate principal amount   not to exceed $50,000,000,  shall be permitted.");
    expect(a).toEqual(b);
    expect(a).toEqual(["usd:50000000"]);
  });

  it("a section-level reformatting-only diff (extra blank lines, no content change) produces the SAME set of discoveryIds for the SAME documentId", () => {
    const compact = "Section 6.21. Indebtedness. Indebtedness not to exceed $12,000,000 shall be permitted.";
    const spaced = "Section 6.21.\n\n  Indebtedness.   Indebtedness   not to exceed   $12,000,000   shall be permitted.\n";
    const items: SemanticRuleItem[] = [rule({ relativeRef: "", role: "BASKET", families: ["INDEBTEDNESS"], description: "up to $12,000,000 of Indebtedness" })];
    const run = (text: string) => {
      const { reconciled } = discover("case9-reformat", text, "6.21", items);
      return reconciled.find((c) => c.role === "BASKET")!.discoveryId;
    };
    // Each run uses a fresh call but the SAME documentId/sectionRef/role/description/discoveryRunVersion -
    // only the raw document text's whitespace differs. Confirms the fingerprint (families/valueAnchors)
    // this workstream added does not depend on incidental source whitespace.
    expect(run(compact)).toBe(run(spaced));
  });
});
