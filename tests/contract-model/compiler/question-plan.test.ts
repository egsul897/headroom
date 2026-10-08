/**
 * Offline question plan. No provider call. Estimated reservation arithmetic
 * is not a measured bill and is not a saving against sealed Gibraltar spend.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maxCostOfRequestUsd } from "../../../lib/contract-model/analyzer/pricing";
import type { QuestionPlanRequest, QuestionProvision } from "../../../lib/contract-model/compiler/question-plan";
import { planQuestionCompilation } from "../../../lib/contract-model/compiler/question-plan";
import type { EvidenceReuseContract } from "../../../lib/contract-model/compiler/evidence-engine/identity";
import { ContentAddressedEvidenceStore } from "../../../lib/contract-model/compiler/evidence-engine/store";

const DEBT_QUESTION = "Can this issuer incur an additional $75 million of secured debt?";
const SONNET = { modelId: "anthropic/claude-sonnet-5", maxInputTokens: 1000, maxOutputTokens: 100 };

function provision(overrides: Partial<QuestionProvision> & Pick<QuestionProvision, "id" | "sectionRef" | "text">): QuestionProvision {
  return {
    documentId: "credit-agreement",
    sourceSha256: `sha-${overrides.id}`,
    structuralKind: "OPERATIVE_OCCURRENCE",
    families: [],
    operativeVersionId: "operative-v1",
    ...overrides,
  };
}

function packageProvisions(): QuestionProvision[] {
  return [
    provision({
      id: "s701",
      sectionRef: "7.01",
      families: ["INDEBTEDNESS"],
      text: "The Borrower shall not incur any Indebtedness except as permitted under Section 7.02.",
    }),
    provision({
      id: "s702",
      sectionRef: "7.02",
      families: ["INDEBTEDNESS"],
      text: "The Borrower may incur Indebtedness pursuant to Section 7.03(b) when the Payment Conditions are satisfied.",
    }),
    provision({
      id: "s703",
      sectionRef: "7.03",
      families: ["LIENS"],
      text: "The Borrower shall not create a Lien except as set out below.",
    }),
    provision({
      id: "s703b",
      sectionRef: "7.03(b)",
      families: ["LIENS"],
      text: "A Lien securing Indebtedness incurred under Section 7.02 is described in this clause.",
    }),
    provision({
      id: "s704",
      sectionRef: "7.04",
      families: ["RESTRICTED_PAYMENTS"],
      text: "The Borrower shall not declare or pay a dividend or other Restricted Payment.",
    }),
    provision({
      id: "s709",
      sectionRef: "7.09",
      families: ["INDEBTEDNESS"],
      text: "Financing by a Subsidiary is limited to the amounts on Schedule 7.09.",
    }),
    provision({
      id: "s101",
      sectionRef: "1.01",
      text: "Indebtedness means borrowed money. Lien means a security interest.",
    }),
    provision({
      id: "toc701",
      sectionRef: "7.01",
      families: ["INDEBTEDNESS"],
      structuralKind: "CONTENTS_LISTING",
      text: "Section 7.01 Indebtedness 225",
    }),
  ];
}

function baseRequest(overrides: Partial<QuestionPlanRequest> = {}): QuestionPlanRequest {
  return {
    question: DEBT_QUESTION,
    provisions: packageProvisions(),
    references: [
      { sourceSectionRef: "7.01", normalizedTarget: "7.02", targetKind: "SECTION", resolved: true, targetAmbiguous: false },
      { sourceSectionRef: "7.02", normalizedTarget: "7.03(b)", targetKind: "CLAUSE", resolved: true, targetAmbiguous: false },
    ],
    definitions: [
      { term: "Indebtedness", text: "borrowed money and obligations of a Subsidiary" },
      { term: "Payment Conditions", text: "the Leverage Ratio is not greater than 4.00 to 1.00" },
      { term: "Leverage Ratio", text: "the ratio of debt to Consolidated EBITDA" },
    ],
    reservation: SONNET,
    promptVersion: "prompt-v1",
    schemaVersion: "schema-v1",
    compilerVersion: "compiler-v1",
    ...overrides,
  };
}

function contractFor(provisionRow: QuestionProvision, request: QuestionPlanRequest): EvidenceReuseContract {
  return {
    sourceContentSha256: provisionRow.sourceSha256,
    documentId: provisionRow.documentId,
    operativeVersionId: provisionRow.operativeVersionId,
    dependencyHashes: provisionRow.dependencyHashes ?? {},
    promptVersion: request.promptVersion ?? "unspecified",
    schemaVersion: request.schemaVersion ?? "unspecified",
    modelId: request.reservation?.modelId ?? "unspecified",
    inferenceConfigHash: "dry-run",
    stage: "semantic-compile",
    compilerVersion: request.compilerVersion ?? "unspecified",
    artifactKind: "SEMANTIC_IR",
  };
}

describe("question compilation plan", () => {
  it("closes cited debt and lien sections, refuses the contents line, and does not treat $75 million as capacity", () => {
    const plan = planQuestionCompilation(baseRequest());
    expect(plan.families).toEqual(expect.arrayContaining(["INDEBTEDNESS", "LIENS"]));
    expect(plan.questionParameter).toBe("$75 million");
    expect(plan.capacityComputed).toBe(false);
    expect(plan.unknownIsUnlimited).toBe(false);
    expect(plan.permitsCapacity).toBe(false);
    expect(plan.advancesCertification).toBe(false);
    expect(plan.measuredProviderCalls).toBe(0);
    expect(plan.measuredBillingUsd).toBeNull();
    expect(plan.planned.map((unit) => unit.sectionRef).sort()).toEqual(["7.01", "7.02", "7.03", "7.03(b)"]);
    expect(plan.planned.find((unit) => unit.sectionRef === "7.03(b)")?.reason).toBe("REFERENCE_CLOSURE");
    expect(plan.planned.find((unit) => unit.sectionRef === "7.01")?.reason).toBe("FAMILY_MATCH");
    expect(plan.refusedSources).toEqual([{ id: "toc701", sectionRef: "7.01", structuralKind: "CONTENTS_LISTING" }]);
    expect(plan.planned.some((unit) => unit.id === "toc701")).toBe(false);
    expect(plan.notExaminedSectionRefs).toEqual(expect.arrayContaining(["7.04", "7.09", "1.01"]));
    expect(plan.sameActionNotReached).toEqual(["7.09"]);
    expect(plan.status).toBe("REVIEW_REQUIRED");
    expect(plan.statusReasons).toEqual(expect.arrayContaining(["SAME_ACTION_OUTSIDE_CLOSURE", "NOT_EXAMINED_REMAINS"]));
    expect(plan.simulatedDispatches).toBe(plan.planned.length);
    expect(plan.reused).toBe(0);
    const perCall = maxCostOfRequestUsd(SONNET, SONNET.modelId);
    expect(perCall).not.toBeNull();
    expect(plan.pricingStatus).toBe("PRICED");
    expect(plan.estimatedWorstCaseUsd).toBe(Number(((perCall ?? 0) * plan.simulatedDispatches).toFixed(10)));
    expect(plan.localElapsedMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(plan.localElapsedMs)).toBe(true);
  });

  it("selects the dividend covenant for a dividend question and leaves the debt covenant uncompiled", () => {
    const plan = planQuestionCompilation(baseRequest({ question: "May the issuer pay a dividend?" }));
    expect(plan.families).toEqual(["RESTRICTED_PAYMENTS"]);
    expect(plan.planned.map((unit) => unit.sectionRef)).toEqual(["7.04"]);
    expect(plan.notExaminedSectionRefs).toEqual(expect.arrayContaining(["7.01", "7.02"]));
    expect(plan.sameActionNotReached).toEqual([]);
    expect(plan.status).toBe("REVIEW_REQUIRED");
    expect(plan.statusReasons).toContain("NOT_EXAMINED_REMAINS");
  });

  it("reuses a warm cache, misses a changed source hash, and misses a changed dependency hash", () => {
    const store = new ContentAddressedEvidenceStore();
    const request = baseRequest({ store });
    const cold = planQuestionCompilation(request);
    expect(cold.reused).toBe(0);
    expect(cold.simulatedDispatches).toBe(4);
    for (const unit of cold.planned) {
      const row = request.provisions.find((provision) => provision.id === unit.id);
      expect(row).toBeDefined();
      store.put(contractFor(row!, request), { ir: unit.id }, "COMPLETE");
    }
    const warm = planQuestionCompilation(request);
    expect(warm.reused).toBe(4);
    expect(warm.simulatedDispatches).toBe(0);
    expect(warm.pricingStatus).toBe("NO_DISPATCH");
    expect(warm.estimatedWorstCaseUsd).toBeNull();
    expect(warm.measuredBillingUsd).toBeNull();
    expect(warm.measuredProviderCalls).toBe(0);
    expect(warm.advancesCertification).toBe(false);
    expect(warm.planned.every((unit) => unit.action === "REUSE")).toBe(true);

    const changedSource = baseRequest({
      store,
      provisions: packageProvisions().map((row) => row.id === "s701" ? { ...row, sourceSha256: "sha-s701-edited" } : row),
    });
    const afterSourceEdit = planQuestionCompilation(changedSource);
    expect(afterSourceEdit.planned.find((unit) => unit.id === "s701")?.action).toBe("DISPATCH");
    expect(afterSourceEdit.planned.filter((unit) => unit.action === "REUSE").map((unit) => unit.id).sort()).toEqual(["s702", "s703", "s703b"]);

    const changedDependency = baseRequest({
      store,
      provisions: packageProvisions().map((row) => row.id === "s702" ? { ...row, dependencyHashes: { Indebtedness: "hash-b" } } : row),
    });
    const afterDependencyEdit = planQuestionCompilation(changedDependency);
    expect(afterDependencyEdit.planned.find((unit) => unit.id === "s702")?.action).toBe("DISPATCH");
    expect(afterDependencyEdit.planned.find((unit) => unit.id === "s701")?.action).toBe("REUSE");
  });

  it("does not reuse a partial record or a different prompt version", () => {
    const store = new ContentAddressedEvidenceStore();
    const request = baseRequest({ store, provisions: [packageProvisions()[0]!] });
    const row = request.provisions[0]!;
    store.put(contractFor(row, request), { ir: "partial" }, "PARTIAL");
    const partial = planQuestionCompilation(request);
    expect(partial.planned[0]?.action).toBe("DISPATCH");
    store.put(contractFor(row, request), { ir: "complete" }, "COMPLETE");
    expect(planQuestionCompilation(request).planned[0]?.action).toBe("REUSE");
    const otherPrompt = planQuestionCompilation(baseRequest({ store, provisions: [row], promptVersion: "prompt-v2" }));
    expect(otherPrompt.planned[0]?.action).toBe("DISPATCH");
  });

  it("refuses an unpriceable model instead of substituting a priced one", () => {
    const plan = planQuestionCompilation(baseRequest({
      provisions: [packageProvisions()[0]!],
      reservation: { modelId: "anthropic/claude-haiku-4.5", maxInputTokens: 1000, maxOutputTokens: 100 },
    }));
    expect(plan.pricingStatus).toBe("UNKNOWN_MODEL");
    expect(plan.planned.map((unit) => unit.action)).toEqual(["REFUSED_UNPRICEABLE"]);
    expect(plan.simulatedDispatches).toBe(0);
    expect(plan.estimatedWorstCaseUsd).toBeNull();
    expect(plan.measuredProviderCalls).toBe(0);
    expect(plan.statusReasons).toContain("UNPRICEABLE_MODEL");
    expect(plan.status).toBe("REVIEW_REQUIRED");
  });

  it("refuses an unknown operative version and an unknown dependency instead of dispatching", () => {
    const unknownVersion = planQuestionCompilation(baseRequest({
      provisions: [provision({
        id: "s701",
        sectionRef: "7.01",
        families: ["INDEBTEDNESS"],
        operativeVersionId: "UNKNOWN",
        text: "The Borrower shall not incur any Indebtedness.",
      })],
    }));
    expect(unknownVersion.planned[0]?.action).toBe("REFUSED_UNCERTAIN");
    expect(unknownVersion.simulatedDispatches).toBe(0);
    expect(unknownVersion.statusReasons).toEqual(expect.arrayContaining(["UNKNOWN_OPERATIVE_VERSION", "UNCERTAIN_REUSE_CONTRACT"]));
    expect(unknownVersion.permitsCapacity).toBe(false);

    const unknownDependency = planQuestionCompilation(baseRequest({
      provisions: [provision({
        id: "s701",
        sectionRef: "7.01",
        families: ["INDEBTEDNESS"],
        dependencyHashes: { Indebtedness: "UNKNOWN" },
        text: "The Borrower shall not incur any Indebtedness.",
      })],
    }));
    expect(unknownDependency.planned[0]?.action).toBe("REFUSED_UNCERTAIN");
    expect(unknownDependency.simulatedDispatches).toBe(0);
  });

  it("keeps a missing required term and an unresolved article reference visible", () => {
    const missing = planQuestionCompilation(baseRequest({ requiredTerms: ["Indebtedness", "Not A Defined Term"] }));
    expect(missing.missingDefinitions).toContain("Not A Defined Term");
    expect(missing.statusReasons).toContain("MISSING_DEFINITION");
    expect(missing.status).toBe("REVIEW_REQUIRED");

    const article = planQuestionCompilation(baseRequest({
      references: [
        { sourceSectionRef: "7.01", normalizedTarget: "7.02", targetKind: "SECTION", resolved: true, targetAmbiguous: false },
        { sourceSectionRef: "7.02", normalizedTarget: "VII", targetKind: "ARTICLE", resolved: true, targetAmbiguous: false },
      ],
    }));
    expect(article.unresolvedReferences).toBeGreaterThan(0);
    expect(article.statusReasons).toContain("UNRESOLVED_REFERENCE");
    expect(article.planned.map((unit) => unit.sectionRef)).not.toContain("7.04");
  });

  it("does not pick one of two operative bodies for the same section", () => {
    const first = packageProvisions()[0]!;
    const second = provision({
      id: "s701-other",
      sectionRef: "7.01",
      families: ["INDEBTEDNESS"],
      sourceSha256: "sha-other-body",
      text: "The Borrower shall not incur any Indebtedness under a different physical section.",
    });
    const plan = planQuestionCompilation(baseRequest({
      provisions: [first, second],
    }));
    expect(plan.planned.map((unit) => unit.id).sort()).toEqual(["s701", "s701-other"]);
    expect(plan.statusReasons).toContain("AMBIGUOUS_SECTION_IDENTITY");
    expect(plan.status).toBe("REVIEW_REQUIRED");
    expect(plan.permitsCapacity).toBe(false);
  });

  it("blocks a question with no family and a family with no operative entry", () => {
    const noFamily = planQuestionCompilation(baseRequest({ question: "What color is the cover?" }));
    expect(noFamily.status).toBe("BLOCKED");
    expect(noFamily.statusReasons).toContain("NO_FAMILY_MAPPING");
    expect(noFamily.planned).toEqual([]);
    expect(noFamily.simulatedDispatches).toBe(0);

    const contentsOnly = planQuestionCompilation(baseRequest({
      provisions: [packageProvisions().find((row) => row.id === "toc701")!],
    }));
    expect(contentsOnly.status).toBe("BLOCKED");
    expect(contentsOnly.statusReasons).toContain("NO_OPERATIVE_SEED");
    expect(contentsOnly.refusedSources.map((row) => row.id)).toEqual(["toc701"]);
    expect(contentsOnly.simulatedDispatches).toBe(0);
    expect(contentsOnly.measuredProviderCalls).toBe(0);
  });

  it("leaves the worst case unestimated when token caps are absent, and does not convert population counts into the sealed bill", () => {
    const unpriced = planQuestionCompilation(baseRequest({ reservation: undefined }));
    expect(unpriced.pricingStatus).toBe("ESTIMATE_INPUTS_MISSING");
    expect(unpriced.estimatedWorstCaseUsd).toBeNull();
    expect(unpriced.measuredBillingUsd).toBeNull();
    expect(unpriced.simulatedDispatches).toBeGreaterThan(0);
    expect(unpriced.simulatedDispatches).toBeLessThan(packageProvisions().filter((row) => row.structuralKind === "OPERATIVE_OCCURRENCE").length);

    const verification = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/verification.json", "utf8")) as {
      dispatchable: number;
      spend: { exactSpendUsd: number };
    };
    expect(verification.dispatchable).toBe(788);
    expect(verification.spend.exactSpendUsd).toBe(8.777854);
    expect(unpriced.estimatedWorstCaseUsd).not.toBe(verification.spend.exactSpendUsd);
    expect(unpriced.measuredBillingUsd).not.toBe(verification.spend.exactSpendUsd);
  });
});
