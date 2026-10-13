/**
 * Product Proof 003 — Real financing-package E2E evaluation on canonical main.
 *
 * Reproducible. Offline. No Neon writes. No paid inference.
 * No invented financial approvals, zero-utilization assumptions,
 * synthetic legal interpretations, or favorable path selection.
 *
 * Package under test: Matthews International Q1 FY2025 authentic slice
 * (EDGAR-backed fixture on main). Secondary reference: frozen MTN PP001 artifacts.
 *
 * Usage (from repo root on main / this branch):
 *   npx tsx scripts/product-proof/run-003-real-package-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  evaluateMatthewsVerticalSlice,
  runRealDashboardVerticalSlice,
} from "@/lib/product/real-dashboard-vertical-slice";
import { demonstrateChangePropagation } from "@/lib/product/real-dashboard-vertical-slice/change-propagation";
import { MATTHEWS_GOVERNING_DOCUMENTS } from "@/lib/product/real-dashboard-vertical-slice/package-matthews";
import { attemptVerifiedSimulate } from "@/lib/product/unified-position/certified-simulate-bridge";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";
import {
  recipeAssetSale,
  recipeDividendPayment,
  recipeRestrictedInvestment,
  recipeSecuredBorrowing,
} from "@/lib/product/north-star-workflow/transaction-effect-recipes";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import { TRUSTED_ISSUER_ACTIVATION } from "@/lib/capacity";

const OUT_DIR = path.join(
  process.cwd(),
  "docs/product-proof/003-real-financing-package-e2e",
);
const ARTIFACTS = path.join(OUT_DIR, "artifacts");

type DomainStatus =
  | "IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE"
  | "PARTIALLY_EXECUTABLE"
  | "BLOCKED_BY_MISSING_REAL_EVIDENCE"
  | "NOT_IMPLEMENTED";

type DomainRow = {
  domain: string;
  status: DomainStatus;
  evidence: string[];
  blockers: string[];
  mainFiles: string[];
};

type CovenantTrail = {
  covenantFamily: string;
  sourceProvision: string | null;
  calculation: string | null;
  missingInputs: string[];
  selectedPath: string | null;
  capacityConsumption: string | null;
  postTransactionState: string | null;
  conclusion: string;
};

type TransactionEval = {
  id: string;
  label: string;
  ask: string;
  amountMillions: number;
  evaluationDate: string;
  draft: ReturnType<typeof parseTransactionDraft>;
  applicableCovenants: CovenantTrail[];
  verifiedSimulate: {
    executable: boolean;
    refusalSummary: string[];
    certifiedBlockers: string[];
      pathEnumerationAuthority: string;
      pathIncompleteReasons: string[];
      selectedPathId: string | null;
  };
  recipeShape: {
    kind: string;
    limitations: Array<{ code: string; message: string }>;
    note: string;
  };
  modeledLeafProbe: {
    used: boolean;
    note: string;
    baselineCovenants?: Array<{
      code: string;
      section: string;
      modeledMm: number | null;
      remainingMm: number | null;
      authority: string;
    }>;
    postState?: Array<{
      code: string;
      modeledMm: number | null;
      deltaMm: number | null;
    }>;
  };
  overallConclusion: string;
  truthfulBlocker: string | null;
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const p = path.join(ARTIFACTS, name);
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
  return p;
}

function domainInventory(slice = evaluateMatthewsVerticalSlice()): DomainRow[] {
  const debtCodes = slice.covenants.filter((c) =>
    c.code.startsWith("ind_"),
  );
  const lienCodes = slice.covenants.filter((c) => c.code.startsWith("ca_lien"));

  return [
    {
      domain: "debt_incurrence",
      status: "PARTIALLY_EXECUTABLE",
      evidence: debtCodes.map(
        (c) =>
          `${c.code} §${c.operativeSection}: modeled=${c.modeledCapacityMm} remaining=${c.remainingCapacityMm} authority=${c.authorityStatus}`,
      ),
      blockers: [
        "Production remaining refused without utilization completeness certificate + trusted issuer",
        "Hand-encoded CovenantProvisionInput leaf rows (AUTONOMOUS_COVENANT_COMPILATION_PROVEN=NOT_PROVEN)",
        "No authentic VerifiedExecutionPackage bound for Matthews multi-path debt simulation",
      ],
      mainFiles: [
        "lib/product/real-dashboard-vertical-slice/evaluate-covenants.ts",
        "lib/product/real-dashboard-vertical-slice/package-matthews.ts",
        "lib/covenant-engine.ts",
        "lib/contract-model/verified-execution.ts",
      ],
    },
    {
      domain: "liens",
      status: "PARTIALLY_EXECUTABLE",
      evidence: lienCodes.map(
        (c) =>
          `${c.code} §${c.operativeSection}: modeled=${c.modeledCapacityMm} authority=${c.authorityStatus} — ${c.exceptionsOrCaveats[0] ?? ""}`,
      ),
      blockers: [
        "Only CA §6.01(j) structural-zero leaf is modeled; Indenture first-priority lien companion not dual-path executable for NEW secured debt",
        "Secured composition labeled HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION",
      ],
      mainFiles: [
        "lib/product/real-dashboard-vertical-slice/evaluate-covenants.ts",
        "lib/product/north-star-workflow/transaction-effect-recipes.ts",
      ],
    },
    {
      domain: "investments",
      status: "NOT_IMPLEMENTED",
      evidence: [
        "Matthews authentic slice has zero Investment provisions / capacityFormulas",
        "provision-legal-context.ts recognizes INVESTMENTS family signals only",
        "recipeRestrictedInvestment exists as recipe shape — no authentic package binding",
      ],
      blockers: [
        "No authentic Matthews/MTN Investment basket IR or leaf provision on main",
        "Cannot evaluate investment capacity without inventing permissions",
      ],
      mainFiles: [
        "lib/product/real-dashboard-vertical-slice/provision-legal-context.ts",
        "lib/product/north-star-workflow/transaction-effect-recipes.ts",
      ],
    },
    {
      domain: "restricted_payments",
      status: "NOT_IMPLEMENTED",
      evidence: [
        "Matthews authentic slice has zero RP waterfall / builder provisions",
        "Legacy Coherent seed path has RP waterfall (fixture company) — not this authentic package",
        "recipeDividendPayment exists as recipe shape only",
      ],
      blockers: [
        "No authentic RP capacity node, builder metric, or utilization ledger for Matthews",
        "Verified simulate without VEP refuses; inventing a path would be false permission",
      ],
      mainFiles: [
        "lib/covenant-engine.ts (simulateRestrictedPayment — requires document.rpWaterfall)",
        "lib/product/north-star-workflow/transaction-effect-recipes.ts",
        "prisma/seed-data.ts (Coherent fixture only)",
      ],
    },
    {
      domain: "asset_sales",
      status: "NOT_IMPLEMENTED",
      evidence: [
        "Matthews authentic slice has zero assetSale config",
        "simulateAssetSale in covenant-engine requires document.assetSale",
        "recipeAssetSale exists as recipe shape only",
      ],
      blockers: [
        "No authentic asset-sale threshold provision, reinvestment basket, or proceeds routing for Matthews",
      ],
      mainFiles: [
        "lib/covenant-engine.ts (simulateAssetSale)",
        "lib/product/north-star-workflow/transaction-effect-recipes.ts",
      ],
    },
    {
      domain: "applicable_financial_covenants",
      status: "PARTIALLY_EXECUTABLE",
      evidence: [
        `FCCR / Secured Net Leverage modeled rooms present as leaf rows: ${debtCodes
          .filter((c) => c.formulaType.includes("RATIO") || c.code.includes("ratio") || c.code.includes("fccr"))
          .map((c) => `${c.code}=${c.modeledCapacityMm}`)
          .join(", ") || "none tagged"}`,
        `Trusted issuer activation: ${TRUSTED_ISSUER_ACTIVATION}`,
        "Contractual EBITDA build-up / NS-4 APPROVED leverage primarily on open PRs (#322/#341/#338/#339) — not fully on this main tip",
      ],
      blockers: [
        "Modeled ratio rooms are not published as remainingCapacityMm (D3b)",
        "CONSOLIDATED_EBITDA is PUBLIC_FILING_RECONSTRUCTION / UNVERIFIED_EXTRACTION",
        "Open PR #341 absorbs executable AFC path but is CONFLICTING / unmerged — main must not invent APPROVED certificates",
      ],
      mainFiles: [
        "lib/product/real-dashboard-vertical-slice/evaluate-covenants.ts",
        "lib/capacity/*",
        "lib/covenant-engine.ts (computeLeverageMetrics)",
      ],
    },
    {
      domain: "amendments",
      status: "PARTIALLY_EXECUTABLE",
      evidence: [
        "CA §6.01(j) leaf cites Sixth Amendment restatement (structural zero) — source-backed caveat on modeled leaf",
        "Phase-2G amendment precedence / operative-state libraries exist on main",
        "MTN PP001 amendment pipeline ran with 0 effects (restatement + separate indentures)",
      ],
      blockers: [
        "No full as-amended operative IR package for Matthews credit agreement on product path",
        "CONMED authenticated VEP still has instrument-level OPERATIVE_STATE_REVIEW_REQUIRED for unattached Omnibus/Second-Amendment effects",
      ],
      mainFiles: [
        "lib/contract-model/compiler/* (operative / amendment)",
        "lib/product/legal-reasoning/amendment-graph.ts",
        "docs/product/customer-workflow/authenticated-vep/00-blocker-report.md",
      ],
    },
    {
      domain: "shared_capacity",
      status: "PARTIALLY_EXECUTABLE",
      evidence: [
        "Phase 4C IRSharedCapacity + verified-execution shared capacity units implemented in-memory",
        "Matthews leaf does not bind a shared Debt Facilities / Lien shared-cap unit for dual-path NEW secured debt",
        "Stage D dual-path demo is SYNTHETIC_LABELED_TECHNICAL_DEMO (pkg-i), not authentic Matthews",
      ],
      blockers: [
        "Authentic package lacks certified shared-capacity unit + companion discharge for secured dual-path",
        "Cross-domain Simulate authority is open PR #340 (v2) — not on main",
      ],
      mainFiles: [
        "lib/contract-model/verified-execution.ts",
        "lib/contract-model/runtime/capacity/*",
        "docs/product/customer-workflow/stage-d-pkgi-secured-dual-path/00-execution-report.md",
      ],
    },
    {
      domain: "historical_utilization",
      status: "BLOCKED_BY_MISSING_REAL_EVIDENCE",
      evidence: [
        `Attributed events: ${slice.utilization.attributedEventCount} totaling ${slice.utilization.attributedAmountMm} mm`,
        `supportsRemainingClaim=${slice.utilization.supportsRemainingClaim}`,
        `unknownHistoricalActivity=${slice.utilization.unknownHistoricalActivity}`,
        `completenessCertificatePresent=${slice.utilization.completenessCertificatePresent}`,
        `trustedIssuerActivation=${slice.utilization.trustedIssuerActivation}`,
      ],
      blockers: [
        "No reviewer-confirmed utilization completeness certificate",
        "UNKNOWN historical activity must not be treated as zero",
        "Production remaining publication refused (correct fail-closed)",
      ],
      mainFiles: [
        "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
        "lib/capacity/*",
        "lib/product/verified-transaction-execution/adapters/utilization.ts",
      ],
    },
  ];
}

async function evaluateTransaction(args: {
  id: string;
  label: string;
  ask: string;
  amountMillions: number;
  evaluationDate: string;
  kind: "ACQUISITION" | "RESTRICTED_PAYMENT" | "ASSET_SALE";
}): Promise<TransactionEval> {
  const draft = parseTransactionDraft(args.ask);

  // Canonical verified path — NO invented VEP.
  const verified = await attemptVerifiedSimulate({
    companyId: "matthews",
    evaluationDate: args.evaluationDate,
    amountMillions: args.amountMillions,
    kind:
      args.kind === "ACQUISITION"
        ? "ACQUISITION"
        : args.kind === "RESTRICTED_PAYMENT"
          ? "RESTRICTED_PAYMENT"
          : "UNKNOWN",
    secured: args.kind === "ACQUISITION" ? true : null,
    verifiedPackage: null,
  });

  const pathEnum = enumerateCertifiedPaths({
    verifiedPackage: null,
    transactionKind:
      args.kind === "ACQUISITION"
        ? "ACQUISITION"
        : args.kind === "RESTRICTED_PAYMENT"
          ? "RESTRICTED_PAYMENT"
          : "UNKNOWN",
    secured: args.kind === "ACQUISITION" ? true : null,
  });

  const identity = {
    companyId: "matthews",
    instrumentKey: "matthews-international-q1-fy2025",
    transactionId: `pp003-${args.id}`,
    effectiveAsOf: args.evaluationDate,
    provenance: {
      source: "product-proof-003-real-package-e2e",
      sourceVersion: "pp003.v1",
      approvalRef: null,
    },
    approvalStatus: "HYPOTHETICAL" as const,
  };

  let recipeShape: TransactionEval["recipeShape"];
  if (args.kind === "ACQUISITION") {
    // Honest: do not invent capacity node IDs. Empty draws → limitations.
    const secured = recipeSecuredBorrowing(identity, {
      draws: [],
      label: "Debt-funded acquisition (no authentic capacity nodes supplied)",
    });
    const investment = recipeRestrictedInvestment(identity, {
      draws: [],
      label: "Acquisition investment leg without authentic capacity node",
    });
    recipeShape = {
      kind: "SECURED_BORROWING+INVESTMENT",
      limitations: [
        ...secured.limitations.map((l) => ({ code: l.code, message: l.message })),
        ...investment.limitations.map((l) => ({
          code: l.code,
          message: l.message,
        })),
      ],
      note: "Recipe API accepts only caller-supplied capacity node ids — none invented for Matthews authentic package.",
    };
  } else if (args.kind === "RESTRICTED_PAYMENT") {
    const rp = recipeDividendPayment(identity, {
      draws: [],
      label: "Restricted payment without authentic RP capacity node",
    });
    recipeShape = {
      kind: "DIVIDEND_PAYMENT",
      limitations: rp.limitations.map((l) => ({ code: l.code, message: l.message })),
      note: "No authentic RP capacity node on Matthews package — recipe correctly refuses empty draws.",
    };
  } else {
    const as = recipeAssetSale(identity, {
      metrics: [],
      draws: [],
      label: "Asset sale without authentic metrics/draws",
    });
    recipeShape = {
      kind: "ASSET_SALE",
      limitations: as.limitations.map((l) => ({ code: l.code, message: l.message })),
      note: "No authentic asset-sale threshold or proceeds routing — recipe correctly refuses empty shape.",
    };
  }

  const applicableCovenants: CovenantTrail[] = [];
  let modeledLeafProbe: TransactionEval["modeledLeafProbe"] = {
    used: false,
    note: "Not applicable — domain not modeled on Matthews authentic leaf.",
  };

  if (args.kind === "ACQUISITION") {
    const baseline = evaluateMatthewsVerticalSlice();
    const change = demonstrateChangePropagation({
      hypotheticalSecuredDebtMm: args.amountMillions,
    });
    for (const c of baseline.covenants) {
      applicableCovenants.push({
        covenantFamily: c.code.startsWith("ca_lien") ? "LIENS" : "INDEBTEDNESS",
        sourceProvision: `${c.governingDocumentName} — ${c.operativeSection}`,
        calculation: `${c.formulaDescription} → modeled=${c.modeledCapacityMm} mm; remaining published=${c.remainingCapacityMm}`,
        missingInputs: [
          ...(c.remainingCapacityMm == null
            ? ["verified remaining (completeness certificate + trusted issuer)"]
            : []),
          "authenticated VerifiedExecutionPackage with dual-path debt+lien rules",
          "investment basket for acquisition equity/consideration (NOT_IMPLEMENTED on package)",
        ],
        selectedPath: null,
        capacityConsumption: null,
        postTransactionState: (() => {
          const d = change.transactionDeltas.find((x) => x.code === c.code);
          return d
            ? `hypothetical secured-debt bump only (ledger untouched): modeled ${d.baselineModeledMm} → ${d.changedModeledMm} (Δ ${d.deltaMm})`
            : null;
        })(),
        conclusion:
          c.authorityStatus === "STRUCTURAL_ZERO"
            ? "CA lien companion structurally blocks NEW Loan-Party secured liens — not an affirmative secured path"
            : "Modeled leaf arithmetic available; production-authoritative permission REFUSED",
      });
    }
    applicableCovenants.push({
      covenantFamily: "INVESTMENTS",
      sourceProvision: null,
      calculation: null,
      missingInputs: [
        "No Investment exception / basket compiled for Matthews authentic package",
      ],
      selectedPath: null,
      capacityConsumption: null,
      postTransactionState: null,
      conclusion: "NOT_IMPLEMENTED — cannot evaluate acquisition investment leg",
    });
    modeledLeafProbe = {
      used: true,
      note: "Modeled leaf recompute after hypothetical secured-debt metric bump — NOT verified simulation; ledger not mutated; UNKNOWN util not zeroed.",
      baselineCovenants: baseline.covenants.map((c) => ({
        code: c.code,
        section: c.operativeSection,
        modeledMm: c.modeledCapacityMm,
        remainingMm: c.remainingCapacityMm,
        authority: c.authorityStatus,
      })),
      postState: change.transactionDeltas.map((d) => ({
        code: d.code,
        modeledMm: d.changedModeledMm,
        deltaMm: d.deltaMm,
      })),
    };
  } else if (args.kind === "RESTRICTED_PAYMENT") {
    applicableCovenants.push({
      covenantFamily: "RESTRICTED_PAYMENTS",
      sourceProvision: null,
      calculation: null,
      missingInputs: [
        "RP negative covenant + exceptions IR",
        "builder / Available Amount inputs",
        "attributed RP utilization ledger with completeness certificate",
        "VerifiedExecutionPackage",
      ],
      selectedPath: null,
      capacityConsumption: null,
      postTransactionState: null,
      conclusion: "BLOCKED — no authentic RP path on Matthews package",
    });
  } else {
    applicableCovenants.push({
      covenantFamily: "ASSET_SALES",
      sourceProvision: null,
      calculation: null,
      missingInputs: [
        "Asset Sale covenant + threshold provision",
        "proceeds / reinvestment basket configuration",
        "fair-value / consideration inputs (not invented)",
        "VerifiedExecutionPackage",
      ],
      selectedPath: null,
      capacityConsumption: null,
      postTransactionState: null,
      conclusion: "BLOCKED — no authentic asset-sale path on Matthews package",
    });
  }

  const truthfulBlocker =
    args.kind === "ACQUISITION"
      ? "VERIFIED_SIMULATE_REFUSED: no authentic VEP; utilization completeness absent; CA §6.01(j) structural zero blocks NEW secured Loan-Party liens; investment leg NOT_IMPLEMENTED. Modeled leaf debt rooms are not production permission."
      : args.kind === "RESTRICTED_PAYMENT"
        ? "EXPLICIT_BLOCKER: Restricted Payments domain NOT_IMPLEMENTED for Matthews authentic package — no RP waterfall, builder, or VEP path. Refusing rather than selecting a favorable synthetic path."
        : "EXPLICIT_BLOCKER: Asset Sales domain NOT_IMPLEMENTED for Matthews authentic package — no assetSale config or VEP path. Refusing rather than inventing proceeds routing.";

  const overallConclusion =
    verified.executable === false
      ? `REFUSED / NOT DETERMINED — ${truthfulBlocker}`
      : "UNEXPECTED EXECUTABLE — investigate (should not occur without VEP)";

  return {
    id: args.id,
    label: args.label,
    ask: args.ask,
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
    draft,
    applicableCovenants,
    verifiedSimulate: {
      executable: verified.executable,
      refusalSummary: verified.refusalSummary,
      certifiedBlockers: verified.certified.blockers,
      pathEnumerationAuthority: pathEnum.authority,
      pathIncompleteReasons: pathEnum.incompleteReasons,
      selectedPathId: verified.selectedPathId,
    },
    recipeShape,
    modeledLeafProbe,
    overallConclusion,
    truthfulBlocker,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const sha = gitSha();
  const slice = runRealDashboardVerticalSlice();
  const domains = domainInventory(slice.evaluation);

  const txAcquisition = await evaluateTransaction({
    id: "txn-debt-funded-acquisition",
    label: "Debt-funded acquisition",
    ask: "Can we finance a $50 million secured debt-funded acquisition on 2024-12-31?",
    amountMillions: 50,
    evaluationDate: "2024-12-31",
    kind: "ACQUISITION",
  });

  const txRp = await evaluateTransaction({
    id: "txn-restricted-payment",
    label: "Restricted payment",
    ask: "Can we make a $25 million restricted payment dividend on 2024-12-31?",
    amountMillions: 25,
    evaluationDate: "2024-12-31",
    kind: "RESTRICTED_PAYMENT",
  });

  const txAssetSale = await evaluateTransaction({
    id: "txn-asset-sale",
    label: "Asset sale",
    ask: "Can we complete a $40 million asset sale disposition on 2024-12-31?",
    amountMillions: 40,
    evaluationDate: "2024-12-31",
    kind: "ASSET_SALE",
  });

  const mtnSimPath = path.join(
    process.cwd(),
    "docs/product-proof/001/artifacts/stage-10-11-capacity-simulation.json",
  );
  const mtnSim = fs.existsSync(mtnSimPath)
    ? JSON.parse(fs.readFileSync(mtnSimPath, "utf8"))
    : null;

  const openPrAudit = {
    note: "Snapshot guidance for human merge. Live mergeability changes; see docs/product-proof/003-real-financing-package-e2e/00-main-and-pr-audit.md.",
    canonicalMainSha: sha,
    alreadyOnMain: [
      { number: 333, title: "PAI false authority / false remaining closure" },
      { number: 334, title: "NS-4 canonical product (delivery evidence + cutoff)" },
    ],
    preferredLandingCandidates: [
      {
        number: 345,
        title: "post-#334 absorb #335/#339 no-write + NS-4 authority gates",
        role: "Preferred single NS-4 absorb tip after #334",
      },
      {
        number: 343,
        title: "Canonical landing: #335 no-write + #334 NS-4 + #336 identity (absorb)",
        role: "Alternate absorb tip — do not merge both #345 and #343",
      },
      {
        number: 340,
        title: "Cross-domain Simulate integration with canonical verified-remaining authority",
        role: "Cross-domain v2 — after NS-4 absorb; supersedes competing v1 modules",
      },
      {
        number: 341,
        title: "absorb #322 executable financial path onto post-#333 main",
        role: "AFC / contractual leverage — rebase after absorb tip; CONFLICTING forks must close",
      },
    ],
    doNotSelfMerge: true,
  };

  const report = {
    schema: "product-proof-003-real-financing-package-e2e.v1",
    evaluatedAt: new Date().toISOString(),
    canonicalMainSha: sha,
    package: {
      key: slice.evaluation.packageKey,
      companyId: slice.evaluation.companyId,
      asOf: slice.evaluation.asOf,
      authenticity: "AUTHENTIC_SOURCE_BACKED",
      governingDocuments: MATTHEWS_GOVERNING_DOCUMENTS,
      secondaryReference: {
        package: "MTN Tenth A&R (Product Proof 001 frozen)",
        capacitySimulationArtifact: mtnSimPath,
        note: mtnSim?.note ?? null,
      },
    },
    constraintsHonored: [
      "canonical main-based implementation only — no competing engine",
      "no invented financial approvals",
      "no zero utilization assumptions",
      "no synthetic legal interpretations",
      "no favorable path selection",
      "no Neon writes",
      "no paid inference",
      "no self-merge",
    ],
    domainStatus: domains,
    milestones: slice.milestones,
    sliceVerdict: slice.verdict,
    productionHandoffRefused: slice.evaluation.productionHandoffRefused,
    productionHandoffReasons: slice.evaluation.productionHandoffReasons,
    numericalHonesty: slice.numericalHonesty,
    transactions: [txAcquisition, txRp, txAssetSale],
    openIntegrationPrAudit: openPrAudit,
    overallProductVerdict: "PARTIAL_PRODUCT_CAPABILITY_PROVEN",
    overallProductVerdictReason:
      "Authentic Matthews package yields modeled debt/lien leaf calculations and correct fail-closed refusals for verified simulation, RP, and asset sale. End-to-end customer-ready permission for three real transactions is NOT proven.",
  };

  writeJson("00-evaluation.json", report);
  writeJson("01-domain-status.json", domains);
  writeJson("02-transactions.json", report.transactions);
  writeJson("03-slice-milestones.json", {
    milestones: slice.milestones,
    verdict: slice.verdict,
    blockers: slice.blockers,
    numericalHonesty: slice.numericalHonesty,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sha,
        verdict: report.overallProductVerdict,
        domains: domains.map((d) => ({ domain: d.domain, status: d.status })),
        transactions: report.transactions.map((t) => ({
          id: t.id,
          executable: t.verifiedSimulate.executable,
          blocker: t.truthfulBlocker,
        })),
        outDir: OUT_DIR,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
