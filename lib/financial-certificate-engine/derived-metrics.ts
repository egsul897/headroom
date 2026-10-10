/**
 * Contractual metric derivation from extracted evidence (Agent 2 P1).
 *
 * Derives only when source evidence supports the formula. Never invents
 * addbacks. Missing evidence → missing-input / review-required.
 */

import type { DocumentExtraction, ExtractedMetric, MetricFamily } from "./types";

export type DerivedMetricStatus = "DERIVED" | "MISSING_INPUT" | "REVIEW_REQUIRED";

export interface DerivedContractualMetric {
  key:
    | "contractual_ebitda"
    | "total_debt"
    | "secured_debt"
    | "net_debt"
    | "interest_expense"
    | "fixed_charges"
    | "total_assets"
    | "total_net_leverage"
    | "interest_coverage"
    | "fixed_charge_coverage";
  status: DerivedMetricStatus;
  value: number | null;
  unit: "USD_MILLIONS" | "RATIO";
  evidence: string[];
  missingInputs: string[];
  note: string;
}

function metric(extraction: DocumentExtraction | null, family: MetricFamily): ExtractedMetric | null {
  return extraction?.metrics.find((m) => m.family === family) ?? null;
}

/**
 * Prefer certificate (contractual) over statement for covenant-bound names.
 * GAAP EBITDA is never used as contractual_ebitda.
 */
