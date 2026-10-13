/**
 * Reproduce CONMED §7.6(d) evidence→execution evaluation (soft-gated, no paid runs).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateConmed76dEvidenceToExecution } from "../../lib/product/evidence-to-execution";

async function main() {
  const result = await evaluateConmed76dEvidenceToExecution();
  const outDir = join(process.cwd(), "docs/product-proof/005-evidence-to-execution/artifacts");
  mkdirSync(outDir, { recursive: true });

  const summary = {
    schema: "evidence-to-execution-demo.v1",
    gitSha: result.gitSha,
    family: result.family,
    section: result.target.section,
    workflowVerdict: result.workflowVerdict,
    irreducibleBlocker: result.irreducibleBlocker,
    customerCapabilitiesDemonstrated: result.customerCapabilitiesDemonstrated,
    customerCapabilitiesNotClaimed: result.customerCapabilitiesNotClaimed,
    stages: {
      compilation: result.stages.compilation.status,
      verification: result.stages.semanticVerification.status,
      wouldCertify: result.stages.certifyCandidate.wouldCertify,
      vepAdapter: result.stages.vep.adapterOutcome,
      contrast72cDerived: result.stages.vep.contrast72cDerived,
      contrastPathStatuses: result.stages.eligiblePath.contrast72c?.pathStatuses ?? null,
      contrastCapacity: result.stages.verifiedCapacity.contrast72cOutcome,
      contrastSimulateExecutable: result.stages.transactionSimulation.contrast72cExecutable,
    },
  };

  writeFileSync(join(outDir, "conmed-76d-path.json"), JSON.stringify(result, null, 2));
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
