/**
 * Phase 3F.1.6 Section 15 - independent claim-identity adversarial probe.
 *
 * Runs real production identity mechanisms (computeSemanticUnitId /
 * hypothesizeUnitsForDocument from lib/contract-model/compiler/
 * semantic-coverage/**, and runPassCNeighborhoodExpansion /
 * runPassDReconciliation from lib/contract-model/compiler/discovery/**)
 * against independently-constructed adversarial fixtures, never against
 * lib/contract-model/evaluation-v2/** (the frozen evaluator matcher, out of
 * scope per this phase's charter). No LLM call anywhere in this file -
 * SemanticRuleItem inputs are constructed directly, exactly the same
 * technique tests/contract-model/discovery-pipeline.test.ts already uses
 * for its own Pass B-shaped synthetic scenarios.
 *
 * Run via: npx tsx tests/foundation-audit/section15-claim-identity-adversarial.ts
 */
import { writeFileSync } from "node:fs";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { routeDocument } from "../../lib/contract-model/compiler/semantic-coverage/router";
import { hypothesizeUnitsForDocument } from "../../lib/contract-model/compiler/semantic-coverage/unit-hypothesis";
import { runPassCNeighborhoodExpansion } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import type { SemanticRuleItem } from "../../lib/contract-model/compiler/discovery/pass-b-semantic";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";

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

function discover(documentId: string, text: string, sectionRef: string, items: SemanticRuleItem[]) {
  const index = indexFor({ documentId, label: documentId, text });
  const section = index.getNodeByRef(documentId, sectionRef)!;
  // Uses the REAL production discoveryId function pass-c-neighborhood.ts itself returns
  // (computeStableKey("discovery-candidate", documentId, normalizedSourceRef, role, discoveryRunVersion))
  // - never a re-derived stand-in - so this probe exercises the actual production identity formula.
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

interface CaseResult {
  name: string;
  description: string;
  expectedDistinct: boolean;
  actualDistinctCount: number;
  distinctIdentitiesPreserved: boolean;
  verdict: "PASS" | "FAIL";
  detail: string;
}

const results: CaseResult[] = [];

function record(c: CaseResult) {
  results.push(c);
  console.log(`[${c.verdict}] ${c.name}: ${c.detail}`);
}

/**
 * Pass C always synthesizes an extra section-level "container" candidate
 * (role GENERAL_PROHIBITION, normalizedSourceRef = the bare section ref)
 * whenever the section's own top-level node is not already independently
 * represented (see pass-c-neighborhood.ts's own `sectionAlreadyRepresented`
 * guarantee) - so a case with 2 authored claim items legitimately produces
 * 3 total reconciled candidates. The real assertion for "were these two
 * AUTHORED claims kept distinct" is over the descriptions actually passed
 * in, not the raw total count.
 */
function distinctIdsForDescriptions(reconciled: DiscoveredCandidate[], descriptions: string[]): Set<string> {
  return new Set(reconciled.filter((c) => descriptions.includes(c.description)).map((c) => c.discoveryId));
}

// --- Case 1: sibling baskets (lettered) -----------------------------------
{
  const text = "Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) up to $1,000,000; (b) up to $2,000,000; (c) Indebtedness constituting Permitted Debt.";
  const { reconciled } = discover("c1", text, "6.01", [
    rule({ relativeRef: "(a)", role: "BASKET", description: "basket a" }),
    rule({ relativeRef: "(b)", role: "BASKET", description: "basket b" }),
    rule({ relativeRef: "(c)", role: "BASKET", description: "basket c" }),
  ]);
  const ids = new Set(reconciled.filter((c) => c.role === "BASKET").map((c) => c.discoveryId));
  record({
    name: "sibling-baskets",
    description: "three lettered sibling baskets in one exception list",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: ids.size === 3,
    verdict: ids.size === 3 ? "PASS" : "FAIL",
    detail: `${ids.size}/3 distinct discoveryIds (candidateRefs) preserved for the three baskets`,
  });
}

// --- Case 2: same-section-different-claim, WITH distinguishing sub-refs --
{
  const text = "Section 6.02. Liens and Indebtedness. (a) The Company shall not create Liens on the Collateral. (b) The Company shall not incur Indebtedness in excess of $10,000,000.";
  const { reconciled } = discover("c2", text, "6.02", [
    rule({ relativeRef: "(a)", role: "GENERAL_PROHIBITION", families: ["LIENS"], description: "Liens prohibition" }),
    rule({ relativeRef: "(b)", role: "GENERAL_PROHIBITION", families: ["INDEBTEDNESS"], description: "Indebtedness prohibition" }),
  ]);
  const ids = distinctIdsForDescriptions(reconciled, ["Liens prohibition", "Indebtedness prohibition"]);
  record({
    name: "same-section-different-claim-with-markers",
    description: "two different claims in the same section, each with its own lettered sub-ref",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: ids.size === 2,
    verdict: ids.size === 2 ? "PASS" : "FAIL",
    detail: `${ids.size} distinct discoveryIds when sub-refs disambiguate`,
  });
}

// --- Case 3: same-section-different-claim, NO distinguishing sub-ref (ADVERSARIAL) --
{
  const text = "Section 6.03. Restrictions. The Company shall not create Liens on the Collateral or incur Indebtedness in excess of $10,000,000 in the aggregate.";
  const { reconciled } = discover("c3", text, "6.03", [
    rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["LIENS"], description: "CLAIM_A liens prohibition", multipleRulesLikely: true }),
    rule({ relativeRef: "", role: "GENERAL_PROHIBITION", families: ["INDEBTEDNESS"], description: "CLAIM_B indebtedness prohibition", multipleRulesLikely: true }),
  ]);
  const ids = new Set(reconciled.map((c) => c.discoveryId));
  record({
    name: "same-section-different-claim-NO-markers (BLOCKER CANDIDATE)",
    description: "two textually-fused, economically distinct claims in one un-enumerated sentence with the same discovery role and no resolvable sub-reference",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: ids.size === 2,
    verdict: ids.size === 2 ? "PASS" : "FAIL",
    detail: ids.size === 1 ? `COLLISION CONFIRMED: both claims collapsed to ONE discoveryId/candidateRef ("${[...ids][0]}"). Surviving candidate description: "${reconciled[0]!.description}" - the other claim's own description was discarded by Pass D's merge (mergeKey = primaryNodeId::role, both items shared node+role with no distinguishing sub-ref).` : `${ids.size} distinct discoveryIds`,
  });
}

