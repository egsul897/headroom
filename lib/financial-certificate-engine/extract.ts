/**
 * Extract financial-statement metrics, certificate covenant calculations,
 * contractual definition references, and adjustments/addbacks/footnotes.
 *
 * Rules:
 * - Never invent missing numbers or units.
 * - GAAP EBITDA and contractual/covenant EBITDA are distinct families.
 * - Certificate extraction alone does not approve facts.
 */

import { normalizeFinancialValue, type FinancialUnit } from "@/lib/connectors/units";
import { identifyDocument, type IdentifyDocumentParams } from "./identity";
import type {
  CapacityMetricName,
  CertificateCalculation,
  DocumentExtraction,
  ExtractedAdjustment,
  ExtractedDefinitionRef,
  ExtractedMetric,
  MetricFamily,
  SourceLocator,
} from "./types";

const AMOUNT =
  /\$\s*(-?[\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|m|k)?\b|\b(-?[\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mm)\b/i;
const RATIO = /\b([\d]+(?:\.\d+)?)\s*(?:x|times)\b/i;
const PERCENT = /\b([\d]+(?:\.\d+)?)\s*%/;

interface MetricPattern {
  family: MetricFamily;
  capacityMetricName: CapacityMetricName | null;
  /** True when this label denotes a contractual / covenant-defined figure. */
  isContractual: boolean;
  pattern: RegExp;
  contractualName: string | null;
  unitHint?: "RATIO" | "PERCENT" | "MONEY";
}

/**
 * Order matters: GAAP / reported labels first so they are never swallowed by
 * the contractual EBITDA pattern. Contractual requires an explicit
 * Consolidated / Covenant / Adjusted qualifier (or bare "EBITDA" on a
 * certificate, handled in matchMetricPattern).
 */
const METRIC_PATTERNS: MetricPattern[] = [
  {
    family: "GAAP_EBITDA",
    capacityMetricName: null,
    isContractual: false,
    pattern: /\bgaap\s+(?:operating\s+)?ebitda\b|\breported\s+ebitda\b|\boperating\s+profit\s*\+\s*d(?:&|and)\s*a\b/i,
    contractualName: null,
  },
  {
    family: "CONTRACTUAL_EBITDA",
    capacityMetricName: "covenant_ebitda",
    isContractual: true,
    pattern: /\b(?:consolidated|covenant)\s+ebitda\b|\badjusted\s+ebitda\b|\bebitda\b/i,
    contractualName: "Consolidated EBITDA",
  },
  {
    family: "TOTAL_DEBT",
    capacityMetricName: "total_debt",
    isContractual: true,
    pattern: /\b(?:consolidated\s+)?total(?:\s+net)?\s+debt\b|\btotal\s+indebtedness\b|\bconsolidated\s+total\s+(?:net\s+)?debt\b/i,
    contractualName: "Consolidated Total Debt",
  },
  {
    family: "SECURED_DEBT",
    capacityMetricName: "secured_debt",
    isContractual: true,
    pattern: /\b(?:senior\s+)?secured\s+debt\b|\bsecured\s+indebtedness\b/i,
    contractualName: "Secured Debt",
  },
  {
    family: "FIRST_LIEN_DEBT",
    capacityMetricName: null,
    isContractual: true,
    pattern: /\bfirst[- ]lien\s+(?:debt|indebtedness)\b|\bsenior\s+secured\s+net\s+debt\b/i,
    contractualName: "First Lien Debt",
  },
  {
    family: "CASH",
    capacityMetricName: "cash",
    isContractual: false,
    pattern: /\b(?:unrestricted\s+)?cash(?:\s+and\s+cash\s+equivalents)?\b/i,
    contractualName: "Unrestricted Cash",
  },
  {
    family: "TOTAL_ASSETS",
    capacityMetricName: null,
    isContractual: false,
    pattern: /\b(?:consolidated\s+)?total\s+assets\b/i,
    contractualName: "Total Assets",
  },
  {
    family: "INTEREST_EXPENSE",
    capacityMetricName: "interest_expense",
    isContractual: true,
    pattern: /\b(?:consolidated\s+)?interest\s+expense\b/i,
    contractualName: "Interest Expense",
  },
  {
    family: "FIXED_CHARGES",
    capacityMetricName: null,
    isContractual: true,
    pattern: /\b(?:consolidated\s+)?fixed\s+charges\b/i,
    contractualName: "Consolidated Fixed Charges",
  },
  {
    family: "CUMULATIVE_NET_INCOME",
    capacityMetricName: "cumulative_net_income",
    isContractual: true,
    pattern: /\bcumulative\s+net\s+income\b|\bconsolidated\s+net\s+income\b/i,
    contractualName: "Cumulative Net Income",
  },
  {
    family: "EQUITY_PROCEEDS",
    capacityMetricName: "equity_proceeds",
    isContractual: true,
    pattern: /\bequity\s+proceeds\b/i,
    contractualName: "Equity Proceeds",
  },
  {
    family: "LEVERAGE_RATIO",
    capacityMetricName: null,
    isContractual: true,
    pattern: /\b(?:total\s+)?(?:net\s+)?leverage\s+ratio\b|\bconsolidated\s+total\s+leverage\s+ratio\b/i,
    contractualName: "Total Net Leverage Ratio",
    unitHint: "RATIO",
  },
  {
    family: "INTEREST_COVERAGE",
    capacityMetricName: null,
    isContractual: true,
    pattern: /\binterest\s+coverage\s+ratio\b|\bfixed\s+charge\s+coverage\s+ratio\b/i,
    contractualName: "Interest Coverage Ratio",
    unitHint: "RATIO",
  },
  {
    family: "OTHER",
    capacityMetricName: "assumed_new_debt_rate_pct",
    isContractual: true,
    pattern: /\bassumed\s+new[- ]debt\s+rate\b|\bassumed\s+coupon\b|\bassumed\s+new\s+debt\s+rate\b/i,
    contractualName: "Assumed New Debt Rate",
    unitHint: "PERCENT",
  },
];

/** Conservative: bare "EBITDA" on a financial statement (not certificate) → GAAP; on a certificate → contractual. */
function bareEbitdaFamily(documentRole: DocumentExtraction["identity"]["documentRole"]): MetricFamily {
  return documentRole === "FINANCIAL_STATEMENT" ? "GAAP_EBITDA" : "CONTRACTUAL_EBITDA";
}

function unitFromWord(word: string | undefined): FinancialUnit | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (w === "billion" || w === "bn") return "USD_MILLIONS"; // scaled below
  if (w === "million" || w === "mm" || w === "m") return "USD_MILLIONS";
  if (w === "thousand" || w === "k") return "USD_THOUSANDS";
  return null;
}

function parseAmount(raw: string): { value: number; unit: FinancialUnit } | null {
  const m = raw.match(AMOUNT);
  if (!m) return null;
  const n = Number((m[1] ?? m[3] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const word = m[2] ?? m[4];
  if (word && /^(billion|bn)$/i.test(word)) {
    return { value: n * 1_000, unit: "USD_MILLIONS" };
  }
  const unit = unitFromWord(word);
  if (!unit) return null;
  return { value: n, unit };
}

function parseRatioOrPercent(raw: string, hint?: "RATIO" | "PERCENT"): { value: number; unit: FinancialUnit } | null {
  if (hint === "PERCENT" || (!hint && PERCENT.test(raw) && !RATIO.test(raw))) {
    const m = raw.match(PERCENT);
    if (!m?.[1]) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? { value: n, unit: "PERCENT" } : null;
  }
  const m = raw.match(RATIO) ?? raw.match(/\b([\d]+(?:\.\d+)?)\b/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? { value: n, unit: "RATIO" } : null;
}

function locator(
  documentId: string,
  documentRole: DocumentExtraction["identity"]["documentRole"],
  line: string,
  lineIndex: number,
  versionHash: string | null,
): SourceLocator {
  return {
    documentId,
    documentRole,
    versionHash,
    lineIndex,
    excerpt: line.slice(0, 280),
  };
}

function parseAdjustments(
  lines: string[],
  documentId: string,
  documentRole: DocumentExtraction["identity"]["documentRole"],
  versionHash: string | null,
): ExtractedAdjustment[] {
  const out: ExtractedAdjustment[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const addback = line.match(
      /\b(?:plus|add[- ]?back|addback)\s*[:\-]?\s*(.+?)(?:[:\-]\s*|\$|\s+)([\d,]+(?:\.\d+)?)?\s*(million|thousand|mm|m|k)?/i,
    );
    const exclusion = line.match(/\b(?:less|minus|exclude[ds]?|exclusion)\s*[:\-]?\s*(.+)/i);
    const footnote = line.match(/^\s*\(?\s*(?:note|fn|footnote)\s*[\d.]+\s*\)?\s*[:\-]?\s*(.+)/i);
    const proForma = line.match(/\bpro\s*forma\s+(?:adjustment|add[- ]?back)s?\b[:\-]?\s*(.+)/i);

    if (addback) {
      const amount = parseAmount(line);
      out.push({
        kind: "ADDBACK",
        label: (addback[1] ?? line).trim().slice(0, 160),
        amountMillions: amount ? (amount.unit === "USD_MILLIONS" ? amount.value : amount.value / 1_000) : null,
        amountMissing: amount == null,
        source: locator(documentId, documentRole, line, i, versionHash),
      });
      continue;
    }
    if (exclusion) {
      const amount = parseAmount(line);
      out.push({
        kind: "EXCLUSION",
        label: (exclusion[1] ?? line).trim().slice(0, 160),
        amountMillions: amount ? (amount.unit === "USD_MILLIONS" ? amount.value : amount.value / 1_000) : null,
        amountMissing: amount == null,
        source: locator(documentId, documentRole, line, i, versionHash),
      });
      continue;
    }
    if (proForma) {
      const amount = parseAmount(line);
      out.push({
        kind: "PRO_FORMA",
        label: (proForma[1] ?? line).trim().slice(0, 160),
        amountMillions: amount ? (amount.unit === "USD_MILLIONS" ? amount.value : amount.value / 1_000) : null,
        amountMissing: amount == null,
        source: locator(documentId, documentRole, line, i, versionHash),
      });
      continue;
    }
    if (footnote) {
      out.push({
        kind: "FOOTNOTE",
        label: (footnote[1] ?? line).trim().slice(0, 200),
        amountMillions: null,
        amountMissing: true,
        source: locator(documentId, documentRole, line, i, versionHash),
      });
    }
  }
  return out;
}

const DEFINITION_TERMS: Array<{ term: string; family: MetricFamily; pattern: RegExp }> = [
  { term: "Consolidated EBITDA", family: "CONTRACTUAL_EBITDA", pattern: /\b["']?Consolidated EBITDA["']?\s*(?:means|shall mean|:)/i },
  { term: "Consolidated Total Debt", family: "TOTAL_DEBT", pattern: /\b["']?Consolidated Total(?: Net)? Debt["']?\s*(?:means|shall mean|:)/i },
  { term: "Consolidated Interest Expense", family: "INTEREST_EXPENSE", pattern: /\b["']?Consolidated Interest Expense["']?\s*(?:means|shall mean|:)/i },
  { term: "Consolidated Fixed Charges", family: "FIXED_CHARGES", pattern: /\b["']?Consolidated Fixed Charges["']?\s*(?:means|shall mean|:)/i },
  { term: "Total Assets", family: "TOTAL_ASSETS", pattern: /\b["']?(?:Consolidated )?Total Assets["']?\s*(?:means|shall mean|:)/i },
  { term: "Unrestricted Cash", family: "CASH", pattern: /\b["']?Unrestricted Cash["']?\s*(?:means|shall mean|:)/i },
];

function parseDefinitions(
  text: string,
  documentId: string,
  documentRole: DocumentExtraction["identity"]["documentRole"],
  versionHash: string | null,
): ExtractedDefinitionRef[] {
  const out: ExtractedDefinitionRef[] = [];
  for (const def of DEFINITION_TERMS) {
    const m = text.match(def.pattern);
    if (!m) continue;
    const start = m.index ?? 0;
    out.push({
      term: def.term,
      family: def.family,
      excerpt: text.slice(start, start + 400).replace(/\s+/g, " ").trim(),
      source: {
        documentId,
        documentRole,
        versionHash,
        excerpt: text.slice(start, start + 200).replace(/\s+/g, " ").trim(),
        section: "Definitions",
      },
    });
  }
  return out;
}

function matchMetricPattern(line: string, documentRole: DocumentExtraction["identity"]["documentRole"]): MetricPattern | null {
  for (const p of METRIC_PATTERNS) {
    if (!p.pattern.test(line)) continue;

    if (p.family === "GAAP_EBITDA") return p;

    if (p.family === "CONTRACTUAL_EBITDA") {
      // Never treat an explicit GAAP/reported line as contractual.
      if (/\bgaap\b|\breported\s+ebitda\b/i.test(line)) continue;

      const hasContractualQualifier = /\b(consolidated|covenant)\s+ebitda\b/i.test(line);
      const isAdjustedOnly = /\badjusted\s+ebitda\b/i.test(line) && !hasContractualQualifier;
      const isBare = /^\s*ebitda\b/i.test(line) && !/\b(gaap|covenant|consolidated|adjusted)\b/i.test(line);

      if (isAdjustedOnly && documentRole === "FINANCIAL_STATEMENT") {
        return {
          ...p,
          family: "GAAP_EBITDA",
          isContractual: false,
          capacityMetricName: null,
          contractualName: null,
        };
      }

      if (isBare) {
        const family = bareEbitdaFamily(documentRole);
        return {
          ...p,
          family,
          isContractual: family === "CONTRACTUAL_EBITDA",
          capacityMetricName: family === "CONTRACTUAL_EBITDA" ? "covenant_ebitda" : null,
          contractualName: family === "CONTRACTUAL_EBITDA" ? "Consolidated EBITDA" : null,
        };
      }

      // Bare-ish "EBITDA" mid-line on a financial statement without contractual qualifier → GAAP.
      if (
        documentRole === "FINANCIAL_STATEMENT" &&
        !hasContractualQualifier &&
        !/\badjusted\s+ebitda\b/i.test(line)
      ) {
        return {
          ...p,
          family: "GAAP_EBITDA",
          isContractual: false,
          capacityMetricName: null,
          contractualName: null,
        };
      }

      return p;
    }

    return p;
  }
  return null;
}

function tryNormalize(
  metricName: string | null,
  value: number,
  unit: FinancialUnit,
): { canonicalValue: number; canonicalUnit: FinancialUnit } | null {
  if (!metricName) {
    // Non-capacity metrics: convert dollars to millions when possible; leave ratios as-is.
    if (unit === "USD") return { canonicalValue: value / 1_000_000, canonicalUnit: "USD_MILLIONS" };
    if (unit === "USD_THOUSANDS") return { canonicalValue: value / 1_000, canonicalUnit: "USD_MILLIONS" };
    return { canonicalValue: value, canonicalUnit: unit };
  }
  try {
    const n = normalizeFinancialValue(metricName, value, unit);
    return { canonicalValue: n.normalizedValue, canonicalUnit: n.canonicalUnit };
  } catch {
    return null;
  }
}

export interface ExtractDocumentParams extends IdentifyDocumentParams {}

export function extractFromDocumentText(params: ExtractDocumentParams): DocumentExtraction {
  const identity = identifyDocument(params);
  const lines = params.text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const asOfDate = identity.fiscalDate;
  const metrics: ExtractedMetric[] = [];
  const found = new Map<MetricFamily, ExtractedMetric[]>();

  if (!asOfDate) {
    return {
      identity,
      metrics: [],
      adjustments: parseAdjustments(lines, identity.documentId, identity.documentRole, identity.versionHash),
      definitions: parseDefinitions(params.text, identity.documentId, identity.documentRole, identity.versionHash),
      certificateCalculations: [],
      basketSchedulePresent: /\bbasket\s+usage\b|\bschedule\s+of\s+(?:usage|utilization)\b/i.test(params.text),
      missingSchedules: [],
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const pattern = matchMetricPattern(line, identity.documentRole);
    if (!pattern) continue;

    const parsed =
      pattern.unitHint === "RATIO" || pattern.unitHint === "PERCENT"
        ? parseRatioOrPercent(line, pattern.unitHint)
        : parseAmount(line);
    if (!parsed) continue;

    const norm = tryNormalize(pattern.capacityMetricName, parsed.value, parsed.unit);
    if (!norm) continue;

    const metric: ExtractedMetric = {
      family: pattern.family,
      contractualName: pattern.contractualName,
      capacityMetricName: pattern.capacityMetricName,
      value: parsed.value,
      unit: parsed.unit,
      canonicalValue: norm.canonicalValue,
      canonicalUnit: norm.canonicalUnit,
      asOfDate,
      reportingPeriod: identity.reportingPeriod,
      isContractual: pattern.isContractual,
      source: locator(identity.documentId, identity.documentRole, line, i, identity.versionHash),
    };
    const list = found.get(pattern.family) ?? [];
    list.push(metric);
    found.set(pattern.family, list);
  }

  for (const [family, rows] of found) {
    const unique = [...new Set(rows.map((r) => r.canonicalValue))];
    if (unique.length !== 1) continue; // conflict — skip, never pick a winner silently
    metrics.push(rows[0]!);
    void family;
  }

  const adjustments = parseAdjustments(lines, identity.documentId, identity.documentRole, identity.versionHash);
  const definitions = parseDefinitions(params.text, identity.documentId, identity.documentRole, identity.versionHash);

  const certificateCalculations: CertificateCalculation[] = [];
  if (
    identity.documentRole === "COMPLIANCE_CERTIFICATE" ||
    identity.documentRole === "OFFICER_CERTIFICATE"
  ) {
    for (const m of metrics) {
      if (!m.isContractual) continue;
      const related = adjustments.filter(
        (a) =>
          a.source.lineIndex != null &&
          m.source.lineIndex != null &&
          Math.abs(a.source.lineIndex - m.source.lineIndex) <= 8,
      );
      certificateCalculations.push({
        name: m.contractualName ?? m.family,
        family: m.family,
        reportedValue: m.canonicalValue,
        unit: m.canonicalUnit,
        components: related,
        source: m.source,
        asOfDate: m.asOfDate,
      });
    }
  }

  const basketSchedulePresent = /\bbasket\s+usage\b|\bschedule\s+of\s+(?:usage|utilization)\b/i.test(params.text);
  const missingSchedules: string[] = [];
  if (
    (identity.documentRole === "COMPLIANCE_CERTIFICATE" || identity.documentRole === "OFFICER_CERTIFICATE") &&
    !basketSchedulePresent &&
    /\bbasket\b/i.test(params.text)
  ) {
    missingSchedules.push("basket_usage_schedule");
  }

  return {
    identity,
    metrics,
    adjustments,
    definitions,
    certificateCalculations,
    basketSchedulePresent,
    missingSchedules,
  };
}
