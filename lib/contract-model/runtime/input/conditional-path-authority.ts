/**
 * Deterministic selected-path authority for CONDITIONAL fulfillment clearance.
 *
 * PATH_IRRELEVANT may clear an unresolved conditional leaf only when a sealed
 * SelectedPathAuthority — produced by evaluating IF conditions against APPROVED
 * snapshots — shows the leaf's branch is inactive. A caller-supplied branchLabel
 * + proof string alone is never sufficient.
 */
import { createHash } from "node:crypto";
import type { IRCapacityExpression, IRExpression } from "../../ir/types";
// Walkable covers both IRExpression and UnlimitedCapacity (IRCapacityExpression).
import { evaluateExpression } from "../evaluate-expression";
import { snapshotInputResolver } from "./snapshot-resolver";
import type { FinancialSnapshot } from "./types";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "./version";

export type ConditionalBranchLabel = "then-branch" | "else-branch";

export interface ConditionalPathSelection {
  ifExprId: string;
  conditionEvaluatedTo: boolean;
  selectedBranch: ConditionalBranchLabel;
  /** Metric/term keys consumed while evaluating the condition (APPROVED only). */
  conditionInputKeys: string[];
  conditionStatus: "EXECUTABLE";
}

export interface SelectedPathAuthority {
  authorityId: string;
  contractVersion: string;
  companyId: string;
  instrumentKey: string;
  /** APPROVED snapshot ids relied upon for condition evaluation. */
  snapshotIds: string[];
  selections: ConditionalPathSelection[];
  /**
   * Tamper-evident seal over selections + snapshot ids + company/instrument.
   * Cleared only by selectConditionalPaths — never by callers inventing fields.
   */
  seal: string;
}

export type SelectConditionalPathsResult =
  | { ok: true; authority: SelectedPathAuthority }
  | { ok: false; reason: string; failedIfExprId?: string | null };

type Walkable = IRCapacityExpression | IRExpression;

function collectIfNodes(expr: Walkable, out: Extract<IRExpression, { kind: "IF" }>[] = []): typeof out {
  switch (expr.kind) {
    case "IF":
      out.push(expr);
      collectIfNodes(expr.condition, out);
      collectIfNodes(expr.then, out);
      if (expr.else) collectIfNodes(expr.else, out);
      break;
    case "ADD":
    case "SUM":
    case "MULTIPLY":
    case "AND":
    case "OR":
    case "MAX":
    case "MIN":
      for (const o of expr.operands) collectIfNodes(o, out);
      break;
    case "SUBTRACT":
    case "COMPARE":
      collectIfNodes(expr.left, out);
      collectIfNodes(expr.right, out);
      break;
    case "DIVIDE":
      collectIfNodes(expr.numerator, out);
      collectIfNodes(expr.denominator, out);
      break;
    case "NOT":
      collectIfNodes(expr.operand, out);
      break;
    case "AS_OF":
    case "DURING_PERIOD":
      collectIfNodes(expr.value, out);
      break;
    case "SCHEDULE":
      for (const c of expr.cases) collectIfNodes(c.value, out);
      if (expr.defaultValue) collectIfNodes(expr.defaultValue, out);
      break;
    case "FIXED_POINT_ADDBACK_CAP":
      collectIfNodes(expr.base, out);
      collectIfNodes(expr.addbacks, out);
      if (expr.eligibility) collectIfNodes(expr.eligibility, out);
      break;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) collectIfNodes(expr.triggerCondition, out);
      break;
    case "UNLIMITED_CAPACITY":
      if ("gatedBy" in expr && expr.gatedBy) collectIfNodes(expr.gatedBy, out);
      break;
    default:
      break;
  }
  return out;
}

function sealAuthority(payload: Omit<SelectedPathAuthority, "authorityId" | "seal">): { authorityId: string; seal: string } {
  const canonical = JSON.stringify({
    contractVersion: payload.contractVersion,
    companyId: payload.companyId,
    instrumentKey: payload.instrumentKey,
    snapshotIds: [...payload.snapshotIds].sort(),
    selections: payload.selections.map((s) => ({
      ifExprId: s.ifExprId,
      conditionEvaluatedTo: s.conditionEvaluatedTo,
      selectedBranch: s.selectedBranch,
      conditionInputKeys: [...s.conditionInputKeys].sort(),
      conditionStatus: s.conditionStatus,
    })),
  });
  const seal = createHash("sha256").update(canonical).digest("hex");
  const authorityId = `path-auth:${seal.slice(0, 24)}`;
  return { authorityId, seal };
}

