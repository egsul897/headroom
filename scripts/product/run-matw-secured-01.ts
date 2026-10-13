/**
 * Reproduce MATW-SECURED-01 evidence package evaluation (read-only).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateMatwSecured01Package } from "../../lib/product/matw-secured-01";

const STARTING_MAIN_SHA = "14c805c6412ca36bfe753112abac78fa6c3736fa";

function main() {
  const pkg = evaluateMatwSecured01Package({ startingMainSha: STARTING_MAIN_SHA });
  const outDir = join(process.cwd(), "docs/product-proof/matw-secured-01/artifacts");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "operative-package.json"), JSON.stringify(pkg, null, 2));

  const summary = {
    schema: "matw-secured-01-summary.v1",
    startingMainSha: pkg.startingMainSha,
    endingSha: pkg.endingSha,
    evaluationDate: pkg.evaluationDate,
    readinessVerdict: pkg.readinessVerdict,
    packageCaExcerptFidelity: pkg.amendmentPrecedence.packageCaExcerptFidelity,
    adversarialFails: pkg.independentSemanticVerification.checks.filter((c) => c.result === "FAIL")
      .length,
    proposePhase3Compile: pkg.nextStageRecommendation.proposePhase3Compile,
    claimsRefused: pkg.claimsRefused,
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  // Split deliverables for auditability
  writeFileSync(
    join(outDir, "01-document-manifest.json"),
    JSON.stringify(pkg.documentManifest, null, 2),
  );
  writeFileSync(
    join(outDir, "02-amendment-precedence.json"),
    JSON.stringify(pkg.amendmentPrecedence, null, 2),
  );
  writeFileSync(
    join(outDir, "03-source-citations.json"),
    JSON.stringify(pkg.sourceCitations, null, 2),
  );
  writeFileSync(
    join(outDir, "04-independent-semantic-verification.json"),
    JSON.stringify(pkg.independentSemanticVerification, null, 2),
  );
  writeFileSync(
    join(outDir, "05-candidate-path-matrix.json"),
    JSON.stringify(pkg.candidatePathMatrix, null, 2),
  );
  writeFileSync(
    join(outDir, "06-financial-utilization-dependencies.json"),
    JSON.stringify(pkg.financialUtilizationDependencies, null, 2),
  );
  writeFileSync(
    join(outDir, "07-missing-inputs-limitations.json"),
    JSON.stringify(pkg.missingInputsAndLimitations, null, 2),
  );

  console.log(JSON.stringify(summary, null, 2));
}

main();
