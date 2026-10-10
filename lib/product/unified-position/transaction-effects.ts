/**
 * Deterministic pre/post transaction-state effects for the unified product.
 * Uses covenant-engine financials + evaluateProvision — LEGACY labeled only.
 * Never posts to the ledger. Never claims CERTIFIED / Phase 4E.
 */

import {
  computeCovenantPosition,
  computeLeverageMetrics,
  evaluateProvision,
  type CompanyCovenantData,
  type CovenantProvisionInput,
} from "@/lib/covenant-engine";

export type TransactionEffectKind =
  | "DEBT_INCURRENCE"
  | "DEBT_REPAYMENT"
  | "DIVIDEND"
  | "INVESTMENT"
  | "ELIGIBLE_EQUITY_CONTRIBUTION";

export interface PrePostMetrics {
  totalDebt: number;
  securedDebt: number;
  cash: number;
  equityProceedsSinceIssue: number;
  totalNetLeverage: number | null;
  seniorSecuredNetLeverage: number | null;
}

export interface BasketBalanceDelta {
  provisionId: string;
  code: string;
  basketName: string;
  sectionRef: string;
  documentId: string;
  preCapacity: number | null;
  postCapacity: number | null;
  formulaType: string;
}

export interface TransactionEffectsResult {
  authority: "LEGACY_ENGINE";
  authorityNote: string;
  kind: TransactionEffectKind;
  amountMillions: number;
  secured: boolean | null;
  postsToLedger: false;
  pre: PrePostMetrics;
  post: PrePostMetrics;
  basketDeltas: BasketBalanceDelta[];
}

function metricsFrom(fin: CompanyCovenantData["financials"]): PrePostMetrics {
  const m = computeLeverageMetrics(fin);
  return {
    totalDebt: fin.totalDebt,
    securedDebt: fin.securedDebt,
    cash: fin.cash,
    equityProceedsSinceIssue: fin.equityProceedsSinceIssue,
    totalNetLeverage: Number.isFinite(m.totalNetLeverage) ? m.totalNetLeverage : null,
    seniorSecuredNetLeverage: Number.isFinite(m.seniorSecuredNetLeverage)
      ? m.seniorSecuredNetLeverage
      : null,
  };
}

function applyEffect(
  fin: CompanyCovenantData["financials"],
  kind: TransactionEffectKind,
  amountMillions: number,
  secured: boolean | null,
): CompanyCovenantData["financials"] {
  const a = amountMillions;
  switch (kind) {
    case "DEBT_INCURRENCE":
      return {
        ...fin,
        totalDebt: fin.totalDebt + a,
        securedDebt: fin.securedDebt + (secured === false ? 0 : a),
      };
    case "DEBT_REPAYMENT": {
      const repaySecured = secured !== false;
      const securedRepay = repaySecured ? Math.min(a, fin.securedDebt) : 0;
      const totalRepay = Math.min(a, fin.totalDebt);
      return {
        ...fin,
        totalDebt: fin.totalDebt - totalRepay,
        securedDebt: fin.securedDebt - securedRepay,
        cash: fin.cash - totalRepay,
      };
    }
    case "DIVIDEND":
    case "INVESTMENT":
      return { ...fin, cash: fin.cash - a };
    case "ELIGIBLE_EQUITY_CONTRIBUTION":
      return {
        ...fin,
        cash: fin.cash + a,
        equityProceedsSinceIssue: fin.equityProceedsSinceIssue + a,
      };
  }
}

function provisionCapacity(
  provision: CovenantProvisionInput,
  fin: CompanyCovenantData["financials"],
  metrics: ReturnType<typeof computeLeverageMetrics>,
): number | null {
  const evaluated = evaluateProvision(provision, fin, metrics);
  if (evaluated.status !== "modeled" || evaluated.capacity === undefined) return null;
  return Number.isFinite(evaluated.capacity) ? evaluated.capacity : null;
}

/**
 * Compute labeled LEGACY pre/post financial metrics and builder/basket deltas.
 */
export function computeTransactionEffects(args: {
  data: CompanyCovenantData;
  kind: TransactionEffectKind;
  amountMillions: number;
  secured?: boolean | null;
}): TransactionEffectsResult | { refused: true; reason: string } {
  if (!(args.amountMillions >= 0) || !Number.isFinite(args.amountMillions)) {
    return { refused: true, reason: "Amount must be a non-negative finite number (millions)." };
  }
  const secured = args.secured ?? (args.kind === "DEBT_INCURRENCE" || args.kind === "DEBT_REPAYMENT" ? true : null);
  const preFin = args.data.financials;
  const postFin = applyEffect(preFin, args.kind, args.amountMillions, secured);
  const preMetrics = computeLeverageMetrics(preFin);
  const postMetrics = computeLeverageMetrics(postFin);

  const basketDeltas: BasketBalanceDelta[] = [];
  for (const provision of args.data.provisions) {
    if (provision.formulaType !== "BUILDER_BASKET" && provision.formulaType !== "FLAT_AMOUNT") continue;
    const preCapacity = provisionCapacity(provision, preFin, preMetrics);
    const postCapacity = provisionCapacity(provision, postFin, postMetrics);
    if (preCapacity == null && postCapacity == null) continue;
    if (preCapacity === postCapacity) continue;
    basketDeltas.push({
      provisionId: provision.id,
      code: provision.code,
      basketName: provision.basketName,
      sectionRef: provision.sectionRef,
      documentId: provision.documentId,
      preCapacity,
      postCapacity,
      formulaType: provision.formulaType,
    });
  }

  // Touch position so debt repayment / equity paths stay consistent with overview engine.
  void computeCovenantPosition({ ...args.data, financials: postFin });

  return {
    authority: "LEGACY_ENGINE",
    authorityNote:
      "LEGACY_ENGINE · NOT_CERTIFIED_4E — deterministic pre/post financials from covenant-engine. Hypothetical — does not post to the ledger.",
    kind: args.kind,
    amountMillions: args.amountMillions,
    secured,
    postsToLedger: false,
    pre: metricsFrom(preFin),
    post: metricsFrom(postFin),
    basketDeltas,
  };
}

export function effectKindFromAskKind(
  kind: "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "ACQUISITION" | "UNKNOWN",
  question?: string,
): TransactionEffectKind | null {
  const q = (question ?? "").toLowerCase();
  if (/repay|prepay|pay down|reduce.*debt/.test(q)) return "DEBT_REPAYMENT";
  if (/equity contribution|equity infusion|eligible equity|contribute.*equity/.test(q)) {
    return "ELIGIBLE_EQUITY_CONTRIBUTION";
  }
  switch (kind) {
    case "SECURED_DEBT":
    case "UNSECURED_DEBT":
    case "ACQUISITION":
      return "DEBT_INCURRENCE";
    case "RESTRICTED_PAYMENT":
      return "DIVIDEND";
    case "INVESTMENT":
      return "INVESTMENT";
    default:
      return null;
  }
}
