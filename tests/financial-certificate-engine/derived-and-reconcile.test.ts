/**
 * Contractual metric derivation + expanded certificate reconciliation cases.
 */

import { describe, expect, it } from "vitest";
import {
  runFinancialCertificateEngine,
  runFinancialCertificateEngineWithDerivedMetrics,
  deriveContractualMetrics,
  reconcileStatementAgainstCertificate,
  extractFromDocumentText,
} from "@/lib/financial-certificate-engine";
import type { DocumentExtraction, ExtractedMetric } from "@/lib/financial-certificate-engine";
import {
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
  COHERENT_COMPLIANCE_CERTIFICATE_Q1_FY2027,
  COHERENT_FINANCIAL_STATEMENT_Q1_FY2027,
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
  SYNTHETIC_STATEMENT_Q2,
  SYNTHETIC_CERTIFICATE_Q2,
  SYNTHETIC_CERTIFICATE_EUR,
  SYNTHETIC_STATEMENT_WITH_OBLIGOR,
  SYNTHETIC_CERTIFICATE_OBLIGOR_MISMATCH,
  SYNTHETIC_CERTIFICATE_PERIOD_Q1,
  SYNTHETIC_CERTIFICATE_MISSING_SCHEDULE,
  SYNTHETIC_CERTIFICATE_STALE,
} from "@/lib/financial-certificate-engine/fixtures";

