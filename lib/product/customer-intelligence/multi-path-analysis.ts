/**
 * Multi-path transaction analysis — enumerate contractual pathways without
 * assuming stacking unless the document expressly authorizes combination.
 * Distinguishes AI-proposed paths from counsel-compiled executable capacity.
 */

import {
  computeLeverageMetrics,
  evaluateProvision,
  type FormulaParams,
  type FormulaType,
} from "@/lib/covenant-engine";
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import type { ReviewerApproval } from "./reviewer-approvals";

export type PathFamily =
  | "GENERAL_DEBT"
  | "RATIO_DEBT"
  | "INCREMENTAL"
  | "ACQUISITION_DEBT"
  | "REFINANCING"
  | "GENERAL_LIEN"
  | "RATIO_LIEN"
  | "LIEN_SECURING_PERMITTED_DEBT"
  | "FIXED_RP"
  | "BUILDER_RP"
  | "RATIO_RP"
  | "FIXED_INVESTMENT"
  | "BUILDER_INVESTMENT"
  | "OTHER";

export type PathStatus = "EXECUTABLE" | "AI_PROPOSED" | "CONDITIONAL" | "INSUFFICIENT";

export interface TransactionPath {
  pathId: string;
  label: string;
  family: PathFamily;
  sectionRef: string;
  citation: string;
  heading: string;
  formulaHint: string | null;
  formulaType: string | null;
  capacityMillions: number | null;
  status: PathStatus;
  reviewDecision: string | null;
  conditions: string[];
  assumptions: string[];
  stackingHint: "EXPRESSLY_SHARED" | "UNKNOWN_DO_NOT_ASSUME" | "ALTERNATIVE_ONLY";
  permissionCode: string | null;
}

export interface MultiPathAnalysis {
  transaction: {
    amountMillions: number;
    kind: "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "ACQUISITION";
    secured: boolean;
    label: string;
  };
  /**
   * Authority of numerical capacity on these paths.
   * Product multipath uses legacy covenant-engine + counsel Permissions — NOT Phase 4E.
   */
  authority: "LEGACY_ENGINE_MULTIPATH" | "AI_PROPOSED_ONLY";
  paths: TransactionPath[];
  /** Paths that alone can support the full amount (executable or computed). */
  sufficientSinglePaths: TransactionPath[];
  /** Paths that partially support the amount. */
  partialPaths: TransactionPath[];
  combination: {
    stackingAssumed: false;
    note: string;
    feasibleAllocation: Array<{ pathId: string; allocateMillions: number; status: PathStatus }> | null;
  };
  narrative: string;
  citations: string[];
  missingForFullExecutable: string[];
}

export interface CompiledPermissionInput {
  id: string;
  code: string | null;
  grantType: string;
  sectionRef: string;
  formulaType: string;
  thresholdValue: number;
  params: FormulaParams | null;
  action: string;
  modelingStatus: string;
}

export interface FinancialForPaths {
  ebitda: number;
  cash: number;
  interestExpense: number;
  cumulativeNetIncome: number;
  equityProceedsSinceIssue: number;
  assumedNewDebtRatePct: number;
  totalDebt: number;
  securedDebt: number;
  totalAssets?: number;
}

