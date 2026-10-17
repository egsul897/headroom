/**
 * Pure builder: CovenantOverview-shaped engine output ⇒ ComplianceReport.
 * Structural input type so the builder is testable without Prisma.
 */
import { REPORT_DISCLAIMER, type CertificateRow, type ComplianceReport, type FigureProof, type LineStatus, type ReportLine, type SourceRef } from "./types";

export interface OverviewCapacityRowLike {
  kind: "CAPACITY";
  stableKey: string;
  name: string;
  documentName: string;
  sectionRef: string;
  formulaDisplay: string | null;
  currentCapacity: number | null;
  capacityUnlimited: boolean;
  used: number | null;
  remaining: number | null;
  publicationLabel?: string;
  bindingState: string;
  status: string;
  reviewState: string;
  reason?: string;
}

export interface OverviewRatioRowLike {
  kind: "RATIO";
  stableKey: string;
  name: string;
  documentName: string;
  sectionRef: string;
  currentRatio: number | null;
  ratioLimit: number;
  ratioHeadroom: number | null;
  comparisonDirection: "at_or_below" | "at_or_above";
  bindingState: string;
  status: string;
  reviewState: string;
  reason?: string;
}

export interface OverviewLike {
  company: { id: string; name: string | null } | null;
  asOfDate: Date;
  warnings: { category: string; description: string }[];
  covenantFamilies: { family: string; rows: (OverviewCapacityRowLike | OverviewRatioRowLike)[] }[];
}

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

function docRef(documentName: string, sectionRef: string): SourceRef | null {
  if (!documentName?.trim() || !sectionRef?.trim()) return null;
  return { kind: "DOCUMENT", documentName, sectionRef };
}

function proofFor(formula: string | null, citation: SourceRef | null): FigureProof {
  return {
    formula,
    citation,
    steps: "NEEDS_INPUT",
    inputs: "NEEDS_INPUT",
    note: "Step-by-step arithmetic and per-input source locators are not exposed by the current engine output.",
  };
}

/** Row status from the engine's own status. MODELED + a sourced value ⇒ COMPUTED. */
function lineStatus(engineStatus: string, value: number | null, unlimited: boolean, cited: boolean): LineStatus {
  if (engineStatus === "UNMODELED") return "UNMODELED";
  if (engineStatus === "MODELED" && cited && (finite(value) || unlimited)) return "COMPUTED";
  if (engineStatus === "NOT_TESTED") return "NOT_DETERMINABLE";
  return finite(value) || unlimited ? "NOT_DETERMINABLE" : "NEEDS_INPUT";
}

