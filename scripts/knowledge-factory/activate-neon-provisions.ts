/**
 * Read-only scan of Neon PUBLIC_SEC_EDGAR v2 summaries → activatable
 * formula/threshold candidates. Never writes Permission / CovenantProvision
 * capacity rows. Never certifies.
 *
 *   npx tsx scripts/knowledge-factory/activate-neon-provisions.ts
 *   npx tsx scripts/knowledge-factory/activate-neon-provisions.ts --limit=200
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";
import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "../../lib/covenant-engine";

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 1));
  return Number.isFinite(n) ? n : fallback;
}

/** Clearly labeled synthetic finance — NEVER claim as company capacity. */
const SYNTHETIC_FINANCE_LABEL = "SYNTHETIC_LABELED_FINANCIAL_INPUTS_NOT_COMPANY_CAPACITY";
const SYNTHETIC_FIN: FinancialSnapshotInput = {
  ebitda: 500,
  cash: 50,
  interestExpense: 40,
  cumulativeNetIncome: 100,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 7,
  totalDebt: 800,
  securedDebt: 400,
  totalAssets: 2000,
};

async function main() {
  const limit = argNum("--limit", 400);
  const outDir = path.resolve("docs/intelligence-factory/cycle-3");
  mkdirSync(outDir, { recursive: true });

  const rows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: { sourceId: true, metadata: true, documentTitle: true, issuerTicker: true, documentClass: true },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  const candidates = [];
  let scannedItems = 0;
  let withSummary = 0;

  for (const row of rows) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary?.items?.length) continue;
    withSummary += 1;
    for (const item of summary.items) {
      scannedItems += 1;
      const activated = activateSummaryItem({ sourceId: row.sourceId, item });
      if (activated.readiness === "NOT_ACTIVATABLE") continue;
      candidates.push({
        ...activated,
        issuerTicker: row.issuerTicker,
        documentClass: row.documentClass,
        documentTitle: row.documentTitle,
      });
    }
  }

  const executable = candidates.filter((c) => c.readiness === "EXECUTABLE_FORMULA_CANDIDATE" && c.allChecksPassed);
  const byFormula: Record<string, number> = {};
  for (const c of executable) {
    byFormula[c.formulaType ?? "null"] = (byFormula[c.formulaType ?? "null"] ?? 0) + 1;
  }

  // Demo: evaluate first few greater-of EBITDA candidates with SYNTHETIC finance
  const demos = [];
  for (const c of executable.filter((x) => x.formulaType === "GREATER_OF_FLAT_OR_PCT_EBITDA").slice(0, 5)) {
    const provision: CovenantProvisionInput = {
      id: `demo:${c.sourceId}:${c.sectionRef}`,
      documentId: `demo-doc:${c.sourceId}`,
      code: `activation_demo_${demos.length}`,
      basketName: c.heading.slice(0, 80),
      sectionRef: c.sectionRef,
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: c.thresholdValue!,
      params: { pctEbitda: Number((c.params as { pctEbitda?: number })?.pctEbitda ?? 0) },
    };
    const evaluated = evaluateProvision(provision, SYNTHETIC_FIN, computeLeverageMetrics(SYNTHETIC_FIN));
    demos.push({
      sourceId: c.sourceId,
      sectionRef: c.sectionRef,
      formulaType: c.formulaType,
      thresholdValue: c.thresholdValue,
      params: c.params,
      financialInputsLabel: SYNTHETIC_FINANCE_LABEL,
      financialInputs: SYNTHETIC_FIN,
      evaluationStatus: evaluated.status,
      capacityMillions: evaluated.capacity ?? null,
      reason: evaluated.reason ?? null,
      note: "SYNTHETIC execution demo — not actual company capacity. Candidate remains NOT_CERTIFIED.",
    });
  }

  const report = {
    schemaVersion: "intelligence-factory.activation.v1",
    generatedAt: new Date().toISOString(),
    neonMutations: 0,
    paidInferenceCostUsd: 0,
    scannedSources: rows.length,
    sourcesWithSummary: withSummary,
    scannedProvisionItems: scannedItems,
    activatableCandidates: candidates.length,
    independentlyCheckedExecutable: executable.length,
    byFormulaType: byFormula,
    byReadiness: candidates.reduce(
      (acc, c) => {
        acc[c.readiness] = (acc[c.readiness] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    syntheticCapacityDemos: demos,
    sampleExecutable: executable.slice(0, 25),
    certification: "NONE — candidates are NOT_CERTIFIED; no Permission rows written",
  };

  writeFileSync(path.join(outDir, "activation-candidates.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(outDir, "executable-candidates.json"),
    JSON.stringify(
      {
        certificationStatus: "NOT_CERTIFIED",
        count: executable.length,
        candidates: executable,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        scannedSources: report.scannedSources,
        scannedProvisionItems: report.scannedProvisionItems,
        independentlyCheckedExecutable: report.independentlyCheckedExecutable,
        byFormulaType: report.byFormulaType,
        syntheticDemos: demos.length,
        wrote: path.join(outDir, "activation-candidates.json"),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
