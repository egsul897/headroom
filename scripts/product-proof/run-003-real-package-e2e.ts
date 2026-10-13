/**
 * Product Proof 003 — Real financing-package E2E evaluation.
 *
 * Reproducible. Offline. No Neon writes. No paid inference.
 * No invented financial approvals, zero-utilization assumptions,
 * synthetic legal interpretations, or favorable path selection.
 *
 * Primary package: Matthews International Q1 FY2025 authentic slice
 * (debt / liens modeled leaf). Authentic multi-family units for
 * Investments / Restricted Payments / Asset Sales are sourced from the
 * CONMED curated Article VII fixture (mission allows alternate authentic
 * package where those provisions are evidenced).
 *
 * Usage (from repo root):
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
import {
  compileConmedAuthenticMultiFamily,
  evaluateAuthenticTransaction,
  type AuthenticTxnEvaluation,
  type ConmedMultiFamilyCompileResult,
} from "@/lib/product/authentic-multi-family";

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
  sourcePackage?: string;
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
  entityScope?: string | null;
  sourceCitation?: string | null;
  verifiedRemainingUsd?: null;
};

type TransactionEval = {
  id: string;
  label: string;
  ask: string;
  amountMillions: number;
  evaluationDate: string;
  draft: ReturnType<typeof parseTransactionDraft>;
  packageBinding: {
    companyId: string;
    instrumentKey: string;
    authenticity: string;
    note: string;
  };
  applicableCovenants: CovenantTrail[];
  verifiedSimulate: {
    executable: boolean;
    refusalSummary: string[];
    certifiedBlockers: string[];
    pathEnumerationAuthority: string;
    pathIncompleteReasons: string[];
    selectedPathId: string | null;
    capacityOutcome: string | null;
    simulationOutcome: string | null;
    selectedPathResult: string | null;
    verifiedRemainingUsd: null;
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
  authenticMultiFamily?: AuthenticTxnEvaluation | null;
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

function domainInventory(
  slice = evaluateMatthewsVerticalSlice(),
  conmed: ConmedMultiFamilyCompileResult,
): DomainRow[] {
  const debtCodes = slice.covenants.filter((c) => c.code.startsWith("ind_"));
  const lienCodes = slice.covenants.filter((c) => c.code.startsWith("ca_lien"));
  const unitByFamily = (family: string) =>
    conmed.units.find((u) => u.family === family) ?? null;

  const rp = unitByFamily("RESTRICTED_PAYMENTS");
  const inv = unitByFamily("INVESTMENTS");
  const as = unitByFamily("ASSET_SALES");

  const familyStatus = (u: typeof rp): DomainStatus => {
    if (!u) return "NOT_IMPLEMENTED";
    // Fidelity-pass + hypo gross is PARTIAL — never independently executable without
    // Phase-3 semantic certification, operative-state resolution, and remaining completeness.
    if (
      u.capability.rollup === "FIDELITY_PASS_HYPOTHETICAL_GROSS_NOT_CERTIFIED" ||
      u.capability.rollup === "COMPILE_PARTIAL_NOT_AUTHORITATIVE"
    ) {
      return "PARTIALLY_EXECUTABLE";
    }
    if (u.capability.rollup === "FAILED" || u.capability.rollup === "UNSUPPORTED") {
      return "NOT_IMPLEMENTED";
    }
    return "NOT_IMPLEMENTED";
  };

  const familyEvidence = (u: NonNullable<typeof rp>): string[] => [
    `${u.candidateId} ${u.sourceCitation}`,
    `rollup=${u.capability.rollup} fidelityPass=${u.capability.fidelityPass} hypoGrossCalculable=${u.capability.hypotheticalGrossCalculable}`,
    `semanticCertification=${u.capability.semanticCertification}`,
    `operativeState=${u.capability.operativeState}`,
    `productionRemaining=${u.capability.productionRemaining}`,
    `grossUsd=${u.grossCapacityUsd} (hypothetical probe only; CTA not APPROVED NS-4)`,
    `verifiedRemainingUsd=null`,
    `ruleSufficiency=${u.ruleSufficiency}`,
    `authoritativeBlockers=${u.capability.authoritativeBlockers.join(" | ")}`,
  ];

  const familyBlockers = (u: NonNullable<typeof rp> | null, section: string): string[] => [
    `Matthews authentic slice has no ${section} provision — CONMED used as authentic alternate text only`,
    "No Phase-3 SemanticVerificationResult / VerifiedUnitArtifact — CERTIFIED_4E not claimed",
    "Verified remaining unpublished — no utilization completeness",
    ...(u?.diagnosticEvidence ?? []),
    "Not VERIFIED_TRANSACTION_PERMITTED for customer handoff",
  ];

  return [
    {
      domain: "debt_incurrence",
      status: "PARTIALLY_EXECUTABLE",
      sourcePackage: "matthews-q1-fy2025",
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
      sourcePackage: "matthews-q1-fy2025",
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
      status: familyStatus(inv),
      sourcePackage: "conmed-2025-credit-facility-article-vii",
      evidence: inv
        ? [...familyEvidence(inv), `formulation=${inv.formulation} ruleId=${inv.ruleId}`]
        : ["No CONMED investment unit compiled"],
      blockers: familyBlockers(inv, "Investment"),
      mainFiles: [
        "lib/product/authentic-multi-family/conmed-source-units.ts",
        "lib/product/authentic-multi-family/compile-conmed-vep.ts",
        "lib/contract-model/compiler/greater-of-assets-basket/",
      ],
    },
    {
      domain: "restricted_payments",
      status: familyStatus(rp),
      sourcePackage: "conmed-2025-credit-facility-article-vii",
      evidence: rp
        ? [...familyEvidence(rp), `formulation=${rp.formulation} ruleId=${rp.ruleId}`]
        : ["No CONMED RP unit compiled"],
      blockers: [
        ...familyBlockers(rp, "Restricted Payments"),
        "Ratio / builder RP baskets (e.g. §7.6(e)) not claimed here",
      ],
      mainFiles: [
        "lib/product/authentic-multi-family/conmed-source-units.ts",
        "lib/product/authentic-multi-family/compile-conmed-vep.ts",
        "lib/contract-model/compiler/fixed-dollar-basket/",
      ],
    },
    {
      domain: "asset_sales",
      status: familyStatus(as),
      sourcePackage: "conmed-2025-credit-facility-article-vii",
      evidence: as
        ? [
            ...familyEvidence(as),
            `formulation=${as.formulation} ruleId=${as.ruleId}`,
            "ASSET_SALE ContemplatedTxnKind + recipeAssetSale intake wired",
          ]
        : ["No CONMED asset-sale unit compiled"],
      blockers: [
        ...familyBlockers(as, "Asset Sales"),
        "De minimis §7.5(j) only; §7.5(f) annual baskets not claimed",
      ],
      mainFiles: [
        "lib/product/authentic-multi-family/conmed-source-units.ts",
        "lib/product/authentic-multi-family/compile-conmed-vep.ts",
        "lib/product/north-star-workflow/verified-path-enumeration.ts",
        "lib/product/north-star-workflow/transaction-effect-recipes.ts",
      ],
    },
    {
      domain: "applicable_financial_covenants",
      status: "PARTIALLY_EXECUTABLE",
      sourcePackage: "matthews-q1-fy2025 + main contractual-metrics (#345/#332)",
      evidence: [
        `FCCR / Secured Net Leverage modeled rooms present as leaf rows: ${debtCodes
          .filter((c) => c.formulaType.includes("RATIO") || c.code.includes("ratio") || c.code.includes("fccr"))
          .map((c) => `${c.code}=${c.modeledCapacityMm}`)
          .join(", ") || "none tagged"}`,
        `Trusted issuer activation: ${TRUSTED_ISSUER_ACTIVATION}`,
        "Main tip absorbed #345 post-#334 NS-4 gates + contractual-metrics / financial-metric-resolver modules",
        "Open PR #341 still holds corrected AFC conditional-authority tip not fully absorbed here (no duplicate leverage engine landed)",
      ],
      blockers: [
        "Modeled ratio rooms are not published as remainingCapacityMm (D3b)",
        "CONSOLIDATED_EBITDA is PUBLIC_FILING_RECONSTRUCTION / UNVERIFIED_EXTRACTION",
        "Corrected #341 tip not fully merged — refuse inventing APPROVED certificates",
      ],
      mainFiles: [
        "lib/product/real-dashboard-vertical-slice/evaluate-covenants.ts",
        "lib/product/contractual-metrics/",
        "lib/product/financial-metric-resolver/",
        "lib/capacity/*",
      ],
    },
    {
      domain: "amendments",
      status: "PARTIALLY_EXECUTABLE",
      sourcePackage: "matthews + conmed fixtures",
      evidence: [
        "CA §6.01(j) leaf cites Sixth Amendment restatement (structural zero) — source-backed caveat on modeled leaf",
        "Phase-2G amendment precedence / operative-state libraries exist on main",
        "CONMED curated fixture includes first-omnibus / second-amendment texts — not auto-attached as operative supersession for these units",
        "Multi-family units bind documentId + sourceSectionRef; amendment effects remain REVIEW_REQUIRED until attached",
      ],
      blockers: [
        "No full as-amended operative IR package for Matthews credit agreement on product path",
        "CONMED Omnibus/Second-Amendment effects not attached to Article VII unit compile in this proof",
      ],
      mainFiles: [
        "lib/contract-model/compiler/* (operative / amendment)",
        "lib/product/legal-reasoning/amendment-graph.ts",
        "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/",
      ],
    },
    {
      domain: "shared_capacity",
      status: "PARTIALLY_EXECUTABLE",
      sourcePackage: "main IR + open #340 supporting",
      evidence: [
        "Phase 4C IRSharedCapacity + verified-execution shared capacity units implemented in-memory",
        "Matthews leaf does not bind a shared Debt Facilities / Lien shared-cap unit for dual-path NEW secured debt",
        "CONMED multi-family units are single-rule capacity nodes (no shared-cap pair claimed here)",
        "Cross-domain Simulate (#340) not absorbed as a second engine — verified spine owns permissibility",
      ],
      blockers: [
        "Authentic package lacks certified shared-capacity unit + companion discharge for secured dual-path",
        "Open PR #340 cross-domain v2 remains human tip — not landed here to avoid duplicate engines",
      ],
      mainFiles: [
        "lib/contract-model/verified-execution.ts",
        "lib/contract-model/runtime/capacity/*",
      ],
    },
    {
      domain: "historical_utilization",
      status: "BLOCKED_BY_MISSING_REAL_EVIDENCE",
      sourcePackage: "matthews-q1-fy2025",
      evidence: [
        `Attributed events: ${slice.utilization.attributedEventCount} totaling ${slice.utilization.attributedAmountMm} mm`,
        `supportsRemainingClaim=${slice.utilization.supportsRemainingClaim}`,
        `unknownHistoricalActivity=${slice.utilization.unknownHistoricalActivity}`,
        `completenessCertificatePresent=${slice.utilization.completenessCertificatePresent}`,
        `trustedIssuerActivation=${slice.utilization.trustedIssuerActivation}`,
        "CONMED multi-family: verifiedRemainingUsd forced null on every unit",
      ],
      blockers: [
        "No reviewer-confirmed utilization completeness certificate",
        "UNKNOWN historical activity must not be treated as zero",
        "Production remaining publication refused (correct fail-closed)",
        "Missing utilization is NOT an excuse to stop other families — RP/Inv/AS progressed independently",
      ],
      mainFiles: [
        "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
        "lib/capacity/*",
        "lib/product/verified-transaction-execution/adapters/utilization.ts",
      ],
    },
  ];
}

/** Offline-safe bridge: never fail the proof on Neon unavailability. */
async function attemptVerifiedSimulateOffline(
  args: Parameters<typeof attemptVerifiedSimulate>[0],
): Promise<Awaited<ReturnType<typeof attemptVerifiedSimulate>>> {
  try {
    return await attemptVerifiedSimulate(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const offline =
      /Can't reach database|PrismaClientInitializationError|ECONNREFUSED|ENOTFOUND/i.test(
        msg,
      );
    if (!offline) throw err;
    return {
      certified: {
        ok: false,
        blockers: [`OFFLINE_NS4_BRIDGE:${msg.slice(0, 160)}`],
        authorityNote: "PP003 offline — Neon NS-4 bridge unavailable; authentic REQUIRE path is separate",
        readiness: null as never,
        cutoff: null as never,
      } as never,
      pathEnumeration: enumerateCertifiedPaths({
        verifiedPackage: args.verifiedPackage ?? null,
        transactionKind: args.kind,
        secured: args.secured ?? null,
      }),
      selectedPathId: null,
      selectedPath: null,
      transaction: null,
      executable: false,
      refusalSummary: [`OFFLINE_NS4_BRIDGE:${msg.slice(0, 120)}`],
      pathAutoSelected: false,
    };
  }
}

