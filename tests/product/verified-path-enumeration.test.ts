/**
 * Phase 4E — neutral path enumeration over VerifiedExecutionPackage.
 * Stacking is never assumed; missing package stays NOT_CERTIFIED_4E.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_EXERCISES,
  buildFixtureVerifiedPackage,
  enumerateCertifiedPaths,
} from "@/lib/product/north-star-workflow";

describe("enumerateCertifiedPaths", () => {
  it("returns NOT_CERTIFIED_4E with incomplete reason when package is absent", () => {
    const r = enumerateCertifiedPaths({
      verifiedPackage: null,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(r.authority).toBe("NOT_CERTIFIED_4E");
    expect(r.stackingAssumed).toBe(false);
    expect(r.paths).toEqual([]);
    expect(r.incompleteReasons).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
  });

  it("enumerates debt permissions and lien restrictions neutrally without selecting a path", () => {
    const exercise = DEMO_EXERCISES.find((e) => e.id === "secured-borrowing-100m");
    expect(exercise).toBeTruthy();
    const pkg = buildFixtureVerifiedPackage(exercise!);
    expect("blocked" in pkg).toBe(false);
    if ("blocked" in pkg) return;

    const r = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(r.stackingAssumed).toBe(false);
    expect(r.paths.length).toBeGreaterThan(0);
    // No auto-selection: every path is a candidate/review/unsupported listing only.
    for (const p of r.paths) {
      expect(["CANDIDATE", "REVIEW_REQUIRED", "UNSUPPORTED", "INCOMPLETE_VERIFICATION"]).toContain(p.status);
      expect(p.pathId.startsWith("path:")).toBe(true);
    }
    const debtish = r.paths.filter((p) => p.action === "INCUR_DEBT" || p.action === "INCUR_SECURED_DEBT");
    const lienish = r.paths.filter((p) => p.action === "CREATE_LIEN" || p.action === "GRANT_COLLATERAL" || p.pathId.includes("restriction"));
    expect(debtish.length).toBeGreaterThan(0);
    expect(lienish.length).toBeGreaterThan(0);
    expect(r.note).toMatch(/Stacking not assumed/i);
    expect(r.note).not.toMatch(/\brecommended\b|\boptimal\b/i);
  });

  it("reports incomplete when package has no matching primary rules for the kind", () => {
    const exercise = DEMO_EXERCISES.find((e) => e.id === "secured-borrowing-100m");
    const pkg = buildFixtureVerifiedPackage(exercise!);
    if ("blocked" in pkg) return;
    const r = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "RESTRICTED_PAYMENT",
      secured: null,
    });
    expect(r.stackingAssumed).toBe(false);
    expect(r.incompleteReasons.some((x) => x.includes("NO_MATCHING_PRIMARY"))).toBe(true);
    expect(["NOT_CERTIFIED_4E", "INCOMPLETE_PACKAGE"]).toContain(r.authority);
  });

  it("refuses SECURED_DEBT CANDIDATE when the VEP has debt permission but no certified lien companion", () => {
    const exercise = DEMO_EXERCISES.find((e) => e.id === "secured-borrowing-100m");
    expect(exercise).toBeTruthy();
    const full = buildFixtureVerifiedPackage(exercise!);
    expect("blocked" in full).toBe(false);
    if ("blocked" in full) return;

    const debtOnly = {
      ...full,
      rules: full.rules.filter(
        (r) => r.action === "INCUR_DEBT" || r.action === "INCUR_SECURED_DEBT" || r.action === "GUARANTEE_DEBT",
      ),
    };
    expect(debtOnly.rules.some((r) => r.action === "CREATE_LIEN" || r.action === "GRANT_COLLATERAL")).toBe(false);
    expect(debtOnly.rules.length).toBeGreaterThan(0);

    const secured = enumerateCertifiedPaths({
      verifiedPackage: debtOnly,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(secured.incompleteReasons).toContain("NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT");
    expect(secured.authority).toBe("INCOMPLETE_PACKAGE");
    expect(secured.paths.every((p) => p.status !== "CANDIDATE")).toBe(true);

    const unsecured = enumerateCertifiedPaths({
      verifiedPackage: debtOnly,
      transactionKind: "UNSECURED_DEBT",
      secured: false,
    });
    expect(unsecured.authority).toBe("CERTIFIED_4E");
    expect(unsecured.paths.some((p) => p.status === "CANDIDATE")).toBe(true);
  });

  it("does not claim CERTIFIED_4E for SECURED_DEBT when only lien rules are certified (pkg-i shape)", () => {
    const exercise = DEMO_EXERCISES.find((e) => e.id === "secured-borrowing-100m");
    const full = buildFixtureVerifiedPackage(exercise!);
    if ("blocked" in full) return;

    const lienOnly = {
      ...full,
      rules: full.rules.filter((r) => r.action === "CREATE_LIEN" || r.action === "GRANT_COLLATERAL"),
    };
    expect(lienOnly.rules.length).toBeGreaterThan(0);

    const secured = enumerateCertifiedPaths({
      verifiedPackage: lienOnly,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(secured.incompleteReasons).toContain("NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT");
    expect(secured.authority).toBe("INCOMPLETE_PACKAGE");
    // Lien companions are not surfaced as standalone secured grants without debt primary.
    expect(secured.paths).toEqual([]);
  });
});
