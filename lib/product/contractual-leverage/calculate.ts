/**
 * End-to-end contractual leverage calculation:
 * identify definitions → optional EBITDA build-up → compile IR → fulfill inputs → evaluate.
 *
 * Fail-closed: missing critical inputs or unsupported shapes never invent values.
 * Debt headroom is mathematical ratio room only — never verified available debt capacity.
 */

import {
  buildFinancialInformationRequest,
  evaluateExpression,
  evaluateLeverageOrCoverageRatio,
  fixtureInputResolver,
  metricInput,
  money,
  rational,
  rationalFromNumber,
  toApproximateNumber,
  type FinancialInformationRequest,
  type FinancialSnapshot,
  type InputProvenance,
} from "@/lib/contract-model/contractual-metric-execution";
import type { IRExpression } from "@/lib/contract-model/ir/types";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import { compileLeverageExpressions } from "./compile";
import {
  compileCoherentEbitdaBuildup,
  compileMatthewsEbitdaBuildup,
  type EbitdaBuildupCompileResult,
} from "./ebitda-buildup";
import { identifyLeverageComponents } from "./identify";
import type {
  ContractualLeverageResult,
  EbitdaComponentInputs,
  FinancialInformationRequestSummary,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
  ResolvedInputLine,
} from "./types";

function summarizeInformationRequest(info: FinancialInformationRequest): FinancialInformationRequestSummary {
  return {
    executable: info.executable,
    blockingKeys: info.blocking.map((b) => b.requestText ?? b.dependency.key),
    summary: info.summary,
  };
}

const INPUT_PROVENANCE: InputProvenance = {
  source: "verified-financial-snapshot",
  sourceVersion: "contractual-leverage.v1",
  selectionMethod: "EXACT_CALLER_SUPPLIED",
  identityStrength: "CONTRACT_NAME_ONLY",
  currency: "USD",
  note: "Caller-supplied verified covenant financial inputs ($M)",
};

const HEADROOM_NOT_CAPACITY =
  "Dollar figure is mathematical threshold×EBITDA − net debt only — not verified available debt capacity.";

function parseNumeric(serialized: { type: string; amount?: string; value?: string } | null): number | null {
  if (!serialized) return null;
  const raw = serialized.type === "MONEY" ? serialized.amount : serialized.value;
  if (raw == null) return null;
  try {
    if (raw.includes("/")) {
      const [num, den] = raw.split("/");
      if (!num || !den) return null;
      return toApproximateNumber(rational(BigInt(num), BigInt(den)));
    }
    return toApproximateNumber(rationalFromNumber(Number(raw)));
  } catch {
    return null;
  }
}

function emptyResult(req: LeverageCalculationRequest): ContractualLeverageResult {
  return {
    status: "MISSING_DEFINITIONS",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: null,
    formulaDisplay: null,
    citations: [],
    limitations: [],
    inputs: [],
    missingRequirements: [],
    currentRatio: null,
    threshold: req.threshold ?? null,
    ratioHeadroom: null,
    debtHeadroomMillions: null,
    debtHeadroomIsVerifiedCapacity: false,
    runtimeStatus: null,
    derivedEbitdaMillions: null,
    ebitdaBuildupKind: req.ebitdaBuildup ?? null,
    informationRequest: null,
  };
}

function buildInputLines(
  financials: LeverageFinancialInputs,
  debtBasis: "total" | "secured",
  netsCash: boolean,
  derivedEbitda: number | null,
): ResolvedInputLine[] {
  const ebitdaValue = derivedEbitda ?? financials.ebitda;
  const debtValue = debtBasis === "secured" ? financials.securedDebt : financials.totalDebt;
  const debtLabel = debtBasis === "secured" ? "Secured Debt" : "Total Debt";
  const lines: ResolvedInputLine[] = [
    {
      key: "EBITDA",
      label: derivedEbitda != null ? "Consolidated EBITDA (derived build-up)" : "Consolidated EBITDA (caller-supplied contractual)",
      valueMillions: ebitdaValue,
      required: true,
      status: ebitdaValue != null && ebitdaValue > 0 ? "RESOLVED" : "MISSING",
      fulfillmentState: ebitdaValue != null && ebitdaValue > 0 ? "APPROVED_VERIFIED" : "MISSING",
    },
    {
      key: debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      label: debtLabel,
      valueMillions: debtValue,
      required: true,
      status: debtValue != null ? "RESOLVED" : "MISSING",
      fulfillmentState: debtValue != null ? "APPROVED_VERIFIED" : "MISSING",
    },
  ];
  if (netsCash) {
    lines.push({
      key: "Cash",
      label: "Unrestricted cash & Cash Equivalents",
      valueMillions: financials.cash,
      required: true,
      status: financials.cash != null ? "RESOLVED" : "MISSING",
      fulfillmentState: financials.cash != null ? "APPROVED_VERIFIED" : "MISSING",
    });
  }
  return lines;
}

