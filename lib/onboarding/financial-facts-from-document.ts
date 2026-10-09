/**
 * Propose FINANCIAL_FACT candidates from an uploaded compliance certificate
 * or financial statement. Reuses FinancialFactValueSchema + normalizeFinancialValue
 * (same path as CSV connector). Never invents missing values or units.
 *
 * Called after document extraction so facts land in the same review queue as
 * covenant candidates. Counsel must approve before promotion into FinancialState.
 */

import { prisma } from "@/lib/prisma";
import { FinancialFactValueSchema } from "@/lib/extraction/schemas";
import { normalizeFinancialValue, type FinancialUnit } from "@/lib/connectors/units";

const METRIC_LABELS: { metricName: string; pattern: RegExp }[] = [
  { metricName: "covenant_ebitda", pattern: /\b(?:consolidated\s+)?(?:adjusted\s+)?(?:covenant\s+)?ebitda\b/i },
  { metricName: "total_debt", pattern: /\b(?:consolidated\s+)?total(?:\s+net)?\s+debt\b|\btotal\s+indebtedness\b/i },
  { metricName: "secured_debt", pattern: /\b(?:senior\s+)?secured\s+debt\b|\bsecured\s+indebtedness\b/i },
  { metricName: "cash", pattern: /\b(?:unrestricted\s+)?cash\b|\bcash\s+and\s+cash\s+equivalents\b/i },
  { metricName: "interest_expense", pattern: /\binterest\s+expense\b/i },
  { metricName: "cumulative_net_income", pattern: /\bcumulative\s+net\s+income\b|\bconsolidated\s+net\s+income\b/i },
  { metricName: "equity_proceeds", pattern: /\bequity\s+proceeds\b/i },
  // Required by upsertFinancialFactsForDate's 8-field batch; certificates often state a modeling rate.
  { metricName: "assumed_new_debt_rate_pct", pattern: /\bassumed\s+new[- ]debt\s+rate\b|\bassumed\s+coupon\b|\bassumed\s+new\s+debt\s+rate\b/i },
];

const AMOUNT =
  /\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|m|k)?\b|\b([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mm)\b/i;
const PERCENT = /\b([\d]+(?:\.\d+)?)\s*%/;

function unitFromWord(word: string | undefined): FinancialUnit | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (w === "billion" || w === "bn") return "USD"; // $1.7 billion → convert via USD then millions
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
  if (!unit) return null; // no declared scale word — never guess millions vs dollars
  return { value: n, unit };
}

function parseAsOfDate(text: string): string | null {
  const labeled =
    text.match(/\bas of\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i) ??
    text.match(/\bperiod ended\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (!labeled?.[1]) return null;
  const parsed = new Date(labeled[1]);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parsePercent(raw: string): { value: number; unit: FinancialUnit } | null {
  const m = raw.match(PERCENT);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return { value: n, unit: "PERCENT" };
}

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
 */
export function parseFinancialFactsFromText(text: string, chunkId: string | null = null): ProposedFinancialFact[] {
  const asOfDate = parseAsOfDate(text);
  if (!asOfDate) return [];

  const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const found = new Map<string, ProposedFinancialFact[]>();

  for (const line of lines) {
    for (const { metricName, pattern } of METRIC_LABELS) {
      if (!pattern.test(line)) continue;
      const amount =
        metricName === "assumed_new_debt_rate_pct" ? parsePercent(line) : parseAmount(line);
      if (!amount) continue;
      let normalized;
      try {
        normalized = normalizeFinancialValue(metricName, amount.value, amount.unit);
      } catch {
        continue;
      }
      const row: ProposedFinancialFact = {
        metricName,
        value: normalized.normalizedValue,
        asOfDate,
        canonicalUnit: normalized.canonicalUnit,
        originalValue: normalized.originalValue,
        originalUnit: normalized.originalUnit,
        excerpt: line.slice(0, 280),
        chunkId,
        withinSanityBounds: normalized.withinSanityBounds,
        sanityNote: normalized.sanityNote,
      };
      const list = found.get(metricName) ?? [];
      list.push(row);
      found.set(metricName, list);
    }
  }

  const out: ProposedFinancialFact[] = [];
  for (const [metricName, rows] of found) {
    const unique = [...new Set(rows.map((r) => r.value))];
    if (unique.length !== 1) continue; // conflicting amounts for one metric — skip
    out.push(rows[0]!);
    void metricName;
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
        rationale: proposal.sanityNote ?? "Proposed from uploaded financial document. Confirm against the source before promoting.",
      },
    });
    already.add(key);
    created += 1;
  }
  return created;
}
