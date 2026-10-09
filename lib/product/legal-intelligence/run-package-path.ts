/**
 * Integrated legal-intelligence path over authentic packages already in the repo.
 * Reuses existing engines — does not fabricate capacity or bypass REQUIRE.
 */

import { getCompanyDashboard } from "../../dashboard-service";
import { prisma } from "../../prisma";
import { CONMED_DEMO_COMPANY_ID, CONMED_DEMO_PACKAGE_KEY } from "../conmed-demo/package";
import {
  listConmedCovenantExplorerRows,
  listConmedPackageFacts,
} from "../conmed-demo/covenant-catalog";
import { applyChallengeVerdict, challengeLegalConclusions } from "./challenge";
import type { LegalConclusion, PackageLegalPathResult } from "./types";

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
  const ledger = 0; // no utilization ledger model populated for CONMED demo

  const unresolvedTerms = [
    ...new Set(rows.flatMap((r) => r.requiredDefinedTerms)),
  ].slice(0, 20);

  const challenges = challengeLegalConclusions({
    companyId: CONMED_DEMO_COMPANY_ID,
    conclusions,
    context: {
      hasApprovedFinancialSnapshot: snap > 0,
      hasUtilizationLedger: ledger > 0,
      hasVerifiedIrPackage: false,
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
    schemaVersion: "product.legal-intelligence-path.v1",
    generatedAt: new Date().toISOString(),
    companyId: CONMED_DEMO_COMPANY_ID,
    packageKey: CONMED_DEMO_PACKAGE_KEY,
    pathExecuted,
    conclusions: surviving,
    challenges,
    survivingExecutableConclusions: surviving.filter(
      (c) => c.executability === "EXECUTABLE_VERIFIED" || c.executability === "LEGACY_ENGINE",
    ).length,
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
  const challenges = challengeLegalConclusions({
    companyId: "coherent",
    conclusions,
    context: {
      hasApprovedFinancialSnapshot: snap > 0,
      hasUtilizationLedger: true,
      hasVerifiedIrPackage: false,
      outOfPackageAmendments: [],
      unresolvedDefinitionTerms: [],
      entityScopeUnresolved: false,
    },
  });
  const { surviving } = applyChallengeVerdict(conclusions, challenges);

  return {
    schemaVersion: "product.legal-intelligence-path.v1",
    generatedAt: new Date().toISOString(),
    companyId: "coherent",
    packageKey: "coherent-evaluation-seed",
    pathExecuted,
    conclusions: surviving,
    challenges,
    survivingExecutableConclusions: surviving.filter(
      (c) => c.executability === "EXECUTABLE_VERIFIED" || c.executability === "LEGACY_ENGINE",
    ).length,
    blockedReasons: challenges.filter((c) => c.severity === "BLOCKER").map((c) => c.statement),
    metrics: {
      covenantRowsExamined: dash.documents?.length ?? 0,
      packageFacts: 0,
      capacityExecuted: surviving.filter((c) => c.kind === "CAPACITY_EXECUTED").length,
      unresolved: surviving.filter((c) => c.kind === "UNRESOLVED" || c.executability === "BLOCKED")
        .length,
    },
  };
}

export async function runPackageLegalPath(
  companyId: string,
): Promise<PackageLegalPathResult> {
  if (companyId === CONMED_DEMO_COMPANY_ID) return runConmedPath();
  if (companyId === "coherent") return runCoherentPath();
  throw new Error(`No integrated legal path registered for companyId=${companyId}`);
}

export async function runIntegratedLegalIntelligence(): Promise<{
  generatedAt: string;
  packages: PackageLegalPathResult[];
}> {
  const packages = [await runConmedPath(), await runCoherentPath()];
  return { generatedAt: new Date().toISOString(), packages };
}
