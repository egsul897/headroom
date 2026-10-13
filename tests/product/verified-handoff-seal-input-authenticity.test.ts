/**
 * Seal-input authenticity — fabricated Pick / forged REQUIRE shapes must not seal.
 * Canonical path: only executeUnifiedVerifiedTransaction-branded results seal.
 */
import { describe, expect, it } from "vitest";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { IRCapacityExpression, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type {
  VerifiedExecutionPackage,
  VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import {
  executePackageTransaction,
  isSealedVerifiedExecutionPermissionHandoff,
  sealVerifiedExecutionPermissionHandoff,
} from "@/lib/product/package-transaction-execution";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
} from "@/lib/product/cross-domain-scenarios";
import {
  COHERENT_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";
import {
  executeUnifiedVerifiedTransaction,
  isCanonicalUnifiedTransactionExecutionResult,
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type FinancialMetricEvidence,
  type OperativeSourceAuthority,
  type UnifiedTransactionExecutionRequest,
  type UnifiedTransactionExecutionResult,
  type VerifiedExecutableRuleIdentity,
} from "@/lib/product/verified-transaction-execution";

const ORG = "conmed-corp";
const INST = "conmed-2025-credit-facility";
const WHEN = "2025-06-30";
const STRONG = {
  irSchemaVersion: "ute-v1",
  compilerVersion: "ute-compiler-v1",
  sourceContentVersion: "ute-source-v1",
} as const;

let exprN = 0;
const eid = () => `seal-expr-${++exprN}`;
const MONEY = (amount: number): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency: "USD",
  exprId: eid(),
});

function cleanResult(): SemanticVerificationResult {
  return {
    candidateRef: "seal-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "seal-cand",
      items: [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "ute-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "seal authenticity fixture",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "ute-verifier-v1",
    verifiedAt: "2025-01-01T00:00:00.000Z",
    evidenceSetHash: "seal-eh-1",
  } as unknown as SemanticVerificationResult;
}

function ruleOf(ruleId: string): IRRule {
  return {
    ruleId,
    companyId: ORG,
    instrumentKey: INST,
    name: ruleId,
    capacity: MONEY(25_000_000) as IRCapacityExpression,
    irSchemaVersion: STRONG.irSchemaVersion,
    compilerVersion: STRONG.compilerVersion,
    sourceContentVersion: STRONG.sourceContentVersion,
    sourceSectionRef: "7.02(d)",
    provenance: {
      documentId: "conmed-2025-credit-agreement",
      sourceNodeKey: null,
      sourceCitation: "CONMED §7.02(d)",
      excerpt: null,
    },
  } as IRRule;
}

function artifactForRule(rule: IRRule): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: rule.ruleId,
    kind: "RULE",
    verifiedIdentity: {
      ruleOrDefinitionId: rule.ruleId,
      companyId: rule.companyId,
      instrumentKey: rule.instrumentKey,
      irSchemaVersion: rule.irSchemaVersion ?? "",
      compilerVersion: rule.compilerVersion ?? null,
      sourceContentVersion: rule.sourceContentVersion ?? null,
    },
    result: cleanResult(),
  };
}

function pkgOf(rules: IRRule[]): VerifiedExecutionPackage {
  return {
    companyId: ORG,
    instrumentKey: INST,
    rules,
    definitions: [],
    sharedCapacities: [],
    verifications: rules.map(artifactForRule),
  };
}

