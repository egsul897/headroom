/**
 * Cross-domain transaction scenarios over the canonical financial-input interface.
 * Uses existing covenant-engine leaf math — no parallel calculator.
 */

import {
  computeCovenantPosition,
  computeLeverageMetrics,
  evaluateProvision,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantProvisionInput,
  type DocumentInput,
  type FinancialSnapshotInput,
} from "@/lib/covenant-engine";
import { mayClaimVerifiedRemaining, mayEvaluateGrossCapacity, resolveCanonicalFinancialInputs } from "./resolve";
import type {
  BasketEvaluationRow,
  CanonicalFinancialInputBundle,
  TransactionScenarioRequest,
  TransactionScenarioResult,
} from "./types";

/** Representative baskets exercised across families (fixture IR — not certified rulebook). */
function demoProvisions(documentId: string): CovenantProvisionInput[] {
  return [
    {
      id: "p-debt-general",
      documentId,
      code: "debt_general",
      basketName: "General debt basket",
      sectionRef: "§7.02(a)",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 75,
    },
    {
      id: "p-debt-ratio",
      documentId,
      code: "debt_ratio",
      basketName: "Ratio debt (total net leverage)",
      sectionRef: "§7.02(b)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4.25,
      params: { debtBasis: "total" },
    },
    {
      id: "p-debt-secured-ratio",
      documentId,
      code: "debt_secured_ratio",
      basketName: "Ratio debt (secured net leverage)",
      sectionRef: "§7.02(c)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.5,
      params: { debtBasis: "secured" },
    },
    {
      id: "p-lien-general",
      documentId,
      code: "lien_general",
      basketName: "General liens",
      sectionRef: "§7.03(a)",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 50,
    },
    {
      id: "p-lien-grower",
      documentId,
      code: "lien_grower",
      basketName: "Lien grower (% EBITDA)",
      sectionRef: "§7.03(b)",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 40,
      params: { pctEbitda: 0.1 },
    },
    {
      id: "p-rp-builder",
      documentId,
      code: "rp_builder",
      basketName: "RP builder / Available Amount starter",
      sectionRef: "§7.06(a)",
      formulaType: "BUILDER_BASKET",
      thresholdValue: 25,
      params: { pctEbitda: 0.2, cniSharePct: 0.5, includeEquityProceeds: true },
    },
    {
      id: "p-rp-gate",
      documentId,
      code: "rp_ratio_gate",
      basketName: "RP ratio gate",
      sectionRef: "§7.06(b)",
      formulaType: "RATIO_GATE",
      thresholdValue: 3.0,
      params: { debtBasis: "total" },
    },
    {
      id: "p-inv-general",
      documentId,
      code: "inv_general",
      basketName: "General investments",
      sectionRef: "§7.05(a)",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 30,
    },
    {
      id: "p-inv-grower",
      documentId,
      code: "inv_grower",
      basketName: "Investment grower",
      sectionRef: "§7.05(b)",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 20,
      params: { pctEbitda: 0.15 },
    },
    {
      id: "p-fccr-room",
      documentId,
      code: "coverage_room",
      basketName: "Coverage ratio room (illustrative)",
      sectionRef: "§6.11",
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: 2.0,
    },
  ];
}

function demoDocument(documentId: string, name: string): DocumentInput {
  return {
    id: documentId,
    name,
    type: "CREDIT_AGREEMENT",
    governs: "secured+unsecured",
    capacityFormulas: {
      secured: {
        op: "SUM",
        label: "Secured capacity",
        items: [
          { op: "REF", code: "debt_general" },
          { op: "REF", code: "debt_secured_ratio" },
          { op: "REF", code: "lien_general" },
        ],
      },
      unsecured: {
        op: "SUM",
        label: "Unsecured capacity",
        items: [
          { op: "REF", code: "debt_general" },
          { op: "REF", code: "debt_ratio" },
        ],
      },
    },
    rpWaterfall: {
      steps: [{ code: "rp_builder" }],
      ratioGateCodeByKind: { dividend: "rp_ratio_gate", investment: "rp_ratio_gate" },
    },
  };
}

function companyData(bundle: CanonicalFinancialInputBundle, fin: FinancialSnapshotInput): CompanyCovenantData {
  const docId = bundle.identity.sourceDocumentId;
  return {
    companyId: bundle.identity.companyId,
    asOfDate: new Date(bundle.identity.asOf),
    financials: fin,
    documents: [demoDocument(docId, bundle.identity.operativeVersionLabel)],
    provisions: demoProvisions(docId),
    ledger: [],
  };
}

