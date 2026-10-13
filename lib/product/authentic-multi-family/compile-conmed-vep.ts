/**
 * Compile authentic CONMED multi-family units (fidelity + hypothetical gross).
 *
 * Does NOT fabricate Phase-3 SemanticVerificationResult / VerifiedUnitArtifact.
 * Does NOT claim CERTIFIED_4E or VERIFIED_TRANSACTION_PERMITTED without real
 * Phase-3 evidence. Verified remaining stays null.
 */

import {
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  verifyFixedDollarLegalFidelity,
  type FixedDollarCompileResult,
} from "@/lib/contract-model/compiler/fixed-dollar-basket";
import {
  compileGreaterOfAssetsBasket,
  evaluateGreaterOfCapacity,
  verifyGreaterOfLegalFidelity,
  type GreaterOfCompileResult,
} from "@/lib/contract-model/compiler/greater-of-assets-basket";
import type { IRRule } from "@/lib/contract-model/ir/types";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import {
  CONMED_COMPANY_ID,
  CONMED_DOCUMENT_ID,
  CONMED_INSTRUMENT_KEY,
  conmedSourceManifest,
  extractConmedMultiFamilyCandidates,
  type ConmedSourceUnitCandidate,
} from "./conmed-source-units";

/** Hypothetical CTA for greater-of gross probe only — never APPROVED NS-4. */
export const HYPOTHETICAL_CTA_USD = 2_000_000_000;

export type SemanticCertificationStatus =
  | "ABSENT_NO_PHASE3_EVIDENCE"
  | "PHASE3_VERIFIED";

export type OperativeStateStatus =
  | "UNRESOLVED_AMENDMENTS"
  | "OPERATIVE_STATE_REVIEW_REQUIRED"
  | "RESOLVED";

export type ProductionRemainingStatus = "REFUSED_NULL_NO_COMPLETENESS";

/**
 * Precise multi-axis status — replaces the collapsed VERIFIED_EXECUTABLE_GROSS
 * promotion that falsely implied Phase-3 / 4E certification.
 */
export type CompiledUnitCapability = {
  fidelityPass: boolean;
  hypotheticalGrossCalculable: boolean;
  semanticCertification: SemanticCertificationStatus;
  operativeState: OperativeStateStatus;
  productionRemaining: ProductionRemainingStatus;
  /** Blocking diagnostics that prevent authoritative execution. */
  authoritativeBlockers: string[];
  /**
   * Rollup for inventory only — never “independently executable” without
   * Phase-3 + operative-state + remaining completeness.
   */
  rollup:
    | "FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED"
    | "COMPILE_PARTIAL_NOT_AUTHORITATIVE"
    | "FAILED"
    | "UNSUPPORTED";
};

export type CompiledAuthenticUnit = {
  candidateId: string;
  family: ConmedSourceUnitCandidate["family"];
  formulation: ConmedSourceUnitCandidate["formulation"];
  sourceSectionRef: string;
  sourceCitation: string;
  entityScopeNote: string;
  operativeDocumentId: string;
  amendmentBindings: string[];
  conditionNotes: string[];
  capability: CompiledUnitCapability;
  /** @deprecated Use capability.rollup — retained for transition reads only. */
  status: CompiledUnitCapability["rollup"];
  grossCapacityUsd: number | null;
  /** Always null — no utilization completeness. */
  verifiedRemainingUsd: null;
  fidelityVerdict: string | null;
  ruleId: string | null;
  ruleSufficiency: string | null;
  limitations: string[];
  diagnosticEvidence: string[];
};

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