function classifyFamily(item: CovenantSummaryItem, grantType?: string): PathFamily {
  const hay = `${item.category} ${item.heading} ${item.plainEnglish} ${(item.materialBasketsThresholds ?? []).join(" ")}`.toUpperCase();
  const gt = (grantType ?? "").toUpperCase();

  // Grant type is authoritative when counsel-compiled.
  if (gt === "RESTRICTED_PAYMENT") {
    if (/BUILDER|AVAILABLE AMOUNT|CUMULATIVE CREDIT/.test(hay)) return "BUILDER_RP";
    if (/RATIO|LEVERAGE/.test(hay)) return "RATIO_RP";
    return "FIXED_RP";
  }
  if (gt === "INVESTMENT") {
    if (/BUILDER|AVAILABLE AMOUNT/.test(hay)) return "BUILDER_INVESTMENT";
    return "FIXED_INVESTMENT";
  }
  if (gt === "LIEN") {
    if (/RATIO|LEVERAGE/.test(hay)) return "RATIO_LIEN";
    if (/PERMITTED DEBT|SECURING/.test(hay)) return "LIEN_SECURING_PERMITTED_DEBT";
    return "GENERAL_LIEN";
  }
  if (gt === "DEBT_INCURRENCE") {
    if (/REFINANC/.test(hay)) return "REFINANCING";
    if (/INCREMENTAL/.test(hay)) return "INCREMENTAL";
    if (/ACQUISITION/.test(hay)) return "ACQUISITION_DEBT";
    if (/RATIO|LEVERAGE/.test(hay) && !/GREATER OF|FLAT|TOTAL ASSETS|EBITDA/.test(hay)) return "RATIO_DEBT";
    return "GENERAL_DEBT";
  }

  // AI-proposed (no grant type yet)
  if (/REFINANC/.test(hay)) return "REFINANCING";
  if (/INCREMENTAL/.test(hay)) return "INCREMENTAL";
  if (/ACQUISITION/.test(hay) && /DEBT|INDEBTEDNESS/.test(hay)) return "ACQUISITION_DEBT";
  if (/BUILDER|AVAILABLE AMOUNT|CUMULATIVE CREDIT/.test(hay) && /RESTRICTED|DIVIDEND|RP/.test(hay)) return "BUILDER_RP";
  if (/BUILDER|AVAILABLE AMOUNT/.test(hay) && /INVESTMENT/.test(hay)) return "BUILDER_INVESTMENT";
  if (/RATIO|LEVERAGE|FCC|COVERAGE/.test(hay) && /LIEN/.test(hay)) return "RATIO_LIEN";
  if (/RATIO|LEVERAGE/.test(hay) && /DEBT|INDEBTEDNESS/.test(hay) && !/GREATER OF|TOTAL ASSETS/.test(hay)) {
    return "RATIO_DEBT";
  }
  if (/RATIO/.test(hay) && /RESTRICTED|DIVIDEND/.test(hay)) return "RATIO_RP";
  if (/LIEN.*PERMITTED|SECURE.*PERMITTED DEBT|PERMITTED LIEN/.test(hay)) return "LIEN_SECURING_PERMITTED_DEBT";
  if (/LIEN|COLLATERAL/.test(hay) && !/DEBT|INDEBTEDNESS/.test(hay)) return "GENERAL_LIEN";
  if (/RESTRICTED PAYMENT|DIVIDEND/.test(hay)) return "FIXED_RP";
  if (/INVESTMENT/.test(hay) && !/DEBT|INDEBTEDNESS/.test(hay)) return "FIXED_INVESTMENT";
  if (/LIEN/.test(hay)) return "GENERAL_LIEN";
  return "GENERAL_DEBT";
}

function stackingHint(family: PathFamily): TransactionPath["stackingHint"] {
  if (family === "BUILDER_RP" || family === "FIXED_RP" || family === "RATIO_RP") return "EXPRESSLY_SHARED";
  if (family === "BUILDER_INVESTMENT" || family === "FIXED_INVESTMENT") return "EXPRESSLY_SHARED";
  // Debt/lien baskets: do not assume free stacking across general + ratio + incremental.
  return "UNKNOWN_DO_NOT_ASSUME";
}

function relevantForTransaction(
  family: PathFamily,
  kind: MultiPathAnalysis["transaction"]["kind"],
  secured: boolean,
): boolean {
  if (kind === "RESTRICTED_PAYMENT") {
    return family === "FIXED_RP" || family === "BUILDER_RP" || family === "RATIO_RP";
  }
  if (kind === "INVESTMENT" || kind === "ACQUISITION") {
    return (
      family === "FIXED_INVESTMENT" ||
      family === "BUILDER_INVESTMENT" ||
      family === "GENERAL_DEBT" ||
      family === "RATIO_DEBT" ||
      family === "INCREMENTAL" ||
      family === "ACQUISITION_DEBT" ||
      family === "GENERAL_LIEN" ||
      family === "RATIO_LIEN" ||
      family === "LIEN_SECURING_PERMITTED_DEBT" ||
      family === "FIXED_RP"
    );
  }
  // Debt
  const debtFamilies: PathFamily[] = [
    "GENERAL_DEBT",
    "RATIO_DEBT",
    "INCREMENTAL",
    "ACQUISITION_DEBT",
    "REFINANCING",
  ];
  const lienFamilies: PathFamily[] = ["GENERAL_LIEN", "RATIO_LIEN", "LIEN_SECURING_PERMITTED_DEBT"];
  if (secured) return debtFamilies.includes(family) || lienFamilies.includes(family);
  return debtFamilies.includes(family);
}