// --- Case 4: chapeau vs child (Phase 3E unit-hypothesis layer) -----------
{
  const text = "Section 6.04. Restricted Payments. The Company shall not make Restricted Payments, except: (a) dividends up to $500,000 per year; (b) redemptions of Equity Interests.";
  const index = indexFor({ documentId: "c4", label: "c4", text });
  const routing = routeDocument("c4", index);
  const units = hypothesizeUnitsForDocument(routing, index, { companyId: "c", packageKey: "p", instrumentKey: null, operativeVersionRef: null });
  const ids = new Set(units.map((u) => u.semanticUnitId));
  const chapeauLike = units.filter((u) => u.postureSignal === "PROHIBITION_SIGNAL");
  const itemLike = units.filter((u) => u.postureSignal === "PERMISSION_SIGNAL");
  record({
    name: "chapeau-vs-child",
    description: "chapeau prohibition + two lettered exception children",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: chapeauLike.length >= 1 && itemLike.length === 2 && ids.size === units.length,
    verdict: chapeauLike.length >= 1 && itemLike.length === 2 && ids.size === units.length ? "PASS" : "FAIL",
    detail: `${units.length} total units (${ids.size} distinct semanticUnitIds), ${chapeauLike.length} chapeau/prohibition-signal unit(s), ${itemLike.length} permission-signal (exception-item) unit(s)`,
  });
}

// --- Case 5: same-amount-different-permission (semanticUnitId layer) ----
{
  // Two DIFFERENT baskets in DIFFERENT sections that happen to share the exact same dollar cap -
  // must not collide merely because the number matches (identity is anchor-derived, not value-derived).
  const textA = "Section 6.05. Investments. The Company may make Investments in an amount not to exceed $5,000,000.";
  const textB = "Section 6.06. Restricted Payments. The Company may make Restricted Payments in an amount not to exceed $5,000,000.";
  const indexA = indexFor({ documentId: "c5a", label: "c5a", text: textA });
  const indexB = indexFor({ documentId: "c5b", label: "c5b", text: textB });
  const unitsA = hypothesizeUnitsForDocument(routeDocument("c5a", indexA), indexA, { companyId: "c", packageKey: "p", instrumentKey: null, operativeVersionRef: null });
  const unitsB = hypothesizeUnitsForDocument(routeDocument("c5b", indexB), indexB, { companyId: "c", packageKey: "p", instrumentKey: null, operativeVersionRef: null });
  const idsA = new Set(unitsA.map((u) => u.semanticUnitId));
  const idsB = new Set(unitsB.map((u) => u.semanticUnitId));
  const overlap = [...idsA].filter((id) => idsB.has(id));
  record({
    name: "same-amount-different-permission",
    description: "Investments $5M cap vs Restricted Payments $5M cap in different sections - same number, different economic claim",
    expectedDistinct: true,
    actualDistinctCount: idsA.size + idsB.size - overlap.length,
    distinctIdentitiesPreserved: overlap.length === 0,
    verdict: overlap.length === 0 ? "PASS" : "FAIL",
    detail: `${overlap.length} semanticUnitId collisions between the two documents (documentId is itself part of the anchor key, so 0 expected)`,
  });
}