function evaluateBaskets(
  bundle: CanonicalFinancialInputBundle,
  fin: FinancialSnapshotInput,
): BasketEvaluationRow[] {
  const metrics = computeLeverageMetrics(fin);
  const mayVerified = mayClaimVerifiedRemaining(bundle);
  const provisions = demoProvisions(bundle.identity.sourceDocumentId);
  const familyOf = (p: CovenantProvisionInput): BasketEvaluationRow["family"] => {
    if (p.code.startsWith("debt") || p.code.startsWith("coverage")) {
      return p.code.startsWith("coverage") ? "FINANCIAL_COVENANT" : "INDEBTEDNESS";
    }
    if (p.code.startsWith("lien")) return "LIEN";
    if (p.code.startsWith("rp")) return "RESTRICTED_PAYMENT";
    if (p.code.startsWith("inv")) return "INVESTMENT";
    return "INDEBTEDNESS";
  };
  return provisions.map((p) => {
    const ev = evaluateProvision(p, fin, metrics);
    return {
      family: familyOf(p),
      code: p.code,
      sectionRef: p.sectionRef,
      basketName: p.basketName,
      formulaType: p.formulaType,
      status: ev.status,
      capacityMillions: ev.status === "modeled" && ev.capacity !== undefined && Number.isFinite(ev.capacity) ? ev.capacity : ev.capacity === Infinity ? null : null,
      reason:
        ev.capacity === Infinity && ev.status === "modeled"
          ? "RATIO_GATE open — unlimited if modeled (gross/provisional; not verified remaining)"
          : ev.reason ?? null,
      mayClaimVerifiedRemaining: mayVerified && ev.status === "modeled",
    };
  });
}

function leverageTriple(fin: FinancialSnapshotInput) {
  const m = computeLeverageMetrics(fin);
  return {
    totalNetLeverage: m.totalNetLeverage,
    securedNetLeverage: m.seniorSecuredNetLeverage,
    interestCoverage: m.fixedChargeCoverage,
  };
}

/**
 * Run a contemplated transaction against the canonical financial inputs.
 * Debt path uses simulateDebtIncurrence; RP/investment paths evaluate family baskets
 * and propose ledger effects without posting.
 */
