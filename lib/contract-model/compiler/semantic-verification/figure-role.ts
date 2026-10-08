/**
 * A dollar figure or ratio in the source has a role. Available capacity is true
 * only when the figure's own clause is an affirmative permission or an exception
 * item, and the figure is the cap of that clause.
 *
 * These do not establish that permission: an aggregate principal amount, a
 * shall-not-exceed ceiling, a comparator, a formula, or a may/except that belongs
 * to another clause. Clause and section boundaries come from the text's own
 * markers. When the marker is ambiguous or the governing act conflicts, the
 * figure stays unclassified and capacity stays false, so a compiled basket is
 * REVIEW_REQUIRED.
 *
 * No package names and no expected amounts.
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
  kind: "THRESHOLD_AS_CAPACITY" | "COMPARATOR_MISMATCH" | "GOVERNING_LIMIT_ROLE" | "GOVERNING_LIMIT_AS_PERMISSION";
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
const MARKER_RE = /(?:^|\n|[;:])[ \t]*(\((?:[ivxlcdm]+|[a-z]|[A-Z]|\d+)\))(?=[ \t])/g;
const CAP_RE = /\b(?:not to exceed|not exceeding|not greater than|not more than|no more than|up to|equal to or less than)\b/gi;
const COND_RE = /\b(?:if|provided|so long as|unless|when|whenever)\b/gi;
const PERM_RE = /\b(?:may(?!\s+not)|permitted|except)\b/gi;
const PROHIB_RE = /\b(?:(?:shall|will|must)\s+not|may\s+not)\b|\b(?:no|neither)\b(?:(?!\bif\b|\bprovided\b|\bunless\b).){0,80}?\b(?:shall|may|will|must)\b/gi;

function lastHit(text: string, re: RegExp): { index: number; end: number } | null {
  let found: { index: number; end: number } | null = null;
  for (const match of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
    const index = match.index ?? 0;
    found = { index, end: index + match[0].length };
  }
  return found;
}

function markerIndexes(text: string): number[] {
  return [...text.matchAll(new RegExp(MARKER_RE.source, MARKER_RE.flags))].map((match) => match.index ?? 0);
}

function innermostStart(text: string, figureStart: number): number {
  const before = text.slice(0, figureStart);
  let start = 0;
  const sectionAt = Math.max(before.lastIndexOf("\nSECTION "), before.lastIndexOf("\nARTICLE "));
  if (sectionAt >= 0) start = sectionAt + 1;
  const marker = markerIndexes(before).pop();
  if (marker !== undefined && marker > start) start = marker;
  const local = before.slice(start);
  let shift = 0;
  for (const match of local.matchAll(/[.;][ \t]*(?:\n+[ \t]*)?(?=[A-Z“"])/g)) {
    const index = match.index ?? 0;
    const letter = match[0].search(/[A-Z“"]/);
    shift = index + (letter >= 0 ? letter : match[0].length);
  }
  const blank = local.lastIndexOf("\n\n");
  if (blank >= 0 && blank + 2 > shift) shift = blank + 2;
  return start + shift;
}

function introductionBeforeList(text: string, figureStart: number): string {
  const markers = markerIndexes(text).filter((index) => index < figureStart);
  const mine = markers[markers.length - 1];
  if (mine === undefined) return "";
  const sectionAt = Math.max(text.lastIndexOf("\nSECTION ", mine), text.lastIndexOf("\nARTICLE ", mine), 0);
  const first = markers.find((index) => index >= sectionAt) ?? mine;
  return text.slice(sectionAt, first);
}

function markerLabel(text: string, figureStart: number): string | null {
  const start = innermostStart(text, figureStart);
  const match = text.slice(start, figureStart).match(/^\s*(\([^)]+\))/);
  return match?.[1] ?? null;
}

/** "(i)" is a letter after "(h)" and a roman under "(a)". Both signals in one section leave the clause unowned. */
function ambiguousClause(text: string, figureStart: number): boolean {
  const label = markerLabel(text, figureStart);
  if (label === null || !/^\(i\)$/i.test(label)) return false;
  const start = innermostStart(text, figureStart);
  const sectionAt = Math.max(text.lastIndexOf("\nSECTION ", start), text.lastIndexOf("\nARTICLE ", start), 0);
  const prior = text.slice(sectionAt, start);
  return /\(h\)/i.test(prior) && /\(a\)/i.test(prior);
}

function conditionOwns(own: string): boolean {
  return lastHit(own, COND_RE) !== null;
}

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

function clauseGoverned(text: string, figureStart: number): { own: string; permission: boolean; exception: boolean; prohibition: boolean } {
  const own = text.slice(innermostStart(text, figureStart), figureStart);
  const intro = introductionBeforeList(text, figureStart);
  const permission = lastHit(own, PERM_RE);
  const prohibition = lastHit(own, PROHIB_RE);
  const permissionInClause = permission !== null && (prohibition === null || permission.index > prohibition.index);
  const exceptionList = /\bexcept\s*:/.test(intro) || /\bexcept\s*:?\s*$/.test(intro);
  const exceptionItem = exceptionList && (prohibition === null || permissionInClause);
  const prohibitionList = /\b(?:shall|will|must)\s+not\s*:?\s*$/.test(intro) && !/\bexcept\b/i.test(intro);
  return { own, permission: permissionInClause, exception: exceptionItem, prohibition: (prohibition !== null && !permissionInClause) || prohibitionList };
}

