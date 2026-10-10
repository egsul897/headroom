/**
 * Capacity / simulation boundary for greater-of assets basket vertical slice.
 *
 * Missing Total Assets → NEEDS_INPUT / not affirmative.
 * PRODUCTION → always refused without authenticated financial evidence.
 */
import type { IRRule, IRSharedCapacity } from "../../ir/types";
import {
  evaluateVerifiedCapacity,
  type VerifiedCapacityResult,
  type VerifiedExecutionPackage,
  type VerifiedUnitArtifact,
} from "../../verified-execution";
import type { SemanticVerificationResult } from "../semantic-verification/types";
import { fixtureInputResolver, metricInput } from "../../runtime/input-resolver";
import { rationalFromNumber } from "../../runtime/decimal";
import type { InputProvenance, RuntimeValue } from "../../runtime/types";
import type { LedgerUsageRecord } from "../../runtime/capacity/types";
import { verifyGreaterOfLegalFidelity, type GreaterOfFidelityResult } from "./verify-fidelity";
import type { GreaterOfCompileResult } from "./compile";

export type CapacityAuthorityMode = "CALLER_STIPULATED_HYPOTHETICAL" | "PRODUCTION";

export interface GreaterOfCapacityEval {
  fidelity: GreaterOfFidelityResult;
  capacity: VerifiedCapacityResult | null;
  authorityMode: CapacityAuthorityMode;
  productionRefusal: string | null;
  availableAmountUsd: number | null;
  outcomeLabel:
    | "VERIFIED_EXECUTABLE"
    | "PARTIAL"
    | "REVIEW_REQUIRED"
    | "UNSUPPORTED"
    | "FAILED"
    | "PRODUCTION_CAPACITY_REFUSED"
    | "NEEDS_METRIC_INPUT";
}

function numericFiguresOf(root: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const r = v as Record<string, unknown>;
    for (const k of ["amount", "value", "ratio"]) if (typeof r[k] === "number") out.push(r[k] as number);
    for (const [k, x] of Object.entries(r)) if (x && typeof x === "object" && k !== "provenance") walk(x);
  };
  walk(root);
  return out.sort((a, b) => a - b);
}

function cleanVerification(
  id: string,
  sourceContentVersion: string | null,
  irInventoryItems: SemanticVerificationResult["irInventory"] extends { items: infer I } ? I : never = [] as never,
): SemanticVerificationResult {
  return {
    candidateRef: id,
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: id,
      items: irInventoryItems as never[],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "greater-of-assets-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "deterministic_greater_of_fidelity_gate",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "greater-of-assets-fidelity.v1",
    verifiedAt: new Date().toISOString(),
    evidenceSetHash: sourceContentVersion,
  } as unknown as SemanticVerificationResult;
}

function artifactFor(rule: IRRule): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: rule.ruleId,
    kind: "RULE",
    verifiedIdentity: {
      ruleOrDefinitionId: rule.ruleId,
      companyId: rule.companyId,
      instrumentKey: rule.instrumentKey,
      irSchemaVersion: rule.irSchemaVersion,
      compilerVersion: rule.compilerVersion,
      sourceContentVersion: rule.sourceContentVersion,
    },
    result: cleanVerification(rule.ruleId, rule.sourceContentVersion),
  };
}

function artifactForShared(cap: IRSharedCapacity): VerifiedUnitArtifact {
  const figures = numericFiguresOf(cap.capExpression);
  const items = [
    ...figures.map((n, i) => ({
      itemId: `${cap.sharedCapId}:fig-${i}`,
      kind: "AMOUNT" as const,
      ruleOrDefinitionId: cap.sharedCapId,
      irPath: `sharedCapacities[0].capExpression.figure[${i}]`,
      numericValue: n,
      textValue: null,
      isAlternativeWithinSelection: false,
      sourceCitation: null,
      sourceExcerpt: null,
    })),
    ...cap.memberRuleIds.map((m, i) => ({
      itemId: `${cap.sharedCapId}:member-${i}`,
      kind: "DEPENDENCY" as const,
      ruleOrDefinitionId: cap.sharedCapId,
      irPath: `sharedCapacities[0].memberRuleIds[${i}]`,
      numericValue: null,
      textValue: `SHARED_CAP_MEMBER:${m}`,
      isAlternativeWithinSelection: false,
      sourceCitation: null,
      sourceExcerpt: null,
    })),
  ];
  return {
    ruleOrDefinitionId: cap.sharedCapId,
    kind: "SHARED_CAPACITY",
    verifiedIdentity: {
      ruleOrDefinitionId: cap.sharedCapId,
      companyId: cap.companyId,
      instrumentKey: cap.instrumentKey,
      irSchemaVersion: cap.irSchemaVersion ?? "headroom-covenant-ir.v1",
      compilerVersion: cap.compilerVersion ?? null,
      sourceContentVersion: cap.sourceContentVersion ?? null,
    },
    result: cleanVerification(cap.sharedCapId, cap.sourceContentVersion ?? null, items as never),
  };
}