async function evaluateAcquisitionTransaction(args: {
  amountMillions: number;
  evaluationDate: string;
  ask: string;
  conmed: ConmedMultiFamilyCompileResult;
}): Promise<TransactionEval> {
  const draft = parseTransactionDraft(args.ask);

  const verified = await attemptVerifiedSimulateOffline({
    companyId: "matthews",
    evaluationDate: args.evaluationDate,
    amountMillions: args.amountMillions,
    kind: "ACQUISITION",
    secured: true,
    verifiedPackage: null,
  });

  const pathEnum = enumerateCertifiedPaths({
    verifiedPackage: null,
    transactionKind: "ACQUISITION",
    secured: true,
  });

  const identity = {
    companyId: "matthews",
    instrumentKey: "matthews-international-q1-fy2025",
    transactionId: "pp003-txn-debt-funded-acquisition",
    effectiveAsOf: args.evaluationDate,
    provenance: {
      source: "product-proof-003-real-package-e2e",
      sourceVersion: "pp003.v2-capability",
      approvalRef: null,
    },
    approvalStatus: "HYPOTHETICAL" as const,
  };

  const secured = recipeSecuredBorrowing(identity, {
    draws: [],
    label: "Debt-funded acquisition (no authentic capacity nodes supplied)",
  });
  const investment = recipeRestrictedInvestment(identity, {
    draws: [],
    label: "Acquisition investment leg without Matthews capacity node",
  });

  // Authentic investment-leg probe on CONMED §7.8(l) — does not invent Matthews authority.
  const invEval = evaluateAuthenticTransaction({
    compiled: args.conmed,
    kind: "INVESTMENT",
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
  });

  const baseline = evaluateMatthewsVerticalSlice();
  const change = demonstrateChangePropagation({
    hypotheticalSecuredDebtMm: args.amountMillions,
  });

  const applicableCovenants: CovenantTrail[] = [];
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
      verifiedRemainingUsd: null,
    });
  }
  applicableCovenants.push({
    covenantFamily: "INVESTMENTS",
    sourceProvision: invEval.unit?.sourceCitation ?? null,
    calculation: invEval.unit
      ? `CONMED hypo gross probe: grossUsd=${invEval.hypotheticalGrossProbeUsd}; pathAuth=${invEval.pathEnumerationAuthority}; sim=${invEval.simulationOutcome}; blocker=${invEval.truthfulBlocker}`
      : null,
    missingInputs: [
      "Matthews Investment basket (NOT_IMPLEMENTED on Matthews package)",
      "APPROVED NS-4 Consolidated Total Assets for production greater-of",
      "utilization completeness certificate",
    ],
    selectedPath: invEval.selectedPathId,
    capacityConsumption:
      invEval.simulationOutcome === "EXECUTED"
        ? `REQUIRE simulate ${invEval.simulationOutcome} / path ${invEval.selectedPathResult} — remaining null`
        : null,
    postTransactionState: null,
    conclusion: invEval.overallConclusion,
    entityScope: invEval.unit?.entityScopeNote ?? null,
    sourceCitation: invEval.unit?.sourceCitation ?? null,
    verifiedRemainingUsd: null,
  });

  const truthfulBlocker =
    "VERIFIED_SIMULATE_REFUSED on Matthews: no authentic VEP; utilization completeness absent; CA §6.01(j) structural zero blocks NEW secured Loan-Party liens. CONMED §7.8(l) investment leg is fidelity-pass hypothetical gross only (NOT_CERTIFIED_4E; no Phase-3 artifact; remaining null) — not VERIFIED_TRANSACTION_PERMITTED for the acquisition as a whole.";

  return {
    id: "txn-debt-funded-acquisition",
    label: "Debt-funded acquisition",
    ask: args.ask,
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
    draft,
    packageBinding: {
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      authenticity: "AUTHENTIC_SOURCE_BACKED",
      note: "Debt/lien leaf = Matthews; investment-leg REQUIRE probe = CONMED §7.8(l) authentic alternate (not Matthews authority).",
    },
    applicableCovenants,
    verifiedSimulate: {
      executable: false,
      refusalSummary: verified.refusalSummary,
      certifiedBlockers: verified.certified.blockers,
      pathEnumerationAuthority: pathEnum.authority,
      pathIncompleteReasons: pathEnum.incompleteReasons,
      selectedPathId: null,
      capacityOutcome: invEval.capacityOutcome,
      simulationOutcome: invEval.simulationOutcome,
      selectedPathResult: invEval.selectedPathResult,
      verifiedRemainingUsd: null,
    },
    recipeShape: {
      kind: "SECURED_BORROWING+INVESTMENT",
      limitations: [
        ...secured.limitations.map((l) => ({ code: l.code, message: l.message })),
        ...investment.limitations.map((l) => ({ code: l.code, message: l.message })),
      ],
      note: "Recipe API accepts only caller-supplied capacity node ids — none invented for Matthews; CONMED investment ruleId not auto-injected into Matthews recipe.",
    },
    modeledLeafProbe: {
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
    },
    authenticMultiFamily: invEval,
    overallConclusion: `REFUSED / NOT DETERMINED — ${truthfulBlocker}`,
    truthfulBlocker,
  };
}

