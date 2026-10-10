/**
 * Unified verified transaction execution — Scope F gate + architecture pins.
 *
 * Covers: fixed-dollar, greater-of, missing financials, missing utilization,
 * wrong entity, wrong currency, provisional document, conflicting amendment,
 * shared debt/lien capacity, unsupported path, hypothetical simulation,
 * forged approval, replay determinism, no favorable result from incomplete authority.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type {
  IRCapacityExpression,
  IRExpression,
  IRRule,
  IRSharedCapacity,
} from "@/lib/contract-model/ir/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import {
  evaluateVerifiedCapacity,
  type VerifiedExecutionPackage,
  type VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import {
  demoTrustedIssuerAuth,
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
  type UtilizationCompletenessCertificate,
  type UtilizationEvidenceRecord,
} from "@/lib/capacity";
import {
  executeUnifiedVerifiedTransaction,
  toAllProductExecutionHandoffs,
  toProductExecutionHandoff,
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type FinancialMetricEvidence,
  type OperativeSourceAuthority,
  type UnifiedTransactionExecutionRequest,
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
const eid = () => `ute-expr-${++exprN}`;

const MONEY = (amount: number, currency = "USD"): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency,
  exprId: eid(),
});
const PCT = (value: number): IRExpression => ({
  kind: "PERCENT",
  type: "PERCENT",
  value,
  exprId: eid(),
});
const FIGURE = (metricName: string): IRExpression =>
  ({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId: ORG,
    instrumentKey: INST,
    resolvedDefinitionId: null,
    exprId: eid(),
  }) as IRExpression;
const MUL = (...operands: IRExpression[]): IRExpression => ({
  kind: "MULTIPLY",
  type: "MONEY",
  operands,
  exprId: eid(),
});
const MAX = (...operands: IRExpression[]): IRCapacityExpression => ({
  kind: "MAX",
  type: "MONEY",
  operands,
  exprId: eid(),
});

function cleanResult(
  over: { irInventoryItems?: SemanticVerificationResult["irInventory"]["items"] } = {},
): SemanticVerificationResult {
  return {
    candidateRef: "ute-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "ute-cand",
      items: over.irInventoryItems ?? [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "ute-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "UTE fixture — no live verifier",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "ute-verifier-v1",
    verifiedAt: "2025-01-01T00:00:00.000Z",
    evidenceSetHash: "ute-eh-1",
  } as unknown as SemanticVerificationResult;
}

function ruleOf(
  ruleId: string,
  capacity: IRCapacityExpression,
  over: Partial<IRRule> = {},
): IRRule {
  const { provenance: provenanceOver, ...rest } = over;
  return {
    ruleId,
    ...STRONG,
    companyId: ORG,
    instrumentKey: INST,
    sourceDocumentId: "conmed-2025-credit-agreement",
    sourceSectionRef: "7.02(d)",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: capacity,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "conmed-2025-credit-agreement",
      sourceNodeKey: null,
      sourceCitation:
        "CONMED §7.02(d) Finance Lease / purchase money (authentic provision language; FIXTURE_IR executable binding)",
      excerpt: null,
      ...provenanceOver,
    },
    ...rest,
  };
}

function artifactForRule(u: IRRule): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: u.ruleId,
    kind: "RULE",
    verifiedIdentity: {
      ruleOrDefinitionId: u.ruleId,
      companyId: u.companyId,
      instrumentKey: u.instrumentKey,
      irSchemaVersion: u.irSchemaVersion ?? "",
      compilerVersion: u.compilerVersion ?? null,
      sourceContentVersion: u.sourceContentVersion ?? null,
    },
    result: cleanResult(),
  };
}

function artifactForShared(cap: IRSharedCapacity): VerifiedUnitArtifact {
  const amount =
    cap.capExpression && "amount" in cap.capExpression
      ? (cap.capExpression as { amount: number }).amount
      : null;
  const items = [
    {
      itemId: `${cap.sharedCapId}:amount`,
      kind: "AMOUNT" as const,
      ruleOrDefinitionId: cap.sharedCapId,
      irPath: "sharedCapacities[0].capExpression",
      numericValue: amount,
      textValue: null,
      isAlternativeWithinSelection: false,
      sourceCitation: null,
      sourceExcerpt: null,
    },
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
      irSchemaVersion: cap.irSchemaVersion ?? "",
      compilerVersion: cap.compilerVersion ?? null,
      sourceContentVersion: cap.sourceContentVersion ?? null,
    },
    result: cleanResult({ irInventoryItems: items }),
  };
}

function pkgOf(
  rules: IRRule[],
  shared: IRSharedCapacity[] = [],
): VerifiedExecutionPackage {
  return {
    companyId: ORG,
    instrumentKey: INST,
    rules,
    definitions: [],
    sharedCapacities: shared,
    verifications: [
      ...rules.map(artifactForRule),
      ...shared.map(artifactForShared),
    ],
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
      documentId: "conmed-10q-2025-q1",
      exactLocation: "Item 1 / Consolidated Statements",
      excerpt: null,
    },
    reportingPeriod: "FY2025-Q1",
    measurementDate: "2025-03-31",
    accountingDefinition: "Consolidated metric per credit agreement definitions",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "VERIFIED",
    authenticity: "AUTHENTIC",
    provenanceId: `prov-${over.metricKey}`,
    ...over,
  };
}

function operative(
  over: Partial<OperativeSourceAuthority> = {},
): OperativeSourceAuthority {
  return {
    canonicalInstrumentKey: INST,
    sourceDocumentId: "conmed-2025-credit-agreement",
    sourceSectionRef: "7.02(d)",
    sourceCitation: "CONMED Fourth A&R Credit Agreement §7.02(d)",
    authorityClassification: "CONFIRMED_OPERATIVE",
    documentStatus: "OPERATIVE",
    effectiveAsOfDate: "2025-01-01",
    provisionalIdentity: false,
    conflictingAmendment: false,
    unresolvedConflicts: [],
    mayConsolidateOperative: true,
    ...over,
  };
}

function ruleIdentity(
  ruleId: string,
  over: Partial<VerifiedExecutableRuleIdentity> = {},
): VerifiedExecutableRuleIdentity {
  return {
    ruleId,
    lifecycle: "VERIFIED_EXECUTABLE",
    verificationArtifactId: `va-${ruleId}`,
    sourceSectionRef: "7.02(d)",
    sourceCitation: "CONMED §7.02(d) (authentic legal provision; classified FIXTURE_IR binding)",
    ...STRONG,
    ...over,
  };
}

function emptyUtilCert(ruleId: string): UtilizationCompletenessCertificate {
  return {
    capacityRuleId: ruleId,
    asOf: WHEN,
    approvalState: "APPROVED",
    sourceLabel: "ute-completeness",
    kind: "VERIFIED_EMPTY",
    authenticity: "AUTHENTIC",
    issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-1" },
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
        snapshotId: "ute-snap",
        version: "1",
        companyId: ORG,
        asOf: WHEN,
        reportingPeriod: "FY2025-Q1",
        status: "APPROVED",
        supersedesSnapshotId: null,
        provenance: { source: "ute test", sourceVersion: "v1" },
        review: {
          reviewedBy: "counsel-1",
          reviewedAt: "2025-05-01T00:00:00Z",
          approvalRef: "apr-ute-1",
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
          {
            identity: {
              companyId: ORG,
              scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
              inputKind: "METRIC",
              key: "Consolidated Total Assets",
              identityStrength: "CONTRACT_NAME_ONLY",
              period: { kind: "NOT_PERIOD_SPECIFIC" },
              asOf: { kind: "EXACT_DATE", isoDate: WHEN },
              valueType: "MONEY",
              currency: "USD",
            },
            value: mv("2000000000"),
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
      label: "UTE test finance lease",
      transactionId: `ute-tx-${ruleId}`,
    },
    selectedLegalPath: {
      pathId: `path:${ruleId}`,
      ruleIds: [ruleId],
      capacityNodeIds: [`capacity:rule:${ruleId}`],
      sharedCapacityIds: [],
      label: `§7.02 path ${ruleId}`,
      selectionMode: "EXPLICIT",
    },
    verifiedExecutableRule: ruleIdentity(ruleId),
    operativeSourceAuthority: operative(),
    financialEvidence: {
      metrics: [
        metric({ metricKey: "CONSOLIDATED_EBITDA", value: 400_000_000 }),
        metric({ metricKey: "TOTAL_ASSETS", value: 2_000_000_000 }),
      ],
      requiredMetricKeys: [],
    },
    utilization: {
      capacityRuleId: ruleId,
      records: [],
      completenessCertificate: emptyUtilCert(ruleId),
      allowSyntheticRemaining: false,
    },
    ledger: [],
    reviewerAuthorization: {
      required: true,
      actorId: "counsel-1",
      role: "COUNSEL_REVIEWER",
      trustedIssuerAuth: productionTrustedIssuerAuth([
        sessionCounselPrincipal("counsel-1"),
      ]),
    },
    verifiedPackage: pkg,
    inputs,
    mode: "HYPOTHETICAL",
    allowHypotheticalFinancials: false,
    ...over,
  };
}

describe("architecture: orchestration does not import runtime engines or solver", () => {
  it("verified-transaction-execution never imports runtime capacity/simulate or runSolver", async () => {
    const dir = "lib/product/verified-transaction-execution";
    const files = fs
      .readdirSync(dir, { recursive: true })
      .map((f) => path.join(dir, String(f)))
      .filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs
        .readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src).not.toMatch(/runtime\/(capacity\/graph|capacity\/state|transaction\/simulate)/);
      expect(src).not.toMatch(/\brunSolver\b|from ["']@\/lib\/solver/);
    }
    const exec = fs.readFileSync(`${dir}/execute.ts`, "utf8");
    expect(exec).toMatch(/evaluateVerifiedCapacity/);
    expect(exec).toMatch(/simulateVerifiedTransaction/);
  });

  it("exports stable contract version", async () => {
    expect(UNIFIED_TRANSACTION_EXECUTION_VERSION).toBe(
      "unified-transaction-execution.v1",
    );
  });
});

describe("Scope F — unified transaction execution", () => {
  it("fixed-dollar permission: CONMED-form §7.02(d) $25mm basket SATISFIED hypothetically", async () => {
    const r = ruleOf("p-fixed", MONEY(25_000_000) as IRCapacityExpression, {
      sourceSectionRef: "7.02(d)",
      provenance: {
        documentId: "conmed-2025-credit-agreement",
        sourceNodeKey: null,
        sourceCitation:
          "§7.02(d) — Finance Leases and purchase money Indebtedness not exceeding $25,000,000 (authentic CONMED-form provision; FIXTURE_IR executable)",
        excerpt: "not exceeding $25,000,000",
      },
    });
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-fixed", {
        transaction: {
          type: "FINANCE_LEASE",
          amount: 10_000_000,
          currency: "USD",
          date: WHEN,
          transactionId: "ute-fixed-1",
        },
        utilization: {
          capacityRuleId: "p-fixed",
          records: [],
          completenessCertificate: emptyUtilCert("p-fixed"),
          allowSyntheticRemaining: true,
        },
        reviewerAuthorization: {
          required: false,
          actorId: null,
          role: null,
          trustedIssuerAuth: demoTrustedIssuerAuth(),
        },
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 400_000_000,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
        allowHypotheticalFinancials: true,
      }),
    );
    expect(result.executionStatus).toBe("EXECUTED_HYPOTHETICAL");
    expect(result.productionAuthority).toBe("HYPOTHETICAL_ONLY");
    expect(result.verified.simulation?.outcome).toBe("EXECUTED");
    if (result.verified.simulation?.outcome === "EXECUTED") {
      expect(result.verified.simulation.simulation.selectedPathResult).toBe(
        "SATISFIED",
      );
    }
    expect(result.bindingConstraints.some((c) => c.kind === "FIXED_DOLLAR")).toBe(
      true,
    );
    expect(result.sourceCitations.join(" ")).toMatch(/7\.02\(d\)/);
  });

  it("greater-of permission: MAX($50mm, 10% EBITDA) evaluates via existing engine", async () => {
    const cap = MAX(MONEY(50_000_000), MUL(PCT(0.1), FIGURE("Consolidated EBITDA")));
    const r = ruleOf("p-greater", cap, {
      sourceSectionRef: "7.02(q)",
      provenance: {
        documentId: "conmed-2025-credit-agreement",
        sourceNodeKey: null,
        sourceCitation:
          "§7.02(q) — greater of $50,000,000 and 10% of Consolidated EBITDA (authentic greater-of shape; FIXTURE_IR)",
        excerpt: "greater of $50,000,000 and 10%",
      },
    });
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-greater", {
        verifiedExecutableRule: ruleIdentity("p-greater", {
          sourceSectionRef: "7.02(q)",
          sourceCitation: "CONMED §7.02(q) greater-of",
        }),
        selectedLegalPath: {
          pathId: "path:p-greater",
          ruleIds: ["p-greater"],
          capacityNodeIds: ["capacity:rule:p-greater"],
          sharedCapacityIds: [],
          label: "§7.02(q) greater-of",
          selectionMode: "EXPLICIT",
        },
        transaction: {
          type: "UNSECURED_DEBT",
          amount: 40_000_000,
          currency: "USD",
          date: WHEN,
          transactionId: "ute-greater-1",
        },
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 400_000_000,
              authenticity: "CALLER_STIPULATED_HYPOTHETICAL",
            }),
          ],
          requiredMetricKeys: ["CONSOLIDATED_EBITDA"],
        },
        allowHypotheticalFinancials: true,
        reviewerAuthorization: {
          required: false,
          actorId: null,
          role: null,
        },
        utilization: {
          capacityRuleId: "p-greater",
          records: [],
          completenessCertificate: {
            ...emptyUtilCert("p-greater"),
            authenticity: "SYNTHETIC_LABELED",
            issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
          },
          allowSyntheticRemaining: true,
        },
      }),
    );
    expect(result.bindingConstraints.some((c) => c.kind === "GREATER_OF")).toBe(
      true,
    );
    expect(result.executionStatus).toBe("EXECUTED_HYPOTHETICAL");
    // 10% of 400mm = 40mm; greater-of with 50mm floor → 50mm gross; 40mm draw SATISFIED
    if (result.verified.capacity?.outcome === "EXECUTED") {
      const entry = result.verified.capacity.state.capacities.find(
        (c) => c.ruleId === "p-greater",
      )!;
      expect(entry.status).toBe("AVAILABLE");
    }
  });

  it("missing financials: required metric absent → REFUSED, no favorable result", async () => {
    const r = ruleOf("p-fin", MAX(MONEY(1), MUL(PCT(0.1), FIGURE("Consolidated EBITDA"))));
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-fin", {
        financialEvidence: { metrics: [], requiredMetricKeys: ["CONSOLIDATED_EBITDA"] },
        allowHypotheticalFinancials: true,
        reviewerAuthorization: { required: false, actorId: null, role: null },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.missingInputs.length).toBeGreaterThan(0);
    expect(result.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
    expect(result.verified.simulation).toBeNull();
  });

  it("missing utilization: UNKNOWN ≠ zero; remaining publication refused", async () => {
    const r = ruleOf("p-util", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-util", {
        utilization: {
          capacityRuleId: "p-util",
          records: [],
          completenessCertificate: null,
        },
        reviewerAuthorization: { required: false, actorId: null, role: null },
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
        allowHypotheticalFinancials: true,
      }),
    );
    expect(result.utilizationAuthority.supportsRemainingClaim).toBe(false);
    expect(result.capacityEffects.remainingPublicationAllowed).toBe(false);
    expect(result.limitations.join(" ")).toMatch(/UNKNOWN utilization/i);
    expect(result.missingInputs).toContain("utilization completeness certificate");
  });

  it("wrong entity: package / evidence company mismatch refuses", async () => {
    const r = ruleOf("p-ent", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-ent", {
        companyId: "other-co",
        reviewerAuthorization: { required: false, actorId: null, role: null },
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
              entity: {
                companyId: ORG,
                entityName: "CONMED",
                consolidationPerimeter: "Borrower",
              },
            }),
          ],
          requiredMetricKeys: [],
        },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.blockers.some((b) => /wrong entity/i.test(b))).toBe(true);
  });

  it("wrong currency: evidence currency ≠ transaction currency refuses", async () => {
    const r = ruleOf("p-ccy", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-ccy", {
        transaction: {
          type: "UNSECURED_DEBT",
          amount: 1_000_000,
          currency: "EUR",
          date: WHEN,
          transactionId: "ute-ccy",
        },
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              currency: "USD",
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
        allowHypotheticalFinancials: true,
        reviewerAuthorization: { required: false, actorId: null, role: null },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.blockers.some((b) => /wrong currency/i.test(b))).toBe(true);
  });

  it("provisional document: never promotes to operative", async () => {
    const r = ruleOf("p-prov", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-prov", {
        operativeSourceAuthority: operative({
          authorityClassification: "PROVISIONAL_IDENTITY_BLOCKED",
          documentStatus: "PROVISIONAL",
          provisionalIdentity: true,
          mayConsolidateOperative: false,
          canonicalInstrumentKey: null,
        }),
        reviewerAuthorization: { required: false, actorId: null, role: null },
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.operativeAuthority.ok).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/provisional/i);
  });

  it("conflicting amendment: refuses unique operative selection", async () => {
    const r = ruleOf("p-conf", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-conf", {
        operativeSourceAuthority: operative({
          authorityClassification: "CONFLICTED",
          conflictingAmendment: true,
          unresolvedConflicts: ["same-date REPLACE_TEXT on §7.02(d)"],
        }),
        reviewerAuthorization: { required: false, actorId: null, role: null },
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.blockers.join(" ")).toMatch(/conflict/i);
  });

  it("shared debt/lien capacity: members are not additive independent pools", async () => {
    const a = ruleOf("prov-a", MONEY(100_000_000) as IRCapacityExpression, {
      sourceSectionRef: "7.02(a)",
    });
    const b = ruleOf("prov-b", MONEY(100_000_000) as IRCapacityExpression, {
      sourceSectionRef: "7.02(b)",
    });
    const pool: IRSharedCapacity = {
      sharedCapId: "pool-lien",
      companyId: ORG,
      instrumentKey: INST,
      description: "shared secured capacity $120mm",
      capExpression: MONEY(120_000_000) as IRCapacityExpression,
      memberRuleIds: ["prov-a", "prov-b"],
      provenance: null,
      ...STRONG,
    };
    const pkg = pkgOf([a, b], [pool]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "prov-a", {
        verifiedExecutableRule: ruleIdentity("prov-a", {
          sourceSectionRef: "7.02(a)",
          sourceCitation: "CONMED §7.02(a) shared secured",
        }),
        selectedLegalPath: {
          pathId: "path:shared-a",
          ruleIds: ["prov-a"],
          capacityNodeIds: ["capacity:rule:prov-a"],
          sharedCapacityIds: ["pool-lien"],
          label: "shared secured path A",
          selectionMode: "EXPLICIT",
        },
        transaction: {
          type: "SECURED_DEBT",
          amount: 70_000_000,
          currency: "USD",
          date: WHEN,
          transactionId: "ute-shared-1",
        },
        utilization: {
          capacityRuleId: "prov-a",
          sharedCapacityId: "pool-lien",
          records: [],
          completenessCertificate: {
            ...emptyUtilCert("prov-a"),
            authenticity: "SYNTHETIC_LABELED",
            issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
          },
          allowSyntheticRemaining: true,
        },
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "SECURED_DEBT",
              value: 0,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
        reviewerAuthorization: { required: false, actorId: null, role: null },
      }),
    );
    expect(result.bindingConstraints.some((c) => c.kind === "SHARED_POOL")).toBe(
      true,
    );
    expect(result.capacityEffects.sharedPoolIds).toEqual(["pool-lien"]);
    expect(result.executionStatus).toBe("EXECUTED_HYPOTHETICAL");
    // Second draw that would exceed shared pool must be insufficient if applied additively wrongly —
    // prove shared constraint exists on capacity state.
    if (result.verified.capacity?.outcome === "EXECUTED") {
      expect(result.verified.capacity.state.sharedConstraints.length).toBe(1);
    }
  });

  it("unsupported path: shared pool id not in package refuses", async () => {
    const r = ruleOf("p-unsup", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-unsup", {
        selectedLegalPath: {
          pathId: "path:bad-pool",
          ruleIds: ["p-unsup"],
          capacityNodeIds: ["capacity:rule:p-unsup"],
          sharedCapacityIds: ["ghost-pool"],
          label: "unsupported",
          selectionMode: "EXPLICIT",
        },
        reviewerAuthorization: { required: false, actorId: null, role: null },
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.blockers.join(" ")).toMatch(/shared capacity ghost-pool/i);
  });

  it("hypothetical simulation: HYPOTHETICAL must not promote to PRODUCTION_AUTHORITY", async () => {
    const r = ruleOf("p-hyp", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-hyp", {
        mode: "HYPOTHETICAL",
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "CALLER_STIPULATED_HYPOTHETICAL",
            }),
          ],
          requiredMetricKeys: [],
        },
        reviewerAuthorization: { required: false, actorId: null, role: null },
        utilization: {
          capacityRuleId: "p-hyp",
          records: [],
          completenessCertificate: {
            ...emptyUtilCert("p-hyp"),
            authenticity: "SYNTHETIC_LABELED",
            issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
          },
          allowSyntheticRemaining: true,
        },
      }),
    );
    expect(result.mode).toBe("HYPOTHETICAL");
    expect(result.productionAuthority).toBe("HYPOTHETICAL_ONLY");
    expect(result.executionStatus).toBe("EXECUTED_HYPOTHETICAL");
    expect(result.note).toMatch(/BLOCKED|Hypothetical/i);
  });

  it("forged approval: certificate role alone / unknown actor refuses", async () => {
    const r = ruleOf("p-forge", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-forge", {
        mode: "PRODUCTION_AUTHORITY",
        reviewerAuthorization: {
          required: true,
          actorId: "forged-actor",
          role: "COUNSEL_REVIEWER",
          // Host registry does not contain forged-actor
          trustedIssuerAuth: productionTrustedIssuerAuth([
            sessionCounselPrincipal("counsel-1"),
          ]),
        },
        financialEvidence: {
          metrics: [
            metric({ metricKey: "CONSOLIDATED_EBITDA", value: 400_000_000 }),
          ],
          requiredMetricKeys: [],
        },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.blockers.join(" ")).toMatch(/forged|unauthorized|not found/i);
    expect(result.productionAuthority).toBe("PRODUCTION_AUTHORITY_BLOCKED");
  });

  it("replay determinism: identical requests → identical packageHash / stateHash / status", async () => {
    const r = ruleOf("p-replay", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const req = baseRequest(pkg, "p-replay", {
      transaction: {
        type: "FINANCE_LEASE",
        amount: 5_000_000,
        currency: "USD",
        date: WHEN,
        transactionId: "ute-replay-1",
      },
      allowHypotheticalFinancials: true,
      financialEvidence: {
        metrics: [
          metric({
            metricKey: "CONSOLIDATED_EBITDA",
            value: 1,
            authenticity: "SYNTHETIC_LABELED",
          }),
        ],
        requiredMetricKeys: [],
      },
      reviewerAuthorization: { required: false, actorId: null, role: null },
      utilization: {
        capacityRuleId: "p-replay",
        records: [],
        completenessCertificate: {
          ...emptyUtilCert("p-replay"),
          authenticity: "SYNTHETIC_LABELED",
          issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
        },
        allowSyntheticRemaining: true,
      },
    });
    const a = await executeUnifiedVerifiedTransaction(req);
    const b = await executeUnifiedVerifiedTransaction(req);
    expect(a.executionStatus).toBe(b.executionStatus);
    expect(a.postStateIdentity.packageHash).toBe(b.postStateIdentity.packageHash);
    expect(a.postStateIdentity.stateHash).toBe(b.postStateIdentity.stateHash);
    expect(a.postStateIdentity.transactionId).toBe(b.postStateIdentity.transactionId);
    expect(JSON.stringify(a.trace.map((t) => t.step))).toBe(
      JSON.stringify(b.trace.map((t) => t.step)),
    );
  });

  it("DISCOVERED lifecycle never promotes to VERIFIED_EXECUTABLE", async () => {
    const r = ruleOf("p-disc", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-disc", {
        verifiedExecutableRule: ruleIdentity("p-disc", {
          lifecycle: "DISCOVERED",
        }),
        reviewerAuthorization: { required: false, actorId: null, role: null },
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
      }),
    );
    expect(result.executionStatus).toBe("REFUSED");
    expect(result.blockers.join(" ")).toMatch(/DISCOVERED/);
  });

  it("no favorable PRODUCTION_AUTHORITY result from incomplete authority", async () => {
    const r = ruleOf("p-inc", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-inc", {
        mode: "PRODUCTION_AUTHORITY",
        // APPROVED completeness without authenticity
        utilization: {
          capacityRuleId: "p-inc",
          records: [] as UtilizationEvidenceRecord[],
          completenessCertificate: {
            capacityRuleId: "p-inc",
            asOf: WHEN,
            approvalState: "APPROVED",
            sourceLabel: "forged-approval-no-auth",
            kind: "VERIFIED_EMPTY",
            // authenticity omitted — APPROVED alone insufficient
          },
        },
        reviewerAuthorization: {
          required: true,
          actorId: "counsel-1",
          role: "COUNSEL_REVIEWER",
          trustedIssuerAuth: productionTrustedIssuerAuth([
            sessionCounselPrincipal("counsel-1"),
          ]),
        },
      }),
    );
    expect(result.productionAuthority).toBe("PRODUCTION_AUTHORITY_BLOCKED");
    expect(result.executionStatus).not.toBe("EXECUTED_SATISFIED");
    expect(result.capacityEffects.remainingPublicationAllowed).toBe(false);
    expect(
      result.blockers.some((b) => /incomplete|authenticity|utilization/i.test(b)),
    ).toBe(true);
  });

  it("product handoff: Position / Ask / Simulate share additive contract", async () => {
    const r = ruleOf("p-hand", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-hand", {
        allowHypotheticalFinancials: true,
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
        reviewerAuthorization: { required: false, actorId: null, role: null },
        utilization: {
          capacityRuleId: "p-hand",
          records: [],
          completenessCertificate: {
            ...emptyUtilCert("p-hand"),
            authenticity: "SYNTHETIC_LABELED",
            issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
          },
          allowSyntheticRemaining: true,
        },
      }),
    );
    const all = toAllProductExecutionHandoffs(result);
    expect(all.POSITION.contractVersion).toBe(UNIFIED_TRANSACTION_EXECUTION_VERSION);
    expect(all.ASK.traceId).toBe(all.SIMULATE.traceId);
    expect(all.POSITION.executable).toBe(true);
    expect(all.ASK.productionAuthority).toBe("HYPOTHETICAL_ONLY");
    const one = toProductExecutionHandoff(result, "SIMULATE");
    expect(one.selectedPathId).toBe("path:p-hand");
  });

  it("capacity arithmetic matches direct evaluateVerifiedCapacity (no duplicate solver)", async () => {
    const r = ruleOf("p-parity", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const req = baseRequest(pkg, "p-parity", {
      allowHypotheticalFinancials: true,
      financialEvidence: {
        metrics: [
          metric({
            metricKey: "CONSOLIDATED_EBITDA",
            value: 1,
            authenticity: "SYNTHETIC_LABELED",
          }),
        ],
        requiredMetricKeys: [],
      },
      reviewerAuthorization: { required: false, actorId: null, role: null },
      utilization: {
        capacityRuleId: "p-parity",
        records: [],
        completenessCertificate: {
          ...emptyUtilCert("p-parity"),
          authenticity: "SYNTHETIC_LABELED",
          issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
        },
        allowSyntheticRemaining: true,
      },
    });
    const orch = await executeUnifiedVerifiedTransaction(req);
    const direct = evaluateVerifiedCapacity({
      package: pkg,
      inputs: req.inputs,
      ledger: [],
      asOf: WHEN,
    });
    expect(orch.verified.capacity?.outcome).toBe("EXECUTED");
    expect(direct.outcome).toBe("EXECUTED");
    if (
      orch.verified.capacity?.outcome === "EXECUTED" &&
      direct.outcome === "EXECUTED"
    ) {
      expect(orch.verified.capacity.state.stateHash).toBe(direct.state.stateHash);
      expect(orch.postStateIdentity.packageHash).toBe(direct.packageHash);
    }
  });
});

const PROMOTION_INCOMPLETE_SUMMARY =
  "incomplete operative production promotion — caveats/CP refuse PRODUCTION_AUTHORITY";

describe("authority summary — productionPromotion.productionAuthorityActive ternary", () => {
  it("inactive promotion: human-readable summary discloses incomplete promotion; surfaces agree", async () => {
    const r = ruleOf("p-sum-inactive", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-sum-inactive", {
        mode: "PRODUCTION_AUTHORITY",
        operativeSourceAuthority: operative({
          // #283 caveated class — promotion inactive; unproven CP disclosed
          governingAuthorityClassification: "CONFIRMED_OPERATIVE_WITH_CAVEATS",
          conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN",
          operativeCaveats: [
            "CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN",
          ],
          // Keep #274 handoff CONFIRMED so the summary loop is reached via
          // promotion inactivity (not only operative.ok refusal).
          authorityClassification: "CONFIRMED_OPERATIVE",
        }),
        reviewerAuthorization: {
          required: true,
          actorId: "counsel-1",
          role: "COUNSEL_REVIEWER",
          trustedIssuerAuth: productionTrustedIssuerAuth([
            sessionCounselPrincipal("counsel-1"),
          ]),
        },
      }),
    );

    expect(result.operativeAuthority.productionPromotion.productionAuthorityActive).toBe(
      false,
    );
    expect(result.productionAuthority).toBe("PRODUCTION_AUTHORITY_BLOCKED");
    expect(result.productionAuthority).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
    // Human-readable incomplete-authority summary must match inactive state.
    expect(result.blockers).toContain(PROMOTION_INCOMPLETE_SUMMARY);
    expect(
      result.blockers.some((b) =>
        /CONDITIONS_PRECEDENT|NOT_INDEPENDENTLY_PROVEN|WITH_CAVEATS|caveats\/CP/i.test(
          b,
        ),
      ),
    ).toBe(true);
    expect(result.note).not.toMatch(/production-authoritative verified transaction/i);

    const handoffs = toAllProductExecutionHandoffs(result);
    expect(handoffs.POSITION.traceId).toBe(handoffs.ASK.traceId);
    expect(handoffs.ASK.traceId).toBe(handoffs.SIMULATE.traceId);
    for (const surface of ["POSITION", "ASK", "SIMULATE"] as const) {
      expect(handoffs[surface].productionAuthority).toBe("PRODUCTION_AUTHORITY_BLOCKED");
      expect(handoffs[surface].blockers).toContain(PROMOTION_INCOMPLETE_SUMMARY);
      expect(handoffs[surface].authorityNote).toMatch(/BLOCKED|Hypothetical/i);
      expect(handoffs[surface].authorityNote).not.toMatch(
        /^Production-authoritative verified transaction result\./,
      );
    }
  });

  it("active promotion: summary omits incomplete-promotion text when other gates fail", async () => {
    const r = ruleOf("p-sum-active", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-sum-active", {
        mode: "PRODUCTION_AUTHORITY",
        operativeSourceAuthority: operative({
          authorityClassification: "CONFIRMED_OPERATIVE",
          governingAuthorityClassification: "CONFIRMED_OPERATIVE",
          conditionsPrecedentSatisfaction: null,
          operativeCaveats: [],
        }),
        // Incomplete utilization forces the incomplete-authority summary loop
        // while operative promotion remains active.
        utilization: {
          capacityRuleId: "p-sum-active",
          records: [],
          completenessCertificate: null,
        },
        reviewerAuthorization: {
          required: true,
          actorId: "counsel-1",
          role: "COUNSEL_REVIEWER",
          trustedIssuerAuth: productionTrustedIssuerAuth([
            sessionCounselPrincipal("counsel-1"),
          ]),
        },
      }),
    );

    expect(result.operativeAuthority.ok).toBe(true);
    expect(result.operativeAuthority.productionPromotion.productionAuthorityActive).toBe(
      true,
    );
    expect(result.productionAuthority).toBe("PRODUCTION_AUTHORITY_BLOCKED");
    expect(result.blockers).toContain(
      "incomplete utilization authority — no favorable PRODUCTION_AUTHORITY result",
    );
    // Must NOT describe promotion as incomplete when it is actually active.
    expect(result.blockers).not.toContain(PROMOTION_INCOMPLETE_SUMMARY);

    const handoffs = toAllProductExecutionHandoffs(result);
    expect(handoffs.POSITION.traceId).toBe(handoffs.SIMULATE.traceId);
    expect(handoffs.ASK.blockers).not.toContain(PROMOTION_INCOMPLETE_SUMMARY);
    expect(handoffs.SIMULATE.productionAuthority).toBe("PRODUCTION_AUTHORITY_BLOCKED");
  });

  it("hypothetical SATISFIED never becomes production-authoritative in handoff prose", async () => {
    const r = ruleOf("p-sum-hypo", MONEY(25_000_000) as IRCapacityExpression);
    const pkg = pkgOf([r]);
    const result = await executeUnifiedVerifiedTransaction(
      baseRequest(pkg, "p-sum-hypo", {
        mode: "HYPOTHETICAL",
        allowHypotheticalFinancials: true,
        operativeSourceAuthority: operative({
          authorityClassification: "CONFIRMED_OPERATIVE",
          governingAuthorityClassification: "CONFIRMED_OPERATIVE",
          conditionsPrecedentSatisfaction: null,
          operativeCaveats: [],
        }),
        financialEvidence: {
          metrics: [
            metric({
              metricKey: "CONSOLIDATED_EBITDA",
              value: 1,
              authenticity: "SYNTHETIC_LABELED",
            }),
          ],
          requiredMetricKeys: [],
        },
        reviewerAuthorization: { required: false, actorId: null, role: null },
        utilization: {
          capacityRuleId: "p-sum-hypo",
          records: [],
          completenessCertificate: {
            ...emptyUtilCert("p-sum-hypo"),
            authenticity: "SYNTHETIC_LABELED",
            issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
          },
          allowSyntheticRemaining: true,
        },
      }),
    );
    expect(result.executionStatus).toBe("EXECUTED_HYPOTHETICAL");
    expect(result.productionAuthority).toBe("HYPOTHETICAL_ONLY");
    expect(result.blockers).not.toContain(PROMOTION_INCOMPLETE_SUMMARY);
    const handoffs = toAllProductExecutionHandoffs(result);
    for (const surface of ["POSITION", "ASK", "SIMULATE"] as const) {
      expect(handoffs[surface].productionAuthority).toBe("HYPOTHETICAL_ONLY");
      expect(handoffs[surface].authorityNote).toMatch(/Hypothetical/i);
      expect(handoffs[surface].authorityNote).not.toMatch(
        /^Production-authoritative verified transaction result\./,
      );
    }
  });
});