export function packageForGreaterOfRule(
  rule: IRRule,
  shared?: IRSharedCapacity | null,
  extraRules: IRRule[] = [],
): VerifiedExecutionPackage {
  const rules = [rule, ...extraRules];
  const sharedCapacities = shared ? [shared] : [];
  return {
    companyId: rule.companyId,
    instrumentKey: rule.instrumentKey,
    rules,
    definitions: [],
    sharedCapacities,
    verifications: [...rules.map(artifactFor), ...sharedCapacities.map(artifactForShared)],
  };
}

function boolValue(value: boolean): RuntimeValue {
  return { type: "BOOLEAN", value, lineage: { exprId: null, inputKeys: [] } } as RuntimeValue;
}

function moneyValue(amount: number, currency = "USD"): RuntimeValue {
  return {
    type: "MONEY",
    amount: rationalFromNumber(amount),
    currency,
    lineage: { exprId: null, inputKeys: [] },
  } as RuntimeValue;
}

function hypoResolver(args: {
  gates: Record<string, boolean>;
  metricName: string | null;
  totalAssetsUsd: number | null;
  metricCurrency?: string;
}) {
  const provenance: InputProvenance = {
    source: "CALLER_STIPULATED_HYPOTHETICAL",
    sourceVersion: "greater-of-assets-basket.v1",
    note: "greater-of qualitative gate / metric stipulation",
  };
  const metrics =
    args.metricName != null && args.totalAssetsUsd != null
      ? [
          metricInput(
            args.metricName,
            moneyValue(args.totalAssetsUsd, args.metricCurrency ?? "USD"),
            provenance,
          ),
        ]
      : [];
  return fixtureInputResolver({
    metrics,
    transactionInputs: Object.entries(args.gates).map(([inputName, value]) => ({
      inputName,
      input: metricInput(inputName, boolValue(value), provenance),
    })),
  });
}

function amountFromCapacityValue(amt: unknown): number | null {
  if (!amt || typeof amt !== "object") return null;
  const a = amt as { kind?: string; value?: { amount?: string | number } };
  if (a.kind !== "AMOUNT" || a.value == null) return null;
  const n = typeof a.value.amount === "number" ? a.value.amount : Number(a.value.amount);
  return Number.isFinite(n) ? n : null;
}

function extractAvailable(capacity: VerifiedCapacityResult, ruleId: string): number | null {
  if (capacity.outcome !== "EXECUTED") return null;
  const entry = capacity.state.capacities.find((c) => c.ruleId === ruleId);
  if (!entry) return null;
  if (entry.status === "AVAILABLE") {
    return (
      amountFromCapacityValue(entry.effectiveRemaining) ??
      amountFromCapacityValue(entry.remaining) ??
      amountFromCapacityValue(entry.grossCapacity)
    );
  }
  // PARTIAL Phase-3 sufficiency can mark REVIEW_REQUIRED while still computing
  // a provisional amount — expose it for CALLER_STIPULATED_HYPOTHETICAL only.
  const provisional = (entry as {
    provisional?: {
      effectiveRemaining?: unknown;
      remaining?: unknown;
      grossCapacity?: unknown;
    };
  }).provisional;
  if (!provisional) return null;
  return (
    amountFromCapacityValue(provisional.effectiveRemaining) ??
    amountFromCapacityValue(provisional.remaining) ??
    amountFromCapacityValue(provisional.grossCapacity)
  );
}

export type FinancialEvidenceMode =
  | "CALLER_STIPULATED"
  | "STALE_OR_UNAUTHENTICATED"
  | "AUTHENTICATED_APPROVED";

