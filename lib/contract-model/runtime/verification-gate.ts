/**
 * PHASE-4 VERIFICATION GATE - migration step 3. THE ONE MODULE THAT OWNS THE RUNTIME SEMANTICS.
 *
 * Phase 4 honours Phase-3 representation SUFFICIENCY at four sites and, until this step, had never
 * been given Phase-3 semantic VERIFICATION state. The envelope (verification-envelope.ts) carries
 * that state; this module decides what it MEANS for execution. The four call sites - 4A node entry,
 * 4A whole rule, 4C dominance, 4D legal floor - ask this module for a result. None of them
 * re-derives policy, so there is one interpretation, not four dialects.
 *
 * The predicate, stated once:
 *
 *   a MATERIAL finding x its scope relation to the node being evaluated.
 *
 * The verification STATUS is never the predicate. REVIEW_REQUIRED without a material finding does
 * not block. VERIFICATION_INCOMPLETE / VERIFICATION_FAILED do not block under ALLOW_MISSING; they
 * are made visible (a 4A diagnostic, a 4C REVIEW_REQUIRED floor) and kept distinguishable from a
 * material defect, because incompleteness is a statement about evidence, not about a value.
 *
 * Matching is exprId set membership against the record of the unit that OWNS the node. No string
 * matching, no path parsing, no array positions - the resolver already did that Phase-3 side.
 *
 * Fail-closed rules: identity mismatch, a UNIT-scoped material finding, and (under REQUIRE only) a
 * missing unit record all block the WHOLE unit. Nothing is salvaged from a stale record.
 *
 * Inertness: with no envelope under ALLOW_MISSING every function here returns "no block" without
 * touching anything, and the evaluator's memo key is unchanged - so existing Phase-4 execution is
 * byte-identical (scripts/phase-4-inertness-probe.ts).
 *
 * Pure. No model, no verifier, no retrieval, no clock, no filesystem.
 */
import type { EvaluationResult, RuntimeDiagnostic } from "./types";
import type { CapacityLimitation, CapacityLimitationCode, CapacityStatus } from "./capacity/types";
import {
  compareVerificationIdentity,
  DEFAULT_VERIFICATION_POLICY,
  identityStrengthOf,
  type IdentityMismatchField,
  type RuntimeVerificationEnvelope,
  type RuntimeVerificationIdentity,
  type RuntimeVerificationUnit,
  type VerificationBlock,
  type VerificationBlockReason,
  type VerificationGatePolicy,
  type VerificationIdentityStrength,
} from "./verification-envelope";

// ---------------------------------------------------------------------------
// Runtime identity as the gate sees it
// ---------------------------------------------------------------------------

/**
 * What the runtime knows about the unit it is executing. A bare evaluateExpression call may know
 * only the unit id (and company/instrument from its context); evaluateRule, 4C and 4D know the
 * whole IR object and supply the full trio. Only the fields the runtime actually knows are
 * compared - an unknown field can neither confirm nor contradict a claim, and the comparison
 * records which fields it covered so the weakness is visible rather than hidden.
 */
export type KnownRuntimeIdentity = Partial<RuntimeVerificationIdentity>;

const IDENTITY_FIELDS: IdentityMismatchField[] = ["ruleOrDefinitionId", "companyId", "instrumentKey", "irSchemaVersion", "compilerVersion", "sourceContentVersion"];

export interface IdentityCheck {
  matches: boolean;
  mismatches: IdentityMismatchField[];
  compared: IdentityMismatchField[];
  strength: VerificationIdentityStrength;
}

/** Compares a unit record's claimed identity against the runtime's known identity, field by field, strictly (null is a value, not a wildcard). */
export function checkIdentity(claimed: RuntimeVerificationIdentity, known: KnownRuntimeIdentity): IdentityCheck {
  const compared = IDENTITY_FIELDS.filter((f) => known[f] !== undefined);
  if (compared.length === IDENTITY_FIELDS.length) {
    const full = compareVerificationIdentity(claimed, known as RuntimeVerificationIdentity);
    return { matches: full.matches, mismatches: full.mismatches, compared, strength: full.strength };
  }
  const mismatches = compared.filter((f) => claimed[f] !== known[f]);
  return { matches: mismatches.length === 0, mismatches, compared, strength: identityStrengthOf(claimed) };
}