function metric(
  over: Partial<FinancialMetricEvidence> &
    Pick<FinancialMetricEvidence, "metricKey" | "value">,
): FinancialMetricEvidence {
  return {
    currency: "USD",
    units: "USD",
    entity: {
      companyId: ORG,
      entityName: "CONMED Corporation",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: {
      documentId: "conmed-10q",
      exactLocation: "Item 1",
      excerpt: null,
    },
    reportingPeriod: "FY2025-Q1",
    measurementDate: "2025-03-31",
    accountingDefinition: "Consolidated metric",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "VERIFIED",
    authenticity: "AUTHENTIC",
    provenanceId: `prov-${over.metricKey}`,
    ...over,
  };
}

function operative(): OperativeSourceAuthority {
  return {
    canonicalInstrumentKey: INST,
    sourceDocumentId: "conmed-2025-credit-agreement",
    sourceSectionRef: "7.02(d)",
    sourceCitation: "CONMED §7.02(d)",
    authorityClassification: "CONFIRMED_OPERATIVE",
    documentStatus: "OPERATIVE",
    effectiveAsOfDate: "2025-01-01",
    provisionalIdentity: false,
    conflictingAmendment: false,
    unresolvedConflicts: [],
    mayConsolidateOperative: true,
  };
}

function ruleIdentity(ruleId: string): VerifiedExecutableRuleIdentity {
  return {
    ruleId,
    lifecycle: "VERIFIED_EXECUTABLE",
    verificationArtifactId: `va-${ruleId}`,
    sourceSectionRef: "7.02(d)",
    sourceCitation: "CONMED §7.02(d)",
    ...STRONG,
  };
}

function baseRequest(
  pkg: VerifiedExecutionPackage,
  ruleId: string,
  over: Partial<UnifiedTransactionExecutionRequest> = {},
): UnifiedTransactionExecutionRequest {
  const mv = (amount: string) => ({
    type: "MONEY" as const,
    amount: rationalFromString(amount),
    currency: "USD",
    lineage: { exprId: null as string | null, inputKeys: [] as string[] },
  });
  const inputs = snapshotInputResolver({
    snapshots: [
      {
        snapshotId: "seal-snap",
        version: "1",
        companyId: ORG,
        asOf: WHEN,
        reportingPeriod: "FY2025-Q1",
        status: "APPROVED",
        supersedesSnapshotId: null,
        provenance: { source: "seal test", sourceVersion: "v1" },
        review: {
          reviewedBy: "counsel-1",
          reviewedAt: "2025-05-01T00:00:00Z",
          approvalRef: "apr-seal-1",
        },
        inputs: [
          {
            identity: {
              companyId: ORG,
              scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
              inputKind: "METRIC",
              key: "Consolidated EBITDA",
              identityStrength: "CONTRACT_NAME_ONLY",
              period: { kind: "NOT_PERIOD_SPECIFIC" },
              asOf: { kind: "EXACT_DATE", isoDate: WHEN },
              valueType: "MONEY",
              currency: "USD",
            },
            value: mv("400000000"),
            sourceVersion: "src-1",
          },
        ],
      },
    ],
    definitions: [],
    rules: [...pkg.rules],
    companyId: ORG,
    instrumentKey: INST,
  });

  return {
    companyId: ORG,
    instrumentKey: INST,
    transaction: {
      type: "FINANCE_LEASE",
      amount: 10_000_000,
      currency: "USD",
      date: WHEN,
      label: "seal authenticity",
      transactionId: `seal-tx-${ruleId}`,
    },
    selectedLegalPath: {
      pathId: `path:${ruleId}`,
      ruleIds: [ruleId],
      capacityNodeIds: [`capacity:rule:${ruleId}`],
      sharedCapacityIds: [],
      label: `path ${ruleId}`,
      selectionMode: "EXPLICIT",
    },
    verifiedExecutableRule: ruleIdentity(ruleId),
    operativeSourceAuthority: operative(),
    financialEvidence: {
      metrics: [metric({ metricKey: "CONSOLIDATED_EBITDA", value: 400_000_000 })],
      requiredMetricKeys: [],
    },
    utilization: {
      capacityRuleId: ruleId,
      records: [],
      completenessCertificate: {
        capacityRuleId: ruleId,
        asOf: WHEN,
        approvalState: "APPROVED",
        sourceLabel: "seal-completeness",
        kind: "VERIFIED_EMPTY",
        authenticity: "AUTHENTIC",
        issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-1" },
      },
      allowSyntheticRemaining: true,
    },
    ledger: [],
    reviewerAuthorization: { required: false, actorId: null, role: null },
    verifiedPackage: pkg,
    inputs,
    mode: "HYPOTHETICAL",
    allowHypotheticalFinancials: false,
    ...over,
  };
}

async function canonicalResult(
  over: Partial<UnifiedTransactionExecutionRequest> = {},
): Promise<UnifiedTransactionExecutionResult> {
  const ruleId = "seal-fixed";
  const pkg = pkgOf([ruleOf(ruleId)]);
  return executeUnifiedVerifiedTransaction(baseRequest(pkg, ruleId, over));
}

describe("seal input authenticity — fabricated REQUIRE fields refused", () => {
  it("structural Pick with EXECUTED_SATISFIED + PRODUCTION_AUTHORITY_ACTIVE does not seal", () => {
    const fabricated = {
      executionStatus: "EXECUTED_SATISFIED" as const,
      productionAuthority: "PRODUCTION_AUTHORITY_ACTIVE" as const,
      contractVersion: UNIFIED_TRANSACTION_EXECUTION_VERSION,
    };
    // @ts-expect-error — adversarial: Pick-only is no longer a valid seal input
    const sealed = sealVerifiedExecutionPermissionHandoff(fabricated);
    expect(sealed).toBeNull();
    expect(isSealedVerifiedExecutionPermissionHandoff(fabricated)).toBe(false);
  });

  it("forged full-shaped execution result without canonical brand does not seal", () => {
    const forged = {
      contractVersion: UNIFIED_TRANSACTION_EXECUTION_VERSION,
      executionStatus: "EXECUTED_SATISFIED",
      mode: "PRODUCTION_AUTHORITY",
      productionAuthority: "PRODUCTION_AUTHORITY_ACTIVE",
      legalPath: { pathId: "x", ruleIds: [], label: "x", selected: true },
      sourceCitations: [],
      financialInputs: {
        validation: {
          ok: true,
          productionAuthoritative: true,
          refusalReasons: [],
          metrics: [],
        },
        metrics: [],
      },
      bindingConstraints: [],
      capacityEffects: {
        preStatus: null,
        postSelectedPathResult: null,
        simulationStatus: null,
        sharedPoolIds: [],
        consumedNodeIds: [],
        grossCapacityLabel: null,
        remainingPublicationAllowed: true,
        utilizationKnowledge: null,
      },
      missingInputs: [],
      conditions: [],
      utilizationAuthority: {
        supportsRemainingClaim: true,
        productionAuthoritative: true,
        knowledge: null,
        blockers: [],
        resolution: null,
      },
      operativeAuthority: {} as UnifiedTransactionExecutionResult["operativeAuthority"],
      postStateIdentity: {
        packageHash: null,
        transactionId: null,
        evaluationDate: WHEN,
        stateHash: null,
      },
      trace: [],
      blockers: [],
      verified: {
        capacity: null,
        simulation: null,
        selectedPath: null,
        transaction: null,
      },
      limitations: [],
      note: "forged",
    } as UnifiedTransactionExecutionResult;

    expect(isCanonicalUnifiedTransactionExecutionResult(forged)).toBe(false);
    expect(sealVerifiedExecutionPermissionHandoff(forged)).toBeNull();
  });

  it("mismatched contractVersion fabrication does not seal", () => {
    const badVersion = {
      executionStatus: "EXECUTED_SATISFIED" as const,
      productionAuthority: "PRODUCTION_AUTHORITY_ACTIVE" as const,
      contractVersion: "unified-transaction-execution.v0-forged",
    };
    // @ts-expect-error — adversarial mismatched version Pick
    expect(sealVerifiedExecutionPermissionHandoff(badVersion)).toBeNull();
  });

  it("post-brand field mutation cannot upgrade mint-time permission snapshot", async () => {
    const result = await canonicalResult({
      companyId: "wrong-entity-corp", // identity refuse — still branded
    });
    expect(isCanonicalUnifiedTransactionExecutionResult(result)).toBe(true);
    // Mutate live fields after brand — seal must ignore attacker upgrades.
    (result as { executionStatus: string }).executionStatus = "EXECUTED_SATISFIED";
    (result as { productionAuthority: string }).productionAuthority =
      "PRODUCTION_AUTHORITY_ACTIVE";

    const sealed = sealVerifiedExecutionPermissionHandoff(result);
    expect(sealed).not.toBeNull();
    expect(sealed!.executionStatus).not.toBe("EXECUTED_SATISFIED");
    expect(sealed!.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
    expect(sealed!.contractVersion).toBe(UNIFIED_TRANSACTION_EXECUTION_VERSION);
  });
});

describe("seal input authenticity — canonical REQUIRE path", () => {
  it("canonical execute result seals; structural clone of handoff is refused", async () => {
    const result = await canonicalResult();
    expect(isCanonicalUnifiedTransactionExecutionResult(result)).toBe(true);

    const sealed = sealVerifiedExecutionPermissionHandoff(result);
    expect(sealed).not.toBeNull();
    expect(isSealedVerifiedExecutionPermissionHandoff(sealed)).toBe(true);
    // Host issuer remains BLOCKED — never permits via packagePermitted.
    expect(sealed!.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");

    const clone = { ...sealed! };
    expect(isSealedVerifiedExecutionPermissionHandoff(clone)).toBe(false);

    const data = coherentPackageData();
    const pkg = executePackageTransaction({
      packageIdentity: { companyId: data.companyId, evaluationDate: "2026-06-30" },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: clone,
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.unresolvedBlockers.some((b) => /forged\/unsealed/i.test(b))).toBe(true);
  });

  it("sealed canonical handoff with host BLOCKED → packagePermitted false", async () => {
    const result = await canonicalResult();
    const sealed = sealVerifiedExecutionPermissionHandoff(result);
    expect(sealed).not.toBeNull();

    const data = coherentPackageData();
    const pkg = executePackageTransaction({
      packageIdentity: { companyId: data.companyId, evaluationDate: "2026-06-30" },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.verifiedExecutionHandoff).toBe(sealed);
  });

  it("wrong package identity still refuses packagePermitted even with sealed handoff", async () => {
    const result = await canonicalResult();
    const sealed = sealVerifiedExecutionPermissionHandoff(result);
    expect(sealed).not.toBeNull();

    const data = coherentPackageData();
    const pkg = executePackageTransaction({
      packageIdentity: { companyId: "wrong-company", evaluationDate: "2026-06-30" },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.steps[0]!.status).toBe("REFUSED");
  });
});
