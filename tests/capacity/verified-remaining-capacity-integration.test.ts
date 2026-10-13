/**
 * Agent 2 — verified remaining capacity integration (adversarial acceptance).
 *
 * Ten independent cases. In-memory / disposable fixtures only — no production Neon.
 * Contractual ceiling ≠ remaining borrowing capacity.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateVerifiedRemainingCapacity,
  projectFinancialSnapshotsFromSelection,
  selectFinancialState,
  TRUSTED_ISSUER_ACTIVATION,
  type FinancialEvidenceCandidate,
  type FinancialEvidenceCatalog,
  type HistoricalUtilizationEvent,
} from "@/lib/capacity";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";
import type { FinancialMetricEvidence } from "@/lib/capacity/financial-evidence";
import {
  AS_OF,
  CO,
  INST,
  MONEY,
  METRIC,
  MUL,
  NUM,
  rule,
  sharedCap,
  resetIds,
} from "@/tests/contract-model/runtime/capacity/helpers";
import type { IRRule, IRSharedCapacity } from "@/lib/contract-model/ir/types";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import type { VerifiedUnitArtifact } from "@/lib/contract-model/verified-execution";

/** STRONG identity required for shared-capacity verification at the boundary. */
const STRONG = { compilerVersion: "c1", sourceContentVersion: "s1" } as const;

function strongRule(r: IRRule): IRRule {
  return { ...r, ...STRONG };
}

function strongShared(s: IRSharedCapacity): IRSharedCapacity {
  return { ...s, irSchemaVersion: s.irSchemaVersion ?? "t", ...STRONG };
}

function cleanVerificationResult(
  over: {
    irInventoryItems?: NonNullable<SemanticVerificationResult["irInventory"]>["items"];
  } = {},
): SemanticVerificationResult {
  return {
    candidateRef: "capacity-cand",
    status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
    findings: [],
    irInventory: {
      candidateRef: "capacity-cand",
      items: over.irInventoryItems ?? [],
      ruleCount: 0,
      definitionCount: 0,
      inventoryAlgorithmVersion: "capacity-ir-inventory.v1",
    },
    reconciliation: { items: [] },
    semanticReviewInvoked: false,
    semanticReviewSkippedReason: "capacity fixture — paired artifact for REQUIRE boundary",
    conditionSuspicion: null,
    verifierAlgorithmVersion: "capacity-verifier-v1",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    evidenceSetHash: "capacity-eh-1",
  } as unknown as SemanticVerificationResult;
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
    result: cleanVerificationResult(),
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
    result: cleanVerificationResult({ irInventoryItems: items }),
  };
}

/** Build Agent-1 handoff with paired verification artifacts for REQUIRE boundary. */
function verifiedHandoff(
  rules: IRRule[],
  shared: IRSharedCapacity[] = [],
): {
  companyId: string;
  instrumentKey: string;
  rules: IRRule[];
  sharedCapacities: IRSharedCapacity[];
  verifications: VerifiedUnitArtifact[];
  verificationComplete: true;
} {
  const strongRules = rules.map(strongRule);
  const strongSharedCaps = shared.map(strongShared);
  return {
    companyId: CO,
    instrumentKey: INST,
    rules: strongRules,
    sharedCapacities: strongSharedCaps,
    verifications: [
      ...strongRules.map(artifactForRule),
      ...strongSharedCaps.map(artifactForShared),
    ],
    verificationComplete: true,
  };
}

const CURRENCY = "USD";
const PERIOD = "FY2025-Q1";
const RULE_A = "basket-a";
const RULE_B = "basket-b";
const SHARED = "shared-pool-1";

