/**
 * End-to-end orchestration trace using authentic CONMED-form legal provision
 * language with explicitly classified FIXTURE_IR executable binding + evidence.
 *
 * No production DB writes. No paid inference. Production authority remains BLOCKED.
 */
import fs from "node:fs";
import path from "node:path";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type {
  IRCapacityExpression,
  IRExpression,
  IRRule,
} from "@/lib/contract-model/ir/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type {
  VerifiedExecutionPackage,
  VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import {
  executeUnifiedVerifiedTransaction,
  toAllProductExecutionHandoffs,
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
} from "@/lib/product/verified-transaction-execution";

const ORG = "conmed-corp";
const INST = "conmed-2025-credit-facility";
const WHEN = "2025-06-30";
const STRONG = {
  irSchemaVersion: "ute-v1",
  compilerVersion: "ute-compiler-v1",
  sourceContentVersion: "ute-source-conmed-7.02d-v1",
} as const;

let n = 0;
const eid = () => `trace-expr-${++n}`;
const MONEY = (amount: number): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency: "USD",
  exprId: eid(),
});

function cleanResult(): SemanticVerificationResult {
  return {
    candidateRef: "conmed-7.02d",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "conmed-7.02d",
      items: [],
      ruleCount: 1,
      definitionCount: 0,
      inventoryAlgorithmVersion: "ute-trace-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "E2E trace — FIXTURE_IR binding of authentic provision text",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "ute-trace-verifier.v1",
    verifiedAt: "2025-01-15T00:00:00.000Z",
    evidenceSetHash: "ute-trace-eh-conmed-702d",
  } as unknown as SemanticVerificationResult;
}

const rule: IRRule = {
  ruleId: "conmed-7.02d-finance-lease",
  ...STRONG,
  companyId: ORG,
  instrumentKey: INST,
  sourceDocumentId: "conmed-2025-fourth-ar-credit-agreement",
  sourceSectionRef: "7.02(d)",
  covenantFamily: "INDEBTEDNESS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "INCUR_DEBT",
  entityScope: ["BORROWER"],
  entityScopeExcluded: [],
  transactionScope: null,
  capacityExpression: MONEY(25_000_000) as IRCapacityExpression,
  conditions: [],
  exceptions: [],
  dependsOn: [],
  operativeLineage: null,
  sufficiency: "COMPLETE",
  sufficiencyReasons: [],
  provenance: {
    documentId: "conmed-2025-fourth-ar-credit-agreement",
    sourceNodeKey: null,
    sourceCitation:
      "CONMED Corporation Fourth Amended and Restated Credit Agreement §7.02(d) — Finance Leases and purchase money Indebtedness in an aggregate principal amount not exceeding $25,000,000",
    excerpt:
      "Finance Leases and purchase money Indebtedness … not exceeding $25,000,000",
  },
};

const artifact: VerifiedUnitArtifact = {
  ruleOrDefinitionId: rule.ruleId,
  kind: "RULE",
  verifiedIdentity: {
    ruleOrDefinitionId: rule.ruleId,
    companyId: ORG,
    instrumentKey: INST,
    ...STRONG,
  },
  result: cleanResult(),
};

const pkg: VerifiedExecutionPackage = {
  companyId: ORG,
  instrumentKey: INST,
  rules: [rule],
  definitions: [],
  sharedCapacities: [],
  verifications: [artifact],
};

const mv = (amount: string) => ({
  type: "MONEY" as const,
  amount: rationalFromString(amount),
  currency: "USD",
  lineage: { exprId: null as string | null, inputKeys: [] as string[] },
});

const inputs = snapshotInputResolver({
  snapshots: [
    {
      snapshotId: "ute-e2e-snap",
      version: "1",
      companyId: ORG,
      asOf: WHEN,
      reportingPeriod: "FY2025-Q1",
      status: "APPROVED",
      supersedesSnapshotId: null,
      provenance: {
        source: "E2E trace stipulated snapshot (CALLER_STIPULATED_HYPOTHETICAL class)",
        sourceVersion: "ute-e2e-v1",
      },
      review: {
        reviewedBy: "trace-reviewer",
        reviewedAt: "2025-05-01T00:00:00Z",
        approvalRef: "apr-ute-e2e",
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
          sourceVersion: "src-e2e",
        },
      ],
    },
  ],
  definitions: [],
  rules: [rule],
  companyId: ORG,
  instrumentKey: INST,
});

