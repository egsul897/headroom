/**
 * Agent 5 — cross-document covenant reasoning.
 * Authentic scenarios from product-acceptance fixtures; independent false-permission check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateCrossDocumentTransaction,
  verifyCrossDocumentVerdictIndependently,
} from "@/lib/product/covenant-intelligence/cross-document-covenant";
import {
  AUTHENTIC_CROSS_DOCUMENT_SCENARIOS,
  runAllCrossDocumentScenarios,
  runCrossDocumentScenario,
} from "@/lib/product/covenant-intelligence/cross-document-scenarios";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import { analyzeCrossCovenant } from "@/lib/product/covenant-intelligence/cross-covenant";
import { extractAmendedSectionRefs } from "@/lib/product/customer-intelligence/operative-resolution";
import { buildWorkspacePackageGraph } from "@/lib/product/legal-reasoning/package-graph-wire";

const FIXTURE_ROOT = "tests/fixtures/product-acceptance/packages";

describe("cross-document covenant reasoning — system composition (no duplication)", () => {
  it("reuses Phase 4E path enumeration without inventing CERTIFIED_4E", () => {
    const r = enumerateCertifiedPaths({
      verifiedPackage: null,
      transactionKind: "UNSECURED_DEBT",
      secured: false,
    });
    expect(r.authority).toBe("NOT_CERTIFIED_4E");
    expect(r.stackingAssumed).toBe(false);
  });

  it("reuses cross-covenant conjunction rule", () => {
    const x = analyzeCrossCovenant({
      transactionDescription: "Incur secured debt and grant liens",
      items: [],
    });
    expect(x.conjunctionRule).toBe("ALL_INDEPENDENT_RESTRICTIONS_MUST_BE_SATISFIED");
  });

  it("reuses amendment helpers; supplemental indenture text restates §4.09(c)", () => {
    const text = readFileSync(
      `${FIXTURE_ROOT}/pkg-b-multi-document/documents/supplemental-indenture-1.txt`,
      "utf8",
    );
    expect(text).toMatch(/Section 4\.09\(c\).*amended and restated/i);
    expect(text).toMatch(/\$75,000,000/);
    // Helper is the shared operative-resolution extractor (parenthetical clauses like 4.09(c)
    // are outside its bare §X.Y capture — dating/supersession in scenarios carries the effect).
    expect(typeof extractAmendedSectionRefs).toBe("function");
    expect(extractAmendedSectionRefs("Section 7.01 of the Credit Agreement is hereby amended")).toContain("7.01");
  });

  it("reuses package graph wire on Northfield multi-doc package", () => {
    const ca = readFileSync(`${FIXTURE_ROOT}/pkg-b-multi-document/documents/credit-agreement.txt`, "utf8");
    const ind = readFileSync(`${FIXTURE_ROOT}/pkg-b-multi-document/documents/indenture.txt`, "utf8");
    const graph = buildWorkspacePackageGraph({
      companyId: "company:northfield",
      documents: [
        {
          sourceId: "credit-agreement",
          documentTitle: "Credit Agreement dated as of February 10, 2026",
          documentClass: "CREDIT_AGREEMENT",
          text: ca,
        },
        {
          sourceId: "indenture",
          documentTitle: "Indenture dated as of February 10, 2026 Senior Notes",
          documentClass: "INDENTURE",
          text: ind,
        },
      ],
    });
    expect(graph.performance.documentCount).toBe(2);
    expect(graph.classifications.length).toBe(2);
  });
});

describe("cross-document covenant — eight authentic scenarios", () => {
  it("registers exactly eight scenarios covering the mandated focus set", () => {
    expect(AUTHENTIC_CROSS_DOCUMENT_SCENARIOS).toHaveLength(8);
    const foci = new Set(AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.map((s) => s.focus));
    expect(foci).toEqual(
      new Set([
        "PERMIT_VS_PROHIBIT",
        "DIFFERENT_CONDITIONS",
        "DEBT_AND_LIEN",
        "CROSS_SECTION_DEFINITION",
        "AMENDMENT_EFFECT",
        "ABSENT_DOCUMENT",
        "CLASSIFICATION_DIVERGENCE",
        "MULTIPLE_PATHWAYS",
      ]),
    );
  });

  for (const scenario of AUTHENTIC_CROSS_DOCUMENT_SCENARIOS) {
    it(`${scenario.scenarioId}: ${scenario.title}`, () => {
      const run = runCrossDocumentScenario(scenario);
      expect(run.actualOverall, JSON.stringify({
        expected: run.expectedOverall,
        actual: run.actualOverall,
        prohibitions: run.verdict.prohibitions,
        permissions: run.verdict.supportedPermissions,
        unknowns: run.verdict.unknowns,
        docs: run.verdict.documentVerdicts.map((d) => ({
          id: d.documentId,
          app: d.applicability,
          result: d.documentResult,
          prohibitions: d.prohibitions,
          permissions: d.supportedPermissions,
          unknowns: d.unknowns,
        })),
      }, null, 2)).toBe(scenario.expectedOverall);

      // Required verdict fields
      expect(run.verdict.applicableDocuments).toBeDefined();
      expect(run.verdict.governingSections.length).toBeGreaterThan(0);
      expect(run.verdict.evaluatedRestrictions.length).toBeGreaterThan(0);
      expect(run.verdict.exactSourceCitations.length).toBeGreaterThan(0);
      expect(run.verdict.conjunctionRule).toBe("ALL_APPLICABLE_DOCUMENTS_MUST_PERMIT");
      expect(run.verdict.overallResult).toBeDefined();
      expect(run.verdict.conditions).toBeDefined();
      expect(run.verdict.supportedPermissions).toBeDefined();
      expect(run.verdict.prohibitions).toBeDefined();
      expect(run.verdict.unknowns).toBeDefined();

      for (const sub of scenario.expectedProhibitionSubstrings ?? []) {
        const hay = [
          ...run.verdict.prohibitions,
          ...run.verdict.evaluatedRestrictions
            .filter((r) => r.stance === "PROHIBITS")
            .map((r) => `${r.statement} ${r.citation.excerpt}`),
        ].join(" | ");
        expect(hay).toContain(sub);
      }
      for (const sub of scenario.expectedPermissionSubstrings ?? []) {
        const hay = [
          ...run.verdict.supportedPermissions,
          ...run.verdict.evaluatedRestrictions.map((r) => r.statement),
          ...run.verdict.contractualPathways.map((p) => p.label),
        ].join(" | ");
        expect(hay).toContain(sub);
      }
      for (const sub of scenario.expectedUnknownSubstrings ?? []) {
        expect(run.verdict.unknowns.join(" | ")).toMatch(new RegExp(sub, "i"));
      }

      // Independent verification: zero false permissions on each scenario
      expect(run.independentVerification.falsePermissionCount).toBe(0);
      expect(run.independentVerification.confirmed).toBe(true);

      // Fixture sources exist on disk
      for (const f of scenario.fixtureSources) {
        expect(() => readFileSync(f, "utf8")).not.toThrow();
      }
    });
  }

  it("suite-level false-permission count is zero", () => {
    const suite = runAllCrossDocumentScenarios();
    expect(suite.matchedCount).toBe(suite.total);
    expect(suite.falsePermissionCount).toBe(0);
  });
});

describe("cross-document invariants", () => {
  it("permission under one agreement does not override another applicable prohibition", () => {
    const scenario = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-01-permit-vs-prohibit")!;
    const run = runCrossDocumentScenario(scenario);
    const ca = run.verdict.documentVerdicts.find((d) => d.documentId === "credit-agreement")!;
    const ind = run.verdict.documentVerdicts.find((d) => d.documentId === "indenture")!;
    expect(ca.supportedPermissions.length).toBeGreaterThan(0);
    expect(ind.prohibitions.length).toBeGreaterThan(0);
    expect(run.verdict.overallResult).toBe("PROHIBITED");
    expect(run.verdict.falsePermissionRisks.length).toBeGreaterThan(0);
  });

  it("does not require irrelevant documents to affirmatively authorize", () => {
    const scenario = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-07-classification-divergence")!;
    const run = runCrossDocumentScenario(scenario);
    const ca = run.verdict.documentVerdicts.find((d) => d.documentId === "credit-agreement")!;
    expect(ca.applicability).toBe("NOT_APPLICABLE");
    expect(run.verdict.overallResult).toBe("PERMITTED");
  });

  it("does not infer missing restrictions are satisfied (absent ICA)", () => {
    const scenario = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-06-absent-document")!;
    const run = runCrossDocumentScenario(scenario);
    expect(run.verdict.overallResult).toBe("UNDETERMINED");
    expect(run.verdict.unknowns.join(" ")).toMatch(/absent|Intercreditor/i);
  });

  it("post-amendment indenture basket widens but CA basket still binds", () => {
    const base = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-05-amendment-effect")!;
    const post = evaluateCrossDocumentTransaction({
      transaction: {
        ...base.transaction,
        description: "Incur $60,000,000 of third-party unsecured Indebtedness as of 2026-06-30 (post-supplemental).",
        asOfDate: "2026-06-30",
      },
      provisions: base.provisions,
      verifiedPackage: null,
    });
    // Indenture §4.09(c) is now $75M (would cover $60M) but CA §7.01(b) remains $30M.
    expect(post.overallResult).toBe("PROHIBITED");
    expect(post.prohibitions.join(" ")).toMatch(/30/);
    const v = verifyCrossDocumentVerdictIndependently(post);
    expect(v.falsePermissionCount).toBe(0);
  });

  it("secured debt requires lien authority even when debt basket clears", () => {
    const scenario = AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.find((s) => s.scenarioId === "xd-03-debt-and-lien")!;
    const run = runCrossDocumentScenario(scenario);
    expect(run.verdict.supportedPermissions.join(" ")).toMatch(/50/);
    expect(run.verdict.prohibitions.join(" ")).toMatch(/20|25/);
    expect(run.verdict.antiStackingNotes.length).toBeGreaterThan(0);
  });
});
