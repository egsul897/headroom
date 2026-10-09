/**
 * Hand-built FIXTURE_IR VerifiedExecutionPackage for SYNTHETIC demo comparison.
 *
 * Not authentic customer IR. Not Phase 3 certified customer work product.
 * Verification artifacts are test-constructed STRONG identities with
 * VERIFIED_NO_MATERIAL_GAP_FOUND — same pattern as verified-execution.test.ts /
 * product-acceptance runtime-f (PRODUCTION runtime over FIXTURE IR).
 *
 * Product may import verified-execution + north-star-bridge only — never runtime/*.
 */
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type {
  IRCapacityExpression,
  IRExpression,
  IRRule,
  IRSharedCapacity,
} from "@/lib/contract-model/ir/types";
import {
  CONMED_FORM_INSPIRED_CERT,
  InMemoryApprovedSnapshotStore,
  InMemoryContractLedgerStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
  snapshotInputResolver,
  type LedgerUsageRecord,
} from "@/lib/contract-model/north-star-bridge";
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
import {
  DEMO_COMPANY_ID,
  DEMO_INSTRUMENT_KEY,
  DEMO_IR_LABEL,
  type DemoExercise,
} from "./demo-exercises";

export const FIXTURE_IR_LABEL = DEMO_IR_LABEL;
export const FIXTURE_DOC_ID = "synthetic-credit-agreement";

const STRONG = {
  irSchemaVersion: "fixture-demo-v1",
  compilerVersion: "fixture-compiler-v1",
  sourceContentVersion: "fixture-source-v1",
} as const;

let exprN = 0;
const nid = () => `fixture-expr-${++exprN}`;

const MONEY = (amount: number): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency: "USD",
  exprId: nid(),
});
const PCT = (value: number): IRExpression => ({
  kind: "PERCENT",
  type: "PERCENT",
  value,
  exprId: nid(),
});
const FIGURE = (metricName: string): IRExpression =>
  ({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName,
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    resolvedDefinitionId: null,
    exprId: nid(),
  }) as IRExpression;
const MUL = (...operands: IRExpression[]): IRExpression => ({
  kind: "MULTIPLY",
  type: "MONEY",
  operands,
  exprId: nid(),
});

function capacityFor(
  flatUsd: number | null,
  ebitdaPct: number | null,
): IRCapacityExpression {
  if (flatUsd != null) return MONEY(flatUsd) as IRCapacityExpression;
  if (ebitdaPct != null) {
    return MUL(PCT(ebitdaPct), FIGURE("Consolidated EBITDA")) as IRCapacityExpression;
  }
  throw new Error("FIXTURE_IR rule needs flatUsd or ebitdaPct");
}

function buildRule(def: DemoExercise["fixtureIr"]["rules"][number]): IRRule {
  return {
    ruleId: def.ruleId,
    irSchemaVersion: STRONG.irSchemaVersion,
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    sourceDocumentId: FIXTURE_DOC_ID,
    sourceSectionRef: def.sectionRef,
    covenantFamily: def.family,
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: def.action,
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: capacityFor(def.flatUsd, def.ebitdaPct),
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: FIXTURE_DOC_ID,
      sourceNodeKey: null,
      sourceCitation: `Section ${def.sectionRef} (SYNTHETIC · FIXTURE_IR)`,
      excerpt: `[FIXTURE_IR] ${def.sectionRef}`,
    },
    compilerVersion: STRONG.compilerVersion,
    sourceContentVersion: STRONG.sourceContentVersion,
  };
}

function buildShared(
  def: NonNullable<DemoExercise["fixtureIr"]["sharedCapacity"]>,
): IRSharedCapacity {
  return {
    sharedCapId: def.sharedCapId,
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    description: def.description,
    capExpression: MONEY(def.flatUsd) as IRCapacityExpression,
    memberRuleIds: [...def.memberRuleIds],
    provenance: {
      documentId: FIXTURE_DOC_ID,
      sourceNodeKey: null,
      sourceCitation: "Sections (SYNTHETIC shared pool)",
      excerpt: def.description,
    },
    irSchemaVersion: STRONG.irSchemaVersion,
    compilerVersion: STRONG.compilerVersion,
    sourceContentVersion: STRONG.sourceContentVersion,
  };
}

function identityOf(u: {
  ruleId?: string;
  sharedCapId?: string;
  companyId: string;
  instrumentKey: string;
  irSchemaVersion?: string;
  compilerVersion?: string | null;
  sourceContentVersion?: string | null;
}): VerifiedUnitArtifact["verifiedIdentity"] {
  return {
    ruleOrDefinitionId: u.ruleId ?? u.sharedCapId!,
    companyId: u.companyId,
    instrumentKey: u.instrumentKey,
    irSchemaVersion: u.irSchemaVersion ?? "",
    compilerVersion: u.compilerVersion ?? null,
    sourceContentVersion: u.sourceContentVersion ?? null,
  };
}

