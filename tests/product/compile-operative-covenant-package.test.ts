/**
 * Acceptance: compileOperativeCovenantPackage on Matthews + MHK.
 *
 * Same generic discovery/compile path — no issuer-specific production branches.
 * Independent expectations from tests/fixtures/autonomous-covenant-compilation/*.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileOperativeCovenantPackage,
  matthewsOperativePackageContext,
  mhkOperativePackageContext,
} from "@/lib/product/autonomous-covenant-compilation";
import {
  MATTHEWS_INDEPENDENT_GT,
  parseUsdFromIndependentQuotation,
} from "@/tests/fixtures/autonomous-covenant-compilation/matthews-independent-expected";
import { MHK_INDEPENDENT_GT } from "@/tests/fixtures/autonomous-covenant-compilation/mhk-independent-expected";

const DISCOVERY_SRC = readFileSync(
  join(process.cwd(), "lib/contract-model/compiler/discovery/definition-exception-catalog.ts"),
  "utf8",
);
const OPERATIVE_SRC = readFileSync(
  join(process.cwd(), "lib/contract-model/analysis/operative-covenant-package.ts"),
  "utf8",
);
const CONTEXT_SRC = readFileSync(
  join(process.cwd(), "lib/product/autonomous-covenant-compilation/package-contexts.ts"),
  "utf8",
);

describe("compileOperativeCovenantPackage — issuer-agnostic integrity", () => {
  it("discovery / operative compile / package contexts have no companyId switches or issuer regex targets", () => {
    expect(DISCOVERY_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(DISCOVERY_SRC).not.toMatch(/\b(matthews|mhk|mohawk|conmed)\b/i);
    expect(OPERATIVE_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(OPERATIVE_SRC).not.toMatch(/if\s*\(\s*packageContext\.companyId/);
    // Loaders may name files/paths; must not contain candidate-locating regexes for §7.03(f) / Permitted Debt(1)(a).
    expect(CONTEXT_SRC).not.toMatch(/not\s+to\s+exceed\s+\\?\$1,300/);
    expect(CONTEXT_SRC).not.toMatch(/7\.03\(f\)/);
    expect(CONTEXT_SRC).not.toMatch(/Permitted Receivables Financings[\s\S]{0,80}700/);
  });

  it("does not mutate process.env credentials (no delete AI_GATEWAY/ANTHROPIC)", () => {
    expect(OPERATIVE_SRC).not.toMatch(/delete\s+process\.env\.AI_GATEWAY_API_KEY/);
    expect(OPERATIVE_SRC).not.toMatch(/delete\s+process\.env\.ANTHROPIC_API_KEY/);
    const prevGateway = process.env.AI_GATEWAY_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "sentinel-gateway-must-survive";
    process.env.ANTHROPIC_API_KEY = "sentinel-anthropic-must-survive";
    return compileOperativeCovenantPackage(matthewsOperativePackageContext()).finally(() => {
      expect(process.env.AI_GATEWAY_API_KEY).toBe("sentinel-gateway-must-survive");
      expect(process.env.ANTHROPIC_API_KEY).toBe("sentinel-anthropic-must-survive");
      if (prevGateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = prevGateway;
      if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAnthropic;
    });
  });
});

describe("Matthews authentic package — generic discovery → VE", () => {
  it("discovers numbered Permitted Debt baskets and compiles (1)(a) as GROSS; refuses grandfather/ratio", async () => {
    const result = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    expect(result.diagnostics.productionAvailablePublished).toBe(false);
    expect(result.diagnostics.verifiedRemainingPublished).toBe(false);
    expect(result.diagnostics.falseExecutableClassifications).toBe(0);
    expect(result.diagnostics.trustedIdentityActivation).toBe("BLOCKED");

    const expected1a = parseUsdFromIndependentQuotation(
      MATTHEWS_INDEPENDENT_GT.sourceQuotations.permittedDebt1aCap,
    );
    expect(expected1a).toBe(1_300_000_000);

    for (const req of MATTHEWS_INDEPENDENT_GT.mustDiscover) {
      const unit =
        result.executableUnits.find((u) => req.matchSourceRef.test(u.sourceRef)) ??
        result.rejectedUnits.find((u) => req.matchSourceRef.test(u.sourceRef)) ??
        result.offlineCompile.units.find((u) => req.matchSourceRef.test(u.sourceRef));
      expect(unit, `missing discovery for ${req.id}`).toBeTruthy();

      if (req.mustBeExecutable) {
        const exe = result.executableUnits.find((u) => req.matchSourceRef.test(u.sourceRef));
        expect(exe, `${req.id} must be executable`).toBeTruthy();
        expect(exe!.capacityClass).toBe(req.capacityClass);
        expect(exe!.sourceBackedGrossCapacityUsd).toBe(expected1a);
        expect(exe!.verifiedRemainingCapacityUsd).toBeNull();
        expect(exe!.productionAvailableCapacityUsd).toBeNull();
        expect(exe!.sourceSpan.charStart).not.toBeNull();
      } else {
        expect(result.executableUnits.some((u) => req.matchSourceRef.test(u.sourceRef))).toBe(false);
      }
    }

    // Notes grandfather must not become GROSS ceiling.
    const notes = result.executableUnits.find((u) => /def:Permitted Debt\(2\)/i.test(u.sourceRef));
    expect(notes).toBeUndefined();
    const notesRejected = result.rejectedUnits.find((u) => /def:Permitted Debt\(2\)/i.test(u.sourceRef));
    expect(notesRejected).toBeTruthy();

    // Coverage honesty: report missed/unsupported relevant provisions.
    expect(result.coverage.missedOrUnsupportedRelevant.length).toBeGreaterThan(0);
    expect(result.coverage.discoveredRatioPermissionCount).toBeGreaterThanOrEqual(1);
    expect(["PARTIAL", "PROVEN"]).toContain(result.diagnostics.autonomousCompilationProven);
    expect(result.diagnostics.autonomousCompilationProven).not.toBe("PROVEN");
  });
});

describe("MHK authentic package — same generic path", () => {
  it("discovers §7.01/§7.03 catalogs and compiles fixed-dollar + greater-of without issuer regex", async () => {
    const result = await compileOperativeCovenantPackage(mhkOperativePackageContext());
    expect(result.diagnostics.productionAvailablePublished).toBe(false);
    expect(result.diagnostics.falseExecutableClassifications).toBe(0);

    for (const cat of MHK_INDEPENDENT_GT.mustDiscoverCatalogs) {
      const found = result.offlineCompile.exceptionCatalogs.find((c) =>
        c.termExact.includes(`Section ${cat.section}`),
      );
      expect(found, `catalog ${cat.section}`).toBeTruthy();
      expect(found!.clauses.map((c) => c.marker).join("")).toBe(cat.expectedMarkers);
    }

    const expected703f = parseUsdFromIndependentQuotation(
      MHK_INDEPENDENT_GT.sourceQuotations.receivables703f,
    );
    expect(expected703f).toBe(700_000_000);

    const f = result.executableUnits.find((u) => u.sourceRef === "7.03(f)");
    expect(f).toBeTruthy();
    expect(f!.capacityClass).toBe("SOURCE_BACKED_GROSS_CONTRACTUAL");
    expect(f!.sourceBackedGrossCapacityUsd).toBe(expected703f);

    const i = result.executableUnits.find((u) => u.sourceRef === "7.01(i)");
    expect(i).toBeTruthy();
    expect(i!.capacityClass).toBe("SOURCE_BACKED_GROSS_CONTRACTUAL");
    expect(i!.sourceBackedGrossCapacityUsd).toBe(
      parseUsdFromIndependentQuotation(MHK_INDEPENDENT_GT.sourceQuotations.lien701i),
    );

    const g = result.executableUnits.find((u) => u.sourceRef === "7.03(g)");
    expect(g).toBeTruthy();
    expect(g!.capacityClass).toBe("MODELED_HYPOTHETICAL");
    expect(g!.missingDependencies.some((d) => /financial_metric|Total Assets/i.test(d))).toBe(true);

    const u = result.executableUnits.find((u) => u.sourceRef === "7.01(u)");
    expect(u).toBeTruthy();
    expect(u!.capacityClass).toBe("MODELED_HYPOTHETICAL");

    // Rejected units must be reported, not silently dropped.
    expect(result.rejectedUnits.length).toBeGreaterThan(0);
    expect(result.coverage.executableFixedDollarCount).toBeGreaterThanOrEqual(2);
    expect(result.coverage.executableGreaterOfCount).toBeGreaterThanOrEqual(2);
  });
});

describe("adversarial — wrong document / unsupported conditions", () => {
  it("refuses executable elevation for ratio-only synthetic package", async () => {
    const result = await compileOperativeCovenantPackage({
      companyId: "adversarial-ratio",
      packageKey: "ratio-only",
      asOfDate: "2024-12-31",
      documents: [
        {
          documentId: "ratio-doc",
          label: "Ratio Only",
          text: `
SECTION 4.09 Limitation on Incurrence of Debt.
(a) The Company may Incur Debt if the Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00.
(b) Reserved.
`,
        },
      ],
    });
    expect(result.executableUnits.every((u) => u.capacityClass !== "PRODUCTION_AVAILABLE")).toBe(true);
    expect(result.executableUnits.filter((u) => u.sourceBackedGrossCapacityUsd != null)).toHaveLength(0);
    expect(result.diagnostics.productionAvailablePublished).toBe(false);
  });

  it("Matthews and MHK stay package-distinct through the same API", async () => {
    const matthews = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    const mhk = await compileOperativeCovenantPackage(mhkOperativePackageContext());
    const mGross = matthews.executableUnits.find((u) => u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL");
    const hGross = mhk.executableUnits.find((u) => u.sourceRef === "7.03(f)");
    expect(mGross!.documentId).not.toBe(hGross!.documentId);
    expect(mGross!.sourceBackedGrossCapacityUsd).toBe(1_300_000_000);
    expect(hGross!.sourceBackedGrossCapacityUsd).toBe(700_000_000);
  });
});
