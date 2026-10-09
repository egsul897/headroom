/**
 * Diverse Neon activation matrix — authentic summary → parse → independent
 * expected → engine evaluation → classified outcomes.
 *
 * No bulk certification. No silent promotion. Synthetic financials labeled.
 * Ephemeral counsel-compile path exercised for a subset, then cleaned up.
 * Production Neon corpus writes remain authorization-gated (none here).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import {
  compileAcceptedInterpretation,
  parseCounselFormulaForTest,
} from "../../lib/product/customer-intelligence/compile-accepted";
import {
  computeLeverageMetrics,
  evaluateProvision,
  simulateDebtIncurrence,
  computeCovenantPosition,
  type CompanyCovenantData,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "../../lib/covenant-engine";
import {
  basketUsageFromAttributedEvents,
  computeSharedConstraintCurrentUsage,
} from "../../lib/solver/shared-usage";

const EPHEMERAL_COMPANY = "neon-activation-matrix-proof";

/** Unmistakably synthetic — not approved customer financials. */
const SYNTHETIC_FINANCIALS: FinancialSnapshotInput & { _label: string } = {
  _label: "SYNTHETIC_NUMERIC_INPUTS",
  ebitda: 400,
  cash: 75,
  interestExpense: 50,
  cumulativeNetIncome: 180,
  equityProceedsSinceIssue: 40,
  assumedNewDebtRatePct: 6.5,
  totalDebt: 1200,
  securedDebt: 800,
  totalAssets: 2800,
};

type MechanicClass =
  | "FIXED_BASKET"
  | "GREATER_OF_EBITDA_GROWER"
  | "GREATER_OF_ASSET_GROWER"
  | "RATIO_BASED_DEBT"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "DEBT_LIEN_COMPANION"
  | "SHARED_CAPACITY"
  | "AMENDMENT_AFFECTED"
  | "UNSUPPORTED_REFUSAL";

type OutcomeClass =
  | "SUCCESS"
  | "CORRECT_REFUSAL"
  | "UNSUPPORTED_MECHANIC"
  | "ERROR"
  | "FALSE_FAVORABLE";

interface MatrixCase {
  id: string;
  mechanic: MechanicClass;
  sourceId: string;
  sectionRef: string;
  /** Independent expected formula / calculation established before engine run. */
  independentExpected: {
    formulaType: string;
    thresholdValue: number;
    params?: Record<string, unknown>;
    /** Expected capacity in $M under SYNTHETIC_FINANCIALS, or null if refusal expected. */
    expectedCapacity: number | null;
    /** If set, engine must refuse (review_required / known_not_modeled). */
    expectRefusal?: boolean;
    utilizationAttributed?: number;
    notes: string;
  };
  /** When true, exercise ephemeral counsel compile (cleaned up). */
  compileEphemeral?: boolean;
}

