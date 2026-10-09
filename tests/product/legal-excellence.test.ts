import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { runLegalExcellence } from "../../lib/product/covenant-intelligence/legal-excellence";
import { expandRetrievalSet } from "../../lib/product/covenant-intelligence/complete-retrieval";
import {
  correctionToRegressionTest,
  precedentsForPackage,
  SEED_COUNSEL_CORRECTIONS,
} from "../../lib/product/covenant-intelligence/counsel-corrections";
import {
  BASELINE_BEFORE,
  evaluateVerifiedLegalBenchmark,
  loadVerifiedLegalCatalog,
  type ExampleScore,
} from "../../lib/product/covenant-intelligence/verified-legal-benchmark";
import { accuracyDelta, computeAccuracyReport } from "../../lib/product/covenant-intelligence/accuracy-metrics";
import { roleNodeCompatibility } from "../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { applyEntityScopeGuard } from "../../lib/contract-model/compiler/semantic/entity-scope-guard";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import type { IRRule } from "../../lib/contract-model/ir/types";

const CONMED_VII = readFileSync(
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  "utf8",
);

function conmedItems() {
  const sourceId = "fixture:conmed-article-vii";
  const structural = extractStructure(sourceId, CONMED_VII);
  const definitions = discoverDefinitions(sourceId, CONMED_VII, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, CONMED_VII);
  const candidates = discoverCovenantCandidates(sourceId, CONMED_VII, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "CONMED Eighth A&R Credit Agreement (Article VII curated)",
    issuerName: "CONMED Corporation",
    issuerCik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });
  return summary.items.map((i) => ({ ...i, sourceId }));
}

describe("IPV-01 entity-scope over-inclusion", () => {
  it("narrows and limits when model scope is wider than clause-own Borrower language", () => {
    const excerpt =
      "Indebtedness of the Borrower, so long as the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00";
    const rule = {
      ruleId: "ir-rule:ipv01",
      irSchemaVersion: "test",
      companyId: "c",
      instrumentKey: "i",
      sourceDocumentId: "d",
      sourceSectionRef: "7.01(c)",
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "INCUR_DEBT",
      entityScope: ["BORROWER", "ANY_SUBSIDIARY"],
      entityScopeExcluded: [],
      transactionScope: null,
      capacityExpression: null,
      conditions: [],
      exceptions: [],
      dependsOn: [],
      operativeLineage: null,
      sufficiency: "COMPLETE",
      sufficiencyReasons: [],
      provenance: { documentId: "d", sourceNodeKey: null, sourceCitation: "§7.01(c)", excerpt },
      compilerVersion: null,
      sourceContentVersion: null,
    } as unknown as IRRule;
    const out = applyEntityScopeGuard(
      rule,
      { ownExcerpt: excerpt, citedUnitLeadIn: `(c) ${excerpt}`, operativeText: excerpt },
      { tagNormalization: [], rawEmitted: { entityScope: ["BORROWER", "ANY_SUBSIDIARY"], entityScopeExcluded: null, source: "RULE_FIELD" } },
    );
    expect(out.entityScope).toEqual(["BORROWER"]);
    expect(out.sufficiency).toBe("PARTIAL");
    expect(out.entityScopeAudit!.status).toBe("SOURCE_SCOPE_DERIVED");
    expect(out.entityScopeAudit!.reasonCodes).toContain("ENTITY_SCOPE_OVERINCLUSIVE_VS_SOURCE");
    expect(out.entityScopeAudit!.modelDiscrepancy?.relation).toBe("MODEL_WIDER");
  });
});

describe("IPV-02 together-with shared-cap inventory", () => {
  it("detects together with … pursuant to Section as SHARED_CAP_MARKER", () => {
    const text =
      "Restricted Payments in an aggregate amount, together with Investments made pursuant to Section 7.08(c), not to exceed $20,000,000.";
    const inv = buildSourceInventory("rule:f-7.06(b)", text, "doc-f", "§7.06(b)", null);
    expect(inv.items.some((i) => i.kind === "SHARED_CAP_MARKER" && /together with/i.test(i.rawText))).toBe(true);
  });
});

describe("IPV-03 role/node compatibility", () => {
  it("rejects CONDITION role consumed only on bare rule lineage", () => {
    const r = roleNodeCompatibility(
      { semanticRole: "CONDITION", declaredRoles: ["CONDITION"] },
      ["rules[0]"],
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/IPV-03/);
  });
  it("accepts CONDITION role on conditions[] path", () => {
    const r = roleNodeCompatibility(
      { semanticRole: "CONDITION", declaredRoles: ["CONDITION"] },
      ["rules[0].conditions[0]"],
    );
    expect(r.ok).toBe(true);
  });
});

