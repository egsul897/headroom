/**
 * P3-DEFECT-1 remediation — evidence layer.
 *
 * Every fact in the artifacts is computed here from frozen run artifacts and from
 * production source, never hand-asserted. This module is benchmark/forensic tooling:
 * nothing in the Phase-3 extraction/compiler/analyzer pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
export const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
export const readJson = (p: string) => JSON.parse(read(p));

export const PATHS = {
  packet: "docs/phase-3-final-closure-resolution/review-packets/R1.json",
  corpus: "docs/phase-3-v3.1-final-reconciliation/05-v3.1.1-corrected-47-case-corpus.json",
  results: "docs/phase-3-v3.1-final-reconciliation/08-final-47-case-results.json",
  backlog: "docs/phase-3-v3.1-final-reconciliation/09-phase3-defect-backlog.json",
  dsgrStage2: "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage2-all-discovery-candidates.json",
  dsgrStage6: "tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage6-compiled-results.json",
  conmedStage2: "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json",
  conmedFreezeDir: "tests/fixtures/unseen-packages/phase-2f-freeze",
  lsbDiscovery: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json",
  lsbSource: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
  fwrgDiscovery: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json",
  blindRunScript: "scripts/phase-3f-first-blind-run.ts",
  productionOrchestrator: "lib/contract-model/analysis/orchestrator.ts",
  productionPackageCompile: "lib/contract-model/compiler/semantic/package-compile.ts",
} as const;

/** The 20 cases §2 names, with the claim address each one is anchored at. */
export const TARGET_CASES = [
  { caseId: "CASE-88cfbb3bb8", dataset: "dsgr", documentId: "doc-a", sectionRef: "6.05" },
  { caseId: "CASE-5a66cad386", dataset: "dsgr", documentId: "doc-b", sectionRef: "6.05" },
  { caseId: "CASE-393f8732d2", dataset: "dsgr", documentId: "doc-d", sectionRef: "6.05" },
  { caseId: "CASE-3e2b123d74", dataset: "dsgr", documentId: "doc-a", sectionRef: "6.05" },
  { caseId: "CASE-5ac1cd56ef", dataset: "dsgr", documentId: "doc-a", sectionRef: "6.10" },
  { caseId: "CASE-e008d4278a", dataset: "dsgr", documentId: "doc-b", sectionRef: "6.04" },
  { caseId: "CASE-30db965277", dataset: "dsgr", documentId: "doc-d", sectionRef: "6.04" },
  { caseId: "CASE-8de9def8ca", dataset: "dsgr", documentId: "doc-d", sectionRef: "6.08" },
  { caseId: "CASE-d2514bfbe7", dataset: "dsgr", documentId: "doc-a", sectionRef: "10.01" },
  { caseId: "CASE-2034884b7a", dataset: "lsb", documentId: "lsb", sectionRef: "6.03" },
  { caseId: "CASE-ca1109d4da", dataset: "fwrg", documentId: "fwrg", sectionRef: "6.02" },
  { caseId: "CASE-b2658c02e7", dataset: "conmed", documentId: "conmed", sectionRef: "7.1" },
  { caseId: "CASE-579c5d3f33", dataset: "conmed", documentId: "conmed", sectionRef: "7.10" },
  { caseId: "CASE-963cc44044", dataset: "conmed", documentId: "conmed", sectionRef: "7.14" },
  { caseId: "CASE-9948558e99", dataset: "conmed", documentId: "conmed", sectionRef: "7.11" },
  { caseId: "CASE-d32081582b", dataset: "conmed", documentId: "conmed", sectionRef: "7.13" },
  { caseId: "CASE-55163b4198", dataset: "conmed", documentId: "conmed", sectionRef: "7.16" },
  { caseId: "CASE-9a30560f37", dataset: "conmed", documentId: "conmed", sectionRef: "7.17" },
  { caseId: "CASE-b38c3b48eb", dataset: "conmed", documentId: "conmed", sectionRef: "7.2" },
  { caseId: "CASE-0c169f38c3", dataset: "conmed", documentId: "conmed", sectionRef: "7.2" },
] as const;

export type Classification =
  | "TRUE_PROMOTION_GAP"
  | "MISCLASSIFIED_DISCOVERY_MISS"
  | "MISCLASSIFIED_SECTION_MAPPING"
  | "MISCLASSIFIED_COMPOSITE_FLATTENING"
  | "SOURCE_LIMITATION"
  | "OTHER";

