/**
 * VERIFIED EXECUTION - the strict Phase-3 -> Phase-4 product boundary (verification-gate migration step 4).
 *
 * The runtime primitives (evaluateCapacityState, simulateTransaction, ...) deliberately keep
 * DEFAULT_VERIFICATION_POLICY = ALLOW_MISSING so that tests, scripts and historical fixtures keep
 * their exact meaning. Product execution must never inherit that migration default. This module is
 * the one place product code may enter Phase 4, and its invariant is:
 *
 *   Headroom executes legal capacity or transaction logic in product mode only from IR that has a
 *   corresponding verification artifact, under policy REQUIRE.
 *
 * REQUIRE is not a parameter here. There is no field to set, no override and no flag - a caller
 * cannot downgrade it, and the architecture test in tests/contract-model/verified-execution.test.ts
 * keeps product surfaces from importing the raw primitives around this module.
 *
 * What this module does NOT do: call a model, retrieve source, re-verify anything, mutate findings,
 * reimplement capacity or simulation arithmetic, or accept a caller's claim that verification
 * happened. It takes the actual Phase-3 artifacts (IR units + verification results + the identity
 * of the IR the verifier saw), binds them, builds the envelope through the certified resolver
 * immediately before execution, and hands the runtime that envelope under REQUIRE.
 *
 *   Phase 3 compile -> Phase 3 verify -> [here] resolve envelope -> strict Phase-4 execution.
 *
 * Layering: this file sits BESIDE the runtime, not inside it. The runtime may not import the
 * compiler; the resolver (an adapter) does, type-only, and so does this boundary.
 */
import type { IRDefinition, IRRule, IRSharedCapacity } from "./ir/types";
import type { SemanticVerificationResult } from "./compiler/semantic-verification/types";
import type { InputResolver, SerializedRuntimeValue } from "./runtime/types";
import { buildCapacityGraph } from "./runtime/capacity/graph";
import { evaluateCapacityState } from "./runtime/capacity/state";
import type {
  CapacityAmount,
  CapacityGraph,
  CapacityState,
  CapacityStateEntry,
  LedgerPolicy,
  LedgerUsageRecord,
  ReclassificationElection,
} from "./runtime/capacity/types";
import { simulateTransaction } from "./runtime/transaction/simulate";
import { buildOverlay } from "./runtime/transaction/overlay";
import type {
  ChangeMetricEffect,
  EventStateEffect,
  HypotheticalTransaction,
  SelectedPath,
  TransactionEffect,
  TransactionQuantity,
  TransactionSimulationResult,
} from "./runtime/transaction/types";
import { assertRestoreAuthority, UNAUTHORIZED_RESTORE_CODE } from "./restore-authority";

/**
 * Re-export 4D caller types so product / sequential composition never imports
 * `runtime/capacity/*` or `runtime/transaction/*` execution surfaces.
 */
export type {
  HypotheticalTransaction,
  SelectedPath,
  TransactionSimulationResult,
  TransactionQuantity,
  TransactionEffect,
  ChangeMetricEffect,
  EventStateEffect,
  CapacityGraph,
  CapacityState,
  CapacityStateEntry,
  CapacityAmount,
  LedgerUsageRecord,
  LedgerPolicy,
  ReclassificationElection,
  InputResolver,
};
export { assertRestoreAuthority, formatRestoreReason, extractRestoreAuthority, UNAUTHORIZED_RESTORE_CODE } from "./restore-authority";
import { hashOf } from "./runtime/input/identity";
import { compareVerificationIdentity, identityStrengthOf, type RuntimeVerificationEnvelope, type RuntimeVerificationIdentity, type VerificationBlockReason, type VerificationIdentityStrength } from "./runtime/verification-envelope";
import { blocksUnit, interpretVerificationStatus, type VerificationCoverage as UnitCoverage } from "./runtime/verification-gate";
import { resolveRuntimeVerificationEnvelope, type ResolverUnitInput } from "./verification-envelope/resolver";

/** The only policy this boundary executes under. A constant, not an argument. */
export const VERIFIED_EXECUTION_POLICY = "REQUIRE" as const;