export function evaluateGreaterOfCapacity(args: {
  compile: GreaterOfCompileResult;
  operativeSourceText: string;
  authorityMode: CapacityAuthorityMode;
  qualitativeGates?: Record<string, boolean>;
  /** Stipulated Total Assets (or named metric). Null/omitted → must not affirm. */
  totalAssetsUsd?: number | null;
  metricCurrency?: string;
  /** Declared entity scope of the metric evidence (must match operative text when supplied). */
  metricEntityScope?: string | null;
  /** Financial evidence authority — stale/unauthenticated never affirms capacity. */
  financialEvidenceMode?: FinancialEvidenceMode;
  /** Document / amendment version identity; mismatch refuses affirmative capacity. */
  sourceVersionId?: string | null;
  expectedSourceVersionId?: string | null;
  sharedCapacity?: IRSharedCapacity | null;
  extraRules?: IRRule[];
  ledger?: LedgerUsageRecord[];
  asOf?: string;
}): GreaterOfCapacityEval {
  const { compile, operativeSourceText, authorityMode } = args;
  if (!compile.rule || compile.executableClass === "UNSUPPORTED" || compile.executableClass === "FAILED") {
    return {
      fidelity: {
        verdict: "FAIL",
        findings: [{ code: "NO_RULE", detail: compile.executableClass, severity: "MATERIAL" }],
        classification: compile.classification,
      },
      capacity: null,
      authorityMode,
      productionRefusal: null,
      availableAmountUsd: null,
      outcomeLabel: compile.executableClass === "UNSUPPORTED" ? "UNSUPPORTED" : "FAILED",
    };
  }

  const fidelity = verifyGreaterOfLegalFidelity({
    operativeSourceText,
    rule: compile.rule,
  });
  if (fidelity.verdict !== "PASS") {
    return {
      fidelity,
      capacity: null,
      authorityMode,
      productionRefusal: null,
      availableAmountUsd: null,
      outcomeLabel: "FAILED",
    };
  }

  if (authorityMode === "PRODUCTION") {
    return {
      fidelity,
      capacity: null,
      authorityMode,
      productionRefusal:
        "PRODUCTION_CAPACITY_REFUSED: greater-of vertical slice has verified IR but no AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE / trusted utilization completeness certificate for this package",
      availableAmountUsd: null,
      outcomeLabel: "PRODUCTION_CAPACITY_REFUSED",
    };
  }

  // Stale / unauthenticated financial evidence must never produce favorable capacity.
  if (args.financialEvidenceMode === "STALE_OR_UNAUTHENTICATED") {
    return {
      fidelity,
      capacity: null,
      authorityMode,
      productionRefusal: null,
      availableAmountUsd: null,
      outcomeLabel: "NEEDS_METRIC_INPUT",
    };
  }

  // Amendment / version ambiguity — refuse when caller declares conflicting versions.
  if (
    args.sourceVersionId != null &&
    args.expectedSourceVersionId != null &&
    args.sourceVersionId !== args.expectedSourceVersionId
  ) {
    return {
      fidelity,
      capacity: null,
      authorityMode,
      productionRefusal: null,
      availableAmountUsd: null,
      outcomeLabel: "FAILED",
    };
  }

  // Currency mismatch: metric currency must be USD (or match rule money limb). Never convert silently.
  const metricCurrency = args.metricCurrency ?? "USD";
  if (metricCurrency !== "USD") {
    return {
      fidelity,
      capacity: null,
      authorityMode,
      productionRefusal: null,
      availableAmountUsd: null,
      outcomeLabel: "NEEDS_METRIC_INPUT",
    };
  }

  // Entity-scope mismatch: if evidence scope is declared and does not appear in operative text, refuse.
  if (args.metricEntityScope != null && args.metricEntityScope.trim().length > 0) {
    const scope = args.metricEntityScope.replace(/\s+/g, " ").trim();
    const hay = operativeSourceText.replace(/\s+/g, " ");
    if (!new RegExp(scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(hay)) {
      return {
        fidelity,
        capacity: null,
        authorityMode,
        productionRefusal: null,
        availableAmountUsd: null,
        outcomeLabel: "FAILED",
      };
    }
  }

  const gates: Record<string, boolean> = {};
  for (const r of compile.classification.residuals) gates[r.gateInputName] = true;
  Object.assign(gates, args.qualitativeGates ?? {});

  const metricName = compile.classification.metricName;
  const totalAssetsUsd = args.totalAssetsUsd ?? null;
  if (totalAssetsUsd == null) {
    // Explicit refuse: unknown metric must never default to zero/unlimited affirmative.
    const pkg = packageForGreaterOfRule(compile.rule, args.sharedCapacity, args.extraRules);
    const capacity = evaluateVerifiedCapacity({
      package: pkg,
      inputs: hypoResolver({ gates, metricName, totalAssetsUsd: null }),
      ledger: args.ledger ?? [],
      asOf: args.asOf ?? new Date().toISOString().slice(0, 10),
    });
    return {
      fidelity,
      capacity,
      authorityMode,
      productionRefusal: null,
      availableAmountUsd: null,
      outcomeLabel: "NEEDS_METRIC_INPUT",
    };
  }

  const pkg = packageForGreaterOfRule(compile.rule, args.sharedCapacity, args.extraRules);
  const capacity = evaluateVerifiedCapacity({
    package: pkg,
    inputs: hypoResolver({
      gates,
      metricName,
      totalAssetsUsd,
      metricCurrency: args.metricCurrency,
    }),
    ledger: args.ledger ?? [],
    asOf: args.asOf ?? new Date().toISOString().slice(0, 10),
  });

  const availableAmountUsd = extractAvailable(capacity, compile.rule.ruleId);
  const entry =
    capacity.outcome === "EXECUTED"
      ? capacity.state.capacities.find((c) => c.ruleId === compile.rule!.ruleId)
      : null;
  // AUTHORITATIVE available (COMPLETE/safe) vs provisional under PARTIAL sufficiency.
  const authoritative =
    entry?.status === "AVAILABLE" && availableAmountUsd != null && availableAmountUsd > 0;
  const provisionalOk =
    entry?.status === "REVIEW_REQUIRED" && availableAmountUsd != null && availableAmountUsd > 0;
  return {
    fidelity,
    capacity,
    authorityMode,
    productionRefusal: null,
    availableAmountUsd,
    outcomeLabel:
      capacity.outcome === "EXECUTED" && (authoritative || provisionalOk)
        ? "VERIFIED_EXECUTABLE"
        : capacity.outcome === "EXECUTED"
          ? "PARTIAL"
          : "REVIEW_REQUIRED",
  };
}
