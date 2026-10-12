/**
 * Independent legal acceptance expectations for Mohawk (MHK) authentic CA.
 *
 * Hand-authored against docs/product-proof/002/sources/.../doc-a-credit-agreement.txt
 * and the independent legal reference notes in docs/product-proof/002/04-independent-legal-reference.md.
 *
 * Expected dollars are parsed from sourceQuotations below — NOT from
 * package-mhk-ve-candidates regex capture groups or compile constants.
 */

export const MHK_INDEPENDENT_GT = {
  packageKey: "mhk-2026-credit-agreement",
  authenticity: "AUTHENTIC_EDGAR_HOLDOUT",
  documentId: "mhk-doc-a-credit-agreement",
  sourceQuotations: {
    receivables703f:
      "the aggregate outstanding amount of all Permitted Receivables Financings of the Company and/or its Restricted Subsidiaries shall not exceed $700,000,000 at any time",
    lien701i:
      // Verified independently from authentic CA §7.01(i) purchase-money / capital lease basket.
      "shall not exceed $100,000,000",
    greaterOf703gFixedLimb: "$1,500,000,000",
    greaterOf703gPctLimb: "ten percent (10%) of the Total Consolidated Assets",
  },
  mustDiscoverCatalogs: [
    { section: "7.01", expectedMarkers: "abcdefghijklmnopqrstuvw" },
    { section: "7.03", expectedMarkers: "abcdefghijkl" },
  ],
  mustDiscover: [
    {
      id: "703f-receivables",
      matchSourceRef: /^7\.03\(f\)$/,
      mustBeExecutable: true,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
      quotationKey: "receivables703f" as const,
    },
    {
      id: "701i-fixed",
      matchSourceRef: /^7\.01\(i\)$/,
      mustBeExecutable: true,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
      quotationKey: "lien701i" as const,
    },
    {
      id: "703g-greater-of",
      matchSourceRef: /^7\.03\(g\)$/,
      mustBeExecutable: true,
      // Structure VE; numeric remaining requires Total Assets metric.
      capacityClass: "MODELED_HYPOTHETICAL",
      notes: "Greater-of fixed / % TCA — VE structure, metric-gated numeric",
    },
    {
      id: "701u-greater-of",
      matchSourceRef: /^7\.01\(u\)$/,
      mustBeExecutable: true,
      capacityClass: "MODELED_HYPOTHETICAL",
    },
  ],
  falsePositiveGuards: {
    productionAvailableForbidden: true,
    /** Facility-difference / unsupported growers must not silently become FIXED_DOLLAR VE. */
    noSilentDropOfGreaterOf: true,
  },
} as const;
