/**
 * Financial + compliance certificate engine — authentic multi-period coverage
 * plus labeled synthetic calculation tests.
 */

import { describe, expect, it } from "vitest";
import {
  runFinancialCertificateEngine,
  runEngineWithCapacityProjection,
  buildFinancialStateFromEngineRun,
} from "@/lib/financial-certificate-engine";
import {
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  SYNTHETIC_STATEMENT_Q2,
  SYNTHETIC_CERTIFICATE_Q2,
  SYNTHETIC_CERTIFICATE_Q2_DEBT_MISMATCH,
  SYNTHETIC_CERTIFICATE_STALE,
  SYNTHETIC_CALC_LABEL,
} from "@/lib/financial-certificate-engine/fixtures";
import { projectToLegacySnapshot } from "@/lib/financial-core/solver-adapter";

describe("financial-certificate-engine — authentic Matthews Q1 FY2025", () => {
  const run = runFinancialCertificateEngine({
    companyId: "matthews-fce-test",
    statement: {
      documentId: "matw-10q-2024-12-31",
      text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
      declaredType: "FINANCIAL_STATEMENT",
      filename: "matw-20241231-excerpt.txt",
    },
    certificate: {
      documentId: "matw-cert-2024-12-31",
      text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
      declaredType: "COMPLIANCE_CERTIFICATE",
      filename: "matthews-compliance-certificate-q1.txt",
    },
    now: new Date("2025-02-15T00:00:00Z"),
  });

  it("identifies issuer, period, currency, and document roles", () => {
    expect(run.statement?.identity.documentRole).toBe("FINANCIAL_STATEMENT");
    expect(run.certificate?.identity.documentRole).toBe("COMPLIANCE_CERTIFICATE");
    expect(run.statement?.identity.issuerName).toMatch(/Matthews/i);
    expect(run.certificate?.identity.issuerName).toMatch(/Matthews/i);
    expect(run.certificate?.identity.obligorGroup).toMatch(/Restricted Group/i);
    expect(run.reconciliation.asOfDate).toBe("2024-12-31");
    expect(run.statement?.identity.currency).toBe("USD");
    expect(run.certificate?.identity.currency).toBe("USD");
  });

  it("extracts GAAP EBITDA distinct from contractual Consolidated EBITDA", () => {
    const gaap = run.statement?.metrics.find((m) => m.family === "GAAP_EBITDA");
    const contractual = run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda");
    expect(gaap?.canonicalValue).toBeCloseTo(77.675, 3);
    expect(contractual?.value).toBeCloseTo(128.313, 3);
    expect(run.contractualEbitdaDistinctFromGaap).toBe(true);
    expect(run.reconciliation.findings.some((f) => f.code === "GAAP_VS_CONTRACTUAL_EBITDA")).toBe(true);
  });

  it("preserves addbacks and footnotes with source locators", () => {
    expect(run.certificate!.adjustments.some((a) => a.kind === "ADDBACK")).toBe(true);
    expect(run.statement!.adjustments.some((a) => a.kind === "FOOTNOTE")).toBe(true);
    for (const m of run.certificate!.metrics) {
      expect(m.source.documentId).toBe("matw-cert-2024-12-31");
      expect(m.source.excerpt.length).toBeGreaterThan(0);
    }
  });

  it("preserves contractual EBITDA definition excerpt", () => {
    expect(run.certificate!.definitions.some((d) => /Consolidated EBITDA/i.test(d.term))).toBe(true);
  });

  it("reconciles matching debt/cash and does not auto-approve", () => {
    expect(run.reconciliation.findings.some((f) => f.code === "MATCH" && f.metricFamily === "TOTAL_DEBT")).toBe(true);
    expect(run.reconciliation.findings.some((f) => f.code === "UNAPPROVED_EXTRACTION")).toBe(true);
    expect(["REVIEW_REQUIRED", "APPROVED_ELIGIBLE"]).toContain(run.reconciliation.disposition);
  });

  it("projects capacity only from contractual EBITDA (Position/capacity consumable)", () => {
    const { capacity, positionLeverage } = runEngineWithCapacityProjection({
      companyId: "matthews-fce-test",
      statement: {
        documentId: "matw-10q-2024-12-31",
        text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "matw-cert-2024-12-31",
        text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2025-02-15T00:00:00Z"),
    });
    expect(capacity.status).toBe("OK");
    if (capacity.status !== "OK") return;
    expect(capacity.snapshot.ebitda).toBeCloseTo(128.313, 3);
    expect(capacity.snapshot.ebitda).not.toBeCloseTo(77.675, 3);
    expect(capacity.authority).toBe("CONTRACTUAL_CERTIFICATE_METRICS");
    expect(positionLeverage.status).toBe("OK");
    expect(positionLeverage.totalNetLeverage).toBeCloseTo((809.211 - 33.513) / 128.313, 2);

    const state = buildFinancialStateFromEngineRun(run, {
      stateId: "matw-fce-state",
      companyId: "matthews-fce-test",
    });
    expect(state.status).toBe("OK");
    if (state.status !== "OK") return;
    const boundary = projectToLegacySnapshot(state.state);
    expect(boundary.status).toBe("OK");
    if (boundary.status === "OK") {
      expect(boundary.snapshot.ebitda).toBeCloseTo(128.313, 3);
    }
  });
});

describe("financial-certificate-engine — authentic Coherent FY2026 (second period/format)", () => {
  it("ingests seed-aligned statement + certificate and binds contractual EBITDA", () => {
    const { run, capacity, positionLeverage } = runEngineWithCapacityProjection({
      companyId: "coherent",
      statement: {
        documentId: "coh-10k-fy2026",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "coh-cert-fy2026",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });

    expect(run.reconciliation.asOfDate).toBe("2026-06-30");
    expect(run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda")?.value).toBe(1700);
    expect(run.statement?.metrics.some((m) => m.family === "GAAP_EBITDA")).toBe(false);
    expect(capacity.status).toBe("OK");
    if (capacity.status === "OK") {
      expect(capacity.snapshot.ebitda).toBe(1700);
      expect(capacity.snapshot.cash).toBe(1162);
      expect(capacity.snapshot.totalDebt).toBe(3258);
    }
    expect(positionLeverage.status).toBe("OK");
    expect(positionLeverage.totalNetLeverage).toBeCloseTo((3258 - 1162) / 1700, 2);
  });
});

describe(`financial-certificate-engine — ${SYNTHETIC_CALC_LABEL}`, () => {
  it("flags material debt discrepancy without inventing a winner", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-calc",
      statement: { documentId: "s-stmt", text: SYNTHETIC_STATEMENT_Q2, declaredType: "FINANCIAL_STATEMENT" },
      certificate: {
        documentId: "s-cert-mismatch",
        text: SYNTHETIC_CERTIFICATE_Q2_DEBT_MISMATCH,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(run.reconciliation.findings.some((f) => f.code === "MATERIAL_DIFFERENCE" && f.metricFamily === "TOTAL_DEBT")).toBe(
      true,
    );
    expect(run.reconciliation.disposition).toBe("REVIEW_REQUIRED");
  });

  it("matches synthetic Q2 when figures agree and keeps GAAP≠contractual", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-calc",
      statement: { documentId: "s-stmt", text: SYNTHETIC_STATEMENT_Q2, declaredType: "FINANCIAL_STATEMENT" },
      certificate: { documentId: "s-cert", text: SYNTHETIC_CERTIFICATE_Q2, declaredType: "COMPLIANCE_CERTIFICATE" },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(run.contractualEbitdaDistinctFromGaap).toBe(true);
    expect(run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda")?.value).toBe(150);
    expect(run.statement?.metrics.find((m) => m.family === "GAAP_EBITDA")?.canonicalValue).toBe(100);
  });

  it("flags stale periods", () => {
    const run = runFinancialCertificateEngine({
      companyId: "synth-calc",
      certificate: { documentId: "s-stale", text: SYNTHETIC_CERTIFICATE_STALE, declaredType: "COMPLIANCE_CERTIFICATE" },
      now: new Date("2026-10-09T00:00:00Z"),
    });
    expect(run.reconciliation.findings.some((f) => f.code === "STALE_PERIOD")).toBe(true);
  });

  it("refuses GAAP substitution when only GAAP EBITDA is present", () => {
    const { capacity } = runEngineWithCapacityProjection({
      companyId: "synth-calc",
      statement: { documentId: "s-stmt", text: SYNTHETIC_STATEMENT_Q2, declaredType: "FINANCIAL_STATEMENT" },
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(capacity.status).toBe("NOT_COMPUTABLE");
    if (capacity.status === "NOT_COMPUTABLE") {
      expect(capacity.missingInputs).toContain("covenant_ebitda");
      expect(capacity.warnings.some((w) => /GAAP/i.test(w))).toBe(true);
    }
  });
});
