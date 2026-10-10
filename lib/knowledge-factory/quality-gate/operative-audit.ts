/**
 * Operative-document resolution audit (read-only).
 * Uses existing resolveOperativePrecedence; never infers from similarity alone.
 * Gold expectations are independently stated (not copied from engine output).
 */

import { prisma } from "../../prisma";
import type { KnowledgeSourceRecord } from "../types";
import { analyzeAmendmentPackage } from "../../product/customer-intelligence/amendment-package";
import { resolveOperativePrecedence } from "../../product/customer-intelligence/operative-resolution";
import { discoverDocumentRelationships } from "../relationships/discover";
import type { AmendmentCompareView } from "../../product/customer-intelligence/amendment-compare";

export interface OperativeGoldCase {
  caseId: string;
  ticker: string;
  asOfDate: string;
  /** Independently stated expected status — fail-closed preferred when ambiguous. */
  expectedStatus:
    | "RESOLVED"
    | "RESOLVED_PARTIAL"
    | "UNRESOLVED_PRECEDENCE"
    | "SINGLE_DOCUMENT"
    | "NO_DOCUMENTS";
  /** When expected RESOLVED*, optional substring that operative title should match. */
  expectedOperativeTitleIncludes?: string[];
  /** Must NOT select solely because it is the chronologically latest filing. */
  forbidLatestFilingHeuristicAlone: true;
  rationale: string;
}

export interface OperativeCaseResult {
  caseId: string;
  ticker: string;
  asOfDate: string;
  docsConsidered: number;
  engineStatus: string;
  engineOperativeSourceId: string | null;
  engineOperativeTitle: string | null;
  expectedStatus: string;
  statusMatch: boolean;
  titleMatch: boolean | null;
  unresolvedReasons: string[];
  note: string;
  pass: boolean;
}

const emptyCompare = (): AmendmentCompareView => ({
  operativeResolution: "UNRESOLVED_PRECEDENCE",
  rows: [],
  unresolvedReasons: [
    "Quality-gate audit did not run full text compare — section bindings intentionally unavailable.",
  ],
  note: "Compare stub for operative status / document selection audit — not a certification of operative language.",
});

function toRecord(row: {
  sourceId: string;
  issuerCik: string;
  issuerTicker: string | null;
  issuerName: string | null;
  accessionNumber: string;
  exhibitFilename: string;
  sourceUrl: string;
  filingDate: Date;
  formType: string;
  documentTitle: string;
  documentClass: string;
  instrumentIdentity: string | null;
  originalBytesHash: string;
  acquisitionTimestamp: Date;
  parserVersion: string;
  extractionStatus: string;
  representationLevel: string;
  provenance: string;
  usageRightsReviewStatus: string;
}): KnowledgeSourceRecord {
  return {
    sourceId: row.sourceId,
    issuerCik: row.issuerCik,
    issuerTicker: row.issuerTicker ?? undefined,
    issuerName: row.issuerName ?? undefined,
    accessionNumber: row.accessionNumber,
    exhibitFilename: row.exhibitFilename,
    sourceUrl: row.sourceUrl,
    filingDate: row.filingDate.toISOString().slice(0, 10),
    formType: row.formType,
    documentTitle: row.documentTitle,
    documentClass: row.documentClass as KnowledgeSourceRecord["documentClass"],
    instrumentIdentity: row.instrumentIdentity ?? undefined,
    originalBytesHash: row.originalBytesHash,
    acquisitionTimestamp: row.acquisitionTimestamp.toISOString(),
    parserVersion: row.parserVersion,
    extractionStatus: row.extractionStatus as KnowledgeSourceRecord["extractionStatus"],
    representationLevel: row.representationLevel as KnowledgeSourceRecord["representationLevel"],
    provenance: row.provenance,
    usageRightsReviewStatus: row.usageRightsReviewStatus as KnowledgeSourceRecord["usageRightsReviewStatus"],
  };
}

/**
 * Independent gold cases. Expectations prefer UNRESOLVED when package identity
 * is ambiguous — we must not reward filing-order heuristics.
 */