// ---------------------------------------------------------------------------
// Verification status interpretation - carried statuses become three states
// ---------------------------------------------------------------------------

/**
 * The Phase-3 status collapses to what the runtime may conclude from it. The literals are the
 * Phase-3 SemanticVerificationStatus values; the runtime must not import the compiler, so they are
 * restated here and cross-checked against the compiler type by test.
 */
export type VerificationCoverage =
  /** No unit record at all. */
  | "NOT_ATTEMPTED"
  /** VERIFICATION_INCOMPLETE or VERIFICATION_FAILED - evidence or infrastructure ran out; says nothing about any value. */
  | "ATTEMPTED_INCOMPLETE"
  /** VERIFIED_*, REVIEW_REQUIRED or MATERIAL_DISCREPANCY - the verifier finished; its findings, not its status, carry the consequences. */
  | "COMPLETED"
  /** A status string this gate does not know. Treated like ATTEMPTED_INCOMPLETE: reviewable, never silently clean. */
  | "UNRECOGNIZED";

const COMPLETED_STATUSES = new Set(["VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS", "REVIEW_REQUIRED", "MATERIAL_DISCREPANCY"]);
// NOT_VERIFIED is a record that says verification was not performed. It is not COMPLETED and it
// must never read as clean, so it takes the incomplete path (visible, REVIEW_REQUIRED at 4C, no block).
const INCOMPLETE_STATUSES = new Set(["VERIFICATION_INCOMPLETE", "VERIFICATION_FAILED", "NOT_VERIFIED"]);

export function interpretVerificationStatus(status: string): Exclude<VerificationCoverage, "NOT_ATTEMPTED"> {
  if (COMPLETED_STATUSES.has(status)) return "COMPLETED";
  if (INCOMPLETE_STATUSES.has(status)) return "ATTEMPTED_INCOMPLETE";
  return "UNRECOGNIZED";
}

// ---------------------------------------------------------------------------
// Unit assessment - everything the four sites need about one unit, computed once
// ---------------------------------------------------------------------------

export interface UnitAssessment {
  unitId: string;
  policy: VerificationGatePolicy;
  /** The record bound to this unit, or null when the envelope has none (or has more than one, which is refused). */
  record: RuntimeVerificationUnit | null;
  coverage: VerificationCoverage;
  identity: IdentityCheck | null;
  /** A whole-unit block, if any. UNIT > NODE: when this is set no node of the unit executes. */
  block: VerificationBlock | null;
  /** True when verification was attempted and did not finish (or its status is unrecognized). Never a block by itself. */
  incomplete: boolean;
  /** Findings that name specific nodes, indexed for the node predicate. Empty when the unit is blocked as a whole. */
  nodeFindingsByExprId: ReadonlyMap<string, string[]>;
}

const NO_NODE_FINDINGS: ReadonlyMap<string, string[]> = new Map();

/** True when the gate has anything to do at all. With neither an envelope nor an explicit policy, every site is inert. */
export function gateIsActive(verification: RuntimeVerificationEnvelope | undefined, policy: VerificationGatePolicy | undefined): boolean {
  return verification !== undefined || (policy !== undefined && policy !== DEFAULT_VERIFICATION_POLICY);
}

function block(reason: VerificationBlockReason, scope: "UNIT" | "NODE", unitId: string, exprId: string | null, findingIds: string[], mismatches: IdentityMismatchField[], identityStrength: VerificationIdentityStrength | null, message: string): VerificationBlock {
  return { reason, scope, unitId, exprId, findingIds: [...findingIds].sort(), mismatches, identityStrength, message };
}

/**
 * Assesses one unit against the envelope under the policy. This is the single place that decides
 * whether a unit is blocked as a whole; blocksUnit and blocksNode read it.
 *
 * `unitId` null means the expression belongs to no verifiable unit (a shared-capacity cap, or a bare
 * evaluateExpression call that supplied no unit identity). Under ALLOW_MISSING that is simply
 * ungated; under REQUIRE it fails closed, because the caller asked that nothing unverified execute
 * and nothing can vouch for an expression with no identity.
 */
