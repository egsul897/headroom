/**
 * Coverage denominators — unique legal scenarios vs generated executions.
 */

import type { CaseExecutionResult, VerificationCaseMeta } from "./types";
import { listPublicRegistryCases } from "./corpus/registry";

export interface CoverageDenominators {
  uniqueLegalScenarios: number;
  generatedExecutions: number;
  byLegalMechanic: Record<string, number>;
  byIssuer: Record<string, number>;
  byDocumentFamily: Record<string, number>;
  byTransactionType: Record<string, number>;
  byOutcomeClass: Record<string, number>;
  byFixtureClass: Record<string, number>;
  note: string;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function computeCoverageDenominators(args?: {
  cases?: VerificationCaseMeta[];
  results?: CaseExecutionResult[];
}): CoverageDenominators {
  const cases = args?.cases ?? listPublicRegistryCases();
  const results = args?.results ?? [];

  const byLegalMechanic: Record<string, number> = {};
  const byIssuer: Record<string, number> = {};
  const byDocumentFamily: Record<string, number> = {};
  const byTransactionType: Record<string, number> = {};
  const byOutcomeClass: Record<string, number> = {};
  const byFixtureClass: Record<string, number> = {};
  const uniqueKeys = new Set<string>();

  for (const c of cases) {
    bump(byFixtureClass, c.fixtureClass);
    bump(byLegalMechanic, c.lane);
    for (const m of c.mechanics) bump(byLegalMechanic, `mechanic:${m}`);
    for (const p of c.sourcePackageIds) {
      bump(byDocumentFamily, p);
      const issuer = p.split("-")[0] ?? p;
      bump(byIssuer, issuer);
    }
    const txn = c.structureFamilies.find((f) => f.startsWith("kind:"))?.slice(5)
      ?? c.structureFamilies.find((f) => f.startsWith("sequence:"))?.slice(9)
      ?? c.lane;
    bump(byTransactionType, txn);
    const outcome =
      "holdoutSealId" in c.provenance
        ? "SEALED"
        : c.provenance.expectedLegalOutcome;
    bump(byOutcomeClass, outcome);
    // Unique legal scenario key: package + lane + expected + primary structure family
    const primary = c.structureFamilies[0] ?? c.caseId;
    uniqueKeys.add(`${c.sourcePackageIds[0]}|${c.lane}|${outcome}|${primary}|${c.caseId}`);
  }

  return {
    uniqueLegalScenarios: uniqueKeys.size,
    generatedExecutions:
      results.length ||
      cases.filter((c) => !("holdoutSealId" in c.provenance) && c.fixtureClass !== "BLIND_AUTHENTIC_HOLDOUT")
        .length,
    byLegalMechanic,
    byIssuer,
    byDocumentFamily,
    byTransactionType,
    byOutcomeClass,
    byFixtureClass,
    note: "uniqueLegalScenarios counts distinct grounded cases; generatedExecutions counts harness runs (may include metamorphic variants).",
  };
}
