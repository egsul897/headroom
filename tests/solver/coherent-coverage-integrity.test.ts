/**
 * Phase 8 — coverage-integrity regression guard (task §11).
 *
 * Coherent's SolverCoverageDeclaration rows (populated by
 * scripts/populate-coherent-solver-native.ts) assert `isComplete: true` for
 * six (documentId, side, grantType) scopes. This test proves — against the
 * REAL, live database, not a synthetic fixture — that every Permission row
 * actually in each declared scope is MODELED (never KNOWN_NOT_MODELED) as of
 * whatever the current seed state is, using the exact same predicate
 * `lib/solver/coverage.ts`'s `determineCoverage` applies at runtime.
 *
 * Why this matters: `SolverCoverageDeclaration.isComplete` is a human
 * attestation, not something the schema can enforce structurally (Prisma has
 * no cross-row CHECK constraint). A future migration/seed change could add a
 * new KNOWN_NOT_MODELED Permission to a document/side already declared
 * complete (or delete a MODELED permission a declaration's own notes rely
 * on) without anyone noticing — this test is the mechanical trip-wire task
 * §11 requires: "The test should fail if a future migration/seed change
 * removes a mandatory Permission or relationship while leaving the side
 * declared solver-native."
 *
 * This does NOT re-litigate whether the LEGAL content of each Permission is
 * correct (that is a legal-review question, out of scope for an engineering
 * test) — only that the coverage gate's own structural precondition
 * (declaration exists, is complete, every scoped Permission is MODELED,
 * scope is non-empty) actually holds for Coherent's real, persisted rows.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { determineCoverage, isEffective } from "../../lib/solver/coverage";
import type { CoverageDeclaration, Permission } from "../../lib/solver/types";

const COMPANY_ID = "coherent";
const AS_OF = new Date();

async function loadPermissionsAsSolverType(): Promise<Permission[]> {
  const rows = await prisma.permission.findMany({ where: { companyId: COMPANY_ID } });
  return rows.map((p) => ({
    id: p.id,
    documentId: p.documentId,
    companyId: p.companyId,
    code: p.code ?? undefined,
    grantType: p.grantType,
    amountKind: p.amountKind,
    action: p.action,
    entityScope: p.entityScope,
    formulaType: p.formulaType,
    thresholdValue: Number(p.thresholdValue),
    params: (p.params as Permission["params"]) ?? null,
    eligibilityConditions: (p.eligibilityConditions as unknown as Permission["eligibilityConditions"]) ?? [],
    termConditions: (p.termConditions as unknown as Permission["termConditions"]) ?? [],
    measurementBasis: p.measurementBasis,
    sourceProvision: { documentId: p.documentId, sectionRef: p.sectionRef, definedTermIds: p.definedTermRefs },
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    modelingStatus: p.modelingStatus,
  }));
}

describe("Phase 8 — Coherent solver-native coverage integrity (live DB)", () => {
  it("every declared-complete (documentId, side, grantType) scope actually resolves SOLVER_NATIVE against the live coverage gate", async () => {
    const [declarationRows, permissions] = await Promise.all([
      prisma.solverCoverageDeclaration.findMany({ where: { companyId: COMPANY_ID } }),
      loadPermissionsAsSolverType(),
    ]);

    // If this is 0, either the population script was never run, or a
    // migration/reseed silently dropped Coherent's coverage declarations -
    // both are failures worth surfacing loudly rather than vacuously passing
    // an empty test.
    expect(declarationRows.length).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const row of declarationRows) {
      const declaration: CoverageDeclaration = { documentId: row.documentId, side: row.side, grantType: row.grantType, isComplete: row.isComplete };
      const result = determineCoverage({
        declaration,
        permissions,
        documentId: row.documentId,
        side: row.side,
        grantType: row.grantType,
        asOfDate: AS_OF,
        legacyFormulaPresent: true, // irrelevant to this assertion - we only care whether it resolves SOLVER_NATIVE, not what it falls back to
      });

      if (row.isComplete && result.status !== "SOLVER_NATIVE") {
        failures.push(`${row.documentId}/${row.side}/${row.grantType}: declared complete but coverage gate resolved ${result.status} - ${result.reason}`);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("no Permission row scoped by a complete declaration is KNOWN_NOT_MODELED", async () => {
    const [declarationRows, permissionRows] = await Promise.all([
      prisma.solverCoverageDeclaration.findMany({ where: { companyId: COMPANY_ID, isComplete: true } }),
      prisma.permission.findMany({ where: { companyId: COMPANY_ID } }),
    ]);

    const asSolverType = permissionRows.map((p) => ({ ...p, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo }));

    for (const decl of declarationRows) {
      const scoped = asSolverType.filter((p) => p.documentId === decl.documentId && p.grantType === decl.grantType && isEffective(p, AS_OF));
      expect(scoped.length, `Zero Permission rows in scope for ${decl.documentId}/${decl.side}/${decl.grantType}`).toBeGreaterThan(0);
      const notModeled = scoped.filter((p) => p.modelingStatus !== "MODELED");
      expect(notModeled.map((p) => p.code), `KNOWN_NOT_MODELED row(s) found in a scope declared complete: ${decl.documentId}/${decl.side}/${decl.grantType}`).toEqual([]);
    }
  });

  it("every AUTOMATIC_LINKED_PERMISSION relationship's lien target actually exists and is MODELED", async () => {
    const [relationships, permissions] = await Promise.all([
      prisma.permissionRelationship.findMany({ where: { companyId: COMPANY_ID, relationshipType: "AUTOMATIC_LINKED_PERMISSION" } }),
      prisma.permission.findMany({ where: { companyId: COMPANY_ID } }),
    ]);
    const byId = new Map(permissions.map((p) => [p.id, p]));

    expect(relationships.length).toBeGreaterThan(0);

    for (const rel of relationships) {
      const from = byId.get(rel.fromPermissionId);
      const to = byId.get(rel.toPermissionId);
      expect(from, `AUTOMATIC_LINKED_PERMISSION ${rel.id}: fromPermissionId ${rel.fromPermissionId} does not exist`).toBeDefined();
      expect(to, `AUTOMATIC_LINKED_PERMISSION ${rel.id}: toPermissionId ${rel.toPermissionId} does not exist`).toBeDefined();
      expect(from!.grantType, `${rel.id} should link a DEBT_INCURRENCE permission to a LIEN permission`).toBe("DEBT_INCURRENCE");
      expect(to!.grantType).toBe("LIEN");
      expect(from!.modelingStatus).toBe("MODELED");
      expect(to!.modelingStatus).toBe("MODELED");
    }
  });

  it("clause (6)-linked lien permissions carry NO relationship to clause (24)/(25) (the E-3 non-netting finding must remain a deliberate absence, not silently reintroduced)", async () => {
    const relationships = await prisma.permissionRelationship.findMany({ where: { companyId: COMPANY_ID } });
    const cl6Ids = new Set(["coh-ind-l-cl6-linked-scf", "coh-ind-l-cl6-linked-capex"]);
    const cl2425Ids = new Set(["coh-ind-l-cl24-ratio", "coh-ind-l-cl25-general"]);
    const violating = relationships.filter(
      (r) => (cl6Ids.has(r.fromPermissionId) && cl2425Ids.has(r.toPermissionId)) || (cl6Ids.has(r.toPermissionId) && cl2425Ids.has(r.fromPermissionId))
    );
    expect(violating, "A relationship row was found linking clause-(6) lien capacity to clause-(24)/(25) - this would silently reintroduce netting the legal specification (docs/coherent-phase1-stacking-table.md §C.2/E-3) affirmatively rules out.").toEqual([]);
  });
});
