import { describe, expect, it } from "vitest";
import { assertNoDoubleCounting, classifyCompanyCoverage, determineCoverage, isEffective } from "../../lib/solver/coverage";
import type { CoverageDeclaration, Permission } from "../../lib/solver/types";

const ASOF = new Date("2026-06-30");

function permission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: overrides.id ?? "perm-1",
    documentId: "doc-1",
    companyId: "co-1",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: "incur debt",
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 100,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: "doc-1", sectionRef: "§1" },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

describe("Phase 3 - coverage gate (lib/solver/coverage.ts)", () => {
  describe("Coherent / zero-Permission-row parity (legacy compatibility requirement)", () => {
    it("classifies LEGACY when no declaration exists but a legacy formula does (Coherent's actual state today)", () => {
      const result = determineCoverage({
        declaration: undefined,
        permissions: [],
        documentId: "coherent-indenture",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: true,
      });
      expect(result.status).toBe("LEGACY");
      expect(result.scopedPermissionIds).toEqual([]);
    });

    it("classifies NOT_TESTED when neither a declaration nor a legacy formula exists", () => {
      const result = determineCoverage({
        declaration: undefined,
        permissions: [],
        documentId: "some-doc",
        side: "unsecured",
        grantType: "LIEN",
        asOfDate: ASOF,
        legacyFormulaPresent: false,
      });
      expect(result.status).toBe("NOT_TESTED");
    });

    it("never returns SOLVER_NATIVE merely because zero Permission rows exist (the vacuous-truth trap)", () => {
      // Even with an empty permissions array and no declaration - the state
      // every existing company (including Coherent) is actually in today -
      // the gate must not vacuously conclude "every applicable permission is
      // modeled" from an empty set.
      const result = determineCoverage({
        declaration: undefined,
        permissions: [],
        documentId: "coherent-credit-agreement",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: true,
      });
      expect(result.status).not.toBe("SOLVER_NATIVE");
    });
  });

  describe("Explicit declaration required, and it must be complete", () => {
    const declaration: CoverageDeclaration = { documentId: "doc-1", side: "secured", grantType: "DEBT_INCURRENCE", isComplete: false };

    it("falls back to LEGACY when a declaration exists but is not marked complete", () => {
      const result = determineCoverage({
        declaration,
        permissions: [permission({ modelingStatus: "MODELED" })],
        documentId: "doc-1",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: true,
      });
      expect(result.status).toBe("LEGACY");
    });

    it("falls back to NOT_TESTED when incomplete and no legacy formula exists", () => {
      const result = determineCoverage({
        declaration,
        permissions: [permission({ modelingStatus: "MODELED" })],
        documentId: "doc-1",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: false,
      });
      expect(result.status).toBe("NOT_TESTED");
    });
  });

  describe("Complete declaration + full MODELED coverage -> SOLVER_NATIVE", () => {
    const declaration: CoverageDeclaration = { documentId: "doc-1", side: "secured", grantType: "DEBT_INCURRENCE", isComplete: true };

    it("returns SOLVER_NATIVE when every scoped Permission is MODELED", () => {
      const result = determineCoverage({
        declaration,
        permissions: [
          permission({ id: "p1", modelingStatus: "MODELED" }),
          permission({ id: "p2", modelingStatus: "MODELED" }),
          // A different document/grantType - must not be pulled into scope.
          permission({ id: "p3", documentId: "doc-2", modelingStatus: "KNOWN_NOT_MODELED" }),
          permission({ id: "p4", grantType: "LIEN", modelingStatus: "KNOWN_NOT_MODELED" }),
        ],
        documentId: "doc-1",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: false,
      });
      expect(result.status).toBe("SOLVER_NATIVE");
      expect(result.scopedPermissionIds.sort()).toEqual(["p1", "p2"]);
    });

    it("falls back to LEGACY (never a partial solver-native mix) when even one scoped Permission is KNOWN_NOT_MODELED", () => {
      const result = determineCoverage({
        declaration,
        permissions: [permission({ id: "p1", modelingStatus: "MODELED" }), permission({ id: "p2", modelingStatus: "KNOWN_NOT_MODELED" })],
        documentId: "doc-1",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: true,
      });
      expect(result.status).toBe("LEGACY");
    });

    it("falls back to NOT_TESTED (not SOLVER_NATIVE) when declared complete but zero Permission rows actually exist - a data-entry contradiction", () => {
      const result = determineCoverage({
        declaration,
        permissions: [],
        documentId: "doc-1",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: false,
      });
      expect(result.status).toBe("NOT_TESTED");
    });

    it("respects effective dating - a permission not yet effective is excluded from scope", () => {
      const result = determineCoverage({
        declaration,
        permissions: [
          permission({ id: "p1", modelingStatus: "MODELED", effectiveFrom: new Date("2027-01-01") }), // not yet effective
        ],
        documentId: "doc-1",
        side: "secured",
        grantType: "DEBT_INCURRENCE",
        asOfDate: ASOF,
        legacyFormulaPresent: false,
      });
      // Zero permissions in scope as of ASOF -> contradiction path, not SOLVER_NATIVE.
      expect(result.status).toBe("NOT_TESTED");
    });
  });

  describe("isEffective", () => {
    it("treats both-null as always effective", () => {
      expect(isEffective({ effectiveFrom: null, effectiveTo: null }, ASOF)).toBe(true);
    });
    it("excludes before effectiveFrom", () => {
      expect(isEffective({ effectiveFrom: new Date("2027-01-01"), effectiveTo: null }, ASOF)).toBe(false);
    });
    it("excludes at/after effectiveTo", () => {
      expect(isEffective({ effectiveFrom: null, effectiveTo: new Date("2026-01-01") }, ASOF)).toBe(false);
    });
  });

  describe("Mismatched scope guard", () => {
    it("throws if the declaration passed in does not match the requested scope", () => {
      expect(() =>
        determineCoverage({
          declaration: { documentId: "doc-X", side: "secured", grantType: "DEBT_INCURRENCE", isComplete: true },
          permissions: [],
          documentId: "doc-1",
          side: "secured",
          grantType: "DEBT_INCURRENCE",
          asOfDate: ASOF,
          legacyFormulaPresent: false,
        })
      ).toThrow(/does not match/);
    });
  });

  describe("No double counting (design doc §Q.3, task §5)", () => {
    it("classifies a mixed company (one legacy scope, one solver-native scope) without any scope appearing twice", () => {
      const declarations: CoverageDeclaration[] = [
        { documentId: "legacy-doc", side: "secured", grantType: "DEBT_INCURRENCE", isComplete: false },
        { documentId: "native-doc", side: "secured", grantType: "DEBT_INCURRENCE", isComplete: true },
      ];
      const permissions = [permission({ id: "np1", documentId: "native-doc", modelingStatus: "MODELED" })];
      const legacyFormulaPresence = new Map([
        ["legacy-doc:secured", true],
        ["native-doc:secured", true], // even though a legacy tree ALSO exists for native-doc, solver coverage must win exclusively
      ]);

      const results = classifyCompanyCoverage({ declarations, permissions, asOfDate: ASOF, legacyFormulaPresence });
      expect(results).toHaveLength(2);
      expect(results.find((r) => r.documentId === "legacy-doc")?.status).toBe("LEGACY");
      expect(results.find((r) => r.documentId === "native-doc")?.status).toBe("SOLVER_NATIVE");

      // The core no-double-counting guarantee: each scope appears exactly
      // once across the whole classification, with exactly one status.
      expect(() => assertNoDoubleCounting(results)).not.toThrow();
    });

    it("assertNoDoubleCounting throws if the same scope is classified twice with different statuses", () => {
      const results = [
        { status: "LEGACY" as const, documentId: "d", side: "secured", grantType: "DEBT_INCURRENCE" as const, reason: "a", scopedPermissionIds: [] },
        {
          status: "SOLVER_NATIVE" as const,
          documentId: "d",
          side: "secured",
          grantType: "DEBT_INCURRENCE" as const,
          reason: "b",
          scopedPermissionIds: [],
        },
      ];
      expect(() => assertNoDoubleCounting(results)).toThrow(/Double-counting detected/);
    });
  });
});
