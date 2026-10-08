/**
 * A dollar figure or ratio in the source has a role. Available capacity is only an
 * affirmative permission, a prohibition that states the ceiling, or an exception amount.
 * A condition floor, a trigger, or a ratio test is not basket capacity, and a COMPARE
 * operator has to match the comparator that introduces the figure.
 *
 * No package names and no expected amounts. The words in front of the figure decide.
 */
import type { IRCapacityExpression, IRExpression, IRRule, CompareOperator } from "../../ir/types";
import { AMOUNT_RE, parseScaledAmount } from "./amount-parser";
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, type SemanticVerificationFinding } from "./types";

export type FigureRole =
  | "AFFIRMATIVE_PERMISSION"
  | "CONDITION_THRESHOLD"
  | "TRIGGER_THRESHOLD"
  | "RATIO_REQUIREMENT"
  | "PROHIBITION_THRESHOLD"
  | "EXCEPTION_AMOUNT";

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
  capacity: boolean;
  /** The words state a forbidden comparison, not the test that must hold. */
  bare: boolean;
}

const PHRASES: readonly Phrase[] = [
  { re: /\bnot in excess of\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bin excess of\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bdoes not exceed\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bshall not exceed\b/gi, role: "PROHIBITION_THRESHOLD", operator: "LTE", capacity: true, bare: false },
  { re: /\bnot to exceed\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bnot exceeding\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bnot greater than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bnot more than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bno more than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bequal to or greater than\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", capacity: false, bare: false },
  { re: /\bequal to or less than\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bnot less than\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", capacity: false, bare: false },
  { re: /\bno less than\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", capacity: false, bare: false },
  { re: /\bat least\b/gi, role: "CONDITION_THRESHOLD", operator: "GTE", capacity: false, bare: false },
  { re: /\bwould be less than\b/gi, role: "TRIGGER_THRESHOLD", operator: "LT", capacity: false, bare: true },
  { re: /\bwould be greater than\b/gi, role: "TRIGGER_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bgreater of\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: null, capacity: true, bare: false },
  { re: /\blesser of\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: null, capacity: true, bare: false },
  { re: /\bless than\b/gi, role: "TRIGGER_THRESHOLD", operator: "LT", capacity: false, bare: true },
  { re: /\bgreater than\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bmore than\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bexceeding\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bexceeds\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bexceed\b/gi, role: "CONDITION_THRESHOLD", operator: "GT", capacity: false, bare: true },
  { re: /\bup to\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: "LTE", capacity: true, bare: false },
  { re: /\bin an aggregate(?:\s+principal)?\s+amount(?:\s+of)?\b/gi, role: "AFFIRMATIVE_PERMISSION", operator: null, capacity: true, bare: false },
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

function prohibitionCeiling(prefix: string, phraseStart: number, operator: CompareOperator | null): boolean {
  if (operator !== "GT") return false;
  const before = prefix.slice(0, phraseStart);
  const marks = [...before.matchAll(/\b(?:(?:shall|may|will|must)\s+not|(?:no|neither))\b/gi)];
  const last = marks[marks.length - 1];
  if (!last || last.index === undefined) return false;
  const between = before.slice(last.index);
  if (/\b(?:if|provided|so long as|unless|when|whenever)\b/i.test(between)) return false;
  // "no Default" is not a prohibition. "No Loan Party shall" is.
  if (/^(?:no|neither)$/i.test(last[0]) && !/\b(?:shall|may|will|must|permit)\b/i.test(between)) return false;
  return true;
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
    let role: FigureRole = hit?.phrase.role ?? "AFFIRMATIVE_PERMISSION";
    let operator = hit?.phrase.operator ?? null;
    let capacity = hit ? hit.phrase.capacity : true;
    if (hit && prohibitionCeiling(prefix, hit.start, operator)) {
      role = "PROHIBITION_THRESHOLD";
      operator = "LTE";
      capacity = true;
    }
    if (capacity && role === "AFFIRMATIVE_PERMISSION" && /\bexcept\b/i.test(prefix)) role = "EXCEPTION_AMOUNT";
    if (/\bif\b/i.test(prefix) && (role === "TRIGGER_THRESHOLD" || operator === "LT")) role = "TRIGGER_THRESHOLD";
    const invertOperator = hit ? forbiddenState(text, start, hit.start, hit.phrase.bare) : false;
    out.push({ role, operator, capacity, invertOperator, rawText: match[0], value: parsed.canonicalValue, kind: "MONEY", charStart: start });
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
    out.push({
      role: "RATIO_REQUIREMENT",
      operator: hit?.phrase.operator ?? null,
      capacity: false,
      invertOperator: hit ? forbiddenState(text, start, hit.start, hit.phrase.bare) : false,
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
