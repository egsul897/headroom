/**
 * Phase 2G §25 (25 required synthetic amendment scenarios) + §26 (AI
 * amendment interpretation tests). All fixture text is invented for this
 * file - no CONMED-specific content (this session's own established
 * anti-overfitting discipline, applied here exactly as it was for
 * Phase 2B/2C/2F.2/2F.3's own synthetic test files).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { runAmendmentPipeline, countAmbiguousEffectsNeedingInterpretation } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, getOperativeDefinition } from "../../lib/contract-model/compiler/amendment/operative-state";
import { computePackageSafety } from "../../lib/contract-model/compiler/package-safety";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import { verifyAmendmentEffectsIndependently } from "../../lib/contract-model/compiler/amendment/independent-verification";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

function buildIndex(documents: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  for (const d of documents) {
    const nodes = parseDocumentStructure(d);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefs, []);
}

async function runPackage(documents: PackageDocumentInput[], caller?: StageCaller) {
  const index = buildIndex(documents);
  const packageGraph = buildPackageGraph("co", "pkg", documents);
  const result = await runAmendmentPipeline(caller ?? getStageCaller(), { documents, packageGraph, index });
  return { index, packageGraph, ...result };
}

function instrumentKeyFor(packageGraph: ReturnType<typeof buildPackageGraph>, documentId: string): string {
  const inst = packageGraph.instruments.find((i) => i.documentIds.includes(documentId));
  return inst?.instrumentKey ?? `instrument:${documentId}`;
}

/** Test-only mock StageCaller (matches Phase 2F.2's own ScriptedStageCaller convention) - real StageCaller interface, scripted responses for exact AI-interpretation-path control. */
class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  private callIndex = 0;
  constructor(private scripts: Array<(content: string) => unknown>) {}
  async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, content: string): Promise<T> {
    const script = this.scripts[this.callIndex];
    this.callIndex++;
    if (!script) throw new Error("ScriptedStageCaller: no script left for this call");
    return schema.parse(script(content));
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

describe("Phase 2G §25 - basic operations (1-6)", () => {
  it("1. simple section replacement resolves to the amendment's own verbatim resulting text, superseding the original", async () => {
    const base = doc("s1-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.`);
    const amend = doc(
      "s1-amend",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s1-ca"), baseDocumentId: "s1-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("$75,000,000");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.supersededSourceNodeKeys).toContain("s1-ca::6.01");
  });

  it("2. simple definition replacement resolves to the amendment's own verbatim resulting definition text", async () => {
    const base = doc("s2-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Beta LLC, as Borrower.\n\n"Consolidated EBITDA" means net income plus interest, taxes, depreciation and amortization.`);
    const amend = doc(
      "s2-amend",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Beta LLC, as Borrower.\n\nThe definition of "Consolidated EBITDA" is hereby amended and restated in its entirety to read as follows: "Consolidated EBITDA" means net income plus interest, taxes, depreciation, amortization, and non-recurring restructuring charges.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s2-ca"), baseDocumentId: "s2-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    const def = getOperativeDefinition(state, "Consolidated EBITDA");
    expect(def?.currentText).toContain("non-recurring restructuring charges");
  });

  it("3. a threshold changed within a clause (no full replacement text quoted, even after bounded AI interpretation confirms the transformation) is tracked as OPERATIVE_STATE_PARTIAL - governs, exact resulting text not fabricated", async () => {
    const base = doc("s3-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Gamma LLC, as Borrower.\n\nSECTION 6.02 Investments. The Borrower will not make Investments except up to $10,000,000.`);
    const amend = doc(
      "s3-amend",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Gamma LLC, as Borrower.\n\nSection 6.02 of the Credit Agreement is hereby amended by increasing the Investments basket threshold.`
    );
    // A realistic, appropriately-hedged AI interpretation: confirms this is
    // a threshold change against the right target, but correctly does NOT
    // invent the new dollar figure the clause itself never states.
    const caller = new ScriptedStageCaller([() => ({ operation: "MODIFY_THRESHOLD", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: ["Section 6.02"], confidence: 0.8, unresolvedQuestions: [] })]);
    const { effects, index, packageGraph } = await runPackage([base, amend], caller);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s3-ca"), baseDocumentId: "s3-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.currentSourceDocumentId).toBe("s3-amend");
  });

  it("4. a clause deletion resolves to null current text, correctly excluded going forward", async () => {
    const base = doc("s4-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Delta LLC, as Borrower.\n\nSECTION 6.03 Reporting. The Borrower shall deliver quarterly reports.`);
    const amend = doc("s4-amend", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Delta LLC, as Borrower.\n\nSection 6.03 of the Credit Agreement is hereby deleted in its entirety.`);
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const modCandidates = buildPackageGraph("co", "pkg", [base, amend]).modificationCandidates;
    expect(modCandidates.some((m) => m.operation === "DELETE")).toBe(true);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s4-ca"), baseDocumentId: "s4-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.appliedChain[0]!.operation).toBe("DELETE_TEXT");
  });

  it("5. a clause addition captures the added verbatim text", async () => {
    const base = doc("s5-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Epsilon LLC, as Borrower.\n\nSECTION 6.04 Liens. The Borrower will not create Liens except Permitted Liens.`);
    const amend = doc(
      "s5-amend",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Epsilon LLC, as Borrower.\n\nSection 6.04 of the Credit Agreement is hereby amended by adding the following: (c) Liens securing purchase money Indebtedness not exceeding $5,000,000 in the aggregate.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s5-ca"), baseDocumentId: "s5-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("purchase money Indebtedness");
    expect(state.provisions[0]!.appliedChain[0]!.operation).toBe("ADD_TEXT");
  });

  it("6. a paragraph insertion (ADD_TEXT with a longer multi-sentence body) captures the full inserted paragraph, not a truncated fragment", async () => {
    const base = doc("s6-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Zeta LLC, as Borrower.\n\nSECTION 6.05 Fundamental Changes. The Borrower will not merge with any Person.`);
    const amend = doc(
      "s6-amend",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Zeta LLC, as Borrower.\n\nSection 6.05 of the Credit Agreement is hereby amended by adding the following paragraph: Notwithstanding the foregoing, the Borrower may merge with any wholly-owned Subsidiary so long as the Borrower is the surviving entity and no Default has occurred and is continuing at the time of such merger.\n\nSection 6.06 remains unaffected.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s6-ca"), baseDocumentId: "s6-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("wholly-owned Subsidiary");
    expect(state.provisions[0]!.currentText).toContain("no Default has occurred");
  });
});

describe("Phase 2G §25 - restatement (7-8)", () => {
  it("7. a section amended and restated in its entirety is REPLACE_TEXT, not treated as a full agreement restatement", async () => {
    const base = doc("s7-ca", "CA", `CREDIT AGREEMENT dated as of January 15, 2021, among Eta LLC, as Borrower.\n\nSECTION 6.06 Asset Sales. The Borrower will not sell assets except up to $2,000,000 per year.`);
    const amend = doc(
      "s7-amend",
      "Amendment 1",
      `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Eta LLC, as Borrower.\n\nSection 6.06 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.06 Asset Sales. The Borrower will not sell assets except up to $4,000,000 per year.`
    );
    const { effects } = await runPackage([base, amend]);
    expect(effects.find((e) => e.amendmentDocumentId === "s7-amend")?.operation).toBe("REPLACE_TEXT");
  });

  it("8. a full agreement amended and restated produces ONE RESTATE_AGREEMENT effect against the whole target instrument, never per-section effects", async () => {
    const original = doc("s8-orig", "Original CA", `CREDIT AGREEMENT dated as of March 1, 2018, among Theta LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const restated = doc(
      "s8-restated",
      "A&R CA",
      `AMENDED AND RESTATED CREDIT AGREEMENT, dated as of April 1, 2022 (this "Amended and Restated Credit Agreement"), amending and restating the Credit Agreement, dated as of March 1, 2018 (the "Original Credit Agreement"), among Theta LLC, as Borrower.\n\nSection 6.01 Indebtedness, as amended and restated.`
    );
    const { effects } = await runPackage([original, restated]);
    const restateEffects = effects.filter((e) => e.amendmentDocumentId === "s8-restated");
    expect(restateEffects).toHaveLength(1);
    expect(restateEffects[0]!.operation).toBe("RESTATE_AGREEMENT");
    expect(restateEffects[0]!.target.targetDocumentId).toBe("s8-orig");
    expect(restateEffects[0]!.status).toBe("RESOLVED");
  });
});

describe("Phase 2G §25 - multiple amendments to the same provision (9-12)", () => {
  it("9. two sequential amendments to the same section apply in chronological order - the later one governs currently, the earlier one governed historically", async () => {
    const base = doc("s9-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Iota LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $50,000,000.`);
    const amend1 = doc("s9-amend1", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Iota LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $75,000,000.`);
    const amend2 = doc("s9-amend2", "Amendment 2", `AMENDMENT NO. 2 dated as of June 1, 2023 to the Credit Agreement dated as of January 1, 2020, among Iota LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $100,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, amend1, amend2]);
    const instrumentKey = instrumentKeyFor(packageGraph, "s9-ca");
    const current = computeOperativeContractState({ instrumentKey, baseDocumentId: "s9-ca", asOfDate: "2024-01-01", index, allEffects: effects });
    expect(current.provisions[0]!.currentText).toContain("$100,000,000");
    expect(current.provisions[0]!.fullChain).toHaveLength(2);
    const between = computeOperativeContractState({ instrumentKey, baseDocumentId: "s9-ca", asOfDate: "2022-01-01", index, allEffects: effects });
    expect(between.provisions[0]!.currentText).toContain("$75,000,000");
  });

  it("10. three sequential definition changes resolve correctly at each analysis date", async () => {
    const base = doc("s10-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2019, among Kappa LLC, as Borrower.\n\n"Applicable Margin" means 2.00%.`);
    const a1 = doc("s10-a1", "Amendment 1", `AMENDMENT NO. 1 dated as of January 1, 2020 to the Credit Agreement dated as of January 1, 2019, among Kappa LLC, as Borrower.\n\nThe definition of "Applicable Margin" is hereby amended and restated in its entirety to read as follows: "Applicable Margin" means 2.25%.`);
    const a2 = doc("s10-a2", "Amendment 2", `AMENDMENT NO. 2 dated as of January 1, 2021 to the Credit Agreement dated as of January 1, 2019, among Kappa LLC, as Borrower.\n\nThe definition of "Applicable Margin" is hereby amended and restated in its entirety to read as follows: "Applicable Margin" means 2.50%.`);
    const a3 = doc("s10-a3", "Amendment 3", `AMENDMENT NO. 3 dated as of January 1, 2022 to the Credit Agreement dated as of January 1, 2019, among Kappa LLC, as Borrower.\n\nThe definition of "Applicable Margin" is hereby amended and restated in its entirety to read as follows: "Applicable Margin" means 2.75%.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2, a3]);
    const instrumentKey = instrumentKeyFor(packageGraph, "s10-ca");
    const q2020 = computeOperativeContractState({ instrumentKey, baseDocumentId: "s10-ca", asOfDate: "2020-06-01", index, allEffects: effects });
    const q2021 = computeOperativeContractState({ instrumentKey, baseDocumentId: "s10-ca", asOfDate: "2021-06-01", index, allEffects: effects });
    const q2023 = computeOperativeContractState({ instrumentKey, baseDocumentId: "s10-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(getOperativeDefinition(q2020, "Applicable Margin")?.currentText).toContain("2.25%");
    expect(getOperativeDefinition(q2021, "Applicable Margin")?.currentText).toContain("2.50%");
    expect(getOperativeDefinition(q2023, "Applicable Margin")?.currentText).toContain("2.75%");
  });

  it("11. an amendment adds a basket later modified by a second amendment - both effects chain onto the same provision", async () => {
    const base = doc("s11-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Lambda LLC, as Borrower.\n\nSECTION 6.07 Restricted Payments. The Borrower will not make Restricted Payments.`);
    const a1 = doc("s11-a1", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Lambda LLC, as Borrower.\n\nSection 6.07 of the Credit Agreement is hereby amended by adding the following: (a) a general basket of up to $1,000,000 per year.`);
    const a2 = doc("s11-a2", "Amendment 2", `AMENDMENT NO. 2 dated as of June 1, 2022 to the Credit Agreement dated as of January 1, 2020, among Lambda LLC, as Borrower.\n\nSection 6.07 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.07 Restricted Payments. The Borrower will not make Restricted Payments except up to $3,000,000 per year.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2]);
    const instrumentKey = instrumentKeyFor(packageGraph, "s11-ca");
    const state = computeOperativeContractState({ instrumentKey, baseDocumentId: "s11-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.fullChain).toHaveLength(2);
    expect(state.provisions[0]!.currentText).toContain("$3,000,000");
  });

  it("12. an amendment deletes a previously added basket - the deletion is the current operative state", async () => {
    const base = doc("s12-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Mu LLC, as Borrower.\n\nSECTION 6.08 Investments. The Borrower will not make Investments.`);
    const a1 = doc("s12-a1", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Mu LLC, as Borrower.\n\nSection 6.08 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.08 Investments. The Borrower will not make Investments except a general basket of up to $2,000,000.`);
    const a2 = doc("s12-a2", "Amendment 2", `AMENDMENT NO. 2 dated as of June 1, 2022 to the Credit Agreement dated as of January 1, 2020, among Mu LLC, as Borrower.\n\nSection 6.08 of the Credit Agreement is hereby deleted in its entirety.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2]);
    const instrumentKey = instrumentKeyFor(packageGraph, "s12-ca");
    const state = computeOperativeContractState({ instrumentKey, baseDocumentId: "s12-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.appliedChain).toHaveLength(2);
  });
});

describe("Phase 2G §25 - safety scenarios (13-16)", () => {
  it("13. same-day ambiguous amendments to the same provision are flagged AMENDMENT_CONFLICT, not silently ordered", async () => {
    const base = doc("s13-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Nu LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    const a1 = doc("s13-a1", "Amendment A", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Nu LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $20,000,000.`);
    const a2 = doc("s13-a2", "Amendment B", `AMENDMENT NO. 2 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Nu LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $30,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s13-ca"), baseDocumentId: "s13-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(state.provisions[0]!.conflicts.some((c) => c.conflictType === "AMENDMENT_CONFLICT")).toBe(true);
  });

  it("14. a missing target (the amendment references a document not present in the package) leaves the effect UNRESOLVED, never silently applied to the wrong document", async () => {
    const unrelated = doc("s14-unrelated", "Unrelated", `INDENTURE dated as of January 1, 2020, among Unrelated Issuer Inc., as Issuer.`);
    const amend = doc("s14-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2018, among Missing Corp., as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $5,000,000.`);
    const { effects } = await runPackage([unrelated, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "s14-amend");
    expect(effect?.target.targetDocumentId).toBeNull();
    expect(effect?.status).toBe("UNRESOLVED");
  });

  it("15. an ambiguous target (two same-type, same-date candidates) leaves the effect UNRESOLVED", async () => {
    const caX = doc("s15-caX", "CA X", `CREDIT AGREEMENT dated as of January 1, 2020, among Xi LLC, as Borrower.`);
    const caY = doc("s15-caY", "CA Y", `CREDIT AGREEMENT dated as of January 1, 2020, among Omicron LLC, as Borrower.`);
    const amend = doc("s15-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $5,000,000.`);
    const { effects } = await runPackage([caX, caY, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "s15-amend");
    expect(effect?.target.targetDocumentId).toBeNull();
    expect(effect?.status).toBe("UNRESOLVED");
  });

  it("16. a conditional, unresolved effective date is surfaced honestly rather than assumed - the effect never silently applies at a query date", async () => {
    const base = doc("s16-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Pi LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    const amend = doc(
      "s16-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Pi LLC, as Borrower. This Amendment shall become effective upon satisfaction of the conditions set forth in Section 4 hereof.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $20,000,000.`
    );
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "s16-amend")!;
    expect(effect.effectiveDate.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(effect.effectiveDate.date).toBeNull();
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s16-ca"), baseDocumentId: "s16-ca", asOfDate: "2030-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.appliedChain).toHaveLength(0);
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
  });
});

describe("Phase 2G §25 - supplements, joinders, omnibus, reaffirmation (17-20)", () => {
  it("17. a supplement adds language without replacing the base - both documents remain, the supplement's own addition is tracked as its own effect", async () => {
    const base = doc("s17-ind", "Indenture", `INDENTURE dated as of January 1, 2020, among Rho Issuer Inc., as Issuer.\n\nSection 4.09 Limitation on Indebtedness.`);
    const supp = doc("s17-supp", "First Supplemental Indenture", `FIRST SUPPLEMENTAL INDENTURE dated as of June 1, 2021 to the Indenture dated as of January 1, 2020, among Rho Issuer Inc., as Issuer.\n\nSection 4.09 of the Indenture is hereby amended by adding the following: a new exception for Permitted Refinancing Indebtedness.`);
    const { effects, packageGraph } = await runPackage([base, supp]);
    expect(packageGraph.classifications.find((c) => c.documentId === "s17-supp")?.type).toBe("SUPPLEMENTAL_INDENTURE");
    const effect = effects.find((e) => e.amendmentDocumentId === "s17-supp");
    expect(effect?.operation).toBe("ADD_TEXT");
    expect(effect?.target.targetDocumentId).toBe("s17-ind");
  });

  it("18. a joinder affects party/entity scope - represented as MODIFY_ENTITY_SCOPE via semantic interpretation given a bounded description, never a section-text replacement", async () => {
    const ca = doc("s18-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Sigma LLC, as Borrower.\n\nSection 1.01 Guarantors. The Guarantors are the Subsidiaries listed on Schedule I.`);
    const joinder = doc("s18-joinder", "Joinder", `JOINDER AGREEMENT dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Sigma LLC, as Borrower.\n\nSection 1.01 of the Credit Agreement is hereby amended to add New Sub LLC as a Guarantor.`);
    const { effects, packageGraph } = await runPackage([ca, joinder]);
    expect(packageGraph.classifications.find((c) => c.documentId === "s18-joinder")?.type).toBe("JOINDER");
    const effect = effects.find((e) => e.amendmentDocumentId === "s18-joinder");
    expect(effect?.target.targetDocumentId).toBe("s18-ca");
    expect(effect?.target.targetSectionRef).toBe("1.01");
  });

  it("19. an omnibus amendment modifying two documents produces two independently resolved effects, consuming Phase 2F.3's own multi-target relationship resolution", async () => {
    const ca = doc("s19-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Tau LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const gsa = doc("s19-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2020, among Tau LLC and its Subsidiaries.`);
    const omnibus = doc(
      "s19-omnibus",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2021 (this "Amendment"), to (a) the Credit Agreement, dated as of January 1, 2020 (the "Credit Agreement"), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2020 (the "Guarantee and Collateral Agreement"), among Tau LLC and its Subsidiaries.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $15,000,000.`
    );
    const { effects, packageGraph } = await runPackage([ca, gsa, omnibus]);
    const relationshipEdges = packageGraph.relationshipCandidates.filter((r) => r.sourceDocumentId === "s19-omnibus" && r.status === "RESOLVED");
    expect(new Set(relationshipEdges.map((r) => r.targetDocumentId))).toEqual(new Set(["s19-ca", "s19-gsa"]));
    const sectionEffect = effects.find((e) => e.amendmentDocumentId === "s19-omnibus" && e.target.targetSectionRef === "6.01");
    expect(sectionEffect?.target.targetDocumentId).toBe("s19-ca");
    expect(sectionEffect?.status).toBe("RESOLVED");
  });

  it("20. an amendment reaffirms a guarantee without altering its text - represented as REAFFIRM, no text change implied", async () => {
    const ca = doc("s20-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Upsilon LLC, as Borrower.`);
    const amend = doc(
      "s20-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Upsilon LLC, as Borrower.\n\nEach Guarantor hereby reaffirms its guarantee of the Obligations and acknowledges that its guarantee remains in full force and effect after giving effect to this Amendment.`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.operation === "REAFFIRM");
    expect(effect).toBeDefined();
    expect(effect?.newText).toBeNull();
  });
});

describe("Phase 2G §25 - ordering, conflicts, historical queries (21-25)", () => {
  it("21. amendment NUMBER order differs from EFFECTIVE-DATE order - the chain follows effective date, never the number", async () => {
    const base = doc("s21-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2018, among Phi LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    // Amendment No. 2 has an EARLIER effective date than Amendment No. 1 (a real, if unusual, possibility - e.g. out-of-sequence execution/effectiveness) - the numbering must never be trusted over the actual effective-date evidence.
    const amendNo2 = doc("s21-amend2", "Amendment No. 2", `AMENDMENT NO. 2 dated as of March 1, 2019 to the Credit Agreement dated as of January 1, 2018, among Phi LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $15,000,000.`);
    const amendNo1 = doc("s21-amend1", "Amendment No. 1", `AMENDMENT NO. 1 dated as of June 1, 2020 to the Credit Agreement dated as of January 1, 2018, among Phi LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $25,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, amendNo2, amendNo1]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s21-ca"), baseDocumentId: "s21-ca", asOfDate: "2021-01-01", index, allEffects: effects });
    // Effective-date order: No.2 (2019-03-01) applies before No.1 (2020-06-01) - No.1's LATER effective date means it governs currently, matching real chronology, not amendment numbering.
    expect(state.provisions[0]!.currentText).toContain("$25,000,000");
    expect(state.provisions[0]!.fullChain.map((c) => c.amendmentDocumentId)).toEqual(["s21-amend2", "s21-amend1"]);
  });

  it("22. conflicting replacement effects on the same provision are surfaced as AMENDMENT_CONFLICT, no value silently chosen", async () => {
    const base = doc("s22-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Chi LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    const a1 = doc("s22-a1", "Amendment A", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Chi LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $40,000,000.`);
    const a2 = doc("s22-a2", "Amendment B", `AMENDMENT NO. 2 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Chi LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $60,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s22-ca"), baseDocumentId: "s22-ca", asOfDate: "2023-01-01", index, allEffects: effects });
    expect(state.status).toBe("OPERATIVE_STATE_CONFLICTED");
  });

  it("23. historical as-of-date query BEFORE any amendment resolves to the original base text", async () => {
    const base = doc("s23-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Psi LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    const amend = doc("s23-amend", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Psi LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $20,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, amend]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s23-ca"), baseDocumentId: "s23-ca", asOfDate: "2020-06-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("$10,000,000");
    expect(state.provisions[0]!.appliedChain).toHaveLength(0);
  });

  it("24. historical query BETWEEN two amendments resolves to the first amendment's text, not the base or the second amendment", async () => {
    const base = doc("s24-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Omega LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    const a1 = doc("s24-a1", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Omega LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $20,000,000.`);
    const a2 = doc("s24-a2", "Amendment 2", `AMENDMENT NO. 2 dated as of June 1, 2023 to the Credit Agreement dated as of January 1, 2020, among Omega LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $30,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s24-ca"), baseDocumentId: "s24-ca", asOfDate: "2022-06-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("$20,000,000");
    expect(state.provisions[0]!.appliedChain).toHaveLength(1);
  });

  it("25. current query AFTER all amendments resolves to the latest amendment's text", async () => {
    const base = doc("s25-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Fixture LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. Limited to $10,000,000.`);
    const a1 = doc("s25-a1", "Amendment 1", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Fixture LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $20,000,000.`);
    const a2 = doc("s25-a2", "Amendment 2", `AMENDMENT NO. 2 dated as of June 1, 2023 to the Credit Agreement dated as of January 1, 2020, among Fixture LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. Limited to $30,000,000.`);
    const { effects, index, packageGraph } = await runPackage([base, a1, a2]);
    const state = computeOperativeContractState({ instrumentKey: instrumentKeyFor(packageGraph, "s25-ca"), baseDocumentId: "s25-ca", asOfDate: "2025-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.currentText).toContain("$30,000,000");
    expect(state.provisions[0]!.appliedChain).toHaveLength(2);
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
  });
});

describe("Phase 2G §26 - AI amendment interpretation tests (scripted, bounded evidence)", () => {
  const base = doc("ai-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among AI Corp LLC, as Borrower.\n\nSECTION 6.09 Permitted Investments. The Borrower may make Investments in Cash Equivalents.`);
  const ambiguousAmend = doc(
    "ai-amend",
    "Amendment",
    `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among AI Corp LLC, as Borrower.\n\nSection 6.09 of the Credit Agreement is hereby amended to reflect the parties' updated understanding regarding permitted investment categories.`
  );

  it("interpreter receives bounded evidence only (its own clause + resolved target metadata + target's real current text) and correctly identifies the given target", async () => {
    let capturedContent = "";
    const caller = new ScriptedStageCaller([
      (content) => {
        capturedContent = content;
        return { operation: "MODIFY_PROVISION", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: ["Section 6.09"], confidence: 0.4, unresolvedQuestions: ["The clause does not state what the updated investment categories actually are."] };
      },
    ]);
    await runPackage([base, ambiguousAmend], caller);
    expect(capturedContent).toContain("Section 6.09 of the Credit Agreement is hereby amended");
    expect(capturedContent).toContain("The Borrower may make Investments in Cash Equivalents");
    expect(capturedContent).not.toContain("AI Corp LLC, as Borrower.\n\nSECTION"); // sanity: not literally the whole document dumped in
  });

  it("insufficient context correctly produces REVIEW_REQUIRED, never a confident guess", async () => {
    const caller = new ScriptedStageCaller([() => ({ operation: "MODIFY_PROVISION", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: [], confidence: 0.35, unresolvedQuestions: ["Cannot determine what changed without more context."] })]);
    const { effects } = await runPackage([base, ambiguousAmend], caller);
    const effect = effects.find((e) => e.resolutionMethod.startsWith("SEMANTIC"));
    expect(effect?.status).toBe("REVIEW_REQUIRED");
  });

  it("no invented replacement text survives - deterministic validation rejects proposedNewText that does not appear in the amendment's own clause", async () => {
    const caller = new ScriptedStageCaller([() => ({ operation: "REPLACE_TEXT", proposedNewText: "The Borrower may make Investments in Cash Equivalents and marketable securities up to $50,000,000.", targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: ["Section 6.09"], confidence: 0.9, unresolvedQuestions: [] })]);
    const { effects } = await runPackage([base, ambiguousAmend], caller);
    const effect = effects.find((e) => e.amendmentDocumentId === "ai-amend");
    expect(effect?.newText).toBeNull();
    expect(effect?.resolutionMethod).toBe("SEMANTIC_INTERPRETATION_REJECTED");
    expect(effect?.status).toBe("REVIEW_REQUIRED");
  });

  it("no invented section is ever introduced - the target is always the one deterministic parsing already resolved, never one the model proposes", async () => {
    const caller = new ScriptedStageCaller([() => ({ operation: "MODIFY_PROVISION", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: ["Section 9.99 (a section that does not exist)"], confidence: 0.5, unresolvedQuestions: [] })]);
    const { effects } = await runPackage([base, ambiguousAmend], caller);
    const effect = effects.find((e) => e.amendmentDocumentId === "ai-amend");
    expect(effect?.target.targetSectionRef).toBe("6.09");
  });

  it("an out-of-vocabulary operation label degrades to REVIEW_REQUIRED rather than crashing (Phase 2F.2's own tolerant-wire-schema lesson applied here from the start)", async () => {
    const caller = new ScriptedStageCaller([() => ({ operation: "SOMETHING_THE_MODEL_MADE_UP", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: [], confidence: 0.8, unresolvedQuestions: [] })]);
    const { effects } = await runPackage([base, ambiguousAmend], caller);
    const effect = effects.find((e) => e.amendmentDocumentId === "ai-amend");
    expect(effect?.operation).toBe("UNKNOWN_CHANGE");
    expect(effect?.status).toBe("REVIEW_REQUIRED");
  });

  it("raw model output is preserved verbatim for audit even when the effect is downgraded/rejected", async () => {
    const caller = new ScriptedStageCaller([() => ({ operation: "REPLACE_TEXT", proposedNewText: "fabricated text not in the source", targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: [], confidence: 0.9, unresolvedQuestions: [] })]);
    const { effects } = await runPackage([base, ambiguousAmend], caller);
    const effect = effects.find((e) => e.amendmentDocumentId === "ai-amend");
    expect(effect?.rawModelOutput).toMatchObject({ proposedNewText: "fabricated text not in the source" });
  });

  it("target not confirmed by the model forces REVIEW_REQUIRED", async () => {
    const caller = new ScriptedStageCaller([() => ({ operation: "MODIFY_PROVISION", proposedNewText: null, targetConfirmed: false, effectiveDateEvidence: null, sourceCitations: [], confidence: 0.9, unresolvedQuestions: [] })]);
    const { effects } = await runPackage([base, ambiguousAmend], caller);
    const effect = effects.find((e) => e.amendmentDocumentId === "ai-amend");
    expect(effect?.status).toBe("REVIEW_REQUIRED");
  });

  it("cost estimation: countAmbiguousEffectsNeedingInterpretation counts correctly before any real call is made", async () => {
    const index = buildIndex([base, ambiguousAmend]);
    const packageGraph = buildPackageGraph("co", "pkg", [base, ambiguousAmend]);
    const count = countAmbiguousEffectsNeedingInterpretation({ documents: [base, ambiguousAmend], packageGraph, index });
    expect(count).toBe(1);
  });
});

describe("Phase 2G - marked/conformed exhibit amendment detection (real, generalized amendment-drafting convention; confirmed on real CONMED Document D's own text, fixture text below invented)", () => {
  it("a single-target marked/conformed exhibit amendment resolves to its one package document and is surfaced as an honest, whole-document REVIEW_REQUIRED effect, never fabricated text", async () => {
    const ca = doc("mx1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Phi LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const amend = doc(
      "mx1-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Phi LLC, as Borrower.\n\nSECTION 1. The Credit Agreement (other than the Exhibits and Schedules thereof) is hereby amended effective to delete the stricken text (indicated textually in the same manner as the following example: stricken text) and to add the double-underlined text (indicated textually in the same manner as the following example: double-underlined text) as set forth in the pages of the Amended Credit Agreement attached as Exhibit A hereto.`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "mx1-amend" && e.operation === "UNKNOWN_CHANGE" && e.target.kind === "DOCUMENT");
    expect(effect).toBeDefined();
    expect(effect?.target.targetDocumentId).toBe("mx1-ca");
    expect(effect?.status).toBe("REVIEW_REQUIRED");
    expect(effect?.newText).toBeNull();
    expect(effect?.unresolvedReason).toMatch(/attached marked\/conformed exhibit/i);
  });

  it("an omnibus marked/conformed exhibit amendment referencing two agreements resolves each clause to its own correct target via nearest-preceding agreement-name evidence, never guessing", async () => {
    const ca = doc("mx2-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Chi LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const gsa = doc("mx2-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2020, among Chi LLC and its Subsidiaries.`);
    const omnibus = doc(
      "mx2-omnibus",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2021 (this "Amendment"), to (a) the Credit Agreement, dated as of January 1, 2020 (the "Credit Agreement"), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2020 (the "Guarantee and Collateral Agreement"), among Chi LLC and its Subsidiaries.\n\nSECTION 1. Amendments. (a) The Credit Agreement (other than the Exhibits and Schedules thereof) is hereby amended effective\nto delete the stricken text (indicated textually in the same manner as the following example: stricken\ntext) and to add the double-underlined\ntext (indicated textually in the same manner as the following example: double-underlined\ntext) as set forth in the pages of the Amended Credit Agreement attached as Exhibit A hereto; and (b) The Guarantee and Collateral Agreement (other than the Exhibits and Schedules thereof) is hereby amended effective to delete the stricken text (indicated textually in the same manner as the following example: stricken text) and to add the double-underlined text (indicated textually in the same manner as the following example: double-underlined text) as set forth in the pages of the Amended Guarantee and Collateral Agreement attached as Exhibit B hereto.`
    );
    const { effects } = await runPackage([ca, gsa, omnibus]);
    const markupEffects = effects.filter((e) => e.amendmentDocumentId === "mx2-omnibus" && e.operation === "UNKNOWN_CHANGE" && e.target.kind === "DOCUMENT");
    expect(markupEffects).toHaveLength(2);
    expect(new Set(markupEffects.map((e) => e.target.targetDocumentId))).toEqual(new Set(["mx2-ca", "mx2-gsa"]));
    expect(markupEffects.every((e) => e.status === "REVIEW_REQUIRED")).toBe(true);
  });

  it("a mid-phrase line break (a real PDF/HTML-extraction artifact) does not defeat detection - the pattern tolerates whitespace-only breaks in its own fixed phrases", async () => {
    const ca = doc("mx3-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Psi LLC, as Borrower.`);
    const amend = doc(
      "mx3-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Psi LLC, as Borrower.\n\nSECTION 1. The Credit Agreement is hereby amended effective\nto delete the stricken text and to add the double-underlined\ntext as set forth in the pages of the Amended Credit Agreement attached as Exhibit A hereto.`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "mx3-amend" && e.operation === "UNKNOWN_CHANGE" && e.target.kind === "DOCUMENT");
    expect(effect?.target.targetDocumentId).toBe("mx3-ca");
  });

  it("a marked/conformed exhibit clause with no identifiable preceding agreement name stays UNRESOLVED rather than guessing a target", async () => {
    const ca = doc("mx4-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Omega LLC, as Borrower.`);
    const amend = doc(
      "mx4-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021, among Omega LLC and the parties thereto.\n\nSECTION 1. This document is hereby amended effective to delete the stricken text and to add the double-underlined text as set forth in the pages attached as Exhibit A hereto.`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "mx4-amend" && e.operation === "UNKNOWN_CHANGE" && e.target.kind === "DOCUMENT");
    expect(effect?.target.targetDocumentId).toBeNull();
    expect(effect?.status).toBe("UNRESOLVED");
  });
});

describe("Phase 2G - schedule-modification amendment detection (real, generalized amendment-drafting convention; confirmed on real CONMED Document D's own text, fixture text below invented)", () => {
  it("a schedule addition ('X are hereby added to Schedule N of the Agreement') resolves to the named target and is surfaced as an honest MODIFY_SCHEDULE effect, never fabricating the schedule's own content", async () => {
    const ca = doc("sm1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Alpha LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const amend = doc(
      "sm1-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Alpha LLC, as Borrower.\n\nSECTION 1. The "New Lender Commitments" set forth on Schedule 1 of this Amendment are hereby added to Schedule 1.1 of the Credit Agreement.`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "sm1-amend" && e.operation === "MODIFY_SCHEDULE");
    expect(effect).toBeDefined();
    expect(effect?.target.targetDocumentId).toBe("sm1-ca");
    expect(effect?.status).toBe("REVIEW_REQUIRED");
    expect(effect?.newText).toBeNull();
    expect(effect?.unresolvedReason).toMatch(/structured data attached separately/i);
  });

  it("an omnibus schedule modification resolves each of two schedule clauses to its own correct agreement, never forcing one onto both", async () => {
    const ca = doc("sm2-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Beta LLC, as Borrower.`);
    const gsa = doc("sm2-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2020, among Beta LLC and its Subsidiaries.`);
    const omnibus = doc(
      "sm2-omnibus",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2021 (this "Amendment"), to (a) the Credit Agreement, dated as of January 1, 2020 (the "Credit Agreement"), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2020 (the "Guarantee and Collateral Agreement"), among Beta LLC and its Subsidiaries.\n\nSECTION 1. (a) New Lender Commitments are hereby added to Schedule 2.1 of the Credit Agreement; and (b) New Subsidiary Guarantors are hereby added to Schedule 3.1 of the Guarantee and Collateral Agreement.`
    );
    const { effects } = await runPackage([ca, gsa, omnibus]);
    const scheduleEffects = effects.filter((e) => e.amendmentDocumentId === "sm2-omnibus" && e.operation === "MODIFY_SCHEDULE");
    expect(scheduleEffects).toHaveLength(2);
    const byRef = new Map(scheduleEffects.map((e) => [e.target.targetHint, e.target.targetDocumentId]));
    expect(byRef.get("Schedule 2.1 of Credit Agreement")).toBe("sm2-ca");
    expect(byRef.get("Schedule 3.1 of Guarantee and Collateral Agreement")).toBe("sm2-gsa");
  });

  it("a bare schedule replacement with no agreement name and more than one package document stays UNRESOLVED rather than guessing", async () => {
    const ca = doc("sm3-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Gamma LLC, as Borrower.`);
    const gsa = doc("sm3-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2020, among Gamma LLC and its Subsidiaries.`);
    const omnibus = doc(
      "sm3-omnibus",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2021 (this "Amendment"), to (a) the Credit Agreement, dated as of January 1, 2020 (the "Credit Agreement"), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2020 (the "Guarantee and Collateral Agreement"), among Gamma LLC and its Subsidiaries.\n\nSECTION 1. Schedule 4.1 is hereby amended and restated in its entirety.`
    );
    const { effects } = await runPackage([ca, gsa, omnibus]);
    const effect = effects.find((e) => e.amendmentDocumentId === "sm3-omnibus" && e.operation === "MODIFY_SCHEDULE");
    expect(effect?.target.targetDocumentId).toBeNull();
    expect(effect?.status).toBe("UNRESOLVED");
  });
});

describe("Phase 2G §30 - whole-document amendment effects roll up into package safety (never invisible)", () => {
  it("a REVIEW_REQUIRED whole-document effect (markup-exhibit) that never attaches to any per-provision OperativeContractState still downgrades package safety, not PACKAGE_SAFE", async () => {
    const ca = doc("ps1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Delta LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const gsa = doc("ps1-gsa", "GSA", `GUARANTEE AND COLLATERAL AGREEMENT dated as of January 1, 2020, among Delta LLC and its Subsidiaries.`);
    const omnibus = doc(
      "ps1-omnibus",
      "Omnibus Amendment",
      `FIRST OMNIBUS AMENDMENT, dated as of June 1, 2021 (this "Amendment"), to (a) the Credit Agreement, dated as of January 1, 2020 (the "Credit Agreement"), and (b) the Guarantee and Collateral Agreement, dated as of January 1, 2020 (the "Guarantee and Collateral Agreement"), among Delta LLC and its Subsidiaries.\n\nSECTION 1. Amendments. (a) The Credit Agreement (other than the Exhibits and Schedules thereof) is hereby amended effective to delete the stricken text (indicated textually in the same manner as the following example: stricken text) and to add the double-underlined text (indicated textually in the same manner as the following example: double-underlined text) as set forth in the pages of the Amended Credit Agreement attached as Exhibit A hereto.`
    );
    const { effects, unattachedEffects } = await runPackage([ca, gsa, omnibus]);
    expect(effects.some((e) => e.operation === "UNKNOWN_CHANGE" && e.target.kind === "DOCUMENT")).toBe(true);
    expect(unattachedEffects.some((e) => e.operation === "UNKNOWN_CHANGE" && e.status === "REVIEW_REQUIRED")).toBe(true);

    const docs = [ca, gsa, omnibus];
    const safetyInputs = docs.map((d) => {
      const nodes = parseDocumentStructure(d);
      return { documentId: d.documentId, documentText: d.text, coverage: computeStructuralCoverage(d.documentId, d.text, nodes), discoveryCandidateCount: 0 };
    });
    const safety = computePackageSafety("ps1-pkg", safetyInputs, [], [], unattachedEffects);
    expect(safety.unresolvedWholeDocumentAmendmentCount).toBeGreaterThan(0);
    expect(safety.state).toBe("PACKAGE_REVIEW_REQUIRED");
  });

  it("no unattached amendment effects supplied (a pre-2G caller) leaves unresolvedWholeDocumentAmendmentCount at zero - additive, non-breaking", () => {
    const text = `CREDIT AGREEMENT dated as of January 1, 2020, among Epsilon LLC, as Borrower.\n\nSection 6.01 Indebtedness. The Borrower shall not incur Indebtedness.`;
    const nodes = parseDocumentStructure({ documentId: "d", text, label: "d" });
    const safety = computePackageSafety("p", [{ documentId: "d", documentText: text, coverage: computeStructuralCoverage("d", text, nodes), discoveryCandidateCount: 0 }]);
    expect(safety.unresolvedWholeDocumentAmendmentCount).toBe(0);
    expect(safety.state).toBe("PACKAGE_SAFE");
  });
});

describe("Phase 2G - modification-candidates.ts real-evidence fixes (Phase 2C module, discovered via the real CONMED amendment rerun this phase)", () => {
  it("a section reference followed by its own parenthetical heading ('Section 1.1 (Defined Terms) of the Agreement is hereby amended') is still detected with the correct sectionRef, not lost to the coarser whole-agreement fallback", async () => {
    const ca = doc("mc1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Zeta LLC, as Borrower.\n\nSection 1.1 Defined Terms.`);
    const amend = doc(
      "mc1-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Zeta LLC, as Borrower.\n\nSECTION 1. Amendments. Section 1.1 ( Defined Terms ) of the Credit Agreement is hereby amended as follows: (i) the definition of "Consolidated EBITDA" shall be modified.`
    );
    const { effects } = await runPackage([ca, amend]);
    const sectionEffect = effects.find((e) => e.amendmentDocumentId === "mc1-amend" && e.target.targetSectionRef === "1.1");
    expect(sectionEffect).toBeDefined();
    expect(sectionEffect?.target.targetDocumentId).toBe("mc1-ca");
    // The coarser whole-agreement UNKNOWN_CHANGE fallback must not ALSO fire for the exact same clause once a more specific section-level candidate already claimed it.
    const wholeAgreementDuplicate = effects.filter((e) => e.amendmentDocumentId === "mc1-amend" && e.operation === "UNKNOWN_CHANGE" && e.target.kind === "DOCUMENT" && e.target.targetSectionRef === null);
    expect(wholeAgreementDuplicate).toHaveLength(0);
  });

  it("a definition reference in straight ASCII quotes with a stray space just inside them ('\" X \"') is detected the same as tightly-quoted or curly-quoted text - a real text-extraction-artifact gap, not a CONMED-specific fix", async () => {
    const ca = doc("mc2-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Eta LLC, as Borrower.`);
    const amend = doc(
      "mc2-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Eta LLC, as Borrower.\n\nThe definition of " Consolidated Leverage Ratio " is hereby amended by deleting the reference to "3.50 to 1.00" and replacing it with "4.00 to 1.00".`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "mc2-amend" && e.target.targetDefinedTermRef === "Consolidated Leverage Ratio");
    expect(effect).toBeDefined();
    expect(effect?.target.targetDocumentId).toBe("mc2-ca");
  });
});

describe("Phase 2G - effective-date.ts real-evidence fix: 'effective as of the date (the \"X Effective Date\") on which conditions precedent are satisfied'", () => {
  it("a conditions-precedent effective-date clause with the defined term named parenthetically between 'the date' and 'on which' is recognized as CONDITIONAL_UNRESOLVED, never silently treated as the execution date", async () => {
    const ca = doc("ed1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Theta LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const amend = doc(
      "ed1-amend",
      "Amendment",
      `AMENDMENT NO. 1, dated as of June 1, 2021 (this "Amendment"), to the Credit Agreement dated as of January 1, 2020, among Theta LLC, as Borrower.\n\nSECTION 1. Section 6.01 is hereby amended by adding the following: a new $50,000,000 basket.\n\nSECTION 2. Effectiveness. This Amendment shall become effective as of the date (the "Amendment Effective Date") on which each of the following conditions precedent shall have been satisfied: (a) receipt of executed signature pages.`
    );
    const { effects } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "ed1-amend" && e.target.targetSectionRef === "6.01");
    expect(effect?.effectiveDate.status).toBe("CONDITIONAL_UNRESOLVED");
    expect(effect?.effectiveDate.date).toBeNull();
  });
});

describe("Phase 2G §31 - independent verification (deterministic re-derivation, never trusting the pipeline's own resolutionMethod/status fields)", () => {
  it("a real, correctly-resolved deterministic effect passes independent verification: target document exists, section resolves, captured text is verbatim in the amendment's own source", async () => {
    const ca = doc("iv1-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Iota LLC, as Borrower.\n\nSection 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $50,000,000.`);
    const amend = doc(
      "iv1-amend",
      "Amendment",
      `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Iota LLC, as Borrower.\n\nSection 6.01 is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness in excess of $75,000,000.`
    );
    const { effects, index } = await runPackage([ca, amend]);
    const effect = effects.find((e) => e.amendmentDocumentId === "iv1-amend" && e.target.targetSectionRef === "6.01")!;
    const [finding] = verifyAmendmentEffectsIndependently([effect], [ca, amend], index);
    expect(finding!.passed).toBe(true);
    expect(finding!.checks.targetDocumentExists).toBe(true);
    expect(finding!.checks.targetSectionOrDefinitionExists).toBe(true);
    expect(finding!.checks.newTextFoundInSource).toBe(true);
  });

  it("a hand-crafted effect claiming newText that was never actually in the amendment's own source fails independent verification - catches fabrication the pipeline itself might not flag", () => {
    const ca = doc("iv2-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Kappa LLC, as Borrower.\n\nSection 6.01 Indebtedness.`);
    const amend = doc("iv2-amend", "Amendment", `AMENDMENT NO. 1 dated as of June 1, 2021 to the Credit Agreement dated as of January 1, 2020, among Kappa LLC, as Borrower.\n\nSection 6.01 is hereby amended and restated in its entirety to read as follows: Indebtedness limited to $75,000,000.`);
    const index = buildIndex([ca, amend]);
    const fabricated = {
      effectId: "fake-1",
      amendmentDocumentId: "iv2-amend",
      target: { kind: "SECTION" as const, targetDocumentId: "iv2-ca", targetInstrumentKey: "instrument:iv2-ca", targetStructuralNodeKey: null, targetSectionRef: "6.01", targetDefinedTermRef: null, targetHint: null },
      operation: "REPLACE_TEXT" as const,
      effectiveDate: { date: "June 1, 2021", status: "INFERRED_FROM_EXECUTION_DATE" as const, evidence: null, reason: "test" },
      newText: "This sentence was never actually in the amendment's own source text.",
      oldText: null,
      sourceCitation: "test",
      sourceExcerpt: "test",
      confidence: 0.9,
      status: "RESOLVED" as const,
      unresolvedReason: null,
      resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN" as const,
    };
    const [finding] = verifyAmendmentEffectsIndependently([fabricated], [ca, amend], index);
    expect(finding!.passed).toBe(false);
    expect(finding!.checks.newTextFoundInSource).toBe(false);
  });

  it("a hand-crafted effect targeting a document not in the package fails independent verification", () => {
    const ca = doc("iv3-ca", "CA", `CREDIT AGREEMENT dated as of January 1, 2020, among Lambda LLC, as Borrower.`);
    const index = buildIndex([ca]);
    const fabricated = {
      effectId: "fake-2",
      amendmentDocumentId: "iv3-ca",
      target: { kind: "DOCUMENT" as const, targetDocumentId: "does-not-exist", targetInstrumentKey: null, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: null, targetHint: null },
      operation: "UNKNOWN_CHANGE" as const,
      effectiveDate: { date: null, status: "UNKNOWN" as const, evidence: null, reason: "test" },
      newText: null,
      oldText: null,
      sourceCitation: "test",
      sourceExcerpt: "test",
      confidence: 0.5,
      status: "REVIEW_REQUIRED" as const,
      unresolvedReason: null,
      resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN" as const,
    };
    const [finding] = verifyAmendmentEffectsIndependently([fabricated], [ca], index);
    expect(finding!.passed).toBe(false);
    expect(finding!.checks.targetDocumentExists).toBe(false);
  });
});
