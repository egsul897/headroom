/**
 * The same basket extractor, pointed at the other pinned packages.
 * No Matthews financials are copied in. A grower whose metric is not in
 * the package stays NEEDS_INPUT. Fixed dollar caps written in the clause
 * still compute.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readCovenantSource } from "../extract-baskets";
import type { ComputationPackage, CovenantSection, PackageDocument } from "../types";
import { norm } from "../text";

interface SourceFile {
  documentId: string;
  role: PackageDocument["role"];
  path: string;
}

function load(file: SourceFile): PackageDocument {
  return {
    documentId: file.documentId,
    role: file.role,
    text: norm(readFileSync(join(process.cwd(), file.path), "utf8")),
  };
}

function fromFiles(args: {
  packageKey: string;
  companyId: string;
  instrumentKey: string;
  asOf: string;
  files: SourceFile[];
}): ComputationPackage {
  const documents = args.files.map(load);
  const sources = documents.map((doc) => readCovenantSource({ documentId: doc.documentId, text: doc.text }));
  const sections: CovenantSection[] = sources.flatMap((source) => source.sections);
  return {
    packageKey: args.packageKey,
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    asOf: args.asOf,
    documents,
    baskets: sources.flatMap((source) => source.clauses),
    sections,
  };
}

export function chwyBasketPackage(): ComputationPackage {
  return fromFiles({
    packageKey: "chwy-2026-credit-agreement",
    companyId: "chwy",
    instrumentKey: "chwy-2026-credit-agreement",
    asOf: "2026-06-23",
    files: [
      {
        documentId: "chwy-2026-credit-agreement",
        role: "CREDIT_AGREEMENT",
        path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
      },
    ],
  });
}

export function gibraltarBasketPackage(): ComputationPackage {
  return fromFiles({
    packageKey: "gibraltar-2026-credit-agreement",
    companyId: "gibraltar",
    instrumentKey: "gibraltar-2026-credit-agreement",
    asOf: "2026-01-01",
    files: [
      {
        documentId: "gibraltar-2026-credit-agreement",
        role: "CREDIT_AGREEMENT",
        path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
      },
    ],
  });
}

export function mtnBasketPackage(): ComputationPackage {
  const root = "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text";
  return fromFiles({
    packageKey: "mtn-2026-tenth-ar",
    companyId: "mtn",
    instrumentKey: "mtn-2026-tenth-ar-credit-agreement",
    asOf: "2026-01-01",
    files: [
      { documentId: "mtn-ca-tenth-ar", role: "CREDIT_AGREEMENT", path: `${root}/doc-a-tenth-ar-credit-agreement.txt` },
      { documentId: "mtn-indenture-2024", role: "INDENTURE", path: `${root}/doc-b-indenture-2024.txt` },
      { documentId: "mtn-indenture-2025", role: "INDENTURE", path: `${root}/doc-c-indenture-2025.txt` },
    ],
  });
}

/** The fifth amended and restated agreement replaces the fourth. Only the fifth is read. */
export function worBasketPackage(): ComputationPackage {
  return fromFiles({
    packageKey: "wor-2026-fifth-ar-credit-agreement",
    companyId: "wor",
    instrumentKey: "wor-2026-fifth-ar-credit-agreement",
    asOf: "2026-08-31",
    files: [
      {
        documentId: "wor-2026-fifth-ar",
        role: "CREDIT_AGREEMENT",
        path: "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility/extracted-text/doc-b-2026-08-31-fifth-ar-credit-agreement.txt",
      },
    ],
  });
}

export function mhkBasketPackage(): ComputationPackage {
  return fromFiles({
    packageKey: "mhk-2026-credit-agreement",
    companyId: "mhk",
    instrumentKey: "mhk-2026-credit-agreement",
    asOf: "2026-01-01",
    files: [
      {
        documentId: "mhk-2026-credit-agreement",
        role: "CREDIT_AGREEMENT",
        path: "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt",
      },
    ],
  });
}

export function otherIssuerPackages(): ComputationPackage[] {
  return [chwyBasketPackage(), gibraltarBasketPackage(), mtnBasketPackage(), worBasketPackage(), mhkBasketPackage()];
}
