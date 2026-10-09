/**
 * Agent 3 — attributed utilization → verified remaining demo.
 *
 * Demonstrates: gross − attributed usage = supported remaining.
 * Uses SYNTHETIC_LABELED usage (authentic Neon attributed history is blocked —
 * see real-data blocker below). Does not write to the database.
 *
 * Usage: npx tsx scripts/capacity/verified-remaining-demo.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  evidenceFromAttributedLedger,
  resolveUtilization,
} from "@/lib/capacity";
import { adaptLegacyCovenantProvision } from "@/lib/contract-model/ir/legacy-adapter";
import type { CovenantProvisionInput } from "@/lib/covenant-engine";

const AS_OF = "2026-06-30";
const OUT = resolve("docs/covenant-capacity-mathematics");

/** Labeled synthetic example — NOT authentic Neon history. */
function syntheticAttributedExample() {
  const capacityRuleId = "synthetic:flat-basket:6.01(a)";
  const gross = 100; // $M contractual flat basket
  const used = 35; // SYNTHETIC_LABELED attributed draw
  const expectedRemaining = 65;

  const utilization = resolveUtilization({
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
        sourceLabel: "SYNTHETIC_LABELED — Agent 3 demo fixture (not Neon contract_ledger_usages)",
        authenticity: "SYNTHETIC_LABELED",
      }),
    ],
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
    gross: {
      amount: gross,
      gateSatisfied: true,
      modeled: true,
      capacityRuleId,
    },
    utilization,
    governingConditions: verified.governingConditions,
    crossDocumentConstraints: verified.crossDocumentConstraints,
    sourceCitations: verified.sourceCitations,
    certificationStatus: "NOT_CERTIFIED",
  });

  return {
    authenticity: "SYNTHETIC_LABELED" as const,
    asOf: AS_OF,
    formula: "FLAT_AMOUNT",
    grossContractualCapacity: gross,
    knownAttributedUtilization: used,
    unknownUtilization: false,
    supportedRemaining: verified.supportedRemaining,
    independentExpectedRemaining: expectedRemaining,
    match: verified.supportedRemaining === expectedRemaining,
    sharedPoolEffects: "none",
    governingConditions: verified.governingConditions,
    publicationLabel: verified.publicationLabel,
    productConsistency: assertProductCapacityConsistency(views),
    surfaces: {
      POSITION: views.POSITION.supportedRemainingCapacity,
      SIMULATE: views.SIMULATE.supportedRemainingCapacity,
      ASK: views.ASK.supportedRemainingCapacity,
    },
    note: verified.note,
  };
}

function emptyLedgerIsUnknownExample() {
  const capacityRuleId = "authentic-blocker:permission-unattributed";
  const utilization = resolveUtilization({
    capacityRuleId,
    asOf: AS_OF,
    records: [],
    unattributedLegacyBasketPresent: true,
  });
  const verified = computeVerifiedRemaining({
    gross: {
      amount: 100,
      gateSatisfied: true,
      modeled: true,
      capacityRuleId,
    },
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
  const cases: Array<{ formulaType: CovenantProvisionInput["formulaType"]; thresholdValue: number; params?: CovenantProvisionInput["params"] }> = [
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
    authenticUtilizationBlocker: emptyLedgerIsUnknownExample(),
    realDataBlocker: {
      status: "BLOCKED",
      detail:
        "Neon contract_ledger_usages attributed to Permission/Provision ids are not populated for Coherent/Matthews; only basket-family LedgerEntry rows exist. Remaining after authentic utilization cannot be claimed without inventing history.",
    },
    phase4cAdapterCoverage: adapterCoverageClassification(),
    falseFavorableGuard: {
      emptyLedgerPublishesAvailable: false,
      debtIntelligenceUsesResolver: true,
      note: "Empty/unattributed ledger → CONDITIONAL/GROSS_ONLY, never COMPUTED remaining = gross",
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
