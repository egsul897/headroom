/**
 * P1 authorization integrity — post-#348 handoff correction.
 *
 * Covers: post-seal mutation, cross-transaction/package replay,
 * unsupported applicable domains, incomplete verified execution,
 * fabricated canonical branding, and ACTIVE via isolated test injection.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { IRCapacityExpression, IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type {
  VerifiedExecutionPackage,
  VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import {
  injectTrustedIssuerRepoActivationForTests,
  mintHostVerifiedIdentityForTests,
  registerHostIdentityProvider,
  TRUSTED_ISSUER_ACTIVATION,
} from "@/lib/capacity";
import {
  executePackageTransaction,
  isSealedVerifiedExecutionPermissionHandoff,
  readSealedPermissionEvidence,
  sealVerifiedExecutionPermissionHandoff,
  type VerifiedExecutionSubject,
} from "@/lib/product/package-transaction-execution";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
} from "@/lib/product/cross-domain-scenarios";
import {
  COHERENT_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";
import { brandCanonicalUnifiedTransactionExecutionResult } from "@/lib/product/verified-transaction-execution/canonical-result";
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

const ORG = "authz-integrity-co";
const INST = "authz-2025-credit-facility";
const WHEN = "2025-06-30";
const DOC = "authz-credit-agreement";
const STRONG = {
  irSchemaVersion: "ute-v1",
  compilerVersion: "ute-compiler-v1",
  sourceContentVersion: "ute-source-v1",
} as const;

let exprN = 0;
const eid = () => `p1-expr-${++exprN}`;
const MONEY = (amount: number): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency: "USD",
  exprId: eid(),
});

function cleanResult(): SemanticVerificationResult {
  return {
    candidateRef: "p1-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "p1-cand",
      items: [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "ute-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "p1 authz fixture",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "ute-verifier-v1",
    verifiedAt: "2025-01-01T00:00:00.000Z",
    evidenceSetHash: "p1-eh-1",
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
      documentId: DOC,
      sourceNodeKey: null,
      sourceCitation: "§7.02(d)",
      excerpt: null,
    },
  } as unknown as IRRule;
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
      entityName: "AuthZ Integrity Co",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: {
      documentId: "authz-10q",
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
    sourceDocumentId: DOC,
    sourceSectionRef: "7.02(d)",
    sourceCitation: "§7.02(d)",
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
    sourceCitation: "§7.02(d)",
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
        snapshotId: "p1-snap",
        version: "1",
        companyId: ORG,
        asOf: WHEN,
        reportingPeriod: "FY2025-Q1",
        status: "APPROVED",
        supersedesSnapshotId: null,
        provenance: { source: "p1 test", sourceVersion: "v1" },
        review: {
          reviewedBy: "counsel-1",
          reviewedAt: "2025-05-01T00:00:00Z",
          approvalRef: "apr-p1-1",
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
      label: "p1 authz",
      transactionId: `p1-tx-${ruleId}`,
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
        sourceLabel: "p1-completeness",
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
  const ruleId = "p1-fixed";
  const pkg = pkgOf([ruleOf(ruleId)]);
  return executeUnifiedVerifiedTransaction(baseRequest(pkg, ruleId, over));
}

function subjectFromEvidence(
  evidence: NonNullable<ReturnType<typeof readSealedPermissionEvidence>>,
  over: Partial<VerifiedExecutionSubject> = {},
): VerifiedExecutionSubject {
  return {
    companyId: evidence.companyId,
    instrumentKey: evidence.instrumentKey,
    transactionId: evidence.transactionId!,
    transactionType: evidence.transactionType,
    transactionAmount: evidence.transactionAmount,
    transactionCurrency: evidence.transactionCurrency,
    evaluationDate: evidence.evaluationDate,
    selectedPathId: evidence.selectedPathId,
    selectedRuleIds: [...evidence.selectedRuleIds],
    packageHash: evidence.packageHash,
    operativeDocumentId: evidence.operativeDocumentId,
    financialSnapshotProvenanceIds: [...evidence.financialSnapshotProvenanceIds],
    ...over,
  };
}

afterEach(() => {
  registerHostIdentityProvider(null);
  injectTrustedIssuerRepoActivationForTests(null, { allowTestInjection: true });
  expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
});

describe("P1 — fabricated canonical branding refused", () => {
  it("deep-import brand without execute minter cannot manufacture isCanonical", () => {
    const forged = {
      contractVersion: UNIFIED_TRANSACTION_EXECUTION_VERSION,
      executionStatus: "EXECUTED_SATISFIED",
      mode: "HYPOTHETICAL",
      productionAuthority: "PRODUCTION_AUTHORITY_ACTIVE",
      legalPath: { pathId: "x", ruleIds: ["r"], label: "x", selected: true },
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
        packageHash: "forged-pkg",
        transactionId: "forged-tx",
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
      note: "forged brand",
    } as unknown as UnifiedTransactionExecutionResult;

    // Forged minter object is not the execute-installed WeakSet capability.
    const fakeMinter = Object.freeze({ scope: "executeUnifiedVerifiedTransaction" });
    const branded = brandCanonicalUnifiedTransactionExecutionResult(forged, fakeMinter, {
      companyId: ORG,
      instrumentKey: INST,
      transactionType: "FINANCE_LEASE",
      transactionAmount: 1,
      transactionCurrency: "USD",
      operativeDocumentId: DOC,
    });
    expect(isCanonicalUnifiedTransactionExecutionResult(branded)).toBe(false);
    expect(sealVerifiedExecutionPermissionHandoff(branded)).toBeNull();
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
  });
});

describe("P1 — post-seal mutation cannot change authorization", () => {
  it("mutated handoff fields are ignored — private evidence governs", async () => {
    const result = await canonicalResult();
    const sealed = sealVerifiedExecutionPermissionHandoff(result);
    expect(sealed).not.toBeNull();
    const before = readSealedPermissionEvidence(sealed)!;
    expect(before.executionStatus).not.toBe("EXECUTED_SATISFIED");

    (sealed as { executionStatus: string }).executionStatus = "EXECUTED_SATISFIED";
    (sealed as { productionAuthority: string }).productionAuthority =
      "PRODUCTION_AUTHORITY_ACTIVE";

    const after = readSealedPermissionEvidence(sealed)!;
    expect(after.executionStatus).toBe(before.executionStatus);
    expect(after.productionAuthority).toBe(before.productionAuthority);
    expect(after.executionStatus).not.toBe("EXECUTED_SATISFIED");
    expect(after.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");

    const data = coherentPackageData();
    // Align package company for this probe — still refuses on status/domains/subject.
    data.companyId = ORG;
    const pkg = executePackageTransaction({
      packageIdentity: {
        companyId: ORG,
        evaluationDate: WHEN,
        documentIds: [DOC],
      },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
      verifiedSubject: subjectFromEvidence(after),
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.unresolvedBlockers.some((b) => /EXECUTED_SATISFIED|ACTIVE|unresolved|support=/i.test(b))).toBe(
      true,
    );
  });
});

describe("P1 — cross-transaction / cross-package replay refused", () => {
  it("replay against another transactionId is refused", async () => {
    const result = await canonicalResult();
    const sealed = sealVerifiedExecutionPermissionHandoff(result)!;
    const evidence = readSealedPermissionEvidence(sealed)!;
    const data = coherentPackageData();
    data.companyId = ORG;
    const pkg = executePackageTransaction({
      packageIdentity: {
        companyId: ORG,
        evaluationDate: WHEN,
        documentIds: [DOC],
      },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
      verifiedSubject: subjectFromEvidence(evidence, { transactionId: "other-tx-id" }),
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.unresolvedBlockers.some((b) => /cross-transaction/i.test(b))).toBe(true);
  });

  it("replay against another packageHash is refused", async () => {
    const result = await canonicalResult();
    const sealed = sealVerifiedExecutionPermissionHandoff(result)!;
    const evidence = readSealedPermissionEvidence(sealed)!;
    const data = coherentPackageData();
    data.companyId = ORG;
    const pkg = executePackageTransaction({
      packageIdentity: {
        companyId: ORG,
        evaluationDate: WHEN,
        documentIds: [DOC],
      },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
      verifiedSubject: subjectFromEvidence(evidence, { packageHash: "other-package-hash" }),
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.unresolvedBlockers.some((b) => /cross-package/i.test(b))).toBe(true);
  });
});

describe("P1 — unsupported / incomplete gates", () => {
  it("applicable PARTIAL/UNSUPPORTED domains keep packagePermitted false", async () => {
    const result = await canonicalResult();
    const sealed = sealVerifiedExecutionPermissionHandoff(result)!;
    const evidence = readSealedPermissionEvidence(sealed)!;
    const data = coherentPackageData();
    data.companyId = ORG;
    const pkg = executePackageTransaction({
      packageIdentity: {
        companyId: ORG,
        evaluationDate: WHEN,
        documentIds: [DOC],
      },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
      verifiedSubject: subjectFromEvidence(evidence),
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(
      pkg.unresolvedBlockers.some((b) =>
        /applicable domain .* support=(PARTIAL|UNSUPPORTED|NOT_IMPLEMENTED)/i.test(b),
      ),
    ).toBe(true);
  });

  it("incomplete verified execution (not EXECUTED_SATISFIED) cannot permit", async () => {
    const result = await canonicalResult({ companyId: "wrong-entity-corp" });
    const sealed = sealVerifiedExecutionPermissionHandoff(result)!;
    expect(isSealedVerifiedExecutionPermissionHandoff(sealed)).toBe(true);
    const evidence = readSealedPermissionEvidence(sealed)!;
    expect(evidence.executionStatus).not.toBe("EXECUTED_SATISFIED");

    const data = coherentPackageData();
    data.companyId = evidence.companyId;
    const pkg = executePackageTransaction({
      packageIdentity: {
        companyId: evidence.companyId,
        evaluationDate: evidence.evaluationDate,
        documentIds: evidence.operativeDocumentId ? [evidence.operativeDocumentId] : [],
      },
      data,
      transaction: coherentDebtFundedAcquisition(10),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
      verifiedSubject: subjectFromEvidence(evidence),
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(pkg.unresolvedBlockers.some((b) => /EXECUTED_SATISFIED/i.test(b))).toBe(true);
  });
});

describe("P1 — ACTIVE via isolated test injection (production stays BLOCKED)", () => {
  it("injected repo ACTIVE + host mint still fails closed on unresolved domains", async () => {
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
    const identity = mintHostVerifiedIdentityForTests(
      {
        actorId: "counsel-session-1",
        authorizedRoles: ["COUNSEL_REVIEWER"],
        identityAssurance: "SESSION_AUTHENTICATED",
      },
      { allowTestMint: true },
    );
    registerHostIdentityProvider({
      verifyCurrentPrincipal: () => identity,
    });
    injectTrustedIssuerRepoActivationForTests("ACTIVE", { allowTestInjection: true });

    const result = await canonicalResult();
    // Even with injection, hypothetical mint demotes ACTIVE claims at seal when
    // productionAuthority was never ACTIVE on the result — probe domains gate.
    const sealed = sealVerifiedExecutionPermissionHandoff(result)!;
    const evidence = readSealedPermissionEvidence(sealed)!;
    const data = coherentPackageData();
    data.companyId = ORG;
    const pkg = executePackageTransaction({
      packageIdentity: {
        companyId: ORG,
        evaluationDate: WHEN,
        documentIds: [DOC],
      },
      data,
      transaction: coherentDebtFundedAcquisition(50),
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
      verifiedExecution: sealed,
      verifiedSubject: subjectFromEvidence(evidence),
    });
    expect(pkg.packagePermitted).toBe(false);
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
    expect(
      pkg.unresolvedBlockers.some(
        (b) =>
          /support=(PARTIAL|UNSUPPORTED|NOT_IMPLEMENTED)/i.test(b) ||
          /PRODUCTION_AUTHORITY_ACTIVE|EXECUTED_SATISFIED/i.test(b),
      ),
    ).toBe(true);
  });
});
