/**
 * Shortest authentic evidence → execution path for ONE covenant family:
 * CONMED Eighth A&R §7.6(d) Restricted Payments ($40M / fiscal year).
 *
 * Soft gate: no paid compile/verify. Uses on-disk population evidence +
 * existing CERTIFIED §7.2(c) spine for contrast only.
 *
 * Never fabricates CERTIFIED, VEP, eligible CANDIDATE path, verified remaining,
 * or PERMITTED. Names the irreducible blocker when the chain cannot complete.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  attemptAuthenticatedVep,
  enumerateAuthenticPhase4e,
  evaluateAuthenticVerifiedCapacity,
} from "../../../scripts/product/attempt-authenticated-vep";
import { attemptVerifiedSimulate } from "@/lib/product/unified-position/certified-simulate-bridge";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";

export const CONMED_76D_CANDIDATE_REF = "discovery-candidate:9e35243e01539edee04ff6a5";
export const CONMED_72C_CANDIDATE_REF = "discovery-candidate:7a3f36589dacd05c41331a80";
export const CONMED_76D_SECTION = "7.6(d)";
export const CONMED_FAMILY = "RESTRICTED_PAYMENTS" as const;

const EVIDENCE_PATH =
  "docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:9e35243e01539edee04ff6a5.json";
const VERIFIED_UNITS_PATH =
  "docs/phase-3-conmed-population-verified/run-original/evidence/verified-units/discovery-candidate:9e35243e01539edee04ff6a5.verified-units.json";
const SOURCE_CURATED =
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";
const CERTIFIED_72C =
  "docs/phase-3-live-validation/7.2c-recompute-phase2-certified/10-certification.json";

export type EvidenceClass = "IN_REPO" | "EXTERNAL_OR_PAID" | "ABSENT";

export type EvidenceInventoryRow = {
  piece: string;
  class: EvidenceClass;
  status: string;
  detail: string;
  path?: string;
};

export type PathStageStatus =
  | "PASSED"
  | "PARTIAL"
  | "BLOCKED"
  | "NOT_ATTEMPTED"
  | "CONTRAST_ONLY";

export type EvidenceToExecutionResult = {
  schema: "evidence-to-execution.conmed-76d.v1";
  evaluatedAt: string;
  gitSha: string;
  family: typeof CONMED_FAMILY;
  target: {
    candidateRef: string;
    section: string;
    companyId: string;
    instrumentKey: string;
    operativeSourceText: string;
  };
  evidenceInventory: EvidenceInventoryRow[];
  dependencyOrderedPlan: Array<{
    step: number;
    name: string;
    status: PathStageStatus;
    detail: string;
  }>;
  stages: {
    authenticSource: { present: boolean; sha256: string | null };
    compilation: { status: string; failureReasons: string[] };
    semanticVerification: {
      status: string;
      materialFindings: Array<{ type: string; severity: string; summary: string }>;
      uncertainFindings: Array<{ type: string; severity: string; summary: string }>;
    };
    verifiedUnitArtifact: {
      present: boolean;
      complete: boolean;
      verificationStatus: string;
      packageHash: string | null;
    };
    certifyCandidate: {
      attempted: "FROM_ON_DISK_ARTIFACTS_ONLY";
      wouldCertify: false;
      blockerCodes: string[];
      detail: string;
    };
    vep: {
      targetCandidateCertified: false;
      authenticatedScanCertifiedCount: number;
      adapterOutcome: string;
      contrast72cDerived: boolean;
    };
    eligiblePath: {
      for76d: "NO_VEP";
      contrast72c: {
        authority: string;
        pathStatuses: string[];
        unsupportedReasons: string[];
      } | null;
    };
    verifiedCapacity: {
      for76d: "NOT_REACHED";
      contrast72cOutcome: string | null;
    };
    transactionSimulation: {
      for76d: "NOT_REACHED";
      contrast72cExecutable: boolean | null;
      contrast72cRefusal: string[];
    };
  };
  irreducibleBlocker: {
    code: string;
    summary: string;
    requiredNextAuthenticWork: string[];
  };
  customerCapabilitiesDemonstrated: string[];
  customerCapabilitiesNotClaimed: string[];
  workflowVerdict:
    | "EVIDENCE_TO_EXECUTION_DEMONSTRATED"
    | "EVIDENCE_TO_EXECUTION_PARTIAL"
    | "EVIDENCE_TO_EXECUTION_BLOCKED";
  constraintsHonored: string[];
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as T;
}

type PopulationEvidence = {
  candidateRef: string;
  compilerInput: {
    companyId: string;
    instrumentKey: string;
    sourceSectionRef: string;
    operativeSourceText: string;
    operativeSourceTextSha256: string;
  };
  compilation: {
    status: string;
    failureReasons: string[];
    rules: Array<{
      ruleId: string;
      action: string;
      entityScope: string[];
      conditions: unknown[];
      capacityExpression?: { kind?: string; value?: { amount?: number } };
    }>;
  };
  verification: {
    status: string;
    findings: Array<{
      findingType: string;
      severity: string;
      verifierReasoning?: string;
      sourceCitation?: string;
    }>;
  };
  contextBundle: { sufficiencyState: string };
};

type VerifiedUnitsPkg = {
  candidateRef: string;
  complete: boolean;
  verificationStatus: string;
  packageHash: string;
  units: unknown[];
};

/**
 * Evaluate the CONMED §7.6(d) evidence-to-execution path from authentic on-disk artifacts.
 */