async function evaluateConmedFamilyTransaction(args: {
  id: string;
  label: string;
  ask: string;
  amountMillions: number;
  evaluationDate: string;
  kind: "RESTRICTED_PAYMENT" | "ASSET_SALE";
  conmed: ConmedMultiFamilyCompileResult;
}): Promise<TransactionEval> {
  const draft = parseTransactionDraft(args.ask);
  const auth = evaluateAuthenticTransaction({
    compiled: args.conmed,
    kind: args.kind,
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
  });

  // Product bridge is optional/offline-tolerant. Authentic REQUIRE path (auth) is authoritative for this proof.
  const verified = await attemptVerifiedSimulateOffline({
    companyId: "conmed",
    evaluationDate: args.evaluationDate,
    amountMillions: args.amountMillions,
    kind: args.kind,
    secured: null,
    verifiedPackage: args.conmed.verifiedPackage,
    pathId: auth.selectedPathId,
    instrumentKey: "conmed-eighth-ar-credit-agreement",
  });

  const identity = {
    companyId: "conmed",
    instrumentKey: "conmed-eighth-ar-credit-agreement",
    transactionId: `pp003-${args.id}`,
    effectiveAsOf: args.evaluationDate,
    provenance: {
      source: "product-proof-003-real-package-e2e",
      sourceVersion: "pp003.v2-capability",
      approvalRef: null,
    },
    approvalStatus: "HYPOTHETICAL" as const,
  };

  let recipeShape: TransactionEval["recipeShape"];
  if (args.kind === "RESTRICTED_PAYMENT") {
    const draws =
      auth.unit?.ruleId != null
        ? [
            {
              effectId: "consume-rp",
              capacityNodeId: `capacity:rule:${auth.unit.ruleId}`,
              amount: {
                type: "MONEY" as const,
                amount: String(Math.round(args.amountMillions * 1_000_000)),
                currency: "USD",
              },
              ruleId: auth.unit.ruleId,
            },
          ]
        : [];
    const rp = recipeDividendPayment(identity, {
      draws,
      label: "CONMED §7.6(d) RP with authentic capacity node",
    });
    recipeShape = {
      kind: "DIVIDEND_PAYMENT",
      limitations: rp.limitations.map((l) => ({ code: l.code, message: l.message })),
      note:
        draws.length > 0
          ? "Recipe bound to CONMED fidelity-passing RP rule capacity node — remaining still unpublished."
          : "No authentic RP capacity node — recipe refuses empty draws.",
    };
  } else {
    const draws =
      auth.unit?.ruleId != null
        ? [
            {
              effectId: "consume-asset-sale",
              capacityNodeId: `capacity:rule:${auth.unit.ruleId}`,
              amount: {
                type: "MONEY" as const,
                amount: String(Math.round(args.amountMillions * 1_000_000)),
                currency: "USD",
              },
              ruleId: auth.unit.ruleId,
            },
          ]
        : [];
    const as = recipeAssetSale(identity, {
      metrics: [],
      draws,
      label: "CONMED §7.5(j) disposition with authentic capacity draw",
    });
    recipeShape = {
      kind: "ASSET_SALE",
      limitations: as.limitations.map((l) => ({ code: l.code, message: l.message })),
      note:
        draws.length > 0
          ? "ASSET_SALE recipe bound to CONMED §7.5(j) capacity node — accounting treatment not inferred."
          : "No authentic asset-sale capacity node — recipe refuses empty shape.",
    };
  }

  const family = args.kind === "RESTRICTED_PAYMENT" ? "RESTRICTED_PAYMENTS" : "ASSET_SALES";
  const applicableCovenants: CovenantTrail[] = [
    {
      covenantFamily: family,
      sourceProvision: auth.unit?.sourceCitation ?? null,
      calculation: auth.unit
        ? `grossUsd=${auth.unit.grossCapacityUsd}; fidelity=${auth.unit.fidelityVerdict}; capacity=${auth.capacityOutcome}; sim=${auth.simulationOutcome}; pathResult=${auth.selectedPathResult}`
        : null,
      missingInputs: [
        "utilization completeness certificate",
        "APPROVED NS-4 financial snapshot for production remaining",
        ...(args.kind === "ASSET_SALE"
          ? ["APPROVED Consolidated Total Assets for production greater-of (EMPTY_RESOLVER in REQUIRE path)"]
          : []),
      ],
      selectedPath: auth.selectedPathId,
      capacityConsumption:
        auth.simulationOutcome != null
          ? `REQUIRE ${auth.simulationOutcome} / selectedPathResult=${auth.selectedPathResult} / remaining=null`
          : null,
      postTransactionState: null,
      conclusion: auth.overallConclusion,
      entityScope: auth.unit?.entityScopeNote ?? null,
      sourceCitation: auth.unit?.sourceCitation ?? null,
      verifiedRemainingUsd: null,
    },
  ];

  // Affirmative customer PERMITTED never claimed — remaining null + path INDETERMINATE.
  const executable = false;
  const truthfulBlocker =
    auth.truthfulBlocker ??
    "AUTHENTIC_UNIT_PRESENT_BUT_NOT_PERMITTED: verified remaining null; completeness absent";

  return {
    id: args.id,
    label: args.label,
    ask: args.ask,
    amountMillions: args.amountMillions,
    evaluationDate: args.evaluationDate,
    draft,
    packageBinding: {
      companyId: "conmed",
      instrumentKey: "conmed-eighth-ar-credit-agreement",
      authenticity: "AUTHENTIC_FIXTURE_SOURCE",
      note: "CONMED curated Article VII — fidelity-gated VE units; not package CERTIFIED; remaining null.",
    },
    applicableCovenants,
    verifiedSimulate: {
      executable,
      refusalSummary: [
        ...verified.refusalSummary,
        ...(auth.truthfulBlocker ? [auth.truthfulBlocker] : []),
      ],
      certifiedBlockers: verified.certified.blockers,
      pathEnumerationAuthority: auth.pathEnumerationAuthority,
      pathIncompleteReasons: [],
      selectedPathId: auth.selectedPathId,
      capacityOutcome: auth.capacityOutcome,
      simulationOutcome: auth.simulationOutcome,
      selectedPathResult: auth.selectedPathResult,
      verifiedRemainingUsd: null,
    },
    recipeShape,
    modeledLeafProbe: {
      used: false,
      note: "Matthews modeled leaf not used — CONMED authentic multi-family REQUIRE path.",
    },
    authenticMultiFamily: auth,
    overallConclusion: auth.overallConclusion,
    truthfulBlocker,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const sha = gitSha();
  const slice = runRealDashboardVerticalSlice();
  const conmed = compileConmedAuthenticMultiFamily("2024-12-31");
  const domains = domainInventory(slice.evaluation, conmed);

  const txAcquisition = await evaluateAcquisitionTransaction({
    ask: "Can we finance a $50 million secured debt-funded acquisition on 2024-12-31?",
    amountMillions: 50,
    evaluationDate: "2024-12-31",
    conmed,
  });

  const txRp = await evaluateConmedFamilyTransaction({
    id: "txn-restricted-payment",
    label: "Restricted payment",
    ask: "Can we make a $25 million restricted payment dividend on 2024-12-31?",
    amountMillions: 25,
    evaluationDate: "2024-12-31",
    kind: "RESTRICTED_PAYMENT",
    conmed,
  });

  const txAssetSale = await evaluateConmedFamilyTransaction({
    id: "txn-asset-sale",
    label: "Asset sale",
    ask: "Can we complete a $40 million asset sale disposition on 2024-12-31?",
    amountMillions: 40,
    evaluationDate: "2024-12-31",
    kind: "ASSET_SALE",
    conmed,
  });

  const mtnSimPath = path.join(
    process.cwd(),
    "docs/product-proof/001/artifacts/stage-10-11-capacity-simulation.json",
  );
  const mtnSim = fs.existsSync(mtnSimPath)
    ? JSON.parse(fs.readFileSync(mtnSimPath, "utf8"))
    : null;

  const consolidation = {
    baselinePr: 346,
    baselineSha: "046161e78dc206c50ee951d71a18dfa4befd3206",
    absorbed: [
      {
        number: 345,
        tip: "d91b0a977ef6c92c9224b096306f7dfc8695cdbc",
        how: "Merged origin/main (includes Merge PR #345) into this branch — NS-4 absorb + no-write gates + contractual-metrics modules.",
      },
    ],
    notFullMergedAvoidingDuplicateEngines: [
      {
        number: 340,
        tip: "7e3974fcdd1a54c0f8762e41873ed2be045a8a14",
        reason:
          "Cross-domain Simulate v2 would land a second permissibility surface. Verified-execution REQUIRE spine owns transaction evaluation here; #340 remains human tip / supporting.",
      },
      {
        number: 341,
        tip: "1dc10c4c301257a578ac9758b3f232396020e1c4",
        reason:
          "Corrected AFC/conditional-authority tip still open; main already carries overlapping financial-metric-resolver via #345/#332. Full tip not merged — no competing contractual-leverage engine.",
      },
    ],
    doNotSelfMerge: true,
  };

  const independentlyExecutable = domains
    .filter((d) => d.status === "IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE")
    .map((d) => d.domain);
  const fidelityHypoFamilies = conmed.fidelityPassHypotheticalGrossFamilies;

  const report = {
    schema: "product-proof-003-real-financing-package-e2e.v3-certification-integrity",
    evaluatedAt: new Date().toISOString(),
    canonicalMainSha: sha,
    baselineSha: consolidation.baselineSha,
    auditedShaRemediationFrom: "bd594716516d5b3905f6a8a40dcdeb33cb2691a5",
    package: {
      key: slice.evaluation.packageKey,
      companyId: slice.evaluation.companyId,
      asOf: slice.evaluation.asOf,
      authenticity: "AUTHENTIC_SOURCE_BACKED",
      governingDocuments: MATTHEWS_GOVERNING_DOCUMENTS,
      authenticMultiFamilyAlternate: {
        ...conmed.manifest,
        independentlyExecutableFamilies: conmed.independentlyExecutableFamilies,
        fidelityPassHypotheticalGrossFamilies: fidelityHypoFamilies,
        certificationIntegrity: conmed.certificationIntegrity,
        units: conmed.units,
      },
      secondaryReference: {
        package: "MTN Tenth A&R (Product Proof 001 frozen)",
        capacitySimulationArtifact: mtnSimPath,
        note: mtnSim?.note ?? null,
      },
    },
    constraintsHonored: [
      "no fabricated Phase-3 SemanticVerificationResult / VerifiedUnitArtifact",
      "no CERTIFIED_4E from manufactured verification artifacts",
      "no fallback selected path / no simulate without eligible CANDIDATE path",
      "hypothetical $2bn CTA never represented as APPROVED NS-4",
      "verified remaining forced null without completeness",
      "no customer VERIFIED_TRANSACTION_PERMITTED",
      "no competing engine / no self-merge",
      "no Neon writes / no paid inference",
    ],
    domainStatus: domains,
    independentlyExecutableFamilies: independentlyExecutable,
    fidelityPassHypotheticalGrossFamilies: fidelityHypoFamilies,
    certificationIntegrity: conmed.certificationIntegrity,
    milestones: slice.milestones,
    sliceVerdict: slice.verdict,
    productionHandoffRefused: slice.evaluation.productionHandoffRefused,
    productionHandoffReasons: slice.evaluation.productionHandoffReasons,
    numericalHonesty: slice.numericalHonesty,
    transactions: [txAcquisition, txRp, txAssetSale],
    consolidationAbsorb: consolidation,
    overallProductVerdict: "PARTIAL_PRODUCT_CAPABILITY_PROVEN",
    overallProductVerdictReason:
      fidelityHypoFamilies.length > 0
        ? `CONMED ${fidelityHypoFamilies.join(", ")}: fidelity-pass + hypothetical gross calculable; Phase-3 absent → NOT_CERTIFIED_4E; simulate not invoked; remaining null; not VERIFIED_TRANSACTION_PERMITTED. No family is IMPLEMENTED_AND_INDEPENDENTLY_EXECUTABLE. Matthews debt/lien remain PARTIALLY_EXECUTABLE.`
        : "No fidelity-pass hypothetical-gross authentic families.",
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
  writeJson("04-conmed-multi-family.json", {
    manifest: conmed.manifest,
    units: conmed.units,
    independentlyExecutableFamilies: conmed.independentlyExecutableFamilies,
    fidelityPassHypotheticalGrossFamilies: fidelityHypoFamilies,
    partialFamilies: conmed.partialFamilies,
    failedFamilies: conmed.failedFamilies,
    certificationIntegrity: conmed.certificationIntegrity,
    candidateRuleCount: conmed.candidateRules.length,
    verifiedPackage: conmed.verifiedPackage,
  });
  writeJson("05-consolidation-absorb.json", consolidation);

  console.log(
    JSON.stringify(
      {
        ok: true,
        sha,
        baselineSha: consolidation.baselineSha,
        verdict: report.overallProductVerdict,
        independentlyExecutableFamilies: independentlyExecutable,
        fidelityPassHypotheticalGrossFamilies: fidelityHypoFamilies,
        certificationIntegrity: conmed.certificationIntegrity,
        domains: domains.map((d) => ({
          domain: d.domain,
          status: d.status,
          sourcePackage: d.sourcePackage,
        })),
        transactions: report.transactions.map((t) => ({
          id: t.id,
          executable: t.verifiedSimulate.executable,
          pathAuth: t.verifiedSimulate.pathEnumerationAuthority,
          capacity: t.verifiedSimulate.capacityOutcome,
          sim: t.verifiedSimulate.simulationOutcome,
          pathResult: t.verifiedSimulate.selectedPathResult,
          remaining: t.verifiedSimulate.verifiedRemainingUsd,
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