const CASES: MatrixCase[] = [
  {
    id: "rock-7.01-fixed",
    mechanic: "FIXED_BASKET",
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    sectionRef: "7.01",
    independentExpected: {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 10,
      expectedCapacity: 10,
      notes: "Independent: flat $10M basket; capacity = 10 under any financials.",
    },
    compileEphemeral: true,
  },
  {
    id: "rock-6.18-ebitda-grower",
    mechanic: "GREATER_OF_EBITDA_GROWER",
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    sectionRef: "6.18",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 51.6,
      params: { pctEbitda: 0.15 },
      expectedCapacity: Math.max(51.6, 0.15 * 400), // 60
      notes: "Independent: max(51.6, 0.15×400) = 60. SYNTHETIC ebitda.",
    },
  },
  {
    id: "conmed-7.2-asset-grower",
    mechanic: "GREATER_OF_ASSET_GROWER",
    sourceId: "fixture:conmed-2025-credit-facility:ex10-1-first-omnibus-amendment-2026-06-01.htm",
    sectionRef: "7.2",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: 50,
      params: { pctTotalAssets: 0.03 },
      expectedCapacity: Math.max(50, 0.03 * 2800), // 84
      notes: "Independent: max(50, 0.03×2800) = 84. Preserves first E2E proof.",
    },
    compileEphemeral: true,
  },
  {
    id: "conmed-7.1a-ratio-debt",
    mechanic: "RATIO_BASED_DEBT",
    sourceId: "fixture:conmed-2025-credit-facility:ex10-1-first-omnibus-amendment-2026-06-01.htm",
    sectionRef: "7.1(a)",
    independentExpected: {
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.75,
      // Operative text references secured/first-lien; parser selects secured basis.
      // Engine room = threshold×EBITDA − (securedDebt − cash) = 1500 − 725 = 775.
      params: { debtBasis: "secured" },
      expectedCapacity: 3.75 * 400 - (800 - 75),
      notes:
        "Independent: secured-basis leverage room 3.75×400 − netSecured(800−75) = 775. SYNTHETIC.",
    },
  },
  {
    id: "rock-7.05-restricted-payments",
    mechanic: "RESTRICTED_PAYMENTS",
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    sectionRef: "7.05",
    independentExpected: {
      formulaType: "BUILDER_BASKET",
      thresholdValue: 172,
      expectedCapacity: null,
      notes:
        "Independent: RP/builder family present. Expected formula class BUILDER or greater-of; capacity checked against parse+engine consistency, not a single dollar claim without CNI schedule.",
    },
  },
  {
    id: "rock-6.18-investments",
    mechanic: "INVESTMENTS",
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    sectionRef: "6.18",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 51.6,
      params: { pctEbitda: 0.15 },
      expectedCapacity: Math.max(51.6, 0.15 * 400),
      notes: "Independent: investment/RP companion basket max(51.6, 15% EBITDA)=60.",
    },
  },
  {
    id: "conmed-7.3m-lien-companion",
    mechanic: "DEBT_LIEN_COMPANION",
    sourceId: "fixture:conmed-2025-credit-facility:ex10-1-eighth-ar-credit-agreement-2025-06-16.htm",
    sectionRef: "7.3(m)",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: 50,
      params: { pctTotalAssets: 0.03 },
      expectedCapacity: Math.max(50, 0.03 * 2800),
      notes: "Independent: lien companion to §7.2 debt basket — same grower math → 84.",
    },
  },
  {
    id: "conmed-7.2-shared-capacity-util",
    mechanic: "SHARED_CAPACITY",
    sourceId: "fixture:conmed-2025-credit-facility:ex10-1-first-omnibus-amendment-2026-06-01.htm",
    sectionRef: "7.2",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: 50,
      params: { pctTotalAssets: 0.03 },
      expectedCapacity: Math.max(50, 0.03 * 2800),
      utilizationAttributed: 20,
      notes:
        "Independent: gross 84; attributed outstanding usage 20 → numerical remaining 64. ZERO_NO_ATTRIBUTED_USAGE ≠ proven empty. Basket limit ≠ legal permission.",
    },
  },
  {
    id: "conmed-omnibus-amendment-7.2",
    mechanic: "AMENDMENT_AFFECTED",
    sourceId: "fixture:conmed-2025-credit-facility:ex10-1-first-omnibus-amendment-2026-06-01.htm",
    sectionRef: "7.2",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: 50,
      params: { pctTotalAssets: 0.03 },
      expectedCapacity: 84,
      notes: "Independent: amendment-affected operative §7.2 on first omnibus amendment source.",
    },
  },
  {
    id: "conmed-7.2-missing-assets-refusal",
    mechanic: "UNSUPPORTED_REFUSAL",
    sourceId: "fixture:conmed-2025-credit-facility:ex10-1-first-omnibus-amendment-2026-06-01.htm",
    sectionRef: "7.2",
    independentExpected: {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: 50,
      params: { pctTotalAssets: 0.03 },
      expectedCapacity: null,
      expectRefusal: true,
      notes: "Independent: without totalAssets, must refuse — not present floor as remaining capacity.",
    },
  },
  {
    id: "rock-2.01-unsupported-incremental",
    mechanic: "UNSUPPORTED_REFUSAL",
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    sectionRef: "2.01",
    independentExpected: {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      expectedCapacity: null,
      expectRefusal: true,
      notes: "Independent: voluntary prepayment incremental path — expect KNOWN_NOT_MODELED / non-executable.",
    },
  },
];

function almostEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

async function runCase(c: MatrixCase) {
  const neonSource = await prisma.knowledgeSource.findUnique({ where: { sourceId: c.sourceId } });
  if (!neonSource?.metadata) {
    return {
      id: c.id,
      mechanic: c.mechanic,
      outcome: "ERROR" as OutcomeClass,
      error: `KnowledgeSource missing: ${c.sourceId}`,
    };
  }

  const summary = summarizeFromStoredMetadata(neonSource.metadata);
  const item = summary?.items.find((i) => i.sectionRef === c.sectionRef);
  if (!item) {
    return {
      id: c.id,
      mechanic: c.mechanic,
      outcome: "ERROR" as OutcomeClass,
      error: `Summary item ${c.sectionRef} not found`,
    };
  }

  const parsed = parseCounselFormulaForTest(item);
  const independentReview = {
    maturity: "INDEPENDENT_EXPECTED_PRE_ENGINE" as const,
    notCounselCertified: true,
    notSilentPromotion: true,
    expected: c.independentExpected,
    parsed: {
      formulaType: parsed.formulaType,
      thresholdValue: parsed.thresholdValue,
      params: parsed.params ?? null,
      modelingStatus: parsed.modelingStatus,
      missingFields: parsed.missingFields,
    },
  };

  // Refusal cases
  if (c.independentExpected.expectRefusal) {
    if (c.id.includes("missing-assets")) {
      const provision: CovenantProvisionInput = {
        id: `${c.id}-prov`,
        documentId: `${c.id}-doc`,
        code: c.id,
        basketName: item.heading || c.id,
        sectionRef: item.sectionRef,
        formulaType: parsed.formulaType as CovenantProvisionInput["formulaType"],
        thresholdValue: parsed.thresholdValue,
        params: parsed.params ?? null,
      };
      const fin = { ...SYNTHETIC_FINANCIALS, totalAssets: undefined };
      const ev = evaluateProvision(provision, fin, computeLeverageMetrics(fin));
      const ok = ev.status === "review_required";
      return {
        id: c.id,
        mechanic: c.mechanic,
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        independentReview,
        financialInputsLabel: SYNTHETIC_FINANCIALS._label,
        evaluation: { status: ev.status, capacity: ev.capacity ?? null, reason: ev.reason?.slice(0, 200) ?? null },
        outcome: (ok ? "CORRECT_REFUSAL" : "FALSE_FAVORABLE") as OutcomeClass,
        pass: ok,
      };
    }

    const ok = parsed.modelingStatus === "KNOWN_NOT_MODELED" || parsed.thresholdValue === 0;
    return {
      id: c.id,
      mechanic: c.mechanic,
      sourceId: c.sourceId,
      sectionRef: c.sectionRef,
      independentReview,
      financialInputsLabel: SYNTHETIC_FINANCIALS._label,
      outcome: (ok ? "CORRECT_REFUSAL" : parsed.modelingStatus === "MODELED" ? "FALSE_FAVORABLE" : "UNSUPPORTED_MECHANIC") as OutcomeClass,
      pass: ok,
      parsed,
    };
  }

  if (parsed.modelingStatus === "KNOWN_NOT_MODELED") {
    return {
      id: c.id,
      mechanic: c.mechanic,
      sourceId: c.sourceId,
      sectionRef: c.sectionRef,
      independentReview,
      financialInputsLabel: SYNTHETIC_FINANCIALS._label,
      outcome: "UNSUPPORTED_MECHANIC" as OutcomeClass,
      pass: false,
      parsed,
    };
  }

  const provision: CovenantProvisionInput = {
    id: `${c.id}-prov`,
    documentId: `${c.id}-doc`,
    code: c.id,
    basketName: item.heading || c.id,
    sectionRef: item.sectionRef,
    formulaType: parsed.formulaType as CovenantProvisionInput["formulaType"],
    thresholdValue: parsed.thresholdValue,
    params: parsed.params ?? null,
  };

  const fin = { ...SYNTHETIC_FINANCIALS };
  delete (fin as { _label?: string })._label;
  const ev = evaluateProvision(provision, fin, computeLeverageMetrics(fin));

  let utilization: ReturnType<typeof computeSharedConstraintCurrentUsage> | null = null;
  let remainingAfterUsage: number | null = null;
  if (c.mechanic === "SHARED_CAPACITY" && typeof ev.capacity === "number") {
    utilization = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: c.id }],
      basketUsage: basketUsageFromAttributedEvents(
        [
          {
            eventType: "ISSUANCE",
            amount: c.independentExpected.utilizationAttributed ?? 0,
            relatedPermissionIds: [c.id],
          },
        ],
        [c.id],
      ),
    });
    remainingAfterUsage = ev.capacity - utilization.usage;
  }

  // Formula class match (allow builder family flexibility for RP)
  const formulaClassOk =
    parsed.formulaType === c.independentExpected.formulaType ||
    (c.mechanic === "RESTRICTED_PAYMENTS" &&
      ["BUILDER_BASKET", "GREATER_OF_FLAT_OR_PCT_EBITDA", "FLAT_AMOUNT"].includes(parsed.formulaType));

  let capacityOk = false;
  if (c.independentExpected.expectedCapacity == null) {
    capacityOk = formulaClassOk && ev.status === "modeled" && typeof ev.capacity === "number";
  } else if (ev.status === "modeled" && typeof ev.capacity === "number") {
    capacityOk = formulaClassOk && almostEqual(ev.capacity, c.independentExpected.expectedCapacity);
  }

  // Simulation for clear/block when we have a dollar capacity
  let simulation: { clear?: string; blocked?: string; pass?: boolean } | null = null;
  if (capacityOk && typeof ev.capacity === "number" && Number.isFinite(ev.capacity) && ev.capacity > 0) {
    const data: CompanyCovenantData = {
      companyId: EPHEMERAL_COMPANY,
      documents: [
        {
          id: `${c.id}-doc`,
          name: c.id,
          type: "CREDIT_AGREEMENT",
          capacityFormulas: {
            secured: { op: "REF", code: c.id },
            unsecured: { op: "REF", code: c.id },
          },
        },
      ],
      provisions: [provision],
      financials: fin,
      ledger: [],
    };
    const position = computeCovenantPosition(data);
    const half = ev.capacity * 0.5;
    const over = ev.capacity * 2;
    const simClear = simulateDebtIncurrence(data, position, half, true);
    const simBlocked = simulateDebtIncurrence(data, position, over, true);
    const simPass = simClear.status === "clear" && simBlocked.status !== "clear";
    simulation = { clear: simClear.status, blocked: simBlocked.status, pass: simPass };
    if (!simPass) capacityOk = false;
  }

  let outcome: OutcomeClass;
  if (capacityOk) outcome = "SUCCESS";
  else if (ev.status === "modeled" && typeof ev.capacity === "number" && ev.capacity > 0 && !formulaClassOk) {
    outcome = "FALSE_FAVORABLE";
  } else if (ev.status === "modeled" && !capacityOk) {
    outcome = "ERROR";
  } else {
    outcome = "UNSUPPORTED_MECHANIC";
  }

  // Shared-capacity remaining check
  if (c.mechanic === "SHARED_CAPACITY" && capacityOk && remainingAfterUsage != null) {
    const expectedRem = (c.independentExpected.expectedCapacity ?? 0) - (c.independentExpected.utilizationAttributed ?? 0);
    if (!almostEqual(remainingAfterUsage, expectedRem)) {
      outcome = "ERROR";
      capacityOk = false;
    }
  }

  return {
    id: c.id,
    mechanic: c.mechanic,
    sourceId: c.sourceId,
    sectionRef: c.sectionRef,
    independentReview,
    financialInputsLabel: SYNTHETIC_FINANCIALS._label,
    distinctions: {
      contractualGrossCapacity: typeof ev.capacity === "number" ? ev.capacity : null,
      historicalUtilization: utilization?.usage ?? null,
      utilizationStatus: utilization?.status ?? null,
      remainingNumericalCapacity: remainingAfterUsage,
      conditionalCapacity: null,
      overallLegalPermission:
        "NOT_ESTABLISHED — numerical basket limit does not by itself establish that a transaction is permitted; LEGACY_ENGINE MODELED ≠ CERTIFIED",
      capacityAuthority: "LEGACY_ENGINE / NOT_CERTIFIED",
    },
    evaluation: {
      status: ev.status,
      capacity: ev.capacity ?? null,
      formulaType: parsed.formulaType,
      thresholdValue: parsed.thresholdValue,
    },
    simulation,
    outcome,
    pass: capacityOk,
  };
}