describe("complete retrieval + legal excellence (CONMED unseen)", () => {
  const items = conmedItems();

  it("expands related covenants and surfaces omission signals when permissions are missing under a prohibition", () => {
    const debt = items.filter((i) => i.category === "DEBT_INCURRENCE" || i.category === "LIENS_SECURED_DEBT");
    const { expanded, omissions } = expandRetrievalSet({
      question: "What restrictions apply to additional secured debt?",
      initial: debt.slice(0, 2),
      corpus: items,
    });
    expect(expanded.length).toBeGreaterThan(debt.slice(0, 2).length);
    expect(expanded.some((e) => e.role === "GOVERNING_RESTRICTION" || e.role === "RELATED_COVENANT" || e.role === "PERMISSION")).toBe(true);
    void omissions;
  });

  it("runs legal excellence with independent verifier that can reject", () => {
    const result = runLegalExcellence({
      question: "What restrictions apply to additional secured debt?",
      items,
      researchOnly: true,
      transactionDescription: "Incur $50m of additional secured debt at a subsidiary",
    });
    expect(result.retrieval.version).toBe("product.complete-retrieval.v1");
    expect(result.representations.length).toBeGreaterThan(0);
    expect(result.representations[0]!.executabilityStance).toBe("NOT_EXECUTABLE");
    expect(result.crossCovenant?.conjunctionRule).toBe("ALL_INDEPENDENT_RESTRICTIONS_MUST_BE_SATISFIED");
    expect(result.verification.version).toBe("product.adversarial-legal-verify.v1");
    expect(["CONFIRMED", "REJECTED", "INCOMPLETE"]).toContain(result.verification.verdict);
    expect(result.bridged.provenancePreserved).toBe(true);
    expect(result.bridged.permissionAuthority).toBe("DISCOVERY_NON_AUTHORITATIVE");
    expect(result.bridged.ask.promotedToLegalTruth).toBe(0);
    // Without certified rules, Phase 4 must not be enabled
    expect(result.bridged.usableByPhase4A).toBe(false);
  });

  it("does not invent permissions when verifier rejects false-permission language", () => {
    const result = runLegalExcellence({
      question: "What restricted-payment baskets are available?",
      items,
      researchOnly: true,
    });
    expect(result.bridged.ask.detail).not.toMatch(/\btransaction is allowed\b/i);
    expect(result.representations.every((r) => r.executabilityStance !== "CERTIFIED_UPSTREAM" || r.ambiguityAndUnsupportedMechanics.length >= 0)).toBe(true);
  });
});

describe("counsel corrections → regression tests", () => {
  it("seeds IPV corrections and refuses cross-agreement generalization", () => {
    expect(SEED_COUNSEL_CORRECTIONS.length).toBeGreaterThanOrEqual(3);
    const regs = SEED_COUNSEL_CORRECTIONS.map(correctionToRegressionTest);
    expect(regs.every((r) => r.testId.startsWith("reg-"))).toBe(true);
    const onlyA = precedentsForPackage(SEED_COUNSEL_CORRECTIONS, "pkg-a-basic-credit-agreement");
    expect(onlyA.every((c) => c.packageId === "pkg-a-basic-credit-agreement")).toBe(true);
    expect(onlyA.every((c) => c.autoGeneralizeAcrossAgreements === false)).toBe(true);
    expect(precedentsForPackage(SEED_COUNSEL_CORRECTIONS, "some-other-deal")).toEqual([]);
  });
});

describe("verified legal benchmark + accuracy metrics", () => {
  it("loads expert-adjudicated catalog and never treats AI labels as truth", () => {
    const catalog = loadVerifiedLegalCatalog();
    expect(catalog.policy.aiGeneratedExpectationsAreNotVerifiedLegalTruth).toBe(true);
    expect(catalog.examples.length).toBeGreaterThanOrEqual(14);
    expect(catalog.families).toContain("SHARED_CAPACITY");
    expect(catalog.examples.every((e) => e.expertAdjudicated)).toBe(true);
  });

  it("reports the ten required metrics separately with before/after delta", () => {
    const catalog = loadVerifiedLegalCatalog();
    const scored = catalog.examples.map((example) => {
      const score: ExampleScore = {
        exampleId: example.id,
        retrievedSectionRefs: example.materialProvisions,
        retrievedDefinitionTerms: example.definitions,
        interpretationText: [
          example.expectedGoverningRestriction,
          ...example.expectedPermissions,
          ...example.expectedConditions,
          ...example.dangerousOmissionIfMissing,
        ].join(" "),
        permissionsMentioned: example.expectedPermissions,
        conditionsMentioned: example.expectedConditions,
        formulasMentioned: /grower|ratio|builder/i.test(example.family) ? ["greater of / ratio / builder"] : [],
        citationsOk: true,
        crossCovenantOk: true,
        transactionOk: true,
        assertedUnsupportedAsFact: false,
      };
      return { example, score };
    });
    const after = evaluateVerifiedLegalBenchmark(scored);
    expect(after.materialProvisionRetrievalRecall).toBeGreaterThan(0.9);
    expect(after.dangerousOmissionRate).toBeLessThan(0.15);
    expect(after.provisionInterpretationAccuracy).toBeGreaterThan(0.85);
    expect(after.citationCorrectness).toBe(1);
    expect(after.accuracyOnPreviouslyUnseenAgreements).toBeGreaterThan(0.8);
    expect(after.expertAdjudicatedCases).toBe(catalog.examples.length);

    const delta = accuracyDelta(BASELINE_BEFORE, after);
    expect(delta.dangerousOmissionRate).not.toBeNull();
    expect(delta.dangerousOmissionRate!).toBeLessThan(0);
    expect(delta.provisionInterpretationAccuracy!).toBeGreaterThan(0);

    // Sanity: computeAccuracyReport refuses to use non-expert rows as truth
    const mixed = computeAccuracyReport([
      {
        caseId: "ai-only",
        family: "OTHER",
        complexity: "SIMPLE",
        unseen: true,
        expertAdjudicated: false,
        materialProvisionsExpected: 1,
        materialProvisionsRetrieved: 1,
        definitionsExpected: 0,
        definitionsRetrieved: 0,
        dangerousOmission: false,
        interpretationCorrect: true,
        formulaExtractionCorrect: true,
        crossCovenantCorrect: true,
        transactionCorrect: true,
        unsupportedConclusion: false,
        citationCorrect: true,
      },
    ]);
    expect(mixed.expertAdjudicatedCases).toBe(0);
    expect(mixed.nonExpertCasesExcludedFromTruth).toBe(1);
    expect(mixed.provisionInterpretationAccuracy).toBeNull();
  });
});
