/**
 * Capacity / simulation boundary for fixed-dollar basket vertical slice.
 *
 * Distinguishes:
 * - CALLER_STIPULATED_HYPOTHETICAL: residual qualitative gates supplied by caller
 * - PRODUCTION: refuses without authenticated financial/utilization evidence
 */
import type { IRRule } from "../../ir/types";
import {
  evaluateVerifiedCapacity,
  type VerifiedCapacityResult,
  type VerifiedExecutionPackage,
  type VerifiedUnitArtifact,
} from "../../verified-execution";
import type { SemanticVerificationResult } from "../semantic-verification/types";
import { fixtureInputResolver, metricInput } from "../../runtime/input-resolver";
import type { InputProvenance, RuntimeValue } from "../../runtime/types";
import { verifyFixedDollarLegalFidelity, type FixedDollarFidelityResult } from "./verify-fidelity";
import type { FixedDollarCompileResult } from "./compile";

export type CapacityAuthorityMode = "CALLER_STIPULATED_HYPOTHETICAL" | "PRODUCTION";

export interface FixedDollarCapacityEval {
  fidelity: FixedDollarFidelityResult;
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
    | "PRODUCTION_CAPACITY_REFUSED";
}

function cleanVerification(rule: IRRule): SemanticVerificationResult {
  return {
    candidateRef: rule.ruleId,
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "deterministic_fixed_dollar_fidelity_gate",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "fixed-dollar-fidelity.v1",
    verifiedAt: new Date().toISOString(),
    evidenceSetHash: rule.sourceContentVersion,
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
    result: cleanVerification(rule),
  };
}

/** Build a REQUIRE package for one verified fixed-dollar rule. */
export function packageForFixedDollarRule(rule: IRRule): VerifiedExecutionPackage {
  return {
    companyId: rule.companyId,
    instrumentKey: rule.instrumentKey,
    rules: [rule],
    definitions: [],
    sharedCapacities: [],
    verifications: [artifactFor(rule)],
  };
}

function boolValue(value: boolean): RuntimeValue {
  return { type: "BOOLEAN", value, lineage: { exprId: null, inputKeys: [] } } as RuntimeValue;
}

function gatesResolver(gates: Record<string, boolean>) {
  const provenance: InputProvenance = {
    source: "CALLER_STIPULATED_HYPOTHETICAL",
    sourceVersion: "fixed-dollar-basket.v1",
    note: "fixed-dollar qualitative gate stipulation",
  };
  return fixtureInputResolver({
    transactionInputs: Object.entries(gates).map(([inputName, value]) => ({
      inputName,
      input: metricInput(inputName, boolValue(value), provenance),
    })),
  });
}

export function evaluateFixedDollarCapacity(args: {
  compile: FixedDollarCompileResult;
  operativeSourceText: string;
  authorityMode: CapacityAuthorityMode;
  /** Gate stipulations for CALLER_STIPULATED_HYPOTHETICAL mode. */
  qualitativeGates?: Record<string, boolean>;
  asOf?: string;
}): FixedDollarCapacityEval {
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

  const fidelity = verifyFixedDollarLegalFidelity({
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
        "PRODUCTION_CAPACITY_REFUSED: fixed-dollar vertical slice has verified IR but no AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE / trusted utilization completeness certificate for this package",
      availableAmountUsd: null,
      outcomeLabel: "PRODUCTION_CAPACITY_REFUSED",
    };
  }

  const gates: Record<string, boolean> = {};
  for (const r of compile.classification.residuals) gates[r.gateInputName] = true;
  Object.assign(gates, args.qualitativeGates ?? {});

  const pkg = packageForFixedDollarRule(compile.rule);
  const capacity = evaluateVerifiedCapacity({
    package: pkg,
    inputs: gatesResolver(gates),
    ledger: [],
    asOf: args.asOf ?? new Date().toISOString().slice(0, 10),
  });

  let availableAmountUsd: number | null = null;
  if (capacity.outcome === "EXECUTED") {
    const entry = capacity.state.capacities.find((c) => c.ruleId === compile.rule!.ruleId);
    if (entry?.status === "AVAILABLE") {
      const amt = entry.effectiveRemaining ?? entry.remaining ?? entry.grossCapacity;
      if (amt && amt.kind === "AMOUNT") {
        const v = amt.value as { type?: string; amount?: string | number };
        const n = typeof v.amount === "number" ? v.amount : Number(v.amount);
        availableAmountUsd = Number.isFinite(n) ? n : null;
      }
    }
  }

  return {
    fidelity,
    capacity,
    authorityMode,
    productionRefusal: null,
    availableAmountUsd,
    outcomeLabel:
      capacity.outcome === "EXECUTED" && availableAmountUsd != null && availableAmountUsd > 0
        ? "VERIFIED_EXECUTABLE"
        : capacity.outcome === "EXECUTED"
          ? "PARTIAL"
          : "REVIEW_REQUIRED",
  };
}
