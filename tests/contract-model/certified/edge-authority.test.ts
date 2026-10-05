/**
 * EDGE AUTHORITY - which relationships Phase 4 may act on. Structural ancestry alone never certifies a
 * RULE_SUBJECT_TO_GENERAL_PROHIBITION; a context-bundle classification alone is an inference; only an IR-established
 * relationship between CERTIFIED units is CERTIFIED_SEMANTIC. Zero provider calls.
 */
import { describe, expect, it } from "vitest";
import { assembleCovenantMap, assemblyInput, certifyDiscoveredCovenantPackage, compileCovenantMap } from "../../../lib/contract-model/covenant-map";
import { certifyCandidate } from "../../../lib/contract-model/phase3-certification/certify";
import { operativeLineageFor } from "../../../lib/contract-model/covenant-map/candidate-input";
import { certifyPackage } from "../../../lib/contract-model/phase3-certification/package-certification";
import type { ContextItem } from "../../../lib/contract-model/compiler/context-retrieval/types";
import { buildPackage, buildPackageFrom, deps, fakeClient, idsFor, DOCS, CA, GOLDEN_AGREEMENT, type ScriptedInventory } from "./golden-harness";

// ---- a prohibition whose sub-clause is an AFFIRMATIVE obligation, not a carve-out --------------------------------
const RP_SECTION = [
  "SECTION 7.03 Restricted Payments . The Borrower shall not declare or pay any dividend on its equity interests.",
  "",
  "(a) The Borrower shall deliver to the Administrative Agent a certificate of a Financial Officer after the end of each fiscal quarter.",
  "",
].join("\n");
const FALSE_ANCESTRY_DOC = GOLDEN_AGREEMENT.replace("SECTION 7.02 Liens .", RP_SECTION + "SECTION 7.02 Liens .");
const FALSE_INVENTORY: ScriptedInventory = {
  "7.03": [
    { excerpt: "The Borrower shall not declare or pay any dividend on its equity interests.", role: "PROHIBITION", materiality: "CRITICAL", proposition: "dividend prohibition" },
    { excerpt: "(a) The Borrower shall deliver to the Administrative Agent a certificate of a Financial Officer after the end of each fiscal quarter.", role: "OBLIGATION", materiality: "MATERIAL", proposition: "quarterly certificate obligation" },
  ],
};
function falseAncestrySubmission(user: string): unknown {
  const prohibition = idsFor(user, "shall not declare or pay"), cert = idsFor(user, "certificate of a Financial Officer");
  return {
    rules: [
      { localRef: "r0", sourceSectionRef: "7.03", covenantFamily: "RESTRICTED_PAYMENTS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "PAY_DIVIDEND", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.03", excerpt: "The Borrower shall not declare or pay any dividend", inventoryItemIds: prohibition },
      { localRef: "r1", sourceSectionRef: "7.03(a)", covenantFamily: "REPORTING_INFORMATION", ruleType: "QUALITATIVE_OBLIGATION", posture: "OBLIGATION", action: null, entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.03(a)", excerpt: "(a) The Borrower shall deliver to the Administrative Agent a certificate", inventoryItemIds: cert },
    ],
    definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [],
  };
}

describe("structural ancestry alone never certifies a general-prohibition relationship", () => {
  it("FALSE ANCESTRY: an affirmative obligation (a) under prohibition 7.03 gets a DETERMINISTIC_STRUCTURAL edge only - both units CERTIFIED, the edge never CERTIFIED_SEMANTIC, Phase 4 does not act on it", async () => {
    const docs = DOCS.map((d) => (d.documentId === CA ? { ...d, text: FALSE_ANCESTRY_DOC } : d));
    const { pkg } = buildPackageFrom({ docs, candidateSpecs: [["7.03", ["RESTRICTED_PAYMENTS"], "GENERAL_PROHIBITION", "dividend prohibition with a reporting sub-clause"]] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(falseAncestrySubmission), FALSE_INVENTORY));
    const r = run.results[0]!;
    expect(r.outcome).toBe("MAPPED");
    expect(r.certification!.status).toBe("CERTIFIED");
    const prohibition = run.map.nodes.find((n) => n.sectionRef === "7.03")!, obligation = run.map.nodes.find((n) => n.sectionRef === "7.03(a)")!;
    expect(prohibition.certification.status).toBe("CERTIFIED"); expect(obligation.certification.status).toBe("CERTIFIED");
    const edge = run.map.edges.find((e) => e.edgeType === "RULE_SUBJECT_TO_GENERAL_PROHIBITION" && e.fromNodeId === obligation.nodeId && e.toNodeId === prohibition.nodeId)!;
    expect(edge).toBeTruthy();
    expect(edge.derivedFrom).toBe("STRUCTURAL_ANCESTRY");
    expect(edge.corroboratedBy).toEqual(["STRUCTURAL_ANCESTRY"]);
    expect(edge.edgeAuthority).toBe("DETERMINISTIC_STRUCTURAL");
    expect(run.map.edges.filter((e) => e.edgeAuthority === "CERTIFIED_SEMANTIC")).toEqual([]);
    expect(run.map.completeness.edgesByAuthority).toEqual({ CERTIFIED_SEMANTIC: 0, DETERMINISTIC_STRUCTURAL: 1, CONTEXTUAL_INFERENCE: 0, REVIEW_ONLY: 0 });
    // the package is certified (nothing is wrong with the units) but the executable edge is recorded as one Phase 4 does not act on
    expect(run.packageCertification.status).toBe("CERTIFIED");
    expect(run.packageCertification.warnings.map((w) => w.code)).toEqual(["NON_SEMANTIC_EXECUTABLE_EDGE"]);
    expect(run.packageCertification.edges).toEqual({ executable: 1, certifiedSemantic: 0, reviewOnly: 0, deterministicStructural: 1, contextualInference: 0 });
  });

  it("TRUE EXCEPTION RELATION: 7.01(b) is subject to the 7.01 prohibition because the IR exception names it as the permission AND structure corroborates AND both are certified -> CERTIFIED_SEMANTIC", async () => {
    const run = await certifyDiscoveredCovenantPackage(buildPackage().pkg, deps());
    const chapeau = run.map.nodes.find((n) => n.sectionRef === "7.01")!, basket = run.map.nodes.find((n) => n.sectionRef === "7.01(b)")!;
    const edge = run.map.edges.find((e) => e.edgeType === "RULE_SUBJECT_TO_GENERAL_PROHIBITION" && e.fromNodeId === basket.nodeId && e.toNodeId === chapeau.nodeId)!;
    expect(edge.derivedFrom).toBe("IR_EXCEPTION_PERMISSION");
    expect(edge.corroboratedBy).toEqual(["IR_EXCEPTION_PERMISSION", "STRUCTURAL_ANCESTRY"]);
    expect(edge.edgeAuthority).toBe("CERTIFIED_SEMANTIC");
    expect(run.map.completeness.edgesByAuthority).toEqual({ CERTIFIED_SEMANTIC: run.map.edges.length, DETERMINISTIC_STRUCTURAL: 0, CONTEXTUAL_INFERENCE: 0, REVIEW_ONLY: 0 });
    expect(run.packageCertification.edges.certifiedSemantic).toBe(run.map.edges.length);
  });

  it("REVIEW_ONLY: the same IR-established relationship is not CERTIFIED_SEMANTIC when an endpoint's candidate is not certified; package certification then refuses the executable dependency", async () => {
    const { pkg } = buildPackage();
    const run = await compileCovenantMap(pkg, deps());
    const r = run.results.find((x) => x.candidate.normalizedSourceRef === "7.01")!;
    const review = { ...r.certification!, status: "REVIEW_REQUIRED" as const, blockers: [{ code: "OPEN_MATERIAL_OR_UNCERTAIN_FINDING" as const, severity: "REVIEW" as const, detail: "t", refs: [] }] };
    const map = assembleCovenantMap(assemblyInput(pkg, deps().config, run.results.map((x) => (x === r ? { ...x, certification: review } : x))));
    const chapeau = map.nodes.find((n) => n.sectionRef === "7.01")!, basket = map.nodes.find((n) => n.sectionRef === "7.01(b)")!;
    const edge = map.edges.find((e) => e.edgeType === "RULE_SUBJECT_TO_GENERAL_PROHIBITION" && e.fromNodeId === basket.nodeId && e.toNodeId === chapeau.nodeId)!;
    expect(edge.corroboratedBy).toEqual(["IR_EXCEPTION_PERMISSION", "STRUCTURAL_ANCESTRY"]);
    expect(edge.edgeAuthority).toBe("REVIEW_ONLY");
    const pc = certifyPackage({ map, certifications: run.results.map((x) => (x === r ? review : x.certification!)), discoveryPopulation: pkg.discoveryPopulation! });
    expect(pc.status).toBe("REVIEW_REQUIRED");
    expect(pc.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(["CANDIDATE_REVIEW_REQUIRED", "REVIEW_ONLY_EXECUTABLE_DEPENDENCY"]));
    expect(pc.edges.reviewOnly).toBeGreaterThan(0);
  });

  it("CONTEXTUAL_INFERENCE: a PROVISO / CONDITION / PARENT_SCOPE classification in the context bundle creates an edge Phase 4 never acts on, even between certified units", async () => {
    const { pkg } = buildPackage();
    const run = await compileCovenantMap(pkg, deps());
    const lien = run.results.find((x) => x.candidate.normalizedSourceRef === "7.02")!;
    const debt = run.results.find((x) => x.candidate.normalizedSourceRef === "7.01")!;
    const basketNode = run.map.nodes.find((n) => n.sectionRef === "7.01(b)")!;
    const chapeauNode = run.map.nodes.find((n) => n.sectionRef === "7.01")!;
    const inject = (type: ContextItem["type"], structuralNodeId: string, normalizedRef: string): ContextItem => ({ itemId: `context-item:test-${type}`, type, documentId: CA, structuralNodeKey: null, structuralNodeId, normalizedRef, sourceCitation: normalizedRef, excerptText: "x", reason: "test classification", retrievalDepth: 1, retrievalPath: [], retrievalMethod: "STRUCTURAL_TRAVERSAL", confidence: 0.5, evidenceState: null });
    const bundle = { ...lien.bundle!, items: [...lien.bundle!.items, inject("PROVISO", basketNode.structuralNodeId!, "7.01(b)"), inject("CONDITION", chapeauNode.structuralNodeId!, "7.01"), inject("PARENT_SCOPE", chapeauNode.structuralNodeId!, "7.01")] };
    const results = run.results.map((x) => (x === lien ? { ...x, bundle } : x));
    const map = assembleCovenantMap(assemblyInput(pkg, deps().config, results));
    const lienNode = map.nodes.find((n) => n.sectionRef === "7.02")!;
    const authorities = map.edges.filter((e) => e.fromNodeId === lienNode.nodeId).map((e) => [e.edgeType, e.derivedFrom, e.edgeAuthority]);
    expect(authorities).toEqual(expect.arrayContaining([["RULE_SUBJECT_TO_PROVISO", "CONTEXT_BUNDLE_ITEM", "CONTEXTUAL_INFERENCE"], ["RULE_SUBJECT_TO_CONDITION", "CONTEXT_BUNDLE_ITEM", "CONTEXTUAL_INFERENCE"], ["RULE_SUBJECT_TO_GENERAL_PROHIBITION", "CONTEXT_BUNDLE_ITEM", "CONTEXTUAL_INFERENCE"]]));
    for (const n of [lienNode, basketNode, chapeauNode]) expect(map.nodes.find((x) => x.nodeId === n.nodeId)!.certification.status).toBe("CERTIFIED");
    // the certification of the lien candidate itself is unaffected by the inferred relationships (they are map facts, not unit facts)
    const cert = certifyCandidate({ candidate: lien.candidate, anchored: true, operativeSourceVersion: lien.sourceContentVersion, operativeIdentityStrength: lien.identityStrength, semanticSourceContract: lien.semanticSourceContract!, bundle, compilation: lien.compilation, verification: lien.verification, operativeProvision: lien.operativeProvision, operativeLineage: operativeLineageFor(lien.operativeProvision), snapshot: lien.snapshot!, verifiedPackage: lien.verifiedPackage!, currentUnits: [...lien.compilation!.rules, ...lien.compilation!.definitions] });
    expect(cert.status).toBe("CERTIFIED");
    void debt;
  });
});
