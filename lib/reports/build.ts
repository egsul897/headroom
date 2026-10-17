/**
 * Pure builder: CovenantOverview-shaped engine output ⇒ ComplianceReport.
 * Structural input type so the builder is testable without Prisma.
 */
import { NOT_FLAGGED_REASON, REPORT_DISCLAIMER, type CertificateRow, type ComplianceReport, type FigureProof, type LineStatus, type ReportLine, type SourceRef } from "./types";
import type { CertificateModel, ProofInput } from "./ux-contract";

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
  /**
   * Engine-supplied classification, read verbatim. Not on the overview RatioRow today,
   * so every row is NOT_FLAGGED and the certificate fails closed. Never inferred by name.
   */
  testKind?: "MAINTENANCE" | "INCURRENCE";
  /** Engine-supplied compliance verdict for a maintenance covenant at the as-of date. */
  complianceVerdict?: "IN_COMPLIANCE" | "NOT_IN_COMPLIANCE";
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

export const citeText = (c: SourceRef | null): string | null =>
  c ? (c.kind === "DOCUMENT" ? `${c.documentName} ${c.sectionRef}`.trim() : (c.engine ?? null)) : null;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const ratioText = (n: number) => `${n.toFixed(2)}x`;
export const limitText = (limit: number, dir: "at_or_below" | "at_or_above") => `${ratioText(limit)} ${dir === "at_or_above" ? "min" : "max"}`;
const ENGINE = "Headroom covenant engine (covenant overview)";

/**
 * PR 414 FigureProof from what the engine row already carries. Inputs the engine
 * does not expose per figure (numerator/denominator, usage evidence) are listed
 * with value null so `missingInputLabels` reports them; nothing is reconstructed.
 * clause text and page are not on engine rows today ⇒ null. review = engine reviewState verbatim.
 */
function proofFor(figure: string, shown: string | null, inputs: ProofInput[], review: string | null): FigureProof {
  return { figure, value: shown, inputs, clause: null, page: null, review: review ?? null };
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
          formula: modeled ? row.formulaDisplay : null,
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
          proof: proofFor(
            `${row.name} — contractual capacity`,
            gStatus === "COMPUTED" ? (row.capacityUnlimited ? "Unlimited" : usd(row.currentCapacity!)) : null,
            [
              { label: "Capacity formula", value: modeled ? row.formulaDisplay : null, source: citeText(cite) },
              { label: "Maximum capacity", value: gStatus === "COMPUTED" ? (row.capacityUnlimited ? "Unlimited" : usd(row.currentCapacity!)) : null, source: gStatus === "COMPUTED" ? ENGINE : null },
            ],
            row.reviewState,
          ),
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
          proof: proofFor(
            `${row.name} — remaining after known usage`,
            supported ? usd(row.remaining!) : null,
            [
              { label: "Maximum capacity", value: gStatus === "COMPUTED" && !row.capacityUnlimited ? usd(row.currentCapacity!) : null, source: gStatus === "COMPUTED" ? ENGINE : null },
              { label: "Amount used", value: supported && finite(row.used) ? usd(row.used) : null, source: supported ? ENGINE : null },
            ],
            row.reviewState,
          ),
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
          formula: null,
          proof: proofFor(
            `${row.name} — actual ratio`,
            actualOk ? ratioText(row.currentRatio!) : null,
            [
              { label: "Numerator", value: null, source: null },
              { label: "Denominator", value: null, source: null },
              { label: "Covenant limit", value: finite(row.ratioLimit) && cite ? limitText(row.ratioLimit, row.comparisonDirection) : null, source: citeText(cite) },
            ],
            row.reviewState,
          ),
        });
        if (cite && finite(row.ratioLimit) && row.testKind !== "INCURRENCE") {
          const maintenance = row.testKind === "MAINTENANCE";
          const actual = maintenance && actualOk ? row.currentRatio : null;
          const verdict = maintenance && actualOk ? row.complianceVerdict : undefined;
          certificate.push({
            key: row.stableKey,
            covenant: row.name,
            documentName: row.documentName,
            sectionRef: row.sectionRef,
            testKind: maintenance ? "MAINTENANCE" : "NOT_FLAGGED",
            comparison: row.comparisonDirection,
            required: maintenance ? row.ratioLimit : null,
            actual,
            headroom: actual !== null && finite(row.ratioHeadroom) ? row.ratioHeadroom : null,
            result: verdict ?? "NOT_EVALUATED",
            status,
            reviewState: row.reviewState,
            citation: cite,
            reason: !maintenance
              ? NOT_FLAGGED_REASON
              : actual === null
                ? (row.reason ?? "Actual ratio not computed.")
                : verdict
                  ? null
                  : "Not evaluated: the engine supplied no compliance verdict for this covenant.",
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

/**
 * PR 414 CertificateModel. evaluated is PASS/FAIL only from the engine's own verdict on a
 * row the engine flags as a maintenance covenant; otherwise null ⇒ NOT EVALUATED.
 * period = the engine's as-of date (test date), never a guessed fiscal period.
 */
export function toCertificateModel(r: ComplianceReport): CertificateModel {
  return {
    company: r.companyName ?? r.companyId,
    period: r.asOfDate,
    lines: r.certificate.map((c) => ({
      name: c.covenant,
      required: c.required === null ? null : limitText(c.required, c.comparison),
      actual: c.actual === null ? null : ratioText(c.actual),
      headroom: c.headroom === null ? null : ratioText(c.headroom),
      evaluated: c.result === "IN_COMPLIANCE" ? "PASS" : c.result === "NOT_IN_COMPLIANCE" ? "FAIL" : null,
      citation: citeText(c.citation),
    })),
  };
}
