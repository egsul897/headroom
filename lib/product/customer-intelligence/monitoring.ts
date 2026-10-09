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
  | "AMENDMENT_UNRESOLVED"
  | "RULEBOOK_NOT_EXECUTABLE"
  | "MISSING_FINANCIALS"
  | "CAPACITY_NOT_DETERMINABLE"
  | "REVIEW_REQUIRED";

export interface MonitoringAlert {
  kind: MonitoringAlertKind;
  severity: "info" | "attention" | "blocking";
  title: string;
  detail: string;
  sourceRefs: string[];
}

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

  if (financialCount === 0 || !capacity.hasFinancialSnapshot) {
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
