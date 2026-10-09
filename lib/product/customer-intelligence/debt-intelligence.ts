/**
 * AI-populated debt intelligence dashboard model — source-backed, fail-closed on numbers.
 */

import { prisma } from "@/lib/prisma";
import { loadCovenantReviewWorkspace } from "./covenant-review";
import { loadCapacityReadiness } from "./capacity-readiness";
import { loadRulebookReadiness } from "./rulebook-readiness";
import { loadMonitoringFeed } from "./monitoring";
import { listReviewerApprovals } from "./reviewer-approvals";

export interface DebtIntelligenceDashboard {
  companyId: string;
  headline: string;
  capitalStructure: {
    totalDebt: number | null;
    securedDebt: number | null;
    cash: number | null;
    ebitda: number | null;
    interestExpense: number | null;
    asOfDate: string | null;
    notes: string | null;
    numericStatus: "SUPPORTED" | "MISSING_FINANCIALS";
  };
  ratios: Array<{
    name: string;
    contractualSignal: string;
    currentValue: string;
    status: "NOT_DETERMINABLE" | "INPUTS_PRESENT";
  }>;
  baskets: Array<{
    category: string;
    sectionRef: string;
    heading: string;
    baskets: string[];
    conditions: string[];
    citation: string;
    reviewDecision: string | null;
  }>;
  monitoring: Array<{ severity: string; title: string; detail: string }>;
  rulebookStage: string;
  capacityStatus: string;
  amendmentResolution: string;
  documentCount: number;
  interpretedCount: number;
  acceptedCount: number;
  note: string;
}

export async function loadDebtIntelligenceDashboard(companyId: string): Promise<DebtIntelligenceDashboard> {
  const [review, capacity, rulebook, feed, approvals, snapshot] = await Promise.all([
    loadCovenantReviewWorkspace(companyId),
    loadCapacityReadiness(companyId),
    loadRulebookReadiness(companyId),
    loadMonitoringFeed(companyId),
    listReviewerApprovals(companyId),
    prisma.financialSnapshot.findFirst({
      where: { companyId },
      orderBy: { asOfDate: "desc" },
    }),
  ]);

  const approvalByKey = new Map(
    approvals.map((a) => [`${a.sourceId}|${a.sectionRef}`, a.decision]),
  );

  const baskets: DebtIntelligenceDashboard["baskets"] = [];
  for (const cat of review.categories) {
    for (const item of cat.items.slice(0, 6)) {
      if ((item.materialBasketsThresholds ?? []).length === 0 && (item.conditions ?? []).length === 0) {
        continue;
      }
      baskets.push({
        category: cat.categoryLabel,
        sectionRef: item.sectionRef,
        heading: item.heading,
        baskets: item.materialBasketsThresholds ?? [],
        conditions: item.conditions ?? [],
        citation: item.sourceCitation,
        reviewDecision: approvalByKey.get(`${item.sourceId}|${item.sectionRef}`) ?? null,
      });
    }
  }

  const ratioSignals = review.categories
    .flatMap((c) => c.items)
    .filter((i) =>
      /ratio|leverage|coverage|liquidity/i.test(
        `${i.heading} ${i.plainEnglish} ${(i.materialBasketsThresholds ?? []).join(" ")}`,
      ),
    )
    .slice(0, 8)
    .map((i) => ({
      name: i.heading || `§${i.sectionRef}`,
      contractualSignal: (i.materialBasketsThresholds ?? []).slice(0, 2).join("; ") || i.plainEnglish.slice(0, 160),
      currentValue: snapshot
        ? "Financial inputs present — executable ratio evaluation requires reviewed rulebook formulas"
        : "Missing financial inputs",
      status: snapshot ? ("INPUTS_PRESENT" as const) : ("NOT_DETERMINABLE" as const),
    }));

  const acceptedCount = approvals.filter((a) => a.decision === "ACCEPTED" || a.decision === "EDITED").length;

  return {
    companyId,
    headline:
      review.documentCount === 0
        ? "Upload a financing package to populate debt intelligence."
        : `AI-interpreted package: ${review.analyzedOkCount}/${review.documentCount} documents · rulebook ${rulebook.stage}`,
    capitalStructure: {
      totalDebt: snapshot ? Number(snapshot.totalDebt) : null,
      securedDebt: snapshot ? Number(snapshot.securedDebt) : null,
      cash: snapshot ? Number(snapshot.cash) : null,
      ebitda: snapshot ? Number(snapshot.ebitda) : null,
      interestExpense: snapshot ? Number(snapshot.interestExpense) : null,
      asOfDate: snapshot?.asOfDate?.toISOString().slice(0, 10) ?? null,
      notes: snapshot?.notes ?? null,
      numericStatus: snapshot ? "SUPPORTED" : "MISSING_FINANCIALS",
    },
    ratios: ratioSignals.length
      ? ratioSignals
      : [
          {
            name: "Financial maintenance / leverage tests",
            contractualSignal: "No ratio language surfaced in current summaries",
            currentValue: "NOT DETERMINABLE",
            status: "NOT_DETERMINABLE",
          },
        ],
    baskets: baskets.slice(0, 40),
    monitoring: feed.alerts.slice(0, 12).map((a) => ({
      severity: a.severity === "blocking" ? "HIGH" : a.severity === "attention" ? "MEDIUM" : "INFO",
      title: a.title,
      detail: a.detail,
    })),
    rulebookStage: rulebook.stage,
    capacityStatus: capacity.status,
    amendmentResolution: review.amendmentCompare.operativeResolution,
    documentCount: review.documentCount,
    interpretedCount: rulebook.interpretedProvisions,
    acceptedCount,
    note: "Dashboard values are AI-populated from workspace documents and financial snapshots. Numerical capacity remains fail-closed until an executable rulebook exists. Customer counsel can accept/edit interpretations on /rulebook.",
  };
}
