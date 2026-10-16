/**
 * Continuous monitoring feed — only obligations backed by persisted analysis,
 * financial snapshots, amendments, or capacity readiness blockers.
 * Does not invent compliance calendars from market practice.
 */

import { prisma } from "@/lib/prisma";
import { loadCapacityReadiness } from "./capacity-readiness";
import { loadRulebookReadiness } from "./rulebook-readiness";
import { getLatestAmendmentPackage, listCustomerDocumentIntelligence } from "./load";

export type MonitoringAlertKind =
  | "MISSING_DOCUMENTS"
  | "ANALYSIS_FAILED"
  | "STALE_ANALYSIS"
  | "STALLED_ANALYSIS"
  | "AMENDMENT_UNRESOLVED"
  | "RULEBOOK_NOT_EXECUTABLE"
  | "MISSING_FINANCIALS"
  | "CAPACITY_NOT_DETERMINABLE"
  | "REVIEW_REQUIRED"
  | "TYPE_MISMATCH";

export interface MonitoringAlert {
  kind: MonitoringAlertKind;
  severity: "info" | "attention" | "blocking";
  title: string;
  detail: string;
  sourceRefs: string[];
}

import { staleAnalysisAlerts } from "./stale-analysis-alerts";
import { stalledAnalysisAlerts } from "./stalled-analysis-alerts";
import { typeMismatchAlerts } from "./type-mismatch-alerts";

export interface MonitoringFeed {
  companyId: string;
  generatedAt: string;
  alerts: MonitoringAlert[];
  note: string;
}

export async function loadMonitoringFeed(companyId: string): Promise<MonitoringFeed> {
  const [docs, capacity, rulebook, amendment, financialCount] = await Promise.all([
    listCustomerDocumentIntelligence(companyId),
    loadCapacityReadiness(companyId),
    loadRulebookReadiness(companyId),
    getLatestAmendmentPackage(companyId),
    prisma.financialState.count({ where: { companyId } }),
  ]);

  const alerts: MonitoringAlert[] = [];

  if (docs.length === 0) {
    alerts.push({
      kind: "MISSING_DOCUMENTS",
      severity: "blocking",
      title: "No financing documents uploaded",
      detail: "Upload a credit agreement, indenture, or amendment to begin covenant analysis.",
      sourceRefs: [],
    });
  }

  for (const d of docs.filter((x) => !x.analysisOk && x.extractionStatus !== "PENDING")) {
    alerts.push({
      kind: "ANALYSIS_FAILED",
      severity: "attention",
      title: `Analysis incomplete: ${d.filename}`,
      detail: d.analysisError || `extractionStatus=${d.extractionStatus}`,
      sourceRefs: [d.sourceId],
    });
  }

  alerts.push(...staleAnalysisAlerts(docs));
  alerts.push(...stalledAnalysisAlerts(docs));
  alerts.push(...typeMismatchAlerts(docs));

  if (amendment?.operativeResolution === "UNRESOLVED_PRECEDENCE") {
    alerts.push({
      kind: "AMENDMENT_UNRESOLVED",
      severity: "attention",
      title: "Amendment precedence unresolved",
      detail: amendment.unresolvedReasons.join("; ") || amendment.askGuidance,
      sourceRefs: [
        ...amendment.baseCandidates.map((b) => b.sourceId),
        ...amendment.amendmentDocuments.map((a) => a.sourceId),
      ],
    });
  }

  if (rulebook.stage !== "EXECUTABLE") {
    alerts.push({
      kind: "RULEBOOK_NOT_EXECUTABLE",
      severity: rulebook.stage === "DISCOVERED" ? "blocking" : "attention",
      title: `Rulebook stage: ${rulebook.stage}`,
      detail: rulebook.headline,
      sourceRefs: [],
    });
  }

  // Rule 85: "no approved financial snapshot" must mean no
  // financial snapshot in ANY store. The old condition
  // (legacy FinancialState count + legacy UNIQUE resolution)
  // fired a false alert for a company with APPROVED NS-4
  // snapshots but no legacy FinancialState rows. AMBIGUOUS
  // legacy rows still surface via CAPACITY_NOT_DETERMINABLE.
  const hasAnyFinancialEvidence =
    financialCount > 0 ||
    capacity.ns4ApprovedSnapshotCount > 0 ||
    capacity.approvedNorthStarSnapshotCount > 0;
  if (!hasAnyFinancialEvidence) {
    alerts.push({
      kind: "MISSING_FINANCIALS",
      severity: "attention",
      title: "No approved financial snapshot",
      detail: "Ratio/grower capacity tests require user-confirmed financial inputs aligned to contractual definitions.",
      sourceRefs: [],
    });
  }

  if (!capacity.canEvaluateExecutableCapacity) {
    alerts.push({
      kind: "CAPACITY_NOT_DETERMINABLE",
      severity: "info",
      title: "Contractual capacity not determinable",
      detail: capacity.headline,
      sourceRefs: [],
    });
  }

  if (rulebook.interpretedProvisions > 0 && rulebook.reviewedPermissions === 0) {
    alerts.push({
      kind: "REVIEW_REQUIRED",
      severity: "attention",
      title: "Interpreted provisions await legal review",
      detail: `${rulebook.interpretedProvisions} interpreted provision(s) have not been promoted to REVIEWED/EXECUTABLE permissions.`,
      sourceRefs: [],
    });
  }

  return {
    companyId,
    generatedAt: new Date().toISOString(),
    alerts,
    note: "Alerts are derived only from persisted workspace state. No market-practice deadlines are invented.",
  };
}
