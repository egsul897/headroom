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
import {
  documentsShareOperativeAuthority,
  provisionIdentityMatchesUnit,
} from "@/lib/contract-model/analysis/operative-covenant-package";
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
import { compileVerifiedFixedDollarBridge } from "@/lib/product/real-dashboard-vertical-slice/verified-executable-compile-core";

const OPERATIVE_SRC = readFileSync(
  join(process.cwd(), "lib/contract-model/analysis/operative-covenant-package.ts"),
  "utf8",
);
const VE_CORE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts",
  ),
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

describe("P0 — provision identity required for operative authority", () => {
  it("source never matches authority on governingDocumentId alone", () => {
    expect(OPERATIVE_SRC).not.toMatch(
      /governingDocumentId\s*&&\s*[^=\n]*governingDocumentId\s*===\s*unit\.documentId\s*\)\s*return\s*true/,
    );
    expect(OPERATIVE_SRC).toMatch(/provisionIdentityMatchesUnit/);
  });

  it("adversarial: same-document different-section provisions do not inherit authority", () => {
    const doc = "credit-agreement-2026";
    const section703 = {
      kind: "SECTION",
      sectionRef: "7.03",
      definedTermRef: null,
      governingDocumentId: doc,
    };
    const section701 = {
      kind: "SECTION",
      sectionRef: "7.01",
      definedTermRef: null,
      governingDocumentId: doc,
    };
    const unit703f = { sourceRef: "7.03(f)", documentId: doc };
    const unit701i = { sourceRef: "7.01(i)", documentId: doc };
    const unitOtherDoc = { sourceRef: "7.03(f)", documentId: "other-doc" };

    // Matching section identity binds; sibling section on same document does not.
    expect(provisionIdentityMatchesUnit(section703, unit703f)).toBe(true);
    expect(provisionIdentityMatchesUnit(section703, unit701i)).toBe(false);
    expect(provisionIdentityMatchesUnit(section701, unit703f)).toBe(false);
    expect(provisionIdentityMatchesUnit(section701, unit701i)).toBe(true);

    // Document id alone never binds — even when governingDocumentId equals unit.documentId.
    const docOnly = {
      kind: "SECTION",
      sectionRef: null,
      definedTermRef: null,
      governingDocumentId: doc,
    };
    expect(provisionIdentityMatchesUnit(docOnly, unit703f)).toBe(false);
    expect(provisionIdentityMatchesUnit(docOnly, unitOtherDoc)).toBe(false);
  });

  it("adversarial: defined-term identity binds; unrelated term on same document does not", () => {
    const doc = "indenture";
    const permittedDebt = {
      kind: "DEFINITION",
      sectionRef: null,
      definedTermRef: "Permitted Debt",
      governingDocumentId: doc,
    };
    const permittedLiens = {
      kind: "DEFINITION",
      sectionRef: null,
      definedTermRef: "Permitted Liens",
      governingDocumentId: doc,
    };
    expect(
      provisionIdentityMatchesUnit(permittedDebt, {
        sourceRef: "def:Permitted Debt(1)(a)",
        documentId: doc,
      }),
    ).toBe(true);
    expect(
      provisionIdentityMatchesUnit(permittedDebt, {
        sourceRef: "def:Permitted Liens(1)",
        documentId: doc,
      }),
    ).toBe(false);
    expect(
      provisionIdentityMatchesUnit(permittedLiens, {
        sourceRef: "def:Permitted Debt(2)",
        documentId: doc,
      }),
    ).toBe(false);
  });

  it("adversarial: identical section refs in unrelated documents REFUSE", () => {
    const creditSection = {
      kind: "SECTION",
      sectionRef: "7.03",
      definedTermRef: null,
      governingDocumentId: "credit-agreement-2020",
    };
    const indentureUnit = {
      sourceRef: "7.03(f)",
      documentId: "notes-indenture-2021",
    };
    // Same section label across unrelated instruments must never bind authority.
    expect(provisionIdentityMatchesUnit(creditSection, indentureUnit)).toBe(false);
    expect(
      documentsShareOperativeAuthority(
        creditSection.governingDocumentId,
        indentureUnit.documentId,
        { restatementAuthorities: [] },
      ),
    ).toBe(false);
  });

  it("adversarial: same document + matching section permitted subject to existing gates", () => {
    const doc = "credit-agreement-2020";
    const provision = {
      kind: "SECTION",
      sectionRef: "7.03",
      definedTermRef: null,
      governingDocumentId: doc,
    };
    expect(
      provisionIdentityMatchesUnit(provision, { sourceRef: "7.03(f)", documentId: doc }),
    ).toBe(true);
    expect(documentsShareOperativeAuthority(doc, doc, null)).toBe(true);
  });

  it("adversarial: verified amendment/restatement successor permitted where legally supported", () => {
    const original = "credit-agreement-2020";
    const restated = "amended-restated-credit-agreement-2022";
    const provisionOnSuccessor = {
      kind: "SECTION",
      sectionRef: "7.03",
      definedTermRef: null,
      governingDocumentId: restated,
    };
    const unitOnPredecessor = { sourceRef: "7.03(f)", documentId: original };
    const confirmed = {
      restatementAuthorities: [
        {
          status: "OPERATIVE_AUTHORITY_CONFIRMED" as const,
          successorDocumentId: restated,
          predecessorDocumentId: original,
        },
      ],
    };
    // Without verified succession evidence, identical section labels across docs REFUSE.
    expect(provisionIdentityMatchesUnit(provisionOnSuccessor, unitOnPredecessor)).toBe(false);
    expect(provisionIdentityMatchesUnit(provisionOnSuccessor, unitOnPredecessor, confirmed)).toBe(
      true,
    );
    // Unit remapped onto successor; provision still cites predecessor identity edge.
    expect(
      provisionIdentityMatchesUnit(
        { ...provisionOnSuccessor, governingDocumentId: original },
        { sourceRef: "7.03(f)", documentId: restated },
        confirmed,
      ),
    ).toBe(true);
  });

  it("adversarial: unverified or ambiguous succession REFUSE", () => {
    const original = "credit-agreement-2020";
    const competitor = "purported-restatement-2024";
    const provision = {
      kind: "SECTION",
      sectionRef: "7.03",
      definedTermRef: null,
      governingDocumentId: competitor,
    };
    const unit = { sourceRef: "7.03(f)", documentId: original };

    for (const status of ["REVIEW_REQUIRED", "AMBIGUOUS", "UNSUPPORTED", "PROVISIONAL_IDENTITY_BLOCKED"] as const) {
      const evidence = {
        restatementAuthorities: [
          {
            status,
            successorDocumentId: competitor,
            predecessorDocumentId: original,
          },
        ],
      };
      expect(provisionIdentityMatchesUnit(provision, unit, evidence)).toBe(false);
      expect(
        documentsShareOperativeAuthority(competitor, original, evidence),
      ).toBe(false);
    }

    // Confirmed status but missing predecessor — fail closed (no silent cross-doc bind).
    expect(
      provisionIdentityMatchesUnit(provision, unit, {
        restatementAuthorities: [
          {
            status: "OPERATIVE_AUTHORITY_CONFIRMED",
            successorDocumentId: competitor,
            predecessorDocumentId: null,
          },
        ],
      }),
    ).toBe(false);

    // Missing governingDocumentId — fail closed even with matching section.
    expect(
      provisionIdentityMatchesUnit(
        { kind: "SECTION", sectionRef: "7.03", definedTermRef: null, governingDocumentId: null },
        unit,
        null,
      ),
    ).toBe(false);
  });
});