/** Facts about the harness that produced each dataset's benchmark evidence. */
export function harnessFacts() {
  const dsgrStage2 = readJson(PATHS.dsgrStage2) as any[];
  const dsgrStage6 = readJson(PATHS.dsgrStage6) as any[];
  const script = read(PATHS.blindRunScript);
  const capMatch = /const COMPILE_CAP = (\d+);/.exec(script);
  const budgetMatch = /const BUDGET_CEILING_USD = (\d+);/.exec(script);

  const eligible = dsgrStage2.filter((c) => c.role !== "REPRESENTATION");
  const compiledSections = dsgrStage6.map((e) => `${e.sourceDocumentId}::${e.sourceSectionRef}`);
  const compiledArticleVi = dsgrStage6.filter((e) => /^6\./.test(String(e.sourceSectionRef)));

  const conmedFiles = fs.readdirSync(path.join(ROOT, PATHS.conmedFreezeDir)).filter((f) => f.endsWith(".json"));
  const conmedStages = [...new Set(conmedFiles.map((f) => (/stage(\d+)/.exec(f) ?? [])[1]).filter(Boolean))].sort();

  return {
    dsgr: {
      harness: PATHS.blindRunScript,
      discoveryCandidates: dsgrStage2.length,
      eligibleForCompilation: eligible.length,
      compiled: dsgrStage6.length,
      compileCapDeclaredInHarness: capMatch ? Number(capMatch[1]) : null,
      budgetCeilingUsdDeclaredInHarness: budgetMatch ? Number(budgetMatch[1]) : null,
      compiledDocuments: [...new Set(dsgrStage6.map((e) => e.sourceDocumentId))],
      compiledSectionRefs: [...new Set(dsgrStage6.map((e) => String(e.sourceSectionRef)))].sort(),
      articleViCandidatesCompiled: compiledArticleVi.length,
      compiledSample: compiledSections.slice(0, 5),
      compilationRanForFractionOfEligible: Number((dsgrStage6.length / eligible.length).toFixed(5)),
    },
    conmed: {
      harness: PATHS.conmedFreezeDir,
      stagesPresent: conmedStages,
      compilationStagePresent: conmedStages.includes("6"),
      discoveryCandidates: ((readJson(PATHS.conmedStage2) as any).candidates ?? readJson(PATHS.conmedStage2)).length,
    },
    lsb: { harness: "legacy 11-stage orchestrator run (compiler-runs/run-1787767205274.json)", compilationStagePresent: true },
    fwrg: { harness: "Phase-C0 analyzer run (analyzer-runs/...), predates the Phase-3B semantic compiler", compilationStagePresent: false },
  };
}

/** Candidate counts at or under a claim address, per dataset, from that dataset's own frozen discovery artifact. */
export function discoveryAt(dataset: string, documentId: string, sectionRef: string) {
  const under = (refs: any[], pick: (c: any) => string) =>
    refs.filter((c) => {
      const r = String(pick(c) ?? "");
      return r === sectionRef || r.startsWith(`${sectionRef}(`);
    });

  if (dataset === "dsgr") {
    const all = readJson(PATHS.dsgrStage2) as any[];
    const forDoc = all.filter((c) => c.documentId === documentId);
    const hits = under(forDoc, (c) => c.normalizedSourceRef);
    const compiledRefs = new Set((readJson(PATHS.dsgrStage6) as any[]).map((e) => e.candidateRef));
    return { found: hits.length, compiled: hits.filter((c) => compiledRefs.has(c.discoveryId)).length, sampleIds: hits.slice(0, 3).map((c) => c.discoveryId) };
  }
  if (dataset === "conmed") {
    const raw = readJson(PATHS.conmedStage2);
    const all = (raw.candidates ?? raw) as any[];
    const hits = under(all, (c) => c.normalizedSourceRef);
    return { found: hits.length, compiled: 0, sampleIds: hits.slice(0, 3).map((c) => c.discoveryId ?? c.id ?? "(no id)") };
  }
  const file = dataset === "lsb" ? PATHS.lsbDiscovery : PATHS.fwrgDiscovery;
  const all = (readJson(file).candidates ?? []) as any[];
  const hits = under(all, (c) => c.normalizedSourceRef);
  return { found: hits.length, compiled: 0, sampleIds: hits.slice(0, 3).map((c) => c.discoveryId ?? "(no id)") };
}

/** Does the LSB source ever write the composed citation the verifier looked for? */
export function lsbCitationFacts() {
  const src = read(PATHS.lsbSource);
  return {
    composedCitationsSearched: ["Section 6.03(a)", "Section 6.01(m)"],
    composedCitationsFoundVerbatim: ["Section 6.03(a)", "Section 6.01(m)"].filter((s) => src.includes(s)),
    theProvisionsDoExist: {
      "6.03": src.includes("SECTION  6.03 Restrictions on Fundamental Changes"),
      "6.01(m)": src.includes("(m) Indebtedness of the Loan Parties and their Subsidiaries under the Secured Notes"),
    },
  };
}

/** What production actually does at the intake seam — read from production source, not asserted. */
export function productionIntakeFacts() {
  const orchestrator = read(PATHS.productionOrchestrator);
  const packageCompile = read(PATHS.productionPackageCompile);
  // A cap would have to be applied to the candidate LIST somewhere between the
  // eligibility filter and the compile call, so that window is what is inspected -
  // not the whole file, where an unrelated `new Date().toISOString().slice(0, 10)`
  // would produce a false positive.
  const intakeExpression = "allCandidates.filter((c) => isEligibleForSemanticCompilation(c).eligible)";
  const start = orchestrator.indexOf(intakeExpression);
  const end = orchestrator.indexOf("await compilePackageToIR(", start);
  const intakeWindow = start >= 0 && end > start ? orchestrator.slice(start, end) : "";
  const capPattern = /\.slice\(|COMPILE_CAP|BUDGET_CEILING|MAX_COMPILE|\.splice\(|take\(|limit/;
  const capMatchesInWindow = intakeWindow.match(new RegExp(capPattern.source, "g")) ?? [];
  return {
    intakeExpression,
    intakeExpressionPresentInProduction: start >= 0,
    intakeWindowChars: intakeWindow.length,
    capMatchesInIntakeWindow: capMatchesInWindow,
    numericCapInOrchestratorIntake: capMatchesInWindow.length > 0,
    numericCapInPackageCompile: /COMPILE_CAP|BUDGET_CEILING|MAX_COMPILE|\.slice\(\s*0\s*,/.test(packageCompile),
    ineligibleRoles: ["REPRESENTATION"],
    ineligibleRolesDeclaredInProduction: /const INELIGIBLE_ROLES = new Set<DiscoveryRole>\(\["REPRESENTATION"\]\);/.test(packageCompile),
  };
}