export function buildComplianceReport(
  companyId: string,
  overview: OverviewLike,
  opts: { now?: Date } = {},
): ComplianceReport {
  const lines: ReportLine[] = [];
  const certificate: CertificateRow[] = [];

  for (const fam of overview.covenantFamilies) {
    for (const row of fam.rows) {
      const cite = docRef(row.documentName, row.sectionRef);
      if (row.kind === "CAPACITY") {
        const modeled = row.status === "MODELED";
        const base = {
          section: fam.family,
          documentName: row.documentName || null,
          sectionRef: row.sectionRef || null,
          unit: "USD" as const,
          reviewState: row.reviewState ?? null,
          source: cite,
          proof: proofFor(modeled ? row.formulaDisplay : null, cite),
        };
        const gStatus = lineStatus(row.status, row.currentCapacity, row.capacityUnlimited, cite !== null);
        lines.push({
          ...base,
          key: `${row.stableKey}:capacity`,
          label: `${row.name} — contractual capacity`,
          value: gStatus === "COMPUTED" && !row.capacityUnlimited ? row.currentCapacity : null,
          unlimited: gStatus === "COMPUTED" && row.capacityUnlimited ? true : undefined,
          status: gStatus,
          engineState: row.bindingState,
          reason: gStatus === "COMPUTED" ? null : (row.reason ?? (cite ? "Capacity not computed by the engine." : "No governing section citation.")),
        });
        // Remaining is only a figure when the engine publishes SUPPORTED_REMAINING.
        const supported = row.publicationLabel === "SUPPORTED_REMAINING" && finite(row.remaining) && gStatus === "COMPUTED";
        lines.push({
          ...base,
          key: `${row.stableKey}:remaining`,
          label: `${row.name} — remaining after known usage`,
          value: supported ? row.remaining : null,
          status: supported ? "COMPUTED" : row.status === "UNMODELED" ? "UNMODELED" : "NEEDS_INPUT",
          engineState: row.publicationLabel ?? "NOT_TRACKED",
          reason: supported ? null : "Usage against this basket is not fully evidenced; remaining needs usage input.",
        });
      } else {
        const actualOk = row.status === "MODELED" && finite(row.currentRatio) && cite !== null;
        const status: LineStatus = actualOk ? "COMPUTED" : row.status === "UNMODELED" ? "UNMODELED" : finite(row.currentRatio) ? "NOT_DETERMINABLE" : "NEEDS_INPUT";
        lines.push({
          section: fam.family,
          key: `${row.stableKey}:actual`,
          label: `${row.name} — actual ratio`,
          documentName: row.documentName || null,
          sectionRef: row.sectionRef || null,
          value: actualOk ? row.currentRatio : null,
          unit: "x",
          status,
          engineState: row.bindingState,
          reviewState: row.reviewState ?? null,
          source: cite,
          reason: actualOk ? null : (row.reason ?? "Ratio inputs not available."),
          proof: proofFor(null, cite),
        });
        if (cite && finite(row.ratioLimit)) {
          const actual = actualOk ? row.currentRatio : null;
          let result: CertificateRow["result"] = "NOT_DETERMINABLE";
          if (actual !== null) {
            const pass = row.comparisonDirection === "at_or_below" ? actual <= row.ratioLimit : actual >= row.ratioLimit;
            result = pass ? "IN_COMPLIANCE" : "NOT_IN_COMPLIANCE";
          }
          certificate.push({
            key: row.stableKey,
            covenant: row.name,
            documentName: row.documentName,
            sectionRef: row.sectionRef,
            comparison: row.comparisonDirection,
            required: row.ratioLimit,
            actual,
            headroom: actual !== null && finite(row.ratioHeadroom) ? row.ratioHeadroom : null,
            result,
            status,
            reviewState: row.reviewState,
            citation: cite,
            reason: actual === null ? (row.reason ?? "Actual ratio not computed.") : null,
          });
        }
      }
    }
  }

  const counts = {
    computed: lines.filter((l) => l.status === "COMPUTED").length,
    needsInput: lines.filter((l) => l.status === "NEEDS_INPUT").length,
    notDeterminable: lines.filter((l) => l.status === "NOT_DETERMINABLE").length,
    unmodeled: lines.filter((l) => l.status === "UNMODELED").length,
  };
  return {
    reportVersion: 1,
    companyId,
    companyName: overview.company?.name ?? null,
    asOfDate: overview.asOfDate.toISOString().slice(0, 10),
    generatedAt: (opts.now ?? new Date()).toISOString(),
    status: "OK",
    blocker: null,
    authority: "SYSTEM_COMPUTED_NOT_COUNSEL_VERIFIED",
    disclaimer: REPORT_DISCLAIMER,
    lines,
    certificate,
    counts,
    warnings: overview.warnings.map((w) => `${w.category}: ${w.description}`),
  };
}

/** Whole-report fail-closed shape (e.g. no financial state on file). */
export function notDeterminableReport(companyId: string, blocker: string, opts: { now?: Date } = {}): ComplianceReport {
  return {
    reportVersion: 1,
    companyId,
    companyName: null,
    asOfDate: null,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    status: "NOT_DETERMINABLE",
    blocker,
    authority: "SYSTEM_COMPUTED_NOT_COUNSEL_VERIFIED",
    disclaimer: REPORT_DISCLAIMER,
    lines: [],
    certificate: [],
    counts: { computed: 0, needsInput: 0, notDeterminable: 0, unmodeled: 0 },
    warnings: [],
  };
}
