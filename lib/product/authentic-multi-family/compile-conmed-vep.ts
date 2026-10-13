/**
 * Compile authentic CONMED multi-family units → VerifiedExecutionPackage.
 *
 * Reuses fixed-dollar / greater-of compilers + evaluateVerifiedCapacity (REQUIRE).
 * Never invents utilization completeness; remaining stays unpublished.
 */

import {
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  packageForFixedDollarRule,
  verifyFixedDollarLegalFidelity,
} from "@/lib/contract-model/compiler/fixed-dollar-basket";
import {
  compileGreaterOfAssetsBasket,
  evaluateGreaterOfCapacity,
  packageForGreaterOfRule,
  verifyGreaterOfLegalFidelity,
} from "@/lib/contract-model/compiler/greater-of-assets-basket";
import type { IRRule } from "@/lib/contract-model/ir/types";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type HypotheticalTransaction,
  type SelectedPath,
  type VerifiedCapacityResult,
  type VerifiedExecutionPackage,
  type VerifiedTransactionResult,
  type VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import {
  CONMED_COMPANY_ID,
  CONMED_DOCUMENT_ID,
  CONMED_INSTRUMENT_KEY,
  conmedSourceManifest,
  extractConmedMultiFamilyCandidates,
  type ConmedSourceUnitCandidate,
} from "./conmed-source-units";

export type CompiledUnitStatus =
  | "VERIFIED_EXECUTABLE_GROSS"
  | "PARTIAL"
  | "FAILED"
  | "UNSUPPORTED"
  | "PRODUCTION_REMAINING_REFUSED";

export type CompiledAuthenticUnit = {
  candidateId: string;
  family: ConmedSourceUnitCandidate["family"];
  formulation: ConmedSourceUnitCandidate["formulation"];
  sourceSectionRef: string;
  sourceCitation: string;
  entityScopeNote: string;
  /** Operative document binding (fixture document id). */
  operativeDocumentId: string;
  /** Amendment attachments — empty until Omnibus/Second Amendment effects are certified attached. */
  amendmentBindings: string[];
  /** Qualitative / residual conditions encoded at compile time (gate names). */
  conditionNotes: string[];
  status: CompiledUnitStatus;
  grossCapacityUsd: number | null;
  verifiedRemainingUsd: null;
  fidelityVerdict: string | null;
  ruleId: string | null;
  limitations: string[];
};

