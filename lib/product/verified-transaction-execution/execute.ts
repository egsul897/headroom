/**
 * Canonical verified-transaction orchestration entrypoint.
 *
 * Call graph (product → verified-execution → runtime):
 *
 *   executeUnifiedVerifiedTransaction
 *     → evaluateOperativeSourceAuthority          (adapter / #274 + #283 gate)
 *     → validateFinancialEvidenceBundle           (adapter / #273 + #290 feed)
 *     → evaluateUtilizationAuthorityGate          (lib/capacity / #290 records)
 *     → authorizeDecision                         (#282 identity boundary)
 *     → authorizeCompletenessIssuer               (#268/#279 trusted-issuer)
 *     → evaluateVerifiedCapacity                  (REQUIRE)
 *          → bind → resolveRuntimeVerificationEnvelope
 *          → buildCapacityGraph → evaluateCapacityState
 *     → simulateVerifiedTransaction               (REQUIRE)
 *          → assertRestoreAuthority → simulateTransaction
 *     → classify production authority (fail-closed)
 *
 * Does NOT import runtime/*, the legacy solver service, or duplicate basket arithmetic.
 * Does NOT write production DB. Does NOT promote DISCOVERED → VERIFIED_EXECUTABLE
 * or HYPOTHETICAL → PRODUCTION_AUTHORITY. Does NOT invent a production IdP.
 */

import {
  authorizeCompletenessIssuer,
  authorizeDecision,
  isTrustedIdentityProductionActive,
  type CompletenessIssuerRole,
} from "@/lib/capacity";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type HypotheticalTransaction,
  type SelectedPath,
  type VerifiedCapacityResult,
  type VerifiedTransactionResult,
} from "@/lib/contract-model/verified-execution";
import { validateFinancialEvidenceBundle } from "./adapters/financial-evidence";
import { evaluateOperativeSourceAuthority } from "./adapters/operative-authority";
import { evaluateUtilizationAuthorityGate } from "./adapters/utilization";
import {
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type BindingConstraint,
  type ExecutionMode,
  type ExecutionStatus,
  type ExecutionTraceStep,
  type ProductionAuthorityClassification,
  type UnifiedTransactionExecutionRequest,
  type UnifiedTransactionExecutionResult,
} from "./types";

function moneyCapNode(ruleId: string): string {
  return `capacity:rule:${ruleId}`;
}

function amountToDollarsString(amount: number, currency: string): string | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  // Whole major-unit dollars as decimal string (Phase 4A MONEY), USD-shaped.
  if (currency !== "USD") {
    // Still encode as integer string when safe; currency mismatch is gated earlier.
    if (!Number.isSafeInteger(Math.round(amount))) return null;
    return String(Math.round(amount));
  }
  if (!Number.isSafeInteger(Math.round(amount))) return null;
  if (Math.abs(amount - Math.round(amount)) > 1e-9) return null;
  return String(Math.round(amount));
}

function buildConsumeTransaction(args: {
  companyId: string;
  instrumentKey: string;
  evaluationDate: string;
  amountDollars: string;
  currency: string;
  ruleId: string;
  path: UnifiedTransactionExecutionRequest["selectedLegalPath"];
  label: string;
  transactionId: string;
}): { transaction: HypotheticalTransaction; selectedPath: SelectedPath } {
  const nodeId =
    args.path.capacityNodeIds[0] ?? moneyCapNode(args.ruleId);
  const transaction: HypotheticalTransaction = {
    transactionId: args.transactionId,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    effectiveAsOf: args.evaluationDate,
    category: null,
    label: args.label,
    intendedAmount: {
      type: "MONEY",
      amount: args.amountDollars,
      currency: args.currency,
    },
    effects: [
      {
        effectId: "e-consume-1",
        kind: "CONSUME_CAPACITY",
        capacityNodeId: nodeId,
        amount: {
          type: "MONEY",
          amount: args.amountDollars,
          currency: args.currency,
        },
      },
    ],
    provenance: {
      source: "unified-verified-transaction-execution",
      sourceVersion: UNIFIED_TRANSACTION_EXECUTION_VERSION,
      approvalRef: null,
    },
  };
  const selectedPath: SelectedPath = {
    capacityNodeIds:
      args.path.capacityNodeIds.length > 0
        ? [...args.path.capacityNodeIds]
        : [nodeId],
    ruleIds:
      args.path.ruleIds.length > 0 ? [...args.path.ruleIds] : [args.ruleId],
    sharedCapacityIds: [...args.path.sharedCapacityIds],
    reclassificationElectionIds: [],
  };
  return { transaction, selectedPath };
}

