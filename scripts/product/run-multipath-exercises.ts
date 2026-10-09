/**
 * Sophisticated multi-path exercises A–F against demo-customer-workflow
 * (or --company-id). Persists a depth-scored report.
 *
 *   npx tsx scripts/product/run-multipath-exercises.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { loadDebtIntelligenceDashboard } from "../../lib/product/customer-intelligence/debt-intelligence";
import { loadCovenantReviewWorkspace } from "../../lib/product/customer-intelligence/covenant-review";
import { listReviewerApprovals } from "../../lib/product/customer-intelligence/reviewer-approvals";
import {
  analyzeMultiPathTransaction,
  type MultiPathAnalysis,
} from "../../lib/product/customer-intelligence/multi-path-analysis";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function depthScore(mp: MultiPathAnalysis) {
  return {
    pathways: mp.paths.length,
    executable: mp.paths.filter((p) => p.status === "EXECUTABLE").length,
    insufficient: mp.paths.filter((p) => p.status === "INSUFFICIENT").length,
    aiProposed: mp.paths.filter((p) => p.status === "AI_PROPOSED").length,
    conditional: mp.paths.filter((p) => p.status === "CONDITIONAL").length,
    citations: mp.citations.length,
    families: [...new Set(mp.paths.map((p) => p.family))],
    definitionsReferenced: mp.paths.reduce((n, p) => n + (p.formulaHint ? 1 : 0), 0),
    stackingAssumed: mp.combination.stackingAssumed,
  };
}

async function main() {
  const companyId = arg("--company-id") ?? "demo-customer-workflow";
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new Error(`Company ${companyId} not found. Run product:customer-workflow-demo first.`);
  }

  const [dash, review, approvals, permissions] = await Promise.all([
    loadDebtIntelligenceDashboard(companyId),
    loadCovenantReviewWorkspace(companyId),
    listReviewerApprovals(companyId),
    prisma.permission.findMany({
      where: {
        companyId,
        modelingStatus: "MODELED",
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
    }),
  ]);

  const allItems = review.categories.flatMap((c) =>
    c.items.map((item) => ({ ...item, category: item.category ?? c.categoryLabel })),
  );
  const fin = dash.capitalStructure.aggregates;
  const financials =
    fin.totalDebt != null && fin.ebitda != null
      ? {
          ebitda: fin.ebitda,
          cash: fin.cash ?? 0,
          interestExpense: fin.interestExpense ?? 0,
          cumulativeNetIncome: 200,
          equityProceedsSinceIssue: 50,
          assumedNewDebtRatePct: 6.5,
          totalDebt: fin.totalDebt,
          securedDebt: fin.securedDebt ?? 0,
          totalAssets: 2800,
        }
      : null;

  const compiled = permissions.map((p) => ({
    id: p.id,
    code: p.code,
    grantType: p.grantType,
    sectionRef: p.sectionRef,
    formulaType: p.formulaType,
    thresholdValue: Number(p.thresholdValue),
    params: (p.params ?? null) as never,
    action: p.action,
    modelingStatus: p.modelingStatus,
  }));

  const scenarios: Array<{
    id: string;
    label: string;
    amount: number;
    kind: "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "ACQUISITION";
    secured: boolean;
  }> = [
    { id: "A", label: "$100M secured — general basket may be insufficient; enumerate alternatives", amount: 100, kind: "SECURED_DEBT", secured: true },
    { id: "B", label: "$75M restricted payment — fixed and builder pathways", amount: 75, kind: "RESTRICTED_PAYMENT", secured: false },
    { id: "C", label: "$150M acquisition — debt, investment, lien, subsidiary", amount: 150, kind: "ACQUISITION", secured: true },
    { id: "D", label: "EBITDA −20% stress on ratio/grower pathways (recompute with stressed fin)", amount: 100, kind: "SECURED_DEBT", secured: true },
    { id: "E", label: "Amendment threshold change (capacity after counsel recompile)", amount: 100, kind: "SECURED_DEBT", secured: true },
    { id: "F", label: "Reclassification of historical usage — only if expressly permitted (conditional)", amount: 50, kind: "RESTRICTED_PAYMENT", secured: false },
  ];

  const results = scenarios.map((sc) => {
    const finForSc =
      sc.id === "D" && financials
        ? { ...financials, ebitda: financials.ebitda * 0.8 }
        : financials;
    const mp = analyzeMultiPathTransaction({
      amountMillions: sc.amount,
      kind: sc.kind,
      secured: sc.secured,
      label: sc.label,
      items: allItems,
      approvals,
      permissions: compiled,
      financials: finForSc,
    });
    return {
      id: sc.id,
      label: sc.label,
      depth: depthScore(mp),
      narrative: mp.narrative,
      sufficientSingle: mp.sufficientSinglePaths.map((p) => ({
        sectionRef: p.sectionRef,
        family: p.family,
        capacity: p.capacityMillions,
      })),
      partial: mp.partialPaths.map((p) => ({
        sectionRef: p.sectionRef,
        family: p.family,
        capacity: p.capacityMillions,
      })),
      combination: mp.combination,
      missing: mp.missingForFullExecutable,
      pathSample: mp.paths.slice(0, 10).map((p) => ({
        sectionRef: p.sectionRef,
        family: p.family,
        status: p.status,
        capacity: p.capacityMillions,
        reviewDecision: p.reviewDecision,
      })),
    };
  });

  const report = {
    companyId,
    generatedAt: new Date().toISOString(),
    integrationBase: "PR #187 tip (contains #181–#186)",
    dashboard: {
      rulebookStage: dash.rulebookStage,
      capacityStatus: dash.capacityStatus,
      basketsComputed: dash.baskets.filter((b) => b.status === "COMPUTED").length,
      multiPathOnDashboard: dash.multiPath?.length ?? 0,
      proForma: dash.proForma?.[0]
        ? {
            status: dash.proForma[0].status,
            pfTotal: dash.proForma[0].proFormaTotalLeverage,
            engineRemaining: dash.proForma[0].engineCapacityRemaining,
          }
        : null,
    },
    grantTypesPresent: [...new Set(permissions.map((p) => p.grantType))],
    scenarios: results,
    summary: {
      totalPathways: results.reduce((n, r) => n + r.depth.pathways, 0),
      withPartialCapacity: results.filter((r) => r.partial.length > 0).length,
      withSufficientSingle: results.filter((r) => r.sufficientSingle.length > 0).length,
      stackingEverAssumed: results.some((r) => r.combination.stackingAssumed),
    },
  };

  const outDir = path.join("docs", "product", "customer-workflow");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "multipath-exercises.json"), JSON.stringify(report, null, 2) + "\n");
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