export function deriveContractualMetrics(params: {
  statement: DocumentExtraction | null;
  certificate: DocumentExtraction | null;
}): DerivedContractualMetric[] {
  const cert = params.certificate;
  const stmt = params.statement;

  const ebitda =
    metric(cert, "CONTRACTUAL_EBITDA") ?? metric(stmt, "CONTRACTUAL_EBITDA");
  const totalDebt = metric(cert, "TOTAL_DEBT") ?? metric(stmt, "TOTAL_DEBT");
  const securedDebt = metric(cert, "SECURED_DEBT") ?? metric(stmt, "SECURED_DEBT");
  const cash = metric(cert, "CASH") ?? metric(stmt, "CASH");
  const interest = metric(cert, "INTEREST_EXPENSE") ?? metric(stmt, "INTEREST_EXPENSE");
  const fixedCharges = metric(cert, "FIXED_CHARGES") ?? metric(stmt, "FIXED_CHARGES");
  const totalAssets = metric(cert, "TOTAL_ASSETS") ?? metric(stmt, "TOTAL_ASSETS");
  const reportedLeverage = metric(cert, "LEVERAGE_RATIO") ?? metric(stmt, "LEVERAGE_RATIO");
  const reportedCoverage = metric(cert, "INTEREST_COVERAGE") ?? metric(stmt, "INTEREST_COVERAGE");

  const out: DerivedContractualMetric[] = [];

  out.push(
    ebitda
      ? {
          key: "contractual_ebitda",
          status: "DERIVED",
          value: ebitda.canonicalValue,
          unit: "USD_MILLIONS",
          evidence: [ebitda.source.excerpt],
          missingInputs: [],
          note: "Bound to contractual/consolidated EBITDA — not GAAP.",
        }
      : {
          key: "contractual_ebitda",
          status: "MISSING_INPUT",
          value: null,
          unit: "USD_MILLIONS",
          evidence: [],
          missingInputs: ["CONTRACTUAL_EBITDA"],
          note: "GAAP/reported EBITDA is not substituted.",
        },
  );

  for (const [key, m] of [
    ["total_debt", totalDebt],
    ["secured_debt", securedDebt],
    ["interest_expense", interest],
    ["fixed_charges", fixedCharges],
    ["total_assets", totalAssets],
  ] as const) {
    out.push(
      m
        ? {
            key,
            status: "DERIVED",
            value: m.canonicalValue,
            unit: "USD_MILLIONS",
            evidence: [m.source.excerpt],
            missingInputs: [],
            note: `From ${m.source.documentRole} source.`,
          }
        : {
            key,
            status: "MISSING_INPUT",
            value: null,
            unit: "USD_MILLIONS",
            evidence: [],
            missingInputs: [key.toUpperCase()],
            note: "Not present in available source evidence.",
          },
    );
  }

  if (totalDebt && cash) {
    out.push({
      key: "net_debt",
      status: "DERIVED",
      value: totalDebt.canonicalValue - cash.canonicalValue,
      unit: "USD_MILLIONS",
      evidence: [totalDebt.source.excerpt, cash.source.excerpt],
      missingInputs: [],
      note: "Derived as total_debt − cash (no invented adjustments).",
    });
  } else {
    out.push({
      key: "net_debt",
      status: "MISSING_INPUT",
      value: null,
      unit: "USD_MILLIONS",
      evidence: [],
      missingInputs: [
        ...(totalDebt ? [] : ["TOTAL_DEBT"]),
        ...(cash ? [] : ["CASH"]),
      ],
      note: "Requires both total debt and cash from sources.",
    });
  }

  if (ebitda && totalDebt && cash && ebitda.canonicalValue !== 0) {
    const derived = (totalDebt.canonicalValue - cash.canonicalValue) / ebitda.canonicalValue;
    if (reportedLeverage) {
      const rel = Math.abs(derived - reportedLeverage.canonicalValue) / Math.max(Math.abs(derived), 1e-9);
      out.push({
        key: "total_net_leverage",
        status: rel > 0.01 ? "REVIEW_REQUIRED" : "DERIVED",
        value: derived,
        unit: "RATIO",
        evidence: [ebitda.source.excerpt, totalDebt.source.excerpt, cash.source.excerpt, reportedLeverage.source.excerpt],
        missingInputs: [],
        note:
          rel > 0.01
            ? `Derived ${derived.toFixed(4)} differs from certificate-reported ${reportedLeverage.canonicalValue} — review required; reported figure not silently preferred.`
            : `Derived from contractual EBITDA and net debt; certificate-reported ${reportedLeverage.canonicalValue} agrees within 1%.`,
      });
    } else {
      out.push({
        key: "total_net_leverage",
        status: "DERIVED",
        value: derived,
        unit: "RATIO",
        evidence: [ebitda.source.excerpt, totalDebt.source.excerpt, cash.source.excerpt],
        missingInputs: [],
        note: "Derived (total_debt − cash) / contractual_ebitda.",
      });
    }
  } else {
    out.push({
      key: "total_net_leverage",
      status: "MISSING_INPUT",
      value: reportedLeverage?.canonicalValue ?? null,
      unit: "RATIO",
      evidence: reportedLeverage ? [reportedLeverage.source.excerpt] : [],
      missingInputs: [
        ...(ebitda ? [] : ["CONTRACTUAL_EBITDA"]),
        ...(totalDebt ? [] : ["TOTAL_DEBT"]),
        ...(cash ? [] : ["CASH"]),
      ],
      note: reportedLeverage
        ? "Certificate reports a leverage ratio but supporting components are incomplete — not treated as derived capacity input."
        : "Cannot derive leverage without contractual EBITDA, total debt, and cash.",
    });
  }

  if (ebitda && interest && interest.canonicalValue !== 0) {
    const derived = ebitda.canonicalValue / interest.canonicalValue;
    out.push({
      key: "interest_coverage",
      status: "DERIVED",
      value: derived,
      unit: "RATIO",
      evidence: [ebitda.source.excerpt, interest.source.excerpt, ...(reportedCoverage ? [reportedCoverage.source.excerpt] : [])],
      missingInputs: [],
      note: "Derived contractual_ebitda / interest_expense.",
    });
  } else {
    out.push({
      key: "interest_coverage",
      status: "MISSING_INPUT",
      value: reportedCoverage?.canonicalValue ?? null,
      unit: "RATIO",
      evidence: reportedCoverage ? [reportedCoverage.source.excerpt] : [],
      missingInputs: [
        ...(ebitda ? [] : ["CONTRACTUAL_EBITDA"]),
        ...(interest ? [] : ["INTEREST_EXPENSE"]),
      ],
      note: "Cannot derive without contractual EBITDA and interest expense.",
    });
  }

  if (ebitda && fixedCharges && fixedCharges.canonicalValue !== 0) {
    out.push({
      key: "fixed_charge_coverage",
      status: "DERIVED",
      value: ebitda.canonicalValue / fixedCharges.canonicalValue,
      unit: "RATIO",
      evidence: [ebitda.source.excerpt, fixedCharges.source.excerpt],
      missingInputs: [],
      note: "Derived contractual_ebitda / fixed_charges.",
    });
  } else {
    out.push({
      key: "fixed_charge_coverage",
      status: "MISSING_INPUT",
      value: null,
      unit: "RATIO",
      evidence: [],
      missingInputs: [
        ...(ebitda ? [] : ["CONTRACTUAL_EBITDA"]),
        ...(fixedCharges ? [] : ["FIXED_CHARGES"]),
      ],
      note: "Fixed charges not present in source evidence — not invented.",
    });
  }

  return out;
}
