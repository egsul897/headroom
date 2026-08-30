/**
 * Phase 3F.1.6.R Workstream B - BLOCKER-8 remediation tests.
 *
 * BLOCKER-8 (docs/phase-3f1-6-final-foundation-certification/13-claim-identity-certification.json,
 * part3_confirmedNewFinding F15-1): production candidateRef/discoveryId identity
 * (and, at the semantic-coverage layer, semanticUnitId identity) DOES conflate two
 * distinct sibling claims when they share a structural node and discovery role
 * with no resolvable sub-reference (an un-enumerated multi-claim sentence).
 *
 * This file first reproduces the exact adversarial construction the
 * certification itself used (same fixture text, same real production
 * functions - runPassCNeighborhoodExpansion/runPassDReconciliation and
 * hypothesizeUnitsForDocument - never a re-derived stand-in), then asserts
 * the fix: two textually-fused, economically distinct claims must never
 * collapse to one identity merely because they share an anchor+role with no
 * enumeration marker to split on.
 *
 * Every "sibling-safe" adversarial category the remediation spec names is
 * covered: same section different claim (with and without markers), same
 * term different claim, same amount different permission, same action
 * different object, same object different condition, chapeau vs child.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { hypothesizeUnitsForDocument } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";
import { runPassCNeighborhoodExpansion } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
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

/** Real production discoveryId function, never a re-derived stand-in - matches section15-claim-identity-adversarial.ts's own discipline. */
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

const CTX = { companyId: "c", packageKey: "p", instrumentKey: null, operativeVersionRef: null };

describe("BLOCKER-8 remediation: discoveryId/candidateRef identity (discovery layer)", () => {
  it("REPRODUCTION: two textually-fused, economically distinct claims sharing node+role with no resolvable sub-reference are kept as 2 distinct discoveryIds (was: collapsed to 1)", () => {
    const text = "Section 6.03. Restrictions. The Company shall not create Liens on the Collateral or incur Indebtedness in excess of $10,000,000 in the aggregate.";
    const { reconciled } = discover("c3", text, "6.03", [
      rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["LIENS"], description: "CLAIM_A liens prohibition", multipleRulesLikely: true }),
      rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["INDEBTEDNESS"], description: "CLAIM_B indebtedness prohibition", multipleRulesLikely: true }),
    ]);
    const ids = new Set(reconciled.map((c) => c.discoveryId));
    // Pre-fix: both claims collapsed to ONE discoveryId ("discovery-candidate:91d28deb0cc024d1b3e7343b") -
    // the surviving candidate kept only CLAIM_A's description, silently discarding CLAIM_B.
    expect(ids.size).toBe(2);
    expect(reconciled.some((c) => c.description === "CLAIM_A liens prohibition")).toBe(true);
    expect(reconciled.some((c) => c.description === "CLAIM_B indebtedness prohibition")).toBe(true);
  });

  it("genuine duplicate detections of the SAME claim (same node, role, families, sub-ref) still merge into one candidate - the fix must not turn every re-detection into a false-distinct sibling", () => {
    const index = indexFor({ documentId: "d1", label: "d1", text: "Section 6.01. Indebtedness. Except: (a) up to $1,000,000." });
    const section = index.getNodeByRef("d1", "6.01")!;
    const items: SemanticRuleItem[] = [rule({ relativeRef: "(a)", role: "BASKET" }), rule({ relativeRef: "(a)", role: "BASKET", description: "second, overlapping signal for the same basket" })];
    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, "d1", section.nodeId, "6.01", items, "v1");
    const { candidates: reconciled, duplicatesBeforeReconciliation } = runPassDReconciliation({ documentId: "d1", discoveryRunVersion: "v1", expanded, discoveryId, deterministicByNodeId: new Map() });
    const basketCandidates = reconciled.filter((c) => c.role === "BASKET");
    expect(basketCandidates).toHaveLength(1);
    expect(duplicatesBeforeReconciliation).toBeGreaterThan(0);
  });

  it("sibling-safe: same-action-different-object stays distinct (sub-refs present)", () => {
    const text = "Section 6.07. Dispositions. (a) The Company shall not Dispose of the Facility. (b) The Company shall not Dispose of the Intellectual Property.";
    const { reconciled } = discover("c6", text, "6.07", [
      rule({ relativeRef: "(a)", role: "GENERAL_PROHIBITION", description: "dispose of Facility" }),
      rule({ relativeRef: "(b)", role: "GENERAL_PROHIBITION", description: "dispose of IP" }),
    ]);
    const ids = new Set(reconciled.filter((c) => ["dispose of Facility", "dispose of IP"].includes(c.description)).map((c) => c.discoveryId));
    expect(ids.size).toBe(2);
  });

  it("sibling-safe: same-object-different-condition stays distinct (sub-refs present)", () => {
    const text = "Section 6.08. Restricted Payments. (a) The Company may pay dividends if no Default has occurred. (b) The Company may pay dividends if the Leverage Ratio is below 3.00:1.00.";
    const { reconciled } = discover("c7", text, "6.08", [
      rule({ relativeRef: "(a)", role: "PERMISSION", description: "dividends conditioned on no default" }),
      rule({ relativeRef: "(b)", role: "PERMISSION", description: "dividends conditioned on leverage ratio" }),
    ]);
    const ids = new Set(reconciled.filter((c) => ["dividends conditioned on no default", "dividends conditioned on leverage ratio"].includes(c.description)).map((c) => c.discoveryId));
    expect(ids.size).toBe(2);
  });

  it("sibling-safe: same-term-different-claim (both reference EBITDA) stays distinct (sub-refs present)", () => {
    const text = "Section 6.09. EBITDA Usage. (a) The Company shall not incur Indebtedness such that the ratio of Indebtedness to EBITDA exceeds 3.00:1.00. (b) The Company shall not make Restricted Payments such that Pro Forma EBITDA is less than zero.";
    const { reconciled } = discover("c8", text, "6.09", [
      rule({ relativeRef: "(a)", role: "RATIO_BASED_PERMISSION", description: "leverage ratio test referencing EBITDA" }),
      rule({ relativeRef: "(b)", role: "GENERAL_PROHIBITION", description: "restricted payment test referencing EBITDA" }),
    ]);
    const ids = new Set(reconciled.filter((c) => ["leverage ratio test referencing EBITDA", "restricted payment test referencing EBITDA"].includes(c.description)).map((c) => c.discoveryId));
    expect(ids.size).toBe(2);
  });

  it("REPRODUCTION generalized: a fused sentence with the same family on both sides remains a disclosed residual gap (still merges) - documented, not silently claimed fixed", () => {
    // Same family (INDEBTEDNESS) on both sides, no sub-ref: families alone cannot disambiguate this
    // narrower residual case (see 12-claim-identity-compatibility.json / 11-claim-identity-remediation.json
    // for the explicit disclosure and rationale for not using free-text description as an identity input).
    const text = "Section 6.10. Indebtedness. The Company shall not incur Indebtedness under the Revolving Facility or incur Indebtedness under the Term Facility.";
    const { reconciled } = discover("c10", text, "6.10", [
      rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["INDEBTEDNESS"], description: "CLAIM_A revolving facility indebtedness" }),
      rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["INDEBTEDNESS"], description: "CLAIM_B term facility indebtedness" }),
    ]);
    const ids = new Set(reconciled.map((c) => c.discoveryId));
    expect(ids.size).toBe(1); // disclosed residual - see compatibility doc
  });
});

