/**
 * Autonomous challenge stage — attacks real proposed conclusions.
 * Does not invent research essays; only invalidates or confirms executability claims.
 */

import type { ChallengeFinding, LegalChallengeContext, LegalConclusion } from "./types";

const EXECUTABLE_CLAIMS = new Set(["EXECUTABLE_VERIFIED", "LEGACY_ENGINE"]);

/** Conclusions that survived challenge as legally verified executable capacity. LEGACY_ENGINE never qualifies. */
export function countSurvivingExecutable(conclusions: readonly LegalConclusion[]): number {
  return conclusions.filter((c) => c.executability === "EXECUTABLE_VERIFIED").length;
}

/** Legacy covenant-engine conclusions that survived challenge — reported separately, never as verified capability. */
export function countSurvivingLegacy(conclusions: readonly LegalConclusion[]): number {
  return conclusions.filter((c) => c.executability === "LEGACY_ENGINE").length;
}

export function challengeLegalConclusions(params: {
  companyId: string;
  conclusions: LegalConclusion[];
  context: LegalChallengeContext;
}): ChallengeFinding[] {
  const findings: ChallengeFinding[] = [];
  let n = 0;
  const id = (suffix: string) => `challenge-${++n}-${suffix}`;

  for (const c of params.conclusions) {
    if (c.executability === "LEGACY_ENGINE") {
      // A historical engine calculation is not a verified legal conclusion: it may be reported, never
      // counted or promoted as executable capacity, whatever the package's other evidence says.
      findings.push({
        id: id("legacy"),
        severity: "BLOCKER",
        targetConclusionId: c.id,
        category: "LEGACY_EXECUTION",
        statement: `Conclusion ${c.id} is a legacy covenant-engine calculation; it is not legally verified executable capacity.`,
        invalidatesExecutability: true,
      });
    }
    if (EXECUTABLE_CLAIMS.has(c.executability)) {
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
        // Missing utilization evidence is not zero utilization: a remaining-capacity claim without a
        // ledger cannot be executable.
        findings.push({
          id: id("util"),
          severity: "BLOCKER",
          targetConclusionId: c.id,
          category: "UTILIZATION_UNKNOWN",
          statement: `Capacity conclusion ${c.id} lacks utilization ledger evidence — remaining capacity cannot be executed while usage is unknown.`,
          invalidatesExecutability: true,
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

  for (const ref of params.context.unresolvedCrossReferences ?? []) {
    findings.push({
      id: id("xref"),
      severity: "BLOCKER",
      targetConclusionId: null,
      category: "UNRESOLVED_CROSS_REFERENCE",
      statement: `Cross-reference not resolved to a governing provision: ${ref}. No executable claim can rest on an unresolved reference.`,
      invalidatesExecutability: true,
    });
  }

  for (const prov of params.context.ambiguousGoverningProvisions ?? []) {
    findings.push({
      id: id("governing"),
      severity: "BLOCKER",
      targetConclusionId: null,
      category: "AMBIGUOUS_GOVERNING_PROVISION",
      statement: `Governing provision is ambiguous: ${prov}. Which document or version governs must be established before any execution.`,
      invalidatesExecutability: true,
    });
  }

  // Generalized, not issuer-specific: without a Phase-3 verified IR package no company's package can
  // execute under REQUIRE, so every executable claim in the package is blocked.
  if (!params.context.hasVerifiedIrPackage) {
    findings.push({
      id: id("no-ir"),
      severity: "BLOCKER",
      targetConclusionId: null,
      category: "MISSING_IR",
      statement: `No Phase-3 verified IR package is bound for ${params.companyId} — evaluateVerifiedCapacity cannot execute under REQUIRE.`,
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
  // A finding that invalidates executability does so at any severity: an unresolved entity scope or
  // an unresolved definition on an executable claim is enough to stop it being executable.
  const blocked = new Set(
    challenges
      .filter((c) => c.invalidatesExecutability && c.targetConclusionId)
      .map((c) => c.targetConclusionId!),
  );
  // Package-level invalidations stop every executable claim in the package.
  const packageBlock = challenges.some(
    (c) => c.invalidatesExecutability && c.targetConclusionId === null,
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