// ---------------------------------------------------------------------------
// The input package - the smallest complete thing product execution needs
// ---------------------------------------------------------------------------

/**
 * One unit's verification, as a Phase-3 run should persist it beside the IR it verified. This is
 * the paired record whose absence produced the 411-of-498 preservation gap in the historical
 * corpus: the verifier's result alone does not say WHICH compile of the unit it saw, so the run
 * that produced both must record the identity of the IR it verified. That claim is what the gate
 * checks against the IR actually being executed; a stale pairing fails closed.
 */
export interface VerifiedUnitArtifact {
  ruleOrDefinitionId: string;
  kind: "RULE" | "DEFINITION" | "SHARED_CAPACITY";
  /** The identity (id, company, instrument, schema/compiler/source versions) of the IR unit the verifier saw. */
  verifiedIdentity: RuntimeVerificationIdentity;
  /** The Phase-3 verification result, verbatim. Never mutated here. */
  result: SemanticVerificationResult;
}

export interface VerifiedExecutionPackage {
  companyId: string;
  instrumentKey: string;
  rules: readonly IRRule[];
  definitions?: readonly IRDefinition[];
  sharedCapacities?: readonly IRSharedCapacity[];
  /** The verification artifacts for the units above. Empty means unverified, and unverified does not execute here. */
  verifications: readonly VerifiedUnitArtifact[];
}

/** No `policy` field exists on purpose. */
export interface VerifiedCapacityArgs {
  package: VerifiedExecutionPackage;
  /** The Phase-4B input resolver over the approved financial snapshot set. */
  inputs: InputResolver;
  ledger?: readonly LedgerUsageRecord[];
  ledgerPolicy?: LedgerPolicy;
  asOf?: string | null;
}

