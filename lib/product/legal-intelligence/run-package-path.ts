/**
 * Integrated legal-intelligence path.
 *
 * Two kinds of path exist and are never mixed:
 *   - FIXTURE_PATH: the CONMED and Coherent evaluation fixtures already in the repo. They are
 *     regression surfaces. Their numbers (legacy covenant engine, seed formulas) are reported as
 *     LEGACY_ENGINE and are never counted as verified executable capacity.
 *   - GENERALIZED_FAIL_CLOSED: every other company. No issuer-specific branch exists; the path
 *     derives its evidentiary context from the database (approved snapshots, ACTIVE ledger
 *     entries, verified IR package: none is loadable yet) and the challenge stage blocks every
 *     executable claim it cannot support.
 *
 * Reuses existing engines — does not fabricate capacity or bypass REQUIRE.
 */

import { getCompanyDashboard } from "../../dashboard-service";
import { prisma } from "../../prisma";
import { CONMED_DEMO_COMPANY_ID, CONMED_DEMO_PACKAGE_KEY } from "../conmed-demo/package";
import {
  listConmedCovenantExplorerRows,
  listConmedPackageFacts,
} from "../conmed-demo/covenant-catalog";
import { applyChallengeVerdict, challengeLegalConclusions, countSurvivingExecutable, countSurvivingLegacy } from "./challenge";
import type { LegalConclusion, PackageLegalPathResult } from "./types";

/** Evidence, not assumption: ACTIVE ledger rows are the only basis for "utilization is known". */
async function utilizationLedgerEvidence(companyId: string): Promise<{ activeEntries: number | null; hasUtilizationLedger: boolean }> {
  try {
    const activeEntries = await prisma.ledgerEntry.count({ where: { companyId, status: "ACTIVE" } });
    return { activeEntries, hasUtilizationLedger: activeEntries > 0 };
  } catch {
    // Unreadable ledger evidence is unknown utilization, never "no utilization".
    return { activeEntries: null, hasUtilizationLedger: false };
  }
}

/** No persisted Phase-3 verified IR package loader exists for product companies yet; this is the one place that fact is stated. */
async function verifiedIrPackageEvidence(): Promise<{ hasVerifiedIrPackage: false }> {
  return { hasVerifiedIrPackage: false };
}

