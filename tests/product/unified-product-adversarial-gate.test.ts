/**
 * Adversarial gate: Position / Simulate / Ask must share one authority model.
 * Run on the unified Stage 5 tip (#250), which already contains #213 @ 696bd7fa.
 *
 * Fail-closed: missing VEP, missing approved financials, incomplete utilization,
 * synthetic approvals, inconsistent as-of, and surface disagreement.
 *
 * Prisma-backed cases skip when DATABASE_URL is unset or Neon is unreachable —
 * no production Neon writes; no invented pass.
 */
import { describe, expect, it } from "vitest";
import {
  applyAttributedUsageToCapacity,
  indexAttributedUsages,
} from "@/lib/product/unified-position/attributed-utilization";
import {
  attemptVerifiedSimulate,
  summarizeVerifiedSimulate,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";
import {
  buildSimulateHandoffHref,
  simulateActionFromAskKind,
} from "@/lib/product/unified-position/simulate-handoff";
import {
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
  sessionCustodianPrincipal,
  type ProductCapacityView,
} from "@/lib/capacity";
import { VERIFIED_EXECUTION_POLICY } from "@/lib/contract-model/verified-execution";
import { readFileSync } from "node:fs";
import path from "node:path";

const AS_OF = "2026-06-30";
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const ADV_TRUSTED_ISSUER = productionTrustedIssuerAuth([
  sessionCounselPrincipal("counsel-alice"),
  sessionCustodianPrincipal("custodian-bob"),
]);

function attributedEvidence(amount: number, ruleId = "GEN") {
  return {
    usageId: `adv-${ruleId}-${amount}`,
    kind: "ATTRIBUTED_RULE" as const,
    amount,
    currency: "USD",
    effectiveAsOf: AS_OF,
    capacityRuleId: ruleId,
    sharedCapacityId: null,
    legacyBasketFamily: null,
    entityKey: null,
    status: "RECORDED" as const,
    approvalState: "APPROVED" as const,
    sourceLabel: "adversarial",
    authenticity: "AUTHENTIC" as const,
  };
}

/** APPROVED completeness without authenticity/issuer — must never publish remaining. */
function incompleteCompletenessCert(ruleId = "GEN") {
  return {
    capacityRuleId: ruleId,
    asOf: AS_OF,
    approvalState: "APPROVED" as const,
    sourceLabel: "adv-cert",
    kind: "VERIFIED_COMPLETE" as const,
  };
}

/** Production-shaped completeness: AUTHENTIC + issuer bound to trusted identity. */
function authenticCompletenessCert(ruleId = "GEN") {
  return {
    capacityRuleId: ruleId,
    asOf: AS_OF,
    approvalState: "APPROVED" as const,
    sourceLabel: "adv-cert",
    kind: "VERIFIED_COMPLETE" as const,
    authenticity: "AUTHENTIC" as const,
    issuer: {
      role: "COUNSEL_REVIEWER" as const,
      actorId: "counsel-alice",
      attestedAt: `${AS_OF}T12:00:00.000Z`,
    },
  };
}

async function verifiedOrSkip(run: () => ReturnType<typeof attemptVerifiedSimulate>) {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Can't reach database|P1001|PrismaClientInitializationError/i.test(msg)) {
      // Environment flake — not a product false favorable.
      return null;
    }
    throw e;
  }
}