export const OPERATIVE_GOLD_CASES: OperativeGoldCase[] = [
  {
    caseId: "gpk-multi-amendment-ambiguous",
    ticker: "GPK",
    asOfDate: "2024-06-01",
    expectedStatus: "UNRESOLVED_PRECEDENCE",
    forbidLatestFilingHeuristicAlone: true,
    rationale:
      "Graphic Packaging has multiple credit amendments without a single proven restatement supersession or section-diff compare in this audit stub — fail closed.",
  },
  {
    caseId: "wynn-indenture-family",
    ticker: "WYNN",
    asOfDate: "2025-12-01",
    expectedStatus: "UNRESOLVED_PRECEDENCE",
    forbidLatestFilingHeuristicAlone: true,
    rationale:
      "Multiple indenture exhibits without authenticated supplemental→base binding evidence in compare stub — fail closed rather than pick latest filing.",
  },
  {
    caseId: "son-credit-restatement-candidate",
    ticker: "SON",
    asOfDate: "2025-01-01",
    // If exactly one base + one clear restatement, engine may RESOLVE; otherwise UNRESOLVED is acceptable.
    expectedStatus: "UNRESOLVED_PRECEDENCE",
    expectedOperativeTitleIncludes: ["credit"],
    forbidLatestFilingHeuristicAlone: true,
    rationale:
      "Sonoco credit package: without authenticated effective-date restatement evidence, prefer unresolved; title match only if resolved.",
  },
  {
    caseId: "luv-revolving-amendment",
    ticker: "LUV",
    asOfDate: "2021-06-01",
    expectedStatus: "UNRESOLVED_PRECEDENCE",
    forbidLatestFilingHeuristicAlone: true,
    rationale:
      "Southwest revolving credit + amendment present, but quality-gate compare is stubbed — cannot claim section-level operative binding.",
  },
  {
    caseId: "hlt-supplemental-indentures",
    ticker: "HLT",
    asOfDate: "2025-01-01",
    expectedStatus: "UNRESOLVED_PRECEDENCE",
    forbidLatestFilingHeuristicAlone: true,
    rationale:
      "Hilton supplemental indentures require authenticated parent indenture linkage — title similarity alone insufficient.",
  },
];

export async function runOperativeAudit(params?: {
  cases?: OperativeGoldCase[];
}): Promise<{
  schema: "kf-operative-audit.v1";
  generatedAt: string;
  readOnly: true;
  cases: OperativeCaseResult[];
  passRate: number;
  productionSafety: string[];
}> {
  const cases = params?.cases ?? OPERATIVE_GOLD_CASES;
  const results: OperativeCaseResult[] = [];
  const safety: string[] = [
    "Operative audit uses stubbed AmendmentCompareView — section bindings are not certified.",
    "Fail-closed expectations dominate: similarity/filing-order alone must not invent RESOLVED.",
  ];

  for (const gold of cases) {
    const rows = await prisma.knowledgeSource.findMany({
      where: {
        issuerTicker: gold.ticker,
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      },
      orderBy: { filingDate: "asc" },
    });
    const sources = rows.map(toRecord);
    const rels = discoverDocumentRelationships(sources);
    const pkg = analyzeAmendmentPackage({
      companyId: `kf-audit-${gold.ticker}`,
      sources,
      relationships: rels,
    });
    const compare = emptyCompare();
    compare.operativeResolution = pkg.operativeResolution;
    const resolution = resolveOperativePrecedence({
      sources,
      amendmentPackage: pkg,
      compare,
      asOfDate: gold.asOfDate,
    });

    const operative = sources.find((s) => s.sourceId === resolution.operativeDocumentSourceId);
    const statusMatch = resolution.status === gold.expectedStatus;
    // Also accept RESOLVED_PARTIAL when we expected UNRESOLVED only if engine still left operative null — but we want fail-closed
    let titleMatch: boolean | null = null;
    if (gold.expectedOperativeTitleIncludes?.length && operative) {
      const hay = (operative.documentTitle || "").toLowerCase();
      titleMatch = gold.expectedOperativeTitleIncludes.every((t) => hay.includes(t.toLowerCase()));
    }

    // Production safety: if engine RESOLVED with only filing-date evidence and we expected UNRESOLVED, fail
    let pass = statusMatch;
    if (
      gold.expectedStatus === "UNRESOLVED_PRECEDENCE" &&
      (resolution.status === "RESOLVED" || resolution.status === "RESOLVED_PARTIAL") &&
      resolution.bindings.length === 0 &&
      !resolution.note.toLowerCase().includes("restatement")
    ) {
      pass = false;
      safety.push(
        `${gold.caseId}: engine returned ${resolution.status} without section bindings or restatement supersession — looks like weak heuristic`,
      );
    }
    // If expected UNRESOLVED and engine correctly UNRESOLVED → pass
    if (gold.expectedStatus === "UNRESOLVED_PRECEDENCE" && resolution.status === "UNRESOLVED_PRECEDENCE") {
      pass = true;
    }
    // Soft: if engine RESOLVED via explicit restatement path and title matches, allow pass with note
    if (
      gold.expectedStatus === "UNRESOLVED_PRECEDENCE" &&
      resolution.status === "RESOLVED" &&
      /restatement|superseded/i.test(resolution.note) &&
      titleMatch !== false
    ) {
      pass = true;
      safety.push(
        `${gold.caseId}: accepted RESOLVED via restatement supersession path (still DISCOVERED authority only)`,
      );
    }

    results.push({
      caseId: gold.caseId,
      ticker: gold.ticker,
      asOfDate: gold.asOfDate,
      docsConsidered: sources.length,
      engineStatus: resolution.status,
      engineOperativeSourceId: resolution.operativeDocumentSourceId,
      engineOperativeTitle: operative?.documentTitle ?? null,
      expectedStatus: gold.expectedStatus,
      statusMatch,
      titleMatch,
      unresolvedReasons: resolution.unresolvedReasons,
      note: resolution.note,
      pass,
    });
  }

  const passRate = results.length ? results.filter((r) => r.pass).length / results.length : 0;
  return {
    schema: "kf-operative-audit.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    cases: results,
    passRate,
    productionSafety: [...new Set(safety)],
  };
}
