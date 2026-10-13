/**
 * Reproducible CFO secured-debt customer workflow demonstration.
 *
 * Runs Matthews AUTHENTIC_SOURCE_BACKED package for a $50M secured ask,
 * plus fail-closed omit-package path. Writes JSON artifacts under
 * docs/product-proof/004-cfo-secured-debt-workflow/artifacts/.
 *
 * Never fabricates PERMITTED / verified remaining / Phase-3 VEP.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateCfoSecuredDebtWorkflow } from "@/lib/product/cfo-secured-debt-workflow";

const OUT_DIR = join(
  process.cwd(),
  "docs/product-proof/004-cfo-secured-debt-workflow/artifacts",
);

const ASK =
  "As of 2024-12-31, is a proposed $50 million secured debt transaction permitted under our Indenture and Credit Agreement?";

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const primary = await evaluateCfoSecuredDebtWorkflow({
    ask: ASK,
    amountMillions: 50,
    evaluationDate: "2024-12-31",
  });

  const failClosed = await evaluateCfoSecuredDebtWorkflow({
    ask: ASK,
    amountMillions: 50,
    evaluationDate: "2024-12-31",
    omitAuthenticPackage: true,
  });

  const summary = {
    schema: "cfo-secured-debt-workflow-demo.v1",
    gitSha: primary.gitSha,
    evaluatedAt: primary.evaluatedAt,
    primary: {
      result: primary.result,
      resultRationale: primary.resultRationale,
      workflowVerdict: primary.workflowVerdict,
      packageKey: primary.package.key,
      covenantCount: primary.applicableCovenants.length,
      pathAuthority: primary.pathAndSimulation.pathEnumerationAuthority,
      verifiedSimulateExecutable: primary.pathAndSimulation.verifiedSimulateExecutable,
      verifiedRemainingUsd: primary.utilizationAndRemaining.verifiedRemainingUsd,
      modeledScenarioOverall: primary.pathAndSimulation.modeledScenarioOverall,
      requiredExternalEvidence: primary.requiredExternalEvidence,
      customerCanDoToday: primary.customerCanDoToday,
      constraintsHonored: primary.constraintsHonored,
    },
    failClosed: {
      result: failClosed.result,
      workflowVerdict: failClosed.workflowVerdict,
      packageAuthenticity: failClosed.package.authenticity,
      unresolvedConditions: failClosed.auditTrail.unresolvedConditions,
    },
  };

  writeFileSync(join(OUT_DIR, "primary-workflow.json"), JSON.stringify(primary, null, 2));
  writeFileSync(join(OUT_DIR, "fail-closed-no-package.json"), JSON.stringify(failClosed, null, 2));
  writeFileSync(join(OUT_DIR, "demo-summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(
    join(OUT_DIR, "audit-trail.json"),
    JSON.stringify(primary.auditTrail, null, 2),
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
