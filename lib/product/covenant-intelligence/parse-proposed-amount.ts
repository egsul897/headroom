/**
 * Pure proposed-amount parser for Ask. Kept free of prisma
 * imports so it is unit-testable in isolation.
 */

/**
 * Parse a proposed transaction amount from an Ask question for
 * display in the amount lead. Bare dollar amounts are raw
 * dollars ("$5,000" → "$5,000"); "thousand" is a unit
 * ("$150.0 thousand" → "$150,000"). The old code had no
 * thousand branch, so "$150.0 thousand" parsed as "$150" — a
 * 1000x understatement of the proposed amount (same class as
 * rule 18).
 */
export function parseProposedAmount(question: string): string | null {
  const m =
    question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|trillion|thousand)?/i) ||
    question.match(/\b([\d,]+(?:\.\d+)?)\s*(million|billion|trillion|thousand)\s+(?:of\s+)?(?:secured\s+)?debt\b/i);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "billion") return `$${n} billion`;
  if (unit === "trillion") return `$${n} trillion`;
  if (unit === "million") return `$${n} million`;
  if (unit === "thousand") return `$${(n * 1000).toLocaleString("en-US")}`;
  return `$${n.toLocaleString("en-US")}`;
}