describe("BLOCKER-8 remediation: semanticUnitId identity (semantic-coverage layer)", () => {
  it("REPRODUCTION: the identical fused sentence hypothesized via the real deterministic pipeline now produces 2 distinct units/semanticUnitIds (was: 1)", () => {
    const text = "Section 6.03. Restrictions. The Company shall not create Liens on the Collateral or incur Indebtedness in excess of $10,000,000 in the aggregate.";
    const index = indexFor({ documentId: "c3u", label: "c3u", text });
    const routing = routeDocument("c3u", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const ids = new Set(units.map((u) => u.semanticUnitId));
    expect(ids.size).toBe(units.length); // no internal collisions
    expect(units.filter((u) => u.family === "LIENS")).toHaveLength(1);
    expect(units.filter((u) => u.family === "INDEBTEDNESS")).toHaveLength(1);
    const liensUnit = units.find((u) => u.family === "LIENS")!;
    const indebtednessUnit = units.find((u) => u.family === "INDEBTEDNESS")!;
    expect(liensUnit.semanticUnitId).not.toBe(indebtednessUnit.semanticUnitId);
    // Both independently carry the prohibition posture, even though only the first clause's own text
    // states "shall not" - the second clause inherits it rather than falling through to UNCLEAR_SIGNAL.
    expect(liensUnit.postureSignal).toBe("PROHIBITION_SIGNAL");
    expect(indebtednessUnit.postureSignal).toBe("PROHIBITION_SIGNAL");
    expect(indebtednessUnit.materiality).toBe("CRITICAL"); // carries its own $10,000,000 economic signal
  });

  it("chapeau-vs-child: chapeau prohibition + two lettered exception children remain 3 distinct units (regression guard)", () => {
    const text = "Section 6.04. Restricted Payments. The Company shall not make Restricted Payments, except: (a) dividends up to $500,000 per year; (b) redemptions of Equity Interests.";
    const index = indexFor({ documentId: "c4u", label: "c4u", text });
    const routing = routeDocument("c4u", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const ids = new Set(units.map((u) => u.semanticUnitId));
    expect(units.length).toBe(3);
    expect(ids.size).toBe(3);
  });

  it("same-amount-different-permission: identical dollar cap in two different documents/sections never collides (anchor-derived, not value-derived)", () => {
    const textA = "Section 6.05. Investments. The Company may make Investments in an amount not to exceed $5,000,000.";
    const textB = "Section 6.06. Restricted Payments. The Company may make Restricted Payments in an amount not to exceed $5,000,000.";
    const indexA = indexFor({ documentId: "c5a", label: "c5a", text: textA });
    const indexB = indexFor({ documentId: "c5b", label: "c5b", text: textB });
    const unitsA = hypothesizeUnitsForDocument(routeDocument("c5a", indexA), indexA, CTX);
    const unitsB = hypothesizeUnitsForDocument(routeDocument("c5b", indexB), indexB, CTX);
    const idsA = new Set(unitsA.map((u) => u.semanticUnitId));
    const idsB = new Set(unitsB.map((u) => u.semanticUnitId));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap.length).toBe(0);
  });

  it("regression guard: a region with 'or'/'and' but only ONE side matching a family keyword is never force-split (no genuine second claim)", () => {
    const text = "The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property, except Permitted Liens.";
    const index = indexFor({ documentId: "c11", label: "c11", text });
    const routing = routeDocument("c11", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    const liensUnits = units.filter((u) => u.excerptText.includes("Permitted Liens"));
    expect(liensUnits).toHaveLength(1);
  });

  it("regression guard: never forces a split when fewer than 2 genuine enumeration markers exist and no independent-family conjunction is present", () => {
    const text = "The Borrower shall not create any Indebtedness.";
    const index = indexFor({ documentId: "c12", label: "c12", text });
    const routing = routeDocument("c12", index);
    const units = hypothesizeUnitsForDocument(routing, index, CTX);
    expect(units.filter((u) => u.excerptText.includes("Indebtedness"))).toHaveLength(1);
  });
});
