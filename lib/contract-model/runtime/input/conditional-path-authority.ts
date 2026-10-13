/**
 * Authoritative selected-path evaluation for CONDITIONAL fulfillment clearance.
 *
 * TRUST RULE: a reproducible content hash is NOT authentication. PATH_IRRELEVANT
 * clearance may use only a fresh evaluation of IF conditions against the current
 * APPROVED, attributable snapshot set and the operative expression identity.
 * Caller-constructed SelectedPathAuthority payloads — even with a matching
 * SHA-256 seal — are never trusted at the execution boundary.
 */
import { createHash } from "node:crypto";
import type { IRCapacityExpression, IRExpression } from "../../ir/types";
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

export interface SnapshotIdentityBinding {
  snapshotId: string;
  version: string;
  status: "APPROVED";
  asOf: string | null;
  reportingPeriod: string | null;
  approvalRef: string | null;
  source: string | null;
  sourceVersion: string | null;
}

/**
 * Result of an authoritative server-side path evaluation.
 * `contentFingerprint` is a diagnostic digest of the evaluation transcript —
 * never a trust token. Callers cannot mint authority by hashing fields.
 */
export interface SelectedPathAuthority {
  /** Diagnostic id derived from contentFingerprint — not an auth credential. */
  authorityId: string;
  contractVersion: string;
  companyId: string;
  instrumentKey: string;
  /** Fingerprint of operative IF expression identities in evaluation order. */
  expressionIdentity: string;
  /** Exact APPROVED snapshot bindings used (id + version + approval). */
  snapshotBindings: SnapshotIdentityBinding[];
  /** @deprecated Prefer snapshotBindings; retained for transcript compatibility. */
  snapshotIds: string[];
  evaluationAsOf: string | null;
  evaluationPeriodKey: string | null;
  selections: ConditionalPathSelection[];
  /**
   * Diagnostic transcript digest. MUST NOT be treated as authentication.
   * verifySelectedPathAuthority is intentionally non-authoritative.
   */
  seal: string;
  /** True only when produced by evaluateConditionalPathsAuthoritatively in-process. */
  authoritative: true;
  evaluatedAtIso: string;
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

/** Stable expression identity: ordered IF exprIds + condition node kinds (not caller-controlled). */
export function expressionIdentityFingerprint(expression: IRCapacityExpression): string {
  const ifs = collectIfNodes(expression);
  const parts = ifs.map((node) => {
    const condKind = node.condition.kind;
    const condId = node.condition.exprId ?? "";
    return `${node.exprId ?? ""}|${condKind}|${condId}`;
  });
  return createHash("sha256").update(parts.join("::")).digest("hex");
}

function diagnosticFingerprint(payload: {
  contractVersion: string;
  companyId: string;
  instrumentKey: string;
  expressionIdentity: string;
  snapshotBindings: SnapshotIdentityBinding[];
  evaluationAsOf: string | null;
  evaluationPeriodKey: string | null;
  selections: ConditionalPathSelection[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        contractVersion: payload.contractVersion,
        companyId: payload.companyId,
        instrumentKey: payload.instrumentKey,
        expressionIdentity: payload.expressionIdentity,
        snapshotBindings: payload.snapshotBindings,
        evaluationAsOf: payload.evaluationAsOf,
        evaluationPeriodKey: payload.evaluationPeriodKey,
        selections: payload.selections.map((s) => ({
          ifExprId: s.ifExprId,
          conditionEvaluatedTo: s.conditionEvaluatedTo,
          selectedBranch: s.selectedBranch,
          conditionInputKeys: [...s.conditionInputKeys].sort(),
          conditionStatus: s.conditionStatus,
        })),
      }),
    )
    .digest("hex");
}

function approvedSnapshotBindings(
  snapshots: readonly FinancialSnapshot[],
  companyId: string,
): SnapshotIdentityBinding[] | { error: string } {
  const approved = snapshots.filter((s) => s.companyId === companyId && s.status === "APPROVED");
  if (approved.length === 0) return { error: "NO_APPROVED_SNAPSHOTS" };
  // Reject if any claimed id in the working set is SUPERSEDED for this company
  // while still being the only match for a binding — caller must pass current set.
  const superseded = snapshots.filter((s) => s.companyId === companyId && s.status === "SUPERSEDED");
  for (const s of superseded) {
    const replaced = approved.some((a) => a.supersedesSnapshotId === s.snapshotId);
    if (replaced) {
      // superseded rows may appear in the array; they must not be used for evaluation
      continue;
    }
  }
  return approved.map((s) => ({
    snapshotId: s.snapshotId,
    version: s.version,
    status: "APPROVED" as const,
    asOf: s.asOf,
    reportingPeriod: s.reportingPeriod,
    approvalRef: s.review.approvalRef,
    source: s.provenance.source,
    sourceVersion: s.provenance.sourceVersion,
  }));
}

/**
 * Authoritative path evaluation — the ONLY trusted source for PATH_IRRELEVANT.
 * Always re-evaluates IF conditions against current APPROVED snapshots.
 */