export function assessUnit(unitId: string | null, verification: RuntimeVerificationEnvelope | undefined, policy: VerificationGatePolicy | undefined, known: KnownRuntimeIdentity | null): UnitAssessment {
  const p = policy ?? DEFAULT_VERIFICATION_POLICY;
  const id = unitId ?? "";
  const none = (coverage: VerificationCoverage, b: VerificationBlock | null): UnitAssessment =>
    ({ unitId: id, policy: p, record: null, coverage, identity: null, block: b, incomplete: false, nodeFindingsByExprId: NO_NODE_FINDINGS });

  if (unitId === null) {
    if (p === "REQUIRE") return none("NOT_ATTEMPTED", block("REQUIRED_VERIFICATION_MISSING", "UNIT", id, null, [], [], null, "policy REQUIRE: the expression belongs to no verifiable unit (no unit identity was supplied), so nothing can vouch for it"));
    return none("NOT_ATTEMPTED", null);
  }
  const records = verification?.units.filter((u) => u.identity.ruleOrDefinitionId === unitId) ?? [];
  if (records.length === 0) {
    if (p === "REQUIRE") return none("NOT_ATTEMPTED", block("REQUIRED_VERIFICATION_MISSING", "UNIT", id, null, [], [], null, verification ? `policy REQUIRE: the envelope carries no verification record for ${unitId}; absence of verification is not evidence of correctness` : `policy REQUIRE: no verification envelope was supplied, so ${unitId} is unverified`));
    return none("NOT_ATTEMPTED", null);
  }
  if (records.length > 1) {
    // Two records claim the same unit. Nothing is chosen between them - the same rule as duplicate rule identity at 4C.
    return none("COMPLETED", block("AMBIGUOUS_UNIT_RECORD", "UNIT", id, null, records.flatMap((r) => r.materialFindings.map((f) => f.findingId)), [], null, `the envelope carries ${records.length} verification records for ${unitId}; none is chosen between them`));
  }
  const record = records[0]!;
  const coverage = interpretVerificationStatus(record.verificationStatus);
  const incomplete = coverage !== "COMPLETED";
  const identity = known ? checkIdentity(record.identity, known) : null;
  const base = { unitId: id, policy: p, record, coverage, identity, incomplete };

  if (identity && !identity.matches) {
    return { ...base, block: block("IDENTITY_MISMATCH", "UNIT", id, null, record.materialFindings.map((f) => f.findingId), identity.mismatches, identity.strength, `the verification record for ${unitId} disagrees with the IR in hand on ${identity.mismatches.join(", ")}; a verification that saw a different IR is not salvaged`), nodeFindingsByExprId: NO_NODE_FINDINGS };
  }
  const unitFindings = record.materialFindings.filter((f) => f.scope === "UNIT");
  if (unitFindings.length > 0) {
    return { ...base, block: block("MATERIAL_UNIT_FINDING", "UNIT", id, null, unitFindings.map((f) => f.findingId), [], record.identityStrength, `${unitFindings.length} MATERIAL finding(s) on ${unitId} could not be scoped to a node (${[...new Set(unitFindings.map((f) => f.findingType))].sort().join(", ")}); the whole unit is refused`), nodeFindingsByExprId: NO_NODE_FINDINGS };
  }
  const byExpr = new Map<string, string[]>();
  for (const f of record.materialFindings) {
    if (f.scope !== "NODE") continue;
    for (const e of f.exprIds) byExpr.set(e, [...(byExpr.get(e) ?? []), f.findingId]);
  }
  return { ...base, block: null, nodeFindingsByExprId: byExpr };
}

// ---------------------------------------------------------------------------
// The two predicates
// ---------------------------------------------------------------------------

/** Whether the WHOLE unit is blocked: REQUIRE without a record, identity mismatch, or a UNIT-scoped MATERIAL finding. Status alone never blocks. */
export function blocksUnit(unitId: string | null, verification: RuntimeVerificationEnvelope | undefined, policy: VerificationGatePolicy | undefined, known: KnownRuntimeIdentity | null): VerificationBlock | null {
  return assessUnit(unitId, verification, policy, known).block;
}

