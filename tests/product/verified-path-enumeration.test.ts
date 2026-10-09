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
});
