/**
 * Bind certificate-engine extractions into Phase-4A metric inputs.
 * GAAP EBITDA is never registered as Consolidated EBITDA.
 * A reported ratio line is kept aside and is not a calculated input.
 */

import { metricInput, money, rationalFromString } from "../definition-execution";
import { runFinancialCertificateEngine } from "@/lib/financial-certificate-engine";
import type { ExtractedMetric, MetricFamily } from "@/lib/financial-certificate-engine";
import type { MetricInput } from "../runtime/types";
import type { PackageDocument } from "./types";
import { citedIn, dollarToken, statedAsMillions } from "./text";

const ALIASES: Partial<Record<MetricFamily, readonly string[]>> = {
  CONTRACTUAL_EBITDA: ["Consolidated EBITDA", "Covenant EBITDA"],
  TOTAL_DEBT: ["Consolidated Total Debt", "Total Debt"],
  SECURED_DEBT: ["Consolidated Secured Debt", "Secured Debt"],
  FIRST_LIEN_DEBT: ["First Lien Debt", "First Lien Net Debt"],
  CASH: ["Unrestricted Cash", "Cash"],
  TOTAL_ASSETS: ["Total Assets", "Consolidated Total Assets", "Total Consolidated Assets"],
  INTEREST_EXPENSE: ["Interest Expense", "Consolidated Interest Expense"],
  FIXED_CHARGES: ["Consolidated Fixed Charges", "Fixed Charges"],
};

export interface BoundInputs {
  metrics: MetricInput[];
  reportedRatios: Array<{
    family: MetricFamily;
    canonical: string;
    citationExcerpt: string;
    sourceDocumentId: string;
  }>;
}

export function bindFinancialInputs(documents: readonly PackageDocument[]): BoundInputs {
  const statement = documents.find((d) => d.role === "FINANCIAL_STATEMENT");
  const certificate = documents.find((d) => d.role === "COMPLIANCE_CERTIFICATE");
  if (!statement && !certificate) return { metrics: [], reportedRatios: [] };

  const run = runFinancialCertificateEngine({
    companyId: "covenant-computation",
    statement: statement
      ? { documentId: statement.documentId, text: statement.text, declaredType: "FINANCIAL_STATEMENT" }
      : null,
    certificate: certificate
      ? { documentId: certificate.documentId, text: certificate.text, declaredType: "COMPLIANCE_CERTIFICATE" }
      : null,
  });

  const byFamily = new Map<MetricFamily, ExtractedMetric>();
  for (const extraction of [run.statement, run.certificate]) {
    if (!extraction) continue;
    for (const metric of extraction.metrics) {
      if (metric.family === "GAAP_EBITDA") continue;
      const existing = byFamily.get(metric.family);
      if (existing && extraction.identity.documentRole === "FINANCIAL_STATEMENT") continue;
      byFamily.set(metric.family, metric);
    }
  }

  const metrics: MetricInput[] = [];
  const reportedRatios: BoundInputs["reportedRatios"] = [];
  const seenKeys = new Set<string>();

  for (const metric of byFamily.values()) {
    if (metric.canonicalUnit === "RATIO" || metric.canonicalUnit === "PERCENT") {
      reportedRatios.push({
        family: metric.family,
        canonical: String(metric.canonicalValue),
        citationExcerpt: metric.source.excerpt,
        sourceDocumentId: metric.source.documentId,
      });
      continue;
    }
    const token = dollarToken(metric.source.excerpt);
    if (!token) continue;
    const sourceDoc = documents.find((d) => d.documentId === metric.source.documentId);
    if (!sourceDoc || !citedIn(sourceDoc.text, metric.source.excerpt)) continue;
    const currency = statedAsMillions(metric.source.excerpt) ? "USD_MILLIONS" : "USD";
    const value = money(rationalFromString(token), currency, {
      exprId: null,
      inputKeys: [metric.family],
      rawSource: token,
    });
    const provenance = {
      source: metric.source.documentId,
      sourceVersion: metric.source.versionHash ?? null,
      note: metric.source.excerpt,
    };
    const keys = new Set<string>();
    if (metric.contractualName) keys.add(metric.contractualName);
    for (const alias of ALIASES[metric.family] ?? []) {
      if (alias === metric.contractualName || metric.source.excerpt.toLowerCase().includes(alias.toLowerCase())) {
        keys.add(alias);
      }
    }
    for (const key of keys) {
      if (seenKeys.has(key.toLowerCase())) continue;
      seenKeys.add(key.toLowerCase());
      metrics.push(metricInput(key, value, provenance, metric.reportingPeriod, metric.asOfDate || null));
    }
  }

  return { metrics, reportedRatios };
}