/** Whether this node is blocked: the unit is, or a MATERIAL NODE finding names exactly this exprId. Exact set membership - nothing fuzzy. */
export function blocksNode(unitId: string | null, exprId: string | null, verification: RuntimeVerificationEnvelope | undefined, policy: VerificationGatePolicy | undefined, known: KnownRuntimeIdentity | null): VerificationBlock | null {
  return blocksNodeIn(assessUnit(unitId, verification, policy, known), exprId);
}

/** The node predicate over an assessment computed once per unit entry (what the evaluator uses). */
export function blocksNodeIn(a: UnitAssessment, exprId: string | null): VerificationBlock | null {
  if (a.block) return a.block;
  if (exprId === null) return null;
  const findingIds = a.nodeFindingsByExprId.get(exprId);
  if (!findingIds) return null;
  return block("MATERIAL_NODE_FINDING", "NODE", a.unitId, exprId, findingIds, [], a.record?.identityStrength ?? null, `MATERIAL verification finding(s) ${[...findingIds].sort().join(", ")} name this exact node; its value is not supported by the source and is not evaluated`);
}

// ---------------------------------------------------------------------------
// 4A diagnostics
// ---------------------------------------------------------------------------

export const VERIFICATION_BLOCK_DIAGNOSTIC = "MATERIAL_VERIFICATION_FINDING" as const;
export const VERIFICATION_INCOMPLETE_DIAGNOSTIC = "VERIFICATION_INCOMPLETE" as const;

/** The informational 4A diagnostic recorded once on entry to an incompletely verified unit. Status EXECUTABLE: it imposes nothing. */
export function incompleteDiagnostic(a: UnitAssessment): RuntimeDiagnostic | null {
  if (!a.incomplete || !a.record) return null;
  return { code: VERIFICATION_INCOMPLETE_DIAGNOSTIC, status: "EXECUTABLE", message: `verification of ${a.unitId} did not complete (${a.record.verificationStatus}); this is not evidence that any value is wrong and it does not block execution, but nothing here is verified clean`, exprId: null, provenance: null };
}

/** Every verification block recorded in an evaluation, in diagnostic order. */
export function verificationBlocksIn(e: EvaluationResult | null): VerificationBlock[] {
  return e?.diagnostics.flatMap((d) => (d.code === VERIFICATION_BLOCK_DIAGNOSTIC && d.verification ? [d.verification] : [])) ?? [];
}

/** Whether an evaluation entered any unit whose verification did not complete. */
export function verificationIncompleteIn(e: EvaluationResult | null): boolean {
  return e?.diagnostics.some((d) => d.code === VERIFICATION_INCOMPLETE_DIAGNOSTIC) ?? false;
}

// ---------------------------------------------------------------------------
// 4C - VERIFICATION_DOMINANCE, a table beside SUFFICIENCY_DOMINANCE, never merged with it
// ---------------------------------------------------------------------------

/**
 * What the verification state of a capacity does to its status, exhaustively. `status` is a FLOOR
 * combined with the sufficiency floor through the existing CAPACITY_STATUS_PRECEDENCE worst-of -
 * so no arithmetic result can lift it, and neither table can lower the other's floor.
 *
 * MATERIAL_NODE_HIT is UNSUPPORTED rather than REVIEW_REQUIRED: a number the verifier says nothing
 * supports is not a reviewable quantity, it is not a quantity. A UNIT-class block is REVIEW_REQUIRED:
 * the rule as a whole needs a human before any of it is relied on. Incompleteness floors at
 * REVIEW_REQUIRED under its own limitation code, so it never reads as a material defect.
 */
export type VerificationCondition = "NONE" | "MATERIAL_NODE_HIT" | "MATERIAL_UNIT_FINDING" | "IDENTITY_MISMATCH" | "REQUIRED_VERIFICATION_MISSING" | "AMBIGUOUS_UNIT_RECORD" | "ATTEMPTED_INCOMPLETE";

