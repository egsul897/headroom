/**
 * Phase 6 - election enumeration + feasibility layer.
 *
 * Implements the hybrid algorithm docs/solver-architecture-design.md §E/§O
 * recommends: bounded election enumeration over the permission relationship
 * graph, pruned early by relationship compatibility, with per-election
 * numeric feasibility resolved by the existing leaf-calculation core
 * (`evaluateProvision` from lib/covenant-engine.ts - reused, not
 * reimplemented, per design doc §Q.1) and monotone bisection only where an
 * election's capacity genuinely depends on more than one concurrently-drawn
 * incurrence-based member.
 *
 * Explicitly NOT implemented, per the task's own instruction: a generic CSP
 * or MILP engine, and no generative/AI-based evaluation anywhere in this
 * file - every branch is a plain, deterministic, auditable computation over
 * typed data.
 */

import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
  type LeverageMetrics,
} from "../covenant-engine";
import { automaticallyLinkedPermissions, relationshipTypeBetween, resolveApplicability, type PermissionGraph } from "./graph";
import type {
  Election,
  EntityClass,
  LinkedPermissionPair,
  ParameterAdjustment,
  Permission,
  PermissionCollateralScope,
  PermissionPath,
  PermissionPathLeg,
  RequirementResult,
  RuleActivationCondition,
  SharedConstraint,
  SharedConstraintConsumption,
  ActivationState,
  Transaction,
} from "./types";
import { pathStatus } from "./status";
import { parameterAdjustmentTriggersFrom } from "./graph";

// ---------------------------------------------------------------------------
// Leaf-calculation adapter (design doc §Q.1 - reuse, never reimplement)
// ---------------------------------------------------------------------------

/** Maps a Permission onto the exact shape `evaluateProvision` (lib/covenant-engine.ts) already knows how to compute - the leaf-calculation layer is kept as-is. */
export function permissionAsProvision(p: Permission): CovenantProvisionInput {
  return {
    id: p.id,
    documentId: p.documentId,
    code: p.code ?? p.id,
    basketName: p.action,
    sectionRef: p.sourceProvision.sectionRef,
    formulaType: p.formulaType,
    thresholdValue: p.thresholdValue,
    params: p.params ?? null,
  };
}

/** A financial snapshot with pro forma debt bumped by a hypothetical amount - used both for CONCURRENT_COUNTED treatment and for bisection over a candidate transaction amount. Never mutates the input. */
export function withProFormaDebt(fin: FinancialSnapshotInput, additionalTotalDebt: number, additionalSecuredDebt: number): FinancialSnapshotInput {
  return { ...fin, totalDebt: fin.totalDebt + additionalTotalDebt, securedDebt: fin.securedDebt + additionalSecuredDebt };
}

// ---------------------------------------------------------------------------
// §E.3 - Election enumeration
// ---------------------------------------------------------------------------

export interface EnumerationResult {
  elections: Election[];
  candidateElections: number;
  prunedElections: number;
  limitExceeded: boolean;
}

/** The only two relationship types that permit combining two permissions inside the SAME election (design doc §C.3/§E.4 step 2). Every other relationship (including the fail-closed `undefined`/`UNKNOWN` case) disqualifies the pair from co-occurring in an election. */
function isCombinable(relType: ReturnType<typeof relationshipTypeBetween>): boolean {
  return relType === "CONCURRENT_DISREGARDED" || relType === "CONCURRENT_COUNTED";
}

/**
 * design doc §E.3 - bounded power-set enumeration over eligible permissions,
 * pruned to only the subsets that form a "clique" of pairwise-combinable
 * relationships (every pair inside a candidate election must be
 * CONCURRENT_DISREGARDED or CONCURRENT_COUNTED; ALTERNATIVE/
 * MUTUALLY_EXCLUSIVE/UNKNOWN pairs are never co-included). A singleton is
 * always a valid election on its own.
 *
 * `maxPermissionsPerSide` mirrors the documented threshold from
 * legal-model-remediation-design.md §6 Step 2 / design doc §U.2 (default
 * 20) - exceeding it fails closed (`limitExceeded: true`, zero elections
 * returned) rather than either truncating silently or attempting the full
 * 2^n search, per task §14's explicit "never silently return a partial
 * positive answer."
 */
export function enumerateElections(eligiblePermissions: Permission[], graph: PermissionGraph, maxPermissionsPerSide = 20): EnumerationResult {
  const n = eligiblePermissions.length;
  if (n === 0) return { elections: [], candidateElections: 0, prunedElections: 0, limitExceeded: false };
  if (n > maxPermissionsPerSide) {
    return { elections: [], candidateElections: 0, prunedElections: 0, limitExceeded: true };
  }

  const ids = eligiblePermissions.map((p) => p.id);
  let candidateElections = 0;
  let prunedElections = 0;
  const elections: Election[] = [];

  for (let mask = 1; mask < 1 << n; mask++) {
    candidateElections++;
    const memberIdx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) memberIdx.push(i);

    let valid = true;
    for (let x = 0; valid && x < memberIdx.length; x++) {
      for (let y = x + 1; valid && y < memberIdx.length; y++) {
        const relType = relationshipTypeBetween(graph, ids[memberIdx[x]!]!, ids[memberIdx[y]!]!);
        if (memberIdx.length > 1 && !isCombinable(relType)) valid = false;
      }
    }
    if (!valid) {
      prunedElections++;
      continue;
    }

    const memberIds = memberIdx.map((i) => ids[i]!);
    elections.push({
      id: `election:${memberIds.join("+")}`,
      memberPermissionIds: memberIds,
      rationale: memberIds.length === 1 ? "Single permission, no combination required." : "Pairwise CONCURRENT_DISREGARDED/CONCURRENT_COUNTED clique.",
    });
  }

  return { elections, candidateElections, prunedElections, limitExceeded: false };
}

// ---------------------------------------------------------------------------
// §E.4 - Per-election feasibility
// ---------------------------------------------------------------------------

export interface EligibilityContext {
  transaction: Transaction;
  entityClasses: EntityClass[]; // the incurring entity's own class memberships
  ruleActivationConditions: RuleActivationCondition[];
  activationState: ActivationState;
  asOfDate: Date;
}

/**
 * design doc §C.2 GUARANTOR_CONDITION-adjacent entity-scope check + §I
 * APPLICABILITY. ENTITY_SCOPE, TRANSACTION_SECURITY_SCOPE, and
 * CUSTOM_STATE_PREDICATE (backed by a resolvable RuleActivationCondition) are
 * mechanically evaluated. Every other eligibility-condition kind -
 * RATINGS_THRESHOLD/INTERCREDITOR_JOINDER/MFN_EXCLUSION_TEST/
 * LCA_TEST_DATE_FREEZE, or a CUSTOM_STATE_PREDICATE missing its
 * ruleActivationConditionId - has no mechanical evaluation in this phase
 * (report §O item 2). This is fail-closed BY CONSTRUCTION: an
 * unsupported kind produces its own UNKNOWN RequirementResult (reasonCategory
 * "LEGAL_JUDGMENT") rather than being silently skipped, which would
 * otherwise let a permission with e.g. an unverified RATINGS_THRESHOLD
 * condition attached clear as if that condition had actually been checked -
 * exactly the false-affirmative failure mode the live-integration hardening
 * gate requires never happen. The remedy differs from a data gap (get a
 * rating agency confirmation vs. get certified financial data), which is
 * why it carries its own reason category rather than reusing EXTERNAL_INPUT.
 */
/**
 * Establish whether an independently elected LIEN permission covers a specific
 * secured DEBT_INCURRENCE leg. Mere presence of any LIEN member is never enough.
 * Fail closed to UNKNOWN when coverage cannot be proven; FAILED when a check
 * affirmatively rejects every candidate.
 */