function capacityExpressionKind(
  pkg: UnifiedTransactionExecutionRequest["verifiedPackage"],
  ruleId: string,
): BindingConstraint["kind"] {
  const rule = pkg.rules.find((r) => r.ruleId === ruleId);
  const expr = rule?.capacityExpression;
  if (!expr) return "OTHER";
  if (expr.kind === "MAX") return "GREATER_OF";
  if (expr.kind === "MONEY") return "FIXED_DOLLAR";
  return "OTHER";
}

function classifyProductionAuthority(args: {
  mode: ExecutionMode;
  operativeOk: boolean;
  operativeProductionPromotionActive: boolean;
  financialProduction: boolean;
  utilizationProduction: boolean;
  reviewerOk: boolean;
  identityOk: boolean;
  ruleLifecycleOk: boolean;
  capacityExecuted: boolean;
  simulationSatisfied: boolean;
}): ProductionAuthorityClassification {
  if (args.mode === "HYPOTHETICAL") return "HYPOTHETICAL_ONLY";
  const all =
    args.operativeOk &&
    args.operativeProductionPromotionActive &&
    args.financialProduction &&
    args.utilizationProduction &&
    args.reviewerOk &&
    args.identityOk &&
    args.ruleLifecycleOk &&
    args.capacityExecuted &&
    args.simulationSatisfied &&
    isTrustedIdentityProductionActive();
  // Host trusted-issuer + #282 identity activation remain BLOCKED on repository
  // wiring today. Even a fully authenticated fixture path stays blocked until a
  // real production IdP / HostIdentityProvider is registered — never invent one.
  if (!all) return "PRODUCTION_AUTHORITY_BLOCKED";
  return "PRODUCTION_AUTHORITY_BLOCKED";
}

function executionStatusOf(args: {
  earlyRefuse: boolean;
  capacity: VerifiedCapacityResult | null;
  simulation: VerifiedTransactionResult | null;
  mode: ExecutionMode;
  production: ProductionAuthorityClassification;
}): ExecutionStatus {
  if (args.earlyRefuse) return "REFUSED";
  if (!args.capacity) return "REFUSED";
  if (args.capacity.outcome === "REFUSED") return "REFUSED";
  if (!args.simulation) return "NEEDS_INPUT";
  if (args.simulation.outcome === "REFUSED") return "REFUSED";
  const sim = args.simulation.simulation;
  if (sim.simulationStatus !== "SIMULATED") return "UNSUPPORTED";
  if (sim.selectedPathResult === "INSUFFICIENT_CAPACITY") return "INSUFFICIENT";
  if (sim.selectedPathResult === "NOT_SATISFIED") return "INSUFFICIENT";
  if (sim.selectedPathResult === "SATISFIED") {
    if (
      args.mode === "HYPOTHETICAL" ||
      args.production === "HYPOTHETICAL_ONLY" ||
      args.production === "PRODUCTION_AUTHORITY_BLOCKED"
    ) {
      return "EXECUTED_HYPOTHETICAL";
    }
    return "EXECUTED_SATISFIED";
  }
  return "UNSUPPORTED";
}

/**
 * Canonical server-side orchestration entrypoint.
 * Pure / in-memory — no production DB writes, no paid inference, no new solver.
 */
