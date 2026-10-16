/**
 * Pure shared-aggregate-cap detection (Rule 179). Kept free of
 * prisma imports so it is unit-testable in isolation (same
 * reason as grant-types.ts).
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";

/**
 * Rule 179 — detect a shared aggregate cap in a summary item.
 *
 * Drafters write one basket across several clauses: "the aggregate
 * principal amount of Indebtedness permitted by this clause (e) and
 * any Aircraft Financing permitted by clause (j) below, together
 * with any Refinance Indebtedness ... permitted by clause (f)
 * below, shall not exceed $20,000,000." Clauses (e) and (j) each
 * state the SAME $20M aggregate — one basket, not two independent
 * $20M baskets. Compiling each clause to its own Permission and
 * summing them double-counts: a real agreement showed $40.25M
 * unsecured capacity where the true figure is $20.25M.
 *
 * The pattern is structural, not document-specific: "aggregate" +
 * "together with" + >= 2 "permitted by (this) clause (X)" refs +
 * "shall not exceed $Z" + Indebtedness. Clause letters resolve
 * against the item's parent section (6.01(e) -> parent 6.01 ->
 * member 6.01(j)). Debt-only: the aggregate must be about
 * Indebtedness (a lien aggregate would need its own rule).
 */
export function detectSharedCapGroup(item: CovenantSummaryItem): {
  memberSectionRefs: string[];
  capMillions: number;
} | null {
  // The operative excerpt FIRST: it is the provision's complete text.
  // The analyzer's plainEnglish/conditions TRUNCATE provisos (a real
  // 6.01(e) item's summary distilled the aggregate proviso away to
  // "shall not exceed $20M", losing the aggregation entirely), so
  // summary-only detection fires for one clause and misses its twin.
  // Fall back to plainEnglish + conditions when there is no excerpt.
  const text = item.operativeLanguageExcerpt?.trim()
    ? item.operativeLanguageExcerpt
    : [item.plainEnglish, ...(item.conditions ?? [])].join(" ");
  if (!/\baggregate\b/i.test(text) || !/\btogether with\b/i.test(text)) return null;
  if (!/\bindebtedness\b/i.test(text)) return null;
  const capMatch = text.match(/shall not exceed \$([\d,]+(?:\.\d+)?)\s*(million|billion)?/i);
  if (!capMatch) return null;
  const rawCap = parseFloat(capMatch[1].replace(/,/g, ""));
  // Amounts are $M throughout the compiler (money.ts convention):
  // a bare "$20,000,000" is 20; "$20 million" is 20; "$1.5 billion" is 1500.
  const capMillions =
    capMatch[2]?.toLowerCase() === "billion" ? rawCap * 1000 : capMatch[2]?.toLowerCase() === "million" ? rawCap : rawCap / 1_000_000;
  const refs = [
    ...text.matchAll(/permitted by (?:this )?clause \(([a-zA-Z0-9]+)\)/gi),
  ].map((m) => m[1].toLowerCase());
  const unique = [...new Set(refs)];
  if (unique.length < 2) return null;
  const parent = item.sectionRef.replace(/\([^)]*\)$/, "") || item.sectionRef;
  return {
    memberSectionRefs: unique.map((letter) => `${parent}(${letter})`),
    capMillions,
  };
}

