/**
 * End-to-end proof: authentic Neon KnowledgeSource summary → counsel formula
 * parse → executable capacity → transaction simulation → correct refusal.
 *
 * Controlled ephemeral company writes only (cleaned up). No bulk certification.
 * No paid inference. Synthetic financial inputs are explicitly labeled.
 */
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import {
  compileAcceptedInterpretation,
  parseCounselFormulaForTest,
} from "../../lib/product/customer-intelligence/compile-accepted";
import {
  computeCovenantPosition,
  computeLeverageMetrics,
  evaluateProvision,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "../../lib/covenant-engine";
import {
  basketUsageFromAttributedEvents,
  computeSharedConstraintCurrentUsage,
} from "../../lib/solver/shared-usage";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EPHEMERAL_COMPANY = "neon-activation-e2e-proof";
const SOURCE_ID =
  "fixture:conmed-2025-credit-facility:ex10-1-first-omnibus-amendment-2026-06-01.htm";
const SECTION_REF = "7.2";

const SYNTHETIC_FINANCIALS: FinancialSnapshotInput = {
  ebitda: 420,
  cash: 80,
  interestExpense: 55,
  cumulativeNetIncome: 200,
  equityProceedsSinceIssue: 50,
  assumedNewDebtRatePct: 6.5,
  totalDebt: 1100,
  securedDebt: 750,
  totalAssets: 2800,
};

async function main() {
  const startedAt = new Date().toISOString();
  const neonSource = await prisma.knowledgeSource.findUnique({
    where: { sourceId: SOURCE_ID },
  });
  if (!neonSource?.metadata) {
    throw new Error(`Neon KnowledgeSource missing: ${SOURCE_ID}`);
  }

  const summary = summarizeFromStoredMetadata(neonSource.metadata);
  const item = summary?.items.find((i) => i.sectionRef === SECTION_REF);
  if (!item) throw new Error(`Summary item ${SECTION_REF} not found on Neon source`);

  const parsed = parseCounselFormulaForTest(item);
  if (parsed.modelingStatus !== "MODELED") {
    throw new Error(`Expected MODELED parse; got ${parsed.modelingStatus}`);
  }

  // --- In-memory capacity from Neon evidence (no company write) ---
  const provision: CovenantProvisionInput = {
    id: "neon-proof-provision",
    documentId: "neon-proof-doc",
    code: "conmed_7_2_general",
    basketName: item.heading || "CONMED §7.2",
    sectionRef: item.sectionRef,
    formulaType: parsed.formulaType as CovenantProvisionInput["formulaType"],
    thresholdValue: parsed.thresholdValue,
    params: parsed.params ?? null,
  };

  const withAssets = evaluateProvision(
    provision,
    SYNTHETIC_FINANCIALS,
    computeLeverageMetrics(SYNTHETIC_FINANCIALS),
  );
  const withoutAssets = evaluateProvision(
    provision,
    { ...SYNTHETIC_FINANCIALS, totalAssets: undefined },
    computeLeverageMetrics({ ...SYNTHETIC_FINANCIALS, totalAssets: undefined }),
  );

  const expectedCapacity = Math.max(50, 0.03 * 2800); // 84 — independent arithmetic
  const capacityOk =
    withAssets.status === "modeled" &&
    typeof withAssets.capacity === "number" &&
    Math.abs(withAssets.capacity - expectedCapacity) < 1e-9;
  const refusalOk = withoutAssets.status === "review_required";

  // CompanyCovenantData for simulation
  const data: CompanyCovenantData = {
    companyId: EPHEMERAL_COMPANY,
    documents: [
      {
        id: "neon-proof-doc",
        name: "CONMED Credit Agreement (Neon summary activation)",
        type: "CREDIT_AGREEMENT",
        capacityFormulas: {
          secured: { op: "REF", code: "conmed_7_2_general" },
          unsecured: { op: "REF", code: "conmed_7_2_general" },
        },
      },
    ],
    provisions: [provision],
    financials: SYNTHETIC_FINANCIALS,
    ledger: [],
  };
  const position = computeCovenantPosition(data);
  const simClear = simulateDebtIncurrence(data, position, 50, true);
  const simBlocked = simulateDebtIncurrence(data, position, 200, true);

  // Utilization attribution (not silent zero)
  const usageAttributed = computeSharedConstraintCurrentUsage({
    aggregationRule: "NAMED_MEMBER_CLAUSES",
    measurementBasis: "CURRENTLY_OUTSTANDING",
    members: [{ permissionId: "conmed_7_2_general" }],
    basketUsage: basketUsageFromAttributedEvents(
      [
        {
          eventType: "ISSUANCE",
          amount: 20,
          relatedPermissionIds: ["conmed_7_2_general"],
        },
      ],
      ["conmed_7_2_general"],
    ),
  });
  const usageUnaatributed = computeSharedConstraintCurrentUsage({
    aggregationRule: "NAMED_MEMBER_CLAUSES",
    measurementBasis: "CURRENTLY_OUTSTANDING",
    members: [{ permissionId: "conmed_7_2_general" }],
    basketUsage: [],
  });

  // --- Ephemeral compile → Permission (controlled Neon write + cleanup) ---
  const ephemeralSourceId = `e2e:${SOURCE_ID}`;
  await prisma.knowledgeSource.deleteMany({ where: { sourceId: ephemeralSourceId } });
  await prisma.company.deleteMany({ where: { id: EPHEMERAL_COMPANY } });
  await prisma.company.create({
    data: {
      id: EPHEMERAL_COMPANY,
      name: "Neon Activation E2E Proof (ephemeral)",
      ticker: "NAE2E",
      tenantKind: "EVALUATION",
      onboardingStatus: "ONBOARDING",
    },
  });
  const doc = await prisma.document.create({
    data: {
      companyId: EPHEMERAL_COMPANY,
      name: "CONMED CA Article VII (activation proof)",
      type: "CREDIT_AGREEMENT",
      source: "neon-activation-e2e-proof",
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
      accessionNumber: neonSource.accessionNumber || "e2e-activation",
      exhibitFilename: neonSource.exhibitFilename || "e2e.htm",
      sourceUrl: neonSource.sourceUrl || "https://example.invalid/e2e",
      filingDate: neonSource.filingDate,
      formType: neonSource.formType || "8-K",
      documentTitle: neonSource.documentTitle,
      documentClass: neonSource.documentClass,
      originalBytesHash: `e2e-${neonSource.originalBytesHash}`,
      acquisitionTimestamp: new Date(),
      parserVersion: "e2e-activation-proof",
      extractionStatus: neonSource.extractionStatus,
      representationLevel: neonSource.representationLevel,
      provenance: "e2e-copy-of-neon-metadata-for-counsel-compile-proof",
      usageRightsReviewStatus: neonSource.usageRightsReviewStatus,
      metadata: neonSource.metadata as never,
    },
  });

  const compileResults = await compileAcceptedInterpretation({
    companyId: EPHEMERAL_COMPANY,
    sourceId: ephemeralSourceId,
    sectionRef: SECTION_REF,
    category: item.category,
    decision: "ACCEPTED",
    approvalNote: "E2E activation proof — ephemeral only",
  });

  const permissions = await prisma.permission.findMany({
    where: { companyId: EPHEMERAL_COMPANY },
  });
  const provisions = await prisma.covenantProvision.findMany({
    where: { companyId: EPHEMERAL_COMPANY },
  });

  await prisma.knowledgeSource.deleteMany({ where: { sourceId: ephemeralSourceId } });
  await prisma.company.deleteMany({ where: { id: EPHEMERAL_COMPANY } });

  const report = {
    schemaVersion: "intelligence-factory.neon-activation-e2e-proof.v1",
    generatedAt: startedAt,
    finishedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonCorpusMutations: 0,
    ephemeralCompanyWrites: true,
    ephemeralCleanedUp: true,
    source: {
      neonSourceId: SOURCE_ID,
      sectionRef: SECTION_REF,
      baskets: item.materialBasketsThresholds?.slice(0, 3) ?? [],
      category: item.category,
      representationLevel: neonSource.representationLevel,
      note: "Authentic Neon metadata; companyId was null on source registry row",
    },
    parsed,
    capacity: {
      inputsLabel: "SYNTHETIC_NUMERIC_INPUTS (totalAssets=2800, ebitda=420, …)",
      expectedCapacity,
      withAssets: {
        status: withAssets.status,
        capacity: withAssets.capacity ?? null,
        pass: capacityOk,
      },
      missingAssetsRefusal: {
        status: withoutAssets.status,
        reason: withoutAssets.reason?.slice(0, 240) ?? null,
        pass: refusalOk,
      },
    },
    simulation: {
      remainingCapacity: position.documents[0]?.securedCapacity ?? null,
      proposed50m: {
        status: simClear.status,
        amount: 50,
        pass: simClear.status === "clear",
      },
      proposed200m: {
        status: simBlocked.status,
        amount: 200,
        pass: simBlocked.status === "blocked" || simBlocked.status === "review_required",
      },
    },
    utilization: {
      attributed: usageAttributed,
      unattributedZeroIsNotProvenEmpty: usageUnaatributed,
      note: "ZERO_NO_ATTRIBUTED_USAGE must not be treated as verified empty utilization",
    },
    counselCompile: {
      compileResults,
      permissionsMinted: permissions.length,
      provisionsMinted: provisions.length,
      permissionCodes: permissions.map((p) => p.code),
      modelingStatuses: permissions.map((p) => p.modelingStatus),
      reviewStatuses: permissions.map((p) => p.reviewStatus),
      note: "Permissions remain UNVERIFIED — VERIFIED ≠ CERTIFIED; no bulk cert",
    },
    verdict: {
      neonEvidenceToExecutableCalculation: capacityOk,
      correctRefusalInsufficientFinancials: refusalOk,
      transactionSimulation: simClear.status === "clear" && simBlocked.status !== "clear",
      utilizationNotSilentlyTrustedWhenUnattributed:
        usageUnaatributed.status === "ZERO_NO_ATTRIBUTED_USAGE",
      counselCompileMintedModeledPermission: permissions.some((p) => p.modelingStatus === "MODELED"),
    },
  };

  const outDir = path.join(process.cwd(), "docs/intelligence-factory");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "neon-activation-e2e-proof.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ wrote: outPath, verdict: report.verdict }, null, 2));

  const failed = Object.values(report.verdict).some((v) => v !== true);
  if (failed) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    try {
      await prisma.knowledgeSource.deleteMany({ where: { sourceId: `e2e:${SOURCE_ID}` } });
      await prisma.company.deleteMany({ where: { id: EPHEMERAL_COMPANY } });
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
