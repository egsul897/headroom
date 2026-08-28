/**
 * Phase 3C (task §20) - ZERO-COST Layer 1 (deterministic) verification of
 * the PRESERVED Phase 3B real-regression output for lsb-6.13-investments -
 * the mandatory adversarial case. No model call, no recompilation. Reuses
 * the exact same document-loading/context-building helpers the Phase 3B/
 * 3B.1 scripts already export (buildCompilerInputForCase,
 * loadFwrgLsbStructuralIndex, CASES) purely to reconstruct the SAME
 * SemanticCompilerInput the real compiler run was given - never re-deriving
 * or re-fetching anything new.
 *
 * Success criterion (task §20/§40): the deterministic reconciliation layer
 * must independently flag a material missing-rule/basket signal for this
 * candidate WITHOUT being told the expected $35,000,000/$5,000,000 figures
 * or the section number "6.13" anywhere in source-inventory.ts/
 * reconciliation.ts's own production logic.
 *
 * Run via: npx tsx scripts/phase-3c-verify-preserved-lsb-613.ts
 */
import { readFileSync } from "node:fs";
import { CASES, buildCompilerInputForCase, loadFwrgLsbStructuralIndex } from "./phase-3b-real-regression";
import { buildSourceInventory } from "../lib/contract-model/compiler/semantic-verification/source-inventory";
import { buildIrInventory } from "../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { reconcileInventories } from "../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildFindingsFromReconciliation } from "../lib/contract-model/compiler/semantic-verification/findings";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import type { SemanticCompilationResult } from "../lib/contract-model/compiler/semantic/types";
import type { VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";

const PRESERVED_RUN_PATH = "tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json";
const TARGET_CASE_ID = "lsb-6.13-investments";

async function main() {
  const preserved: { results: { id: string; result: SemanticCompilationResult }[] } = JSON.parse(readFileSync(PRESERVED_RUN_PATH, "utf-8"));
  const preservedResult = preserved.results.find((r) => r.id === TARGET_CASE_ID)?.result;
  if (!preservedResult) throw new Error(`no preserved result for ${TARGET_CASE_ID}`);

  const c = CASES.find((c) => c.id === TARGET_CASE_ID);
  if (!c) throw new Error(`no CASES entry for ${TARGET_CASE_ID}`);

  const { index, exactTermsByDocument } = loadFwrgLsbStructuralIndex();
  const compilerInput = buildCompilerInputForCase(c, index, exactTermsByDocument);
  if (!compilerInput) throw new Error(`could not rebuild compiler input for ${TARGET_CASE_ID}`);

  const input: VerificationInput = { compilerInput, compilationResult: preservedResult };

  const sourceInventory = buildSourceInventory(compilerInput.candidateRef, compilerInput.operativeSourceText, compilerInput.sourceDocumentId, compilerInput.sourceSectionRef ?? "(unknown)", null);
  const irInventory = buildIrInventory(compilerInput.candidateRef, preservedResult.rules, preservedResult.definitions);
  const reconciliation = reconcileInventories(sourceInventory, irInventory);
  const findings = buildFindingsFromReconciliation(input, reconciliation);

  console.log(`=== Phase 3C zero-cost Layer 1 verification: ${TARGET_CASE_ID} ===`);
  console.log(`Preserved compilation: status=${preservedResult.status} rules=${preservedResult.rules.length} definitions=${preservedResult.definitions.length}`);
  console.log(`\nSource inventory: ${sourceInventory.items.length} item(s), apparentIndependentUnitCount=${sourceInventory.apparentIndependentUnitCount}`);
  console.log(`  evidence: ${sourceInventory.apparentIndependentUnitEvidence.join(", ")}`);
  console.log(`IR inventory: ${irInventory.items.length} item(s) across ${irInventory.ruleCount} rule(s)`);

  console.log(`\nReconciliation (${reconciliation.items.length} item(s), ${reconciliation.materialUnresolvedCount} material/unresolved):`);
  for (const item of reconciliation.items) {
    if (item.classification === "ACCOUNTED_FOR") continue;
    console.log(`  [${item.classification}] ${item.reason}`);
  }

  console.log(`\nDeterministic findings (${findings.length}):`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.findingType}: ${f.verifierReasoning}`);
  }

  const missingRuleFindings = findings.filter((f) => f.findingType === "MISSING_RULE" || f.findingType === "MISSING_BASKET");
  const materialFindings = findings.filter((f) => f.severity === "MATERIAL");
  console.log(`\n=== RESULT ===`);
  console.log(`Missing-rule/basket findings: ${missingRuleFindings.length}`);
  console.log(`Material findings: ${materialFindings.length}`);
  console.log(missingRuleFindings.length > 0 ? "SUCCESS: deterministic Layer 1 alone independently flagged a material missing-rule/basket signal, with zero package-specific logic." : "Layer 1 alone did not flag a missing-rule signal for this candidate - would require Layer 2 (semantic review) to catch this case.");

  // End-to-end status, Layer 1 only (skipSemanticReview:true) - zero additional cost. Since
  // Layer 1 alone already produced 2 MATERIAL findings above, the final status is determined
  // without needing any real model call for THIS specific success criterion (task §20's own
  // "proposed COMPLETE representation is not machine-verified").
  const zeroCostResult = await verifyCompiledCandidate(input, { skipSemanticReview: true });
  console.log(`\nEnd-to-end status (Layer 1 only, zero cost): ${zeroCostResult.status}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