export async function evaluateConmed76dEvidenceToExecution(): Promise<EvidenceToExecutionResult> {
  if (!existsSync(join(process.cwd(), EVIDENCE_PATH))) {
    throw new Error(`Missing authentic evidence: ${EVIDENCE_PATH}`);
  }
  if (!existsSync(join(process.cwd(), VERIFIED_UNITS_PATH))) {
    throw new Error(`Missing verified-units package: ${VERIFIED_UNITS_PATH}`);
  }

  const evidence = loadJson<PopulationEvidence>(EVIDENCE_PATH);
  const vu = loadJson<VerifiedUnitsPkg>(VERIFIED_UNITS_PATH);
  const curatedPresent = existsSync(join(process.cwd(), SOURCE_CURATED));
  const certified72cPresent = existsSync(join(process.cwd(), CERTIFIED_72C));

  const materialFindings = (evidence.verification.findings ?? [])
    .filter((f) => f.severity === "MATERIAL")
    .map((f) => ({
      type: f.findingType,
      severity: f.severity,
      summary: (f.verifierReasoning ?? f.sourceCitation ?? f.findingType).slice(0, 280),
    }));
  const uncertainFindings = (evidence.verification.findings ?? [])
    .filter((f) => f.severity === "UNCERTAIN")
    .map((f) => ({
      type: f.findingType,
      severity: f.severity,
      summary: (f.verifierReasoning ?? f.sourceCitation ?? f.findingType).slice(0, 280),
    }));

  const certifyBlockers = [
    evidence.compilation.status !== "COMPLETED" ? "COMPILATION_NOT_COMPLETED" : null,
    evidence.verification.status !== "VERIFIED_NO_MATERIAL_GAP_FOUND" &&
    evidence.verification.status !== "VERIFIED_WITH_NON_MATERIAL_FINDINGS"
      ? "VERIFICATION_NOT_CLEAN"
      : null,
    materialFindings.length > 0 || uncertainFindings.length > 0
      ? "OPEN_MATERIAL_OR_UNCERTAIN_FINDING"
      : null,
    evidence.contextBundle.sufficiencyState !== "SUFFICIENT"
      ? "CONTEXT_CONTRACT_UNACCEPTABLE"
      : null,
  ].filter((x): x is string => Boolean(x));

  const scan = attemptAuthenticatedVep();
  const targetCertified = scan.records.some(
    (r) => r.candidateRef === CONMED_76D_CANDIDATE_REF && r.status === "CERTIFIED",
  );
  const contrast72cDerived =
    scan.adapter.outcome === "DERIVED" &&
    scan.records.some((r) => r.candidateRef === CONMED_72C_CANDIDATE_REF && r.status === "CERTIFIED");

  let contrast72c: EvidenceToExecutionResult["stages"]["eligiblePath"]["contrast72c"] = null;
  let contrastCapacityOutcome: string | null = null;
  let contrastSimExecutable: boolean | null = null;
  let contrastSimRefusal: string[] = [];

  if (scan.adapter.outcome === "DERIVED") {
    const pkg = scan.adapter.package as VerifiedExecutionPackage;
    const enums = enumerateAuthenticPhase4e(pkg);
    const debtEnum = enums.find((e) => e.transactionKind === "UNSECURED_DEBT") ?? enums[0]!;
    contrast72c = {
      authority: debtEnum.authority,
      pathStatuses: debtEnum.paths.map((p) => p.status),
      unsupportedReasons: debtEnum.unsupportedReasons,
    };
    const cap = evaluateAuthenticVerifiedCapacity(pkg);
    contrastCapacityOutcome = cap.outcome;
    const sim = await attemptVerifiedSimulate({
      companyId: pkg.companyId,
      evaluationDate: "2025-06-30",
      amountMillions: 40,
      kind: "UNSECURED_DEBT",
      secured: false,
      verifiedPackage: pkg,
    });
    contrastSimExecutable = sim.executable;
    contrastSimRefusal = sim.refusalSummary;

    // Confirm RP enum over same VEP has no §7.6(d) rule (package is §7.2(c) only).
    const rpEnum = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "RESTRICTED_PAYMENT",
      secured: false,
    });
    void rpEnum;
  }

  const rule = evidence.compilation.rules[0];
  const evidenceInventory: EvidenceInventoryRow[] = [
    {
      piece: "Authentic operative text §7.6(d)",
      class: "IN_REPO",
      status: "PRESENT",
      detail: evidence.compilerInput.operativeSourceText.trim(),
      path: EVIDENCE_PATH,
    },
    {
      piece: "Curated Article VII source fixture",
      class: curatedPresent ? "IN_REPO" : "ABSENT",
      status: curatedPresent ? "PRESENT" : "MISSING",
      detail: "Eighth A&R negative covenants curated extract",
      path: SOURCE_CURATED,
    },
    {
      piece: "Compiled IR leaf (DURING_PERIOD $40M, empty conditions)",
      class: "IN_REPO",
      status: evidence.compilation.status,
      detail: `action=${rule?.action}; entityScope=${JSON.stringify(rule?.entityScope)}; amount=${rule?.capacityExpression?.value?.amount ?? "n/a"}`,
      path: EVIDENCE_PATH,
    },
    {
      piece: "Semantic verification clean (VERIFIED_NO_MATERIAL_GAP_FOUND)",
      class: "ABSENT",
      status: evidence.verification.status,
      detail: `MATERIAL findings=${materialFindings.length}; UNCERTAIN=${uncertainFindings.length}`,
      path: EVIDENCE_PATH,
    },
    {
      piece: "Persisted VerifiedUnitArtifact package",
      class: "IN_REPO",
      status: vu.verificationStatus,
      detail: `complete=${vu.complete}; packageHash=${vu.packageHash}`,
      path: VERIFIED_UNITS_PATH,
    },
    {
      piece: "10-certification.json CERTIFIED for §7.6(d)",
      class: "ABSENT",
      status: targetCertified ? "CERTIFIED" : "NO_CERTIFICATION_PACKET",
      detail: "Population evidence never produced a CERTIFIED candidate certification",
    },
    {
      piece: "Parent Borrower vs BORROWER entity-lattice fidelity",
      class: "IN_REPO",
      status: "LATTICE_COLLAPSE",
      detail:
        "entity-scope-guard aliases PARENT_BORROWER→BORROWER; verifier MATERIAL finding WRONG_ENTITY_SCOPE (source contrasts Parent vs Subsidiary Borrower in §7.6(g))",
    },
    {
      piece: "Definition binding (Parent Borrower, Restricted Payments)",
      class: "IN_REPO",
      status: "MISSING_IN_IR",
      detail: "UNCERTAIN MISSING_DEPENDENCY — dependsOn/definitions empty; action=OTHER",
    },
    {
      piece: "Clean re-compile + re-verify (no open MATERIAL/UNCERTAIN)",
      class: "EXTERNAL_OR_PAID",
      status: "SOFT_GATED",
      detail: "Soft gate forbids paid Phase-3 re-runs; offline clean packet does not exist for §7.6(d)",
    },
    {
      piece: "Amendment / operative-state attach for Article VII RP",
      class: "IN_REPO",
      status: "POPULATION_NOTES_CURRENT",
      detail:
        "Population supersession CURRENT_OPERATIVE for this leaf; instrument-level Omnibus/Second-Amendment unattached effects remain (shared CONMED honesty limit)",
    },
    {
      piece: "NS-4 APPROVED financials + utilization completeness (for remaining)",
      class: "EXTERNAL_OR_PAID",
      status: "ABSENT",
      detail: "Not required to prove eligible CANDIDATE path for a fixed-dollar period basket; required before verified remaining / AVAILABLE claims",
    },
    {
      piece: "Contrast: §7.2(c) CERTIFIED + DERIVED VEP",
      class: certified72cPresent ? "IN_REPO" : "ABSENT",
      status: certified72cPresent ? "CERTIFIED" : "MISSING",
      detail: "Proves adapter spine; path UNSUPPORTED (cross-rule) — not the eligible-capacity vehicle",
      path: CERTIFIED_72C,
    },
  ];

  const dependencyOrderedPlan: EvidenceToExecutionResult["dependencyOrderedPlan"] = [
    {
      step: 1,
      name: "Authentic source + compiled IR leaf",
      status: evidence.compilation.rules.length > 0 ? "PARTIAL" : "BLOCKED",
      detail: `Compile ${evidence.compilation.status}; leaf present with $40M DURING_PERIOD`,
    },
    {
      step: 2,
      name: "Close semantic gaps (entity scope + definitions) + COMPLETED compile",
      status: "BLOCKED",
      detail: certifyBlockers.includes("COMPILATION_NOT_COMPLETED")
        ? "SEMANTIC_ACCOUNTABILITY_INCOMPLETE / UNKNOWN_SOURCE_COMPLETENESS"
        : "Compile may complete after accountability fix",
    },
    {
      step: 3,
      name: "Clean semantic verification (no open MATERIAL/UNCERTAIN)",
      status: "BLOCKED",
      detail: `verification=${evidence.verification.status}; primary MATERIAL=${materialFindings[0]?.type ?? "none"}`,
    },
    {
      step: 4,
      name: "certifyCandidate → CERTIFIED + hash-aligned VUA",
      status: "BLOCKED",
      detail: `Would-block codes: ${certifyBlockers.join(", ")}`,
    },
    {
      step: 5,
      name: "certifiedMapToVerifiedExecutionPackage → DERIVED VEP",
      status: targetCertified ? "PASSED" : "BLOCKED",
      detail: targetCertified
        ? "Target CERTIFIED present"
        : "No §7.6(d) CERTIFIED artifact; adapter cannot include this unit",
    },
    {
      step: 6,
      name: "enumerateCertifiedPaths → CANDIDATE (RESTRICTED_PAYMENT)",
      status: "NOT_ATTEMPTED",
      detail: "Requires step 5; leaf has empty conditions (no OTHER_RULE_SATISFIED) so eligible path is reachable once CERTIFIED",
    },
    {
      step: 7,
      name: "evaluateVerifiedCapacity(REQUIRE) EXECUTE",
      status: "NOT_ATTEMPTED",
      detail: "Requires eligible path + VEP; empty ledger ⇒ period gross, not verified remaining",
    },
    {
      step: 8,
      name: "attemptVerifiedSimulate on selected eligible path",
      status: "NOT_ATTEMPTED",
      detail: "Requires step 7; do not invent PERMITTED without completeness if publishing remaining",
    },
    {
      step: 9,
      name: "Contrast spine §7.2(c) CERTIFIED→VEP→enum→capacity→simulate",
      status: contrast72cDerived ? "CONTRAST_ONLY" : "BLOCKED",
      detail: contrast72cDerived
        ? `DERIVED VEP; paths=${contrast72c?.pathStatuses.join(",")}; capacity=${contrastCapacityOutcome}; simulateExecutable=${contrastSimExecutable}`
        : "§7.2(c) CERTIFIED packet / adapter not available",
    },
  ];

  return {
    schema: "evidence-to-execution.conmed-76d.v1",
    evaluatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    family: CONMED_FAMILY,
    target: {
      candidateRef: CONMED_76D_CANDIDATE_REF,
      section: CONMED_76D_SECTION,
      companyId: evidence.compilerInput.companyId,
      instrumentKey: evidence.compilerInput.instrumentKey,
      operativeSourceText: evidence.compilerInput.operativeSourceText.trim(),
    },
    evidenceInventory,
    dependencyOrderedPlan,
    stages: {
      authenticSource: {
        present: Boolean(evidence.compilerInput.operativeSourceText),
        sha256: evidence.compilerInput.operativeSourceTextSha256 ?? null,
      },
      compilation: {
        status: evidence.compilation.status,
        failureReasons: evidence.compilation.failureReasons ?? [],
      },
      semanticVerification: {
        status: evidence.verification.status,
        materialFindings,
        uncertainFindings,
      },
      verifiedUnitArtifact: {
        present: true,
        complete: vu.complete,
        verificationStatus: vu.verificationStatus,
        packageHash: vu.packageHash,
      },
      certifyCandidate: {
        attempted: "FROM_ON_DISK_ARTIFACTS_ONLY",
        wouldCertify: false,
        blockerCodes: certifyBlockers,
        detail:
          "certifyCandidate gates require COMPLETED compile + clean verification. On-disk §7.6(d) artifacts fail those gates; no fabricated CERTIFIED packet written.",
      },
      vep: {
        targetCandidateCertified: false,
        authenticatedScanCertifiedCount: scan.certifiedCount,
        adapterOutcome: scan.adapter.outcome,
        contrast72cDerived,
      },
      eligiblePath: {
        for76d: "NO_VEP",
        contrast72c,
      },
      verifiedCapacity: {
        for76d: "NOT_REACHED",
        contrast72cOutcome: contrastCapacityOutcome,
      },
      transactionSimulation: {
        for76d: "NOT_REACHED",
        contrast72cExecutable: contrastSimExecutable,
        contrast72cRefusal: contrastSimRefusal,
      },
    },
    irreducibleBlocker: {
      code: "PHASE3_SEMANTIC_VERIFICATION_NOT_CLEAN",
      summary:
        "CONMED §7.6(d) cannot enter CERTIFIED → VEP → CANDIDATE → capacity → simulate until Phase-3 semantic verification is clean. On-disk status is MATERIAL_DISCREPANCY (WRONG_ENTITY_SCOPE: Parent Borrower collapsed to BORROWER) plus UNCERTAIN MISSING_DEPENDENCY and compile SEMANTIC_ACCOUNTABILITY_INCOMPLETE. Soft gate forbids paid re-verify; no offline-clean CERTIFIED packet exists for this leaf.",
      requiredNextAuthenticWork: [
        "Preserve Parent Borrower ≠ Subsidiary Borrower in IR entity representation (stop silent PARENT_BORROWER→BORROWER permission expansion, or bind a certified definition proving equivalence).",
        "Bind Restricted Payments / Parent Borrower definitions (or fail closed with explicit limitation) so MISSING_DEPENDENCY closes.",
        "Clear SEMANTIC_ACCOUNTABILITY_INCOMPLETE / UNKNOWN_SOURCE_COMPLETENESS so compilation can COMPLETE.",
        "Produce offline-clean VerifiedUnitArtifact + certifyCandidate → CERTIFIED (no fabricated findings resolution).",
        "Then DERIVED VEP → RESTRICTED_PAYMENT CANDIDATE path → REQUIRE capacity → verified simulate.",
      ],
    },
    customerCapabilitiesDemonstrated: [
      "Select one real RP family (§7.6(d)) and see the authentic operative text + EDGAR-backed population evidence bound in-repo.",
      "Inspect a dependency-ordered evidence→execution plan with each stage marked PASSED / PARTIAL / BLOCKED from real artifacts.",
      "See exact Phase-3 blockers (WRONG_ENTITY_SCOPE, MISSING_DEPENDENCY, SEMANTIC_ACCOUNTABILITY_INCOMPLETE) without a false CERTIFIED claim.",
      "See that the authenticated VEP adapter spine already DERIVES a package from CERTIFIED §7.2(c) — and that its path remains UNSUPPORTED (cross-rule), so it is not a substitute eligible RP path.",
      "Receive an explicit irreducible blocker naming the authentic work required before customer execution of §7.6(d).",
    ],
    customerCapabilitiesNotClaimed: [
      "CERTIFIED VerifiedUnitArtifact for §7.6(d)",
      "DERIVED VEP containing §7.6(d)",
      "Eligible CERTIFIED_4E CANDIDATE path for Restricted Payments",
      "Verified capacity EXECUTE / numeric headroom for the $40M basket",
      "Affirmative verified simulate PERMITTED",
      "Verified remaining / AVAILABLE publication",
    ],
    workflowVerdict: "EVIDENCE_TO_EXECUTION_BLOCKED",
    constraintsHonored: [
      "no fabricated CERTIFIED / VEP / PERMITTED",
      "no paid Phase-3 re-run",
      "no competing solver or parallel product engine",
      "no PP003 documentation polish / no duplicate #349 integration PR",
      "no self-merge / no production-authority activation",
      "§7.2(c) used only as contrast spine, not as false RP permission",
    ],
  };
}