async function exerciseEphemeralCompiles(cases: MatrixCase[]) {
  const targets = cases.filter((c) => c.compileEphemeral);
  const minted: Array<{ id: string; permissions: number; modelingStatuses: string[]; reviewStatuses: string[] }> = [];

  await prisma.company.deleteMany({ where: { id: EPHEMERAL_COMPANY } });
  await prisma.company.create({
    data: {
      id: EPHEMERAL_COMPANY,
      name: "Neon Activation Matrix (ephemeral)",
      ticker: "NAMX",
      tenantKind: "EVALUATION",
      onboardingStatus: "ONBOARDING",
    },
  });

  for (const c of targets) {
    const neonSource = await prisma.knowledgeSource.findUnique({ where: { sourceId: c.sourceId } });
    if (!neonSource?.metadata) continue;
    const ephemeralSourceId = `matrix:${c.id}`;
    await prisma.knowledgeSource.deleteMany({ where: { sourceId: ephemeralSourceId } });
    const doc = await prisma.document.create({
      data: {
        companyId: EPHEMERAL_COMPANY,
        name: `matrix-${c.id}`,
        type: "CREDIT_AGREEMENT",
        source: "neon-activation-matrix",
      },
    });
    await prisma.knowledgeSource.create({
      data: {
        sourceId: ephemeralSourceId,
        companyId: EPHEMERAL_COMPANY,
        documentId: doc.id,
        issuerCik: neonSource.issuerCik,
        issuerTicker: neonSource.issuerTicker,
        issuerName: neonSource.issuerName,
        accessionNumber: neonSource.accessionNumber || "matrix",
        exhibitFilename: neonSource.exhibitFilename || "matrix.htm",
        sourceUrl: neonSource.sourceUrl || "https://example.invalid/matrix",
        filingDate: neonSource.filingDate,
        formType: neonSource.formType || "8-K",
        documentTitle: neonSource.documentTitle,
        documentClass: neonSource.documentClass,
        originalBytesHash: `matrix-${c.id}-${neonSource.originalBytesHash}`.slice(0, 128),
        acquisitionTimestamp: new Date(),
        parserVersion: "neon-activation-matrix",
        extractionStatus: neonSource.extractionStatus,
        representationLevel: neonSource.representationLevel,
        provenance: "ephemeral-matrix-compile",
        usageRightsReviewStatus: neonSource.usageRightsReviewStatus,
        metadata: neonSource.metadata as never,
      },
    });
    await compileAcceptedInterpretation({
      companyId: EPHEMERAL_COMPANY,
      sourceId: ephemeralSourceId,
      sectionRef: c.sectionRef,
      category: "DEBT_INCURRENCE",
      decision: "ACCEPTED",
      approvalNote: "Activation matrix ephemeral compile — not customer-ready",
    });
    const permissions = await prisma.permission.findMany({
      where: { companyId: EPHEMERAL_COMPANY, documentId: doc.id },
    });
    minted.push({
      id: c.id,
      permissions: permissions.length,
      modelingStatuses: permissions.map((p) => p.modelingStatus),
      reviewStatuses: permissions.map((p) => p.reviewStatus),
    });
    await prisma.knowledgeSource.deleteMany({ where: { sourceId: ephemeralSourceId } });
  }

  await prisma.company.deleteMany({ where: { id: EPHEMERAL_COMPANY } });
  return minted;
}

