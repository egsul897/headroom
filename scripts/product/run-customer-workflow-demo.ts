/**
 * End-to-end customer workflow demonstration:
 * upload/analyze → counsel accept → Permission compile → financials → exercise → dashboard.
 *
 *   npx tsx scripts/product/run-customer-workflow-demo.ts
 *
 * Uses a disposable EVALUATION company (demo-customer-workflow). Cleans prior run of same id.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { recordReviewerDecision } from "../../lib/product/customer-intelligence/reviewer-approvals";
import { createManualFinancialState } from "../../lib/onboarding/financial";
import { loadCapacityReadiness } from "../../lib/product/customer-intelligence/capacity-readiness";
import { loadDebtIntelligenceDashboard } from "../../lib/product/customer-intelligence/debt-intelligence";
import { loadRulebookReadiness } from "../../lib/product/customer-intelligence/rulebook-readiness";
import {
  buildContextFromSummary,
  executeExerciseOnSource,
  getExercise,
  runCovenantIntelligenceLoop,
} from "../../lib/product/covenant-intelligence-loop";

const COMPANY_ID = "demo-customer-workflow";
const DOC_ID = "demo-customer-workflow-ca";

async function main() {
  const fixture = path.join(
    process.cwd(),
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  );
  const text = readFileSync(fixture, "utf8");
  const hash = createHash("sha256").update(text).digest("hex");
  const sourceId = `customer:${COMPANY_ID}:${DOC_ID}:${hash.slice(0, 16)}`;

  // Reset prior demo company (isolated EVALUATION tenant).
  // KnowledgeSource.companyId is SetNull on company delete — remove by sourceId prefix too.
  await prisma.knowledgeSource.deleteMany({
    where: { OR: [{ companyId: COMPANY_ID }, { sourceId: { startsWith: `customer:${COMPANY_ID}:` } }] },
  });
  await prisma.permission.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({
    data: {
      id: COMPANY_ID,
      name: "Demo Customer Workflow (CONMED Article VII)",
      ticker: "DEMO-CWF",
      cik: "0000816956",
      currency: "USD",
      tenantKind: "EVALUATION",
      onboardingStatus: "ACTIVE_WITH_LIMITATIONS",
    },
  });

  await prisma.document.create({
    data: {
      id: DOC_ID,
      companyId: COMPANY_ID,
      name: "CONMED Credit Agreement — Article VII (demo)",
      type: "CREDIT_AGREEMENT",
      effectiveFrom: new Date("2025-01-01"),
      source: "user-upload",
    },
  });

  const structural = extractStructure(sourceId, text);
  const definitions = discoverDefinitions(sourceId, text, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, text);
  const candidates = discoverCovenantCandidates(sourceId, text, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "CONMED Eighth A&R Credit Agreement (Article VII)",
    issuerName: "CONMED Corporation",
    issuerCik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });

  await prisma.knowledgeSource.create({
    data: {
      sourceId,
      companyId: COMPANY_ID,
      documentId: DOC_ID,
      issuerCik: "0000816956",
      issuerTicker: "CNMD",
      issuerName: "CONMED Corporation",
      accessionNumber: `customer-${DOC_ID}`,
      exhibitFilename: "article-vii.txt",
      sourceUrl: `fixture://customer/${COMPANY_ID}/${DOC_ID}`,
      filingDate: new Date("2025-01-15"),
      formType: "8-K",
      documentTitle: summary.governingAgreement,
      documentClass: "CREDIT_AGREEMENT",
      originalBytesHash: hash,
      normalizedTextHash: hash,
      acquisitionTimestamp: new Date(),
      parserVersion: "customer-workflow-demo.v1",
      extractionStatus: "CANDIDATES_DISCOVERED",
      representationLevel: "DISCOVERED_CANDIDATE",
      provenance: "customer-upload-demo",
      storageRef: `local://demo/${DOC_ID}`,
      metadata: JSON.parse(JSON.stringify({ covenantSummary: summary })),
    },
  });

  const debtItem =
    summary.items.find(
      (i) =>
        i.category === "DEBT_INCURRENCE" &&
        (i.materialBasketsThresholds ?? []).some((b) => /\$|greater/i.test(b)),
    ) ?? summary.items.find((i) => i.category === "DEBT_INCURRENCE");
  const lienItem =
    summary.items.find((i) => i.category === "LIENS_SECURED_DEBT") ??
    summary.items.find((i) => /lien/i.test(i.heading));

  if (!debtItem) throw new Error("No debt item in CONMED summary");

  const acceptDebt = await recordReviewerDecision({
    companyId: COMPANY_ID,
    sourceId,
    sectionRef: debtItem.sectionRef,
    category: debtItem.category,
    decision: "ACCEPTED",
    note: "Demo counsel acceptance — compile executable debt basket",
  });
  const acceptLien = lienItem
    ? await recordReviewerDecision({
        companyId: COMPANY_ID,
        sourceId,
        sectionRef: lienItem.sectionRef,
        category: lienItem.category,
        decision: "EDITED",
        editedPlainEnglish: `${lienItem.plainEnglish} [Counsel clarifies: securing newly incurred debt requires an independent Permitted Lien basket.]`,
        note: "Demo counsel edit on lien regime",
      })
    : null;

  const rpItem =
    summary.items.find(
      (i) =>
        /RESTRICTED|INVESTMENT/i.test(i.category) &&
        (i.materialBasketsThresholds ?? []).some((b) => /\$/.test(b)),
    ) ?? summary.items.find((i) => /restricted payment|investment/i.test(`${i.heading} ${i.category}`));
  const acceptRp = rpItem
    ? await recordReviewerDecision({
        companyId: COMPANY_ID,
        sourceId,
        sectionRef: rpItem.sectionRef,
        category: rpItem.category,
        decision: "ACCEPTED",
        note: "Demo counsel acceptance — compile RP/investment basket into executable Permission + rpWaterfall",
      })
    : null;

  await createManualFinancialState({
    companyId: COMPANY_ID,
    asOfDate: new Date("2026-06-30"),
    ebitda: 420,
    restrictedGroupEbitda: 420,
    ebitdaAdjustmentsAmount: 15,
    contractualEbitdaTerm: "Consolidated EBITDA",
    cash: 80,
    totalDebtPrincipal: 1100,
    securedDebtPrincipal: 750,
    firstLienDebtPrincipal: 700,
    cumulativeNetIncomeSinceIssue: 200,
    equityProceedsSinceIssue: 50,
    interestExpense: 55,
    assumedNewDebtRatePct: 6.5,
    fixedCharges: 70,
    totalAssets: 2800,
    testingPeriod: "LTM ended 2026-06-30",
    proFormaAdjustments: "Include run-rate synergies permitted under Consolidated EBITDA definition; no invented addbacks beyond counsel-confirmed list.",
  });

  const exercise = getExercise("debt.secured.100")!;
  const ctx = buildContextFromSummary({
    sourceId,
    summary,
    hasFinancialSnapshot: true,
    financialInputsPresent: ["totalDebt", "securedDebt", "ebitda", "cash"],
  });
  const exerciseResult = executeExerciseOnSource({
    exercise,
    ctx,
    runId: "customer-workflow-demo",
  });

  const loop = await runCovenantIntelligenceLoop({
    companyId: COMPANY_ID,
    verticalSlice: true,
    publishCompanyId: COMPANY_ID,
    reexerciseOnImprove: true,
  });

  const { getCompanyDashboard } = await import("../../lib/dashboard-service");
  const [capacity, rulebook, dashboard, engineDash] = await Promise.all([
    loadCapacityReadiness(COMPANY_ID),
    loadRulebookReadiness(COMPANY_ID),
    loadDebtIntelligenceDashboard(COMPANY_ID),
    getCompanyDashboard(COMPANY_ID).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
  ]);

  const permissions = await prisma.permission.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      code: true,
      grantType: true,
      formulaType: true,
      thresholdValue: true,
      modelingStatus: true,
      sectionRef: true,
    },
  });

  const report = {
    companyId: COMPANY_ID,
    sourceId,
    documentId: DOC_ID,
    summaryItems: summary.items.length,
    counsel: {
      debt: { sectionRef: debtItem.sectionRef, compile: acceptDebt.compileResults },
      lien: lienItem
        ? { sectionRef: lienItem.sectionRef, compile: acceptLien?.compileResults }
        : null,
      rp: rpItem ? { sectionRef: rpItem.sectionRef, compile: acceptRp?.compileResults } : null,
    },
    permissions,
    capacity,
    rulebookStage: rulebook.stage,
    rulebookExecutable: rulebook.executablePermissions,
    exercise: {
      exerciseId: exerciseResult.exerciseId,
      outcome: exerciseResult.outcome,
      citations: exerciseResult.citations.length,
      missingInputs: exerciseResult.missingInputs,
      conditionalFormula: exerciseResult.conditionalFormula?.slice(0, 300),
      gaps: exerciseResult.gaps.map((g) => g.category),
    },
    loopPublish: loop.publishSummary,
    dashboard: {
      headline: dashboard.headline,
      documentCount: dashboard.documentCount,
      acceptedCount: dashboard.acceptedCount,
      capacityStatus: dashboard.capacityStatus,
      basketsWithRemaining: dashboard.baskets.filter((b) => b.remaining != null).length,
      sampleBaskets: dashboard.baskets.slice(0, 6).map((b) => ({
        sectionRef: b.sectionRef,
        status: b.status,
        remaining: b.remaining,
        reviewDecision: b.reviewDecision,
        capacity: b.contractualCapacity,
      })),
      proForma: dashboard.proForma,
      transactions: dashboard.transactions.slice(0, 4).map((t) => ({
        scenario: t.scenario,
        status: t.status,
        summary: t.summary.slice(0, 200),
      })),
    },
    engineCapacity:
      "error" in engineDash
        ? engineDash
        : {
            securedRemaining: engineDash.capacity.secured.remainingCapacity,
            unsecuredRemaining: engineDash.capacity.unsecured.remainingCapacity,
            permissionsTotal: engineDash.legalReview.permissionsTotal,
          },
    documentCapacityFormulas: (
      await prisma.document.findUnique({
        where: { id: DOC_ID },
        select: { capacityFormulas: true },
      })
    )?.capacityFormulas,
  };

  const outDir = path.join("docs", "product", "customer-workflow");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "demo-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