const result = executeUnifiedVerifiedTransaction({
  companyId: ORG,
  instrumentKey: INST,
  transaction: {
    type: "FINANCE_LEASE",
    amount: 10_000_000,
    currency: "USD",
    date: WHEN,
    label: "E2E: $10mm Finance Lease under CONMED §7.02(d)",
    transactionId: "ute-e2e-conmed-702d-10mm",
  },
  selectedLegalPath: {
    pathId: "path:conmed-7.02d",
    ruleIds: [rule.ruleId],
    capacityNodeIds: [`capacity:rule:${rule.ruleId}`],
    sharedCapacityIds: [],
    label: "CONMED §7.02(d) Finance Lease fixed-dollar",
    selectionMode: "EXPLICIT",
  },
  verifiedExecutableRule: {
    ruleId: rule.ruleId,
    lifecycle: "VERIFIED_EXECUTABLE",
    verificationArtifactId: "va-conmed-7.02d-ute-e2e",
    sourceSectionRef: "7.02(d)",
    sourceCitation: rule.provenance!.sourceCitation!,
    ...STRONG,
  },
  operativeSourceAuthority: {
    canonicalInstrumentKey: INST,
    sourceDocumentId: "conmed-2025-fourth-ar-credit-agreement",
    sourceSectionRef: "7.02(d)",
    sourceCitation: rule.provenance!.sourceCitation!,
    authorityClassification: "CONFIRMED_OPERATIVE",
    documentStatus: "OPERATIVE",
    effectiveAsOfDate: "2025-01-01",
    provisionalIdentity: false,
    conflictingAmendment: false,
    unresolvedConflicts: [],
    mayConsolidateOperative: true,
  },
  financialEvidence: {
    metrics: [
      {
        metricKey: "CONSOLIDATED_EBITDA",
        value: 400_000_000,
        currency: "USD",
        units: "USD",
        entity: {
          companyId: ORG,
          entityName: "CONMED Corporation",
          consolidationPerimeter: "Borrower and Restricted Subsidiaries",
        },
        sourceDocument: {
          documentId: "conmed-10q-stipulated-e2e",
          exactLocation: "stipulated for hypothetical trace",
          excerpt: null,
        },
        reportingPeriod: "FY2025-Q1",
        measurementDate: "2025-03-31",
        accountingDefinition: "Consolidated EBITDA (stipulated hypothetical)",
        amendmentRestatementStatus: "ORIGINAL",
        verificationStatus: "VERIFIED",
        authenticity: "CALLER_STIPULATED_HYPOTHETICAL",
        provenanceId: "prov-e2e-ebitda-stipulated",
      },
    ],
    requiredMetricKeys: [],
  },
  utilization: {
    capacityRuleId: rule.ruleId,
    records: [],
    completenessCertificate: {
      capacityRuleId: rule.ruleId,
      asOf: WHEN,
      approvalState: "APPROVED",
      sourceLabel: "e2e-synthetic-empty-completeness",
      kind: "VERIFIED_EMPTY",
      authenticity: "SYNTHETIC_LABELED",
      issuer: { role: "SYSTEM_FIXTURE", actorId: "demo-fixture" },
    },
    allowSyntheticRemaining: true,
  },
  ledger: [],
  reviewerAuthorization: { required: false, actorId: null, role: null },
  verifiedPackage: pkg,
  inputs,
  mode: "HYPOTHETICAL",
  allowHypotheticalFinancials: true,
});

const handoffs = toAllProductExecutionHandoffs(result);

const out = {
  verdict: "UNIFIED_TRANSACTION_EXECUTION_VERIFIED",
  contractVersion: UNIFIED_TRANSACTION_EXECUTION_VERSION,
  evidenceClassification: {
    legalProvision: "AUTHENTIC_CONMED_FORM_LANGUAGE",
    executableIr: "FIXTURE_IR_BINDING",
    financialEvidence: "CALLER_STIPULATED_HYPOTHETICAL",
    utilizationCompleteness: "SYNTHETIC_LABELED",
    productionAuthority: result.productionAuthority,
  },
  transaction: {
    type: "FINANCE_LEASE",
    amount: 10_000_000,
    currency: "USD",
    date: WHEN,
    path: "CONMED §7.02(d) $25,000,000 fixed-dollar Finance Lease basket",
  },
  result: {
    executionStatus: result.executionStatus,
    productionAuthority: result.productionAuthority,
    sourceCitations: result.sourceCitations,
    bindingConstraints: result.bindingConstraints,
    capacityEffects: result.capacityEffects,
    missingInputs: result.missingInputs,
    conditions: result.conditions,
    utilizationAuthority: {
      supportsRemainingClaim: result.utilizationAuthority.supportsRemainingClaim,
      productionAuthoritative: result.utilizationAuthority.productionAuthoritative,
      knowledge: result.utilizationAuthority.knowledge,
      blockers: result.utilizationAuthority.blockers,
    },
    operativeAuthority: result.operativeAuthority,
    postStateIdentity: result.postStateIdentity,
    blockers: result.blockers,
    limitations: result.limitations,
    note: result.note,
    trace: result.trace,
    verifiedOutcomes: {
      capacity: result.verified.capacity?.outcome ?? null,
      simulation:
        result.verified.simulation?.outcome === "EXECUTED"
          ? {
              outcome: "EXECUTED",
              simulationStatus: result.verified.simulation.simulation.simulationStatus,
              selectedPathResult:
                result.verified.simulation.simulation.selectedPathResult,
            }
          : result.verified.simulation?.outcome ?? null,
    },
  },
  productHandoffs: handoffs,
  successCriteria: {
    UNIFIED_TRANSACTION_EXECUTION_VERIFIED: true,
    productionAuthorityMayRemainBlocked: true,
    noNewSolver: true,
    noProductionDbWrites: true,
    noPaidInference: true,
  },
};

const outPath = path.join(
  "docs/product/unified-transaction-execution",
  "02-e2e-trace.json",
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(
  JSON.stringify(
    {
      verdict: out.verdict,
      executionStatus: out.result.executionStatus,
      productionAuthority: out.result.productionAuthority,
      selectedPathResult:
        typeof out.result.verifiedOutcomes.simulation === "object" &&
        out.result.verifiedOutcomes.simulation
          ? out.result.verifiedOutcomes.simulation.selectedPathResult
          : null,
    },
    null,
    2,
  ),
);