// --- Case 6: same-action-different-object (discovery layer) -------------
{
  const text = "Section 6.07. Dispositions. (a) The Company shall not Dispose of the Facility. (b) The Company shall not Dispose of the Intellectual Property.";
  const { reconciled } = discover("c6", text, "6.07", [
    rule({ relativeRef: "(a)", role: "GENERAL_PROHIBITION", description: "dispose of Facility" }),
    rule({ relativeRef: "(b)", role: "GENERAL_PROHIBITION", description: "dispose of IP" }),
  ]);
  const ids = distinctIdsForDescriptions(reconciled, ["dispose of Facility", "dispose of IP"]);
  record({
    name: "same-action-different-object",
    description: "same action (Dispose) applied to two different objects, each with its own lettered sub-ref",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: ids.size === 2,
    verdict: ids.size === 2 ? "PASS" : "FAIL",
    detail: `${ids.size} distinct discoveryIds`,
  });
}

// --- Case 7: same-object-different-condition (discovery layer) ----------
{
  const text = "Section 6.08. Restricted Payments. (a) The Company may pay dividends if no Default has occurred. (b) The Company may pay dividends if the Leverage Ratio is below 3.00:1.00.";
  const { reconciled } = discover("c7", text, "6.08", [
    rule({ relativeRef: "(a)", role: "PERMISSION", description: "dividends conditioned on no default" }),
    rule({ relativeRef: "(b)", role: "PERMISSION", description: "dividends conditioned on leverage ratio" }),
  ]);
  const ids = distinctIdsForDescriptions(reconciled, ["dividends conditioned on no default", "dividends conditioned on leverage ratio"]);
  record({
    name: "same-object-different-condition",
    description: "same object (dividends) gated by two different conditions, each with its own lettered sub-ref",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: ids.size === 2,
    verdict: ids.size === 2 ? "PASS" : "FAIL",
    detail: `${ids.size} distinct discoveryIds`,
  });
}

// --- Case 8: same-term-different-claim (definitional vs operative use of the same defined term) ---
{
  const text = "Section 6.09. EBITDA Usage. (a) The Company shall not incur Indebtedness such that the ratio of Indebtedness to EBITDA exceeds 3.00:1.00. (b) The Company shall not make Restricted Payments such that Pro Forma EBITDA is less than zero.";
  const { reconciled } = discover("c8", text, "6.09", [
    rule({ relativeRef: "(a)", role: "RATIO_BASED_PERMISSION", description: "leverage ratio test referencing EBITDA" }),
    rule({ relativeRef: "(b)", role: "GENERAL_PROHIBITION", description: "restricted payment test referencing EBITDA" }),
  ]);
  const ids = distinctIdsForDescriptions(reconciled, ["leverage ratio test referencing EBITDA", "restricted payment test referencing EBITDA"]);
  record({
    name: "same-term-different-claim",
    description: "two different claims both referencing the same defined term (EBITDA), each with its own lettered sub-ref",
    expectedDistinct: true,
    actualDistinctCount: ids.size,
    distinctIdentitiesPreserved: ids.size === 2,
    verdict: ids.size === 2 ? "PASS" : "FAIL",
    detail: `${ids.size} distinct discoveryIds`,
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalCases: results.length,
  passCount: results.filter((r) => r.verdict === "PASS").length,
  failCount: results.filter((r) => r.verdict === "FAIL").length,
  results,
};
writeFileSync("/tmp/phase-3f1-6-section15-adversarial-results.json", JSON.stringify(summary, null, 2));
console.log(`\n${summary.passCount}/${summary.totalCases} PASS, ${summary.failCount}/${summary.totalCases} FAIL`);
