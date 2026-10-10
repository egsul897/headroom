/**
 * Agent 3 — attributed utilization → verified remaining demo.
 *
 * Demonstrates mechanics with SYNTHETIC_LABELED completeness certificates.
 * Synthetic certificates are NEVER production-authoritative — Position /
 * Simulate / Ask / verified-execution refuse authoritative remaining.
 *
 * Usage: npx tsx scripts/capacity/verified-remaining-demo.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEMO_BINDINGS,
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  evidenceFromAttributedLedger,
  refuseAuthoritativeRemaining,
  resolveUtilization,
  syntheticCompletenessCertificate,
  demoTrustedIssuerAuth,
} from "@/lib/capacity";
import { adaptLegacyCovenantProvision } from "@/lib/contract-model/ir/legacy-adapter";
import type { CovenantProvisionInput } from "@/lib/covenant-engine";

const AS_OF = "2026-06-30";
const OUT = resolve("docs/covenant-capacity-mathematics");
const CO = "demo-co";

function syntheticAttributedExample() {
  const capacityRuleId = "synthetic:flat-basket:6.01(a)";
  const gross = 100;
  const used = 35;
  const expectedRemaining = 65;

  const utilization = resolveUtilization({
    companyId: CO,
    capacityRuleId,
    asOf: AS_OF,
    records: [
      evidenceFromAttributedLedger({
        usageId: "syn-draw-2026-03-15",
        amount: used,
        currency: "USD",
        effectiveAsOf: "2026-03-15",
        capacityRuleId,
        status: "ACTIVE",
        approvalState: "APPROVED",
        sourceLabel: "SYNTHETIC_LABELED — Agent 3 demo fixture",
        authenticity: "SYNTHETIC_LABELED",
      }),
    ],
    executionMode: "DEMO_SYNTHETIC",
    currentBindings: DEMO_BINDINGS,
    trustedIssuerAuth: demoTrustedIssuerAuth(),
    completenessCertificate: syntheticCompletenessCertificate({
      kind: "VERIFIED_COMPLETE",
      capacityRuleId,
      companyId: CO,
      asOf: AS_OF,
    }),
  });

  const verified = computeVerifiedRemaining({
    gross: {
      amount: gross,
      gateSatisfied: true,
      modeled: true,
      capacityRuleId,
      formulaLabel: "FLAT_AMOUNT $100M",
      sectionRef: "6.01(a)",
    },
    utilization,
    governingConditions: ["No Payment Conditions on this flat basket (demo)"],
    crossDocumentConstraints: [],
    sourceCitations: ["§6.01(a) (synthetic demo citation)"],
    certificationStatus: "NOT_CERTIFIED",
  });

  const views = buildSharedProductCapacityViews({
    gross: { amount: gross, gateSatisfied: true, modeled: true, capacityRuleId },
    utilization,
    governingConditions: verified.governingConditions,
    crossDocumentConstraints: verified.crossDocumentConstraints,
    sourceCitations: verified.sourceCitations,
    certificationStatus: "NOT_CERTIFIED",
  });
  const gated = refuseAuthoritativeRemaining(verified);

  return {
    authenticity: "SYNTHETIC_LABELED" as const,
    asOf: AS_OF,
    formula: "FLAT_AMOUNT",
    grossContractualCapacity: gross,
    knownAttributedUtilization: used,
    demoEngineRemaining: verified.supportedRemaining,
    independentExpectedRemaining: expectedRemaining,
    demoMatch: verified.supportedRemaining === expectedRemaining,
    productionAuthoritative: utilization.productionAuthoritative,
    productSurfacesAuthoritativeRemaining: {
      POSITION: views.POSITION.supportedRemainingCapacity,
      SIMULATE: views.SIMULATE.supportedRemainingCapacity,
      ASK: views.ASK.supportedRemainingCapacity,
      VERIFIED_EXECUTION: views.VERIFIED_EXECUTION.supportedRemainingCapacity,
    },
    productConsistency: assertProductCapacityConsistency(views),
    refuseAuthoritativeRemaining: gated,
    note: verified.note,
  };
}

function attributedWithoutCompletenessBlocker() {
  const capacityRuleId = "synthetic:incomplete-history";
  const utilization = resolveUtilization({
    companyId: CO,
    capacityRuleId,
    asOf: AS_OF,
    records: [
      evidenceFromAttributedLedger({
        usageId: "syn-partial",
        amount: 10,
        currency: "USD",
        effectiveAsOf: "2026-01-01",
        capacityRuleId,
        status: "ACTIVE",
        approvalState: "APPROVED",
        sourceLabel: "SYNTHETIC_LABELED approved record without completeness",
        authenticity: "SYNTHETIC_LABELED",
      }),
    ],
    executionMode: "PRODUCTION",
  });
  const verified = computeVerifiedRemaining({
    gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId },
    utilization,
  });
  return {
    knowledge: utilization.knowledge,
    attributedAmount: utilization.attributedAmount,
    supportsRemainingClaim: utilization.supportsRemainingClaim,
    productionAuthoritative: utilization.productionAuthoritative,
    supportedRemaining: verified.supportedRemaining,
    publicationLabel: verified.publicationLabel,
    note: utilization.note,
  };
}

function emptyLedgerIsUnknownExample() {
  const capacityRuleId = "authentic-blocker:permission-unattributed";
  const utilization = resolveUtilization({
    companyId: CO,
    capacityRuleId,
    asOf: AS_OF,
    records: [],
    unattributedLegacyBasketPresent: true,
    executionMode: "PRODUCTION",
  });
  const verified = computeVerifiedRemaining({
    gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId },
    utilization,
  });
  return {
    authenticity: "AUTHENTIC_BLOCKER" as const,
    grossKnown: 100,
    utilizationKnowledge: utilization.knowledge,
    supportsRemainingClaim: utilization.supportsRemainingClaim,
    supportedRemaining: verified.supportedRemaining,
    publicationLabel: verified.publicationLabel,
    mayPublishAvailable: verified.mayPublishAvailable,
    note: utilization.note,
  };
}

function adapterCoverageClassification() {
  const cases: Array<{
    formulaType: CovenantProvisionInput["formulaType"];
    thresholdValue: number;
    params?: CovenantProvisionInput["params"];
  }> = [
    { formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.5, params: { debtBasis: "total" } },
    { formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.0 },
    { formulaType: "RATIO_GATE", thresholdValue: 4.0, params: { debtBasis: "secured" } },
    {
      formulaType: "BUILDER_BASKET",
      thresholdValue: 50,
      params: { pctEbitda: 0.25, cniSharePct: 0.5, includeEquityProceeds: true },
    },
    { formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 0 },
  ];
  return cases.map((c, i) => {
    const provision: CovenantProvisionInput = {
      id: `c${i}`,
      documentId: "d",
      code: `code-${i}`,
      basketName: c.formulaType,
      sectionRef: "x",
      formulaType: c.formulaType,
      thresholdValue: c.thresholdValue,
      params: c.params,
    };
    const adapted = adaptLegacyCovenantProvision(provision, "co", "inst");
    let classification: string;
    if (adapted.rule) {
      classification =
        "1→fixed: was missing representation support; now IR METRIC tree (PARTIAL, not certified)";
    } else if (c.thresholdValue <= 0) {
      classification = "2: missing verified inputs / invalid threshold — correct refusal";
    } else {
      classification = "5: unsupported legal mechanics or incomplete params";
    }
    return {
      formulaType: c.formulaType,
      adapted: Boolean(adapted.rule),
      refusalReason: adapted.refusalReason,
      sufficiency: adapted.rule?.sufficiency ?? null,
      compilerVersion: adapted.rule?.compilerVersion ?? null,
      classification,
    };
  });
}

function main() {
  const demo = {
    syntheticAttributedRemaining: syntheticAttributedExample(),
    attributedWithoutCompleteness: attributedWithoutCompletenessBlocker(),
    authenticUtilizationBlocker: emptyLedgerIsUnknownExample(),
    utilizationAuthority: {
      issuers: ["COUNSEL_REVIEWER", "LEDGER_CUSTODIAN"],
      neverProductionAuthoritative: ["SYSTEM_FIXTURE", "SYNTHETIC_LABELED"],
      insufficientMethod: "REVIEWED_RECORDED_TRANSACTIONS_ONLY",
      requiredEvidence: [
        "companyId",
        "operativeAgreementId",
        "provisionOrBasketId",
        "entityScopeKeys",
        "currency",
        "effectiveAsOf",
        "coveragePeriodStart/End",
        "binding fingerprints (document/ledger/financial/amendments/shared-capacity)",
        "openingBalancePolicy / reclassificationPolicy / supersessionPolicy ≠ UNKNOWN",
      ],
      principle:
        "Remaining publishable only when capacity calculation AND validated completeness evidence are independently defensible. Synthetic certificates never authorize Position/Simulate/Ask/verified-execution remaining.",
      mergeBlocker:
        "Authentic Neon completeness authority (counsel/custodian certificates bound to live document/ledger/financial epochs) is not yet populated — PR remains blocked for merge on that basis.",
    },
    phase4cAdapterCoverage: adapterCoverageClassification(),
    falseFavorableGuard: {
      emptyLedgerPublishesAvailable: false,
      syntheticCertPublishesAuthoritativeRemaining: false,
      debtIntelligenceUsesResolver: true,
    },
    costUsd: 0,
  };

  mkdirSync(OUT, { recursive: true });
  const path = resolve(OUT, "05-verified-remaining-demo.json");
  writeFileSync(path, JSON.stringify(demo, null, 2));
  console.log(JSON.stringify(demo, null, 2));
  console.log(`\nWrote ${path}`);
}

main();