function moneyMetric(key: string, millions: number) {
  return metricInput(key, money(rationalFromNumber(millions), "USD", { exprId: null, inputKeys: [key] }), INPUT_PROVENANCE);
}

function compileBuildup(req: LeverageCalculationRequest, ebitdaTerm: { documentId: string; sectionRef: string; fullText: string }): EbitdaBuildupCompileResult | null {
  if (req.ebitdaBuildup === "COHERENT_CAPPED_ADDBACK") {
    return compileCoherentEbitdaBuildup({
      companyId: req.companyId,
      instrumentKey: req.instrumentKey,
      documentId: ebitdaTerm.documentId,
      sectionRef: ebitdaTerm.sectionRef,
      excerpt: ebitdaTerm.fullText,
    });
  }
  if (req.ebitdaBuildup === "MATTHEWS_UNCAPPED_SUM") {
    return compileMatthewsEbitdaBuildup({
      companyId: req.companyId,
      instrumentKey: req.instrumentKey,
      documentId: ebitdaTerm.documentId,
      sectionRef: ebitdaTerm.sectionRef,
      excerpt: ebitdaTerm.fullText,
    });
  }
  return null;
}

function missingComponents(keys: string[], components: EbitdaComponentInputs | null | undefined): string[] {
  const missing: string[] = [];
  for (const k of keys) {
    const v = components?.[k];
    if (v == null || !Number.isFinite(v)) missing.push(k);
  }
  return missing;
}

function evaluateDerivedEbitda(
  buildup: EbitdaBuildupCompileResult,
  components: EbitdaComponentInputs,
): { status: "EXECUTABLE"; millions: number; citations: string[] } | { status: "NEEDS_INPUT" | "ERROR"; missing: string[]; message: string } {
  const missing = missingComponents(buildup.requiredMetricKeys, components);
  if (missing.length > 0) {
    return { status: "NEEDS_INPUT", missing, message: `EBITDA build-up missing components: ${missing.join(", ")}` };
  }
  const metrics = buildup.requiredMetricKeys.map((k) => moneyMetric(k, components[k] as number));
  const resolver = fixtureInputResolver({ metrics, definitions: [buildup.definition] });
  const termRef: IRExpression = withExpressionId({
    kind: "DEFINED_TERM_REFERENCE",
    type: "MONEY",
    termName: "Consolidated EBITDA",
    companyId: buildup.definition.companyId,
    instrumentKey: buildup.definition.instrumentKey,
    resolvedDefinitionId: buildup.definition.definitionId,
  });
  const ev = evaluateExpression({ expression: termRef, inputs: resolver });
  if (ev.status !== "EXECUTABLE" || !ev.value) {
    return {
      status: ev.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : "ERROR",
      missing: ev.missingInputKeys ?? [],
      message: ev.diagnostics.map((d) => d.message).join("; ") || ev.status,
    };
  }
  const millions = parseNumeric(ev.value as { type: string; amount?: string });
  if (millions == null) {
    return { status: "ERROR", missing: [], message: "Derived EBITDA could not be parsed" };
  }
  return { status: "EXECUTABLE", millions, citations: [...buildup.citations, ...ev.provenance.sourceCitations] };
}

/**
 * Calculate one contractual leverage ratio from definition texts + verified financial inputs.
 * Pure — no I/O, no company branches.
 */