export const VERIFICATION_DOMINANCE: Record<VerificationCondition, { status: CapacityStatus | null; limitation: CapacityLimitationCode | null }> = {
  NONE: { status: null, limitation: null },
  MATERIAL_NODE_HIT: { status: "UNSUPPORTED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
  MATERIAL_UNIT_FINDING: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
  IDENTITY_MISMATCH: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
  REQUIRED_VERIFICATION_MISSING: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
  AMBIGUOUS_UNIT_RECORD: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_MATERIAL_FINDING" },
  ATTEMPTED_INCOMPLETE: { status: "REVIEW_REQUIRED", limitation: "PHASE3_VERIFICATION_INCOMPLETE" },
};

const conditionOfBlock = (b: VerificationBlock): VerificationCondition =>
  b.reason === "MATERIAL_NODE_FINDING" ? "MATERIAL_NODE_HIT" : b.reason;

export interface CapacityVerificationFloor {
  /** Every condition that applied, most severe first. NONE when nothing did. */
  conditions: VerificationCondition[];
  /** Status floors to fold into the capacity's worst-of. */
  floors: CapacityStatus[];
  limitations: CapacityLimitation[];
}

/**
 * The 4C floor for one capacity: its own unit's assessment plus every block or incompleteness the
 * evaluation of its capacity-driving expression actually hit (including inside expanded definitions
 * and referenced rules, whose owner is a different unit). "Hit" means the evaluator reached the node;
 * a disputed node on a branch that was never taken did not drive this capacity.
 */
export function capacityVerificationFloor(own: UnitAssessment, evaluation: EvaluationResult | null, capacityNodeId: string): CapacityVerificationFloor {
  const seen = new Map<VerificationCondition, { message: string; refs: string[] }>();
  const note = (c: VerificationCondition, message: string, refs: string[]) => {
    if (c === "NONE") return;
    const prev = seen.get(c);
    seen.set(c, { message: prev ? prev.message : message, refs: [...new Set([...(prev?.refs ?? []), ...refs])].sort() });
  };
  if (own.block) note(conditionOfBlock(own.block), own.block.message, [capacityNodeId, ...own.block.findingIds]);
  for (const b of verificationBlocksIn(evaluation)) note(conditionOfBlock(b), b.unitId === own.unitId ? b.message : `${b.message} (in ${b.unitId}, which this capacity depends on)`, [capacityNodeId, ...b.findingIds]);
  if (own.incomplete && own.record) note("ATTEMPTED_INCOMPLETE", `verification of ${own.unitId} did not complete (${own.record.verificationStatus}); the capacity is reviewable, not defective`, [capacityNodeId]);
  else if (verificationIncompleteIn(evaluation)) note("ATTEMPTED_INCOMPLETE", `a unit this capacity depends on was not completely verified; the capacity is reviewable, not defective`, [capacityNodeId]);

  const order: VerificationCondition[] = ["MATERIAL_NODE_HIT", "MATERIAL_UNIT_FINDING", "IDENTITY_MISMATCH", "AMBIGUOUS_UNIT_RECORD", "REQUIRED_VERIFICATION_MISSING", "ATTEMPTED_INCOMPLETE"];
  const conditions = order.filter((c) => seen.has(c));
  if (conditions.length === 0) return { conditions: ["NONE"], floors: [], limitations: [] };
  const floors = conditions.map((c) => VERIFICATION_DOMINANCE[c].status).filter((s): s is CapacityStatus => s !== null);
  const limitations: CapacityLimitation[] = conditions.map((c) => ({ code: VERIFICATION_DOMINANCE[c].limitation!, message: `[${c}] ${seen.get(c)!.message}`, refs: seen.get(c)!.refs }));
  return { conditions, floors, limitations };
}

// ---------------------------------------------------------------------------
// 4D - the legal floor for transaction simulation
// ---------------------------------------------------------------------------

export const VERIFICATION_MATERIAL_LIMITATION = "PHASE3_VERIFICATION_MATERIAL_FINDING" as const;
export const VERIFICATION_INCOMPLETE_LIMITATION = "PHASE3_VERIFICATION_INCOMPLETE" as const;

/** Whether a capacity entry's limitations show it depends on verification-blocked legal state. */
export function entryHasVerificationBlock(limitations: readonly { code: string }[]): boolean {
  return limitations.some((l) => l.code === VERIFICATION_MATERIAL_LIMITATION);
}

/** Whether a capacity entry's limitations show its verification did not complete. */
export function entryHasIncompleteVerification(limitations: readonly { code: string }[]): boolean {
  return limitations.some((l) => l.code === VERIFICATION_INCOMPLETE_LIMITATION);
}