export async function runCanonicalTransactionScenario(
  request: TransactionScenarioRequest,
): Promise<TransactionScenarioResult> {
  const bundle = await resolveCanonicalFinancialInputs({ packageKey: request.packageKey });
  if (!bundle || !bundle.legacyFinancialSnapshot) {
    const empty = bundle;
    return {
      request,
      bundle: empty ?? {
        identity: {
          packageKey: request.packageKey,
          instrumentKey: "",
          sourceDocumentId: "",
          operativeVersionLabel: "",
          companyId: "",
          entityScope: "",
          measurementPeriod: "",
          asOf: "",
          currency: "USD",
          unit: "USD_MILLIONS",
        },
        evidenceAuthority: "NONE",
        capacityPublication: "REFUSED",
        contractualMetrics: null,
        ebitdaDerivation: null,
        facts: [],
        unsupportedMechanics: [],
        missingInputs: ["canonical_financial_bundle"],
        legacyFinancialSnapshot: null,
        runtimeMetrics: [],
        dependencyFingerprint: "none",
        notes: ["Package not resolved"],
      },
      pre: { totalNetLeverage: null, securedNetLeverage: null, interestCoverage: null, contractualEbitda: null },
      post: { totalNetLeverage: null, securedNetLeverage: null, interestCoverage: null, totalDebt: null, securedDebt: null },
      debtIncurrence: null,
      baskets: [],
      ledgerEffectsProposed: [],
      blockersToAuthoritativeAnswer: ["Canonical financial inputs unavailable for package"],
      dependencyFingerprint: "none",
    };
  }

  const fin = bundle.legacyFinancialSnapshot;
  const pre = { ...leverageTriple(fin), contractualEbitda: fin.ebitda };
  const baskets = evaluateBaskets(bundle, fin);
  const blockers: string[] = [];

  if (bundle.evidenceAuthority !== "APPROVED_SNAPSHOT") {
    blockers.push(
      `Evidence authority is ${bundle.evidenceAuthority} — cannot claim certified capacity, satisfied transaction conditions, or verified remaining headroom`,
    );
  }
  if (bundle.unsupportedMechanics.length > 0) {
    blockers.push(`Unsupported mechanics remain: ${bundle.unsupportedMechanics.slice(0, 3).join("; ")}`);
  }
  if (!mayEvaluateGrossCapacity(bundle)) {
    blockers.push("Gross capacity evaluation refused — missing contractual financial snapshot");
  }
  blockers.push("Historical utilization not attributed for these demo baskets — UNKNOWN ≠ zero; remaining capacity not verified");
  blockers.push("Demo basket provisions are fixture IR for interface exercise — not the certified Phase-3 rulebook for this issuer");

  let debtIncurrence: TransactionScenarioResult["debtIncurrence"] = null;
  let post = {
    totalNetLeverage: pre.totalNetLeverage,
    securedNetLeverage: pre.securedNetLeverage,
    interestCoverage: pre.interestCoverage,
    totalDebt: fin.totalDebt,
    securedDebt: fin.securedDebt,
  };
  const ledgerEffectsProposed: TransactionScenarioResult["ledgerEffectsProposed"] = [];

  if (request.action === "SECURED_DEBT_INCURRENCE") {
    const data = companyData(bundle, fin);
    const position = computeCovenantPosition(data);
    const sim = simulateDebtIncurrence(data, position, request.amountMillions, request.secured);
    debtIncurrence = {
      status: sim.status,
      overallCapacity: sim.overallCapacity ?? null,
      reason: sim.reason ?? null,
      publicationAuthority: bundle.capacityPublication,
    };
    post = {
      totalNetLeverage: sim.proForma.totalNetLeverage,
      securedNetLeverage: sim.proForma.seniorSecuredNetLeverage,
      interestCoverage: sim.proForma.fixedChargeCoverage,
      totalDebt: fin.totalDebt + request.amountMillions,
      securedDebt: fin.securedDebt + (request.secured ? request.amountMillions : 0),
    };
    ledgerEffectsProposed.push({
      kind: "DEBT_INCUR",
      amountMillions: request.amountMillions,
      basket: request.secured ? "secured_debt" : "unsecured_debt",
      note: "Proposed only — not posted; requires authorized commit + attributed path",
    });
  } else if (request.action === "RESTRICTED_PAYMENT") {
    const rp = baskets.filter((b) => b.family === "RESTRICTED_PAYMENT");
    const builder = rp.find((b) => b.code === "rp_builder");
    const gate = rp.find((b) => b.code === "rp_ratio_gate");
    debtIncurrence = null;
    post = { ...post };
    ledgerEffectsProposed.push({
      kind: "DIVIDEND",
      amountMillions: request.amountMillions,
      basket: "rp_builder",
      note: `Gross builder capacity ${builder?.capacityMillions ?? "n/a"}M; gate status ${gate?.status}${gate?.reason ? ` (${gate.reason})` : ""} — not verified remaining`,
    });
    if (gate?.status === "modeled" && gate.reason?.includes("unlimited")) {
      blockers.push("RP ratio gate modeled open does not authorize payment without verified utilization and APPROVED snapshot");
    }
  } else if (request.action === "INVESTMENT") {
    const inv = baskets.filter((b) => b.family === "INVESTMENT");
    const general = inv.find((b) => b.code === "inv_general");
    const grower = inv.find((b) => b.code === "inv_grower");
    ledgerEffectsProposed.push({
      kind: "INVESTMENT",
      amountMillions: request.amountMillions,
      basket: "inv_general+inv_grower",
      note: `Gross general ${general?.capacityMillions ?? "n/a"}M; grower ${grower?.capacityMillions ?? "n/a"}M — acquisition-funded investment path; not verified remaining`,
    });
  }

  return {
    request,
    bundle,
    pre,
    post,
    debtIncurrence,
    baskets,
    ledgerEffectsProposed,
    blockersToAuthoritativeAnswer: blockers,
    dependencyFingerprint: bundle.dependencyFingerprint,
  };
}

/** Prove dependency propagation: fingerprint changes when financial inputs or ledger change. */
export async function demonstrateDependencyPropagation(packageKey: string): Promise<{
  baseline: string;
  afterLedger: string;
  afterApprovedAuthority: string;
  changed: boolean;
}> {
  const a = await resolveCanonicalFinancialInputs({ packageKey, ledgerFingerprint: "ledger:v0" });
  const b = await resolveCanonicalFinancialInputs({ packageKey, ledgerFingerprint: "ledger:v1-usage-posted" });
  const c = await resolveCanonicalFinancialInputs({
    packageKey,
    ledgerFingerprint: "ledger:v0",
    forceEvidenceAuthority: "APPROVED_SNAPSHOT",
  });
  return {
    baseline: a?.dependencyFingerprint ?? "",
    afterLedger: b?.dependencyFingerprint ?? "",
    afterApprovedAuthority: c?.dependencyFingerprint ?? "",
    changed:
      !!a &&
      !!b &&
      !!c &&
      a.dependencyFingerprint !== b.dependencyFingerprint &&
      a.dependencyFingerprint !== c.dependencyFingerprint,
  };
}
