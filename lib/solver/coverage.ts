/**
 * Phase 3 - solver-native coverage gate.
 *
 * Implements the strict eligibility check from
 * docs/solver-architecture-design.md §Q.2: a document/side/grantType scope
 * is SOLVER_NATIVE only when every contractually-relevant Permission in that
 * scope is MODELED under an explicit, human-attested, complete coverage
 * declaration. Anything short of that - no declaration, an incomplete
 * declaration, or a declaration that turns out to reference a
 * KNOWN_NOT_MODELED permission - falls back to LEGACY (if a legacy
 * CapacityExpr formula exists for that scope) or NOT_TESTED (if neither
 * exists).
 *
 * Why a declaration is required at all, not just "does a MODELED Permission
 * row exist": if coverage were inferred purely from "every Permission row
 * that happens to exist is MODELED," a document/side with ZERO Permission
 * rows at all would vacuously satisfy "every row is MODELED" (there are no
 * rows to violate it) and be misclassified SOLVER_NATIVE with an empty,
 * silently-CLEAR result - exactly the false-CLEAR failure mode task §18
 * point 4 and design doc §Q.2 prohibit. `CoverageDeclaration.isComplete` is
 * the explicit, non-inferable signal that a human has actually finished
 * entering every applicable Permission for a scope; its absence always means
 * "not solver-native," never "trivially solver-native."
 *
 * This module is deliberately legacy-agnostic: it does not import anything
 * from lib/covenant-engine.ts or touch CapacityExpr/CovenantProvision. The
 * caller tells it (via `legacyFormulaPresent`) whether a legacy formula
 * exists for the scope being classified, so this file can be tested and
 * reasoned about in complete isolation from the legacy engine - and so the
 * legacy engine itself never has to import solver code (the "zero behavior
 * change" guarantee holds by construction: nothing in lib/covenant-engine.ts
 * is edited by this phase).
 */

import type { CoverageDeclaration, CoverageResult, CoverageStatus, GrantType, Permission } from "./types";

/** Mirrors covenant-engine.ts's `effectiveDateFilter` semantics: both null = always effective. */
export function isEffective(p: Pick<Permission, "effectiveFrom" | "effectiveTo">, asOfDate: Date): boolean {
  const afterStart = !p.effectiveFrom || p.effectiveFrom.getTime() <= asOfDate.getTime();
  const beforeEnd = !p.effectiveTo || p.effectiveTo.getTime() > asOfDate.getTime();
  return afterStart && beforeEnd;
}

export interface CoverageInputs {
  declaration?: CoverageDeclaration;
  /** Every Permission belonging to the company - this function does its own documentId/grantType/effective-date scoping so callers never have to pre-filter (and risk scoping wrong). */
  permissions: Permission[];
  documentId: string;
  side: string;
  grantType: GrantType;
  asOfDate: Date;
  /** Whether a legacy CapacityExpr formula exists for this document/side - computed by the caller from Document.capacityFormulas, kept out of this module by design (see file header). */
  legacyFormulaPresent: boolean;
}

/**
 * The single coverage-gate predicate. Returns exactly one of
 * SOLVER_NATIVE / LEGACY / NOT_TESTED for a (documentId, side, grantType)
 * scope - never a partial/mixed answer. Callers combine this with a
 * REVIEW_REQUIRED-producing solver run (when NOT_TESTED but the transaction
 * needed this scope) or the legacy per-document loop (when LEGACY) exactly
 * once each; see lib/solver/service.ts for that composition and
 * tests/solver/coverage-gate.test.ts for the no-double-counting proof.
 */