export function calculateContractualLeverage(req: LeverageCalculationRequest): ContractualLeverageResult {
  const base = emptyResult(req);

  const identified = identifyLeverageComponents({
    definitions: req.definitions,
    leverageTermCandidates: req.leverageTermCandidates,
    ebitdaTermCandidates: req.ebitdaTermCandidates,
    debtBasisHint: req.debtBasisHint,
  });

  if ("error" in identified) {
    return {
      ...base,
      status: identified.error,
      missingRequirements: identified.missing,
      limitations: identified.limitations,
    };
  }

  let derivedEbitda: number | null = null;
  const limitations = [...identified.limitations];
  const citations = [...identified.citations];

  const buildup = compileBuildup(req, identified.ebitdaTerm);
  if (buildup) {
    limitations.push(...buildup.limitations);
    const derived = evaluateDerivedEbitda(buildup, req.ebitdaComponents ?? {});
    if (derived.status !== "EXECUTABLE") {
      const componentLines: ResolvedInputLine[] = buildup.requiredMetricKeys.map((k) => {
        const v = req.ebitdaComponents?.[k];
        const ok = v != null && Number.isFinite(v);
        return {
          key: k,
          label: k,
          valueMillions: ok ? (v as number) : null,
          required: true,
          status: ok ? "RESOLVED" : "MISSING",
          fulfillmentState: ok ? "APPROVED_VERIFIED" : "MISSING",
        };
      });
      return {
        ...base,
        status: "MISSING_INPUTS",
        debtBasis: identified.debtBasis,
        formulaDisplay: `${buildup.formulaDisplay} → ${identified.formulaDisplay}`,
        citations: [...citations, ...buildup.citations],
        limitations,
        inputs: componentLines,
        missingRequirements: derived.status === "NEEDS_INPUT" ? derived.missing : [derived.message],
        ebitdaBuildupKind: buildup.kind,
      };
    }
    derivedEbitda = derived.millions;
    citations.push(...derived.citations);
  }

  const effectiveFinancials: LeverageFinancialInputs = {
    ...req.financials,
    ebitda: derivedEbitda ?? req.financials.ebitda,
  };

  const inputs = buildInputLines(effectiveFinancials, identified.debtBasis, identified.netsCash, derivedEbitda);
  const missing = inputs.filter((i) => i.status === "MISSING").map((i) => i.label);
  if (missing.length > 0) {
    return {
      ...base,
      status: "MISSING_INPUTS",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations,
      limitations,
      inputs,
      missingRequirements: missing,
      derivedEbitdaMillions: derivedEbitda,
      ebitdaBuildupKind: buildup?.kind ?? null,
    };
  }

  // Non-positive EBITDA: leverage boundary refusal (also enforced in evaluateLeverageOrCoverageRatio).
  if (effectiveFinancials.ebitda! <= 0) {
    return {
      ...base,
      status: "EVALUATION_ERROR",
      debtBasis: identified.debtBasis,
      formulaDisplay: identified.formulaDisplay,
      citations,
      limitations: [...limitations, "LEVERAGE ratio refused: non-positive EBITDA denominator."],
      inputs,
      missingRequirements: ["Positive Consolidated EBITDA (covenant)"],
      runtimeStatus: "ERROR",
      derivedEbitdaMillions: derivedEbitda,
      ebitdaBuildupKind: buildup?.kind ?? null,
    };
  }

  if (!buildup && req.financials.ebitda != null) {
    limitations.push(
      "EBITDA is caller-supplied contractual figure — not independently derived from a compiled definition build-up.",
    );
  }

  const compiled = compileLeverageExpressions({
    components: identified,
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    threshold: req.threshold,
  });

  const metrics = [
    moneyMetric("EBITDA", effectiveFinancials.ebitda!),
    moneyMetric(
      identified.debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      (identified.debtBasis === "secured" ? effectiveFinancials.securedDebt : effectiveFinancials.totalDebt)!,
    ),
  ];
  if (identified.netsCash) {
    metrics.push(moneyMetric("Cash", effectiveFinancials.cash!));
  }

  const resolver = fixtureInputResolver({ metrics });
  const ratioEval = evaluateLeverageOrCoverageRatio({
    expression: compiled.ratioExpression,
    inputs: resolver,
    context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
    ratioKind: "LEVERAGE",
  });

  if (ratioEval.status !== "EXECUTABLE" || !ratioEval.value) {
    const needs = ratioEval.missingInputKeys ?? [];
    const denomRefuse = ratioEval.diagnostics.some((d) => d.code === "NON_POSITIVE_DENOMINATOR");
    return {
      ...base,
      status: needs.length > 0 ? "MISSING_INPUTS" : "EVALUATION_ERROR",
      debtBasis: identified.debtBasis,
      formulaDisplay: compiled.formulaDisplay,
      citations: [...citations, ...ratioEval.provenance.sourceCitations],
      limitations: denomRefuse
        ? [...limitations, ...ratioEval.diagnostics.filter((d) => d.code === "NON_POSITIVE_DENOMINATOR").map((d) => d.message)]
        : limitations,
      inputs,
      missingRequirements: needs.length > 0 ? needs : ratioEval.diagnostics.map((d) => d.message),
      runtimeStatus: ratioEval.status,
      derivedEbitdaMillions: derivedEbitda,
      ebitdaBuildupKind: buildup?.kind ?? null,
    };
  }

  const currentRatio = parseNumeric(ratioEval.value as { type: string; value?: string });
  let debtHeadroomMillions: number | null = null;
  let ratioHeadroom: number | null = null;

  if (req.threshold != null && currentRatio != null) {
    ratioHeadroom = req.threshold - currentRatio;
  }

  if (compiled.debtHeadroomExpression) {
    const headEval = evaluateExpression({
      expression: compiled.debtHeadroomExpression,
      inputs: resolver,
      context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
    });
    if (headEval.status === "EXECUTABLE" && headEval.value) {
      debtHeadroomMillions = parseNumeric(headEval.value as { type: string; amount?: string });
      limitations.push(HEADROOM_NOT_CAPACITY);
    } else {
      limitations.push(
        `Mathematical debt-room expression not computed (${headEval.status}${headEval.diagnostics[0] ? `: ${headEval.diagnostics[0].message}` : ""}).`,
      );
    }
  } else if (req.threshold == null) {
    limitations.push("No ratio threshold supplied — mathematical debt-room not computed.");
  }

  const allCitations = [...new Set([...citations, ...ratioEval.provenance.sourceCitations])];

  return {
    status: "COMPUTED",
    name: req.name,
    sectionRef: req.sectionRef,
    documentName: req.documentName ?? null,
    debtBasis: identified.debtBasis,
    formulaDisplay: buildup ? `${buildup.formulaDisplay} → ${compiled.formulaDisplay}` : compiled.formulaDisplay,
    citations: allCitations,
    limitations,
    inputs,
    missingRequirements: [],
    currentRatio,
    threshold: req.threshold ?? null,
    ratioHeadroom,
    debtHeadroomMillions,
    debtHeadroomIsVerifiedCapacity: false,
    runtimeStatus: ratioEval.status,
    derivedEbitdaMillions: derivedEbitda,
    ebitdaBuildupKind: buildup?.kind ?? null,
    informationRequest: null,
  };
}