export function assessIndependentLienCoverageForDebtLeg(args: {
  debtLeg: PermissionPathLeg;
  debtPermission: Permission;
  lienMembers: Permission[];
  financials: FinancialSnapshotInput;
  metrics: LeverageMetrics;
  entityClasses: EntityClass[];
  collateralScopes: PermissionCollateralScope[];
  transaction: Transaction;
  asOfDate: Date;
  eligibilityContext: EligibilityContext;
}): RequirementResult {
  const { debtLeg, debtPermission, lienMembers, financials, metrics, collateralScopes, transaction, asOfDate, eligibilityContext } = args;
  const debtId = debtLeg.permissionId;

  if (lienMembers.length === 0) {
    return {
      class: "LIEN_PERMISSION",
      scope: { permissionId: debtId },
      status: "FAILED",
      detail:
        `Secured debt leg ${debtId} has no Permitted Lien path: no AUTOMATIC_LINKED_PERMISSION ` +
        `lien for this permission and no independent LIEN permission in this election. An auto-lien attached to a ` +
        `different debt leg does not cover this leg.`,
    };
  }

  type Rejection = { lienId: string; reason: string; hardFail: boolean };
  const rejections: Rejection[] = [];
  let anyUnknown = false;

  for (const lien of lienMembers) {
    // Same governing document — cross-document free-riding is not permitted.
    if (lien.documentId !== debtPermission.documentId) {
      rejections.push({ lienId: lien.id, reason: `wrong document (${lien.documentId} ≠ ${debtPermission.documentId})`, hardFail: true });
      continue;
    }
    if (lien.grantType !== "LIEN") {
      rejections.push({ lienId: lien.id, reason: "not a LIEN grantType / wrong debt class coverage target", hardFail: true });
      continue;
    }
    // Currency / FX: a numeric authorizedFxRate alone is not proof of conversion.
    // Require a positive finite rate and apply it to capacity (txn = lien * rate).
    const rawParams =
      lien.params != null && typeof lien.params === "object" && !Array.isArray(lien.params)
        ? (lien.params as Record<string, unknown>)
        : null;
    const lienCurrency = typeof rawParams?.currency === "string" ? rawParams.currency : null;
    const rawFx = rawParams?.authorizedFxRate;
    const authorizedFx =
      typeof rawFx === "number" && Number.isFinite(rawFx) && rawFx > 0 ? rawFx : null;
    if (lienCurrency && lienCurrency !== transaction.currency.code && authorizedFx == null) {
      rejections.push({
        lienId: lien.id,
        reason: `currency mismatch (${lienCurrency} ≠ ${transaction.currency.code}) without positive finite authorizedFxRate`,
        hardFail: false,
      });
      anyUnknown = true;
      continue;
    }
    if (lien.modelingStatus !== "MODELED") {
      rejections.push({ lienId: lien.id, reason: `modelingStatus=${lien.modelingStatus}`, hardFail: false });
      anyUnknown = true;
      continue;
    }
    // Operative date window.
    if (lien.effectiveFrom && asOfDate < lien.effectiveFrom) {
      rejections.push({ lienId: lien.id, reason: "effectiveFrom not yet reached", hardFail: true });
      continue;
    }
    if (lien.effectiveTo && asOfDate > lien.effectiveTo) {
      rejections.push({ lienId: lien.id, reason: "effectiveTo expired / superseded", hardFail: true });
      continue;
    }
    // Entity scope: lien must cover the incurring entity classes.
    if (lien.entityScope.length > 0 && !lien.entityScope.some((c) => eligibilityContext.entityClasses.includes(c))) {
      rejections.push({
        lienId: lien.id,
        reason: `entity scope [${lien.entityScope.join(",")}] does not cover incurring classes [${eligibilityContext.entityClasses.join(",") || "none"}]`,
        hardFail: true,
      });
      continue;
    }
    // Debt permission entity scope must also be compatible with lien when both restricted.
    if (
      debtPermission.entityScope.length > 0 &&
      lien.entityScope.length > 0 &&
      !debtPermission.entityScope.some((c) => lien.entityScope.includes(c))
    ) {
      rejections.push({ lienId: lien.id, reason: "lien entity scope does not intersect debt permission entity scope", hardFail: true });
      continue;
    }

    // Eligibility / term conditions on the lien itself.
    const lienElig = evaluatePermissionEligibility(lien, eligibilityContext);
    const failedElig = lienElig.find((r) => r.status === "FAILED");
    if (failedElig) {
      rejections.push({ lienId: lien.id, reason: `lien eligibility FAILED: ${failedElig.detail}`, hardFail: true });
      continue;
    }
    const unknownElig = lienElig.find((r) => r.status === "UNKNOWN");
    if (unknownElig) {
      rejections.push({ lienId: lien.id, reason: `lien eligibility UNKNOWN: ${unknownElig.detail}`, hardFail: false });
      anyUnknown = true;
      continue;
    }

    // Collateral / priority: every requested pool+tier must be covered
    // (complete coverage — not merely one matching pool via `.some()`).
    const lienScopes = collateralScopes.filter((s) => s.permissionId === lien.id);
    if (transaction.requestedLienPriority.length > 0) {
      if (lienScopes.length === 0) {
        rejections.push({
          lienId: lien.id,
          reason: "transaction requested lien priority but lien has no PermissionCollateralScope rows — coverage unproven",
          hardFail: false,
        });
        anyUnknown = true;
        continue;
      }
      const coversAll = transaction.requestedLienPriority.every((req) =>
        lienScopes.some((s) => s.collateralPoolId === req.poolId && s.priorityTier === req.priorityTier),
      );
      if (!coversAll) {
        rejections.push({
          lienId: lien.id,
          reason: "lien collateral/priority does not completely cover every requestedLienPriority entry",
          hardFail: true,
        });
        continue;
      }
    } else if (lienScopes.length > 0 && transaction.collateralPools.length > 0) {
      // Transaction named pools without priority tiers — require pool id overlap.
      const poolIds = new Set(transaction.collateralPools.map((p) => p.id));
      if (!lienScopes.some((s) => poolIds.has(s.collateralPoolId))) {
        rejections.push({ lienId: lien.id, reason: "lien collateral pools do not overlap transaction.collateralPools", hardFail: true });
        continue;
      }
    }

    // Lien capacity must cover the debt leg's allocated amount (0 is OK for
    // amount-independent max-capacity probes when the lien itself is unlimited /
    // auto-style with threshold 0 — but only when amountAllocated is 0).
    const evaluated = evaluateProvision(permissionAsProvision(lien), financials, metrics);
    if (evaluated.status !== "modeled" || evaluated.capacity === undefined) {
      rejections.push({
        lienId: lien.id,
        reason: `lien capacity not modeled (${evaluated.status}${evaluated.reason ? `: ${evaluated.reason}` : ""})`,
        hardFail: false,
      });
      anyUnknown = true;
      continue;
    }
    // Apply FX when currencies differ — rate presence alone is insufficient.
    const capacityTxn =
      lienCurrency && lienCurrency !== transaction.currency.code && authorizedFx != null
        ? evaluated.capacity * authorizedFx
        : evaluated.capacity;
    // Parasitic auto-style liens (threshold 0 / capacity 0) cannot independently
    // cover a positive secured allocation — they only work via AUTOMATIC_LINKED_PERMISSION.
    const need = debtLeg.amountAllocated;
    if (need > 1e-9 && capacityTxn + 1e-9 < need) {
      rejections.push({
        lienId: lien.id,
        reason: `insufficient lien capacity ${capacityTxn} < debt allocation ${need}`,
        hardFail: true,
      });
      continue;
    }
    if (need > 1e-9 && capacityTxn <= 1e-9 && lien.thresholdValue === 0) {
      rejections.push({
        lienId: lien.id,
        reason: "zero-threshold lien has no independent ceiling — cannot cover positive secured allocation without AUTOMATIC_LINKED_PERMISSION",
        hardFail: true,
      });
      continue;
    }

    // Proven coverage.
    return {
      class: "LIEN_PERMISSION",
      scope: { permissionId: lien.id },
      status: "SATISFIED",
      detail:
        `Secured debt leg ${debtId} covered by independent LIEN ${lien.id} ` +
        `(same document, entity/collateral/eligibility/capacity checks passed; txn-currency capacity ${capacityTxn}).`,
      sourceProvision: { documentId: lien.documentId, sectionRef: lien.sourceProvision.sectionRef },
    };
  }

  if (anyUnknown && !rejections.every((r) => r.hardFail)) {
    return {
      class: "LIEN_PERMISSION",
      scope: { permissionId: debtId },
      status: "UNKNOWN",
      reasonCategory: "LEGAL_JUDGMENT",
      detail:
        `Secured debt leg ${debtId}: independent LIEN member(s) present but coverage not proven — ` +
        rejections.map((r) => `${r.lienId}: ${r.reason}`).join("; ") +
        `. Absent proven coverage is never treated as affirmative secured capacity.`,
    };
  }

  return {
    class: "LIEN_PERMISSION",
    scope: { permissionId: debtId },
    status: "FAILED",
    detail:
      `Secured debt leg ${debtId}: no independently valid LIEN covers this leg — ` +
      rejections.map((r) => `${r.lienId}: ${r.reason}`).join("; "),
  };
}

