/**
 * Independent legal acceptance expectations for Matthews authentic excerpts.
 *
 * Hand-authored from source reading of EDGAR-reconstructed Indenture / CA
 * excerpts in source-excerpts-matthews.ts. Dollar expectations are embedded
 * as source quotations and parsed here — NOT imported from package-matthews
 * thresholdValue / CovenantProvisionInput literals / compile constants.
 *
 * False-positive / false-negative cases are explicit.
 */

export const MATTHEWS_INDEPENDENT_GT = {
  packageKey: "matthews-international-q1-fy2025",
  authenticity: "AUTHENTIC_EDGAR_RECONSTRUCTED_EXCERPT",
  /** Source quotations used to derive expected dollars independently. */
  sourceQuotations: {
    permittedDebt1aCap:
      "Debt under Debt Facilities and Qualified Receivables Transactions in an aggregate principal amount outstanding not to exceed $1,300,000,000",
    permittedDebt2Notes:
      "Debt represented by the Notes issued on the Issue Date in an aggregate principal amount of $300,000,000",
    fccrPermission:
      "the Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00",
    securedLeverageLimb:
      "Secured Net Leverage Ratio would be no greater than 3.50 to 1.00",
  },
  mustDiscover: [
    {
      id: "pd-1a-fixed",
      matchSourceRef: /def:Permitted Debt\(1\)\(a\)/i,
      provisionKind: "FIXED_DOLLAR_BASKET",
      mustBeExecutable: true,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
      /** Parsed from sourceQuotations.permittedDebt1aCap — not from thresholdValue: 1300. */
      expectedGrossUsdFromQuotation: null as number | null, // filled by parse helper in test
      quotationKey: "permittedDebt1aCap" as const,
    },
    {
      id: "pd-1b-ratio",
      matchSourceRef: /def:Permitted Debt\(1\)\(b\)/i,
      provisionKind: "RATIO_BASED_PERMISSION",
      mustBeExecutable: false,
      notes: "Leverage limbs — refuse executable until definition closure",
    },
    {
      id: "pd-2-grandfather",
      matchSourceRef: /def:Permitted Debt\(2\)/i,
      provisionKind: "GRANDFATHERED_OR_NON_CAP",
      mustBeExecutable: false,
      notes: "Stated Notes amount without not-to-exceed — not new-incurrence ceiling",
    },
    {
      id: "s409-ratio",
      matchSourceRef: /^4\.09\(a\)$/,
      provisionKind: "RATIO_BASED_PERMISSION",
      mustBeExecutable: false,
      notes: "FCCR incurrence permission",
    },
    {
      id: "s410-lien-prohibition",
      matchSourceRef: /^4\.10$/,
      provisionKind: "LIEN_RESTRICTION",
      mustBeExecutable: false,
    },
  ],
  mustNotExecutable: [
    {
      id: "wrong-doc-dollar",
      description: "A bare $ figure in definitions without cap role must not become AVAILABLE",
    },
  ],
  falsePositiveGuards: {
    /** Must never publish production AVAILABLE. */
    productionAvailableForbidden: true,
    /** Must never treat Notes $300M grandfather as GROSS new-incurrence ceiling. */
    notesGrandfatherMustNotBeGrossCeiling: true,
  },
} as const;

/** Parse `$1,300,000,000` style amounts from an independent quotation string. */
export function parseUsdFromIndependentQuotation(quotation: string): number {
  const m = quotation.match(/\$([0-9,]+(?:\.\d+)?)/);
  if (!m) throw new Error(`No dollar amount in independent quotation: ${quotation}`);
  return Number(m[1]!.replace(/,/g, ""));
}
