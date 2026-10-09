/**
 * Autonomous challenge stage — attacks real proposed conclusions.
 * Does not invent research essays; only invalidates or confirms executability claims.
 */

import type { ChallengeFinding, LegalConclusion } from "./types";

export function challengeLegalConclusions(params: {
  companyId: string;
  conclusions: LegalConclusion[];
  context: {
    hasApprovedFinancialSnapshot: boolean;
    hasUtilizationLedger: boolean;
    hasVerifiedIrPackage: boolean;
    outOfPackageAmendments: string[];
    unresolvedDefinitionTerms: string[];
    entityScopeUnresolved: boolean;
  };
}): ChallengeFinding[] {
  const findings: ChallengeFinding[] = [];
  let n = 0;
  const id = (suffix: string) => `challenge-${++n}-${suffix}`;

  for (const c of params.conclusions) {
    if (c.executability === "EXECUTABLE_VERIFIED" || c.executability === "LEGACY_ENGINE") {
      if (!params.context.hasApprovedFinancialSnapshot) {
        findings.push({
          id: id("fin"),
          severity: "BLOCKER",
          targetConclusionId: c.id,
          category: "MISSING_FINANCIALS",
          statement: `Conclusion ${c.id} claims executability without an approved financial snapshot.`,
          invalidatesExecutability: true,
        });
      }
      if (!params.context.hasUtilizationLedger && c.kind === "CAPACITY_EXECUTED") {
        findings.push({
          id: id("util"),
          severity: "MATERIAL",
          targetConclusionId: c.id,
          category: "UTILIZATION_UNKNOWN",
          statement: `Capacity conclusion ${c.id} lacks utilization ledger — remaining capacity may be overstated if usage is unknown.`,
          invalidatesExecutability: c.promotedToLegalTruth === 1,
        });
      }
      if (c.executability === "EXECUTABLE_VERIFIED" && !params.context.hasVerifiedIrPackage) {
        findings.push({
          id: id("ir"),
          severity: "BLOCKER",
          targetConclusionId: c.id,
          category: "MISSING_VERIFICATION",
          statement: `EXECUTABLE_VERIFIED claimed for ${c.id} but no verified IR package is bound.`,
          invalidatesExecutability: true,
        });
      }
    }

    if (c.kind === "STRUCTURE_SOURCE_BACKED" && c.promotedToLegalTruth === 1) {
      findings.push({
        id: id("promo"),
        severity: "BLOCKER",
        targetConclusionId: c.id,
        category: "MISSING_VERIFICATION",
        statement: `Structure-only conclusion ${c.id} illegally promoted to legal truth.`,
        invalidatesExecutability: true,
      });
    }

    for (const miss of c.missingInputs) {
      if (/definition|defined term/i.test(miss)) {
        findings.push({
          id: id("def"),
          severity: "MATERIAL",
          targetConclusionId: c.id,
          category: "UNRESOLVED_DEFINITION",
          statement: `Unresolved definition dependency on ${c.id}: ${miss}`,
          invalidatesExecutability: c.executability !== "NOT_EXECUTABLE",
        });
      }
    }
  }

  for (const amd of params.context.outOfPackageAmendments) {
    findings.push({
      id: id("amd"),
      severity: "BLOCKER",
      targetConclusionId: null,
      category: "AMENDMENT_OUT_OF_PACKAGE",
      statement: `Amendment/target outside governing package: ${amd}. Operative precedence cannot be fully determined.`,
      invalidatesExecutability: true,
    });
  }

  for (const term of params.context.unresolvedDefinitionTerms.slice(0, 12)) {
    findings.push({
      id: id("term"),
      severity: "INFO",
      targetConclusionId: null,
      category: "UNRESOLVED_DEFINITION",
      statement: `Defined term required by covenant rows but not resolved for execution: ${term}`,
      invalidatesExecutability: false,
    });
  }

  if (params.context.entityScopeUnresolved) {
    findings.push({
      id: id("entity"),
      severity: "MATERIAL",
      targetConclusionId: null,
      category: "ENTITY_SCOPE",
      statement:
        "Guarantor / restricted-subsidiary entity scope is not fully resolved for capacity attribution.",
      invalidatesExecutability: true,
    });
  }

  if (!params.context.hasVerifiedIrPackage && params.companyId === "conmed-demo") {
    findings.push({
      id: id("no-ir"),
      severity: "BLOCKER",
      targetConclusionId: null,
      category: "MISSING_IR",
      statement:
        "No Phase-3 verified IR package is loaded for CONMED — evaluateVerifiedCapacity cannot execute under REQUIRE.",
      invalidatesExecutability: true,
    });
  }

  return findings;
}

/** Strip or downgrade conclusions invalidated by blocker challenges. */
export function applyChallengeVerdict(
  conclusions: LegalConclusion[],
  challenges: ChallengeFinding[],
): { surviving: LegalConclusion[]; blockedIds: string[] } {
  const blocked = new Set(
    challenges
      .filter((c) => c.invalidatesExecutability && c.severity === "BLOCKER" && c.targetConclusionId)
      .map((c) => c.targetConclusionId!),
  );
  // Package-level blockers invalidate all executable claims
  const packageBlock = challenges.some(
    (c) => c.invalidatesExecutability && c.severity === "BLOCKER" && c.targetConclusionId === null,
  );

  const surviving: LegalConclusion[] = [];
  const blockedIds: string[] = [];
  for (const c of conclusions) {
    if (packageBlock && (c.executability === "EXECUTABLE_VERIFIED" || c.executability === "LEGACY_ENGINE")) {
      blockedIds.push(c.id);
      surviving.push({
        ...c,
        executability: "BLOCKED",
        kind: "UNRESOLVED",
        promotedToLegalTruth: 0,
        limitations: [...c.limitations, "Blocked by package-level challenge finding"],
      });
      continue;
    }
    if (blocked.has(c.id)) {
      blockedIds.push(c.id);
      surviving.push({
        ...c,
        executability: "BLOCKED",
        kind: "UNRESOLVED",
        promotedToLegalTruth: 0,
        limitations: [...c.limitations, "Blocked by targeted challenge finding"],
      });
      continue;
    }
    surviving.push(c);
  }
  return { surviving, blockedIds };
}