function collectDiagnostics(args: {
  warnings: string[];
  sufficiency: string | null | undefined;
  amendmentBindings: string[];
  conditionNotes: string[];
}): string[] {
  const out: string[] = [];
  for (const w of args.warnings) {
    if (/PROVENANCE_EXCERPT_UNRESOLVED/i.test(w)) {
      out.push(`PROVENANCE_EXCERPT_UNRESOLVED:${w.slice(0, 240)}`);
    }
    if (/sufficiency=PARTIAL/i.test(w) || args.sufficiency === "PARTIAL") {
      out.push("SUFFICIENCY_PARTIAL");
    }
  }
  if (args.sufficiency === "PARTIAL") out.push("SUFFICIENCY_PARTIAL");
  if (args.amendmentBindings.length === 0) {
    out.push("UNRESOLVED_AMENDMENTS:no_certified_amendment_attachments");
  }
  for (const n of args.conditionNotes) {
    if (/OPERATIVE_STATE_REVIEW_REQUIRED|Default\/Event of Default/i.test(n)) {
      out.push(`UNRESOLVED_OPERATIVE_CONDITION:${n.slice(0, 160)}`);
    }
  }
  out.push("SEMANTIC_CERTIFICATION_ABSENT:no_phase3_VerifiedUnitArtifact");
  out.push("PRODUCTION_REMAINING_REFUSED:no_utilization_completeness");
  return [...new Set(out)];
}

function buildCapability(args: {
  fidelityPass: boolean;
  hypoGrossUsd: number | null;
  diagnostics: string[];
  executableClass: string | null;
}): CompiledUnitCapability {
  const authoritativeBlockers = [...args.diagnostics];
  if (!args.fidelityPass) {
    authoritativeBlockers.push("FIDELITY_FAIL_OR_ABSENT");
  }
  // Any Phase-3 / operative / provenance / sufficiency issue blocks authoritative execution.
  const blocksAuth =
    authoritativeBlockers.some((d) =>
      /PROVENANCE_EXCERPT_UNRESOLVED|SUFFICIENCY_PARTIAL|UNRESOLVED_AMENDMENTS|UNRESOLVED_OPERATIVE|SEMANTIC_CERTIFICATION_ABSENT|PRODUCTION_REMAINING_REFUSED|FIDELITY_FAIL/i.test(
        d,
      ),
    );

  let rollup: CompiledUnitCapability["rollup"];
  if (args.executableClass === "UNSUPPORTED") {
    rollup = "UNSUPPORTED";
  } else if (!args.fidelityPass) {
    rollup = "FAILED";
  } else if (args.hypoGrossUsd != null && args.hypoGrossUsd > 0 && blocksAuth) {
    rollup = "FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED";
  } else if (args.fidelityPass) {
    rollup = "COMPILE_PARTIAL_NOT_AUTHORITATIVE";
  } else {
    rollup = "FAILED";
  }

  return {
    fidelityPass: args.fidelityPass,
    hypotheticalGrossCalculable: args.hypoGrossUsd != null && args.hypoGrossUsd > 0,
    semanticCertification: "ABSENT_NO_PHASE3_EVIDENCE",
    operativeState: "UNRESOLVED_AMENDMENTS",
    productionRemaining: "REFUSED_NULL_NO_COMPLETENESS",
    authoritativeBlockers,
    rollup,
  };
}

export type ConmedMultiFamilyCompileResult = {
  manifest: ReturnType<typeof conmedSourceManifest>;
  units: CompiledAuthenticUnit[];
  /**
   * Authoritative VEP — only when real Phase-3 verification evidence exists.
   * Always null for this fixture path (fidelity ≠ Phase-3 certify).
   */
  verifiedPackage: VerifiedExecutionPackage | null;
  /** Fidelity-passing compiled rules retained as non-certified candidates. */
  candidateRules: IRRule[];
  /** Families with fidelity-pass + hypo gross (not authoritative execution). */
  fidelityPassHypotheticalGrossFamilies: string[];
  independentlyExecutableFamilies: string[];
  partialFamilies: string[];
  failedFamilies: string[];
  certificationIntegrity: {
    fabricatedVerificationArtifacts: false;
    phase3EvidencePresent: false;
    certified4eClaimed: false;
    hypotheticalCtaUsd: typeof HYPOTHETICAL_CTA_USD;
    hypotheticalCtaIsApprovedNs4: false;
  };
};

