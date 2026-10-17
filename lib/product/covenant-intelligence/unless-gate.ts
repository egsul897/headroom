/**
 * Pure "unless" gate extraction from a provision statement. Kept
 * free of prisma imports so it is unit-testable in isolation.
 */

/**
 * Extract the condition after "unless" in a provision statement:
 * "shall not ... unless no Default has occurred." → "no Default
 * has occurred".
 *
 * The old inline regex was /unless (.+)$/ — "." cannot cross a
 * newline and "$" is end-of-string, so ANY multi-line statement
 * with the unless clause anywhere but the final line missed the
 * gate entirely, and a conditional prohibition was reported as
 * an absolute PROHIBITS. This version spans newlines and ends
 * the gate at the first sentence terminator (period not after a
 * capital letter — so "U.S." abbreviations do not truncate the
 * gate — followed by whitespace + capital or end of string).
 * Returns null when no unless clause is present.
 */
export function extractUnlessGate(statement: string): string | null {
  // No /i flag: the lookbehind (?<![A-Z]) must stay case-sensitive
  // (it excludes only CAPITAL letters, so "U.S." does not truncate
  // the gate). With /i, [A-Z] would match lowercase too and the
  // lookbehind would block every sentence terminator. "unless" is
  // spelled out case-insensitively instead.
  const m = statement.match(/[Uu][Nn][Ll][Ee][Ss][Ss]\s+([\s\S]+?)(?:(?<![A-Z])\.(?=\s*(?:[A-Z]|$))|$)/);
  if (!m) return null;
  const gate = (m[1] ?? "").replace(/\s+/g, " ").trim();
  return gate.length > 0 ? gate : null;
}