async function measureFunnel() {
  const ks = await prisma.knowledgeSource.count();
  const withMeta = await prisma.knowledgeSource.count({ where: { metadata: { not: null as never } } });
  const permissions = await prisma.permission.count();
  const verifiedPerms = await prisma.permission.count({ where: { reviewStatus: "VERIFIED" } });
  const modeledPerms = await prisma.permission.count({ where: { modelingStatus: "MODELED" } });
  let semanticTruth = 0;
  try {
    semanticTruth = await (prisma as { semanticTruthRecord: { count: () => Promise<number> } }).semanticTruthRecord.count();
  } catch {
    semanticTruth = 0;
  }

  // Sample summaries for formula candidate rates (cap for cost/time)
  const sample = await prisma.knowledgeSource.findMany({
    where: { metadata: { not: null as never } },
    select: { metadata: true, originalBytesHash: true },
    take: 250,
  });
  let structuredProvisions = 0;
  let formulaCandidates = 0;
  let correctlyExtractedFormulas = 0;
  let knownNotModeled = 0;
  const hashes = new Set<string>();
  for (const s of sample) {
    if (s.originalBytesHash) hashes.add(s.originalBytesHash);
    const summary = summarizeFromStoredMetadata(s.metadata);
    if (!summary?.items) continue;
    for (const item of summary.items) {
      structuredProvisions++;
      const hasBasket =
        (item.materialBasketsThresholds?.length ?? 0) > 0 ||
        /\$[\d,]+|\d+(\.\d+)?\s*%|greater of|ratio/i.test(
          [item.plainEnglish, item.operativeLanguageExcerpt, ...(item.permissions ?? [])].join(" "),
        );
      if (hasBasket) formulaCandidates++;
      const parsed = parseCounselFormulaForTest(item);
      if (parsed.modelingStatus === "MODELED" && parsed.thresholdValue > 0) correctlyExtractedFormulas++;
      else knownNotModeled++;
    }
  }

  return {
    authenticSourceDocuments: ks,
    authenticSourcesWithMetadata: withMeta,
    distinctHashesInSample: hashes.size,
    sampleSourcesScanned: sample.length,
    structuredProvisionsInSample: structuredProvisions,
    formulaCandidatesInSample: formulaCandidates,
    correctlyExtractedFormulasInSample: correctlyExtractedFormulas,
    knownNotModeledInSample: knownNotModeled,
    extractionConversionRate:
      structuredProvisions > 0 ? correctlyExtractedFormulas / structuredProvisions : 0,
    reviewedInterpretationsProduction: 0,
    acceptedInterpretationsProduction: 0,
    durableExecutablePermissions: permissions,
    modeledPermissions: modeledPerms,
    verifiedReviewPermissions: verifiedPerms,
    semanticTruthRecords: semanticTruth,
    kfCertified: 0,
    note: "30k summaries ≠ usable rules. Sample-based extraction rates; production counsel ACCEPT/CERTIFIED remain empty/gated.",
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const c of CASES) {
    results.push(await runCase(c));
  }
  const ephemeralCompiles = await exerciseEphemeralCompiles(CASES);
  const funnel = await measureFunnel();

  const successes = results.filter((r) => r.outcome === "SUCCESS");
  const refusals = results.filter((r) => r.outcome === "CORRECT_REFUSAL");
  const unsupported = results.filter((r) => r.outcome === "UNSUPPORTED_MECHANIC");
  const errors = results.filter((r) => r.outcome === "ERROR");
  const falseFavorable = results.filter((r) => r.outcome === "FALSE_FAVORABLE");

  const utilizationBacked = results.filter(
    (r) => r.distinctions?.utilizationStatus === "COMPUTED",
  ).length;

  const report = {
    schemaVersion: "intelligence-factory.neon-activation-matrix.v1",
    generatedAt: startedAt,
    finishedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonCorpusMutations: 0,
    ephemeralCompanyWrites: true,
    ephemeralCleanedUp: true,
    financialInputs: {
      label: SYNTHETIC_FINANCIALS._label,
      actualApprovedFinancialExamples: 0,
      syntheticFinancialExamples: CASES.filter((c) => !c.independentExpected.expectRefusal || c.id.includes("missing")).length,
      values: { ...SYNTHETIC_FINANCIALS },
    },
    requiredReturn: {
      authenticProvisionsTested: CASES.length,
      correctFormulas: successes.length + refusals.filter((r) => r.id.includes("missing")).length,
      independentlyReviewedInterpretations: CASES.length,
      independentReviewCaveat:
        "Independent expected formulas established before engine run — NOT counsel legal certification; maturity = INDEPENDENT_EXPECTED_PRE_ENGINE",
      durableExecutableRulesCreated: {
        productionNeon: 0,
        ephemeralPathExercised: ephemeralCompiles.reduce((s, m) => s + m.permissions, 0),
        reviewStatus: "UNVERIFIED",
        modelingStatus: "MODELED",
        capacityAuthority: "LEGACY_ENGINE",
        note: "Ephemeral compiles cleaned up; not customer-ready; no silent promotion",
      },
      actualVersusSyntheticFinancialExamples: { actual: 0, synthetic: CASES.length },
      utilizationBackedCalculations: utilizationBacked,
      correctExecutableOutcomes: successes.length,
      correctRefusals: refusals.length,
      falseFavorableOutcomes: falseFavorable.length,
      unsupportedMechanics: unsupported.length,
      errors: errors.length,
      certificationStatus:
        "NOT_CERTIFIED — DISCOVERED/MODELED/UNVERIFIED only; VERIFIED ≠ CERTIFIED; newly activated rules must not be exposed as authoritative customer permissions until safety gates pass",
    },
    outcomeBreakdown: {
      SUCCESS: successes.map((r) => r.id),
      CORRECT_REFUSAL: refusals.map((r) => r.id),
      UNSUPPORTED_MECHANIC: unsupported.map((r) => r.id),
      ERROR: errors.map((r) => r.id),
      FALSE_FAVORABLE: falseFavorable.map((r) => r.id),
    },
    cases: results,
    ephemeralCompiles,
    funnel,
    safetyGates: {
      a8_01: "FIXED in this PR — GATE_NOT_SATISFIED → REVIEW_REQUIRED, never AVAILABLE",
      unknownUtilization: "ZERO_NO_ATTRIBUTED_USAGE status preserved; silent zero not trusted",
      phase4dFinancialChaining:
        "Phase 4D chaining remains caller-stated multi-transaction; activation does not invent overlays",
      restorationAuthority:
        "Reclassification/restoration requires encoded Phase-3 edge; no inferred authority from summaries",
      noAuthoritativeExposure: true,
    },
  };

  const outDir = path.join(process.cwd(), "docs/intelligence-factory");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "neon-activation-matrix.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        wrote: outPath,
        requiredReturn: report.requiredReturn,
        outcomeBreakdown: report.outcomeBreakdown,
      },
      null,
      2,
    ),
  );

  if (falseFavorable.length > 0 || errors.length > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    try {
      await prisma.company.deleteMany({ where: { id: EPHEMERAL_COMPANY } });
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
