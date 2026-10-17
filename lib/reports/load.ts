/**
 * Server loader: reads the existing covenant overview (the same engine
 * output the Dashboard/Covenants pages render) and builds the report.
 * Any load failure is a whole-report NOT_DETERMINABLE with the reason —
 * never an empty "all clear" report.
 */
import { getCovenantOverview } from "@/lib/covenant-overview-service";
import { buildComplianceReport, notDeterminableReport, type OverviewLike } from "./build";
import type { ComplianceReport } from "./types";

export async function loadComplianceReport(companyId: string, asOfDate?: Date): Promise<ComplianceReport> {
  try {
    const overview = await getCovenantOverview(companyId, asOfDate);
    const shaped: OverviewLike = overview;
    return buildComplianceReport(companyId, shaped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const safe = /FinancialState|financial/i.test(msg)
      ? "No unique financial state on file for this company; financial inputs are needed before covenants can be tested."
      : "Covenant engine output could not be loaded for this company.";
    return notDeterminableReport(companyId, safe);
  }
}
