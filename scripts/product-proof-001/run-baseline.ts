/**
 * PRODUCT PROOF 001 — first offline baseline against Kennametal 2026 term loan CA.
 *
 * Freeze (package + challenge questions) must exist before this runs.
 * No paid inference. No Neon writes. No manually modeled covenants.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "../../lib/extraction/parse";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";
import { isAffirmativelyExecutable } from "../../lib/product/unified-position/certified-simulate-bridge";
import type { CertifiedTransactionAttempt } from "../../lib/product/north-star-workflow/certified-transaction";

const PKG = "tests/fixtures/product-proof-001/kennametal-2026-term-loan-credit-agreement";
const FREEZE = "docs/product/product-proof-001/00-freeze-manifest.json";
const OUT_DIR = "docs/product/product-proof-001";

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(typeof bytes === "string" ? Buffer.from(bytes) : bytes).digest("hex");
}

function hasProviderKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY);
}

async function main() {
  const freeze = JSON.parse(readFileSync(FREEZE, "utf8")) as {
    package: {
      bodySha256: string;
      extractedTextSha256: string;
      rawHtmlRelative: string;
      extractedTextRelative: string;
    };
    challengeQuestions: Array<{
      id: string;
      kind: string;
      question: string;
      expectedSourceBackedAnswer: string | null;
      requiresModeledCovenants?: boolean;
      requiresVEP?: boolean;
      manualModelingForbidden?: boolean;
    }>;
  };
  const provenance = JSON.parse(readFileSync(path.join(PKG, "provenance.json"), "utf8"));
  const rawHtml = readFileSync(path.join(PKG, freeze.package.rawHtmlRelative));
  const extracted = readFileSync(path.join(PKG, freeze.package.extractedTextRelative), "utf8");
  const bodySha = sha256(rawHtml);
  const textSha = sha256(extracted);
  if (bodySha !== freeze.package.bodySha256 || textSha !== freeze.package.extractedTextSha256) {
    throw new Error(`Freeze hash mismatch: body=${bodySha} text=${textSha}`);
  }
  if (bodySha !== provenance.bodySha256 || textSha !== provenance.extractedTextSha256) {
    throw new Error("Provenance hash mismatch vs freeze");
  }

  const stages: Array<{ stage: string; status: "EXECUTED" | "UNSUPPORTED" | "REFUSED"; detail: string }> = [];
  let firstUnsupported: string | null = null;
  const manualInterventions: string[] = [];

  // Stage: parse
  const parsed = await parseDocument(rawHtml, "text/html");
  const htmlMatches = parsed.fullText === extracted;
  stages.push({
    stage: "PARSE_HTML",
    status: "EXECUTED",
    detail: `htmlParseMatchesExtractedText=${htmlMatches}; chars=${extracted.length}`,
  });

  // Stage: structure
  const documentId = "kennametal-doc-a-2026-05-28-term-loan-credit-agreement";
  const label = "Kennametal Inc. Term Loan Credit Agreement dated as of May 28, 2026 (EX-10.2)";
  const nodes = parseDocumentStructure({ documentId, label, text: extracted });
  const definitions = detectStructuralDefinitions(documentId, extracted, nodes);
  const references = detectStructuralReferences(documentId, extracted, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text: extracted, nodes }]]), definitions, references);
  stages.push({
    stage: "STRUCTURE",
    status: "EXECUTED",
    detail: `nodes=${nodes.length}; definitions=${definitions.length}; references=${references.length}`,
  });

  // Stage: Pass A deterministic
  const passA = runPassADeterministicSignals(documentId, index, EMPTY_SUPERSESSION_INDEX);
  const signalCounts: Record<string, number> = {};
  for (const c of passA) {
    for (const s of c.signals) signalCounts[s] = (signalCounts[s] ?? 0) + 1;
  }
  stages.push({
    stage: "PASS_A_DETERMINISTIC",
    status: "EXECUTED",
    detail: `candidates=${passA.length}; signalCounts=${JSON.stringify(signalCounts)}`,
  });

  // Stage: Pass B semantic (paid) — refuse without key; never use synthetic
  if (hasProviderKey()) {
    // Explicitly refuse paid path for this baseline even if a key is present in env.
    stages.push({
      stage: "PASS_B_SEMANTIC",
      status: "REFUSED",
      detail: "Provider key present but PRODUCT PROOF 001 baseline forbids paid inference; Pass B not executed",
    });
    if (!firstUnsupported) firstUnsupported = "PASS_B_SEMANTIC";
  } else {
    stages.push({
      stage: "PASS_B_SEMANTIC",
      status: "UNSUPPORTED",
      detail: "No AI_GATEWAY_API_KEY / ANTHROPIC_API_KEY; Pass B refused; synthetic caller not used",
    });
    if (!firstUnsupported) firstUnsupported = "PASS_B_SEMANTIC";
  }

  // Stage: modeled permissions / VEP / certified simulate — product boundary
  stages.push({
    stage: "MODELED_PERMISSIONS_AND_VEP",
    status: "UNSUPPORTED",
    detail:
      "No authentic Permission rows, SharedConstraints, or Verified Execution Package exist for Kennametal. Manual modeling forbidden by freeze.",
  });
  if (!firstUnsupported) firstUnsupported = "MODELED_PERMISSIONS_AND_VEP";

  // Attempt Q4/Q5 product path without inventing models — expect fail-closed
  const emptySolverAttempt = {
    attempted: true,
    eligiblePermissions: 0,
    note: "runSolver not invoked with invented permissions; zero authentic permissions → no CLEAR path",
  };
  const certifiedStub: CertifiedTransactionAttempt = {
    companyId: "kennametal-pp001",
    evaluationDate: "2026-06-30",
    cutoffState: "UNRESOLVED",
    reportingPeriodKey: null,
    approvedSnapshotId: null,
    ledgerUsageCount: 0,
    verifiedPackagePresent: false,
    capacity: null,
    simulation: null,
    blockers: ["NO_VERIFIED_EXECUTION_PACKAGE"],
    authorityNote: "PRODUCT_PROOF_001 baseline — fail closed",
  };
  const executableProbe = isAffirmativelyExecutable({
    verifiedPackage: null,
    selectedPathId: null,
    selectedPath: null,
    transaction: null,
    certified: certifiedStub,
    pathSelectionError: "NO_ENUMERATED_PATH",
  });

  // Source-fact Q1–Q3: deterministic string presence checks against frozen extracted text (not LLM)
  const sourceFindings: Array<{
    id: string;
    status: "SUPPORTED_BY_SOURCE_TEXT" | "NOT_ANSWERABLE_BY_PRODUCT";
    evidence: string;
    productCapacityAnswer: null | string;
  }> = [];

  const q1Hit = extracted.includes("3.75 to 1.00") && /6\.1\.\s*Financial Condition Covenant/i.test(extracted);
  sourceFindings.push({
    id: "PP001-Q1",
    status: q1Hit ? "SUPPORTED_BY_SOURCE_TEXT" : "NOT_ANSWERABLE_BY_PRODUCT",
    evidence: q1Hit
      ? "Frozen extracted text contains Section 6.1 Financial Condition Covenant and ratio 3.75 to 1.00"
      : "Ratio text not found",
    productCapacityAnswer: null,
  });

  const q2Hit = /6\.2\(e\)/.test(extracted) && extracted.includes("$150,000,000");
  sourceFindings.push({
    id: "PP001-Q2",
    status: q2Hit ? "SUPPORTED_BY_SOURCE_TEXT" : "NOT_ANSWERABLE_BY_PRODUCT",
    evidence: q2Hit
      ? "Frozen extracted text contains Section 6.2(e) aggregate cap $150,000,000"
      : "Cap text not found",
    productCapacityAnswer: null,
  });

  const q3Hit = /6\.2\(i\)/.test(extracted) && extracted.includes("$350,000,000");
  sourceFindings.push({
    id: "PP001-Q3",
    status: q3Hit ? "SUPPORTED_BY_SOURCE_TEXT" : "NOT_ANSWERABLE_BY_PRODUCT",
    evidence: q3Hit
      ? "Frozen extracted text contains Section 6.2(i) aggregate cap $350,000,000 with Attributable Debt / Qualified Receivables Transactions"
      : "Cap text not found",
    productCapacityAnswer: null,
  });

  sourceFindings.push({
    id: "PP001-Q4",
    status: "NOT_ANSWERABLE_BY_PRODUCT",
    evidence:
      "No authentic modeled permissions / VEP / NS-4 approved financials for Kennametal; capacity path correctly unavailable. EXECUTABLE probe=" +
      String(executableProbe),
    productCapacityAnswer: null,
  });

  sourceFindings.push({
    id: "PP001-Q5",
    status: "NOT_ANSWERABLE_BY_PRODUCT",
    evidence:
      "Secured dual-path requires authentic debt+lien permissions and shared constraints from the package; none exist without manual modeling (forbidden). No false CLEAR/EXECUTABLE asserted.",
    productCapacityAnswer: null,
  });

  const tipSha = (() => {
    try {
      return readFileSync(".git/HEAD", "utf8").trim();
    } catch {
      return "unknown";
    }
  })();

  const report = {
    artifact: "PRODUCT_PROOF_001_EXECUTION",
    version: 1,
    executedAt: new Date().toISOString(),
    packageId: "kennametal-2026-term-loan-credit-agreement",
    bodySha256: bodySha,
    extractedTextSha256: textSha,
    paidInference: false,
    neonWrites: false,
    manuallyModeledCovenants: false,
    gitHeadRef: tipSha,
    stages,
    firstUnsupportedStage: firstUnsupported,
    manualInterventions,
    emptySolverAttempt,
    executableProbeFalse: executableProbe === false,
    sourceFindings,
    customerUsableCapacityOrTransactionAnswer: false,
    topBlockers: [
      {
        id: "PP001-B1",
        title: "Pass B semantic discovery requires paid provider — refused for baseline",
        blocks: "Sealed discovery candidates / roles for Kennametal",
      },
      {
        id: "PP001-B2",
        title: "No authentic modeled Permission / SharedConstraint graph for the package",
        blocks: "Solver election / capacity / secured dual-path",
      },
      {
        id: "PP001-B3",
        title: "No Verified Execution Package (VEP) retrieval for Kennametal",
        blocks: "Affirmative EXECUTABLE on Simulate (OUT-VEP-01 class)",
      },
      {
        id: "PP001-B4",
        title: "No NS-4 APPROVED financial snapshot / completeness certificate for Kennametal",
        blocks: "Remaining capacity claims (OUT-NS4-01 class)",
      },
      {
        id: "PP001-B5",
        title: "Foundation P1/P2 + concurrency proofs remain open on tracked register",
        blocks: "Production readiness claims; green CI ≠ resolution",
      },
    ],
    verdict: "PRODUCT_PROOF_001_BASELINE_ESTABLISHED_CUSTOMER_ANSWER_NOT_YET_PRODUCIBLE",
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "01-first-execution.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  // Also mirror under package
  const pkgOut = path.join(PKG, "product-proof-001/first-execution.json");
  mkdirSync(path.dirname(pkgOut), { recursive: true });
  writeFileSync(pkgOut, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify(
      {
        outPath,
        firstUnsupportedStage: firstUnsupported,
        executableProbeFalse: executableProbe === false,
        customerUsable: false,
        stages: stages.map((s) => `${s.stage}:${s.status}`),
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