function cleanResult(over: {
  irInventoryItems?: SemanticVerificationResult["irInventory"]["items"];
} = {}): SemanticVerificationResult {
  return {
    candidateRef: "synth-fixture-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    sourceInventory: { items: [] },
    irInventory: {
      candidateRef: "synth-fixture-cand",
      items: over.irInventoryItems ?? [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "fixture-demo-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "FIXTURE_IR demo — no live verifier",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "fixture-demo-verifier-v1",
    verifiedAt: "2026-07-01T00:00:00.000Z",
    evidenceSetHash: "fixture-eh-demo",
  } as unknown as SemanticVerificationResult;
}

function artifactForRule(u: IRRule): VerifiedUnitArtifact {
  return {
    ruleOrDefinitionId: u.ruleId,
    kind: "RULE",
    verifiedIdentity: identityOf(u),
    result: cleanResult(),
  };
}

/** Shared-capacity artifact must carry IR inventory figures + SHARED_CAP_MEMBER:* rows. */
function artifactForShared(cap: IRSharedCapacity): VerifiedUnitArtifact {
  const items = [
    {
      itemId: `${cap.sharedCapId}:amount`,
      kind: "AMOUNT" as const,
      ruleOrDefinitionId: cap.sharedCapId,
      irPath: "sharedCapacities[0].capExpression",
      numericValue:
        cap.capExpression && "amount" in cap.capExpression
          ? (cap.capExpression as { amount: number }).amount
          : null,
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
    verifiedIdentity: identityOf(cap),
    result: cleanResult({ irInventoryItems: items }),
  };
}

export type FixtureVerifiedPackage = VerifiedExecutionPackage & {
  label: typeof FIXTURE_IR_LABEL;
  note: string;
};

/**
 * Build a small VerifiedExecutionPackage (rules + matching
 * VERIFIED_NO_MATERIAL_GAP_FOUND artifacts) for a SYNTHETIC company.
 * Optionally includes debt general + RP + shared RP/Investment capacity.
 */
export function buildFixtureVerifiedPackage(
  exercise: DemoExercise,
): FixtureVerifiedPackage | { blocked: true; reason: string } {
  if (exercise.fixtureIr.blockVerifiedPackage) {
    return {
      blocked: true,
      reason:
        exercise.fixtureIr.blockReason ??
        "NO_VERIFIED_EXECUTION_PACKAGE",
    };
  }
  const rules = exercise.fixtureIr.rules.map(buildRule);
  if (rules.length === 0) {
    return { blocked: true, reason: "NO_VERIFIED_EXECUTION_PACKAGE" };
  }
  const shared = exercise.fixtureIr.sharedCapacity
    ? buildShared(exercise.fixtureIr.sharedCapacity)
    : null;
  const verifications: VerifiedUnitArtifact[] = [
    ...rules.map(artifactForRule),
    ...(shared ? [artifactForShared(shared)] : []),
  ];
  for (const a of verifications) {
    if (
      !a.verifiedIdentity.compilerVersion ||
      !a.verifiedIdentity.sourceContentVersion ||
      !a.verifiedIdentity.irSchemaVersion
    ) {
      return {
        blocked: true,
        reason: "NO_VERIFIED_EXECUTION_PACKAGE / incomplete verification identity",
      };
    }
  }
  return {
    label: FIXTURE_IR_LABEL,
    note:
      "FIXTURE_IR — hand-built SYNTHETIC VerifiedExecutionPackage; not Phase 3 certified customer IR",
    companyId: DEMO_COMPANY_ID,
    instrumentKey: DEMO_INSTRUMENT_KEY,
    rules,
    definitions: [],
    sharedCapacities: shared ? [shared] : [],
    verifications,
  };
}

/** Seed in-memory APPROVED snapshot (CONMED-form-inspired cert) + attributed ledger. */
export function seedFixtureApprovedWorld(exercise: DemoExercise): {
  snapshots: ReturnType<InMemoryApprovedSnapshotStore["getSnapshots"]>;
  ledger: LedgerUsageRecord[];
} {
  const snapStore = new InMemoryApprovedSnapshotStore();
  const ledgerProposals = new LedgerProposalRecorder();
  const proposed = proposeFromCertificate(
    snapStore,
    CONMED_FORM_INSPIRED_CERT,
    ledgerProposals,
  );
  if (!proposed.ok) {
    throw new Error(`SYNTHETIC cert propose failed: ${JSON.stringify(proposed)}`);
  }
  const approved = approveCertificateProposal(snapStore, {
    snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
    reviewedBy: "synth-demo-reviewer",
    reviewedAt: "2026-07-20T12:00:00Z",
    approvalRef: `apr-synth-demo-${exercise.id}`,
    sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
    sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
    proposerKind: "human",
  });
  if (!approved.ok) {
    throw new Error(`SYNTHETIC cert approve failed: ${JSON.stringify(approved)}`);
  }

  const contractLedger = new InMemoryContractLedgerStore();
  for (const u of exercise.fixtureIr.ledgerUsages) {
    const write = contractLedger.appendUsage({
      usage: {
        usageId: u.usageId,
        companyId: DEMO_COMPANY_ID,
        instrumentKey: DEMO_INSTRUMENT_KEY,
        effectiveAsOf: u.effectiveAsOf,
        amount: { amount: String(u.amountUsd), currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: u.ruleId },
        transactionRef: `synth-hist-${u.usageId}`,
        status: "RECORDED",
        supersededByUsageId: null,
        provenance: {
          source: `SYNTHETIC demo ledger:${exercise.id}`,
          sourceVersion: CONMED_FORM_INSPIRED_CERT.versionHash,
          approvalRef: `apr-synth-demo-${exercise.id}`,
          approvalState: "APPROVED",
        },
      },
    });
    if (!write.ok) {
      throw new Error(`SYNTHETIC ledger append failed: ${JSON.stringify(write)}`);
    }
  }

  return {
    snapshots: snapStore.getSnapshots(DEMO_COMPANY_ID),
    ledger: contractLedger.getActiveUsages(DEMO_COMPANY_ID),
  };
}

export interface FixtureCertifiedRun {
  irLabel: typeof FIXTURE_IR_LABEL;
  blocked: boolean;
  blocker: string | null;
  package: FixtureVerifiedPackage | null;
  capacity: VerifiedCapacityResult | null;
  simulation: VerifiedTransactionResult | null;
}

function moneyCapNode(ruleId: string): string {
  return `capacity:rule:${ruleId}`;
}

/**
 * Run FIXTURE_IR through product bridges only:
 * north-star-bridge (snapshot/ledger/resolver) + verified-execution REQUIRE.
 */
export function runFixtureCertifiedPath(exercise: DemoExercise): FixtureCertifiedRun {
  const built = buildFixtureVerifiedPackage(exercise);
  if ("blocked" in built && built.blocked) {
    return {
      irLabel: FIXTURE_IR_LABEL,
      blocked: true,
      blocker: built.reason,
      package: null,
      capacity: null,
      simulation: null,
    };
  }
  const pkg = built as FixtureVerifiedPackage;
  const { snapshots, ledger } = seedFixtureApprovedWorld(exercise);
  const inputs = snapshotInputResolver({
    snapshots: [...snapshots],
    definitions: [...(pkg.definitions ?? [])],
    rules: [...pkg.rules],
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });

  const capacity = evaluateVerifiedCapacity({
    package: pkg,
    inputs,
    ledger,
    asOf: exercise.applicableCutoff.evaluationDate,
  });

  let simulation: VerifiedTransactionResult | null = null;
  const consume = exercise.fixtureIr.simulateConsumeUsd;
  if (
    capacity.outcome === "EXECUTED" &&
    consume &&
    pkg.rules[0]
  ) {
    const ruleId = pkg.rules[0].ruleId;
    const transaction: HypotheticalTransaction = {
      transactionId: `tx-fixture-${exercise.id}`,
      companyId: DEMO_COMPANY_ID,
      instrumentKey: DEMO_INSTRUMENT_KEY,
      effectiveAsOf: exercise.applicableCutoff.evaluationDate,
      category: null,
      label: `FIXTURE_IR simulate consume ${consume}`,
      effects: [
        {
          effectId: "e1",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: moneyCapNode(ruleId),
          amount: { type: "MONEY", amount: consume, currency: "USD" },
        },
      ],
      provenance: {
        source: "FIXTURE_IR demo simulation",
        sourceVersion: "1",
        approvalRef: null,
      },
    };
    const selectedPath: SelectedPath = {
      capacityNodeIds: [moneyCapNode(ruleId)],
      ruleIds: [ruleId],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    };
    simulation = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger,
      asOf: exercise.applicableCutoff.evaluationDate,
      transaction,
      selectedPath,
    });
  }

  if (capacity.outcome === "REFUSED") {
    return {
      irLabel: FIXTURE_IR_LABEL,
      blocked: true,
      blocker: `VERIFIED_CAPACITY_REFUSED:${capacity.refusals.map((r) => r.code).join(",") || "unknown"}`,
      package: pkg,
      capacity,
      simulation: null,
    };
  }

  return {
    irLabel: FIXTURE_IR_LABEL,
    blocked: false,
    blocker: null,
    package: pkg,
    capacity,
    simulation,
  };
}

export function moneyAmountOf(a: {
  kind: string;
  value?: { type?: string; amount?: string };
} | null | undefined): number | null {
  if (!a || a.kind !== "AMOUNT" || a.value?.type !== "MONEY") return null;
  const n = Number(a.value.amount);
  return Number.isFinite(n) ? n : null;
}
