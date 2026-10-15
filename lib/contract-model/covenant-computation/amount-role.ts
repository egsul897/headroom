/**
 * Contractual function of each dollar amount in a clause.
 *
 * A dollar figure alone is not capacity. Only an amount in a ceiling role
 * ("not to exceed", "shall not exceed", "up to", "maximum") can be a basket's
 * fixed-dollar cap. Minimum denominations, payment increments, reporting
 * thresholds and conditions qualifying another permission are not capacity.
 * Document-generic lexicon; no per-issuer branches.
 */

export type AmountRole =
  | "MAXIMUM_CAPACITY"
  | "MINIMUM_DENOMINATION"
  | "PAYMENT_INCREMENT"
  | "REPORTING_THRESHOLD"
  | "QUALIFYING_CONDITION"
  | "UNRESOLVED";

export interface AmountWithRole {
  raw: string;
  value: string;
  index: number;
  role: AmountRole;
}

const DOLLAR = /\$\s*([\d,]+(?:\.\d+)?)/g;
const INCREMENT_BEFORE = /\b(?:integral|whole)\s+multiples?\s+of\s*$|\bmultiples?\s+of\s*$|\bincrements?\s+of\s*$/i;
const MINIMUM_BEFORE =
  /\b(?:minimum|at\s+least|not\s+less\s+than|no\s+less\s+than|in\s+excess\s+of\s+the\s+minimum)\b[^$;]{0,60}$/i;
const MAXIMUM_BEFORE =
  /\b(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed|not\s+exceeding|not\s+in\s+excess\s+of|maximum|up\s+to)\b[^$;]{0,60}$/i;
const EXCESS_BEFORE = /\b(?:in\s+excess\s+of|exceeding|exceeds?|greater\s+than|more\s+than)\s*$/i;
const REPORTING_SENTENCE = /\b(?:notice|notify|notification|report|reporting|deliver|furnish|inform)\b/i;
const CONDITION_SENTENCE = /\b(?:if|unless|so\s+long\s+as|provided\s+that|in\s+the\s+event|to\s+the\s+extent)\b/i;

function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index - 1) + 1, text.lastIndexOf(";", index - 1) + 1);
  const endDot = text.indexOf(".", index);
  return text.slice(start, endDot < 0 ? text.length : endDot);
}

export function amountRoles(text: string): AmountWithRole[] {
  const t = text.replace(/\s+/g, " ");
  const out: AmountWithRole[] = [];
  for (const m of t.matchAll(DOLLAR)) {
    const index = m.index ?? 0;
    const before = t.slice(Math.max(0, index - 90), index);
    const near = t.slice(Math.max(0, index - 30), index);
    const sentence = sentenceAround(t, index);
    let role: AmountRole = "UNRESOLVED";
    if (INCREMENT_BEFORE.test(near)) role = "PAYMENT_INCREMENT";
    else if (MAXIMUM_BEFORE.test(before) && !lastIs(before, MINIMUM_BEFORE, MAXIMUM_BEFORE)) role = "MAXIMUM_CAPACITY";
    else if (MINIMUM_BEFORE.test(before)) role = "MINIMUM_DENOMINATION";
    else if (EXCESS_BEFORE.test(near) && REPORTING_SENTENCE.test(sentence)) role = "REPORTING_THRESHOLD";
    else if (EXCESS_BEFORE.test(near) && CONDITION_SENTENCE.test(sentence)) role = "QUALIFYING_CONDITION";
    out.push({ raw: m[0], value: m[1]!.replace(/,/g, ""), index, role });
  }
  return out;
}

/** True when the closer of two cue patterns preceding the amount is `a`. */
function lastIs(before: string, a: RegExp, b: RegExp): boolean {
  const pos = (re: RegExp) => {
    const g = new RegExp(re.source.replace(/\[\^\$;\]\{0,60\}\$$/, ""), "gi");
    let last = -1;
    for (const m of before.matchAll(g)) last = m.index ?? last;
    return last;
  };
  return pos(a) > pos(b);
}

/** Amounts that are never capacity: minimums, increments, reporting thresholds, qualifying conditions. */
export function isNonCapacityRole(role: AmountRole): boolean {
  return (
    role === "MINIMUM_DENOMINATION" ||
    role === "PAYMENT_INCREMENT" ||
    role === "REPORTING_THRESHOLD" ||
    role === "QUALIFYING_CONDITION"
  );
}

export function hasMaximumCapacityAmount(text: string): boolean {
  return amountRoles(text).some((a) => a.role === "MAXIMUM_CAPACITY");
}

const PERMISSION_VERB =
  /\b(?:may|is\s+permitted|are\s+permitted|shall\s+be\s+permitted|permitted\s+to|not\s+to\s+exceed|shall\s+not\s+exceed|does\s+not\s+exceed|not\s+in\s+excess\s+of)\b/i;

/**
 * Affirmative operative permission evidence for a basket candidate.
 * With dollar amounts present, at least one must be in a ceiling role; a clause
 * whose only amounts are minimums, increments, thresholds or conditions grants
 * no capacity. Without dollar amounts, a permission verb is required.
 */
export function hasOperativePermissionEvidence(text: string): boolean {
  const roles = amountRoles(text);
  if (roles.length > 0) return roles.some((a) => a.role === "MAXIMUM_CAPACITY");
  return PERMISSION_VERB.test(text);
}