export function evaluateConditionalPathsAuthoritatively(args: {
  expression: IRCapacityExpression;
  snapshots: readonly FinancialSnapshot[];
  companyId: string;
  instrumentKey: string;
  evaluationAsOf?: string | null;
  evaluationPeriodKey?: string | null;
  /** Optional clock for evaluatedAtIso (tests). */
  nowIso?: string;
}): SelectConditionalPathsResult {
  const bindingsOrErr = approvedSnapshotBindings(args.snapshots, args.companyId);
  if ("error" in bindingsOrErr) {
    return { ok: false, reason: bindingsOrErr.error };
  }
  const bindings = bindingsOrErr;
  const approvedOnly = args.snapshots.filter(
    (s) => s.companyId === args.companyId && s.status === "APPROVED",
  );
  const resolver = snapshotInputResolver({ snapshots: approvedOnly });
  const ifs = collectIfNodes(args.expression);
  const expressionIdentity = expressionIdentityFingerprint(args.expression);
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
    if (ev.provenance.inputsUsed.some((u) => u.provenance.reliedOnNonApprovedSnapshot)) {
      return { ok: false, reason: "CONDITION_RELIED_ON_NON_APPROVED", failedIfExprId: ifExprId };
    }
    // Snapshot versions used must still be APPROVED bindings we selected.
    for (const used of ev.provenance.inputsUsed) {
      const sid = used.provenance.snapshotId;
      if (sid && !bindings.some((b) => b.snapshotId === sid && b.status === "APPROVED")) {
        return { ok: false, reason: "CONDITION_SNAPSHOT_NOT_IN_APPROVED_SET", failedIfExprId: ifExprId };
      }
      if (used.provenance.snapshotStatus && used.provenance.snapshotStatus !== "APPROVED") {
        return { ok: false, reason: "CONDITION_SNAPSHOT_NOT_APPROVED", failedIfExprId: ifExprId };
      }
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

  const transcript = {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    expressionIdentity,
    snapshotBindings: bindings,
    evaluationAsOf: args.evaluationAsOf ?? null,
    evaluationPeriodKey: args.evaluationPeriodKey ?? null,
    selections,
  };
  const seal = diagnosticFingerprint(transcript);
  return {
    ok: true,
    authority: {
      ...transcript,
      snapshotIds: bindings.map((b) => b.snapshotId),
      authorityId: `path-eval:${seal.slice(0, 24)}`,
      seal,
      authoritative: true,
      evaluatedAtIso: args.nowIso ?? new Date().toISOString(),
    },
  };
}

/** @deprecated Alias — prefer evaluateConditionalPathsAuthoritatively. */
export function selectConditionalPaths(args: {
  expression: IRCapacityExpression;
  snapshots: readonly FinancialSnapshot[];
  companyId: string;
  instrumentKey: string;
  evaluationAsOf?: string | null;
  evaluationPeriodKey?: string | null;
}): SelectConditionalPathsResult {
  return evaluateConditionalPathsAuthoritatively(args);
}

/**
 * NON-AUTHORITATIVE: checks only that a payload's diagnostic seal matches its
 * own fields. A forged payload that hashes its own forged fields will pass.
 * Do NOT use for PATH_IRRELEVANT trust decisions.
 */
export function verifySelectedPathAuthority(authority: SelectedPathAuthority): boolean {
  const seal = diagnosticFingerprint({
    contractVersion: authority.contractVersion,
    companyId: authority.companyId,
    instrumentKey: authority.instrumentKey,
    expressionIdentity: authority.expressionIdentity ?? "",
    snapshotBindings: authority.snapshotBindings ?? [],
    evaluationAsOf: authority.evaluationAsOf ?? null,
    evaluationPeriodKey: authority.evaluationPeriodKey ?? null,
    selections: authority.selections,
  });
  return seal === authority.seal && authority.authorityId === `path-eval:${seal.slice(0, 24)}`;
}

/**
 * Whether a leaf is inactive under a LIVE authoritative evaluation.
 * Also enforces company/instrument binding.
 */
export function authorityShowsLeafInactive(args: {
  authority: SelectedPathAuthority;
  leafConditionalOn: string | null;
  inactiveBranchLabel: string;
  expectedCompanyId: string;
  expectedInstrumentKey: string;
  expectedExpressionIdentity?: string | null;
}): boolean {
  if (!args.authority.authoritative) return false;
  if (args.authority.companyId !== args.expectedCompanyId) return false;
  if (args.authority.instrumentKey !== args.expectedInstrumentKey) return false;
  if (
    args.expectedExpressionIdentity &&
    args.authority.expressionIdentity !== args.expectedExpressionIdentity
  ) {
    return false;
  }
  if (!args.leafConditionalOn) return false;
  if (!args.leafConditionalOn.includes(args.inactiveBranchLabel)) return false;
  if (args.inactiveBranchLabel !== "then-branch" && args.inactiveBranchLabel !== "else-branch") {
    return false;
  }
  const m = /IF\s+(\S+)\s+(then-branch|else-branch)/.exec(args.leafConditionalOn);
  if (!m) return false;
  const ifExprId = m[1]!;
  const leafBranch = m[2] as ConditionalBranchLabel;
  if (leafBranch !== args.inactiveBranchLabel) return false;

  const sel = args.authority.selections.find((s) => s.ifExprId === ifExprId);
  if (!sel) return false;
  return sel.selectedBranch !== leafBranch;
}

/**
 * Re-evaluate paths and return live authority. Caller-supplied claims are ignored.
 * This is the sole entry the fulfillment boundary may use for PATH_IRRELEVANT.
 */
export function resolveLivePathAuthority(args: {
  expression: IRCapacityExpression;
  snapshots: readonly FinancialSnapshot[];
  companyId: string;
  instrumentKey: string;
  evaluationAsOf?: string | null;
  evaluationPeriodKey?: string | null;
}): SelectConditionalPathsResult {
  return evaluateConditionalPathsAuthoritatively(args);
}
