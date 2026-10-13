/**
 * Canonical financial-metric resolver → Phase 4C capacity / 4D simulation.
 *
 * Proves: package-driven resolution, cross-domain scenarios ($100M secured debt +
 * RP/investment), provisional fail-closed authority, dependency fingerprint
 * propagation, Matthews/Coherent authentic reconstruction vs synthetic lab.
 */
import { describe, expect, it } from "vitest";
import {
  demonstrateDependencyPropagation,
  listRegisteredPackageKeys,
  mayClaimVerifiedRemaining,
  mayEvaluateGrossCapacity,
  resolveCanonicalFinancialInputs,
  resolveRegisteredPackage,
  runCanonicalTransactionScenario,
  MATTHEWS_PKG,
} from "@/lib/product/financial-metric-resolver";
import { MATTHEWS_EXPECTED_EBITDA_MILLIONS } from "@/lib/product/contractual-metrics/packages/matthews-indenture";
import { COHERENT_CERTIFICATE_EBITDA_MILLIONS } from "@/lib/product/contractual-metrics/packages/coherent-credit";
import { makeTestApprovedNs4SnapshotForPackage } from "./ns4-approved-fixture";

const MATTHEWS_PKG_KEY = "matthews:indenture-2027-second-lien";
const COHERENT_PKG_KEY = "coherent:credit-agreement";
const SYNTHETIC_PKG_KEY = "synthetic:demo-credit-facility";