export function evaluatePermissionEligibility(permission: Permission, ctx: EligibilityContext): RequirementResult[] {
  const results: RequirementResult[] = [];

  if (permission.entityScope.length > 0 && !permission.entityScope.some((c) => ctx.entityClasses.includes(c))) {
    results.push({
      class: "GUARANTOR_CONDITION",
      scope: { permissionId: permission.id },
      status: "FAILED",
      detail: `Permission ${permission.id} is scoped to entity classes [${permission.entityScope.join(", ")}], but the incurring entity's classes are [${ctx.entityClasses.join(", ") || "none"}].`,
      sourceProvision: { documentId: permission.documentId, sectionRef: permission.sourceProvision.sectionRef },
    });
  }

  for (const cond of permission.eligibilityConditions) {
    if (cond.kind === "ENTITY_SCOPE") continue; // covered structurally above
    if (cond.kind === "TRANSACTION_SECURITY_SCOPE") {
      // Generalized, mechanically-evaluated primitive (see the type's own
      // doc comment in lib/solver/types.ts) - restricts a permission to a
      // declared subset of the transaction's own secured/lien-priority
      // character. Always resolves to SATISFIED/FAILED, never UNKNOWN: both
      // `Transaction.secured` and `Transaction.requestedLienPriority` are
      // always known at evaluation time (no external data dependency), and
      // an uncharacterized/empty `requestedLienPriority` on a secured
      // transaction fails closed under UNSECURED_OR_JUNIOR rather than being
      // assumed eligible.
      const txn = ctx.transaction;
      let satisfied: boolean;
      if (cond.allowedSecurity === "UNSECURED_ONLY") {
        satisfied = !txn.secured;
      } else {
        // UNSECURED_OR_JUNIOR (the only other defined value).
        satisfied = !txn.secured || txn.requestedLienPriority.every((p) => p.priorityTier === "SECOND");
        if (txn.secured && txn.requestedLienPriority.length === 0) satisfied = false;
      }
      results.push({
        class: "COVENANT_APPLICABILITY",
        scope: { permissionId: permission.id },
        status: satisfied ? "SATISFIED" : "FAILED",
        detail: cond.description,
        sourceProvision: cond.sourceProvision ? { documentId: cond.sourceProvision.documentId, sectionRef: cond.sourceProvision.sectionRef } : undefined,
      });
      continue;
    }
    if (cond.kind === "CUSTOM_STATE_PREDICATE" && cond.ruleActivationConditionId) {
      const activation = ctx.ruleActivationConditions.find((c) => c.id === cond.ruleActivationConditionId);
      if (!activation) {
        results.push({
          class: "COVENANT_APPLICABILITY",
          scope: { permissionId: permission.id },
          status: "UNKNOWN",
          detail: `Eligibility condition "${cond.description}" references unknown RuleActivationCondition ${cond.ruleActivationConditionId}.`,
          reasonCategory: "UNKNOWN_RELATIONSHIP",
        });
        continue;
      }
      const { active } = resolveApplicability([activation], permission.id, [], ctx.activationState, ctx.asOfDate);
      results.push({
        class: "COVENANT_APPLICABILITY",
        scope: { permissionId: permission.id },
        status: active === "UNKNOWN" ? "UNKNOWN" : active ? "SATISFIED" : "FAILED",
        detail: cond.description,
        reasonCategory: active === "UNKNOWN" ? "UNRESOLVED_ACTIVATION_STATE" : undefined,
        sourceProvision: cond.sourceProvision ? { documentId: cond.sourceProvision.documentId, sectionRef: cond.sourceProvision.sectionRef } : undefined,
      });
      continue;
    }
    // Every other kind - RATINGS_THRESHOLD / INTERCREDITOR_JOINDER /
    // MFN_EXCLUSION_TEST / LCA_TEST_DATE_FREEZE, or a CUSTOM_STATE_PREDICATE
    // missing its ruleActivationConditionId - has no mechanical evaluation
    // in this phase. Fails closed to UNKNOWN rather than being silently
    // dropped (see this function's header comment).
    results.push({
      class: "COVENANT_APPLICABILITY",
      scope: { permissionId: permission.id },
      status: "UNKNOWN",
      detail: `Eligibility condition "${cond.description}" (kind ${cond.kind}) on permission ${permission.id} has no mechanical evaluation in this phase and cannot be assumed satisfied.`,
      reasonCategory: "LEGAL_JUDGMENT",
      sourceProvision: cond.sourceProvision ? { documentId: cond.sourceProvision.documentId, sectionRef: cond.sourceProvision.sectionRef } : undefined,
    });
  }

  // Company-wide / permission-targeted RuleActivationConditions with effect APPLICABILITY, beyond
  // whatever a CUSTOM_STATE_PREDICATE eligibility condition already referenced.
  const directApplicability = resolveApplicability(ctx.ruleActivationConditions, permission.id, [permission.sourceProvision.sectionRef], ctx.activationState, ctx.asOfDate);
  if (directApplicability.evaluated.length > 0) {
    results.push({
      class: "COVENANT_APPLICABILITY",
      scope: { permissionId: permission.id },
      status: directApplicability.active === "UNKNOWN" ? "UNKNOWN" : directApplicability.active ? "SATISFIED" : "FAILED",
      detail: `Dynamic activation for permission ${permission.id}.`,
      reasonCategory: directApplicability.active === "UNKNOWN" ? "UNRESOLVED_ACTIVATION_STATE" : undefined,
    });
  }

  return results;
}

export interface ElectionEvaluationParams {
  election: Election;
  permissionsById: Map<string, Permission>;
  graph: PermissionGraph;
  financials: FinancialSnapshotInput;
  requestedAmount: number;
  eligibilityContext: EligibilityContext;
  sharedConstraints: SharedConstraint[];
  collateralScopes: PermissionCollateralScope[];
}

export interface ElectionEvaluation {
  election: Election;
  legs: PermissionPathLeg[];
  linkedPermissions: LinkedPermissionPair[];
  requirements: RequirementResult[];
  parameterAdjustmentsTriggered: ParameterAdjustment[];
  sharedConstraintsConsumed: SharedConstraintConsumption[];
  totalAllocated: number;
  /** The election's own maximum capacity, independent of the specific requested amount - undefined if not exactly determinable (see status). */
  maxCapacity?: number;
  status: "EVALUATED" | "NOT_EVALUABLE";
}

/**
 * design doc §E.4 - evaluates one election's feasibility for
 * `requestedAmount`, allocating a deterministic waterfall (FIXED members
 * first, in ascending permission-id order for determinism, then the sole
 * INCURRENCE_BASED member absorbs the remainder) and checking every
 * applicable RequirementResult.
 */
