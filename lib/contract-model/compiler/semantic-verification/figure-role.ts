/**
 * A dollar figure or ratio in the source has a role. Available capacity requires a
 * grant the words themselves make ("not to exceed", "up to") or governing permission,
 * exception, or amount-ceiling authority. These comparators never grant capacity on
 * their own: "does not exceed", "not in excess of", "greater of", "lesser of",
 * "shall not exceed". A prohibition ceiling, a condition, a trigger, a maintenance
 * test, a bare formula, and an unclassified figure are not freely available baskets.
 * A condition in an earlier clause does not govern a later figure that an unconsumed
 * grant introduces. A COMPARE operator has to match the comparator that introduces
 * the figure.
 *
 * No package names and no expected amounts. The words in front of the figure decide.
 */
import type { IRCapacityExpression, IRExpression, IRRule, CompareOperator } from "../../ir/types";
import { AMOUNT_RE, parseScaledAmount } from "./amount-parser";
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, type SemanticVerificationFinding } from "./types";

export type FigureRole =
  | "AFFIRMATIVE_PERMISSION"
  | "PROHIBITION_THRESHOLD"
  | "CONDITION_THRESHOLD"
  | "FINANCIAL_MAINTENANCE"
  | "TRIGGER_THRESHOLD"
  | "FORMULA_COMPONENT"
  | "EXCEPTION_AMOUNT"
  | "UNCLASSIFIED"
  | "RATIO_REQUIREMENT";

export interface ClassifiedFigure {
  role: FigureRole;
  operator: CompareOperator | null;
  /** True when this figure can be the amount a basket makes available. */
  capacity: boolean;
  /**
   * True when the phrase states the forbidden state of a prohibition
   * ("shall not permit the ratio to be less than"), so the requirement
   * operator is the inverse. A phrase that already states the requirement
   * ("does not exceed", "not less than") is not inverted.
   */
  invertOperator: boolean;
  rawText: string;
  value: number;
  kind: "MONEY" | "RATIO";
  charStart: number;
}

export interface FigureRoleIssue {
  ruleId: string;
  kind: "THRESHOLD_AS_CAPACITY" | "COMPARATOR_MISMATCH";
  role: FigureRole;
  detail: string;
}

interface Phrase {
  re: RegExp;
  role: FigureRole;
  operator: CompareOperator | null;
  /**
   * True only for a cap phrase that states the amount of a permission or an
   * exception ("not to exceed"). A weak comparator ("does not exceed",
   * "greater of", "shall not exceed") never does this by itself.
   */
  alone: boolean;
  /** The words state a forbidden comparison, not the test that must hold. */
  bare: boolean;
  formula?: boolean;
}