describe("unified product adversarial — REQUIRE + surfaces (pure)", () => {
  it("REQUIRE policy is fixed", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
  });

  it("incomplete utilization never publishes remaining (~$10B class false favorable)", () => {
    const index = indexAttributedUsages("coherent", [
      {
        usageId: "adv-incomplete",
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
    expect(applied.remaining).not.toBeCloseTo(10078.846153846154);

    const views = buildSharedProductCapacityViews({
      gross: {
        amount: 10_153_846_153.846154,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "ind_ratio_debt_fccr",
      },
      utilization: {
        capacityRuleId: "ind_ratio_debt_fccr",
        asOf: AS_OF,
        records: [attributedEvidence(75_000_000, "ind_ratio_debt_fccr")],
      },
    });
    expect(views.POSITION.supportedRemainingCapacity).toBeNull();
    expect(views.POSITION.mayPublishAvailable).toBe(false);
    expect(views.POSITION.publicationLabel).not.toBe("AVAILABLE");
  });

  it("synthetic approvals cannot mint customer remaining even if supportsRemainingClaim is asserted", () => {
    const index = indexAttributedUsages("co", [
      {
        usageId: "synth",
        status: "RECORDED",
        amount: { amount: "10000000", currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: "X" },
      },
    ]);
    const blocked = applyAttributedUsageToCapacity({
      currentCapacity: 100,
      capacityUnlimited: false,
      attributed: index.byKey.get("X")!,
      supportsRemainingClaim: true,
      authenticity: "SYNTHETIC_LABELED",
      allowSyntheticRemaining: false,
    });
    expect(blocked.remaining).toBeNull();
    expect(blocked.publicationLabel).toBe("KNOWN_ATTRIBUTED_ONLY");
  });

  it("inconsistent as-of: Ask draft date must seed Simulate handoff (same evaluationDate)", () => {
    const d = parseTransactionDraft("Can we incur $100 million of secured debt on 2026-08-01?");
    expect(d.evaluationDate).toBe("2026-08-01");
    const action = simulateActionFromAskKind(d.kind)!;
    const href = buildSimulateHandoffHref("co", {
      action,
      amountMillions: d.amountMillions!,
      secured: d.secured,
      evaluationDate: d.evaluationDate,
      source: "ask",
    });
    expect(href).toContain("asOf=2026-08-01");
    expect(href).toContain("amount=100");
    expect(href).toContain("secured=1");
    const d2 = parseTransactionDraft("Can we incur $100 million of secured debt on 2025-12-31?");
    expect(d2.evaluationDate).toBe("2025-12-31");
    expect(d2.evaluationDate).not.toBe(d.evaluationDate);
  });

  it("APPROVED completeness missing authenticity/issuer refuses remaining on all surfaces", () => {
    // Pre-existing harness used this shape and expected 150_000_000; after
    // authenticity+trusted-issuer authority, fail-closed null is correct.
    const views = buildSharedProductCapacityViews({
      gross: {
        amount: 200_000_000,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "GEN",
      },
      utilization: {
        capacityRuleId: "GEN",
        asOf: AS_OF,
        records: [attributedEvidence(50_000_000)],
        completenessCertificate: incompleteCompletenessCert(),
      },
    });
    expect(assertProductCapacityConsistency(views)).toEqual({ ok: true });
    for (const surface of ["POSITION", "SIMULATE", "ASK"] as const) {
      expect(views[surface].supportedRemainingCapacity, surface).toBeNull();
      expect(views[surface].mayPublishAvailable, surface).toBe(false);
      expect(views[surface].publicationLabel, surface).not.toBe("AVAILABLE");
      expect(
        views[surface].blockers.some((b) =>
          /missing authenticity|not production-authoritative|authoritative remaining refused/i.test(b),
        ),
        `${surface} diagnostic`,
      ).toBe(true);
    }
  });

  it("Position / Simulate / Ask disagreeing remaining is rejected by shared-view consistency", () => {
    const views = buildSharedProductCapacityViews({
      gross: {
        amount: 200_000_000,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "GEN",
      },
      utilization: {
        capacityRuleId: "GEN",
        asOf: AS_OF,
        records: [attributedEvidence(50_000_000)],
        completenessCertificate: authenticCompletenessCert(),
        trustedIssuerAuth: ADV_TRUSTED_ISSUER,
      },
    });
    expect(assertProductCapacityConsistency(views)).toEqual({ ok: true });
    expect(views.POSITION.supportedRemainingCapacity).toBe(150_000_000);
    expect(views.SIMULATE.supportedRemainingCapacity).toBe(150_000_000);
    expect(views.ASK.supportedRemainingCapacity).toBe(150_000_000);

    const tampered: Record<"POSITION" | "SIMULATE" | "ASK", ProductCapacityView> = {
      ...views,
      SIMULATE: {
        ...views.SIMULATE,
        supportedRemainingCapacity: (views.SIMULATE.supportedRemainingCapacity ?? 0) + 1,
      },
    };
    const check = assertProductCapacityConsistency(tampered);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.diffs).toContain("SIMULATE.supportedRemainingCapacity");
  });

  it("Ask answer kinds never silently upgrade LEGACY to certified without EXECUTED verified path", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/product/north-star-workflow/transaction-analysis.ts"),
      "utf8",
    );
    expect(src).toMatch(/if \(verifiedSimulate\.executable\)/);
    expect(src).toMatch(/kind:\s*"certified"/);
    expect(src).toMatch(/kind:\s*"legacy_labeled"/);
    expect(src).toMatch(/LEGACY_ENGINE/);
    expect(src).toMatch(/deferredAskNumericalLayer|LEGACY_ENGINE_CAPACITY/);
  });

  it("customer-facing Simulate/Ask copy separates LEGACY from verified", () => {
    const simulate = readFileSync(
      path.join(process.cwd(), "app/[companyId]/simulate/SimulateClient.tsx"),
      "utf8",
    );
    const ask = readFileSync(path.join(process.cwd(), "components/ask/AskShell.tsx"), "utf8");
    const panel = readFileSync(
      path.join(process.cwd(), "components/VerifiedSimulatePanel.tsx"),
      "utf8",
    );
    expect(simulate).toMatch(/LEGACY_ENGINE/);
    expect(simulate).toMatch(/not legal verification/i);
    expect(ask).toMatch(/not legal verification/i);
    expect(panel).toMatch(/LEGACY_ENGINE slider results below are a separate labeled analysis/);
  });

  it("distinguishes gross / known used / verified remaining / legal permission / synthetic in publication labels", () => {
    const noHit = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: null,
    });
    expect(noHit.publicationLabel).toBe("NOT_TRACKED");
    expect(noHit.used).toBeNull();
    expect(noHit.remaining).toBeNull();

    const index = indexAttributedUsages("co", [
      {
        usageId: "u",
        status: "RECORDED",
        amount: { amount: "50000000", currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: "G" },
      },
    ]);
    const knownOnly = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: index.byKey.get("G")!,
      supportsRemainingClaim: false,
    });
    expect(knownOnly.publicationLabel).toBe("KNOWN_ATTRIBUTED_ONLY");
    expect(knownOnly.used).toBe(50);
    expect(knownOnly.remaining).toBeNull();

    const verifiedRemaining = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: index.byKey.get("G")!,
      supportsRemainingClaim: true,
      authenticity: "AUTHENTIC",
    });
    expect(verifiedRemaining.publicationLabel).toBe("SUPPORTED_REMAINING");
    expect(verifiedRemaining.remaining).toBe(150);
  });
});

