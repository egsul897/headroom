/**
 * Phase C.1 - zero-cost re-derivation of FWRG/LSB evaluation against the
 * fixed evaluator + new deterministic multi-basket completeness check.
 *
 * COST DISCIPLINE (task §15): this makes ZERO new LLM calls. It reuses the
 * already-persisted, already-paid-for VERIFICATION stage output (the real
 * LLM-adversarial-corrected finalRules from the last successful staged
 * compiler run) and applies ONLY the new deterministic layer (basket
 * completeness) plus the fixed evaluator/VALIDATION/COVERAGE/PROMOTION
 * logic in-process. Re-running the full staged pipeline (including a fresh
 * real LLM adversarial pass) was considered and rejected: the LLM's own
 * adversarial judgments have not changed, only the deterministic layer on
 * top of them is new, so re-paying for the same judgments again would be
 * pure waste, not a more accurate measurement.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { checkAllSectionsBasketCompleteness } from "../lib/contract-model/compiler/basket-completeness";
import { runValidationStage } from "../lib/contract-model/compiler/stage-validation";
import { runCoverageStage } from "../lib/contract-model/compiler/stage-coverage";
import { runPromotionStage } from "../lib/contract-model/compiler/stage-promotion";
import { evaluateAll } from "../lib/contract-model/analyzer/evaluator";
import type { GroundTruthProvisionLike } from "../lib/contract-model/analyzer/evaluator";
import type { CandidateContractRule } from "../lib/contract-model/types";
import type { VerificationResult } from "../lib/contract-model/compiler/stage-verification";

interface PackageDef {
  key: string;
  companyId: string;
  fixtureDir: string;
  documents: { documentId: string; label: string; files: string[] }[];
  groundTruth: GroundTruthProvisionLike[];
}

async function loadPackage(name: string): Promise<PackageDef> {
  if (name === "fwrg") {
    const dir = join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement");
    const gt = await import(join(dir, "human-ground-truth.ts"));
    return {
      key: "fwrg-2021-credit-agreement",
      companyId: "fixture-fwrg-2021-credit-agreement-co",
      fixtureDir: dir,
      documents: [{ documentId: "fixture-fwrg-2021-credit-agreement-ca", label: "FWRG 2021 Credit Agreement", files: ["definitions-excerpt.txt", "article-6-negative-covenants.txt"] }],
      groundTruth: gt.HUMAN_PROVISIONS,
    };
  }
  const dir = join(__dirname, "..", "tests", "fixtures", "unseen-packages", "lsb-2023-abl-credit-agreement");
  const gt = await import(join(dir, "human-ground-truth.ts"));
  return {
    key: "lsb-2023-abl-credit-agreement",
    companyId: "fixture-lsb-2023-abl-credit-agreement-co",
    fixtureDir: dir,
    documents: [
      { documentId: "fixture-lsb-2023-abl-ca", label: "LSB 2023 ABL Credit Agreement", files: ["definitions-excerpt.txt", "article-6-negative-covenants.txt"] },
      { documentId: "fixture-lsb-2023-abl-joinder", label: "LSB Intercreditor Joinder Agreement", files: ["intercreditor-joinder.txt"] },
    ],
    groundTruth: gt.HUMAN_PROVISIONS,
  };
}

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error("Usage: npx tsx scripts/run-phase-c1-recompute.ts <fwrg|lsb>");
  const pkg = await loadPackage(name);

  const run = await prisma.contractCompilerRun.findFirstOrThrow({ where: { companyId: pkg.companyId, packageKey: pkg.key } });
  const verificationStage = await prisma.contractCompilerStage.findFirstOrThrow({ where: { runId: run.id, stage: "VERIFICATION" } });
  const savedFinalRules = (verificationStage.output as unknown as { finalRules: CandidateContractRule[] }).finalRules;
  console.log(`[loaded] ${savedFinalRules.length} previously-extracted-and-verified rules from the last real run (zero new LLM calls)`);

  const documents = pkg.documents.map((doc) => ({
    documentId: doc.documentId,
    label: doc.label,
    text: doc.files.map((f) => readFileSync(join(pkg.fixtureDir, f), "utf-8")).join("\n\n"),
  }));

  const sectionNodes = await prisma.documentNode.findMany({ where: { companyId: pkg.companyId, nodeType: "SECTION" }, orderBy: { charStart: "asc" } });

  // Phase C.1's own new deterministic layer, applied exactly as
  // orchestrator.ts's VERIFICATION stage now applies it in a real run.
  let finalRules = [...savedFinalRules];
  const allBasketResults = [];
  for (const doc of documents) {
    const docSections = sectionNodes.filter((n) => n.documentId === doc.documentId);
    const sectionBoundaries = docSections.map((s, i) => ({
      sectionPrefix: (s.sectionRef ?? "").replace(/\s+/g, ""),
      charStart: s.charStart ?? 0,
      charEnd: docSections[i + 1]?.charStart ?? doc.text.length,
    }));
    if (sectionBoundaries.length === 0) continue;
    const docRules = finalRules.filter((r) => {
      const ref = (r.sourceSectionRef ?? "").replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "");
      return sectionBoundaries.some((b) => ref === b.sectionPrefix || ref.startsWith(`${b.sectionPrefix}(`));
    });
    const results = checkAllSectionsBasketCompleteness(doc.text, docRules, sectionBoundaries);
    allBasketResults.push(...results);
    for (const result of results) {
      if (!result.flagged) continue;
      finalRules = finalRules.map((r) => {
        const ref = (r.sourceSectionRef ?? "").replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "");
        const belongs = ref === result.sectionPrefix || ref.startsWith(`${result.sectionPrefix}(`);
        if (belongs && r.evaluationClass === "EXECUTABLE") {
          return { ...r, evaluationClass: "JUDGMENT_REQUIRED" as const, notes: `${r.notes ?? ""} MULTI_BASKET_COMPLETENESS_FAILED: section ${result.sectionPrefix} has ${result.unmatchedNumbers.length} unmatched real figure(s) and ${result.duplicatedThresholds.length} possible duplicated threshold(s).`.trim() };
        }
        return r;
      });
    }
  }
  console.log(`[multi-basket check] ${allBasketResults.filter((r) => r.flagged).length}/${allBasketResults.length} sections flagged`);
  for (const r of allBasketResults) if (r.flagged) console.log(`  FLAGGED section ${r.sectionPrefix}: ${r.unmatchedNumbers.length} unmatched, ${r.duplicatedThresholds.length} duplicated`);

  // Re-run VALIDATION (reads persisted ContractRule rows - unaffected by
  // this recompute, since evaluationClass downgrades from this script are
  // in-memory only, matching PROMOTION's own real "read-time computed,
  // never persisted" design) and COVERAGE/PROMOTION with the updated rules.
  const validation = await runValidationStage(pkg.companyId);
  const inventoryStage = await prisma.contractCompilerStage.findFirstOrThrow({ where: { runId: run.id, stage: "INVENTORY" } });
  const definitionsStage = await prisma.contractCompilerStage.findFirstOrThrow({ where: { runId: run.id, stage: "DEFINITIONS" } });
  const inventoryOutput = inventoryStage.output as unknown as Parameters<typeof runCoverageStage>[0];
  const definedTerms = (definitionsStage.output as unknown as { definedTerms: Parameters<typeof runCoverageStage>[2] }).definedTerms;
  const coverage = runCoverageStage(inventoryOutput, finalRules, definedTerms);

  const verificationResult: VerificationResult = { finalRules, dispositions: [], basketCompletenessResults: allBasketResults };
  const promotionDecisions = runPromotionStage(finalRules, verificationResult, validation.output, new Map());

  const evaluation = evaluateAll(pkg.groundTruth, finalRules, definedTerms);

  console.log("\n=== Evaluation (fixed evaluator + new deterministic multi-basket check, zero new LLM calls) ===");
  console.log(`total=${evaluation.total} correct=${evaluation.matchedCorrect} flagged=${evaluation.matchedIncorrectFlagged} unflagged=${evaluation.matchedIncorrectUnflagged} missing=${evaluation.missing}`);
  console.log(`DANGEROUS_UNFLAGGED_ERROR_RATE=${(evaluation.dangerousUnflaggedErrorRate * 100).toFixed(1)}% DANGEROUS_FLAGGED_ERROR_RATE=${(evaluation.dangerousFlaggedErrorRate * 100).toFixed(1)}%`);

  const byState = new Map<string, number>();
  for (const d of promotionDecisions) byState.set(d.executabilityState, (byState.get(d.executabilityState) ?? 0) + 1);
  console.log("\n=== Promotion decisions (executabilityState, Phase 1B: capability-based) ===");
  for (const [state, count] of byState) console.log(`  ${state}: ${count}`);

  const byUnderstanding = new Map<string, number>();
  for (const d of promotionDecisions) byUnderstanding.set(d.understandingStatus, (byUnderstanding.get(d.understandingStatus) ?? 0) + 1);
  console.log("\n=== Understanding dimension (Phase 1B) ===");
  for (const [state, count] of byUnderstanding) console.log(`  ${state}: ${count}`);

  const byCapability = new Map<string, number>();
  for (const d of promotionDecisions) byCapability.set(d.calculationCapability, (byCapability.get(d.calculationCapability) ?? 0) + 1);
  console.log("\n=== Calculation capability dimension (Phase 1B) ===");
  for (const [state, count] of byCapability) console.log(`  ${state}: ${count}`);

  console.log(`\nvalidationOk=${validation.output.ok} coverageGapCount=${coverage.output.filter((c) => c.disposition === "REVIEW_REQUIRED" || c.disposition === "UNHANDLED").length}`);

  console.log("\n=== Per-provision results (for case-by-case reconciliation) ===");
  for (const r of evaluation.results) console.log(`${r.outcome} | ${r.provisionId} | ${(r.mismatchReasons ?? []).join("; ")}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