export function evaluateElection(params: ElectionEvaluationParams): ElectionEvaluation {
  const { election, permissionsById, graph, financials, requestedAmount, eligibilityContext, sharedConstraints, collateralScopes } = params;

  const members = election.memberPermissionIds.map((id) => permissionsById.get(id)!).sort((a, b) => (a.id < b.id ? -1 : 1));
  // LIEN permissions never satisfy debt-principal allocation — they cover secured
  // debt legs but do not consume the debt-request waterfall as principal capacity.
  const debtMembers = members.filter((m) => m.grantType === "DEBT_INCURRENCE");
  const fixed = debtMembers.filter((m) => m.amountKind === "FIXED");
  const incurrenceBased = debtMembers.filter((m) => m.amountKind === "INCURRENCE_BASED");

  const requirements: RequirementResult[] = [];
  for (const m of members) requirements.push(...evaluatePermissionEligibility(m, eligibilityContext));

  // Concurrent treatment: a FIXED member CONCURRENT_COUNTED against the sole
  // INCURRENCE_BASED member adds to its ratio-denominator debt basis; a
  // CONCURRENT_DISREGARDED member does not.
  let countedFixedTotalDebt = 0;
  let countedFixedSecuredDebt = 0;
  const concurrentTreatmentByFixedId = new Map<string, "DISREGARDED" | "COUNTED" | undefined>();
  if (incurrenceBased.length === 1) {
    for (const f of fixed) {
      const relType = relationshipTypeBetween(graph, f.id, incurrenceBased[0]!.id);
      const treatment = relType === "CONCURRENT_COUNTED" ? "COUNTED" : relType === "CONCURRENT_DISREGARDED" ? "DISREGARDED" : undefined;
      concurrentTreatmentByFixedId.set(f.id, treatment);
    }
  }

  const legs: PermissionPathLeg[] = [];
  let remaining = requestedAmount;
  let totalAllocated = 0;
  const EPS = 1e-6;
  // Populated only by the incurrenceBased.length > 1 branch below: the
  // election's own request-amount-independent ceiling is the MIN across
  // every concurrently-drawn member's own standalone capacity (never a sum -
  // see that branch's comment for why summing double-counts shared
  // leverage headroom).
  let multiRatioMaxCapacity: number | undefined;

  // Stateful shared-constraint headroom tracker: two members of the SAME
  // election drawing on the SAME SharedCapacityConstraint must jointly
  // exhaust its remaining headroom, not each be checked independently
  // against the constraint's pre-transaction currentUsage (design doc §G:
  // "currentUsage + proposedAllocationAcrossParticipatingLegs <= cap" - the
  // gate is on the SUM across every participating leg in this election, not
  // per-leg in isolation). Initialized lazily so a constraint never consulted
  // by this election costs nothing.
  const sharedRemaining = new Map<string, number>();
  const sharedConsumption: SharedConstraintConsumption[] = [];
  // A constraint participates for a given permission either by naming it
  // directly (NAMED_MEMBER_CLAUSES) or, for ENTITY_CLASS_FILTER constraints,
  // by the incurring entity's own class membership matching one of the
  // constraint's entity-class members (design doc §G aggregationRule) -
  // this is Case F's "entity-specific sub-cap" mechanism: a permission with
  // NO per-permission member row can still be gated by a shared constraint
  // purely because of which entity is incurring.
  const constraintBindsPermission = (c: SharedConstraint, permissionId: string): boolean =>
    c.members.some((mem) => mem.permissionId === permissionId) ||
    (c.aggregationRule === "ENTITY_CLASS_FILTER" &&
      c.members.some((mem) => mem.entityClass && eligibilityContext.entityClasses.includes(mem.entityClass)));

  /** First binding constraint (debt waterfall / shared-cap consumption). */
  const constraintFor = (permissionId: string): SharedConstraint | undefined =>
    sharedConstraints.find((c) => constraintBindsPermission(c, permissionId));

  /**
   * Every binding shared constraint for a permission. Lien coverage must respect
   * the full overlapping set — selecting only the first would drop a binding
   * constraint and can overstate usable capacity (Invariant C / Case F).
   */
  const constraintsFor = (permissionId: string): SharedConstraint[] =>
    sharedConstraints.filter((c) => constraintBindsPermission(c, permissionId));
  /**
   * Shared-constraint headroom. Utilization integrity (Neon activation P0):
   * when `currentUsageAuthoritative` is not true, do NOT treat numeric zero as
   * proven-empty usage / full remaining — that would be a false-favorable
   * remaining-capacity conclusion. Fail closed with utilizationUnknown.
   */
  const headroomAndConsume = (
    permissionId: string,
    desiredAlloc: number,
  ): { cappedAlloc: number; constraintId?: string; utilizationUnknown?: boolean } => {
    const constraint = constraintFor(permissionId);
    if (!constraint) return { cappedAlloc: desiredAlloc };
    if (constraint.currentUsageAuthoritative !== true) {
      return {
        cappedAlloc: 0,
        constraintId: constraint.id,
        utilizationUnknown: true,
      };
    }
    if (!sharedRemaining.has(constraint.id)) {
      const cap = "amount" in constraint.cap ? constraint.cap.amount : evaluateProvision({ ...permissionAsProvision(permissionsById.get(permissionId)!), formulaType: constraint.cap.formulaType, thresholdValue: constraint.cap.thresholdValue, params: constraint.cap.params }, financials, computeLeverageMetrics(financials)).capacity;
      sharedRemaining.set(constraint.id, Math.max(0, (cap ?? 0) - constraint.currentUsage));
    }
    const before = sharedRemaining.get(constraint.id)!;
    const consumed = Math.max(0, Math.min(desiredAlloc, before));
    sharedRemaining.set(constraint.id, before - consumed);
    sharedConsumption.push({ constraintId: constraint.id, amountConsumed: consumed, headroomBefore: before, headroomAfter: before - consumed });
    return { cappedAlloc: consumed, constraintId: constraint.id };
  };

  const pushSharedCapRequirement = (
    permissionId: string,
    constraintId: string,
    cappedAlloc: number,
    desiredForSharedCheck: number,
    utilizationUnknown: boolean | undefined,
  ) => {
    if (utilizationUnknown) {
      const status = constraintFor(permissionId)?.currentUsageStatus ?? "ZERO_NO_ATTRIBUTED_USAGE";
      requirements.push({
        class: "SHARED_CAP",
        scope: { permissionId, constraintId },
        status: "UNKNOWN",
        detail:
          `Shared constraint ${constraintId} utilization is not authoritative (${status}); ` +
          `non-authoritative usage must not produce favorable remaining capacity.`,
        reasonCategory: "EXTERNAL_INPUT",
      });
      return;
    }
    requirements.push({
      class: "SHARED_CAP",
      scope: { permissionId, constraintId },
      status: cappedAlloc > 0 || desiredForSharedCheck === 0 ? "SATISFIED" : "FAILED",
      detail: `Shared constraint ${constraintId} headroom consumed by ${permissionId}: ${cappedAlloc}.`,
    });
  };

  for (const f of fixed) {
    const provision = permissionAsProvision(f);
    const evaluated = evaluateProvision(provision, financials, computeLeverageMetrics(financials));
    if (evaluated.status !== "modeled") {
      requirements.push({
        class: "DEBT_PERMISSION",
        scope: { permissionId: f.id },
        status: "UNKNOWN",
        detail: evaluated.reason ?? `Permission ${f.id}'s leaf calculation did not resolve.`,
        reasonCategory: "EXTERNAL_INPUT",
      });
      continue;
    }
    let standalone = evaluated.capacity!;
    const desiredForSharedCheck = Math.min(remaining, standalone);
    const { cappedAlloc, constraintId, utilizationUnknown } = headroomAndConsume(f.id, desiredForSharedCheck);
    if (constraintId !== undefined) {
      standalone = Math.min(standalone, cappedAlloc);
      pushSharedCapRequirement(f.id, constraintId, cappedAlloc, desiredForSharedCheck, utilizationUnknown);
    }
    const alloc = Math.max(0, Math.min(remaining, standalone));
    remaining -= alloc;
    totalAllocated += alloc;
    if (incurrenceBased.length === 1 && concurrentTreatmentByFixedId.get(f.id) === "COUNTED") {
      countedFixedTotalDebt += alloc;
      // A FIXED permission has no distinct "is this secured debt" flag of
      // its own separate from the transaction's own `secured` flag (report
      // §O item 3). Rather than assume 0 (which would understate pro forma
      // secured debt and could overstate room under an SSNL-basis ratio
      // permission counted concurrently with it - a false-CLEAR risk for a
      // real secured Phase 1 transaction), this conservatively assumes the
      // counted FIXED contribution IS secured whenever the transaction
      // itself is secured - the safe direction (never understates secured
      // leverage), at the cost of occasionally being pessimistic for a
      // FIXED basket that happens to authorize only unsecured debt even
      // within a secured transaction. A distinct per-grant secured flag
      // would resolve this exactly; that is the scoped follow-up.
      if (f.grantType === "DEBT_INCURRENCE" && eligibilityContext.transaction.secured) countedFixedSecuredDebt += alloc;
    }
    legs.push({
      permissionId: f.id,
      grantType: f.grantType,
      amountAllocated: alloc,
      standaloneCapacity: standalone,
      concurrentTreatment:
        incurrenceBased.length === 1 && concurrentTreatmentByFixedId.get(f.id)
          ? { withPermissionId: incurrenceBased[0]!.id, relationship: concurrentTreatmentByFixedId.get(f.id) === "COUNTED" ? "CONCURRENT_COUNTED" : "CONCURRENT_DISREGARDED", disregardedFromRatioDenominator: concurrentTreatmentByFixedId.get(f.id) === "DISREGARDED" }
          : undefined,
      measurementBasis: f.measurementBasis,
      historicalUsage: {},
      sourceProvision: f.sourceProvision,
    });
    requirements.push({ class: "DEBT_PERMISSION", scope: { permissionId: f.id }, status: "SATISFIED", detail: `${f.id} standalone capacity ${standalone}.` });
  }

  if (incurrenceBased.length === 1) {
    const ratioPermission = incurrenceBased[0]!;
    const adjustedFin = withProFormaDebt(financials, countedFixedTotalDebt, countedFixedSecuredDebt);
    const provision = permissionAsProvision(ratioPermission);
    const evaluated = evaluateProvision(provision, adjustedFin, computeLeverageMetrics(adjustedFin));
    if (evaluated.status !== "modeled") {
      requirements.push({
        class: "RATIO_CONDITION",
        scope: { permissionId: ratioPermission.id },
        status: "UNKNOWN",
        detail: evaluated.reason ?? `Permission ${ratioPermission.id}'s ratio calculation did not resolve.`,
        reasonCategory: "MISSING_ASSUMPTION",
      });
    } else {
      let standalone = evaluated.capacity!;
      const desiredForSharedCheck = Math.min(remaining, standalone);
      const { cappedAlloc, constraintId, utilizationUnknown } = headroomAndConsume(ratioPermission.id, desiredForSharedCheck);
      if (constraintId !== undefined) {
        standalone = Math.min(standalone, cappedAlloc);
        pushSharedCapRequirement(ratioPermission.id, constraintId, cappedAlloc, desiredForSharedCheck, utilizationUnknown);
      }
      const alloc = Math.max(0, Math.min(remaining, standalone));
      remaining -= alloc;
      totalAllocated += alloc;
      legs.push({
        permissionId: ratioPermission.id,
        grantType: ratioPermission.grantType,
        amountAllocated: alloc,
        standaloneCapacity: standalone,
        measurementBasis: ratioPermission.measurementBasis,
        historicalUsage: {},
        ratioCalculation: { measure: ratioPermission.formulaType, threshold: ratioPermission.thresholdValue, proFormaDebtUsed: adjustedFin.totalDebt },
        sourceProvision: ratioPermission.sourceProvision,
      });
      requirements.push({
        class: "RATIO_CONDITION",
        scope: { permissionId: ratioPermission.id },
        status: standalone >= 0 ? "SATISFIED" : "FAILED",
        detail: `${ratioPermission.id} ratio room ${standalone}.`,
      });
    }
  } else if (incurrenceBased.length > 1) {
    // Joint feasibility of concurrent ratio permissions (task-required fix
    // for the gap documented in docs/solver-implementation-phases-0-7-report.md
    // §O item 1). Every member here shares the SAME election, and by
    // construction of enumerateElections's clique pruning, every pair is
    // CONCURRENT_DISREGARDED/CONCURRENT_COUNTED - meaning the transaction
    // relies on ALL of them concurrently, not on a fictional per-member
    // split of the requested amount. Because each of these leaf formulas
    // (LEVERAGE_RATIO_ROOM/COVERAGE_RATIO_ROOM) is linear/non-increasing in
    // total pro forma debt, and the FULL `remaining` amount (not some
    // smaller allocated share) counts toward whichever shared metric each
    // member's own threshold measures, the exact joint-feasibility test is:
    // does `remaining` exceed ANY individual member's OWN standalone
    // capacity (each evaluated from the pre-transaction state, adjusted
    // only for its own CONCURRENT_COUNTED fixed contributions)? This is the
    // "resulting joint pro forma state" test the design doc requires -
    // independently evaluating each member against a SMALLER, already-
    // reduced-by-the-others amount would silently overstate what the
    // transaction can rely on (the exact $300M+$300M=>$600M failure mode
    // named in the task), because it ignores that every member measures the
    // SAME aggregate leverage the full transaction produces.
    //
    // The dollar amount itself is attributed to exactly ONE leg (the
    // lexicographically-first member, for determinism) so StateDelta/
    // debtOutstandingDelta never double-counts the same real dollars across
    // multiple legs; every other concurrently-relied-upon member still gets
    // its own RATIO_CONDITION RequirementResult, so the trace shows every
    // permission actually relied upon (design doc §D), not just the one
    // carrying the leg.
    const sortedRatio = [...incurrenceBased].sort((a, b) => (a.id < b.id ? -1 : 1));
    const perMemberCapacity = new Map<string, number>();
    let anyUnresolved = false;
    let anyBelowRequested = false;

    for (const rm of sortedRatio) {
      let rmCountedFixedTotal = 0;
      let rmCountedFixedSecured = 0;
      for (const f of fixed) {
        if (relationshipTypeBetween(graph, f.id, rm.id) === "CONCURRENT_COUNTED") {
          const fAlloc = legs.find((l) => l.permissionId === f.id)?.amountAllocated ?? 0;
          rmCountedFixedTotal += fAlloc;
          // Same conservative "assume secured whenever the transaction is
          // secured" rule as the single-incurrence-based-member branch above
          // (report §O item 3) - never understates secured pro forma debt.
          if (f.grantType === "DEBT_INCURRENCE" && eligibilityContext.transaction.secured) rmCountedFixedSecured += fAlloc;
        }
      }
      const rmFin = withProFormaDebt(financials, rmCountedFixedTotal, rmCountedFixedSecured);
      const evaluated = evaluateProvision(permissionAsProvision(rm), rmFin, computeLeverageMetrics(rmFin));
      if (evaluated.status !== "modeled") {
        anyUnresolved = true;
        requirements.push({
          class: "RATIO_CONDITION",
          scope: { permissionId: rm.id },
          status: "UNKNOWN",
          detail: evaluated.reason ?? `Permission ${rm.id}'s ratio calculation did not resolve.`,
          reasonCategory: "MISSING_ASSUMPTION",
        });
        continue;
      }
      const capacity = evaluated.capacity!;
      perMemberCapacity.set(rm.id, capacity);
      const satisfied = remaining <= capacity + 1e-6;
      if (!satisfied) anyBelowRequested = true;
      requirements.push({
        class: "RATIO_CONDITION",
        scope: { permissionId: rm.id },
        status: satisfied ? "SATISFIED" : "FAILED",
        detail:
          `${rm.id} standalone ratio room ${capacity}, tested against the FULL jointly-relied-upon amount ${remaining} ` +
          `(joint pro forma state across all ${sortedRatio.length} concurrently-drawn ratio permissions in this election) - ` +
          `not independently against a smaller allocated share.`,
      });
    }

    if (!anyUnresolved) {
      multiRatioMaxCapacity = Math.min(...Array.from(perMemberCapacity.values()));
    }

    if (!anyUnresolved && !anyBelowRequested && sortedRatio.length > 0) {
      const primary = sortedRatio[0]!;
      const primaryCapacity = perMemberCapacity.get(primary.id)!;
      const desiredForSharedCheck = Math.min(remaining, primaryCapacity);
      const { cappedAlloc, constraintId, utilizationUnknown } = headroomAndConsume(primary.id, desiredForSharedCheck);
      let effectiveCapacity = primaryCapacity;
      if (constraintId !== undefined) {
        effectiveCapacity = Math.min(primaryCapacity, cappedAlloc);
        pushSharedCapRequirement(primary.id, constraintId, cappedAlloc, desiredForSharedCheck, utilizationUnknown);
      }
      const alloc = Math.max(0, Math.min(remaining, effectiveCapacity));
      remaining -= alloc;
      totalAllocated += alloc;
      legs.push({
        permissionId: primary.id,
        grantType: primary.grantType,
        amountAllocated: alloc,
        standaloneCapacity: effectiveCapacity,
        measurementBasis: primary.measurementBasis,
        historicalUsage: {},
        ratioCalculation: { measure: primary.formulaType, threshold: primary.thresholdValue, proFormaDebtUsed: financials.totalDebt + alloc },
        sourceProvision: primary.sourceProvision,
        concurrentTreatment: { withPermissionId: sortedRatio[1]!.id, relationship: "CONCURRENT_COUNTED", disregardedFromRatioDenominator: false },
      });
    }
  }

  // Automatic lien linkage (design doc §E.3/§E.5): once a debt leg is
  // included, its linked lien leg(s) are auto-included, allocated in
  // proportion to the debt leg's own allocation, and never independently
  // chosen as election members.
  //
  // Do NOT push affirmative LIEN_PERMISSION SATISFIED here — auto-lien
  // presence is not coverage. Eligibility/coverage is decided in the secured
  // block below (fail closed on FAILED or UNKNOWN eligibility).
  const linkedPermissions: LinkedPermissionPair[] = [];
  for (const debtLeg of legs.filter((l) => l.grantType === "DEBT_INCURRENCE")) {
    for (const { permissionId: lienId } of automaticallyLinkedPermissions(graph, debtLeg.permissionId)) {
      const lienPermission = permissionsById.get(lienId);
      if (!lienPermission) continue;
      const lienLeg: PermissionPathLeg = {
        permissionId: lienId,
        grantType: "LIEN",
        amountAllocated: debtLeg.amountAllocated,
        linkedFrom: debtLeg.permissionId,
        measurementBasis: lienPermission.measurementBasis,
        historicalUsage: {},
        sourceProvision: lienPermission.sourceProvision,
      };
      legs.push(lienLeg);

      for (const scope of collateralScopes.filter((s) => s.permissionId === lienId)) {
        linkedPermissions.push({
          debtPermissionId: debtLeg.permissionId,
          lienPermissionId: lienId,
          pool: { id: scope.collateralPoolId, name: scope.collateralPoolId },
          priorityTier: scope.priorityTier,
        });
      }
    }
  }

  // Secured transactions: every DEBT_INCURRENCE leg must have a Permitted Lien
  // path that actually *covers* the allocated amount. Existence of a LIEN
  // member is not enough — capacity, entity scope, eligibility, and shared
  // headroom must clear. An AUTOMATIC_LINKED_PERMISSION lien covers ONLY the
  // debt permission it is linked from (never another leg). Independent LIEN
  // members share a coverage pool measured by their own modeled capacity
  // (not by debt-request waterfall allocation). Auto-liens are re-evaluated for
  // eligibility here (they are often not election members) and fail closed on
  // FAILED or UNKNOWN. (#231 + P0 merge-hold hardening)
  //
  // `securedLienHeadroomByDebtId` records proven lien authority for the
  // amount-independent maxCapacity clamp (a zero-dollar CLEAR probe must not
  // yield EXACT positive secured max without lien authority at that max).
  type LienHeadroom = { kind: "unbounded" } | { kind: "capped"; amount: number } | { kind: "none" } | { kind: "unknown" };
  const securedLienHeadroomByDebtId = new Map<string, LienHeadroom>();

  if (eligibilityContext.transaction.secured) {
    const independentLienMembers = members.filter((m) => m.grantType === "LIEN");
    const metricsForLien = computeLeverageMetrics(financials);
    let independentCoveragePool = 0;
    let independentCoverageUnknown = false;
    const independentClearedIds: string[] = [];
    // Shared-constraint headroom reserved by prior independent liens in this
    // coverage aggregation. Without reservation, each lien was min'd against
    // the same remaining headroom and those amounts were summed — manufacturing
    // capacity by counting one legal pool repeatedly (Invariant A).
    // Seed with debt-waterfall sharedConsumption already booked against the
    // same constraint identity (true shared pools bind both); do NOT reduce
    // lien headroom merely because the debt allocation equals the transaction
    // amount when debt is not a member of that constraint (Invariant D).
    const lienSharedReserved = new Map<string, number>();
    for (const c of sharedConsumption) {
      lienSharedReserved.set(c.constraintId, (lienSharedReserved.get(c.constraintId) ?? 0) + c.amountConsumed);
    }

    for (const lien of independentLienMembers) {
      // Re-check eligibility even for election members (member pass already ran;
      // keep this block self-contained for lien coverage arithmetic).
      const lienElig = evaluatePermissionEligibility(lien, eligibilityContext);
      for (const r of lienElig) {
        if (!requirements.some((x) => x.class === r.class && x.scope.permissionId === r.scope.permissionId && x.detail === r.detail)) {
          requirements.push(r);
        }
      }
      if (lienElig.some((r) => r.status === "FAILED")) continue;
      if (lienElig.some((r) => r.status === "UNKNOWN")) {
        independentCoverageUnknown = true;
        continue;
      }
      // Operative date / modeling — fail closed (preserve #250 eligibility posture).
      if (lien.modelingStatus !== "MODELED") {
        independentCoverageUnknown = true;
        continue;
      }
      if (lien.effectiveFrom && eligibilityContext.asOfDate < lien.effectiveFrom) continue;
      if (lien.effectiveTo && eligibilityContext.asOfDate > lien.effectiveTo) continue;
      if (
        lien.entityScope.length > 0 &&
        !lien.entityScope.some((c) => eligibilityContext.entityClasses.includes(c))
      ) {
        continue;
      }

      // Complete collateral coverage for every requested pool+tier (#256).
      const lienScopes = collateralScopes.filter((s) => s.permissionId === lien.id);
      const requested = eligibilityContext.transaction.requestedLienPriority;
      if (requested.length > 0) {
        if (lienScopes.length === 0) {
          independentCoverageUnknown = true;
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: lien.id },
            status: "UNKNOWN",
            detail: `Independent lien ${lien.id} has no collateral scope rows for requested priorities.`,
            reasonCategory: "MISSING_ASSUMPTION",
          });
          continue;
        }
        const coversAll = requested.every((req) =>
          lienScopes.some((s) => s.collateralPoolId === req.poolId && s.priorityTier === req.priorityTier),
        );
        if (!coversAll) continue;
      }

      const evaluated = evaluateProvision(permissionAsProvision(lien), financials, metricsForLien);
      if (evaluated.status !== "modeled" || evaluated.capacity == null) {
        independentCoverageUnknown = true;
        requirements.push({
          class: "LIEN_PERMISSION",
          scope: { permissionId: lien.id },
          status: "UNKNOWN",
          detail: `Independent lien ${lien.id} capacity is not determinable — cannot support secured coverage.`,
          reasonCategory: "EXTERNAL_INPUT",
        });
        continue;
      }

      // FX: apply positive finite authorizedFxRate; reject missing/zero/negative/nonfinite.
      const rawParams =
        lien.params != null && typeof lien.params === "object" && !Array.isArray(lien.params)
          ? (lien.params as Record<string, unknown>)
          : null;
      const lienCurrency = typeof rawParams?.currency === "string" ? rawParams.currency : null;
      const rawFx = rawParams?.authorizedFxRate;
      const authorizedFx =
        typeof rawFx === "number" && Number.isFinite(rawFx) && rawFx > 0 ? rawFx : null;
      const txnCurrency = eligibilityContext.transaction.currency.code;
      if (lienCurrency && lienCurrency !== txnCurrency && authorizedFx == null) {
        independentCoverageUnknown = true;
        requirements.push({
          class: "LIEN_PERMISSION",
          scope: { permissionId: lien.id },
          status: "UNKNOWN",
          detail: `Independent lien ${lien.id}: currency mismatch (${lienCurrency} ≠ ${txnCurrency}) without positive finite authorizedFxRate.`,
          reasonCategory: "EXTERNAL_INPUT",
        });
        continue;
      }
      let cap =
        lienCurrency && lienCurrency !== txnCurrency && authorizedFx != null
          ? evaluated.capacity * authorizedFx
          : evaluated.capacity;

      // Shared-capacity-aware contribution (Invariants A/B/C/E):
      // - Genuinely independent liens (no shared constraint) remain additive.
      // - Every binding shared constraint is respected (not only the first).
      // - Attribution across liens sharing a pool never exceeds verified remaining.
      // - Unquantified / non-authoritative / missing identity → fail closed.
      const bindingConstraints = constraintsFor(lien.id);
      let sharedCapBlocks = false;
      for (const constraint of bindingConstraints) {
        if (!constraint.id || constraint.id.trim() === "") {
          independentCoverageUnknown = true;
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: lien.id },
            status: "UNKNOWN",
            detail:
              `Independent lien ${lien.id} binds a shared constraint with missing identity — ` +
              `cannot attribute capacity without a stable constraint identity.`,
            reasonCategory: "MISSING_ASSUMPTION",
          });
          sharedCapBlocks = true;
          break;
        }
        if (constraint.currentUsageAuthoritative !== true) {
          independentCoverageUnknown = true;
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: lien.id },
            status: "UNKNOWN",
            detail:
              `Independent lien ${lien.id} shares constraint ${constraint.id} with non-authoritative utilization — ` +
              `remaining lien capacity cannot support a favorable secured conclusion.`,
            reasonCategory: "EXTERNAL_INPUT",
          });
          sharedCapBlocks = true;
          break;
        }
        let constraintCap: number | null = null;
        if ("amount" in constraint.cap) {
          if (!Number.isFinite(constraint.cap.amount)) {
            constraintCap = null;
          } else {
            constraintCap = constraint.cap.amount;
          }
        } else {
          const capEval = evaluateProvision(
            {
              ...permissionAsProvision(lien),
              formulaType: constraint.cap.formulaType,
              thresholdValue: constraint.cap.thresholdValue,
              params: constraint.cap.params,
            },
            financials,
            metricsForLien,
          );
          if (capEval.status !== "modeled" || capEval.capacity == null || !Number.isFinite(capEval.capacity)) {
            constraintCap = null;
          } else {
            constraintCap = capEval.capacity;
          }
        }
        if (constraintCap == null) {
          independentCoverageUnknown = true;
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: lien.id },
            status: "UNKNOWN",
            detail:
              `Independent lien ${lien.id} shares constraint ${constraint.id} whose cap is unquantified — ` +
              `fail closed; unquantified shared capacity is never treated as available.`,
            reasonCategory: "EXTERNAL_INPUT",
          });
          sharedCapBlocks = true;
          break;
        }
        const headroom = Math.max(0, constraintCap - constraint.currentUsage);
        const reserved = lienSharedReserved.get(constraint.id) ?? 0;
        const remainingOnConstraint = Math.max(0, headroom - reserved);
        cap = Math.min(cap, remainingOnConstraint);
      }
      if (sharedCapBlocks) continue;

      const contribution = Math.max(0, cap);
      // Reserve this lien's contribution against every binding constraint so
      // subsequent liens cannot re-count the same underlying headroom.
      if (contribution > EPS && bindingConstraints.length > 0) {
        for (const constraint of bindingConstraints) {
          lienSharedReserved.set(
            constraint.id,
            (lienSharedReserved.get(constraint.id) ?? 0) + contribution,
          );
        }
      }
      independentCoveragePool += contribution;
      independentClearedIds.push(lien.id);
    }

    // Election-wide independent pool also seeds amount-independent headroom.
    const independentPoolAtStart = independentCoveragePool;

    for (const debtLeg of legs.filter((l) => l.grantType === "DEBT_INCURRENCE")) {
      const autoLienLegs = legs.filter(
        (l) => l.grantType === "LIEN" && l.linkedFrom === debtLeg.permissionId,
      );

      if (autoLienLegs.length > 0) {
        let autoFailed = false;
        let autoUnknown = false;
        for (const al of autoLienLegs) {
          const lienPerm = permissionsById.get(al.permissionId);
          if (!lienPerm) {
            autoUnknown = true;
            requirements.push({
              class: "LIEN_PERMISSION",
              scope: { permissionId: debtLeg.permissionId },
              status: "UNKNOWN",
              reasonCategory: "MISSING_ASSUMPTION",
              detail: `Auto-linked lien ${al.permissionId} has no Permission row — coverage unproven.`,
            });
            continue;
          }
          // Auto-liens are often not election members — evaluate eligibility now.
          const elig = evaluatePermissionEligibility(lienPerm, eligibilityContext);
          for (const r of elig) {
            if (!requirements.some((x) => x.class === r.class && x.scope.permissionId === r.scope.permissionId && x.detail === r.detail)) {
              requirements.push(r);
            }
          }
          if (elig.some((r) => r.status === "FAILED")) autoFailed = true;
          if (elig.some((r) => r.status === "UNKNOWN")) autoUnknown = true;
        }
        if (autoFailed) {
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: debtLeg.permissionId },
            status: "FAILED",
            detail:
              `Secured debt leg ${debtLeg.permissionId} has an automatic linked lien that fails eligibility ` +
              `(entity scope, security scope, or other condition) — auto-lien presence is not coverage.`,
          });
          securedLienHeadroomByDebtId.set(debtLeg.permissionId, { kind: "none" });
          continue;
        }
        if (autoUnknown) {
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: debtLeg.permissionId },
            status: "UNKNOWN",
            reasonCategory: "LEGAL_JUDGMENT",
            detail:
              `Secured debt leg ${debtLeg.permissionId}: AUTOMATIC_LINKED_PERMISSION lien has unresolved ` +
              `eligibility — fail closed, not affirmative secured capacity.`,
          });
          securedLienHeadroomByDebtId.set(debtLeg.permissionId, { kind: "unknown" });
          continue;
        }
        // Eligible auto-lien: parasitic / unbounded for maxCapacity; SATISFIED only for positive allocation.
        securedLienHeadroomByDebtId.set(debtLeg.permissionId, { kind: "unbounded" });
        if (debtLeg.amountAllocated > EPS) {
          requirements.push({
            class: "LIEN_PERMISSION",
            scope: { permissionId: debtLeg.permissionId },
            status: "SATISFIED",
            detail:
              `Secured debt leg ${debtLeg.permissionId} covered by AUTOMATIC_LINKED_PERMISSION lien(s) ` +
              `[${autoLienLegs.map((l) => l.permissionId).join(", ")}] for allocated ${debtLeg.amountAllocated}.`,
          });
        }
        continue;
      }

      // No auto-lien for this leg — independent LIEN pool must cover it.
      // Every secured debt leg needs a lien path, even at $0 allocation: a
      // concurrent Ratio Debt member must not free-ride another leg's auto-lien
      // merely because the FIXED waterfall absorbed the whole request.
      if (independentClearedIds.length === 0) {
        requirements.push({
          class: "LIEN_PERMISSION",
          scope: { permissionId: debtLeg.permissionId },
          status: independentCoverageUnknown ? "UNKNOWN" : "FAILED",
          detail: independentCoverageUnknown
            ? `Secured debt leg ${debtLeg.permissionId} has no cleared independent lien coverage (capacity/eligibility UNKNOWN).`
            : `Secured debt leg ${debtLeg.permissionId} has no Permitted Lien path: no AUTOMATIC_LINKED_PERMISSION ` +
              `lien for this permission and no eligibility-cleared independent LIEN permission. An auto-lien on a ` +
              `different debt leg does not cover this leg.`,
          reasonCategory: independentCoverageUnknown ? "EXTERNAL_INPUT" : undefined,
        });
        securedLienHeadroomByDebtId.set(
          debtLeg.permissionId,
          independentCoverageUnknown ? { kind: "unknown" } : { kind: "none" },
        );
        continue;
      }

      if (debtLeg.amountAllocated > EPS && independentCoveragePool + EPS < debtLeg.amountAllocated) {
        requirements.push({
          class: "LIEN_PERMISSION",
          scope: { permissionId: debtLeg.permissionId },
          status: "FAILED",
          detail:
            `Secured debt leg ${debtLeg.permissionId} allocates ${debtLeg.amountAllocated} but independent lien ` +
            `coverage remaining is only ${independentCoveragePool} from [${independentClearedIds.join(", ")}] ` +
            `(insufficient capacity, consumed shared headroom, or prior debt legs exhausted the lien pool).`,
        });
        securedLienHeadroomByDebtId.set(debtLeg.permissionId, { kind: "capped", amount: Math.max(0, independentCoveragePool) });
        continue;
      }

      if (debtLeg.amountAllocated > EPS) {
        independentCoveragePool -= debtLeg.amountAllocated;
      }
      securedLienHeadroomByDebtId.set(debtLeg.permissionId, {
        kind: "capped",
        amount: independentPoolAtStart,
      });
      if (debtLeg.amountAllocated > EPS) {
        requirements.push({
          class: "LIEN_PERMISSION",
          scope: { permissionId: debtLeg.permissionId },
          status: "SATISFIED",
          detail:
            `Secured debt leg ${debtLeg.permissionId} covered by independent LIEN member(s) ` +
            `[${independentClearedIds.join(", ")}] for allocated ${debtLeg.amountAllocated}.`,
        });
      }
    }
  }

  // Independently-eligible LIEN members are coverage sources only — they do not
  // participate in the DEBT_INCURRENCE principal waterfall (see debtMembers).

  // PRIORITY_CONDITION / COLLATERAL_SCOPE requirements for every requested pool.
  for (const requested of eligibilityContext.transaction.requestedLienPriority) {
    const matchingScope = linkedPermissions.find((lp) => lp.pool.id === requested.poolId && lp.priorityTier === requested.priorityTier);
    const anyScopeOnPool = collateralScopes.find((s) => s.collateralPoolId === requested.poolId && members.some((m) => m.id === s.permissionId));
    requirements.push({
      class: "PRIORITY_CONDITION",
      scope: { poolId: requested.poolId },
      status: matchingScope || (anyScopeOnPool && anyScopeOnPool.priorityTier === requested.priorityTier) ? "SATISFIED" : "FAILED",
      detail: `Requested ${requested.priorityTier} priority on pool ${requested.poolId}.`,
    });
  }

  // PARAMETER_ADJUSTMENT_TRIGGER (design doc §C.3/§D) - a member permission
  // triggering a downstream parameter change on another, named permission.
  const parameterAdjustmentsTriggered: ParameterAdjustment[] = [];
  for (const m of members) {
    for (const trigger of parameterAdjustmentTriggersFrom(graph, m.id)) {
      const param = trigger.parameter as { parameter?: string; adjustmentBps?: number; before?: number } | undefined;
      if (!param?.parameter || typeof param.adjustmentBps !== "number") continue;
      const before = param.before ?? 0;
      parameterAdjustmentsTriggered.push({
        triggeringPermissionId: m.id,
        affectedPermissionId: trigger.toPermissionId,
        parameter: param.parameter,
        before,
        after: before + param.adjustmentBps / 10000,
        sourceProvision: trigger.sourceProvision,
      });
    }
  }

  // Fail-closed shortfall check: the transaction is being tested for the
  // FULL `requestedAmount`, not merely "does some subset of it fit
  // somewhere." If every requirement pushed above resolved (no UNKNOWN left
  // to explain the gap - an unresolved leaf calculation already produces its
  // own UNKNOWN/ASSUMPTION_REQUIRED status and must not be silently upgraded
  // to a hard FAILED here) but this election's members still could not
  // jointly absorb the whole amount, that is a confirmed, not merely
  // unresolved, insufficiency - the election must not be reported CLEAR for
  // an amount it only partially covers. Without this check, an election
  // whose modeled capacity is smaller than the requested amount would still
  // produce only SATISFIED requirements (each covering the portion it could
  // absorb) and pathStatus would incorrectly resolve to CLEAR - the same
  // class of false-affirmative bug the joint-feasibility fix above targets,
  // generalized to any election (not only the 2+-concurrent-ratio case).
  if (remaining > EPS && !requirements.some((r) => r.status === "UNKNOWN")) {
    requirements.push({
      class: "DEBT_PERMISSION",
      scope: {},
      status: "FAILED",
      detail:
        `This election's modeled capacity (${totalAllocated}) covers only part of the requested amount ` +
        `(${requestedAmount}); ${remaining} would remain with no permitting basket in this election. An election is never ` +
        `reported CLEAR for a partial amount.`,
    });
  }

  // `maxCapacity` must be "the election's own maximum capacity, independent
  // of the specific requested amount" (see the ElectionEvaluation type's own
  // doc comment) - `totalAllocated + remaining` is NOT that: by construction
  // of the allocation loop above (`remaining` starts at `requestedAmount` and
  // is decremented by exactly what `totalAllocated` gains), that sum is an
  // accounting identity that always equals `requestedAmount` itself,
  // regardless of the election's actual capacity. That bug meant
  // `computeMaximumCapacityFromEvaluations` (lib/solver/service.ts) silently
  // echoed back whatever amount happened to be tested rather than computing
  // a real maximum - caught by Phase 8's live Coherent shadow-run (every
  // document/side's solver-native "maximum capacity" came back equal to the
  // $1 probe amount; docs/coherent-phase8-population-reconciliation.md §J).
  // The correct amount-independent figure is the sum of each DEBT_INCURRENCE
  // leg's own `standaloneCapacity` (already computed above from each leg's
  // own formula/ratio room, never from `remaining`/`requestedAmount`) - LIEN
  // legs are excluded because an automatically-linked lien leg has no
  // standalone capacity of its own; it is parasitic on its linked debt leg
  // (task §6), so including it would double-count.
  //
  // Exception — single INCURRENCE_BASED + FIXED with CONCURRENT_COUNTED:
  // summing standalones double-counts shared leverage headroom (e.g. SCF flat
  // + MILA secured). COUNTED fixed usage is given pro forma effect in the
  // ratio test, so fixed+ratio total cannot exceed the ratio room; DISREGARDED
  // fixed may still stack outside that room. Take
  // max(fixed-only, disregardedFixed + ratioRoom). (#231 remediation)
  const debtLegsForMax = legs.filter((l) => l.grantType === "DEBT_INCURRENCE");
  const standaloneMaxCapacity = debtLegsForMax.reduce((sum, l) => sum + (l.standaloneCapacity ?? 0), 0);

  let singleRatioWithFixedMaxCapacity: number | undefined;
  if (incurrenceBased.length === 1 && fixed.length > 0) {
    const ratioId = incurrenceBased[0]!.id;
    const ratioCap = debtLegsForMax.find((l) => l.permissionId === ratioId)?.standaloneCapacity;
    if (ratioCap !== undefined) {
      let countedFixedCap = 0;
      let disregardedFixedCap = 0;
      for (const f of fixed) {
        const cap = debtLegsForMax.find((l) => l.permissionId === f.id)?.standaloneCapacity ?? 0;
        if (concurrentTreatmentByFixedId.get(f.id) === "COUNTED") countedFixedCap += cap;
        else disregardedFixedCap += cap;
      }
      const fixedOnly = countedFixedCap + disregardedFixedCap;
      const withRatio = disregardedFixedCap + ratioCap;
      singleRatioWithFixedMaxCapacity = Math.max(fixedOnly, withRatio);
    }
  }

  let maxCapacity =
    incurrenceBased.length > 1
      ? multiRatioMaxCapacity
      : (singleRatioWithFixedMaxCapacity ?? standaloneMaxCapacity);

  // Zero-dollar / amount-independent secured max: a positive EXACT maximum
  // requires proven lien authority at that maximum — never invent an EXACT
  // positive secured ceiling from a $0 CLEAR probe without lien at the max.
  if (eligibilityContext.transaction.secured && maxCapacity !== undefined && maxCapacity > EPS) {
    let autoUnboundedDebt = 0;
    let independentDebt = 0;
    let independentPoolCap: number | undefined;
    let anyUnknown = false;
    let anyProven = false;
    for (const debtLeg of debtLegsForMax) {
      const headroom = securedLienHeadroomByDebtId.get(debtLeg.permissionId);
      const debtCap = debtLeg.standaloneCapacity ?? 0;
      if (!headroom || headroom.kind === "none") continue;
      if (headroom.kind === "unknown") {
        anyUnknown = true;
        continue;
      }
      anyProven = true;
      if (headroom.kind === "unbounded") {
        autoUnboundedDebt += debtCap;
        continue;
      }
      // Shared independent lien pool — do not sum the pool across debt legs.
      independentDebt += debtCap;
      independentPoolCap =
        independentPoolCap === undefined ? headroom.amount : Math.min(independentPoolCap, headroom.amount);
    }
    const independentLimited =
      independentPoolCap === undefined ? 0 : Math.min(independentDebt, independentPoolCap);
    const lienLimited = autoUnboundedDebt + independentLimited;
    if (!anyProven && anyUnknown) {
      maxCapacity = 0;
    } else {
      maxCapacity = Math.min(maxCapacity, lienLimited);
    }
  }

  return {
    election,
    legs,
    linkedPermissions,
    requirements,
    parameterAdjustmentsTriggered,
    sharedConstraintsConsumed: sharedConsumption,
    totalAllocated,
    maxCapacity,
    status: "EVALUATED",
  };
}