export async function executeUnifiedVerifiedTransaction(
  request: UnifiedTransactionExecutionRequest,
): Promise<UnifiedTransactionExecutionResult> {
  const mode: ExecutionMode = request.mode ?? "HYPOTHETICAL";
  const trace: ExecutionTraceStep[] = [];
  const blockers: string[] = [];
  const missingInputs: string[] = [];
  const conditions: string[] = [];
  const limitations: string[] = [];
  const bindingConstraints: BindingConstraint[] = [];
  const sourceCitations: string[] = [];

  const push = (
    step: string,
    outcome: ExecutionTraceStep["outcome"],
    detail: string,
    refs?: string[],
  ) => {
    trace.push({ step, outcome, detail, refs });
  };

  // --- Identity -------------------------------------------------------------
  const pkg = request.verifiedPackage;
  if (pkg.companyId !== request.companyId) {
    blockers.push(
      `wrong entity: package companyId "${pkg.companyId}" ≠ request "${request.companyId}"`,
    );
    push("identity.company", "REFUSE", blockers[blockers.length - 1]!);
  } else {
    push("identity.company", "PASS", `companyId=${request.companyId}`);
  }
  if (pkg.instrumentKey !== request.instrumentKey) {
    blockers.push(
      `wrong instrument: package "${pkg.instrumentKey}" ≠ request "${request.instrumentKey}"`,
    );
    push("identity.instrument", "REFUSE", blockers[blockers.length - 1]!);
  } else {
    push("identity.instrument", "PASS", `instrumentKey=${request.instrumentKey}`);
  }

  // --- Verified executable rule identity ------------------------------------
  const ruleClaim = request.verifiedExecutableRule;
  if (ruleClaim.lifecycle === "DISCOVERED") {
    blockers.push(
      "DISCOVERED rule lifecycle cannot promote to VERIFIED_EXECUTABLE at execution",
    );
    push("rule.lifecycle", "REFUSE", blockers[blockers.length - 1]!);
  } else if (ruleClaim.lifecycle !== "VERIFIED_EXECUTABLE") {
    blockers.push(
      `rule lifecycle ${ruleClaim.lifecycle} is not VERIFIED_EXECUTABLE`,
    );
    push("rule.lifecycle", "REFUSE", blockers[blockers.length - 1]!);
  } else {
    push("rule.lifecycle", "PASS", "VERIFIED_EXECUTABLE");
  }

  const ruleInPkg = pkg.rules.find((r) => r.ruleId === ruleClaim.ruleId);
  if (!ruleInPkg) {
    blockers.push(
      `verified executable rule "${ruleClaim.ruleId}" not present in VerifiedExecutionPackage`,
    );
    push("rule.package", "REFUSE", blockers[blockers.length - 1]!);
  } else {
    const art = pkg.verifications.find(
      (v) => v.ruleOrDefinitionId === ruleClaim.ruleId && v.kind === "RULE",
    );
    if (!art) {
      blockers.push(
        `no RULE verification artifact for ${ruleClaim.ruleId} — unverified IR does not execute`,
      );
      push("rule.verification", "REFUSE", blockers[blockers.length - 1]!);
    } else if (
      art.verifiedIdentity.irSchemaVersion !== ruleClaim.irSchemaVersion ||
      art.verifiedIdentity.compilerVersion !== ruleClaim.compilerVersion ||
      art.verifiedIdentity.sourceContentVersion !== ruleClaim.sourceContentVersion
    ) {
      blockers.push(
        `verified rule identity mismatch for ${ruleClaim.ruleId} — stale or unbound verification claim`,
      );
      push("rule.verification", "REFUSE", blockers[blockers.length - 1]!);
    } else {
      push(
        "rule.verification",
        "PASS",
        `artifact=${ruleClaim.verificationArtifactId}`,
        [ruleClaim.sourceCitation],
      );
    }
    sourceCitations.push(ruleClaim.sourceCitation);
    if (ruleInPkg.provenance?.sourceCitation) {
      sourceCitations.push(ruleInPkg.provenance.sourceCitation);
    }
  }

  // Path must include the verified rule and be EXPLICIT.
  const path = request.selectedLegalPath;
  if (path.selectionMode !== "EXPLICIT") {
    blockers.push("legal path selectionMode must be EXPLICIT");
    push("path.selection", "REFUSE", blockers[blockers.length - 1]!);
  }
  if (!path.ruleIds.includes(ruleClaim.ruleId)) {
    blockers.push(
      `selected legal path does not include verified rule ${ruleClaim.ruleId}`,
    );
    push("path.rule", "REFUSE", blockers[blockers.length - 1]!);
  } else {
    push("path.rule", "PASS", `pathId=${path.pathId}`);
  }

  // Shared pools must not be treated as additive independent capacities.
  if (path.sharedCapacityIds.length > 0) {
    bindingConstraints.push({
      kind: "SHARED_POOL",
      description:
        "Shared debt/lien capacity is a single pool — members are not additive independent baskets",
      refs: [...path.sharedCapacityIds],
    });
    for (const poolId of path.sharedCapacityIds) {
      const pool = (pkg.sharedCapacities ?? []).find((c) => c.sharedCapId === poolId);
      if (!pool) {
        blockers.push(
          `shared capacity ${poolId} selected but absent from package — unsupported path`,
        );
        push("path.shared", "REFUSE", blockers[blockers.length - 1]!);
      } else {
        const art = pkg.verifications.find(
          (v) => v.ruleOrDefinitionId === poolId && v.kind === "SHARED_CAPACITY",
        );
        if (!art) {
          blockers.push(
            `shared capacity ${poolId} lacks SHARED_CAPACITY verification — pool never shapes capacity unverified`,
          );
          push("path.shared", "REFUSE", blockers[blockers.length - 1]!);
        } else {
          push("path.shared", "PASS", `sharedCapId=${poolId}`);
        }
      }
    }
  }

  bindingConstraints.push({
    kind: capacityExpressionKind(pkg, ruleClaim.ruleId),
    description: `Capacity expression for ${ruleClaim.ruleId}`,
    refs: [ruleClaim.ruleId, ruleClaim.sourceSectionRef],
  });

  // --- Operative source authority -------------------------------------------
  const operative = evaluateOperativeSourceAuthority(
    request.operativeSourceAuthority,
    request.instrumentKey,
    request.transaction.date,
  );
  if (!operative.ok) {
    blockers.push(...operative.blockers);
    push("operative.authority", "REFUSE", operative.blockers.join("; ") || "refused");
  } else {
    push(
      "operative.authority",
      "PASS",
      `CONFIRMED_OPERATIVE ${operative.sourceDocumentId}`,
      [operative.sourceCitation],
    );
  }
  sourceCitations.push(operative.sourceCitation);
  bindingConstraints.push({
    kind: "OPERATIVE_AUTHORITY",
    description: `Operative authority ${operative.authority}`,
    refs: [operative.sourceDocumentId, operative.sourceCitation],
  });

  // --- Trusted identity authorization (#282) — before evidence gates --------
  let identityOk = true;
  let trustedIssuerAuth = request.reviewerAuthorization.trustedIssuerAuth ?? null;
  const requireIdentity =
    Boolean(request.reviewerAuthorization.requireIdentityAuthorization) ||
    mode === "PRODUCTION_AUTHORITY" ||
    request.reviewerAuthorization.verifiedServerPrincipal !== undefined;
  if (requireIdentity) {
    if (mode === "PRODUCTION_AUTHORITY" && !isTrustedIdentityProductionActive()) {
      identityOk = false;
      blockers.push(
        "trusted identity production activation BLOCKED — no production IdP; refuse PRODUCTION_AUTHORITY",
      );
      push("identity.authorization", "REFUSE", blockers[blockers.length - 1]!);
    }
    const decision =
      request.reviewerAuthorization.identityDecision ??
      "AUTHORIZE_PRODUCTION_CAPACITY";
    const idAuth = await authorizeDecision({
      principal: request.reviewerAuthorization.verifiedServerPrincipal,
      companyId: request.companyId,
      decision,
      evidenceId: ruleClaim.verificationArtifactId,
      consumeOnGrant: mode === "PRODUCTION_AUTHORITY",
    });
    if (!idAuth.granted) {
      identityOk = false;
      blockers.push(
        ...idAuth.blockers.map((b) => `identity authorization refused: ${b}`),
      );
      push(
        "identity.authorization",
        "REFUSE",
        idAuth.blockers.join("; ") || "authorizeDecision denied",
      );
    } else if (identityOk) {
      push(
        "identity.authorization",
        "PASS",
        `authorizeDecision granted decision=${decision}`,
      );
      if (idAuth.trustedIssuerAuth && trustedIssuerAuth == null) {
        trustedIssuerAuth = idAuth.trustedIssuerAuth;
      }
    }
  } else {
    push(
      "identity.authorization",
      "INFO",
      "identity authorization not required for this hypothetical request",
    );
  }

  // --- Financial evidence ---------------------------------------------------
  const financial = validateFinancialEvidenceBundle({
    evidence: request.financialEvidence,
    expectedCompanyId: request.companyId,
    expectedCurrency: request.transaction.currency,
    evaluationAsOf: request.transaction.date,
    trustedIssuerAuth,
    allowHypotheticalFinancials:
      mode === "HYPOTHETICAL" && Boolean(request.allowHypotheticalFinancials),
  });
  if (!financial.ok) {
    blockers.push(...financial.blockers);
    if (
      financial.refusalReasons.includes("MISSING_REQUIRED_METRIC") ||
      financial.refusalReasons.includes("EMPTY_BUNDLE")
    ) {
      for (const key of request.financialEvidence.requiredMetricKeys) {
        missingInputs.push(`financial metric:${key}`);
      }
      if (request.financialEvidence.metrics.length === 0) {
        missingInputs.push("financial evidence bundle");
      }
    }
    push("financial.evidence", "REFUSE", financial.blockers.join("; ") || "refused");
  } else {
    push(
      "financial.evidence",
      "PASS",
      financial.productionAuthoritative
        ? "AUTHENTIC+VERIFIED production-grade financials"
        : "hypothetical/synthetic financials accepted for HYPOTHETICAL mode only",
    );
  }
  bindingConstraints.push({
    kind: "FINANCIAL_EVIDENCE",
    description: financial.productionAuthoritative
      ? "Authenticated financial evidence"
      : "Non-production financial evidence",
    refs: request.financialEvidence.metrics.map((m) => m.provenanceId),
  });

  // --- Utilization completeness ---------------------------------------------
  const util = evaluateUtilizationAuthorityGate({
    capacityRuleId: request.utilization.capacityRuleId || ruleClaim.ruleId,
    asOf: request.transaction.date,
    currency: request.transaction.currency,
    records: request.utilization.records,
    completenessCertificate: request.utilization.completenessCertificate,
    sharedCapacityId: request.utilization.sharedCapacityId,
    trustedIssuerAuth,
    allowSyntheticRemaining:
      mode === "HYPOTHETICAL" &&
      Boolean(request.utilization.allowSyntheticRemaining),
  });
  if (!util.supportsRemainingClaim) {
    // Missing utilization refuses production remaining / favorable production
    // claims. Hypothetical simulation may still run capacity arithmetic under
    // REQUIRE when ledger is supplied — but remaining publication stays closed.
    if (request.utilization.completenessCertificate == null) {
      missingInputs.push("utilization completeness certificate");
      limitations.push(
        "UNKNOWN utilization — missing completeness cannot be treated as zero usage",
      );
    }
    push(
      "utilization.completeness",
      mode === "PRODUCTION_AUTHORITY" ? "REFUSE" : "INFO",
      util.blockers.join("; ") || "remaining claim unsupported",
    );
    if (mode === "PRODUCTION_AUTHORITY") {
      blockers.push(...util.blockers);
    }
  } else {
    push(
      "utilization.completeness",
      "PASS",
      util.productionAuthoritative
        ? "production-authoritative utilization completeness"
        : "demo/hypothetical utilization completeness",
    );
  }
  bindingConstraints.push({
    kind: "UTILIZATION",
    description: `Utilization knowledge=${util.knowledge ?? "UNKNOWN"}`,
    refs: [request.utilization.capacityRuleId || ruleClaim.ruleId],
  });

  // --- Reviewer authorization (#268/#279 trusted-issuer) --------------------
  let reviewerOk = true;
  if (request.reviewerAuthorization.required) {
    const role = request.reviewerAuthorization.role;
    const actorId = request.reviewerAuthorization.actorId;
    if (!actorId || !role) {
      reviewerOk = false;
      blockers.push("reviewer authorization required but actorId/role missing");
      push("reviewer.authorization", "REFUSE", blockers[blockers.length - 1]!);
    } else {
      const auth = authorizeCompletenessIssuer(
        { actorId, role: role as CompletenessIssuerRole },
        trustedIssuerAuth,
      );
      if (!auth.ok) {
        reviewerOk = false;
        blockers.push(...auth.blockers.map((b) => `forged/unauthorized approval: ${b}`));
        push("reviewer.authorization", "REFUSE", auth.blockers.join("; "));
      } else {
        push("reviewer.authorization", "PASS", `actorId=${actorId} role=${role}`);
      }
    }
  } else {
    push("reviewer.authorization", "INFO", "reviewer authorization not required for this request");
  }

  // --- #283 production-promotion caveats (CP / WITH_CAVEATS) -----------------
  if (
    mode === "PRODUCTION_AUTHORITY" &&
    !operative.productionPromotion.productionAuthorityActive
  ) {
    blockers.push(
      ...operative.productionPromotion.refusalReasons.map(
        (r) => `operative production promotion refused: ${r}`,
      ),
    );
    push(
      "operative.productionPromotion",
      "REFUSE",
      operative.productionPromotion.refusalReasons.join("; ") ||
        "CONFIRMED_OPERATIVE_WITH_CAVEATS / unproven CP cannot activate production",
    );
  } else if (!operative.productionPromotion.productionAuthorityActive) {
    limitations.push(
      ...operative.productionPromotion.refusalReasons.map(
        (r) => `operative production promotion blocked: ${r}`,
      ),
    );
    push(
      "operative.productionPromotion",
      "INFO",
      "disclosed caveats / unproven CP — hypothetical only; not PRODUCTION_AUTHORITY_ACTIVE",
    );
  } else {
    push("operative.productionPromotion", "PASS", "unconditional production promotion eligible");
  }

  // Currency / amount preflight
  const amountDollars = amountToDollarsString(
    request.transaction.amount,
    request.transaction.currency,
  );
  if (amountDollars == null) {
    blockers.push("invalid transaction amount — nonfinite, negative, or unsafe precision");
    push("transaction.amount", "REFUSE", blockers[blockers.length - 1]!);
  } else {
    push(
      "transaction.amount",
      "PASS",
      `${amountDollars} ${request.transaction.currency}`,
    );
  }

  const earlyRefuse = blockers.length > 0;

  let capacity: VerifiedCapacityResult | null = null;
  let simulation: VerifiedTransactionResult | null = null;
  let selectedPath: SelectedPath | null = null;
  let transaction: HypotheticalTransaction | null = null;
  const transactionId =
    request.transaction.transactionId ??
    `ute-${request.companyId}-${request.transaction.date}-${ruleClaim.ruleId}-${amountDollars ?? "x"}`.slice(
      0,
      120,
    );

  if (!earlyRefuse && amountDollars != null) {
    capacity = evaluateVerifiedCapacity({
      package: pkg,
      inputs: request.inputs,
      ledger: request.ledger,
      asOf: request.transaction.date,
    });
    if (capacity.outcome === "REFUSED") {
      blockers.push(
        ...capacity.refusals.map((r) => `${r.code}: ${r.message}`),
      );
      push(
        "verified.capacity",
        "REFUSE",
        capacity.refusals.map((r) => r.code).join(","),
      );
    } else {
      push(
        "verified.capacity",
        "PASS",
        `EXECUTED packageHash=${capacity.packageHash.slice(0, 12)}…`,
      );
      const entry = capacity.state.capacities.find(
        (c) => c.ruleId === ruleClaim.ruleId,
      );
      if (entry) {
        conditions.push(`pre-status:${entry.status}`);
        for (const lim of entry.limitations) {
          limitations.push(lim.message);
        }
      }

      const built = buildConsumeTransaction({
        companyId: request.companyId,
        instrumentKey: request.instrumentKey,
        evaluationDate: request.transaction.date,
        amountDollars,
        currency: request.transaction.currency,
        ruleId: ruleClaim.ruleId,
        path,
        label:
          request.transaction.label ??
          `${request.transaction.type} ${amountDollars} ${request.transaction.currency} via ${path.label}`,
        transactionId,
      });
      transaction = built.transaction;
      selectedPath = built.selectedPath;

      simulation = simulateVerifiedTransaction({
        package: pkg,
        inputs: request.inputs,
        ledger: request.ledger,
        asOf: request.transaction.date,
        transaction,
        selectedPath,
      });
      if (simulation.outcome === "REFUSED") {
        blockers.push(
          ...simulation.refusals.map((r) => `${r.code}: ${r.message}`),
        );
        push(
          "verified.simulation",
          "REFUSE",
          simulation.refusals.map((r) => r.code).join(","),
        );
      } else {
        push(
          "verified.simulation",
          simulation.simulation.selectedPathResult === "SATISFIED"
            ? "PASS"
            : "INFO",
          `status=${simulation.simulation.simulationStatus} path=${simulation.simulation.selectedPathResult}`,
        );
        conditions.push(
          `selectedPathResult:${simulation.simulation.selectedPathResult}`,
        );
      }
    }
  } else {
    push(
      "verified.capacity",
      "REFUSE",
      "skipped — prior authority gates refused execution",
    );
  }

  const capacityExecuted = capacity?.outcome === "EXECUTED";
  const simulationSatisfied =
    simulation?.outcome === "EXECUTED" &&
    simulation.simulation.simulationStatus === "SIMULATED" &&
    simulation.simulation.selectedPathResult === "SATISFIED";

  // Incomplete authority never yields a favorable production result.
  if (
    mode === "PRODUCTION_AUTHORITY" &&
    (!financial.productionAuthoritative ||
      !util.productionAuthoritative ||
      !operative.ok ||
      !operative.productionPromotion.productionAuthorityActive ||
      !reviewerOk ||
      !identityOk)
  ) {
    for (const msg of [
      !financial.productionAuthoritative
        ? "incomplete financial authority — no favorable PRODUCTION_AUTHORITY result"
        : null,
      !util.productionAuthoritative
        ? "incomplete utilization authority — no favorable PRODUCTION_AUTHORITY result"
        : null,
      !operative.ok ? "incomplete operative authority — no favorable PRODUCTION_AUTHORITY result" : null,
      // Must match sibling fields: inactive promotion → disclose incomplete summary;
      // active promotion → omit (never describe blocked authority as complete).
      !operative.productionPromotion.productionAuthorityActive
        ? "incomplete operative production promotion — caveats/CP refuse PRODUCTION_AUTHORITY"
        : null,
      !reviewerOk ? "incomplete reviewer authorization — no favorable PRODUCTION_AUTHORITY result" : null,
      !identityOk ? "incomplete identity authorization — no favorable PRODUCTION_AUTHORITY result" : null,
    ]) {
      if (msg && !blockers.includes(msg)) blockers.push(msg);
    }
  }

  const productionAuthority = classifyProductionAuthority({
    mode,
    operativeOk: operative.ok,
    operativeProductionPromotionActive:
      operative.productionPromotion.productionAuthorityActive,
    financialProduction: financial.productionAuthoritative,
    utilizationProduction: util.productionAuthoritative,
    reviewerOk,
    identityOk,
    ruleLifecycleOk: ruleClaim.lifecycle === "VERIFIED_EXECUTABLE",
    capacityExecuted: Boolean(capacityExecuted),
    simulationSatisfied: Boolean(simulationSatisfied),
  });

  push(
    "production.authority",
    "INFO",
    productionAuthority === "PRODUCTION_AUTHORITY_ACTIVE"
      ? "PRODUCTION_AUTHORITY_ACTIVE"
      : `${productionAuthority} — host trusted-issuer activation remains BLOCKED; HYPOTHETICAL must not promote`,
  );

  // Favorable production claims are stripped when authority is incomplete.
  const favorableBlocked =
    mode === "PRODUCTION_AUTHORITY" &&
    productionAuthority !== "PRODUCTION_AUTHORITY_ACTIVE";

  const status = executionStatusOf({
    earlyRefuse: earlyRefuse || (favorableBlocked && !simulationSatisfied),
    capacity,
    simulation,
    mode,
    production: productionAuthority,
  });

  // If production mode asked for authority but remains blocked, never report
  // EXECUTED_SATISFIED — downgrade to hypothetical or refused.
  let finalStatus = status;
  if (mode === "PRODUCTION_AUTHORITY" && simulationSatisfied) {
    finalStatus = "EXECUTED_HYPOTHETICAL";
    limitations.push(
      "Production authority BLOCKED — result classified HYPOTHETICAL only; do not present as PRODUCTION_AUTHORITY",
    );
  }
  if (mode === "PRODUCTION_AUTHORITY" && !simulationSatisfied && blockers.length > 0) {
    finalStatus = earlyRefuse || !capacityExecuted ? "REFUSED" : status;
  }

  const preStatus =
    capacity?.outcome === "EXECUTED"
      ? capacity.state.capacities.find((c) => c.ruleId === ruleClaim.ruleId)
          ?.status ?? null
      : null;
  const postSelectedPathResult =
    simulation?.outcome === "EXECUTED"
      ? simulation.simulation.selectedPathResult
      : null;
  const simulationStatus =
    simulation?.outcome === "EXECUTED"
      ? simulation.simulation.simulationStatus
      : null;
  const stateHash =
    simulation?.outcome === "EXECUTED"
      ? simulation.simulation.postState?.stateHash ??
        simulation.simulation.postStateIdentity?.postStateHash ??
        (capacity?.outcome === "EXECUTED" ? capacity.state.stateHash : null)
      : capacity?.outcome === "EXECUTED"
        ? capacity.state.stateHash
        : null;

  const uniqueCitations = [...new Set(sourceCitations.filter(Boolean))].sort();
  const uniqueBlockers = [...new Set(blockers)];

  return {
    contractVersion: UNIFIED_TRANSACTION_EXECUTION_VERSION,
    executionStatus: finalStatus,
    mode,
    productionAuthority,
    legalPath: {
      pathId: path.pathId,
      ruleIds: [...path.ruleIds],
      label: path.label,
      selected: true,
    },
    sourceCitations: uniqueCitations,
    financialInputs: {
      validation: financial,
      metrics: request.financialEvidence.metrics.map((m) => ({
        metricKey: m.metricKey,
        value: m.value,
        currency: m.currency,
        authenticity: m.authenticity,
        verificationStatus: m.verificationStatus,
        provenanceId: m.provenanceId,
      })),
    },
    bindingConstraints,
    capacityEffects: {
      preStatus,
      postSelectedPathResult,
      simulationStatus,
      sharedPoolIds: [...path.sharedCapacityIds],
      consumedNodeIds: selectedPath?.capacityNodeIds ?? [],
      grossCapacityLabel: preStatus,
      remainingPublicationAllowed:
        util.supportsRemainingClaim && util.productionAuthoritative,
      utilizationKnowledge: util.knowledge,
    },
    missingInputs: [...new Set(missingInputs)],
    conditions: [...new Set(conditions)],
    utilizationAuthority: {
      supportsRemainingClaim: util.supportsRemainingClaim,
      productionAuthoritative: util.productionAuthoritative,
      knowledge: util.knowledge,
      blockers: util.blockers,
      resolution: util.resolution,
    },
    operativeAuthority: operative,
    postStateIdentity: {
      packageHash:
        capacity != null
          ? capacity.packageHash
          : null,
      transactionId: transaction?.transactionId ?? transactionId,
      evaluationDate: request.transaction.date,
      stateHash,
    },
    trace,
    blockers: uniqueBlockers,
    verified: {
      capacity,
      simulation,
      selectedPath,
      transaction,
    },
    limitations: [...new Set(limitations)],
    note:
      finalStatus === "REFUSED"
        ? "Unified verified transaction execution refused — fail-closed; do not invent capacity or promote authority."
        : productionAuthority === "HYPOTHETICAL_ONLY" ||
            productionAuthority === "PRODUCTION_AUTHORITY_BLOCKED"
          ? "Hypothetical / non-production result under verified-execution REQUIRE. Production authority remains BLOCKED."
          : "Verified transaction executed under REQUIRE with production authority classification.",
  };
}