describe("canonical financial-metric resolver", () => {
  it("registers Matthews, Coherent, and synthetic by packageKey (not company-id branching)", () => {
    const keys = listRegisteredPackageKeys();
    expect(keys).toContain(MATTHEWS_PKG_KEY);
    expect(keys).toContain(COHERENT_PKG_KEY);
    expect(keys).toContain(SYNTHETIC_PKG_KEY);

    const byInstrument = resolveRegisteredPackage({
      instrumentKey: "matw-2027-second-lien-notes-indenture",
    });
    expect(byInstrument?.packageKey).toBe(MATTHEWS_PKG_KEY);
    expect(byInstrument?.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
  });

  it("Matthews: Phase 4A contractual EBITDA feeds legacy snapshot + runtime metrics", async () => {
    const bundle = await resolveCanonicalFinancialInputs({ packageKey: MATTHEWS_PKG_KEY });
    expect(bundle).not.toBeNull();
    expect(bundle!.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(mayEvaluateGrossCapacity(bundle!)).toBe(true);
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);

    expect(bundle!.contractualMetrics?.consolidatedEbitda?.status).toBe("CALCULATED");
    expect(bundle!.legacyFinancialSnapshot?.ebitda).toBeCloseTo(MATTHEWS_EXPECTED_EBITDA_MILLIONS, 3);
    expect(bundle!.runtimeMetrics.some((m) => m.metricKey.includes("EBITDA"))).toBe(true);
    expect(bundle!.facts.find((f) => f.key === "contractual_ebitda")?.valueMillions).toBeCloseTo(
      MATTHEWS_EXPECTED_EBITDA_MILLIONS,
      3,
    );
    expect(bundle!.unsupportedMechanics.length).toBeGreaterThan(0);
    expect(bundle!.identity.sourceDocumentId).toBe("matw-2027-second-lien-notes-indenture");
  });

  it("Coherent: certificate-bound EBITDA via different package (heterogeneous vs Matthews)", async () => {
    const bundle = await resolveCanonicalFinancialInputs({ packageKey: COHERENT_PKG_KEY });
    expect(bundle!.legacyFinancialSnapshot?.ebitda).toBeCloseTo(COHERENT_CERTIFICATE_EBITDA_MILLIONS, 3);
    expect(bundle!.ebitdaDerivation?.kind).toMatch(/REPORTED_ONLY|SUPPORTING_RECONSTRUCTION/);
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(bundle!.evidenceAuthority).toBe("PROVISIONAL_RECONSTRUCTION");
  });

  it("synthetic: labeled lab package never yields verified remaining", async () => {
    const bundle = await resolveCanonicalFinancialInputs({ packageKey: SYNTHETIC_PKG_KEY });
    expect(bundle!.evidenceAuthority).toBe("SYNTHETIC_LABELED");
    expect(bundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(mayClaimVerifiedRemaining(bundle!)).toBe(false);
    expect(bundle!.legacyFinancialSnapshot?.ebitda).toBe(100);
  });
});

describe("$100M secured-debt transaction (Matthews)", () => {
  it("evaluates debt, lien, ratios, capacity, ledger effects, post-state on canonical inputs", async () => {
    const result = await runCanonicalTransactionScenario({
      packageKey: MATTHEWS_PKG_KEY,
      amountMillions: 100,
      secured: true,
      action: "SECURED_DEBT_INCURRENCE",
      label: "$100M secured debt incurrence",
    });

    const ebitda = MATTHEWS_EXPECTED_EBITDA_MILLIONS;
    const expectedPreTnl = (809.211 - 33.513) / ebitda;
    const expectedPreSsl = (778.882 - 33.513) / ebitda;
    expect(result.pre.contractualEbitda).toBeCloseTo(ebitda, 3);
    expect(result.pre.totalNetLeverage).toBeCloseTo(expectedPreTnl, 3);
    expect(result.pre.securedNetLeverage).toBeCloseTo(expectedPreSsl, 3);

    expect(result.post.totalDebt).toBeCloseTo(809.211 + 100, 3);
    expect(result.post.securedDebt).toBeCloseTo(778.882 + 100, 3);
    const expectedPostTnl = (809.211 + 100 - 33.513) / ebitda;
    const expectedPostSsl = (778.882 + 100 - 33.513) / ebitda;
    expect(result.post.totalNetLeverage).toBeCloseTo(expectedPostTnl, 3);
    expect(result.post.securedNetLeverage).toBeCloseTo(expectedPostSsl, 3);

    expect(result.debtIncurrence).not.toBeNull();
    expect(result.debtIncurrence!.publicationAuthority).toBe("GROSS_PROVISIONAL_ONLY");

    const families = new Set(result.baskets.map((b) => b.family));
    expect(families.has("INDEBTEDNESS")).toBe(true);
    expect(families.has("LIEN")).toBe(true);
    expect(families.has("RESTRICTED_PAYMENT")).toBe(true);
    expect(families.has("INVESTMENT")).toBe(true);
    expect(families.has("FINANCIAL_COVENANT")).toBe(true);

    expect(result.ledgerEffectsProposed.some((e) => e.kind === "DEBT_INCUR")).toBe(true);
    expect(result.baskets.every((b) => b.mayClaimVerifiedRemaining === false)).toBe(true);

    expect(result.blockersToAuthoritativeAnswer.some((b) => /PROVISIONAL_RECONSTRUCTION/.test(b))).toBe(
      true,
    );
    expect(result.blockersToAuthoritativeAnswer.some((b) => /UNKNOWN/.test(b))).toBe(true);
  });
});

describe("cross-domain: RP and investment on same canonical inputs", () => {
  it("restricted payment uses RP baskets — not debt-specialized", async () => {
    const result = await runCanonicalTransactionScenario({
      packageKey: MATTHEWS_PKG_KEY,
      amountMillions: 25,
      secured: false,
      action: "RESTRICTED_PAYMENT",
      label: "$25M restricted payment",
    });
    expect(result.debtIncurrence).toBeNull();
    expect(result.ledgerEffectsProposed[0]?.kind).toBe("DIVIDEND");
    expect(result.baskets.some((b) => b.family === "RESTRICTED_PAYMENT" && b.status === "modeled")).toBe(
      true,
    );
    expect(result.blockersToAuthoritativeAnswer.length).toBeGreaterThan(0);
    expect(mayClaimVerifiedRemaining(result.bundle)).toBe(false);
  });

  it("investment-funded acquisition path exercises investment grower + general", async () => {
    const result = await runCanonicalTransactionScenario({
      packageKey: COHERENT_PKG_KEY,
      amountMillions: 40,
      secured: false,
      action: "INVESTMENT",
      label: "$40M investment-funded acquisition",
    });
    expect(result.ledgerEffectsProposed[0]?.kind).toBe("INVESTMENT");
    expect(result.baskets.some((b) => b.code === "inv_grower")).toBe(true);
    expect(result.pre.contractualEbitda).toBeCloseTo(COHERENT_CERTIFICATE_EBITDA_MILLIONS, 3);
    expect(result.bundle.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
  });

  it("synthetic $100M secured uses same interface with SYNTHETIC_LABELED authority", async () => {
    const result = await runCanonicalTransactionScenario({
      packageKey: SYNTHETIC_PKG_KEY,
      amountMillions: 100,
      secured: true,
      action: "SECURED_DEBT_INCURRENCE",
      label: "synthetic $100M secured",
    });
    expect(result.pre.contractualEbitda).toBe(100);
    expect(result.pre.totalNetLeverage).toBeCloseTo((250 - 50) / 100, 5);
    expect(result.post.totalDebt).toBe(350);
    expect(result.post.securedDebt).toBe(300);
    expect(result.post.totalNetLeverage).toBeCloseTo((350 - 50) / 100, 5);
    expect(result.bundle.evidenceAuthority).toBe("SYNTHETIC_LABELED");
    expect(result.blockersToAuthoritativeAnswer.some((b) => /SYNTHETIC/.test(b))).toBe(true);
  });
});

describe("dependency propagation", () => {
  it("changed ledger fingerprint or validated NS-4 APPROVED snapshot invalidates fingerprint", async () => {
    const approved = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    const prop = await demonstrateDependencyPropagation(MATTHEWS_PKG_KEY, {
      approvedNs4Snapshot: approved,
    });
    expect(prop.baseline).toHaveLength(32);
    expect(prop.afterLedger).not.toBe(prop.baseline);
    expect(prop.afterApprovedAuthority).not.toBe(prop.baseline);
    expect(prop.changed).toBe(true);

    const withApproved = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG_KEY,
      approvedNs4Snapshot: approved,
    });
    expect(withApproved!.evidenceAuthority).toBe("APPROVED_SNAPSHOT");
    expect(withApproved!.capacityPublication).toBe("GROSS_FROM_APPROVED_SNAPSHOT");
    // Every published fact must carry approved provenance (value binding, not structure alone)
    expect(withApproved!.facts.every((f) => f.evidenceAuthority === "APPROVED_SNAPSHOT")).toBe(true);
    expect(withApproved!.facts.every((f) => f.approvedProvenance != null)).toBe(true);
    expect(
      withApproved!.facts
        .filter((f) => f.valueMillions != null)
        .every((f) => f.readiness === "AVAILABLE_VERIFIED"),
    ).toBe(true);
    // Gross from approved ≠ verified remaining
    expect(mayClaimVerifiedRemaining(withApproved!)).toBe(false);
    expect(withApproved!.notes.some((n) => /verified remaining still refused|UNKNOWN utilization/i.test(n))).toBe(
      true,
    );
  });
});
