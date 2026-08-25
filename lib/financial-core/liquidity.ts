/**
 * Liquidity engine (architecture §F), Phase 3.
 *
 * Keeps CASH / RESTRICTED CASH / AVAILABLE CASH / UNDRAWN COMMITMENT /
 * REVOLVER AVAILABILITY / BORROWING-BASE AVAILABILITY / TOTAL LIQUIDITY
 * strictly separate (task §7). Fails closed for a borrowing-base-constrained
 * facility whose borrowing-base value is absent - never falls back to
 * commitment-minus-draws as a substitute (task §7's ABL example) - while
 * leaving cash/debt/other independent analytics fully computable.
 */

import { computeLcUsage, computeOutstandingPrincipal } from "./capital-structure";
import type { DebtEvent, Facility, FinancialState, LiquidityComponentTrace, LiquidityPosition } from "./types";

export function computeLiquidityPosition(state: FinancialState, facilities: Facility[], events: DebtEvent[], asOfDate: Date): LiquidityPosition {
  const trace: LiquidityComponentTrace[] = [];

  const cash = state.balanceSheetFacts.cash;
  const restrictedCash = state.balanceSheetFacts.restrictedCash?.value ?? 0;
  const availableCash = cash.value - restrictedCash;
  trace.push({ label: "Cash", value: cash.value, status: "AVAILABLE", detail: `Unrestricted+restricted cash as of ${asOfDate.toISOString().slice(0, 10)}.` });
  trace.push({ label: "Restricted cash", value: restrictedCash, status: "AVAILABLE", detail: "Excluded from available cash." });
  trace.push({ label: "Available cash", value: availableCash, status: "AVAILABLE", detail: "Cash minus restricted cash." });

  const revolverId = state.liquidityFacts?.revolverFacilityId;
  const revolverFacility = revolverId
    ? facilities.find((f) => f.id === revolverId)
    : facilities.find((f) => f.facilityType === "REVOLVER" || f.facilityType === "ABL");

  if (!revolverFacility) {
    trace.push({ label: "Revolver availability", value: null, status: "AVAILABLE", detail: "No revolver/ABL facility modeled for this company." });
    return {
      companyId: state.companyId,
      asOfDate,
      cash,
      restrictedCash,
      availableCash,
      revolverAvailability: 0,
      revolverAvailabilityStatus: "AVAILABLE",
      totalLiquidity: availableCash,
      componentTrace: trace,
    };
  }

  const commitment = revolverFacility.commitmentAmount ?? revolverFacility.originalPrincipal;
  const drawn = computeOutstandingPrincipal(revolverFacility, events, asOfDate);
  const lcUsage = computeLcUsage(revolverFacility, events, asOfDate);
  const undrawnCommitment = commitment - drawn - lcUsage;

  trace.push({ label: "Revolver commitment", value: commitment, status: "AVAILABLE", detail: `${revolverFacility.name} total commitment.` });
  trace.push({ label: "Revolver drawn", value: drawn, status: "AVAILABLE", detail: "Outstanding principal, replayed from DebtEvent history." });
  trace.push({ label: "LC usage", value: lcUsage, status: "AVAILABLE", detail: "Outstanding letter-of-credit usage, replayed from DebtEvent history." });
  trace.push({ label: "Undrawn commitment", value: undrawnCommitment, status: "AVAILABLE", detail: "Commitment - drawn - LC usage (ignores any borrowing-base constraint)." });

  let revolverAvailability: number | null;
  let revolverAvailabilityStatus: LiquidityPosition["revolverAvailabilityStatus"];
  let borrowingBaseValue: number | undefined;

  if (revolverFacility.facilityType === "ABL") {
    const bbFact = state.liquidityFacts?.borrowingBaseValue;
    if (!bbFact) {
      // architecture §F.1 / task §7,§20: required borrowing-base input absent
      // -> fail closed for THIS calculation only. Independent facts (cash,
      // debt, undrawn commitment above) remain fully computed.
      revolverAvailability = null;
      revolverAvailabilityStatus = "UNAVAILABLE_REVIEW_REQUIRED";
      trace.push({
        label: "Borrowing-base availability",
        value: null,
        status: "UNAVAILABLE_REVIEW_REQUIRED",
        detail: "No certified borrowing-base value on record for this ABL facility as of this date - availability cannot be computed from commitment alone.",
      });
    } else {
      borrowingBaseValue = bbFact.value;
      const eligibleCeiling = Math.min(commitment, borrowingBaseValue);
      revolverAvailability = eligibleCeiling - drawn - lcUsage;
      revolverAvailabilityStatus = "AVAILABLE";
      trace.push({
        label: "Borrowing-base availability",
        value: revolverAvailability,
        status: "AVAILABLE",
        detail: `min(commitment ${commitment}, borrowing base ${borrowingBaseValue}) - drawn ${drawn} - LC usage ${lcUsage}.`,
      });
    }
  } else {
    revolverAvailability = undrawnCommitment;
    revolverAvailabilityStatus = "AVAILABLE";
  }

  const totalLiquidity = revolverAvailability === null ? null : availableCash + revolverAvailability;
  trace.push({
    label: "Total liquidity",
    value: totalLiquidity,
    status: revolverAvailabilityStatus,
    detail: totalLiquidity === null ? "Cannot be computed while revolver availability is review-required." : "Available cash + revolver availability.",
  });

  return {
    companyId: state.companyId,
    asOfDate,
    cash,
    restrictedCash,
    availableCash,
    revolverFacilityId: revolverFacility.id,
    revolverCommitment: commitment,
    revolverDrawn: drawn,
    revolverLcUsage: lcUsage,
    borrowingBaseValue,
    undrawnCommitment,
    revolverAvailability,
    revolverAvailabilityStatus,
    totalLiquidity,
    componentTrace: trace,
  };
}
