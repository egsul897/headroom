/**
 * Workstream 6 — Learning from counsel corrections.
 *
 * Captures confirmed corrections and turns each into a regression fixture.
 * Verified corrections may be used as retrieval examples / interpretation
 * precedents only where legally applicable — never auto-generalized across
 * agreements.
 */

import { createHash } from "node:crypto";

export const COUNSEL_CORRECTIONS_VERSION = "product.counsel-corrections.v1";

export type CorrectionKind =
  | "RETRIEVED_SOURCE_SPAN"
  | "MISSING_PROVISION"
  | "DEFINED_TERM_DEPENDENCY"
  | "PERMISSION_CLASSIFICATION"
  | "CONDITION"
  | "FORMULA"
  | "LEGAL_INTERPRETATION";

export interface CounselCorrection {
  correctionId: string;
  kind: CorrectionKind;
  /** Package / agreement identity — corrections do not auto-apply elsewhere. */
  packageId: string;
  sectionRef: string;
  observed: string;
  expected: string;
  counselNote: string;
  confirmedBy: string;
  confirmedAt: string;
  /** When true, eligible as a same-agreement retrieval example only. */
  usableAsRetrievalExample: boolean;
  /** When true, eligible as interpretation precedent only if packageId matches. */
  usableAsInterpretationPrecedent: boolean;
  /** Never true for cross-agreement automatic generalization. */
  autoGeneralizeAcrossAgreements: false;
}

export interface RegressionTestSpec {
  testId: string;
  correctionId: string;
  packageId: string;
  sectionRef: string;
  kind: CorrectionKind;
  assertion: string;
  expected: string;
  mustNotContain?: string[];
}

export function correctionId(parts: {
  packageId: string;
  sectionRef: string;
  kind: CorrectionKind;
  expected: string;
}): string {
  const h = createHash("sha256")
    .update(`${parts.packageId}|${parts.sectionRef}|${parts.kind}|${parts.expected}`)
    .digest("hex")
    .slice(0, 16);
  return `counsel-corr-${h}`;
}

/** Record a confirmed counsel correction (never auto-generalized). */
export function recordCounselCorrection(input: Omit<CounselCorrection, "correctionId" | "autoGeneralizeAcrossAgreements">): CounselCorrection {
  return {
    ...input,
    correctionId: correctionId({
      packageId: input.packageId,
      sectionRef: input.sectionRef,
      kind: input.kind,
      expected: input.expected,
    }),
    autoGeneralizeAcrossAgreements: false,
  };
}

/** Turn every confirmed error into a regression test spec. */
export function correctionToRegressionTest(c: CounselCorrection): RegressionTestSpec {
  return {
    testId: `reg-${c.correctionId}`,
    correctionId: c.correctionId,
    packageId: c.packageId,
    sectionRef: c.sectionRef,
    kind: c.kind,
    assertion: `After correction ${c.kind} on ${c.packageId} §${c.sectionRef}, analysis must match counsel-expected interpretation.`,
    expected: c.expected,
    mustNotContain: c.observed && c.observed !== c.expected ? [c.observed] : undefined,
  };
}

/**
 * Precedents usable for retrieval/interpretation — same package only.
 * Explicitly refuses cross-agreement generalization.
 */
export function precedentsForPackage(
  corrections: readonly CounselCorrection[],
  packageId: string,
): CounselCorrection[] {
  return corrections.filter(
    (c) =>
      c.packageId === packageId &&
      (c.usableAsRetrievalExample || c.usableAsInterpretationPrecedent) &&
      c.autoGeneralizeAcrossAgreements === false,
  );
}

/** Seed corrections derived from authentic CONMED / Chewy defect classes (human-adjudicated expectations only). */
export const SEED_COUNSEL_CORRECTIONS: CounselCorrection[] = [
  recordCounselCorrection({
    kind: "PERMISSION_CLASSIFICATION",
    packageId: "pkg-a-basic-credit-agreement",
    sectionRef: "7.01(c)",
    observed: "entityScope [BORROWER, ANY_SUBSIDIARY] certified under governing lead-in",
    expected: "Ratio basket limited to Borrower; wider scope must not certify",
    counselNote: "IPV-01 — clause narrowing 'Indebtedness of the Borrower' controls over section lead-in.",
    confirmedBy: "independent-product-validation",
    confirmedAt: "2026-10-08",
    usableAsRetrievalExample: true,
    usableAsInterpretationPrecedent: true,
  }),
  recordCounselCorrection({
    kind: "MISSING_PROVISION",
    packageId: "pkg-f-capacity-ledger-honesty",
    sectionRef: "7.06(b)",
    observed: "7.06(b) and 7.08(c) certified as independent $20m baskets",
    expected: "Shared $20m cap via 'together with … pursuant to Section' must be represented or certification refused",
    counselNote: "IPV-02 — shared capacity drafting.",
    confirmedBy: "independent-product-validation",
    confirmedAt: "2026-10-08",
    usableAsRetrievalExample: true,
    usableAsInterpretationPrecedent: true,
  }),
  recordCounselCorrection({
    kind: "CONDITION",
    packageId: "pkg-a-basic-credit-agreement",
    sectionRef: "7.01(b)",
    observed: "Basket certified with 0 conditions while proviso inventory item cited on rule node",
    expected: "no-Default proviso must be a condition node or certification refused",
    counselNote: "IPV-03 — lineage laundering.",
    confirmedBy: "independent-product-validation",
    confirmedAt: "2026-10-08",
    usableAsRetrievalExample: true,
    usableAsInterpretationPrecedent: true,
  }),
];