export interface VerifiedTransactionArgs extends VerifiedCapacityArgs {
  transaction: HypotheticalTransaction;
  selectedPath: SelectedPath;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type BoundaryRefusalCode =
  /** No verification artifact was supplied at all. Unverified IR does not execute here. */
  | "VERIFICATION_ARTIFACT_INCOMPLETE"
  /** A verification artifact names a unit the package does not carry, names it twice, or contradicts itself about which unit it is for. */
  | "VERIFICATION_IDENTITY_UNBOUND"
  /** The IR package is not one instrument's consistent unit set (a unit for another company/instrument, or an id claimed twice). */
  | "IR_PACKAGE_INCONSISTENT"
  /** A rule's permission is gated on another rule's satisfaction (a cross-rule condition or a REQUIRES/LIMITED_BY source dependency). The runtime has no certified cross-rule satisfaction evaluator yet (PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE), so the package fails closed: the gate is never treated as satisfied and an UNLIMITED_CAPACITY behind it never executes. */
  | "CROSS_RULE_GATE_NOT_EXECUTABLE"
  /** RESTORE_CAPACITY without contractual authority marker — shared product/verified boundary (TE-D2). */
  | "UNAUTHORIZED_CAPACITY_RESTORE";

export interface BoundaryRefusal { code: BoundaryRefusalCode; message: string; refs: string[] }

export interface VerificationCoverage {
  unitsInPackage: number;
  unitsWithVerification: number;
  /** Units the package executes that carry no verification artifact. Under REQUIRE each fails closed inside the runtime; listed so partial coverage can never read as verified. */
  unitsMissingVerification: string[];
  /** Units the gate refuses as a whole, and why. NODE-scoped findings are not listed: they are node-local and visible on the evaluation. */
  unitsRefusedByGate: { unitId: string; reason: VerificationBlockReason; identityStrength: VerificationIdentityStrength | null }[];
  /** Units whose verification exists but did not complete (or is unrecognized) - reviewable, never clean, never a defect by itself. */
  unitsIncompletelyVerified: string[];
  identityStrength: Record<VerificationIdentityStrength, number>;
  verificationStatuses: Record<string, number>;
  /** True only when every executed unit has a complete, identity-matched verification record. Never true under partial coverage. */
  complete: boolean;
}

export type VerifiedCapacityResult =
  | { outcome: "REFUSED"; policy: typeof VERIFIED_EXECUTION_POLICY; packageHash: string; refusals: BoundaryRefusal[] }
  | { outcome: "EXECUTED"; policy: typeof VERIFIED_EXECUTION_POLICY; packageHash: string; envelope: RuntimeVerificationEnvelope; coverage: VerificationCoverage; graph: CapacityGraph; state: CapacityState };

export type VerifiedTransactionResult =
  | { outcome: "REFUSED"; policy: typeof VERIFIED_EXECUTION_POLICY; packageHash: string; refusals: BoundaryRefusal[] }
  | { outcome: "EXECUTED"; policy: typeof VERIFIED_EXECUTION_POLICY; packageHash: string; envelope: RuntimeVerificationEnvelope; coverage: VerificationCoverage; capacity: CapacityState; simulation: TransactionSimulationResult };

// ---------------------------------------------------------------------------
// Binding: artifacts -> envelope, immediately before execution
// ---------------------------------------------------------------------------

const unitIdOf = (u: IRRule | IRDefinition): string => ("ruleId" in u ? u.ruleId : u.definitionId);

type BoundUnit = IRRule | IRDefinition | IRSharedCapacity;
const anyUnitIdOf = (u: BoundUnit): string => ("ruleId" in u ? u.ruleId : "definitionId" in u ? u.definitionId : u.sharedCapId);
const anyKindOf = (u: BoundUnit): "RULE" | "DEFINITION" | "SHARED_CAPACITY" => ("ruleId" in u ? "RULE" : "definitionId" in u ? "DEFINITION" : "SHARED_CAPACITY");

interface Bound { refusals: BoundaryRefusal[]; envelope: RuntimeVerificationEnvelope | null; units: BoundUnit[] }

/**
 * Validates the package and builds the envelope through the certified resolver against the exact
 * IR being executed. The resolver derives each record's identity from the unit in hand (that is
 * what path->exprId resolution needs); the record's identity is then REPLACED by the artifact's
 * `verifiedIdentity` - the verifier's own claim - so the gate compares claim against reality and
 * fails closed on any disagreement. Nothing is synthesized: an empty artifact set is a refusal, not
 * an empty envelope.
 */
function bind(pkg: VerifiedExecutionPackage): Bound {
  const refusals: BoundaryRefusal[] = [];
  // Phase 3 certification closure: a shared capacity is a verified semantic unit like a rule or a definition. Under the
  // REQUIRE policy a shared capacity the package carries without a bound, clean verification artifact refuses the whole
  // package - a pool that changes every member's capacity never executes unverified.
  const units: BoundUnit[] = [...pkg.rules, ...(pkg.definitions ?? []), ...(pkg.sharedCapacities ?? [])];

  // 1. one instrument, each unit once
  const outOfScope = units.filter((u) => u.companyId !== pkg.companyId || u.instrumentKey !== pkg.instrumentKey).map(anyUnitIdOf).sort();
  if (outOfScope.length > 0) refusals.push({ code: "IR_PACKAGE_INCONSISTENT", message: `${outOfScope.length} unit(s) belong to another company or instrument than the package states`, refs: outOfScope });
  const seen = new Map<string, number>();
  for (const u of units) seen.set(anyUnitIdOf(u), (seen.get(anyUnitIdOf(u)) ?? 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([id]) => id).sort();
  if (dup.length > 0) refusals.push({ code: "IR_PACKAGE_INCONSISTENT", message: `unit id(s) claimed more than once in the package: nothing is chosen between them`, refs: dup });

  // 2. verification must exist
  if (pkg.verifications.length === 0) refusals.push({ code: "VERIFICATION_ARTIFACT_INCOMPLETE", message: "no verification artifact was supplied; unverified IR does not execute at the product boundary", refs: [] });

  // 3. every artifact binds to exactly one unit of the stated kind and agrees with itself
  const byId = new Map<string, BoundUnit>(units.map((u) => [anyUnitIdOf(u), u]));
  const claimed = new Map<string, number>();
  const inputs: ResolverUnitInput[] = [];
  const claimsById = new Map<string, RuntimeVerificationIdentity>();
  for (const a of pkg.verifications) {
    claimed.set(a.ruleOrDefinitionId, (claimed.get(a.ruleOrDefinitionId) ?? 0) + 1);
    const unit = byId.get(a.ruleOrDefinitionId);
    if (!unit) { refusals.push({ code: "VERIFICATION_IDENTITY_UNBOUND", message: `verification artifact names ${a.ruleOrDefinitionId}, which the package does not carry`, refs: [a.ruleOrDefinitionId] }); continue; }
    const actualKind = anyKindOf(unit);
    if (actualKind !== a.kind) { refusals.push({ code: "VERIFICATION_IDENTITY_UNBOUND", message: `verification artifact says ${a.ruleOrDefinitionId} is a ${a.kind}; the package carries a ${actualKind}`, refs: [a.ruleOrDefinitionId] }); continue; }
    if (a.verifiedIdentity.ruleOrDefinitionId !== a.ruleOrDefinitionId) { refusals.push({ code: "VERIFICATION_IDENTITY_UNBOUND", message: `verification artifact for ${a.ruleOrDefinitionId} carries an identity claim for ${a.verifiedIdentity.ruleOrDefinitionId}`, refs: [a.ruleOrDefinitionId, a.verifiedIdentity.ruleOrDefinitionId] }); continue; }
    inputs.push({ kind: a.kind, unit, verification: a.result });
    claimsById.set(a.ruleOrDefinitionId, a.verifiedIdentity);
  }
  const twice = [...claimed].filter(([, n]) => n > 1).map(([id]) => id).sort();
  if (twice.length > 0) refusals.push({ code: "VERIFICATION_IDENTITY_UNBOUND", message: `more than one verification artifact claims the same unit; none is chosen`, refs: twice });

  const sharedProblems: string[] = [];
  for (const cap of pkg.sharedCapacities ?? []) {
    const art = pkg.verifications.find((a) => a.ruleOrDefinitionId === cap.sharedCapId && a.kind === "SHARED_CAPACITY");
    if (!art) { sharedProblems.push(`${cap.sharedCapId}: no verification artifact`); continue; }
    if (interpretVerificationStatus(art.result.status) !== "COMPLETED") sharedProblems.push(`${cap.sharedCapId}: verification ${art.result.status}`);
    if (art.result.findings.some((f) => f.severity === "MATERIAL" && f.ruleOrDefinitionId === cap.sharedCapId)) sharedProblems.push(`${cap.sharedCapId}: material verification finding`);
    const known: RuntimeVerificationIdentity = { ruleOrDefinitionId: cap.sharedCapId, companyId: cap.companyId, instrumentKey: cap.instrumentKey, irSchemaVersion: cap.irSchemaVersion ?? "", compilerVersion: cap.compilerVersion ?? null, sourceContentVersion: cap.sourceContentVersion ?? null };
    if (!compareVerificationIdentity(art.verifiedIdentity, known).matches || identityStrengthOf(art.verifiedIdentity) !== "STRONG") sharedProblems.push(`${cap.sharedCapId}: verified identity does not bind the shared capacity carried (or is WEAK)`);
    // content: the verifier's own IR inventory of the pool (its figures and member set) must describe the pool in hand - a cap
    // expression or membership edited after verification, under an unchanged identity, is a stale artifact and never executes
    const inventoried = (art.result.irInventory?.items ?? []).filter((i) => i.ruleOrDefinitionId === cap.sharedCapId);
    if (inventoried.length === 0) sharedProblems.push(`${cap.sharedCapId}: the verification artifact carries no IR inventory of the pool`);
    else {
      const seenFigures = inventoried.filter((i) => i.numericValue !== null).map((i) => i.numericValue as number).sort((a, b) => a - b);
      const seenMembers = inventoried.filter((i) => i.kind === "DEPENDENCY" && (i.textValue ?? "").startsWith("SHARED_CAP_MEMBER:")).map((i) => (i.textValue as string).slice("SHARED_CAP_MEMBER:".length)).sort();
      if (JSON.stringify(seenFigures) !== JSON.stringify(numericFiguresOf(cap.capExpression))) sharedProblems.push(`${cap.sharedCapId}: cap expression figures differ from the figures the verifier inventoried (stale or mutated pool)`);
      if (JSON.stringify(seenMembers) !== JSON.stringify([...cap.memberRuleIds].sort())) sharedProblems.push(`${cap.sharedCapId}: member set differs from the members the verifier inventoried (stale or mutated pool)`);
    }
  }
  if (sharedProblems.length > 0) refusals.push({ code: "VERIFICATION_ARTIFACT_INCOMPLETE", message: "shared capacity pool(s) are not cleanly verified; under REQUIRE an unverified pool never shapes capacity", refs: sharedProblems.sort() });

  // SEMANTIC FIDELITY: cross-rule gates fail closed. A rule whose availability depends on another rule being satisfied
  // (referencesRuleTargets on a condition, or a REQUIRES / LIMITED_BY source dependency) cannot be executed by this runtime
  // as "satisfied" - whether or not the package has bound the target - because no certified cross-rule satisfaction
  // evaluator exists yet. Refusing here is what keeps an UNLIMITED_CAPACITY behind such a gate from reading as available.
  const gated: string[] = [];
  for (const r of pkg.rules) {
    const conds = r.conditions.filter((c) => (c.referencesRuleTargets?.length ?? 0) > 0).map((c) => `${r.ruleId} ${c.conditionId} -> ${c.referencesRuleTargets!.map((t) => `${t.exactSourceTargetRef} [${t.boundSemanticTargetIds.length > 0 ? `bound:${t.boundSemanticTargetIds.join("+")}` : t.resolutionStatus}]`).join(", ")}`);
    const deps = (r.sourceDependencies ?? []).filter((d) => d.relationshipType === "REQUIRES" || d.relationshipType === "LIMITED_BY").map((d) => `${r.ruleId} ${d.relationshipType} ${d.exactSourceTargetRef} [${d.boundSemanticTargetIds.length > 0 ? `bound:${d.boundSemanticTargetIds.join("+")}` : d.resolutionStatus}]`);
    const unknown = (r.unresolvedDependencies ?? []).filter((d) => (d.relationshipType === "REQUIRES" || d.relationshipType === "LIMITED_BY") && !(r.sourceDependencies ?? []).some((sd) => sd.exactSourceTargetRef === d.targetRef)).map((d) => `${r.ruleId} ${d.relationshipType} ${d.targetRef} [DEPENDENCY_UNKNOWN]`);
    gated.push(...conds, ...deps, ...unknown);
  }
  if (gated.length > 0) refusals.push({ code: "CROSS_RULE_GATE_NOT_EXECUTABLE", message: "PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE: rule(s) are gated on another rule's satisfaction; the runtime has no certified cross-rule satisfaction evaluator, so the gate is never treated as satisfied and the package fails closed", refs: gated.sort() });

  if (refusals.length > 0) return { refusals, envelope: null, units };

  // 4. resolve against the IR in hand, then let the verifier's identity claim stand as the record's identity
  const resolved = resolveRuntimeVerificationEnvelope({ companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, units: inputs }).envelope;
  const envelope: RuntimeVerificationEnvelope = {
    ...resolved,
    units: resolved.units.map((u) => {
      const claim = claimsById.get(u.identity.ruleOrDefinitionId)!;
      return { ...u, identity: claim, identityStrength: identityStrengthOf(claim) };
    }),
  };
  return { refusals, envelope, units };
}

/** Every numeric figure (amount / value / ratio) inside an expression tree, sorted - the same projection ir-inventory.ts walks. */
function numericFiguresOf(root: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const r = v as Record<string, unknown>;
    for (const k of ["amount", "value", "ratio"]) if (typeof r[k] === "number") out.push(r[k] as number);
    for (const [k, x] of Object.entries(r)) if (x && typeof x === "object" && k !== "provenance") walk(x);
  };
  walk(root);
  return out.sort((a, b) => a - b);
}

const knownIdentityOf = (u: BoundUnit): RuntimeVerificationIdentity => ({
  ruleOrDefinitionId: anyUnitIdOf(u), companyId: u.companyId, instrumentKey: u.instrumentKey, irSchemaVersion: u.irSchemaVersion ?? "", compilerVersion: u.compilerVersion ?? null, sourceContentVersion: u.sourceContentVersion ?? null,
});

function coverageOf(units: readonly BoundUnit[], envelope: RuntimeVerificationEnvelope): VerificationCoverage {
  const recorded = new Set(envelope.units.map((u) => u.identity.ruleOrDefinitionId));
  const missing = units.map(anyUnitIdOf).filter((id) => !recorded.has(id)).sort();
  const refused: VerificationCoverage["unitsRefusedByGate"] = [];
  const incomplete: string[] = [];
  const strength: Record<VerificationIdentityStrength, number> = { STRONG: 0, WEAK: 0 };
  const statuses: Record<string, number> = {};
  for (const u of units) {
    const id = anyUnitIdOf(u);
    const b = blocksUnit(id, envelope, VERIFIED_EXECUTION_POLICY, knownIdentityOf(u));
    if (b) refused.push({ unitId: id, reason: b.reason, identityStrength: b.identityStrength });
    const rec = envelope.units.find((x) => x.identity.ruleOrDefinitionId === id);
    if (rec) {
      strength[rec.identityStrength]++;
      statuses[rec.verificationStatus] = (statuses[rec.verificationStatus] ?? 0) + 1;
      const cov: UnitCoverage = interpretVerificationStatus(rec.verificationStatus);
      if (cov !== "COMPLETED") incomplete.push(id);
    }
  }
  refused.sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
  incomplete.sort();
  return {
    unitsInPackage: units.length, unitsWithVerification: units.length - missing.length,
    unitsMissingVerification: missing, unitsRefusedByGate: refused, unitsIncompletelyVerified: incomplete,
    identityStrength: strength, verificationStatuses: statuses,
    complete: missing.length === 0 && refused.every((r) => r.reason !== "IDENTITY_MISMATCH" && r.reason !== "REQUIRED_VERIFICATION_MISSING" && r.reason !== "AMBIGUOUS_UNIT_RECORD") && incomplete.length === 0,
  };
}

const packageHashOf = (pkg: VerifiedExecutionPackage): string =>
  hashOf({ companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, rules: pkg.rules, definitions: pkg.definitions ?? [], sharedCapacities: pkg.sharedCapacities ?? [], verifications: pkg.verifications.map((v) => ({ id: v.ruleOrDefinitionId, kind: v.kind, identity: v.verifiedIdentity, status: v.result.status, findings: v.result.findings, verifierAlgorithmVersion: v.result.verifierAlgorithmVersion, evidenceSetHash: v.result.evidenceSetHash ?? null })) });

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Capacity state over verified IR, under REQUIRE. Over the existing buildCapacityGraph and
 * evaluateCapacityState - nothing is recomputed differently here; the only additions are the
 * package validation, the envelope built from the actual artifacts, and the coverage report.
 */
export function evaluateVerifiedCapacity(args: VerifiedCapacityArgs): VerifiedCapacityResult {
  const pkg = args.package;
  const packageHash = packageHashOf(pkg);
  const bound = bind(pkg);
  if (!bound.envelope) return { outcome: "REFUSED", policy: VERIFIED_EXECUTION_POLICY, packageHash, refusals: bound.refusals };
  const common = { companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, rules: pkg.rules, sharedCapacities: pkg.sharedCapacities, definitions: pkg.definitions, asOf: args.asOf ?? null };
  const graph = buildCapacityGraph({ ...common, verification: bound.envelope });
  const state = evaluateCapacityState({ ...common, graph, inputs: args.inputs, ledger: args.ledger, ledgerPolicy: args.ledgerPolicy, verification: bound.envelope, policy: VERIFIED_EXECUTION_POLICY });
  return { outcome: "EXECUTED", policy: VERIFIED_EXECUTION_POLICY, packageHash, envelope: bound.envelope, coverage: coverageOf(bound.units, bound.envelope), graph, state };
}

/**
 * Transaction simulation over verified IR, under REQUIRE. The pre-state is produced HERE by the
 * verified capacity path from the same package - a caller cannot hand in a state or graph of its
 * own and call it verified. Simulation itself is the existing simulateTransaction.
 */
export function simulateVerifiedTransaction(args: VerifiedTransactionArgs): VerifiedTransactionResult {
  const capacity = evaluateVerifiedCapacity(args);
  if (capacity.outcome === "REFUSED") return capacity;
  const auth = assertRestoreAuthority(args.transaction);
  if (!auth.ok) {
    return {
      outcome: "REFUSED",
      policy: VERIFIED_EXECUTION_POLICY,
      packageHash: capacity.packageHash,
      refusals: auth.issues.map((i) => ({
        code: UNAUTHORIZED_RESTORE_CODE as BoundaryRefusalCode,
        message: i.message,
        refs: [i.effectId, i.usageId],
      })),
    };
  }
  const pkg = args.package;
  const simulation = simulateTransaction({
    transaction: args.transaction, currentState: capacity.state, capacityGraph: capacity.graph, selectedPath: args.selectedPath, inputs: args.inputs,
    context: { rules: pkg.rules, sharedCapacities: pkg.sharedCapacities, definitions: pkg.definitions, ledger: args.ledger, ledgerPolicy: args.ledgerPolicy, asOf: args.asOf ?? null, verification: capacity.envelope, policy: VERIFIED_EXECUTION_POLICY },
  });
  return { outcome: "EXECUTED", policy: VERIFIED_EXECUTION_POLICY, packageHash: capacity.packageHash, envelope: capacity.envelope, coverage: capacity.coverage, capacity: capacity.state, simulation };
}

// ---------------------------------------------------------------------------
// Sequential financial-view chaining (TE-D3) — lives on the verified boundary so
// composition modules never import buildOverlay / raw simulate primitives.
// ---------------------------------------------------------------------------

function serializedToQuantity(v: SerializedRuntimeValue): TransactionQuantity | null {
  switch (v.type) {
    case "MONEY": return { type: "MONEY", amount: v.amount, currency: v.currency };
    case "NUMBER": return { type: "NUMBER", value: v.value };
    case "PERCENT": return { type: "PERCENT", fraction: v.fraction };
    case "RATIO": return { type: "RATIO", value: v.value };
    default: return null;
  }
}

/**
 * Chain prior APPLIED overlay results into the next step's base resolver.
 * Used by sequential composition after each verified simulation step.
 */
export function chainFinancialViewWithScope(
  base: InputResolver,
  result: TransactionSimulationResult,
  scope: { companyId: string; instrumentKey: string },
): { resolver: InputResolver; chainedMetricKeys: string[]; chainedEvents: string[] } {
  const metricEffects: ChangeMetricEffect[] = [];
  const chainedMetricKeys: string[] = [];
  for (const e of result.financialEffects) {
    if (e.state !== "APPLIED" || !e.result) continue;
    const q = serializedToQuantity(e.result);
    if (!q) continue;
    metricEffects.push({
      effectId: `chain:${result.transactionIdentity.transactionId}:${e.effectId}`,
      kind: "CHANGE_METRIC",
      metricKey: e.metricKey,
      period: e.period,
      asOf: e.asOf,
      adjustment: { kind: "SET", value: q },
    });
    chainedMetricKeys.push(e.metricKey);
  }

  const eventEffects: EventStateEffect[] = result.simulationInputView.eventAdjustments.map((e) => ({
    effectId: `chain-evt:${e.effectId}`,
    kind: e.active ? "ACTIVATE_EVENT" as const : "DEACTIVATE_EVENT" as const,
    eventDescription: e.eventDescription,
    asOf: e.asOf,
  }));
  const chainedEvents = eventEffects.map((e) => e.eventDescription);

  if (metricEffects.length === 0 && eventEffects.length === 0) {
    return { resolver: base, chainedMetricKeys: [], chainedEvents: [] };
  }

  const overlay = buildOverlay({
    base,
    transactionId: `chain-of:${result.transactionIdentity.transactionId}`,
    companyId: scope.companyId,
    instrumentKey: scope.instrumentKey,
    metricEffects,
    eventEffects,
  });

  return {
    resolver: overlay.resolver,
    chainedMetricKeys: [...new Set(chainedMetricKeys)].sort(),
    chainedEvents: [...new Set(chainedEvents)].sort(),
  };
}