async function runConmedPath(): Promise<PackageLegalPathResult> {
  const pathExecuted = [
    "conmed-demo/covenant-catalog",
    "conmed-demo/package-facts",
    "challenge-stage",
    "verified-execution:SKIPPED_NO_IR_PACKAGE",
  ];
  const rows = listConmedCovenantExplorerRows();
  const facts = listConmedPackageFacts();

  const conclusions: LegalConclusion[] = [];

  for (const f of facts) {
    conclusions.push({
      id: `fact-${f.id}`,
      kind: "PACKAGE_FACT",
      statement: f.fact,
      executability: "NOT_EXECUTABLE",
      evidenceCitations: [`${f.evidenceDocumentId} ${f.evidenceCitation}`],
      missingInputs: [],
      limitations: ["Package fact — not a capacity determination"],
      promotedToLegalTruth: 0,
    });
  }

  for (const r of rows) {
    const unresolved = [
      "NEEDS_FINANCIAL_INPUTS",
      "RATIO_GATED_UNRESOLVED",
      "OUT_OF_PACKAGE_UNRESOLVED",
      "SCHEDULE_DEPENDENT_UNRESOLVED",
    ].includes(r.capacityStatus);

    conclusions.push({
      id: `cov-${r.id}`,
      kind: unresolved ? "UNRESOLVED" : "STRUCTURE_SOURCE_BACKED",
      statement: `${r.sectionRef} ${r.family}: ${r.summary}`,
      executability: "NOT_EXECUTABLE",
      evidenceCitations: [r.evidenceDocumentId, r.sectionRef],
      missingInputs: unresolved
        ? [r.capacityExplanation, ...r.requiredDefinedTerms.map((t) => `definition:${t}`)]
        : r.requiredDefinedTerms.map((t) => `definition:${t}`),
      limitations: [r.capacityStatus, r.capacityExplanation],
      promotedToLegalTruth: 0,
    });
  }

  const snap = await prisma.financialSnapshot.count({
    where: { companyId: CONMED_DEMO_COMPANY_ID },
  });
  const ledger = await utilizationLedgerEvidence(CONMED_DEMO_COMPANY_ID);
  const ir = await verifiedIrPackageEvidence();

  const unresolvedTerms = [
    ...new Set(rows.flatMap((r) => r.requiredDefinedTerms)),
  ].slice(0, 20);

  const challenges = challengeLegalConclusions({
    companyId: CONMED_DEMO_COMPANY_ID,
    conclusions,
    context: {
      hasApprovedFinancialSnapshot: snap > 0,
      hasUtilizationLedger: ledger.hasUtilizationLedger,
      hasVerifiedIrPackage: ir.hasVerifiedIrPackage,
      outOfPackageAmendments: [
        "Doc C Second Amendment amends Seventh A&R (not in package)",
      ],
      unresolvedDefinitionTerms: unresolvedTerms,
      entityScopeUnresolved: true,
    },
  });

  const { surviving } = applyChallengeVerdict(conclusions, challenges);
  const blockedReasons = [
    ...new Set(challenges.filter((c) => c.severity === "BLOCKER").map((c) => c.statement)),
  ];

  return {
    schemaVersion: "product.legal-intelligence-path.v2",
    executionBasis: "FIXTURE_PATH",
    generatedAt: new Date().toISOString(),
    companyId: CONMED_DEMO_COMPANY_ID,
    packageKey: CONMED_DEMO_PACKAGE_KEY,
    pathExecuted,
    conclusions: surviving,
    challenges,
    survivingExecutableConclusions: countSurvivingExecutable(surviving),
    survivingLegacyConclusions: countSurvivingLegacy(surviving),
    blockedReasons,
    metrics: {
      covenantRowsExamined: rows.length,
      packageFacts: facts.length,
      capacityExecuted: 0,
      unresolved: surviving.filter((c) => c.kind === "UNRESOLVED").length,
    },
  };
}

async function runCoherentPath(): Promise<PackageLegalPathResult> {
  const pathExecuted = [
    "dashboard-service/getCompanyDashboard",
    "covenant-engine/computeCovenantPosition",
    "challenge-stage",
  ];
  const dash = await getCompanyDashboard("coherent");
  const conclusions: LegalConclusion[] = [];

  const secured = dash.capacity.secured;
  const unsecured = dash.capacity.unsecured;

  conclusions.push({
    id: "coherent-secured-capacity",
    kind: "CAPACITY_EXECUTED",
    statement: `Secured remaining capacity evaluated by legacy covenant engine: ${secured.remainingCapacity}`,
    executability: "LEGACY_ENGINE",
    evidenceCitations: ["coherent seed capacityFormulas", "financialSnapshot"],
    missingInputs: [],
    limitations: [
      "Legacy engine path — not Phase-4 verified-execution REQUIRE",
      "Seed formulas are evaluation fixtures, not authentic CONMED IR",
    ],
    promotedToLegalTruth: 0,
  });
  conclusions.push({
    id: "coherent-unsecured-capacity",
    kind: "CAPACITY_EXECUTED",
    statement: `Unsecured remaining capacity evaluated by legacy covenant engine: ${unsecured.remainingCapacity}`,
    executability: "LEGACY_ENGINE",
    evidenceCitations: ["coherent seed capacityFormulas", "financialSnapshot"],
    missingInputs: [],
    limitations: ["Legacy engine path — not Phase-4 verified-execution REQUIRE"],
    promotedToLegalTruth: 0,
  });

  const snap = await prisma.financialSnapshot.count({ where: { companyId: "coherent" } });
  const ledger = await utilizationLedgerEvidence("coherent");
  const ir = await verifiedIrPackageEvidence();
  const challenges = challengeLegalConclusions({
    companyId: "coherent",
    conclusions,
    context: {
      hasApprovedFinancialSnapshot: snap > 0,
      hasUtilizationLedger: ledger.hasUtilizationLedger,
      hasVerifiedIrPackage: ir.hasVerifiedIrPackage,
      outOfPackageAmendments: [],
      unresolvedDefinitionTerms: [],
      entityScopeUnresolved: false,
    },
  });
  const { surviving } = applyChallengeVerdict(conclusions, challenges);

  return {
    schemaVersion: "product.legal-intelligence-path.v2",
    executionBasis: "FIXTURE_PATH",
    generatedAt: new Date().toISOString(),
    companyId: "coherent",
    packageKey: "coherent-evaluation-seed",
    pathExecuted,
    conclusions: surviving,
    challenges,
    survivingExecutableConclusions: countSurvivingExecutable(surviving),
    survivingLegacyConclusions: countSurvivingLegacy(surviving),
    blockedReasons: [...new Set(challenges.filter((c) => c.severity === "BLOCKER").map((c) => c.statement))],
    metrics: {
      covenantRowsExamined: dash.documents?.length ?? 0,
      packageFacts: 0,
      capacityExecuted: surviving.filter((c) => c.kind === "CAPACITY_EXECUTED").length,
      unresolved: surviving.filter((c) => c.kind === "UNRESOLVED" || c.executability === "BLOCKED")
        .length,
    },
  };
}