/** Recalculate a prior request against edited financial inputs (dashboard live reflow). */
export function recalculateWithFinancials(
  req: LeverageCalculationRequest,
  financials: LeverageFinancialInputs,
): ContractualLeverageResult {
  return calculateContractualLeverage({ ...req, financials });
}

/**
 * Same calculation joined to APPROVED snapshots via the fulfillment API.
 * Blocks execution when any REQUIRED leaf is not APPROVED_VERIFIED.
 */
export function calculateContractualLeverageWithSnapshots(args: {
  request: LeverageCalculationRequest;
  snapshots: readonly FinancialSnapshot[];
  staleBeforeIsoDate?: string | null;
}): ContractualLeverageResult {
  const req = args.request;
  const identified = identifyLeverageComponents({
    definitions: req.definitions,
    leverageTermCandidates: req.leverageTermCandidates,
    ebitdaTermCandidates: req.ebitdaTermCandidates,
    debtBasisHint: req.debtBasisHint,
  });
  if ("error" in identified) {
    return {
      ...emptyResult(req),
      status: identified.error,
      missingRequirements: identified.missing,
      limitations: identified.limitations,
    };
  }

  const buildup = compileBuildup(req, identified.ebitdaTerm);
  const compiled = compileLeverageExpressions({
    components: identified,
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    threshold: req.threshold,
  });

  // Join on the ratio expression (debt/cash/EBITDA leaves). Build-up components are
  // requested separately when present.
  const info = buildFinancialInformationRequest({
    expression: compiled.ratioExpression,
    snapshots: args.snapshots,
    definitions: buildup ? [buildup.definition] : undefined,
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    asOf: args.staleBeforeIsoDate ?? null,
    policy: { staleBeforeIsoDate: args.staleBeforeIsoDate ?? null },
  });

  if (!info.executable) {
    const inputs: ResolvedInputLine[] = info.items
      .filter((i) => i.dependency.inputKind === "METRIC" || i.dependency.inputKind === "TERM_VALUE")
      .map((i) => ({
        key: i.dependency.key,
        label: i.dependency.displayNameFromContract,
        valueMillions:
          i.resolution?.state === "RESOLVED" && i.resolution.input?.value.type === "MONEY"
            ? toApproximateNumber(i.resolution.input.value.amount)
            : null,
        required: i.dependency.status === "REQUIRED",
        status: i.fulfillmentState === "APPROVED_VERIFIED" ? "RESOLVED" : "MISSING",
        fulfillmentState: i.fulfillmentState,
      }));
    return {
      ...emptyResult(req),
      status: "MISSING_INPUTS",
      debtBasis: identified.debtBasis,
      formulaDisplay: compiled.formulaDisplay,
      citations: identified.citations,
      limitations: identified.limitations,
      inputs,
      missingRequirements: info.blocking.map((b) => b.requestText ?? b.dependency.key),
      informationRequest: summarizeInformationRequest(info),
      ebitdaBuildupKind: buildup?.kind ?? null,
    };
  }

  // Snapshots are complete for ratio leaves — still run the pure path with caller financials /
  // components (snapshot values must be projected by the caller into LeverageFinancialInputs).
  const computed = calculateContractualLeverage(req);
  return { ...computed, informationRequest: summarizeInformationRequest(info) };
}