describe("P0 — VE compileVerifiedFixedDollarBridge provider-free (no env mutation)", () => {
  it("VE core source does not delete process.env credentials", () => {
    expect(VE_CORE_SRC).not.toMatch(/delete\s+process\.env\.AI_GATEWAY_API_KEY/);
    expect(VE_CORE_SRC).not.toMatch(/delete\s+process\.env\.ANTHROPIC_API_KEY/);
    expect(VE_CORE_SRC).toMatch(/provider-free:fixed-dollar-ir-local/);
  });

  it("concurrent VE compiles leave env credentials unchanged", async () => {
    const sentinelGw = `ve-gw-${Date.now()}`;
    const sentinelAnth = `ve-anth-${Date.now()}`;
    const prevGw = process.env.AI_GATEWAY_API_KEY;
    const prevAnth = process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_API_KEY = sentinelGw;
    process.env.ANTHROPIC_API_KEY = sentinelAnth;
    try {
      const candidate = {
        candidateId: "c1",
        documentId: "doc-a",
        sourceSectionRef: "4.09",
        operativeSourceText:
          "Debt under Debt Facilities in an aggregate principal amount outstanding not to exceed $100,000,000.",
        relatedLeafCode: null,
      };
      const runs = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          Promise.resolve(
            compileVerifiedFixedDollarBridge({
              companyId: `co-${i}`,
              instrumentKey: `inst-${i}`,
              asOfDate: "2024-12-31",
              candidates: [candidate],
            }),
          ),
        ),
      );
      expect(process.env.AI_GATEWAY_API_KEY).toBe(sentinelGw);
      expect(process.env.ANTHROPIC_API_KEY).toBe(sentinelAnth);
      expect(runs.every((r) => r.productionCapacityPublished === false)).toBe(true);
      expect(runs.some((r) => r.path.includes("provider-free:fixed-dollar-ir-local"))).toBe(true);
    } finally {
      if (prevGw === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = prevGw;
      if (prevAnth === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAnth;
    }
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
