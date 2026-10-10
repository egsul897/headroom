/**
 * Propose FINANCIAL_FACT candidates from an uploaded compliance certificate
 * or financial statement. Reuses FinancialFactValueSchema + normalizeFinancialValue
 * (same path as CSV connector). Never invents missing values or units.
 *
 * Delegates identity + metric extraction to lib/financial-certificate-engine
 * so GAAP vs contractual EBITDA stay distinct. Counsel must approve before
 * promotion into FinancialState; extraction never auto-approves.
 */

import { prisma } from "@/lib/prisma";
import { FinancialFactValueSchema } from "@/lib/extraction/schemas";
import { extractFromDocumentText } from "@/lib/financial-certificate-engine/extract";
import type { FinancialUnit } from "@/lib/connectors/units";

export interface ProposedFinancialFact {
  metricName: string;
  value: number;
  asOfDate: string;
  canonicalUnit: FinancialUnit;
  originalValue: number;
  originalUnit: FinancialUnit;
  excerpt: string;
  chunkId: string | null;
  withinSanityBounds: boolean;
  sanityNote?: string;
}

/**
 * Deterministic parse of uploaded certificate/statement text.
 * Ambiguous or unit-less amounts are skipped, never invented.
 * GAAP EBITDA proposes as gaap_ebitda (not capacity-bound).
 * Contractual EBITDA proposes as covenant_ebitda.
 */
export function parseFinancialFactsFromText(text: string, chunkId: string | null = null): ProposedFinancialFact[] {
  const extraction = extractFromDocumentText({
    documentId: "inline",
    text,
    declaredType: null,
  });
  if (!extraction.identity.fiscalDate) return [];

  const out: ProposedFinancialFact[] = [];
  for (const m of extraction.metrics) {
    let metricName: string | null = m.capacityMetricName;
    if (m.family === "GAAP_EBITDA") metricName = "gaap_ebitda";
    if (!metricName) continue;
    // Ratios / non-capacity families other than gaap are skipped for FINANCIAL_FACT
    // candidates (they flow through the certificate engine / NS-4 path instead).
    if (
      metricName !== "gaap_ebitda" &&
      metricName !== "covenant_ebitda" &&
      metricName !== "total_debt" &&
      metricName !== "secured_debt" &&
      metricName !== "cash" &&
      metricName !== "interest_expense" &&
      metricName !== "cumulative_net_income" &&
      metricName !== "equity_proceeds" &&
      metricName !== "assumed_new_debt_rate_pct"
    ) {
      continue;
    }

    out.push({
      metricName,
      value: m.canonicalValue,
      asOfDate: m.asOfDate,
      canonicalUnit: m.canonicalUnit,
      originalValue: m.value,
      originalUnit: m.unit,
      excerpt: m.source.excerpt.slice(0, 280),
      chunkId,
      withinSanityBounds: true,
    });
  }

  // Assumed rate: engine may not classify PERCENT lines under capacityMetricName
  // when pattern matches — extractFromDocumentText handles assumed_new_debt_rate
  // only if we add it. Keep a narrow fallback for the existing certificate test.
  if (!out.some((o) => o.metricName === "assumed_new_debt_rate_pct")) {
    const rateLine = text.split(/\n|;/).find((l) => /\bassumed\s+new[- ]debt\s+rate\b|\bassumed\s+coupon\b/i.test(l));
    const pct = rateLine?.match(/\b([\d]+(?:\.\d+)?)\s*%/);
    const asOf = extraction.identity.fiscalDate;
    if (rateLine && pct?.[1] && asOf) {
      const n = Number(pct[1]);
      if (Number.isFinite(n)) {
        out.push({
          metricName: "assumed_new_debt_rate_pct",
          value: n,
          asOfDate: asOf,
          canonicalUnit: "PERCENT",
          originalValue: n,
          originalUnit: "PERCENT",
          excerpt: rateLine.slice(0, 280),
          chunkId,
          withinSanityBounds: true,
        });
      }
    }
  }

  return out;
}

export async function proposeFinancialFactsFromDocument(companyId: string, documentId: string): Promise<number> {
  const document = await prisma.document.findFirst({ where: { id: documentId, companyId } });
  if (!document) return 0;

  const chunks = await prisma.documentChunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" },
    select: { id: true, text: true },
  });
  const fullText = chunks.map((c) => c.text).join("\n");
  const proposals = parseFinancialFactsFromText(fullText, chunks[0]?.id ?? null);
  if (proposals.length === 0) return 0;

  const run = await prisma.extractionRun.findFirst({
    where: { documentId },
    orderBy: { startedAt: "desc" },
    include: { stages: true },
  });
  if (!run) return 0;
  const stage = run.stages.find((s) => s.stage === "FINANCIAL_INPUTS");
  if (!stage) return 0;

  const existing = await prisma.extractionCandidate.findMany({
    where: { companyId, kind: "FINANCIAL_FACT", sourceDocumentId: documentId },
    select: { proposedValue: true },
  });
  const already = new Set(
    existing.map((c) => {
      const v = c.proposedValue as { metricName?: string; asOfDate?: string };
      return `${v.metricName}:${v.asOfDate}`;
    }),
  );

  let created = 0;
  for (const proposal of proposals) {
    const key = `${proposal.metricName}:${proposal.asOfDate}`;
    if (already.has(key)) continue;
    const candidateValue = {
      metricName: proposal.metricName,
      value: proposal.value,
      asOfDate: proposal.asOfDate,
      canonicalUnit: proposal.canonicalUnit,
      originalValue: proposal.originalValue,
      originalUnit: proposal.originalUnit,
      sourceRecordRef: documentId,
    };
    const validated = FinancialFactValueSchema.safeParse(candidateValue);
    if (!validated.success) continue;
    await prisma.extractionCandidate.create({
      data: {
        extractionRunId: run.id,
        extractionStageId: stage.id,
        companyId,
        kind: "FINANCIAL_FACT",
        sourceDocumentId: documentId,
        sourceChunkIds: proposal.chunkId ? [proposal.chunkId] : [],
        sourceExcerpt: proposal.excerpt,
        proposedValue: validated.data,
        reviewStatus: proposal.withinSanityBounds ? "PENDING" : "REVIEW_REQUIRED",
        rationale:
          proposal.metricName === "gaap_ebitda"
            ? "GAAP/reported EBITDA — not a substitute for contractual EBITDA. Confirm against the source; do not promote as capacity ebitda."
            : (proposal.sanityNote ??
              "Proposed from uploaded financial document. Confirm against the source before promoting."),
      },
    });
    already.add(key);
    created += 1;
  }
  return created;
}