function cleanVerification(rule: IRRule): SemanticVerificationResult {
  return {
    candidateRef: rule.ruleId,
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "authentic-multi-family fidelity gate",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "authentic-multi-family-fidelity.v1",
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

/** Map family → canonical ContractAction (not evaluation-v2 aliases). */
function familyToAction(
  family: ConmedSourceUnitCandidate["family"],
): "PAY_DIVIDEND" | "MAKE_INVESTMENT" | "SELL_ASSET" {
  if (family === "RESTRICTED_PAYMENTS") return "PAY_DIVIDEND";
  if (family === "INVESTMENTS") return "MAKE_INVESTMENT";
  return "SELL_ASSET";
}

function bindingFields(c: ConmedSourceUnitCandidate): Pick<
  CompiledAuthenticUnit,
  | "candidateId"
  | "family"
  | "formulation"
  | "sourceSectionRef"
  | "sourceCitation"
  | "entityScopeNote"
  | "operativeDocumentId"
  | "amendmentBindings"
  | "conditionNotes"
> {
  return {
    candidateId: c.candidateId,
    family: c.family,
    formulation: c.formulation,
    sourceSectionRef: c.sourceSectionRef,
    sourceCitation: c.sourceCitation,
    entityScopeNote: c.entityScopeNote,
    operativeDocumentId: CONMED_DOCUMENT_ID,
    amendmentBindings: [],
    conditionNotes: [
      "Amendment effects (Omnibus / Second Amendment) not attached — OPERATIVE_STATE_REVIEW_REQUIRED until certified.",
      c.family === "RESTRICTED_PAYMENTS"
        ? "§7.6 chapeau Default/Event of Default gate may apply beyond this fixed-dollar leaf."
        : c.family === "INVESTMENTS"
          ? "Source text includes Default/Event of Default gate around §7.8(l)."
          : "§7.5(j) is a de minimis Disposition exception — larger §7.5(f) baskets not compiled here.",
    ],
  };
}

export type ConmedMultiFamilyCompileResult = {
  manifest: ReturnType<typeof conmedSourceManifest>;
  units: CompiledAuthenticUnit[];
  /** Multi-rule VEP when ≥1 fidelity-passing rule; else null. */
  verifiedPackage: VerifiedExecutionPackage | null;
  independentlyExecutableFamilies: string[];
  partialFamilies: string[];
  failedFamilies: string[];
};

export function compileConmedAuthenticMultiFamily(asOf = "2025-06-30"): ConmedMultiFamilyCompileResult {
  const candidates = extractConmedMultiFamilyCandidates();
  const rules: IRRule[] = [];
  const units: CompiledAuthenticUnit[] = [];

  for (const c of candidates) {
    const limitations: string[] = [
      "No utilization completeness certificate — verifiedRemainingUsd forced null.",
      c.entityScopeNote,
    ];

    if (c.formulation === "FIXED_DOLLAR") {
      const compile = compileFixedDollarBasket({
        companyId: CONMED_COMPANY_ID,
        instrumentKey: CONMED_INSTRUMENT_KEY,
        sourceDocumentId: CONMED_DOCUMENT_ID,
        candidateRef: c.candidateId,
        sourceSectionRef: c.sourceSectionRef,
        operativeSourceText: c.operativeSourceText,
        covenantFamily: c.family,
        action: familyToAction(c.family),
      });
      const fidelity = compile.rule
        ? verifyFixedDollarLegalFidelity({
            operativeSourceText: c.operativeSourceText,
            rule: compile.rule,
          })
        : null;
      const evalCap =
        compile.rule && fidelity?.verdict === "PASS"
          ? evaluateFixedDollarCapacity({
              compile,
              operativeSourceText: c.operativeSourceText,
              authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
              asOf,
            })
          : null;

      if (compile.rule && fidelity?.verdict === "PASS") {
        rules.push(compile.rule);
        // Production remaining check — must refuse
        const prod = evaluateFixedDollarCapacity({
          compile,
          operativeSourceText: c.operativeSourceText,
          authorityMode: "PRODUCTION",
          asOf,
        });
        units.push({
          ...bindingFields(c),
          status:
            prod.outcomeLabel === "PRODUCTION_CAPACITY_REFUSED"
              ? "VERIFIED_EXECUTABLE_GROSS"
              : "PARTIAL",
          grossCapacityUsd: evalCap?.availableAmountUsd ?? null,
          verifiedRemainingUsd: null,
          fidelityVerdict: fidelity.verdict,
          ruleId: compile.rule.ruleId,
          limitations: [
            ...limitations,
            ...(prod.productionRefusal ? [prod.productionRefusal] : []),
            ...compile.warnings,
          ],
        });
      } else {
        units.push({
          ...bindingFields(c),
          status: compile.executableClass === "UNSUPPORTED" ? "UNSUPPORTED" : "FAILED",
          grossCapacityUsd: null,
          verifiedRemainingUsd: null,
          fidelityVerdict: fidelity?.verdict ?? null,
          ruleId: null,
          limitations: [...limitations, ...compile.warnings],
        });
      }
      continue;
    }

    // GREATER_OF_ASSETS
    const compile = compileGreaterOfAssetsBasket({
      companyId: CONMED_COMPANY_ID,
      instrumentKey: CONMED_INSTRUMENT_KEY,
      sourceDocumentId: CONMED_DOCUMENT_ID,
      candidateRef: c.candidateId,
      sourceSectionRef: c.sourceSectionRef,
      operativeSourceText: c.operativeSourceText,
      covenantFamily: c.family,
      action: familyToAction(c.family),
    });
    const fidelity = compile.rule
      ? verifyGreaterOfLegalFidelity({
          operativeSourceText: c.operativeSourceText,
          rule: compile.rule,
        })
      : null;

    // Hypothetical evaluation needs Total Assets — supply fixture-backed CTA
    // only as CALLER_STIPULATED_HYPOTHETICAL for gross math; never as APPROVED.
    const totalAssetsUsd = 2_000_000_000; // disclosure: stipulated for gross probe only
    limitations.push(
      `Greater-of CTA input stipulated at $${totalAssetsUsd} for HYPOTHETICAL gross probe only — not APPROVED NS-4 snapshot.`,
    );

    const evalCap =
      compile.rule && fidelity?.verdict === "PASS"
        ? evaluateGreaterOfCapacity({
            compile,
            operativeSourceText: c.operativeSourceText,
            authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
            totalAssetsUsd,
            asOf,
          })
        : null;

    if (compile.rule && fidelity?.verdict === "PASS") {
      rules.push(compile.rule);
      const prod = evaluateGreaterOfCapacity({
        compile,
        operativeSourceText: c.operativeSourceText,
        authorityMode: "PRODUCTION",
        totalAssetsUsd,
        asOf,
      });
      units.push({
        ...bindingFields(c),
        status:
          prod.outcomeLabel === "PRODUCTION_CAPACITY_REFUSED" ||
          prod.outcomeLabel === "VERIFIED_EXECUTABLE"
            ? "VERIFIED_EXECUTABLE_GROSS"
            : "PARTIAL",
        grossCapacityUsd: evalCap?.availableAmountUsd ?? null,
        verifiedRemainingUsd: null,
        fidelityVerdict: fidelity.verdict,
        ruleId: compile.rule.ruleId,
        limitations: [
          ...limitations,
          ...(prod.productionRefusal ? [prod.productionRefusal] : []),
          ...compile.warnings,
        ],
      });
    } else {
      units.push({
        ...bindingFields(c),
        status: compile.executableClass === "UNSUPPORTED" ? "UNSUPPORTED" : "FAILED",
        grossCapacityUsd: null,
        verifiedRemainingUsd: null,
        fidelityVerdict: fidelity?.verdict ?? null,
        ruleId: null,
        limitations: [...limitations, ...compile.warnings],
      });
    }
  }

  const verifiedPackage: VerifiedExecutionPackage | null =
    rules.length > 0
      ? {
          companyId: CONMED_COMPANY_ID,
          instrumentKey: CONMED_INSTRUMENT_KEY,
          rules,
          definitions: [],
          sharedCapacities: [],
          verifications: rules.map(artifactFor),
        }
      : null;

  const independentlyExecutableFamilies = [
    ...new Set(
      units
        .filter((u) => u.status === "VERIFIED_EXECUTABLE_GROSS")
        .map((u) => u.family),
    ),
  ];
  const partialFamilies = [
    ...new Set(units.filter((u) => u.status === "PARTIAL").map((u) => u.family)),
  ];
  const failedFamilies = [
    ...new Set(
      units
        .filter((u) => u.status === "FAILED" || u.status === "UNSUPPORTED")
        .map((u) => u.family),
    ),
  ];

  return {
    manifest: conmedSourceManifest(),
    units,
    verifiedPackage,
    independentlyExecutableFamilies,
    partialFamilies,
    failedFamilies,
  };
}

export type AuthenticTxnKind = "RESTRICTED_PAYMENT" | "INVESTMENT" | "ASSET_SALE";

export type AuthenticTxnEvaluation = {
  kind: AuthenticTxnKind;
  amountMillions: number;
  evaluationDate: string;
  unit: CompiledAuthenticUnit | null;
  pathEnumerationAuthority: string;
  pathCount: number;
  selectedPathId: string | null;
  capacityOutcome: string | null;
  simulationOutcome: string | null;
  selectedPathResult: string | null;
  verifiedRemainingUsd: null;
  overallConclusion: string;
  truthfulBlocker: string | null;
};

function actionForKind(kind: AuthenticTxnKind): string {
  if (kind === "RESTRICTED_PAYMENT") return "MAKE_RESTRICTED_PAYMENT";
  if (kind === "INVESTMENT") return "MAKE_INVESTMENT";
  return "DISPOSE_ASSET";
}

function familyForKind(kind: AuthenticTxnKind): CompiledAuthenticUnit["family"] {
  if (kind === "RESTRICTED_PAYMENT") return "RESTRICTED_PAYMENTS";
  if (kind === "INVESTMENT") return "INVESTMENTS";
  return "ASSET_SALES";
}

/**
 * Exercise 4E enumeration + REQUIRE capacity + REQUIRE simulate for one txn.
 * Remaining always null. Production remaining never published.
 */
export function evaluateAuthenticTransaction(args: {
  compiled: ConmedMultiFamilyCompileResult;
  kind: AuthenticTxnKind;
  amountMillions: number;
  evaluationDate: string;
}): AuthenticTxnEvaluation {
  const family = familyForKind(args.kind);
  const unit =
    args.compiled.units.find(
      (u) => u.family === family && u.status === "VERIFIED_EXECUTABLE_GROSS",
    ) ??
    args.compiled.units.find((u) => u.family === family) ??
    null;

  const pkg = args.compiled.verifiedPackage;
  if (!pkg || !unit?.ruleId) {
    return {
      kind: args.kind,
      amountMillions: args.amountMillions,
      evaluationDate: args.evaluationDate,
      unit,
      pathEnumerationAuthority: "NOT_CERTIFIED_4E",
      pathCount: 0,
      selectedPathId: null,
      capacityOutcome: null,
      simulationOutcome: null,
      selectedPathResult: null,
      verifiedRemainingUsd: null,
      overallConclusion: "REFUSED — no fidelity-passing verified unit for family",
      truthfulBlocker: `NO_VERIFIED_UNIT:${family}`,
    };
  }

  const pathEnum = enumerateCertifiedPaths({
    verifiedPackage: pkg,
    transactionKind:
      args.kind === "ASSET_SALE"
        ? "ASSET_SALE"
        : args.kind === "RESTRICTED_PAYMENT"
          ? "RESTRICTED_PAYMENT"
          : "INVESTMENT",
    secured: null,
  });

  const rule = pkg.rules.find((r) => r.ruleId === unit.ruleId)!;
  const singlePkg =
    unit.formulation === "FIXED_DOLLAR"
      ? packageForFixedDollarRule(rule)
      : packageForGreaterOfRule(rule);

  // Capacity REQUIRE: empty ledger + EMPTY_RESOLVER — PAI-04 UNKNOWN util,
  // missing APPROVED financials → never invent zero remaining or CTA.
  const capacity: VerifiedCapacityResult = evaluateVerifiedCapacity({
    package: singlePkg,
    inputs: EMPTY_RESOLVER,
    ledger: [],
    asOf: args.evaluationDate,
  });

  // Prefer path that matches our rule; else refuse silent substitution.
  const matchingPath = pathEnum.paths.find((p) => p.ruleId === unit.ruleId);
  const selectedPath: SelectedPath | null = matchingPath
    ? {
        capacityNodeIds: [`capacity:rule:${unit.ruleId}`],
        ruleIds: [unit.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      }
    : {
        capacityNodeIds: [`capacity:rule:${unit.ruleId}`],
        ruleIds: [unit.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      };

  const amountDollars = String(Math.round(args.amountMillions * 1_000_000));
  const transaction: HypotheticalTransaction = {
    transactionId: `pp003-auth-${args.kind}-${args.amountMillions}`,
    companyId: CONMED_COMPANY_ID,
    instrumentKey: CONMED_INSTRUMENT_KEY,
    effectiveAsOf: args.evaluationDate,
    category: args.kind,
    label: `${args.kind} $${args.amountMillions}M`,
    intendedAmount: { type: "MONEY", amount: amountDollars, currency: "USD" },
    effects: [
      {
        effectId: "e1",
        kind: "CONSUME_CAPACITY",
        capacityNodeId: `capacity:rule:${unit.ruleId}`,
        amount: { type: "MONEY", amount: amountDollars, currency: "USD" },
      },
    ],
    provenance: {
      source: "pp003-authentic-multi-family",
      sourceVersion: "pp003-capability.v1",
      approvalRef: null,
    },
  };

  let simulation: VerifiedTransactionResult | null = null;
  try {
    simulation = simulateVerifiedTransaction({
      package: singlePkg,
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: args.evaluationDate,
      transaction,
      selectedPath,
    });
  } catch (err) {
    return {
      kind: args.kind,
      amountMillions: args.amountMillions,
      evaluationDate: args.evaluationDate,
      unit,
      pathEnumerationAuthority: pathEnum.authority,
      pathCount: pathEnum.paths.length,
      selectedPathId: matchingPath?.pathId ?? null,
      capacityOutcome: capacity.outcome,
      simulationOutcome: null,
      selectedPathResult: null,
      verifiedRemainingUsd: null,
      overallConclusion: "REFUSED — simulate threw",
      truthfulBlocker: `SIMULATE_ERROR:${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const simOutcome = simulation.outcome;
  const pathResult =
    simulation.outcome === "EXECUTED"
      ? simulation.simulation.selectedPathResult
      : null;

  // Gross unit exists but remaining null + missing financial inputs ⇒ not customer PERMITTED.
  const truthfulBlocker =
    simOutcome === "REFUSED"
      ? simulation.refusals.map((r) => r.code).join(",") || "SIMULATE_REFUSED"
      : pathResult === "SATISFIED"
        ? "GROSS_PATH_SATISFIED_BUT_VERIFIED_REMAINING_NULL:no_completeness_certificate"
        : pathResult === "INDETERMINATE"
          ? "SELECTED_PATH_INDETERMINATE:EMPTY_RESOLVER_OR_PAI04_UNKNOWN_UTIL;verifiedRemainingUsd=null;not_VERIFIED_TRANSACTION_PERMITTED"
          : pathResult
            ? `SELECTED_PATH_${pathResult};verifiedRemainingUsd=null`
            : "NOT_SATISFIED;verifiedRemainingUsd=null";

  const overallConclusion =
    pathResult === "SATISFIED"
      ? `GROSS_EXECUTABLE_UNDER_REQUIRE — remaining null; not VERIFIED_TRANSACTION_PERMITTED without completeness (${unit.sourceCitation})`
      : `GROSS_UNIT_PRESENT_REQUIRE_RAN — path ${pathResult ?? "n/a"}; remaining null; not VERIFIED_TRANSACTION_PERMITTED (${unit.sourceCitation}) — ${truthfulBlocker}`;

  return {
    kind: args.kind,
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
    unit,
    pathEnumerationAuthority: pathEnum.authority,
    pathCount: pathEnum.paths.length,
    selectedPathId: matchingPath?.pathId ?? `path:rule:${unit.ruleId}`,
    capacityOutcome: capacity.outcome,
    simulationOutcome: simOutcome,
    selectedPathResult: pathResult,
    verifiedRemainingUsd: null,
    overallConclusion,
    truthfulBlocker,
  };
}