function metric(
  over: Partial<FinancialMetricEvidence> &
    Pick<FinancialMetricEvidence, "metricKey" | "value">,
): FinancialMetricEvidence {
  return {
    currency: CURRENCY,
    units: "USD",
    entity: {
      companyId: CO,
      entityName: "Borrower",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: {
      documentId: "10-Q-2025-Q1",
      exactLocation: "Item 1 / Consolidated Statements",
    },
    reportingPeriod: PERIOD,
    measurementDate: AS_OF,
    accountingDefinition: "contract Consolidated EBITDA",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "VERIFIED",
    authenticity: "SYNTHETIC_LABELED",
    provenanceId: `prov-${over.metricKey}-${over.value}`,
    ...over,
  };
}

function candidate(
  evidenceId: string,
  m: FinancialMetricEvidence,
  over: Partial<FinancialEvidenceCandidate> = {},
): FinancialEvidenceCandidate {
  return {
    evidenceId,
    metric: m,
    approvalStatus: "APPROVED",
    persisted: true,
    legalEntityKey: "Borrower",
    ...over,
  };
}

function catalog(...candidates: FinancialEvidenceCandidate[]): FinancialEvidenceCatalog {
  return { companyId: CO, candidates };
}

function fixedRule(ruleId: string, amount: number) {
  return rule(ruleId, MONEY(amount, CURRENCY));
}

function ebitdaGrower(ruleId: string, fraction: number) {
  return rule(ruleId, MUL(NUM(fraction), METRIC("Consolidated EBITDA", "MONEY", CO, INST)));
}

function event(
  over: Partial<HistoricalUtilizationEvent> &
    Pick<HistoricalUtilizationEvent, "eventId" | "kind" | "amount">,
): HistoricalUtilizationEvent {
  return {
    currency: CURRENCY,
    effectiveDate: "2026-01-15",
    applicableProvisionId: RULE_A,
    entityKey: "Borrower",
    sourceLabel: "test-ledger",
    authenticity: "SYNTHETIC_LABELED",
    approvalState: "APPROVED",
    supersession: "NONE",
    ...over,
  };
}

function syntheticCompleteness(
  ruleId: string,
  kind: "VERIFIED_EMPTY" | "VERIFIED_COMPLETE" = "VERIFIED_COMPLETE",
) {
  return {
    capacityRuleId: ruleId,
    asOf: AS_OF,
    approvalState: "APPROVED" as const,
    sourceLabel: "synthetic-completeness-cert",
    kind,
    authenticity: "SYNTHETIC_LABELED" as const,
    issuer: {
      role: "SYSTEM_FIXTURE" as const,
      actorId: "fixture-issuer",
      attestedAt: `${AS_OF}T12:00:00Z`,
    },
  };
}

function baseEval(
  over: Partial<Parameters<typeof evaluateVerifiedRemainingCapacity>[0]> = {},
) {
  resetIds();
  const rules = [fixedRule(RULE_A, 100)];
  const defaultHandoff = verifiedHandoff(rules);
  const { executableRules: overRules, ...rest } = over;
  return evaluateVerifiedRemainingCapacity({
    companyId: CO,
    instrumentKey: INST,
    capacityRuleId: RULE_A,
    asOf: AS_OF,
    currency: CURRENCY,
    executableRules: overRules
      ? verifiedHandoff(
          [...(overRules.rules ?? defaultHandoff.rules)],
          [...(overRules.sharedCapacities ?? [])],
        )
      : defaultHandoff,
    financialCatalog: catalog(),
    requiredFinancialMetrics: [],
    utilizationEvents: [],
    completenessCertificate: null,
    allowSynthetic: true,
    ...rest,
  });
}

describe("Agent 2 verified remaining capacity integration", () => {
  it("1. empty ledger without completeness → no remaining (not zero unused)", () => {
    const result = baseEval();
    expect(result.grossContractualAmount).toBe(100);
    expect(result.historicalUtilization).toBeNull();
    expect(result.remainingAmount).toBeNull();
    expect(result.remainingSupported).toBe(false);
    expect(result.completenessAuthority).toBe("NO_UTILIZATION_RECORDS");
    expect(result.confidenceAuthority).toMatch(/GROSS_CONTRACTUAL_ONLY|FINANCIALLY_MODELED/);
    expect(result.blockers.some((b) => /empty ledger|no utilization/i.test(b))).toBe(true);
    expect(result.mayPublishProductionRemaining).toBe(false);
  });

  it("2. partially populated ledger → SOME records, remaining withheld", () => {
    // Path-targeted event lacking approval + a second unallocated observation → SOME, not reconciled.
    const result = baseEval({
      utilizationEvents: [
        event({
          eventId: "u-debt-1",
          kind: "DEBT_ISSUANCE",
          amount: 35,
          approvalState: "UNAPPROVED",
        }),
        event({
          eventId: "u-orphan",
          kind: "INVESTMENT",
          amount: 5,
          applicableProvisionId: null,
          legacyBasketFamily: null,
          sharedCapacityId: null,
        }),
      ],
      completenessCertificate: null,
    });
    expect(result.remainingAmount).toBeNull();
    expect(result.remainingSupported).toBe(false);
    expect(result.completenessAuthority).toBe("SOME_UTILIZATION_RECORDS");
    expect(result.confidenceAuthority).toBe("UTILIZATION_PARTIAL");
    // Gross ceiling still known — but not remaining.
    expect(result.grossContractualAmount).toBe(100);

    // Clean attributed reconstruction without completeness → RECONCILED, still no remaining.
    const reconciled = baseEval({
      utilizationEvents: [
        event({ eventId: "u-debt-2", kind: "DEBT_ISSUANCE", amount: 35 }),
      ],
      completenessCertificate: null,
    });
    expect(reconciled.completenessAuthority).toBe("RECONCILED_UTILIZATION_HISTORY");
    expect(reconciled.historicalUtilization).toBe(35);
    expect(reconciled.remainingAmount).toBeNull();
    expect(reconciled.remainingSupported).toBe(false);
  });

  it("3. approved versus unapproved financial evidence — persisted ≠ approved", () => {
    const ebitdaApproved = candidate(
      "fin-ebitda-approved",
      metric({ metricKey: "CONSOLIDATED_EBITDA", value: 200 }),
      { approvalStatus: "APPROVED" },
    );
    const ebitdaPersistedOnly = candidate(
      "fin-ebitda-draft",
      metric({ metricKey: "CONSOLIDATED_EBITDA", value: 999 }),
      { approvalStatus: "UNAPPROVED", persisted: true },
    );

    const refused = selectFinancialState(catalog(ebitdaPersistedOnly), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(refused.complete).toBe(false);
    expect(refused.metrics.CONSOLIDATED_EBITDA?.outcome).toBe("UNAPPROVED");
    expect(refused.metrics.CONSOLIDATED_EBITDA?.value).toBeNull();
    expect(refused.provenance.persistedButUnapprovedIds).toContain("fin-ebitda-draft");

    const selected = selectFinancialState(catalog(ebitdaPersistedOnly, ebitdaApproved), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(selected.complete).toBe(true);
    expect(selected.metrics.CONSOLIDATED_EBITDA?.value).toBe(200);

    // Grower path: unapproved-only catalog → financially modeled amount withheld
    const grower = baseEval({
      executableRules: {
        companyId: CO,
        instrumentKey: INST,
        rules: [ebitdaGrower(RULE_A, 0.25)],
      },
      financialCatalog: catalog(ebitdaPersistedOnly),
      requiredFinancialMetrics: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(grower.financiallyModeledAmount).toBeNull();
    expect(grower.remainingAmount).toBeNull();
    expect(grower.missingInputs.some((m) => /UNAPPROVED|CONSOLIDATED_EBITDA/i.test(m))).toBe(
      true,
    );
  });

  it("4. double consumption of shared capacity — cannot independently spend same pool", () => {
    resetIds();
    const rules = [fixedRule(RULE_A, 80), fixedRule(RULE_B, 80)];
    const shared: IRSharedCapacity[] = [
      sharedCap(SHARED, MONEY(100, CURRENCY), [RULE_A, RULE_B]),
    ];
    // Each basket elects 60 against the shared $100 pool → over-consumption.
    const events: HistoricalUtilizationEvent[] = [
      event({
        eventId: "u-a",
        kind: "DEBT_ISSUANCE",
        amount: 60,
        applicableProvisionId: RULE_A,
        sharedCapacityId: SHARED,
      }),
      event({
        eventId: "u-b",
        kind: "DEBT_ISSUANCE",
        amount: 60,
        applicableProvisionId: RULE_B,
        sharedCapacityId: SHARED,
      }),
    ];

    const resultA = evaluateVerifiedRemainingCapacity({
      companyId: CO,
      instrumentKey: INST,
      capacityRuleId: RULE_A,
      asOf: AS_OF,
      currency: CURRENCY,
      executableRules: verifiedHandoff(rules, shared),
      financialCatalog: catalog(),
      utilizationEvents: events,
      completenessCertificate: syntheticCompleteness(RULE_A),
      allowSynthetic: true,
    });

    const pool = resultA.artifacts.sharedConstraints.find((s) => s.sharedCapacityId === SHARED);
    expect(pool).toBeDefined();
    // Shared pool must bind — baskets do not each get independent $100 remaining.
    expect(resultA.bindingRestrictions.length).toBeGreaterThan(0);
    expect(
      resultA.bindingRestrictions.some(
        (r) =>
          r.sharedCapacityId === SHARED ||
          /shared/i.test(r.message) ||
          r.code.includes("SHARED") ||
          r.code.includes("OVER"),
      ) ||
        pool!.overConsumption != null ||
        pool!.status !== "AVAILABLE",
    ).toBe(true);

    // Even with completeness cert, over-consumed shared pool must not publish
    // a favorable independent remaining that ignores the co-member draw.
    if (resultA.remainingSupported && resultA.remainingAmount != null) {
      // Effective remaining after shared bind ≤ shared residual, not 80-60=20 in isolation
      // when pool is overdrawn.
      expect(pool!.overConsumption != null || resultA.remainingAmount <= 0 || !resultA.artifacts.verifiedRemaining?.mayPublishAvailable).toBe(true);
    }
  });

  it("5. reclassification and repayment preserve identity and reduce attributed usage", () => {
    const events: HistoricalUtilizationEvent[] = [
      event({
        eventId: "u-issue",
        kind: "DEBT_ISSUANCE",
        amount: 50,
        effectiveDate: "2025-06-01",
      }),
      event({
        eventId: "u-repay",
        kind: "REPAYMENT",
        amount: 20,
        effectiveDate: "2025-12-01",
        supersession: "SUPERSEDES_PRIOR",
        supersedesEventId: "u-issue",
      }),
      // After supersession of the original 50, a reclass into RULE_A of 15 remains.
      event({
        eventId: "u-reclass-in",
        kind: "RECLASSIFICATION",
        amount: 15,
        effectiveDate: "2026-02-01",
        supersession: "RECLASSIFIED_INTO",
        applicableProvisionId: RULE_A,
      }),
    ];

    const withCert = baseEval({
      utilizationEvents: events,
      completenessCertificate: syntheticCompleteness(RULE_A, "VERIFIED_COMPLETE"),
      allowSynthetic: true,
    });

    // Superseded issuance excluded; repayment supersedes it; reclass-in of 15 attributed.
    expect(withCert.artifacts.utilizationReconstruction).not.toBeNull();
    const attributedIds = withCert.artifacts.utilizationReconstruction!.usageAttributed.map(
      (u) => u.usageId,
    );
    expect(attributedIds).not.toContain("u-issue");
    expect(attributedIds).toContain("u-reclass-in");
    expect(withCert.provenance.utilizationEventIds).toEqual([
      "u-issue",
      "u-repay",
      "u-reclass-in",
    ]);
    // Chronology preserved in ledger bridge
    expect(withCert.provenance.ledgerUsageIds).toEqual(
      expect.arrayContaining(["u-issue", "u-repay", "u-reclass-in"]),
    );
  });

  it("6. superseded financial statements excluded from selection", () => {
    const oldSnap = candidate(
      "fin-old",
      metric({
        metricKey: "CONSOLIDATED_EBITDA",
        value: 50,
        amendmentRestatementStatus: "SUPERSEDED",
        measurementDate: "2025-12-31",
      }),
      {
        approvalStatus: "APPROVED",
        supersededByEvidenceId: "fin-new",
      },
    );
    const newSnap = candidate(
      "fin-new",
      metric({
        metricKey: "CONSOLIDATED_EBITDA",
        value: 200,
        amendmentRestatementStatus: "RESTATED",
        measurementDate: AS_OF,
      }),
      {
        approvalStatus: "APPROVED",
        supersedesEvidenceId: "fin-old",
      },
    );

    // Restated without being itself superseded should be current — but RESTATED status
    // alone is excluded by selector (fail closed until ORIGINAL/AMENDED successor).
    // Provide a clean ORIGINAL current row.
    const current = candidate(
      "fin-current",
      metric({
        metricKey: "CONSOLIDATED_EBITDA",
        value: 200,
        amendmentRestatementStatus: "ORIGINAL",
        measurementDate: AS_OF,
        provenanceId: "prov-current",
      }),
      {
        approvalStatus: "APPROVED",
        supersedesEvidenceId: "fin-old",
      },
    );

    const sel = selectFinancialState(catalog(oldSnap, newSnap, current), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(sel.provenance.excludedSupersededIds).toContain("fin-old");
    expect(sel.metrics.CONSOLIDATED_EBITDA?.value).toBe(200);
    expect(sel.metrics.CONSOLIDATED_EBITDA?.candidate?.evidenceId).toBe("fin-current");

    // Only superseded row → SUPERSEDED outcome, not zero
    const onlyOld = selectFinancialState(catalog(oldSnap), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(onlyOld.metrics.CONSOLIDATED_EBITDA?.outcome).toBe("SUPERSEDED");
    expect(onlyOld.metrics.CONSOLIDATED_EBITDA?.value).toBeNull();
  });

  it("7. wrong-entity financial inputs refused", () => {
    const wrongEntity = candidate(
      "fin-wrong-entity",
      metric({
        metricKey: "CONSOLIDATED_EBITDA",
        value: 500,
        entity: {
          companyId: "other-company",
          entityName: "Other Co",
          consolidationPerimeter: "Other",
        },
      }),
    );
    const sel = selectFinancialState(catalog(wrongEntity), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(sel.metrics.CONSOLIDATED_EBITDA?.outcome).toBe("WRONG_ENTITY");
    expect(sel.metrics.CONSOLIDATED_EBITDA?.value).toBeNull();

    const evalResult = baseEval({
      executableRules: {
        companyId: CO,
        instrumentKey: INST,
        rules: [ebitdaGrower(RULE_A, 0.25)],
      },
      financialCatalog: catalog(wrongEntity),
      requiredFinancialMetrics: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(evalResult.financiallyModeledAmount).toBeNull();
    expect(evalResult.remainingAmount).toBeNull();
  });

  it("8. FX mismatch fail-closed", () => {
    const eurEvent = event({
      eventId: "u-eur",
      kind: "DEBT_ISSUANCE",
      amount: 40,
      currency: "EUR",
    });
    const result = baseEval({
      utilizationEvents: [eurEvent],
      completenessCertificate: syntheticCompleteness(RULE_A),
      allowSynthetic: true,
    });
    expect(result.blockers.some((b) => /currency/i.test(b))).toBe(true);
    // EUR row not attributed into USD path utilization sum as silent convert.
    expect(result.artifacts.utilizationReconstruction?.usageUnallocated.some((e) => e.eventId === "u-eur")).toBe(
      true,
    );

    // Shared capacity with EUR pool vs USD members
    resetIds();
    const rules = [fixedRule(RULE_A, 100), fixedRule(RULE_B, 100)];
    const sharedEur = [
      sharedCap(SHARED, MONEY(100, "EUR"), [RULE_A, RULE_B]),
    ];
    const fx = evaluateVerifiedRemainingCapacity({
      companyId: CO,
      instrumentKey: INST,
      capacityRuleId: RULE_A,
      asOf: AS_OF,
      currency: CURRENCY,
      executableRules: verifiedHandoff(rules, sharedEur),
      financialCatalog: catalog(),
      utilizationEvents: [
        event({ eventId: "u1", kind: "DEBT_ISSUANCE", amount: 10, sharedCapacityId: SHARED }),
      ],
      completenessCertificate: syntheticCompleteness(RULE_A),
      allowSynthetic: true,
    });
    expect(
      fx.bindingRestrictions.some(
        (r) =>
          r.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" ||
          /currency/i.test(r.message) ||
          r.failClosed,
      ) || fx.blockers.some((b) => /currency|shared|fail closed/i.test(b)),
    ).toBe(true);
    // Must not invent a USD remaining from EUR pool.
    if (fx.artifacts.capacityEntry) {
      const limCodes = fx.artifacts.capacityEntry.limitations.map((l) => l.code);
      // Currency mismatch or shared not quantified / review — never silent AVAILABLE remaining from FX invent
      expect(
        limCodes.includes("CURRENCY_MISMATCH_NO_CONVERSION_MODELED") ||
          fx.remainingAmount == null ||
          fx.artifacts.capacityEntry.status !== "AVAILABLE",
      ).toBe(true);
    }
  });

  it("9. as-of-date consistency — future usage and stale financials excluded", () => {
    const futureUsage = event({
      eventId: "u-future",
      kind: "DEBT_ISSUANCE",
      amount: 25,
      effectiveDate: "2027-01-01",
    });
    const pastUsage = event({
      eventId: "u-past",
      kind: "DEBT_ISSUANCE",
      amount: 10,
      effectiveDate: "2025-01-01",
    });
    const result = baseEval({
      utilizationEvents: [futureUsage, pastUsage],
      completenessCertificate: syntheticCompleteness(RULE_A),
      allowSynthetic: true,
    });
    // Future usage must not count at AS_OF
    const applied = result.artifacts.utilizationResolution.recordsApplied.map((r) => r.usageId);
    expect(applied).toContain("u-past");
    expect(applied).not.toContain("u-future");

    // Stale financial metric
    const stale = candidate(
      "fin-stale",
      metric({
        metricKey: "CONSOLIDATED_EBITDA",
        value: 100,
        measurementDate: "2020-01-01",
        maxAgeDays: 90,
      }),
    );
    const staleSel = selectFinancialState(catalog(stale), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(staleSel.metrics.CONSOLIDATED_EBITDA?.outcome).toBe("STALE");
    expect(staleSel.metrics.CONSOLIDATED_EBITDA?.value).toBeNull();
  });

  it("10. replay determinism — identical inputs → identical output hash", () => {
    const fin = catalog(
      candidate(
        "fin-1",
        metric({ metricKey: "CONSOLIDATED_EBITDA", value: 400 }),
      ),
    );
    const events = [
      event({ eventId: "u1", kind: "DEBT_ISSUANCE", amount: 40 }),
      event({ eventId: "u2", kind: "RESTRICTED_PAYMENT", amount: 10 }),
    ];
    const args = {
      companyId: CO,
      instrumentKey: INST,
      capacityRuleId: RULE_A,
      asOf: AS_OF,
      currency: CURRENCY,
      executableRules: verifiedHandoff([fixedRule(RULE_A, 100)]),
      financialCatalog: fin,
      requiredFinancialMetrics: ["CONSOLIDATED_EBITDA"] as const,
      utilizationEvents: events,
      completenessCertificate: syntheticCompleteness(RULE_A),
      allowSynthetic: true as const,
    };

    const a = evaluateVerifiedRemainingCapacity(args);
    const b = evaluateVerifiedRemainingCapacity(args);
    expect(a.provenance.inputHash).toBe(b.provenance.inputHash);
    expect(a.provenance.capacityStateHash).toBe(b.provenance.capacityStateHash);
    expect(a.grossContractualAmount).toBe(b.grossContractualAmount);
    expect(a.historicalUtilization).toBe(b.historicalUtilization);
    expect(a.remainingAmount).toBe(b.remainingAmount);
    expect(a.completenessAuthority).toBe(b.completenessAuthority);
    expect(a.confidenceAuthority).toBe(b.confidenceAuthority);
    expect(JSON.stringify(a.calculationTrace)).toBe(JSON.stringify(b.calculationTrace));
  });

  it("demo completeness can support remaining without activating production authority", () => {
    const result = baseEval({
      utilizationEvents: [event({ eventId: "u1", kind: "DEBT_ISSUANCE", amount: 30 })],
      completenessCertificate: syntheticCompleteness(RULE_A, "VERIFIED_COMPLETE"),
      allowSynthetic: true,
    });
    expect(result.completenessAuthority).toBe("REVIEWED_COMPLETENESS");
    expect(result.remainingSupported).toBe(true);
    expect(result.remainingAmount).toBe(70);
    expect(result.mayPublishProductionRemaining).toBe(false);
    expect(result.confidenceAuthority).not.toBe("PRODUCTION_AUTHORITATIVE");
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });

  it("P0: selection completeness never manufactures APPROVED financial evidence", () => {
    const approvedRow = candidate(
      "fin-ebitda-approved-label-only",
      metric({ metricKey: "CONSOLIDATED_EBITDA", value: 200 }),
      { approvalStatus: "APPROVED" }, // status label without authentic provenance
    );
    const selected = selectFinancialState(catalog(approvedRow), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(selected.complete).toBe(true);

    // Completeness + APPROVED status label alone → must NOT mint APPROVED snapshot.
    const minted = projectFinancialSnapshotsFromSelection(selected, INST, CURRENCY, false);
    expect(minted).toHaveLength(1);
    expect(minted[0]!.status).not.toBe("APPROVED");
    expect(minted[0]!.status).toBe("REVIEW_REQUIRED");
    expect(minted[0]!.review.reviewedBy).toBeNull();
    expect(minted[0]!.review.approvalRef).toBeNull();
    expect(minted[0]!.provenance.note ?? "").toMatch(/APPROVED refused|missing authentic approval/i);

    // allowSynthetic projects DRAFT — still not APPROVED.
    const draft = projectFinancialSnapshotsFromSelection(selected, INST, CURRENCY, true);
    expect(draft[0]!.status).toBe("DRAFT");
    expect(draft[0]!.review.reviewedBy).toBeNull();
  });

  it("P0: APPROVED snapshot requires authentic provenance + trusted-issuer authorization", () => {
    // Provenance present but productionAuthoritative false (no trustedIssuerAuth /
    // synthetic path) → selection may be complete, APPROVED snapshot still refused.
    const withProvenance = candidate(
      "fin-ebitda-with-prov",
      metric({
        metricKey: "CONSOLIDATED_EBITDA",
        value: 200,
        authenticity: "SYNTHETIC_LABELED",
        verificationStatus: "VERIFIED",
      }),
      {
        approvalStatus: "APPROVED",
        approvalProvenance: {
          reviewedBy: "idp:reviewer-1",
          reviewedAt: `${AS_OF}T12:00:00Z`,
          approvalRef: "approval-event:evt-1",
        },
      },
    );
    const selected = selectFinancialState(catalog(withProvenance), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    expect(selected.complete).toBe(true);
    expect(selected.productionAuthoritative).toBe(false);
    const refused = projectFinancialSnapshotsFromSelection(selected, INST, CURRENCY, false);
    expect(refused[0]!.status).not.toBe("APPROVED");
    expect(refused[0]!.status).toBe("REVIEW_REQUIRED");
    expect(refused[0]!.review.reviewedBy).toBeNull();

    // Self-minted selection-module labels are refused even when present.
    const selfMinted = candidate(
      "fin-self-mint",
      metric({ metricKey: "CONSOLIDATED_EBITDA", value: 200 }),
      {
        approvalStatus: "APPROVED",
        approvalProvenance: {
          reviewedBy: "financial-state-selection",
          reviewedAt: `${AS_OF}T00:00:00Z`,
          approvalRef: "approval-event:forged-self-mint",
        },
      },
    );
    const forgedSel = selectFinancialState(catalog(selfMinted), {
      companyId: CO,
      asOf: AS_OF,
      currency: CURRENCY,
      metricKeys: ["CONSOLIDATED_EBITDA"],
      allowSynthetic: true,
    });
    const forgedSnap = projectFinancialSnapshotsFromSelection(forgedSel, INST, CURRENCY, false);
    expect(forgedSnap[0]!.status).not.toBe("APPROVED");
    expect(forgedSnap[0]!.review.reviewedBy).toBeNull();
  });
});