const PHRASES: readonly Phrase[] = [
  { re: /\bnot in excess of\b/gi, role: "CONDITION_THRESHOLD", operator: "LTE", alone: false, bare: false },
  { re: /\bin excess of\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bdoes not exceed\b/gi, role: "CONDITION_THRESHOLD", operator: "LTE", alone: false, bare: false },
  { re: /\bshall not exceed\b/gi, role: "PROHIBITION_THRESHOLD", operator: "LTE", alone: false, bare: false },
  { re: /\bnot to exceed\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bnot exceeding\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bnot greater than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bnot more than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bno more than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bequal to or greater than\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", alone: false, bare: false },
  { re: /\bequal to or less than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bnot less than\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", alone: false, bare: false },
  { re: /\bno less than\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", alone: false, bare: false },
  { re: /\bat least\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", alone: false, bare: false },
  { re: /\bwould be less than\b/gi, role: "TRIGGER_THRESHOLD", operator: "LT", alone: false, bare: true },
  { re: /\bwould be greater than\b/gi, role: "TRIGGER_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bgreater of\b/gi, role: "FORMULA_COMPONENT", operator: null, alone: false, bare: false, formula: true },
  { re: /\blesser of\b/gi, role: "FORMULA_COMPONENT", operator: null, alone: false, bare: false, formula: true },
  { re: /\bless than\b/gi, role: "TRIGGER_THRESHOLD", operator: "LT", alone: false, bare: true },
  { re: /\bgreater than\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bmore than\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bexceeding\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bexceeds\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bexceed\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", alone: false, bare: true },
  { re: /\bup to\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", alone: true, bare: false },
  { re: /\bin an aggregate(?:\s+principal)?\s+amount(?:\s+of)?\b/gi, role: "UNCLASSIFIED", operator: null, alone: false, bare: false },
];

const RATIO_RE = /\b(\d[\d,]*(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?\b/gi;
const WINDOW = 220;
const FRAME_WINDOW = 1600;
const FRAME_RE = /\b(?:if|provided|so long as|unless|when|whenever|(?:shall|will|may|must)\s+not)\b/gi;

function closestPhrase(prefix: string): { phrase: Phrase; start: number; end: number } | null {
  let best: { phrase: Phrase; start: number; end: number } | null = null;
  for (const phrase of PHRASES) {
    const re = new RegExp(phrase.re.source, phrase.re.flags);
    for (const match of prefix.matchAll(re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const longer = best !== null && end === best.end && match[0].length > best.end - best.start;
      if (best === null || end > best.end || longer) best = { phrase, start, end };
    }
  }
  return best;
}

function forbiddenState(text: string, figureStart: number, phraseStartInPrefix: number, bare: boolean): boolean {
  if (!bare) return false;
  const phraseAt = Math.max(0, figureStart - WINDOW) + phraseStartInPrefix;
  const before = text.slice(Math.max(0, figureStart - FRAME_WINDOW), phraseAt);
  const frames = [...before.matchAll(new RegExp(FRAME_RE.source, FRAME_RE.flags))];
  const last = frames[frames.length - 1];
  return last !== undefined && /\bnot\b/i.test(last[0]);
}

type Governing = "CONDITION" | "EXCEPTION" | "PERMISSION" | "AMOUNT_CEILING" | "PROHIBITION" | "NONE";

const GRANT_BEFORE = /\b(?:not to exceed|not exceeding|not greater than|not more than|no more than|up to)\b/i;

function nearestAuthority(before: string): { kind: Governing; end: number } {
  const hits: { end: number; len: number; kind: Governing }[] = [];
  const consider = (re: RegExp, kind: Governing) => {
    for (const match of before.matchAll(re)) {
      hits.push({ end: (match.index ?? 0) + match[0].length, len: match[0].length, kind });
    }
  };
  consider(/\b(?:if|provided|so long as|unless|when|whenever)\b/gi, "CONDITION");
  consider(/\bexcept\b/gi, "EXCEPTION");
  consider(/\b(?:may|permitted)\b/gi, "PERMISSION");
  consider(/\b(?:aggregate|principal)\s+(?:principal\s+)?(?:amount|sum)\b[\s\S]{0,160}?\bshall not\b/gi, "AMOUNT_CEILING");
  consider(/\b(?:shall|will|may|must)\s+not\b/gi, "PROHIBITION");
  consider(/\b(?:no|neither)\b(?:(?!\bif\b|\bprovided\b|\bunless\b).){0,100}?\b(?:shall|may|will|must)\b/gi, "PROHIBITION");
  let best: { end: number; len: number; kind: Governing } | null = null;
  for (const hit of hits) {
    if (!best || hit.end > best.end || (hit.end === best.end && hit.len > best.len)) best = hit;
  }
  return best ? { kind: best.kind, end: best.end } : { kind: "NONE", end: -1 };
}

function decideMoney(prefix: string, hit: { phrase: Phrase; start: number } | null): { role: FigureRole; operator: CompareOperator | null; capacity: boolean } {
  if (!hit) return { role: "UNCLASSIFIED", operator: null, capacity: false };
  const beforePhrase = prefix.slice(0, hit.start);
  const authority = nearestAuthority(beforePhrase);
  const auth = authority.kind;
  const grantMatches = [...beforePhrase.matchAll(new RegExp(GRANT_BEFORE.source, "gi"))];
  const lastGrant = grantMatches[grantMatches.length - 1];
  const grantBefore = lastGrant !== undefined && !/\$\s?\d/.test(beforePhrase.slice((lastGrant.index ?? 0) + lastGrant[0].length));
  // A proviso that closed before this grant belongs to the earlier clause.
  const grantAfterAuthority = grantBefore && (lastGrant?.index ?? -1) >= authority.end;
  let role = hit.phrase.role;
  let operator = hit.phrase.operator;
  let capacity = false;
  if (auth === "CONDITION" && !grantAfterAuthority) {
    role = role === "TRIGGER_THRESHOLD" || operator === "LT" ? "TRIGGER_THRESHOLD" : "CONDITION_THRESHOLD";
  } else if (hit.phrase.alone) {
    role = auth === "EXCEPTION" ? "EXCEPTION_AMOUNT" : "AFFIRMATIVE_PERMISSION";
    capacity = true;
  } else if (grantBefore || auth === "AMOUNT_CEILING" || ((auth === "PERMISSION" || auth === "EXCEPTION") && hit.phrase.formula)) {
    // Permission or exception authority turns a formula into capacity.
    // It does not turn "in excess of" or "greater than" into a basket.
    capacity = true;
    if (auth === "EXCEPTION") role = "EXCEPTION_AMOUNT";
    else if (hit.phrase.formula) role = "FORMULA_COMPONENT";
    else role = "AFFIRMATIVE_PERMISSION";
  } else if (auth === "PROHIBITION" || role === "PROHIBITION_THRESHOLD") {
    role = "PROHIBITION_THRESHOLD";
    capacity = false;
  } else if (hit.phrase.formula) {
    role = "FORMULA_COMPONENT";
  } else if (!hit.phrase.alone && role === "AFFIRMATIVE_PERMISSION") {
    role = "UNCLASSIFIED";
  }
  if (capacity && role === "AFFIRMATIVE_PERMISSION" && /\bexcept\b/i.test(beforePhrase)) role = "EXCEPTION_AMOUNT";
  return { role, operator, capacity };
}

export function classifyFigures(text: string): ClassifiedFigure[] {
  const out: ClassifiedFigure[] = [];
  const taken: { start: number; end: number }[] = [];
  const overlaps = (start: number, end: number) => taken.some((span) => start < span.end && end > span.start);

  for (const match of text.matchAll(new RegExp(AMOUNT_RE.source, "g"))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const parsed = parseScaledAmount(match[0]);
    if (parsed.canonicalValue === null) continue;
    const prefix = text.slice(Math.max(0, start - WINDOW), start);
    const hit = closestPhrase(prefix);
    const decided = decideMoney(prefix, hit);
    if (/\bif\b/i.test(prefix) && (decided.role === "TRIGGER_THRESHOLD" || decided.operator === "LT") && decided.role !== "AFFIRMATIVE_PERMISSION" && decided.role !== "EXCEPTION_AMOUNT") decided.role = "TRIGGER_THRESHOLD";
    const invertOperator = hit ? forbiddenState(text, start, hit.start, hit.phrase.bare) : false;
    out.push({ role: decided.role, operator: decided.operator, capacity: decided.capacity, invertOperator, rawText: match[0], value: parsed.canonicalValue, kind: "MONEY", charStart: start });
    taken.push({ start, end });
  }

  for (const match of text.matchAll(new RegExp(RATIO_RE.source, RATIO_RE.flags))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    const value = Number((match[1] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const prefix = text.slice(Math.max(0, start - WINDOW), start);
    const hit = closestPhrase(prefix);
    const invertOperator = hit ? forbiddenState(text, start, hit.start, hit.phrase.bare) : false;
    out.push({
      role: invertOperator ? "FINANCIAL_MAINTENANCE" : "RATIO_REQUIREMENT",
      operator: hit?.phrase.operator ?? null,
      capacity: false,
      invertOperator,
      rawText: match[0],
      value,
      kind: "RATIO",
      charStart: start,
    });
  }

  return out;
}

function sameValue(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.001 * Math.max(1, Math.abs(right));
}

function invert(operator: CompareOperator): CompareOperator {
  switch (operator) {
    case "GT": return "LTE";
    case "GTE": return "LT";
    case "LT": return "GTE";
    case "LTE": return "GT";
    case "EQ": return "EQ";
  }
}

function literals(expr: IRExpression | null | undefined, negated: boolean, asCapacity: boolean, out: { expr: IRExpression; negated: boolean; asCapacity: boolean }[]): void {
  if (!expr) return;
  out.push({ expr, negated, asCapacity });
  switch (expr.kind) {
    case "NOT":
      literals(expr.operand, !negated, false, out);
      return;
    case "COMPARE":
      literals(expr.left, negated, false, out);
      literals(expr.right, negated, false, out);
      return;
    case "AND":
    case "OR":
      for (const operand of expr.operands) literals(operand, negated, false, out);
      return;
    case "ADD":
    case "SUM":
    case "MAX":
    case "MIN":
    case "MULTIPLY":
      for (const operand of expr.operands) literals(operand, negated, asCapacity, out);
      return;
    case "SUBTRACT":
      literals(expr.left, negated, asCapacity, out);
      literals(expr.right, negated, false, out);
      return;
    case "DIVIDE":
      literals(expr.numerator, negated, asCapacity, out);
      literals(expr.denominator, negated, false, out);
      return;
    case "IF":
      literals(expr.condition, negated, false, out);
      literals(expr.then, negated, asCapacity, out);
      literals(expr.else, negated, asCapacity, out);
      return;
    case "AS_OF":
    case "DURING_PERIOD":
      literals(expr.value, negated, asCapacity, out);
      return;
    default:
      return;
  }
}

function walkCapacity(capacity: IRCapacityExpression | null, out: { expr: IRExpression; negated: boolean; asCapacity: boolean }[]): void {
  if (!capacity) return;
  if (capacity.kind === "UNLIMITED_CAPACITY") {
    literals(capacity.gatedBy, false, false, out);
    return;
  }
  literals(capacity, false, true, out);
}

function numericOf(expr: IRExpression): { kind: "MONEY" | "RATIO"; value: number } | null {
  if (expr.kind === "MONEY") return { kind: "MONEY", value: expr.amount };
  if (expr.kind === "RATIO") return { kind: "RATIO", value: expr.value };
  if (expr.kind === "NUMBER") return { kind: "RATIO", value: expr.value };
  return null;
}

export function figureRoleIssues(sourceText: string, rules: readonly Pick<IRRule, "ruleId" | "capacityExpression" | "conditions" | "exceptions">[]): FigureRoleIssue[] {
  const figures = classifyFigures(sourceText);
  const issues: FigureRoleIssue[] = [];
  const seen = new Set<string>();
  const push = (issue: FigureRoleIssue) => {
    const key = `${issue.ruleId}|${issue.kind}|${issue.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (const rule of rules) {
    const nodes: { expr: IRExpression; negated: boolean; asCapacity: boolean }[] = [];
    walkCapacity(rule.capacityExpression, nodes);
    for (const condition of rule.conditions) literals(condition.expression, false, false, nodes);
    for (const exception of rule.exceptions) for (const condition of exception.conditions) literals(condition.expression, false, false, nodes);

    for (const node of nodes) {
      if (node.expr.kind === "COMPARE") {
        const operator = node.negated ? invert(node.expr.operator) : node.expr.operator;
        const sides = [numericOf(node.expr.left), numericOf(node.expr.right)].filter((side): side is { kind: "MONEY" | "RATIO"; value: number } => side !== null);
        for (const side of sides) {
          const matches = figures.filter((figure) => figure.kind === side.kind && sameValue(figure.value, side.value) && figure.operator !== null);
          if (matches.length === 0) continue;
          const agrees = (figure: ClassifiedFigure) => (figure.invertOperator && figure.operator ? invert(figure.operator) : figure.operator) === operator;
          if (matches.some(agrees)) continue;
          const figure = matches[0]!;
          push({
            ruleId: rule.ruleId,
            kind: "COMPARATOR_MISMATCH",
            role: figure.role,
            detail: `source introduces ${figure.rawText} as ${figure.role} with comparator ${figure.operator}; the compiled comparison uses ${operator}`,
          });
        }
      }
      if (!node.asCapacity) continue;
      const numeric = numericOf(node.expr);
      if (!numeric || numeric.kind !== "MONEY") continue;
      const matches = figures.filter((figure) => figure.kind === "MONEY" && sameValue(figure.value, numeric.value));
      if (matches.length === 0 || matches.some((figure) => figure.capacity)) continue;
      const figure = matches[0]!;
      push({
        ruleId: rule.ruleId,
        kind: "THRESHOLD_AS_CAPACITY",
        role: figure.role,
        detail: `${figure.rawText} is a ${figure.role}, not available capacity`,
      });
    }
  }
  return issues;
}

export function figureRoleFindings(sourceText: string, rules: readonly IRRule[], ctx: { companyId: string; instrumentKey: string; sourceDocumentId: string; candidateRef: string; sourceSectionRef?: string | null }): SemanticVerificationFinding[] {
  const citation = ctx.sourceSectionRef ?? "(unknown)";
  return figureRoleIssues(sourceText, rules).map((issue) => ({
    findingId: computeSemanticVerificationFindingId(ctx.companyId, ctx.instrumentKey, ctx.candidateRef, issue.kind === "THRESHOLD_AS_CAPACITY" ? "WRONG_AMOUNT" : "WRONG_LOGIC", issue.ruleId, issue.kind, citation, SEMANTIC_VERIFIER_ALGORITHM_VERSION),
    companyId: ctx.companyId,
    instrumentKey: ctx.instrumentKey,
    sourceDocumentId: ctx.sourceDocumentId,
    candidateRef: ctx.candidateRef,
    ruleOrDefinitionId: issue.ruleId,
    irPath: issue.kind,
    findingType: issue.kind === "THRESHOLD_AS_CAPACITY" ? "WRONG_AMOUNT" : "WRONG_LOGIC",
    severity: "MATERIAL",
    sourceEvidence: issue.detail,
    sourceCitation: citation,
    proposedIrEvidence: issue.detail,
    verifierReasoning: issue.detail,
    deterministicSignals: [issue.kind, issue.role],
    verificationMethod: "DETERMINISTIC_ONLY",
    provider: "deterministic",
    model: "figure-role",
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    verifierPromptVersion: "figure-role.v1",
    resolutionStatus: "OPEN",
    createdAt: new Date().toISOString(),
  }));
}
