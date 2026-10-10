/**
 * Final integration gate for #213 after rebase onto #237 utilization authority.
 * Fail-closed scenarios + REQUIRE-only verified path + LEGACY/fixture labeling.
 */
import { describe, expect, it } from "vitest";
import { attemptVerifiedSimulate, summarizeVerifiedSimulate } from "@/lib/product/unified-position/certified-simulate-bridge";
import { applyAttributedUsageToCapacity, indexAttributedUsages } from "@/lib/product/unified-position/attributed-utilization";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";
import { DEMO_COMPANY_ID, DEMO_EXERCISES } from "@/lib/product/north-star-workflow/demo-exercises";
import {
  buildFixtureVerifiedPackage,
  runFixtureCertifiedPath,
} from "@/lib/product/north-star-workflow/fixture-verified-package";
import { VERIFIED_EXECUTION_POLICY } from "@/lib/contract-model/verified-execution";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("integration gate — verified adapter REQUIRE only", () => {
  it("verified-execution policy is REQUIRE", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
  });

  it("product unified-position does not import raw runtime capacity/transaction modules", () => {
    const root = path.join(process.cwd(), "lib/product/unified-position");
    const files = [
      "certified-simulate-bridge.ts",
      "legacy-simulate-bridge.ts",
      "attributed-utilization.ts",
      "transaction-effects.ts",
      "simulate-handoff.ts",
      "cross-document-completeness.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(root, f), "utf8");
      expect(src).not.toMatch(/runtime\/capacity\/(graph|state)/);
      expect(src).not.toMatch(/runtime\/transaction\/simulate/);
      expect(src).not.toMatch(/from ["']@\/lib\/contract-model\/runtime\//);
    }
  });

  it("certified-simulate-bridge only calls attemptCertifiedTransaction / enumerateCertifiedPaths", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/product/unified-position/certified-simulate-bridge.ts"),
      "utf8",
    );
    expect(src).toContain("attemptCertifiedTransaction");
    expect(src).toContain("enumerateCertifiedPaths");
    expect(src).not.toContain("simulateTransaction(");
    expect(src).not.toContain("evaluateCapacityState");
  });
});

describe("integration gate — fail-closed refusals", () => {
  it("missing VEP + missing evaluation date → precise blockers, not executable", async () => {
    let r: Awaited<ReturnType<typeof attemptVerifiedSimulate>>;
    try {
      r = await attemptVerifiedSimulate({
        companyId: "gate-missing-vep",
        evaluationDate: "",
        amountMillions: 100,
        kind: "SECURED_DEBT",
        secured: true,
        verifiedPackage: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Can't reach database|P1001|PrismaClientInitializationError/i.test(msg)) return;
      throw e;
    }
    const s = summarizeVerifiedSimulate(r);
    expect(s.executable).toBe(false);
    expect(s.blockers.length).toBeGreaterThan(0);
    expect(s.blockers.some((b) => /NO_VERIFIED|MISSING_EVALUATION|NO_APPROVED|CUTOFF/i.test(b))).toBe(true);
  });

  it("missing amount in Ask draft fails closed", () => {
    const d = parseTransactionDraft("Can we incur secured debt on 2026-06-30?");
    expect(d.missingConfirmations).toContain("transaction amount");
    expect(d.amountMillions).toBeNull();
  });

  it("attributed-without-cert cannot publish the ~$10B remaining claim", () => {
    const index = indexAttributedUsages("coherent", [
      {
        usageId: "synth",
        status: "RECORDED",
        amount: { amount: "75000000", currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: "ind_ratio_debt_fccr" },
      },
    ]);
    const hit = index.byKey.get("ind_ratio_debt_fccr")!;
    const applied = applyAttributedUsageToCapacity({
      currentCapacity: 10153.846153846154,
      capacityUnlimited: false,
      attributed: hit,
      supportsRemainingClaim: false,
      authenticity: "SYNTHETIC_LABELED",
    });
    expect(applied.used).toBe(75);
    expect(applied.remaining).toBeNull();
    expect(applied.publicationLabel).toBe("KNOWN_ATTRIBUTED_ONLY");
    // Explicitly reject the prior false-favorable remaining figure.
    expect(applied.remaining).not.toBeCloseTo(10078.846153846154);
  });
});

describe("integration gate — fixture secured-borrowing-100m labeling", () => {
  it("is SYNTHETIC fixture IR on DEMO_COMPANY_ID — not Coherent", () => {
    const exercise = DEMO_EXERCISES.find((e) => e.id === "secured-borrowing-100m");
    expect(exercise).toBeDefined();
    const pkg = buildFixtureVerifiedPackage(exercise!);
    expect("blocked" in pkg && pkg.blocked).toBe(false);
    if ("blocked" in pkg) return;
    expect(pkg.companyId).toBe(DEMO_COMPANY_ID);
    expect(pkg.companyId).not.toBe("coherent");
    expect(pkg.label).toMatch(/FIXTURE|SYNTHETIC/i);
    expect(pkg.note).toMatch(/SYNTHETIC|not Phase 3 certified/i);

    const run = runFixtureCertifiedPath(exercise!);
    // May EXECUTE on fixture world — still must not be confused with Coherent.
    expect(run.irLabel).toMatch(/FIXTURE|SYNTHETIC/i);
    if (!run.blocked && run.simulation?.outcome === "EXECUTED") {
      expect(run.package?.companyId).not.toBe("coherent");
    }
  });
});