// ---------------------------------------------------------------------------
// §O - Monotone bisection (used for maximum capacity, and as the documented
// fallback for elections with 2+ concurrently-drawn INCURRENCE_BASED members)
// ---------------------------------------------------------------------------

/**
 * design doc §O.2 - generic monotone bisection for "the largest X such that
 * X <= capacity(X)", valid whenever `capacity` is non-increasing in X (true
 * for every existing ratio-room FormulaType, by construction). Returns the
 * boundary to within `precision` (default $0.001M) after a bounded number of
 * iterations - fully deterministic for identical inputs (task §13).
 */
export function bisectMaxFeasibleAmount(capacityAtProFormaAmount: (x: number) => number, opts?: { precision?: number; maxIterations?: number }): number {
  const precision = opts?.precision ?? 0.001;
  const maxIterations = opts?.maxIterations ?? 200;

  let low = 0;
  let high = Math.max(1, capacityAtProFormaAmount(0));
  // Expand the search bracket until capacity(high) <= high (the boundary lies within [low, high]).
  let guard = 0;
  while (capacityAtProFormaAmount(high) > high && guard < 100) {
    high *= 2;
    guard++;
  }

  for (let i = 0; i < maxIterations && high - low > precision; i++) {
    const mid = (low + high) / 2;
    if (capacityAtProFormaAmount(mid) >= mid) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * design doc §E.4 step 4 - the fallback for an election with 2+
 * concurrently-drawn INCURRENCE_BASED members. Uses an even split across the
 * incurrence-based members as the deterministic default allocation strategy
 * (the design doc does not mandate a specific split - task §13 requires
 * that whichever rule is chosen be stable/documented, which this is).
 */
export function computeElectionMaxCapacityBisected(members: Permission[], fixedTotal: number, financials: FinancialSnapshotInput): number {
  // LIEN permissions never satisfy debt-principal capacity (same debtMembers rule).
  const debtMembers = members.filter((m) => m.grantType === "DEBT_INCURRENCE");
  const incurrenceBased = debtMembers.filter((m) => m.amountKind === "INCURRENCE_BASED");
  if (incurrenceBased.length === 0) return fixedTotal;
  const share = 1 / incurrenceBased.length;
  const capacityAt = (x: number): number => {
    const adjustedFin = withProFormaDebt(financials, fixedTotal + x, fixedTotal + x);
    const metrics = computeLeverageMetrics(adjustedFin);
    let total = 0;
    for (const m of incurrenceBased) {
      const evaluated = evaluateProvision(permissionAsProvision(m), adjustedFin, metrics);
      if (evaluated.status === "modeled") total += (evaluated.capacity ?? 0) * share;
    }
    return total;
  };
  return fixedTotal + bisectMaxFeasibleAmount(capacityAt);
}

// ---------------------------------------------------------------------------
// Top-level: build PermissionPaths for a Requirement Group
// ---------------------------------------------------------------------------

export function buildPermissionPaths(evaluations: ElectionEvaluation[]): PermissionPath[] {
  return evaluations
    .filter((e) => e.status === "EVALUATED")
    .map((e) => {
      const status = pathStatus(e.requirements);
      return {
        id: e.election.id,
        status,
        legs: e.legs,
        linkedPermissions: e.linkedPermissions,
        conditionsTested: e.requirements,
        sharedConstraintsConsumed: e.sharedConstraintsConsumed,
        assumptionsUsed: [],
        parameterAdjustmentsTriggered: e.parameterAdjustmentsTriggered,
        sourceProvisions: e.legs.map((l) => ({ documentId: l.sourceProvision.documentId, sectionRef: l.sourceProvision.sectionRef, permissionId: l.permissionId })),
        stateEffects: { debtOutstandingDelta: [], cashDelta: 0, basketUsageDelta: [], sharedConstraintUsageDelta: [] },
      };
    });
}