function capIntroducesFormula(own: string): boolean {
  const cap = lastHit(own, CAP_RE);
  if (cap && !/\$\s?\d/.test(own.slice(cap.end))) return true;
  return /\b(?:an amount equal to|equal to)\s+the\s+(?:greater|lesser)\s+of\b/i.test(own);
}

function prohibitionGovernsBare(text: string, figureStart: number): boolean {
  const governed = clauseGoverned(text, figureStart);
  if (conditionOwns(governed.own)) return false;
  if (!governed.prohibition) return false;
  return !governed.permission && !governed.exception;
}

function decideMoney(text: string, figureStart: number, hit: { phrase: Phrase } | null): { role: FigureRole; operator: CompareOperator | null; capacity: boolean } {
  if (!hit) return { role: "UNCLASSIFIED", operator: null, capacity: false };
  const governed = clauseGoverned(text, figureStart);
  const operator = hit.phrase.operator;
  if (ambiguousClause(text, figureStart)) return { role: "UNCLASSIFIED", operator, capacity: false };
  const inCondition = conditionOwns(governed.own);
  const governedCap = (governed.permission || governed.exception) && !inCondition && !governed.prohibition;
  const formulaCap = hit.phrase.formula && governedCap && capIntroducesFormula(governed.own);
  const statedCap = hit.phrase.alone && governedCap && lastHit(governed.own, CAP_RE) !== null;
  if (formulaCap || statedCap) {
    const role: FigureRole = governed.exception || /\bexcept\b/i.test(governed.own) ? "EXCEPTION_AMOUNT" : hit.phrase.formula ? "FORMULA_COMPONENT" : "AFFIRMATIVE_PERMISSION";
    return { role, operator, capacity: true };
  }
  if (inCondition) {
    const role: FigureRole = hit.phrase.role === "TRIGGER_THRESHOLD" || operator === "LT" ? "TRIGGER_THRESHOLD" : "CONDITION_THRESHOLD";
    return { role, operator, capacity: false };
  }
  if (governed.prohibition || hit.phrase.role === "PROHIBITION_THRESHOLD") return { role: "PROHIBITION_THRESHOLD", operator, capacity: false };
  if (hit.phrase.formula) return { role: "FORMULA_COMPONENT", operator, capacity: false };
  if (hit.phrase.role === "AFFIRMATIVE_PERMISSION") return { role: "UNCLASSIFIED", operator, capacity: false };
  return { role: hit.phrase.role, operator, capacity: false };
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
    const prefix = text.slice(innermostStart(text, start), start);
    const hit = closestPhrase(prefix);
    const decided = decideMoney(text, start, hit);
    const invertOperator = hit ? prohibitionGovernsBare(text, start) && hit.phrase.bare : false;
    out.push({ role: decided.role, operator: decided.operator, capacity: decided.capacity, invertOperator, rawText: match[0], value: parsed.canonicalValue, kind: "MONEY", charStart: start });
    taken.push({ start, end });
  }

  for (const match of text.matchAll(new RegExp(RATIO_RE.source, RATIO_RE.flags))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    const value = Number((match[1] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const prefix = text.slice(innermostStart(text, start), start);
    const hit = closestPhrase(prefix);
    const invertOperator = hit ? prohibitionGovernsBare(text, start) && hit.phrase.bare : false;
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

type FigureRoleRule = Pick<IRRule, "ruleId" | "capacityExpression" | "conditions" | "exceptions"> & {
  governingLimit?: IRRule["governingLimit"];
  posture?: IRRule["posture"];
  ruleType?: IRRule["ruleType"];
};

export function figureRoleIssues(sourceText: string, rules: readonly FigureRoleRule[]): FigureRoleIssue[] {
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
    const limit = rule.governingLimit;
    if (limit) {
      literals(limit.ceilingExpression, false, false, nodes);
      if (rule.posture === "PERMISSION" || rule.ruleType === "QUANTITATIVE_PERMISSION") {
        push({
          ruleId: rule.ruleId,
          kind: "GOVERNING_LIMIT_AS_PERMISSION",
          role: "UNCLASSIFIED",
          detail: "a governing aggregate limit is not an incurrence permission",
        });
      }
      const ceilingNodes: { expr: IRExpression; negated: boolean; asCapacity: boolean }[] = [];
      literals(limit.ceilingExpression, false, false, ceilingNodes);
      for (const node of ceilingNodes) {
        if (node.expr.kind !== "MONEY") continue;
        const numeric = numericOf(node.expr);
        if (!numeric || numeric.kind !== "MONEY") continue;
        const matches = figures.filter((figure) => figure.kind === "MONEY" && sameValue(figure.value, numeric.value));
        if (matches.some((figure) => figure.role === "PROHIBITION_THRESHOLD" && !figure.capacity)) continue;
        const figure = matches[0];
        push({
          ruleId: rule.ruleId,
          kind: "GOVERNING_LIMIT_ROLE",
          role: figure?.role ?? "UNCLASSIFIED",
          detail: figure ? `${figure.rawText} is a ${figure.role}; a governing limit requires a prohibition threshold` : `ceiling amount ${numeric.value} is not a prohibition threshold in the source`,
        });
      }
    }

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