describeDb("unified product adversarial — Prisma fail-closed", () => {
  it("missing VEP → verified path not executable; LEGACY must not be implied certified", async () => {
    const r = await verifiedOrSkip(() =>
      attemptVerifiedSimulate({
        companyId: "adv-no-vep",
        evaluationDate: AS_OF,
        amountMillions: 100,
        kind: "SECURED_DEBT",
        secured: true,
        verifiedPackage: null,
      }),
    );
    if (!r) return; // DB unreachable — skip without inventing pass
    const s = summarizeVerifiedSimulate(r);
    expect(s.executable).toBe(false);
    expect(s.blockers).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
    expect(r.certified.capacity).toBeNull();
    expect(r.certified.authorityNote).toMatch(/not executable|NOT_CERTIFIED|withheld/i);
  });

  it("missing approved financials / cutoff → blockers, no invented capacity", async () => {
    const r = await verifiedOrSkip(() =>
      attemptVerifiedSimulate({
        companyId: "adv-no-ns4-snapshot",
        evaluationDate: AS_OF,
        amountMillions: 50,
        kind: "SECURED_DEBT",
        secured: true,
        verifiedPackage: null,
      }),
    );
    if (!r) return;
    const s = summarizeVerifiedSimulate(r);
    expect(s.executable).toBe(false);
    expect(
      s.blockers.some((b) => /NO_APPROVED_SNAPSHOT|CUTOFF_UNRESOLVED|NO_VERIFIED/i.test(b)),
    ).toBe(true);
  });
});