/**
 * Evaluate every IF condition in `expression` against APPROVED snapshots and
 * seal the selected branches. Fails closed if any condition is not EXECUTABLE
 * BOOLEAN from approved facts.
 */
export function selectConditionalPaths(args: {
  expression: IRCapacityExpression;
  snapshots: readonly FinancialSnapshot[];
  companyId: string;
  instrumentKey: string;
}): SelectConditionalPathsResult {
  const approved = args.snapshots.filter((s) => s.status === "APPROVED" && s.companyId === args.companyId);
  if (approved.length === 0) {
    return { ok: false, reason: "NO_APPROVED_SNAPSHOTS" };
  }
  const resolver = snapshotInputResolver({ snapshots: approved });
  const ifs = collectIfNodes(args.expression);
  const selections: ConditionalPathSelection[] = [];

  for (const node of ifs) {
    const ifExprId = node.exprId;
    if (!ifExprId) {
      return { ok: false, reason: "IF_MISSING_EXPR_ID", failedIfExprId: null };
    }
    const ev = evaluateExpression({
      expression: node.condition,
      inputs: resolver,
      context: { companyId: args.companyId, instrumentKey: args.instrumentKey },
    });
    if (ev.status !== "EXECUTABLE" || !ev.value || ev.value.type !== "BOOLEAN") {
      return {
        ok: false,
        reason: `CONDITION_NOT_EXECUTABLE:${ev.status}`,
        failedIfExprId: ifExprId,
      };
    }
    // Refuse if any non-approved snapshot was relied upon (resolver already filters;
    // double-check provenance).
    if (ev.provenance.inputsUsed.some((u) => u.provenance.reliedOnNonApprovedSnapshot)) {
      return { ok: false, reason: "CONDITION_RELIED_ON_NON_APPROVED", failedIfExprId: ifExprId };
    }
    const conditionEvaluatedTo = ev.value.value;
    selections.push({
      ifExprId,
      conditionEvaluatedTo,
      selectedBranch: conditionEvaluatedTo ? "then-branch" : "else-branch",
      conditionInputKeys: ev.provenance.inputsUsed.map((u) => u.key),
      conditionStatus: "EXECUTABLE",
    });
  }

  const base = {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    snapshotIds: approved.map((s) => s.snapshotId),
    selections,
  };
  const { authorityId, seal } = sealAuthority(base);
  return { ok: true, authority: { ...base, authorityId, seal } };
}

/** Recompute seal; returns false if caller fabricated or mutated authority fields. */
export function verifySelectedPathAuthority(authority: SelectedPathAuthority): boolean {
  const { authorityId, seal } = sealAuthority({
    contractVersion: authority.contractVersion,
    companyId: authority.companyId,
    instrumentKey: authority.instrumentKey,
    snapshotIds: authority.snapshotIds,
    selections: authority.selections,
  });
  return authorityId === authority.authorityId && seal === authority.seal;
}

/**
 * True when sealed authority shows `leafConditionalOn` is on an inactive branch
 * of a concrete IF that was evaluated.
 */
export function authorityShowsLeafInactive(args: {
  authority: SelectedPathAuthority;
  leafConditionalOn: string | null;
  /** Off-path branch label claimed for the leaf (must appear in conditionalOn). */
  inactiveBranchLabel: string;
}): boolean {
  if (!args.leafConditionalOn) return false;
  if (!args.leafConditionalOn.includes(args.inactiveBranchLabel)) return false;
  if (args.inactiveBranchLabel !== "then-branch" && args.inactiveBranchLabel !== "else-branch") {
    return false;
  }
  // conditionalOn format from manifest: `IF ${exprId} then-branch|else-branch`
  const m = /IF\s+(\S+)\s+(then-branch|else-branch)/.exec(args.leafConditionalOn);
  if (!m) return false;
  const ifExprId = m[1]!;
  const leafBranch = m[2] as ConditionalBranchLabel;
  if (leafBranch !== args.inactiveBranchLabel) return false;

  const sel = args.authority.selections.find((s) => s.ifExprId === ifExprId);
  if (!sel) return false;
  // Leaf is inactive iff selected branch differs from the leaf's branch.
  return sel.selectedBranch !== leafBranch;
}