export function analyzeMultiPathTransaction(params: {
  amountMillions: number;
  kind: MultiPathAnalysis["transaction"]["kind"];
  secured: boolean;
  label: string;
  items: CovenantSummaryItem[];
  approvals: ReviewerApproval[];
  permissions: CompiledPermissionInput[];
  financials: FinancialForPaths | null;
}): MultiPathAnalysis {
  const approvalBySection = new Map(params.approvals.map((a) => [a.sectionRef, a]));
  const permBySection = new Map<string, CompiledPermissionInput[]>();
  for (const p of params.permissions) {
    const list = permBySection.get(p.sectionRef) ?? [];
    list.push(p);
    permBySection.set(p.sectionRef, list);
  }

  const leverage = params.financials ? computeLeverageMetrics(params.financials) : null;
  const paths: TransactionPath[] = [];

  for (const item of params.items) {
    const perms = permBySection.get(item.sectionRef) ?? [];
    const approval = approvalBySection.get(item.sectionRef);
    const familiesToEmit =
      perms.length > 0
        ? perms.map((p) => ({ family: classifyFamily(item, p.grantType), perm: p }))
        : [{ family: classifyFamily(item), perm: null as CompiledPermissionInput | null }];

    for (const { family, perm } of familiesToEmit) {
      if (!relevantForTransaction(family, params.kind, params.secured)) continue;

      let capacityMillions: number | null = null;
      let formulaType: string | null = perm?.formulaType ?? null;
      let status: PathStatus = "AI_PROPOSED";

      if (perm && params.financials && leverage && perm.modelingStatus === "MODELED") {
        const evaluated = evaluateProvision(
          {
            id: perm.id,
            documentId: "multi-path",
            code: perm.code ?? perm.id,
            basketName: perm.action,
            sectionRef: perm.sectionRef,
            formulaType: perm.formulaType as FormulaType,
            thresholdValue: perm.thresholdValue,
            params: perm.params,
          },
          params.financials,
          leverage,
        );
        if (evaluated.status === "modeled" && evaluated.capacity != null && Number.isFinite(evaluated.capacity)) {
          capacityMillions = evaluated.capacity === Infinity ? null : evaluated.capacity;
          status =
            capacityMillions != null && capacityMillions + 1e-9 >= params.amountMillions
              ? "EXECUTABLE"
              : capacityMillions != null
                ? "INSUFFICIENT"
                : "CONDITIONAL";
          if (evaluated.capacity === Infinity) {
            capacityMillions = null;
            status = "EXECUTABLE";
          }
        } else {
          status = "CONDITIONAL";
        }
      } else if (approval && (approval.decision === "ACCEPTED" || approval.decision === "EDITED")) {
        status = "CONDITIONAL";
      }

      const formulaHint =
        (item.materialBasketsThresholds ?? [])[0] ??
        (perm ? `${perm.formulaType} @ ${perm.thresholdValue}` : null);

      paths.push({
        pathId: `${item.sectionRef}:${family}:${perm?.grantType ?? "ai"}`,
        label: `${family.replace(/_/g, " ").toLowerCase()} — §${item.sectionRef}`,
        family,
        sectionRef: item.sectionRef,
        citation: item.sourceCitation,
        heading: item.heading,
        formulaHint,
        formulaType,
        capacityMillions,
        status,
        reviewDecision: approval?.decision ?? null,
        conditions: (item.conditions ?? []).slice(0, 8),
        assumptions: [
          status === "AI_PROPOSED"
            ? "AI-proposed pathway — not counsel-approved executable capacity"
            : status === "EXECUTABLE"
              ? "Counsel-compiled Permission evaluated against financial snapshot"
              : "Conditional — missing counsel compile, financial inputs, or grower/ratio inputs",
        ],
        stackingHint: stackingHint(family),
        permissionCode: perm?.code ?? null,
      });
    }
  }

  // Deduplicate by pathId
  const seen = new Set<string>();
  const deduped = paths.filter((p) => {
    if (seen.has(p.pathId)) return false;
    seen.add(p.pathId);
    return true;
  });

  const sufficientSinglePaths = deduped.filter((p) => p.status === "EXECUTABLE");
  const partialPaths = deduped.filter((p) => p.status === "INSUFFICIENT" && (p.capacityMillions ?? 0) > 0);

  // Feasible allocation only when paths expressly share a pool (RP waterfall style).
  let feasibleAllocation: Array<{ pathId: string; allocateMillions: number; status: PathStatus }> | null =
    null;
  const sharedPool = deduped.filter(
    (p) =>
      p.stackingHint === "EXPRESSLY_SHARED" &&
      (p.status === "EXECUTABLE" || p.status === "INSUFFICIENT") &&
      p.capacityMillions != null,
  );
  if (sharedPool.length && (params.kind === "RESTRICTED_PAYMENT" || params.kind === "INVESTMENT")) {
    let remaining = params.amountMillions;
    const alloc: Array<{ pathId: string; allocateMillions: number; status: PathStatus }> = [];
    for (const p of sharedPool.sort((a, b) => (b.capacityMillions ?? 0) - (a.capacityMillions ?? 0))) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, p.capacityMillions ?? 0);
      if (take <= 0) continue;
      alloc.push({ pathId: p.pathId, allocateMillions: take, status: p.status });
      remaining -= take;
    }
    if (alloc.length) feasibleAllocation = alloc;
  }

  const debtPaths = deduped.filter((p) =>
    ["GENERAL_DEBT", "RATIO_DEBT", "INCREMENTAL", "ACQUISITION_DEBT", "REFINANCING"].includes(p.family),
  );
  const lienPaths = deduped.filter((p) =>
    ["GENERAL_LIEN", "RATIO_LIEN", "LIEN_SECURING_PERMITTED_DEBT"].includes(p.family),
  );

  const narrativeParts: string[] = [];
  narrativeParts.push(
    `Proposed ${params.label}: examined ${deduped.length} contractual pathway(s) across debt/lien/RP/investment regimes.`,
  );
  if (sufficientSinglePaths.length) {
    narrativeParts.push(
      `${sufficientSinglePaths.length} single pathway(s) appear sufficient on a standalone executable basis: ${sufficientSinglePaths
        .map((p) => `§${p.sectionRef} (${p.family})`)
        .join("; ")}.`,
    );
  } else if (partialPaths.length) {
    narrativeParts.push(
      `No single executable pathway covers the full $${params.amountMillions}M. Partial capacity identified on: ${partialPaths
        .map((p) => `§${p.sectionRef} $${p.capacityMillions}M`)
        .join("; ")}.`,
    );
    narrativeParts.push(
      "Do not assume free stacking of general, ratio, and incremental debt baskets unless the operative agreement expressly permits concurrent use without double-counting.",
    );
  } else {
    narrativeParts.push(
      "No counsel-compiled executable capacity yet covers this amount — AI-proposed pathways listed separately for counsel review.",
    );
  }
  if (params.secured && debtPaths.length && lienPaths.length) {
    narrativeParts.push(
      `Secured incurrence requires both an indebtedness permission and a lien permission (debt ∩ lien). Debt pathways: ${debtPaths.length}; lien pathways: ${lienPaths.length}.`,
    );
  }

  const missingForFullExecutable: string[] = [];
  if (!params.financials) missingForFullExecutable.push("Financial snapshot");
  if (!sufficientSinglePaths.length && !partialPaths.length) {
    missingForFullExecutable.push("Counsel-compiled MODELED Permissions for applicable baskets");
  }
  if (deduped.some((p) => p.status === "AI_PROPOSED")) {
    missingForFullExecutable.push("Counsel ACCEPT/EDIT on AI-proposed pathways");
  }

  const hasExecutableCapacity = deduped.some(
    (p) => p.status === "EXECUTABLE" || p.status === "INSUFFICIENT",
  );

  return {
    transaction: {
      amountMillions: params.amountMillions,
      kind: params.kind,
      secured: params.secured,
      label: params.label,
    },
    authority: hasExecutableCapacity ? "LEGACY_ENGINE_MULTIPATH" : "AI_PROPOSED_ONLY",
    paths: deduped,
    sufficientSinglePaths,
    partialPaths,
    combination: {
      stackingAssumed: false,
      note:
        "Stacking across debt/lien baskets is NOT assumed. Only expressly shared pools (e.g. RP waterfall steps) may be allocated together. Numerical path capacity is LEGACY_ENGINE_MULTIPATH — not certified Phase 4E neutral enumeration.",
      feasibleAllocation,
    },
    narrative: [
      ...narrativeParts,
      "Authority: counsel/AI multipath over legacy covenant-engine Permissions — NOT_CERTIFIED_4E.",
    ].join(" "),
    citations: [...new Set(deduped.map((p) => p.citation).filter(Boolean))].slice(0, 24),
    missingForFullExecutable,
  };
}
