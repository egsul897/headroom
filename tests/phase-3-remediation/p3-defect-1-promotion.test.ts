/**
 * P3-DEFECT-1 — the discovery→compilation promotion seam.
 *
 * The V3.1.1 backlog attributed 20 NO_CREDIT cases to a production seam that "found the
 * provision and never compiled it". These tests establish, from production source and
 * from the frozen run artifacts, that no such production seam exists, and they lock the
 * facts so a later mission cannot re-derive the same misdiagnosis.
 *
 * There is deliberately no red baseline here. §3 asks for tests that fail before a
 * production fix "for the intended reason"; the intended reason does not exist, and
 * manufacturing a failing test for a defect that is not there would be the wrong record.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compilePackageToIR, isEligibleForSemanticCompilation } from "../../lib/contract-model/compiler/semantic/package-compile";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { DiscoveredCandidate, DiscoveryRole } from "../../lib/contract-model/compiler/discovery/types";
import { testCompilerInput } from "../contract-model/semantic-compiler/test-helpers";
import { harnessFacts, productionIntakeFacts, lsbCitationFacts, discoveryAt, readJson, read, PATHS } from "../../scripts/p3-defect-1/build-artifacts-exports";
import { TARGET_CLASSIFICATIONS } from "../../scripts/p3-defect-1/classification";
import { targetBaseline, falseCreditGate } from "../../scripts/p3-defect-1/build-artifacts";

const ROOT = process.cwd();

function fakeCaller(): SemanticCaller & { callCount: number } {
  let callCount = 0;
  const result: SemanticCallerResult = {
    submission: { rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] },
    rawSubmission: {},
    toolCallLog: [],
    telemetry: null,
    failureReason: null,
    failureDetail: null,
  };
  return {
    providerName: "fake",
    model: "fake-model",
    isSynthetic: false,
    get callCount() {
      return callCount;
    },
    async compile() {
      callCount++;
      return result;
    },
  } as SemanticCaller & { callCount: number };
}

function candidate(discoveryId: string, role: DiscoveryRole = "BASKET"): DiscoveredCandidate {
  return {
    discoveryId,
    documentId: "sem-test-doc",
    structuralNodeKeys: [],
    structuralNodeIds: ["node-1"],
    normalizedSourceRef: "9.01",
    families: [],
    role,
    roleRaw: role,
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test candidate",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "§9.01",
    discoveryRunVersion: "test-v1",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "test fixture",
  } as DiscoveredCandidate;
}

describe("P3-DEFECT-1: the production promotion seam", () => {
  it("1. production applies no numeric cap between eligibility and compilation", () => {
    const facts = productionIntakeFacts();
    expect(facts.intakeExpressionPresentInProduction).toBe(true);
    expect(facts.intakeWindowChars).toBeGreaterThan(500);
    expect(facts.capMatchesInIntakeWindow).toEqual([]);
    expect(facts.numericCapInOrchestratorIntake).toBe(false);
    expect(facts.numericCapInPackageCompile).toBe(false);
  });

  it("2. compilePackageToIR compiles every eligible candidate, with no ceiling", async () => {
    const caller = fakeCaller();
    const n = 200;
    const candidates = Array.from({ length: n }, (_, i) => ({
      candidate: candidate(`cand-${i}`),
      compilerInput: testCompilerInput({ candidateRef: `cand-${i}` }),
    }));
    const summary = await compilePackageToIR("sem-test-co", "sem-test-instrument", candidates, { caller });
    expect(summary.totalCandidates).toBe(n);
    expect(summary.eligibleCount).toBe(n);
    expect(summary.skipped).toEqual([]);
    expect(summary.results).toHaveLength(n);
    expect(caller.callCount).toBe(n);
  });

  it("3. eligibility excludes representations-and-warranties boilerplate and nothing else", () => {
    const roles: DiscoveryRole[] = ["BASKET", "GENERAL_PROHIBITION", "TRIGGER", "REPRESENTATION"];
    const decisions = Object.fromEntries(roles.map((r) => [r, isEligibleForSemanticCompilation(candidate("x", r)).eligible]));
    expect(decisions.REPRESENTATION).toBe(false);
    expect(decisions.BASKET).toBe(true);
    expect(decisions.TRIGGER).toBe(true);
    // A section-level chapeau container is GENERAL_PROHIBITION - the shape several
    // target cases hang on. It has always been eligible.
    expect(decisions.GENERAL_PROHIBITION).toBe(true);
  });

  it("4. the frozen DSGR benchmark evidence was produced under a 30-candidate harness cap", () => {
    const { dsgr } = harnessFacts();
    expect(dsgr.compileCapDeclaredInHarness).toBe(30);
    expect(dsgr.budgetCeilingUsdDeclaredInHarness).toBe(30);
    expect(dsgr.discoveryCandidates).toBe(2847);
    expect(dsgr.eligibleForCompilation).toBe(2687);
    expect(dsgr.compiled).toBe(30);
    expect(dsgr.compilationRanForFractionOfEligible).toBeLessThan(0.02);
    // The cap is in the harness script, never in production.
    expect(read(PATHS.blindRunScript)).toContain("eligibleOrdered.slice(0, COMPILE_CAP)");
  });

  it("5. not one Article VI candidate was ever compiled in the frozen DSGR run", () => {
    const { dsgr } = harnessFacts();
    expect(dsgr.articleViCandidatesCompiled).toBe(0);
    expect(dsgr.compiledDocuments).toEqual(["doc-a"]);
    // Every compiled section is Article I.
    expect(dsgr.compiledSectionRefs.every((r) => r.startsWith("1."))).toBe(true);
  });

  it("6. discovery DID find candidates at every DSGR target address - these are not discovery misses", () => {
    for (const t of targetBaseline().filter((b) => b.dataset === "dsgr")) {
      expect(t.discoveryCandidatesAtOrUnderClaimAddress, t.caseId).toBeGreaterThan(0);
      expect(t.compiledOfThose, t.caseId).toBe(0);
    }
    // And the five cases the V3.1.1 backlog called DISCOVERY_MISS were discovered too.
    for (const [doc, ref] of [["doc-a", "6.01"], ["doc-b", "6.01"], ["doc-d", "6.01"], ["doc-a", "6.04"], ["doc-a", "6.08"]] as const) {
      expect(discoveryAt("dsgr", doc, ref).found, `${doc} ${ref}`).toBeGreaterThan(0);
    }
  });

  it("7. the CONMED evidence has no compilation stage at all, yet discovery found every target section", () => {
    const { conmed } = harnessFacts();
    expect(conmed.stagesPresent).toEqual(["1", "2", "3", "4", "5"]);
    expect(conmed.compilationStagePresent).toBe(false);
    for (const t of targetBaseline().filter((b) => b.dataset === "conmed")) {
      expect(t.discoveryCandidatesAtOrUnderClaimAddress, t.caseId).toBeGreaterThan(0);
      expect(t.compiledOfThose, t.caseId).toBe(0);
    }
    // No compiled rule exists anywhere in the CONMED population.
    const packet = readJson(PATHS.packet);
    const conmedCompiled = packet.cases
      .filter((c: any) => c.documentId === "conmed-doc-a-eighth-ar-credit-agreement")
      .flatMap((c: any) => c.systemOutput)
      .filter((s: any) => s.representationType === "COMPILED_IR_RULE");
    expect(conmedCompiled).toHaveLength(0);
  });

  it("8. the LSB target was compiled and then demoted by a citation form the document never uses", () => {
    const facts = lsbCitationFacts();
    expect(facts.composedCitationsFoundVerbatim).toEqual([]);
    expect(facts.theProvisionsDoExist["6.03"]).toBe(true);
    expect(facts.theProvisionsDoExist["6.01(m)"]).toBe(true);
    // The compiled rule exists in the packet, as HONEST_UNRESOLVED, not INVENTORY_ONLY.
    const packet = readJson(PATHS.packet);
    const lsbCase = packet.cases.find((c: any) => c.caseId === "CASE-2034884b7a");
    const rule = lsbCase.systemOutput.find((s: any) => s.candidateId === "compiler-rule:lsb-2023-abl-credit-agreement:4:Section6.03(a)");
    expect(rule).toBeDefined();
    expect(rule.accountingRole).toBe("HONEST_UNRESOLVED");
    expect(rule.excerpts.join(" ")).toContain("not found verbatim in source text");
  });

  it("9. the FWRG evidence layer predates the Phase-3B compiler entirely", () => {
    const packet = readJson(PATHS.packet);
    const fwrg = packet.cases.filter((c: any) => c.documentId === "fwrg").flatMap((c: any) => c.systemOutput);
    expect(fwrg.filter((s: any) => s.representationType === "COMPILED_IR_RULE")).toHaveLength(0);
    expect(fwrg.filter((s: any) => s.representationType === "ANALYZER_RULE").length).toBeGreaterThan(0);
    // The §6.02(a) candidate exists and carries real semantic content.
    const c = fwrg.find((s: any) => s.candidateId === "discovery:discovery-candidate:2a878c34f1a54346d5f1e47d");
    expect(c).toBeDefined();
    expect(c.accountingRole).toBe("INVENTORY_ONLY");
    expect(c.excerpts.join(" ")).toContain("Liens securing the Secured Obligations");
  });

  it("10. no target survives the six §2 checks as a TRUE_PROMOTION_GAP", () => {
    const baseline = targetBaseline();
    expect(baseline).toHaveLength(20);
    expect(baseline.filter((b) => b.classification === "TRUE_PROMOTION_GAP")).toHaveLength(0);
    // Every target failed check 3 specifically - the failure is not promotion/compilation.
    for (const b of baseline) expect(b.sixChecks["3_failureIsPromotionOrCompilation"], b.caseId).toBe(false);
    // And every one passes checks 1, 2, 4 and 6: the material proposition really was found.
    for (const b of baseline) {
      expect(b.sixChecks["1_materialPropositionDiscovered"], b.caseId).toBe(true);
      expect(b.sixChecks["2_candidateCorrespondsToClaim"], b.caseId).toBe(true);
      expect(b.sixChecks["4_primarySourceEvidenceExists"], b.caseId).toBe(true);
      expect(b.sixChecks["6_enoughSemanticContentToActOn"], b.caseId).toBe(true);
    }
    expect(TARGET_CLASSIFICATIONS).toHaveLength(20);
  });

  it("11. all 14 historical false-credit controls remain NO_CREDIT", () => {
    const gate = falseCreditGate();
    expect(gate.controlCount).toBe(14);
    expect(gate.noCreditCount).toBe(14);
    expect(gate.allNoCredit).toBe(true);
    expect(gate.rows.every((r) => r.changedByThisMission === false)).toBe(true);
  });

  it("12. this mission changed no production file at the promotion seam", () => {
    // The two files that decide intake are asserted verbatim, so a future edit to either
    // one breaks this test and forces the claim to be re-established rather than assumed.
    const packageCompile = read(PATHS.productionPackageCompile);
    expect(packageCompile).toContain('const INELIGIBLE_ROLES = new Set<DiscoveryRole>(["REPRESENTATION"]);');
    const orchestrator = read(PATHS.productionOrchestrator);
    expect(orchestrator).toContain("allCandidates.filter((c) => isEligibleForSemanticCompilation(c).eligible)");
    expect(orchestrator).toContain("await compilePackageToIR(companyId, unit.instrumentKey, compilationCandidates");
  });

  it("13. the evidence layer is deterministic across repeated evaluation", () => {
    const a = JSON.stringify(targetBaseline());
    const b = JSON.stringify(targetBaseline());
    expect(a).toBe(b);
    expect(JSON.stringify(harnessFacts())).toBe(JSON.stringify(harnessFacts()));
    expect(JSON.stringify(falseCreditGate())).toBe(JSON.stringify(falseCreditGate()));
  });

  it("14. the generated artifacts on disk match what the generator produces now", () => {
    const dir = path.join(ROOT, "docs/phase-3-remediation/p3-defect-1");
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "03-target-case-baseline.json"), "utf8"));
    expect(onDisk.targetCaseCount).toBe(20);
    expect(onDisk.truePromotionGapCount).toBe(0);
    expect(onDisk.cases.map((c: any) => c.caseId)).toEqual(targetBaseline().map((c) => c.caseId));
    const verdict = JSON.parse(fs.readFileSync(path.join(dir, "12-verdict.json"), "utf8"));
    expect(verdict.verdict).toBe("P3_DEFECT1_ROOT_CAUSE_MISCLASSIFIED");
  });
});