/**
 * Generalized path for any company: no issuer branch, no fabricated conclusions. The context is
 * evidence-derived; with no verified IR package loadable the challenge stage blocks every
 * executable claim, so the result is an explicit, reviewable "not determinable", never a number.
 */
async function runGeneralizedFailClosedPath(companyId: string): Promise<PackageLegalPathResult> {
  const pathExecuted = ["generalized/evidence-context", "challenge-stage", "verified-execution:SKIPPED_NO_IR_PACKAGE"];
  const snap = await prisma.financialSnapshot.count({ where: { companyId } });
  const ledger = await utilizationLedgerEvidence(companyId);
  const ir = await verifiedIrPackageEvidence();
  const conclusions: LegalConclusion[] = [];
  const challenges = challengeLegalConclusions({
    companyId,
    conclusions,
    context: {
      hasApprovedFinancialSnapshot: snap > 0,
      hasUtilizationLedger: ledger.hasUtilizationLedger,
      hasVerifiedIrPackage: ir.hasVerifiedIrPackage,
      outOfPackageAmendments: [],
      unresolvedDefinitionTerms: [],
      // Entity scope is unresolved until a verified IR package states it.
      entityScopeUnresolved: true,
    },
  });
  const { surviving } = applyChallengeVerdict(conclusions, challenges);
  return {
    schemaVersion: "product.legal-intelligence-path.v2",
    executionBasis: "GENERALIZED_FAIL_CLOSED",
    generatedAt: new Date().toISOString(),
    companyId,
    packageKey: `${companyId}:no-verified-package`,
    pathExecuted,
    conclusions: surviving,
    challenges,
    survivingExecutableConclusions: countSurvivingExecutable(surviving),
    survivingLegacyConclusions: countSurvivingLegacy(surviving),
    blockedReasons: [...new Set(challenges.filter((c) => c.severity === "BLOCKER").map((c) => c.statement))],
    metrics: { covenantRowsExamined: 0, packageFacts: 0, capacityExecuted: 0, unresolved: 0 },
  };
}

/** Evaluation fixtures with a dedicated path. Regression surfaces only — never generalized capability. */
const FIXTURE_LEGAL_PATHS: Readonly<Record<string, () => Promise<PackageLegalPathResult>>> = {
  [CONMED_DEMO_COMPANY_ID]: runConmedPath,
  coherent: runCoherentPath,
};

export function isFixtureLegalPath(companyId: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIXTURE_LEGAL_PATHS, companyId);
}

export async function runPackageLegalPath(
  companyId: string,
): Promise<PackageLegalPathResult> {
  const fixture = isFixtureLegalPath(companyId) ? FIXTURE_LEGAL_PATHS[companyId] : undefined;
  if (fixture) return fixture();
  return runGeneralizedFailClosedPath(companyId);
}

export async function runIntegratedLegalIntelligence(): Promise<{
  generatedAt: string;
  packages: PackageLegalPathResult[];
}> {
  const packages = [await runConmedPath(), await runCoherentPath()];
  return { generatedAt: new Date().toISOString(), packages };
}
