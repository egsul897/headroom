/**
 * Authentic package contexts for autonomous covenant compilation proofs.
 *
 * Document loaders only — NO issuer-specific candidate regexes, section
 * numbers, or monetary thresholds. Discovery/compilation must come from
 * compileOperativeCovenantPackage / compileFrozenDebtPackage.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matthewsCompilerPackageDocuments } from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";
import type { OperativePackageContext } from "@/lib/contract-model/analysis/operative-covenant-package";

const MHK_CA_RELATIVE =
  "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt";

export function matthewsOperativePackageContext(
  asOfDate = "2024-12-31",
): OperativePackageContext {
  const docs = matthewsCompilerPackageDocuments();
  return {
    companyId: "matthews",
    packageKey: "matthews-international-q1-fy2025",
    instrumentKey: "matthews-international-q1-fy2025",
    asOfDate,
    documents: docs.map((d) => ({
      documentId: d.documentId,
      label: d.label,
      text: d.text,
    })),
    authorizePaidInference: false,
  };
}

export function mhkOperativePackageContext(asOfDate = "2025-06-30"): OperativePackageContext {
  const text = readFileSync(join(process.cwd(), MHK_CA_RELATIVE), "utf8");
  return {
    companyId: "mhk",
    packageKey: "mhk-2026-credit-agreement",
    instrumentKey: "mhk-2026-credit-agreement",
    asOfDate,
    documents: [
      {
        documentId: "mhk-doc-a-credit-agreement",
        label: "Mohawk Industries, Inc. Credit Agreement (2026)",
        text,
      },
    ],
    authorizePaidInference: false,
  };
}