export function determineCoverage(inputs: CoverageInputs): CoverageResult {
  const { declaration, permissions, documentId, side, grantType, asOfDate, legacyFormulaPresent } = inputs;

  const scoped = permissions.filter((p) => p.documentId === documentId && p.grantType === grantType && isEffective(p, asOfDate));
  const scopedPermissionIds = scoped.map((p) => p.id);

  const fallback = (reason: string): CoverageResult => ({
    status: legacyFormulaPresent ? "LEGACY" : "NOT_TESTED",
    documentId,
    side,
    grantType,
    reason,
    scopedPermissionIds,
  });

  if (!declaration) {
    return fallback(
      `No SolverCoverageDeclaration exists for ${documentId}/${side}/${grantType}. ${
        legacyFormulaPresent
          ? "Falling back to legacy CapacityExpr evaluation in full."
          : "No legacy capacity formula exists for this scope either."
      }`
    );
  }

  if (declaration.documentId !== documentId || declaration.side !== side || declaration.grantType !== grantType) {
    throw new Error(
      `determineCoverage called with a declaration (${declaration.documentId}/${declaration.side}/${declaration.grantType}) ` +
        `that does not match the requested scope (${documentId}/${side}/${grantType}).`
    );
  }

  if (!declaration.isComplete) {
    return fallback(
      `SolverCoverageDeclaration for ${documentId}/${side}/${grantType} exists but is not marked complete (isComplete=false). ` +
        `${legacyFormulaPresent ? "Falling back to legacy CapacityExpr evaluation in full." : "No legacy capacity formula exists for this scope either."}`
    );
  }

  if (scoped.length === 0) {
    // Data-entry contradiction: a human declared this scope complete, but no
    // Permission rows actually exist for it. Fail closed rather than trust
    // either the (empty) solver scope or an unrelated legacy tree silently.
    return fallback(
      `SolverCoverageDeclaration for ${documentId}/${side}/${grantType} is marked complete, but zero Permission rows exist in scope - ` +
        `this is a data-entry contradiction, not a valid solver-native scope. ${
          legacyFormulaPresent ? "Falling back to legacy CapacityExpr evaluation." : "No legacy capacity formula exists for this scope either."
        }`
    );
  }

  const notModeled = scoped.filter((p) => p.modelingStatus !== "MODELED");
  if (notModeled.length > 0) {
    return fallback(
      `${notModeled.length} of ${scoped.length} Permission row(s) in scope for ${documentId}/${side}/${grantType} are ` +
        `KNOWN_NOT_MODELED despite a complete coverage declaration. Per design doc §Q.2, a document/side is never partially ` +
        `evaluated - falling back to ${legacyFormulaPresent ? "legacy CapacityExpr evaluation in full" : "NOT_TESTED (no legacy formula exists either)"}.`
    );
  }

  return {
    status: "SOLVER_NATIVE",
    documentId,
    side,
    grantType,
    reason: `All ${scoped.length} Permission row(s) in scope for ${documentId}/${side}/${grantType} are MODELED under a complete coverage declaration.`,
    scopedPermissionIds,
  };
}

/**
 * Batch form over every (documentId, side, grantType) scope a company's
 * declarations name, used by lib/solver/service.ts to classify a whole
 * company (the "mixed database" case from task §17: some scopes legacy,
 * some solver-native, never mixed within one scope).
 */
export function classifyCompanyCoverage(params: {
  declarations: CoverageDeclaration[];
  permissions: Permission[];
  asOfDate: Date;
  /** documentId/side -> whether a legacy CapacityExpr formula exists for that document/side. */
  legacyFormulaPresence: Map<string, boolean>;
}): CoverageResult[] {
  const { declarations, permissions, asOfDate, legacyFormulaPresence } = params;
  return declarations.map((declaration) =>
    determineCoverage({
      declaration,
      permissions,
      documentId: declaration.documentId,
      side: declaration.side,
      grantType: declaration.grantType,
      asOfDate,
      legacyFormulaPresent: legacyFormulaPresence.get(`${declaration.documentId}:${declaration.side}`) ?? false,
    })
  );
}

/**
 * Defensive, throw-on-violation assertion used by lib/solver/service.ts and
 * exercised directly by tests/solver/coverage-gate.test.ts: a
 * (documentId, side) pair must never be classified into more than one
 * composition path when a set of CoverageResults is assembled for a single
 * transaction. This is the mechanical form of the "no double counting"
 * requirement (design doc §Q.3) - not a proof by construction (the coverage
 * gate already returns one status per scope by construction), but a
 * regression guard against a future caller accidentally evaluating the same
 * scope twice through two different code paths.
 */
export function assertNoDoubleCounting(results: CoverageResult[]): void {
  const seen = new Map<string, CoverageStatus>();
  for (const r of results) {
    const key = `${r.documentId}:${r.side}:${r.grantType}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `Double-counting detected: (${key}) was classified twice (${existing} and ${r.status}). ` +
          `A document/side/grantType scope must be evaluated by exactly one composition path.`
      );
    }
    seen.set(key, r.status);
  }
}