function finalizeUnit(args: {
  candidate: ConmedSourceUnitCandidate;
  capability: CompiledUnitCapability;
  grossCapacityUsd: number | null;
  fidelityVerdict: string | null;
  ruleId: string | null;
  ruleSufficiency: string | null;
  limitations: string[];
  diagnosticEvidence: string[];
}): CompiledAuthenticUnit {
  return {
    ...bindingFields(args.candidate),
    capability: args.capability,
    status: args.capability.rollup,
    grossCapacityUsd: args.grossCapacityUsd,
    verifiedRemainingUsd: null,
    fidelityVerdict: args.fidelityVerdict,
    ruleId: args.ruleId,
    ruleSufficiency: args.ruleSufficiency,
    limitations: args.limitations,
    diagnosticEvidence: args.diagnosticEvidence,
  };
}

export function compileConmedAuthenticMultiFamily(asOf = "2025-06-30"): ConmedMultiFamilyCompileResult {
  const candidates = extractConmedMultiFamilyCandidates();
  const candidateRules: IRRule[] = [];
  const units: CompiledAuthenticUnit[] = [];

  for (const c of candidates) {
    const limitations: string[] = [
      "No utilization completeness certificate — verifiedRemainingUsd forced null.",
      c.entityScopeNote,
      "No Phase-3 SemanticVerificationResult — rules are non-certified candidates only.",
    ];

    if (c.formulation === "FIXED_DOLLAR") {
      const compile: FixedDollarCompileResult = compileFixedDollarBasket({
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
      const fidelityPass = fidelity?.verdict === "PASS";
      const evalCap =
        compile.rule && fidelityPass
          ? evaluateFixedDollarCapacity({
              compile,
              operativeSourceText: c.operativeSourceText,
              authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
              asOf,
            })
          : null;

      if (compile.rule && fidelityPass) {
        candidateRules.push(compile.rule);
        const prod = evaluateFixedDollarCapacity({
          compile,
          operativeSourceText: c.operativeSourceText,
          authorityMode: "PRODUCTION",
          asOf,
        });
        const diagnostics = collectDiagnostics({
          warnings: compile.warnings,
          sufficiency: compile.rule.sufficiency,
          amendmentBindings: [],
          conditionNotes: bindingFields(c).conditionNotes,
        });
        if (prod.outcomeLabel === "PRODUCTION_CAPACITY_REFUSED") {
          diagnostics.push("PRODUCTION_CAPACITY_REFUSED_AS_EXPECTED");
        }
        const capability = buildCapability({
          fidelityPass: true,
          hypoGrossUsd: evalCap?.availableAmountUsd ?? null,
          diagnostics,
          executableClass: compile.executableClass,
        });
        units.push(
          finalizeUnit({
            candidate: c,
            capability,
            grossCapacityUsd: evalCap?.availableAmountUsd ?? null,
            fidelityVerdict: fidelity!.verdict,
            ruleId: compile.rule.ruleId,
            ruleSufficiency: compile.rule.sufficiency,
            limitations: [
              ...limitations,
              ...(prod.productionRefusal ? [prod.productionRefusal] : []),
              ...compile.warnings,
            ],
            diagnosticEvidence: diagnostics,
          }),
        );
      } else {
        const diagnostics = collectDiagnostics({
          warnings: compile.warnings,
          sufficiency: compile.rule?.sufficiency,
          amendmentBindings: [],
          conditionNotes: bindingFields(c).conditionNotes,
        });
        const capability = buildCapability({
          fidelityPass: false,
          hypoGrossUsd: null,
          diagnostics,
          executableClass: compile.executableClass,
        });
        units.push(
          finalizeUnit({
            candidate: c,
            capability,
            grossCapacityUsd: null,
            fidelityVerdict: fidelity?.verdict ?? null,
            ruleId: null,
            ruleSufficiency: compile.rule?.sufficiency ?? null,
            limitations: [...limitations, ...compile.warnings],
            diagnosticEvidence: diagnostics,
          }),
        );
      }
      continue;
    }

    // GREATER_OF_ASSETS
    const compile: GreaterOfCompileResult = compileGreaterOfAssetsBasket({
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
    const fidelityPass = fidelity?.verdict === "PASS";

    limitations.push(
      `Greater-of CTA input stipulated at $${HYPOTHETICAL_CTA_USD} for HYPOTHETICAL gross probe only — not APPROVED NS-4 snapshot.`,
    );

    const evalCap =
      compile.rule && fidelityPass
        ? evaluateGreaterOfCapacity({
            compile,
            operativeSourceText: c.operativeSourceText,
            authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
            totalAssetsUsd: HYPOTHETICAL_CTA_USD,
            asOf,
          })
        : null;

    if (compile.rule && fidelityPass) {
      candidateRules.push(compile.rule);
      const prod = evaluateGreaterOfCapacity({
        compile,
        operativeSourceText: c.operativeSourceText,
        authorityMode: "PRODUCTION",
        totalAssetsUsd: HYPOTHETICAL_CTA_USD,
        asOf,
      });
      const diagnostics = collectDiagnostics({
        warnings: compile.warnings,
        sufficiency: compile.rule.sufficiency,
        amendmentBindings: [],
        conditionNotes: bindingFields(c).conditionNotes,
      });
      if (prod.outcomeLabel === "PRODUCTION_CAPACITY_REFUSED") {
        diagnostics.push("PRODUCTION_CAPACITY_REFUSED_AS_EXPECTED");
      }
      const capability = buildCapability({
        fidelityPass: true,
        hypoGrossUsd: evalCap?.availableAmountUsd ?? null,
        diagnostics,
        executableClass: compile.executableClass,
      });
      units.push(
        finalizeUnit({
          candidate: c,
          capability,
          grossCapacityUsd: evalCap?.availableAmountUsd ?? null,
          fidelityVerdict: fidelity!.verdict,
          ruleId: compile.rule.ruleId,
          ruleSufficiency: compile.rule.sufficiency,
          limitations: [
            ...limitations,
            ...(prod.productionRefusal ? [prod.productionRefusal] : []),
            ...compile.warnings,
          ],
          diagnosticEvidence: diagnostics,
        }),
      );
    } else {
      const diagnostics = collectDiagnostics({
        warnings: compile.warnings,
        sufficiency: compile.rule?.sufficiency,
        amendmentBindings: [],
        conditionNotes: bindingFields(c).conditionNotes,
      });
      const capability = buildCapability({
        fidelityPass: false,
        hypoGrossUsd: null,
        diagnostics,
        executableClass: compile.executableClass,
      });
      units.push(
        finalizeUnit({
          candidate: c,
          capability,
          grossCapacityUsd: null,
          fidelityVerdict: fidelity?.verdict ?? null,
          ruleId: null,
          ruleSufficiency: compile.rule?.sufficiency ?? null,
          limitations: [...limitations, ...compile.warnings],
          diagnosticEvidence: diagnostics,
        }),
      );
    }
  }

  // No fabricated Phase-3 verifications → no authoritative VEP.
  const verifiedPackage: VerifiedExecutionPackage | null = null;

  const fidelityPassHypotheticalGrossFamilies = [
    ...new Set(
      units
        .filter((u) => u.capability.rollup === "FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED")
        .map((u) => u.family),
    ),
  ];
  // Never claim independently executable without Phase-3 + operative + remaining.
  const independentlyExecutableFamilies: string[] = [];
  const partialFamilies = [
    ...new Set(
      units
        .filter(
          (u) =>
            u.capability.rollup === "FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED" ||
            u.capability.rollup === "COMPILE_PARTIAL_NOT_AUTHORITATIVE",
        )
        .map((u) => u.family),
    ),
  ];
  const failedFamilies = [
    ...new Set(
      units
        .filter((u) => u.capability.rollup === "FAILED" || u.capability.rollup === "UNSUPPORTED")
        .map((u) => u.family),
    ),
  ];

  return {
    manifest: conmedSourceManifest(),
    units,
    verifiedPackage,
    candidateRules,
    fidelityPassHypotheticalGrossFamilies,
    independentlyExecutableFamilies,
    partialFamilies,
    failedFamilies,
    certificationIntegrity: {
      fabricatedVerificationArtifacts: false,
      phase3EvidencePresent: false,
      certified4eClaimed: false,
      hypotheticalCtaUsd: HYPOTHETICAL_CTA_USD,
      hypotheticalCtaIsApprovedNs4: false,
    },
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
  /** Hypothetical gross probe only (CALLER_STIPULATED); never APPROVED NS-4. */
  hypotheticalGrossProbeUsd: number | null;
};

function familyForKind(kind: AuthenticTxnKind): CompiledAuthenticUnit["family"] {
  if (kind === "RESTRICTED_PAYMENT") return "RESTRICTED_PAYMENTS";
  if (kind === "INVESTMENT") return "INVESTMENTS";
  return "ASSET_SALES";
}

/**
 * Truthful evaluation: no fabricated VEP, no CERTIFIED_4E from synthetic artifacts,
 * no fallback selected path, no simulate without an eligible enumerated path.
 * Hypothetical gross may be reported separately from certification.
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
      (u) =>
        u.family === family &&
        u.capability.rollup === "FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED",
    ) ??
    args.compiled.units.find((u) => u.family === family) ??
    null;

  const base = {
    kind: args.kind,
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
    unit,
    verifiedRemainingUsd: null as null,
    hypotheticalGrossProbeUsd: unit?.grossCapacityUsd ?? null,
  };

  if (!unit?.ruleId || !unit.capability.fidelityPass) {
    return {
      ...base,
      pathEnumerationAuthority: "NOT_CERTIFIED_4E",
      pathCount: 0,
      selectedPathId: null,
      capacityOutcome: null,
      simulationOutcome: null,
      selectedPathResult: null,
      overallConclusion: "REFUSED — no fidelity-passing candidate unit for family",
      truthfulBlocker: `NO_FIDELITY_CANDIDATE:${family}`,
    };
  }

  // Authoritative VEP is null without Phase-3 evidence — enumeration must stay NOT_CERTIFIED_4E.
  const pathEnum = enumerateCertifiedPaths({
    verifiedPackage: args.compiled.verifiedPackage,
    transactionKind:
      args.kind === "ASSET_SALE"
        ? "ASSET_SALE"
        : args.kind === "RESTRICTED_PAYMENT"
          ? "RESTRICTED_PAYMENT"
          : "INVESTMENT",
    secured: null,
  });

  const matchingPath = pathEnum.paths.find(
    (p) => p.ruleId === unit.ruleId && p.status === "CANDIDATE",
  );

  // Blocking diagnostics always prevent authoritative simulate.
  const authBlockers = unit.capability.authoritativeBlockers;
  if (
    pathEnum.authority !== "CERTIFIED_4E" ||
    !matchingPath ||
    args.compiled.verifiedPackage == null ||
    authBlockers.length > 0
  ) {
    const blocker =
      !matchingPath && pathEnum.paths.length === 0
        ? "PATH_NOT_FOUND:NOT_CERTIFIED_4E:no_phase3_vep"
        : !matchingPath
          ? `PATH_NOT_FOUND:no_eligible_CANDIDATE_path_for_${unit.ruleId}`
          : pathEnum.authority !== "CERTIFIED_4E"
            ? `NOT_CERTIFIED_4E:authority=${pathEnum.authority}`
            : `AUTHORITATIVE_BLOCKERS:${authBlockers.slice(0, 4).join("|")}`;

    return {
      ...base,
      pathEnumerationAuthority: pathEnum.authority,
      pathCount: pathEnum.paths.length,
      selectedPathId: null,
      capacityOutcome: null,
      simulationOutcome: null,
      selectedPathResult: null,
      overallConclusion:
        `FIDELITY_PASS_HYPOTHETICAL_GROSS — not CERTIFIED_4E; simulate not invoked; remaining null (${unit.sourceCitation})`,
      truthfulBlocker: blocker,
    };
  }

  // Unreachable today without Phase-3 evidence; kept for honest future wiring only.
  return {
    ...base,
    pathEnumerationAuthority: pathEnum.authority,
    pathCount: pathEnum.paths.length,
    selectedPathId: matchingPath.pathId,
    capacityOutcome: null,
    simulationOutcome: null,
    selectedPathResult: null,
    overallConclusion:
      "UNEXPECTED_CERTIFIED_PATH — Phase-3 evidence present; REQUIRE simulate deferred to product bridge with real gates",
    truthfulBlocker: "PHASE3_PRESENT_BUT_SIMULATE_NOT_AUTO_INVOKED:manual_product_bridge_required",
  };
}