describe("derived contractual metrics (Matthews + Coherent)", () => {
  it("derives consolidated EBITDA, debt, net debt, leverage, coverage for Matthews", () => {
    const { derivedMetrics, run } = (() => {
      const r = runFinancialCertificateEngineWithDerivedMetrics({
        companyId: "matw-derived",
        statement: {
          documentId: "m-stmt",
          text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
          declaredType: "FINANCIAL_STATEMENT",
        },
        certificate: {
          documentId: "m-cert",
          text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
          declaredType: "COMPLIANCE_CERTIFICATE",
        },
        now: new Date("2025-02-15T00:00:00Z"),
      });
      return { derivedMetrics: r.derivedMetrics, run: r };
    })();

    const byKey = Object.fromEntries(derivedMetrics.map((d) => [d.key, d]));
    expect(byKey.contractual_ebitda?.status).toBe("DERIVED");
    expect(byKey.contractual_ebitda?.value).toBeCloseTo(128.313, 3);
    expect(byKey.total_debt?.status).toBe("DERIVED");
    expect(byKey.secured_debt?.status).toBe("DERIVED");
    expect(byKey.net_debt?.status).toBe("DERIVED");
    expect(byKey.net_debt?.value).toBeCloseTo(809.211 - 33.513, 3);
    expect(byKey.interest_expense?.status).toBe("DERIVED");
    expect(byKey.fixed_charges?.status).toBe("DERIVED");
    expect(byKey.total_assets?.status).toBe("DERIVED");
    expect(byKey.total_net_leverage?.status).toMatch(/DERIVED|REVIEW_REQUIRED/);
    expect(byKey.interest_coverage?.status).toBe("DERIVED");
    expect(byKey.fixed_charge_coverage?.status).toBe("DERIVED");

    // Pro forma acquisition without amount + addbacks preserved.
    expect(run.reconciliation.findings.some((f) => f.code === "PRO_FORMA_ACQUISITION")).toBe(true);
    expect(run.certificate!.adjustments.some((a) => a.kind === "ADDBACK" && !a.amountMissing)).toBe(true);
  });

  it("derives Coherent metrics and marks amount-less addbacks review-required", () => {
    const run = runFinancialCertificateEngine({
      companyId: "coh-derived",
      statement: {
        documentId: "c-stmt",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "c-cert",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });
    const derived = deriveContractualMetrics({
      statement: run.statement,
      certificate: run.certificate,
    });
    expect(derived.find((d) => d.key === "contractual_ebitda")?.value).toBe(1700);
    expect(derived.find((d) => d.key === "fixed_charges")?.value).toBe(210);
    expect(run.reconciliation.findings.some((f) => f.code === "ADDBACK_WITHOUT_AMOUNT")).toBe(true);
  });

  it("Coherent Q1 FY2027 incomplete period → missing debt inputs (not invented)", () => {
    const run = runFinancialCertificateEngineWithDerivedMetrics({
      companyId: "coh-q1",
      statement: {
        documentId: "q1-stmt",
        text: COHERENT_FINANCIAL_STATEMENT_Q1_FY2027,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "q1-cert",
        text: COHERENT_COMPLIANCE_CERTIFICATE_Q1_FY2027,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-11-15T00:00:00Z"),
    });
    expect(run.reconciliation.asOfDate).toBe("2026-09-30");
    expect(run.derivedMetrics.find((d) => d.key === "contractual_ebitda")?.value).toBe(1740);
    expect(run.derivedMetrics.find((d) => d.key === "total_debt")?.status).toBe("MISSING_INPUT");
    expect(run.derivedMetrics.find((d) => d.key === "net_debt")?.status).toBe("MISSING_INPUT");
  });
});

describe("certificate reconciliation stress cases", () => {
  it("flags different currencies", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-fx",
      statement: { documentId: "s", text: SYNTHETIC_STATEMENT_Q2, declaredType: "FINANCIAL_STATEMENT" },
      certificate: {
        documentId: "c",
        text: SYNTHETIC_CERTIFICATE_EUR,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(run.statement?.identity.currency).toBe("USD");
    expect(run.certificate?.identity.currency).toBe("EUR");
    expect(run.reconciliation.findings.some((f) => f.code === "CURRENCY_MISMATCH")).toBe(true);
    expect(run.reconciliation.disposition).toBe("REVIEW_REQUIRED");
  });

  it("flags obligor scope mismatch", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-obl",
      statement: {
        documentId: "s",
        text: SYNTHETIC_STATEMENT_WITH_OBLIGOR,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "c",
        text: SYNTHETIC_CERTIFICATE_OBLIGOR_MISMATCH,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(run.reconciliation.findings.some((f) => f.code === "OBLIGOR_SCOPE_MISMATCH")).toBe(true);
  });

  it("flags different reporting periods", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-period",
      statement: { documentId: "s", text: SYNTHETIC_STATEMENT_Q2, declaredType: "FINANCIAL_STATEMENT" },
      certificate: {
        documentId: "c",
        text: SYNTHETIC_CERTIFICATE_PERIOD_Q1,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(run.reconciliation.findings.some((f) => f.code === "PERIOD_MISMATCH")).toBe(true);
  });

  it("flags stale certificates and missing supporting schedules", () => {
    const stale = runFinancialCertificateEngine({
      companyId: "synth-stale",
      certificate: {
        documentId: "c",
        text: SYNTHETIC_CERTIFICATE_STALE,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-10-09T00:00:00Z"),
    });
    expect(stale.reconciliation.findings.some((f) => f.code === "STALE_PERIOD")).toBe(true);

    const missing = runFinancialCertificateEngine({
      companyId: "synth-sched",
      certificate: {
        documentId: "c",
        text: SYNTHETIC_CERTIFICATE_MISSING_SCHEDULE,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(missing.reconciliation.findings.some((f) => f.code === "MISSING_SCHEDULE")).toBe(true);
    expect(missing.reconciliation.missingInputKeys).toContain("basket_usage_schedule");
  });

  it("flags unit mismatches without silent rescaling", () => {
    const stmt = extractFromDocumentText({
      documentId: "s",
      text: SYNTHETIC_STATEMENT_Q2,
      declaredType: "FINANCIAL_STATEMENT",
    });
    const cert = extractFromDocumentText({
      documentId: "c",
      text: SYNTHETIC_CERTIFICATE_Q2,
      declaredType: "COMPLIANCE_CERTIFICATE",
    });
    // Force incompatible canonical units on TOTAL_DEBT for the reconciler.
    const debt = cert.metrics.find((m) => m.family === "TOTAL_DEBT")!;
    const patchedCert: DocumentExtraction = {
      ...cert,
      metrics: cert.metrics.map((m) =>
        m.family === "TOTAL_DEBT"
          ? ({ ...debt, canonicalUnit: "RATIO", unit: "RATIO" } as ExtractedMetric)
          : m,
      ),
    };
    const report = reconcileStatementAgainstCertificate({
      companyId: "synth-unit",
      statement: stmt,
      certificate: patchedCert,
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(report.findings.some((f) => f.code === "UNIT_MISMATCH" && f.metricFamily === "TOTAL_DEBT")).toBe(
      true,
    );
  });

  it("preserves conflicting values as MATERIAL_DIFFERENCE (no invented winner)", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-conflict",
      statement: { documentId: "s", text: SYNTHETIC_STATEMENT_Q2, declaredType: "FINANCIAL_STATEMENT" },
      certificate: {
        documentId: "c",
        text: SYNTHETIC_CERTIFICATE_Q2.replace("Total Debt: $400 million", "Total Debt: $480 million"),
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    const finding = run.reconciliation.findings.find(
      (f) => f.code === "MATERIAL_DIFFERENCE" && f.metricFamily === "TOTAL_DEBT",
    );
    expect(finding).toBeTruthy();
    expect(finding!.statementValue).toBe(400);
    expect(finding!.certificateValue).toBe(480);
  });
});
