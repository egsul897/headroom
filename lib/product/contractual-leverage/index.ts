/**
 * Public barrel for server/tests.
 *
 * Client components must import from `./calculate` and `./types` only —
 * never this barrel — so webpack does not pull Prisma / node:crypto.
 */

export type {
  ApprovedFinancialLineItem,
  ComputationAuthority,
  ContractualLeverageResult,
  ContractualLeverageStatus,
  DefinitionText,
  EbitdaBuildupSummary,
  FinancialInputAuthority,
  HeadroomPresentation,
  IdentifiedLeverageComponents,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
  ResolvedInputLine,
  DebtMetricBasis,
} from "./types";

export { identifyLeverageComponents, DEFAULT_TOTAL_LEVERAGE_TERMS, DEFAULT_SECURED_LEVERAGE_TERMS, detectUnsupportedCashCap, detectUnresolvedProForma } from "./identify";
export { compileLeverageExpressions } from "./compile";
export { CAPACITY_DISCLAIMER } from "./disclaimer";
export { calculateContractualLeverage, recalculateWithFinancials } from "./calculate";
export { calculateEbitdaBuildup, compileEbitdaBuildupExpression } from "./ebitda-buildup";
export {
  COHERENT_FY2026_EBITDA_LINE_ITEMS,
  COHERENT_FY2026_EBITDA_BUILDUP_SUM,
  resolveEbitdaLineApproval,
  lineItemsToFinancialSnapshot,
} from "./evidence";
export { reflowIndicativeLeverage } from "./reflow";
export { loadContractualLeverageForCompany, type ContractualLeverageDashboardPayload } from "./service";
export {
  COHERENT_FINANCIALS,
  MATTHEWS_FINANCIALS,
  COHERENT_CA_DEFINITIONS,
  MATTHEWS_INDENTURE_DEFINITIONS,
  COHERENT_EBITDA_LINE_ITEMS,
  MATTHEWS_EBITDA_LINE_ITEMS,
  MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
  coherentTotalNetLeverageRequest,
  matthewsSecuredNetLeverageRequest,
} from "./fixtures";
