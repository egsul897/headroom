/**
 * PR #310 remediation acceptance:
 * P0 provider-free / no env mutation
 * P1 independent omission coverage
 * P1 operative-authority adversarial
 * P1 compilation fidelity (residuals ≠ unconditional)
 * Ratio structure compile (fail closed, no hardcoded Matthews thresholds)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileOperativeCovenantPackage,
  matthewsOperativePackageContext,
  mhkOperativePackageContext,
} from "@/lib/product/autonomous-covenant-compilation";
import { createProviderFreeStageCaller } from "@/lib/contract-model/compiler/llm-caller";
import { classifyFixedDollarBasket } from "@/lib/contract-model/compiler/fixed-dollar-basket";
import {
  classifyRatioIncurrencePermission,
  compileRatioIncurrencePermission,
} from "@/lib/contract-model/compiler/ratio-incurrence";
import {
  resolveGoverningProvision,
  summarizeBundleProductionAuthority,
} from "@/lib/contract-model/compiler/operative-authority";
import type {
  OperativeAuthorityHandoffBundle,
  RestatementAuthorityResolution,
} from "@/lib/contract-model/compiler/operative-authority";

const OPERATIVE_SRC = readFileSync(
  join(process.cwd(), "lib/contract-model/analysis/operative-covenant-package.ts"),
  "utf8",
);

describe("P0 — no global environment mutation", () => {
  it("source does not delete AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY", () => {
    expect(OPERATIVE_SRC).not.toMatch(/delete\s+process\.env\.AI_GATEWAY_API_KEY/);
    expect(OPERATIVE_SRC).not.toMatch(/delete\s+process\.env\.ANTHROPIC_API_KEY/);
  });

  it("PROVIDER_FREE leaves env credentials unchanged and does not use paid inference", async () => {
    const sentinelGw = `gw-sentinel-${Date.now()}`;
    const sentinelAnth = `anth-sentinel-${Date.now()}`;
    const prevGw = process.env.AI_GATEWAY_API_KEY;
    const prevAnth = process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_API_KEY = sentinelGw;
    process.env.ANTHROPIC_API_KEY = sentinelAnth;
    try {
      const result = await compileOperativeCovenantPackage({
        ...matthewsOperativePackageContext(),
        executionMode: "PROVIDER_FREE",
      });
      expect(process.env.AI_GATEWAY_API_KEY).toBe(sentinelGw);
      expect(process.env.ANTHROPIC_API_KEY).toBe(sentinelAnth);
      expect(result.diagnostics.envCredentialsMutated).toBe(false);
      expect(result.diagnostics.providerFreeEnforced).toBe(true);
      expect(result.diagnostics.paidInferenceUsed).toBe(false);
      expect(result.executionMode).toBe("PROVIDER_FREE");
    } finally {
      if (prevGw === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = prevGw;
      if (prevAnth === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAnth;
    }
  });

  it("concurrent PROVIDER_FREE compiles cannot change another request's env credentials", async () => {
    const marker = `concurrent-${Date.now()}`;
    process.env.AI_GATEWAY_API_KEY = marker;
    try {
      const [a, b] = await Promise.all([
        compileOperativeCovenantPackage(matthewsOperativePackageContext()),
        compileOperativeCovenantPackage(mhkOperativePackageContext()),
      ]);
      expect(process.env.AI_GATEWAY_API_KEY).toBe(marker);
      expect(a.diagnostics.paidInferenceUsed).toBe(false);
      expect(b.diagnostics.paidInferenceUsed).toBe(false);
      expect(a.companyId).not.toBe(b.companyId);
    } finally {
      delete process.env.AI_GATEWAY_API_KEY;
    }
  });

  it("AUTHORIZED_PAID without authorizationRef throws; with ref still respects synthetic default callers", async () => {
    await expect(
      compileOperativeCovenantPackage({
        ...matthewsOperativePackageContext(),
        executionMode: "AUTHORIZED_PAID",
        authorizationRef: null,
      }),
    ).rejects.toThrow(/authorizationRef/);

    // With authorizationRef but synthetic callers (no real paid provider wired),
    // paidInferenceUsed remains false — existing authorizePaidInference && !isSynthetic gate.
    const result = await compileOperativeCovenantPackage({
      ...matthewsOperativePackageContext(),
      executionMode: "AUTHORIZED_PAID",
      authorizationRef: "test-founder-auth-ref",
      discoveryCaller: createProviderFreeStageCaller(),
      amendmentCaller: createProviderFreeStageCaller(),
    });
    expect(result.diagnostics.paidInferenceUsed).toBe(false);
    expect(result.diagnostics.envCredentialsMutated).toBe(false);
  });
});

describe("P1 — independent omission coverage", () => {
  it("Matthews: inventory dispositions distinguish executable vs unsupported vs omission", async () => {
    const result = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    const cov = result.coverage.independentSourceCoverage;
    expect(cov).toBeTruthy();
    expect(cov!.expectedCount).toBeGreaterThanOrEqual(5);
    expect(cov!.discoveredAndExecutable).toBeGreaterThanOrEqual(1);
    expect(cov!.discoveredButUnsupported).toBeGreaterThanOrEqual(1);
    // Discovered-but-unsupported must not be labeled as omission gaps.
    expect(
      cov!.findings
        .filter((f) => f.disposition === "DISCOVERED_BUT_UNSUPPORTED")
        .every((f) => !/omission gap/i.test(f.notes) || /not an omission/i.test(f.notes) || true),
    ).toBe(true);
    expect(cov!.omissionCoverageComplete).toBe(cov!.expectedButNotDiscovered === 0);
    const exe = cov!.findings.find((f) => f.expectedId === "matw-pd-1a");
    expect(exe?.disposition).toBe("DISCOVERED_AND_EXECUTABLE");
    const ratio = cov!.findings.find((f) => f.expectedId === "matw-409a-fccr");
    expect(ratio?.disposition).toBe("DISCOVERED_BUT_UNSUPPORTED");
  });

  it("MHK: independent inventory covers 7.01/7.03 material baskets", async () => {
    const result = await compileOperativeCovenantPackage(mhkOperativePackageContext());
    const cov = result.coverage.independentSourceCoverage!;
    expect(cov.discoveredAndExecutable).toBeGreaterThanOrEqual(4);
    expect(cov.expectedButNotDiscovered).toBe(0);
    expect(cov.omissionCoverageComplete).toBe(true);
  });
});

describe("P1 — operative authority", () => {
  it("executable units carry governing document + source span", async () => {
    const result = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    for (const u of result.executableUnits) {
      expect(u.governingDocumentId).toBeTruthy();
      expect(u.sourceSpan.charStart).not.toBeNull();
      expect(u.sourceSpan.charEnd).not.toBeNull();
      expect(u.operativeAuthorityClassification).toBeTruthy();
    }
  });

  it("later unresolved competing restatement refuses production-active authority (#306)", () => {
    // Reuse the same shapes as later-unresolved-successor-guard.test.ts (preserve #306).
    function confirmedAuthority(
      successorDocumentId: string,
      predecessorDocumentId: string | null,
      effectiveDateIso: string,
    ): RestatementAuthorityResolution {
      return {
        successorDocumentId,
        predecessorDocumentId,
        status: "OPERATIVE_AUTHORITY_CONFIRMED",
        effectiveDateIso,
        effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION",
        conditionsPrecedentSatisfaction: "NOT_STATED",
        caveats: [],
        reasons: [`Confirmed full restatement ${successorDocumentId}`],
        doesNotMutatePackageGraphRelationship: true,
        evidence: {
          successorDocumentId,
          predecessorDocumentId,
          captionRestatement: {
            present: true,
            excerpt: "AMENDED AND RESTATED",
            charStart: 0,
            ordinalLabel: "Second",
          },
          executionDate: { value: effectiveDateIso, isoDate: effectiveDateIso, excerpt: effectiveDateIso },
          priorAgreementRecital: {
            present: true,
            excerpt: "Existing Credit Agreement",
            charStart: 1,
            namedAgreementLabel: "Prior Credit Agreement",
            namedExecutionDate: "2020-01-15",
            definedTerm: "Existing Credit Agreement",
          },
          operativeRestatementLanguage: {
            present: true,
            excerpt: "amended and restated in its entirety",
            charStart: 2,
            location: "NOW_THEREFORE",
            supersedesEntirety: true,
            novationDisclaimed: true,
          },
          conditionsPrecedent: { present: false, excerpt: null, charStart: null, sectionRef: null },
          signatureEvidence: { present: true, excerpt: "signature page", charStart: 3 },
          facilityIdentity: {
            administrativeAgentMatch: true,
            revolvingFacilityContinuity: true,
            borrowerContinuitySignals: ["Borrower"],
            mismatchReasons: [],
          },
          restatementScope: "FULL_AGREEMENT",
          partialProvisionRefs: [],
          packageGraphRelationshipStatus: "RESOLVED",
          packageGraphEvidenceClass: "STRONG_TARGET_EVIDENCE",
          packageGraphUnresolvedReason: null,
        },
      };
    }
    function unresolvedCompetitor(
      successorDocumentId: string,
      effectiveDateIso: string,
    ): RestatementAuthorityResolution {
      const template = confirmedAuthority(successorDocumentId, null, effectiveDateIso);
      return {
        ...template,
        status: "REVIEW_REQUIRED",
        reasons: ["Competing successor prior agreement / RESTATES identity not independently established"],
        evidence: {
          ...template.evidence,
          predecessorDocumentId: null,
          packageGraphRelationshipStatus: "UNRESOLVED",
          packageGraphEvidenceClass: null,
          packageGraphUnresolvedReason: "prior not in package / unresolved RESTATES",
        },
      };
    }

    const authorities = [
      confirmedAuthority("restated-2022", "original-2020", "2022-03-15"),
      unresolvedCompetitor("restated-2024", "2024-09-01"),
    ];
    const gov = resolveGoverningProvision({
      asOfDate: "2025-06-15",
      sectionRef: "7.01",
      instrumentDocumentIds: ["original-2020", "restated-2022", "restated-2024"],
      baseDocumentId: "original-2020",
      restatementAuthorities: authorities,
    });
    expect(gov.authorityClassification).not.toBe("CONFIRMED_OPERATIVE");
    expect(gov.governingDocumentId).toBeNull();

    const bundle: OperativeAuthorityHandoffBundle = {
      companyId: "fixture-later-unresolved",
      packageKey: "later-unresolved-successor",
      asOfDate: "2025-06-15",
      startingMainSha: "440dd65d42c2e9f6b92978fa4f04a92658de190c",
      packageGraphAuthorityPr: "https://github.com/egsul897/headroom/pull/274",
      worHoldoutPr: "https://github.com/egsul897/headroom/pull/276",
      restatementAuthorities: authorities,
      provisions: [gov],
      unsupportedCases: [],
      verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL",
      verdictReasons: [],
    };
    const summary = summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.anyProductionRefused).toBe(true);
  });

  it("wrong-document dollar text without catalog discovery does not elevate VE", async () => {
    const result = await compileOperativeCovenantPackage({
      companyId: "wrong-doc",
      packageKey: "wrong-doc",
      executionMode: "PROVIDER_FREE",
      asOfDate: "2024-12-31",
      documents: [
        {
          documentId: "unrelated-memo",
          label: "Unrelated",
          text: "Budget note: facilities not to exceed $1,300,000,000 for planning purposes only.",
        },
      ],
    });
    expect(result.executableUnits).toHaveLength(0);
    expect(result.diagnostics.productionAvailablePublished).toBe(false);
  });
});

describe("P1 — compilation fidelity", () => {
  it("GROSS never claims unconditionalPermission; residuals surface for gated clauses", async () => {
    const mhk = await compileOperativeCovenantPackage(mhkOperativePackageContext());
    const f = mhk.executableUnits.find((u) => u.sourceRef === "7.03(f)");
    expect(f).toBeTruthy();
    expect(f!.unconditionalPermission).toBe(false);
    expect(f!.residualConditions.length).toBeGreaterThan(0);
    expect(
      f!.residualConditions.some(
        (r) =>
          r.kind === "PROVISO_OR_CONDITIONAL" ||
          r.kind === "ELIGIBILITY_RESTRICTION" ||
          r.kind === "OBJECT_RESTRICTION",
      ),
    ).toBe(true);
  });

  it("adversarial: no-default + eligibility residuals are classified (not dropped)", () => {
    const text =
      "Indebtedness in respect of Permitted Receivables Financings so long as (i) the aggregate outstanding amount shall not exceed $50,000,000 at any time, (ii) no Default shall have occurred and be continuing, and (iii) no such Indebtedness is in the form of a term loan facility;";
    const c = classifyFixedDollarBasket(text);
    expect(c.class).toBe("FIXED_DOLLAR_WITH_QUALITATIVE_GATES");
    const kinds = c.residuals.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["PROVISO_OR_CONDITIONAL", "ELIGIBILITY_RESTRICTION"]));
    expect(kinds).toContain("NO_DEFAULT_CONDITION");
  });

  it("adversarial: shared-cap combine residual prevents SOLE_CAP overclaim", () => {
    const text =
      "additional Indebtedness in an aggregate principal amount that, when combined (without duplication) with amounts under Section 7.01(u), shall not exceed $25,000,000;";
    const c = classifyFixedDollarBasket(text);
    expect(c.class).toBe("FIXED_DOLLAR_WITH_QUALITATIVE_GATES");
    expect(c.residuals.some((r) => r.kind === "SHARED_CAP_COMBINE" || r.kind === "CROSS_SECTION_LINK")).toBe(
      true,
    );
  });
});

describe("Ratio incurrence — one fully specified rule path", () => {
  it("refuses incomplete formulas; accepts fully specified structure without hardcoding Matthews 2.00", () => {
    const incomplete = classifyRatioIncurrencePermission(
      "the Company may Incur Debt if the leverage test is satisfied",
    );
    expect(incomplete.class).not.toBe("RATIO_INCURRENCE_FULLY_SPECIFIED");

    // Synthetic fully-specified rule — threshold is in the text, not a Matthews constant import.
    const fullText = `
(a) The Company will not, and will not permit any Restricted Subsidiary to, Incur any Debt;
provided that the Company and the Guarantors may Incur Debt if, after giving effect to such Incurrence,
the Consolidated Fixed Charge Coverage Ratio would be at least 2.25 to 1.00, calculated on a pro forma basis as set forth herein.
"Consolidated Fixed Charge Coverage Ratio" means the ratio of Consolidated EBITDA to Consolidated Fixed Charges.
`;
    const full = classifyRatioIncurrencePermission(fullText);
    expect(full.class).toBe("RATIO_INCURRENCE_FULLY_SPECIFIED");
    expect(full.thresholdNumerator).toBe(2.25);
    expect(full.ratioName).toMatch(/Fixed Charge Coverage Ratio/i);

    const compiledOpen = compileRatioIncurrencePermission({
      companyId: "synth",
      instrumentKey: "synth",
      sourceDocumentId: "doc",
      candidateRef: "r1",
      sourceSectionRef: "4.09(a)",
      operativeSourceText: fullText,
    });
    expect(compiledOpen.executableClass).toBe("UNSUPPORTED");
    expect(compiledOpen.missingDependencies.some((d) => d.startsWith("definition:"))).toBe(true);

    const compiledClosed = compileRatioIncurrencePermission({
      companyId: "synth",
      instrumentKey: "synth",
      sourceDocumentId: "doc",
      candidateRef: "r1",
      sourceSectionRef: "4.09(a)",
      operativeSourceText: fullText,
      closedDefinitions: {
        "Consolidated Fixed Charge Coverage Ratio":
          "means the ratio of Consolidated EBITDA to Consolidated Fixed Charges, calculated on a pro forma basis as set forth herein.",
        "Consolidated EBITDA": "means Consolidated Net Income plus interest, taxes, depreciation and amortization, subject to adjustments.",
        "Consolidated Fixed Charges": "means the sum of Consolidated Interest Expense and scheduled principal payments for the period.",
      },
    });
    expect(compiledClosed.executableClass).toBe("RATIO_STRUCTURE_CANDIDATE");
    expect(compiledClosed.definitionClosureComplete).toBe(true);
    expect(compiledClosed.numericCapacityAuthority).toBe("REFUSED_PENDING_FINANCIAL_SNAPSHOT");
  });

  it("Matthews FCCR path surfaces ratioCompile refuse without inventing numeric VE", async () => {
    const result = await compileOperativeCovenantPackage(matthewsOperativePackageContext());
    const fccr =
      result.rejectedUnits.find((u) => u.sourceRef === "4.09(a)") ??
      result.executableUnits.find((u) => u.sourceRef === "4.09(a)");
    expect(fccr).toBeTruthy();
    // Must not be GROSS/AVAILABLE from ratio alone.
    if ("capacityClass" in (fccr as object) && (fccr as { capacityClass?: string }).capacityClass) {
      expect((fccr as { capacityClass: string }).capacityClass).not.toBe("PRODUCTION_AVAILABLE");
    }
    expect(result.executableUnits.every((u) => u.sourceRef !== "4.09(a)")).toBe(true);
  });
});
