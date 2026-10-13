/**
 * Client-safe live reflow for contractual leverage results.
 *
 * Intentionally free of IR compile, node:crypto, and contract-model/runtime
 * so DashboardClient can recompute ratio arithmetic when LTM financials edit
 * without pulling the server evaluation graph into the webpack client bundle.
 *
 * When EBITDA was derived via a server-side build-up, that derived figure is
 * held fixed (component metrics are not on the LTM card). Certificate EBITDA
 * from the editor is used only when no derived figure exists.
 */

import type {
  ContractualLeverageResult,
  LeverageFinancialInputs,
  ResolvedInputLine,
} from "./types";

const HEADROOM_NOT_CAPACITY =
  "Dollar figure is mathematical threshold×EBITDA − net debt only — not verified available debt capacity.";

function netsCashFromResult(result: ContractualLeverageResult): boolean {
  if (result.inputs.some((i) => i.key === "Cash")) return true;
  const formula = (result.formulaDisplay ?? "").toLowerCase();
  return formula.includes("cash");
}

function buildInputLines(
  financials: LeverageFinancialInputs,
  debtBasis: "total" | "secured",
  netsCash: boolean,
  derivedEbitda: number | null | undefined,
): ResolvedInputLine[] {
  const ebitdaValue = derivedEbitda ?? financials.ebitda;
  const debtValue = debtBasis === "secured" ? financials.securedDebt : financials.totalDebt;
  const debtLabel = debtBasis === "secured" ? "Secured Debt" : "Total Debt";
  const lines: ResolvedInputLine[] = [
    {
      key: "EBITDA",
      label:
        derivedEbitda != null
          ? "Consolidated EBITDA (derived build-up)"
          : "Consolidated EBITDA (caller-supplied contractual)",
      valueMillions: ebitdaValue,
      required: true,
      status: ebitdaValue != null && ebitdaValue > 0 ? "RESOLVED" : "MISSING",
      fulfillmentState: ebitdaValue != null && ebitdaValue > 0 ? "APPROVED_VERIFIED" : "MISSING",
    },
    {
      key: debtBasis === "secured" ? "Secured Debt" : "Total Debt",
      label: debtLabel,
      valueMillions: debtValue,
      required: true,
      status: debtValue != null ? "RESOLVED" : "MISSING",
      fulfillmentState: debtValue != null ? "APPROVED_VERIFIED" : "MISSING",
    },
  ];
  if (netsCash) {
    lines.push({
      key: "Cash",
      label: "Unrestricted cash & Cash Equivalents",
      valueMillions: financials.cash,
      required: true,
      status: financials.cash != null ? "RESOLVED" : "MISSING",
      fulfillmentState: financials.cash != null ? "APPROVED_VERIFIED" : "MISSING",
    });
  }
  return lines;
}

/**
 * Reflow a server-computed leverage result against edited LTM financials.
 * Structural failures (missing definitions / unsupported shape) are preserved.
 */
export function reflowContractualLeverageResult(
  result: ContractualLeverageResult,
  financials: LeverageFinancialInputs,
): ContractualLeverageResult {
  if (result.debtBasis == null) return result;
  if (result.status === "MISSING_DEFINITIONS" || result.status === "UNSUPPORTED_DEFINITION_SHAPE") {
    return result;
  }

  const netsCash = netsCashFromResult(result);
  const derivedEbitda = result.derivedEbitdaMillions;
  const ebitda = derivedEbitda ?? financials.ebitda;
  const debt = result.debtBasis === "secured" ? financials.securedDebt : financials.totalDebt;
  const inputs = buildInputLines(financials, result.debtBasis, netsCash, derivedEbitda);

  const missing: string[] = [];
  if (ebitda == null || !(ebitda > 0)) {
    missing.push(derivedEbitda != null ? "Derived Consolidated EBITDA ≤ 0" : "Consolidated EBITDA");
  }
  if (debt == null) {
    missing.push(result.debtBasis === "secured" ? "Secured Debt" : "Total Debt");
  }
  if (netsCash && financials.cash == null) {
    missing.push("Unrestricted cash & Cash Equivalents");
  }

  if (missing.length > 0) {
    return {
      ...result,
      status: "MISSING_INPUTS",
      inputs,
      missingRequirements: missing,
      currentRatio: null,
      ratioHeadroom: null,
      debtHeadroomMillions: null,
      debtHeadroomIsVerifiedCapacity: false,
      runtimeStatus: "NEEDS_INPUT",
    };
  }

  const netDebt = netsCash ? debt! - financials.cash! : debt!;
  const currentRatio = netDebt / ebitda!;
  const threshold = result.threshold;
  const ratioHeadroom = threshold != null ? threshold - currentRatio : null;
  let debtHeadroomMillions: number | null = null;
  const limitations = result.limitations.filter((l) => l !== HEADROOM_NOT_CAPACITY);
  if (threshold != null) {
    debtHeadroomMillions = threshold * ebitda! - netDebt;
    limitations.push(HEADROOM_NOT_CAPACITY);
  }

  return {
    ...result,
    status: "COMPUTED",
    inputs,
    missingRequirements: [],
    currentRatio,
    ratioHeadroom,
    debtHeadroomMillions,
    debtHeadroomIsVerifiedCapacity: false,
    runtimeStatus: "EXECUTABLE",
    limitations,
    derivedEbitdaMillions: derivedEbitda ?? null,
  };
}
