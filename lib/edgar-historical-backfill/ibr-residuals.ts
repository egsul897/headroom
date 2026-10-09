/**
 * Classify remaining IBR partials into deterministic residual buckets.
 *
 * Does not invent accession/exhibit/URL when SEC evidence is insufficient.
 * Does not treat an IBR citation as operative amendment authority.
 */

import type { ExhibitRef, IncorporatedByReference } from "./types";
import { extractIbrFormAndDate } from "./ibr-resolver";

export type IbrResidualKind =
  | "MISSING_ACCESSION"
  | "MISSING_EXHIBIT_NUMBER"
  | "INCORRECT_HISTORICAL_FILING"
  | "UNAVAILABLE_SOURCE"
  | "AMBIGUOUS_PARENT"
  | "INCORRECT_CITATION_PARSING"
  | "NEEDS_ORIGINAL_INDEX"
  | "RESOLVED";

export interface IbrResidualCase {
  cik: string;
  ticker?: string;
  citingAccession: string;
  exhibitType: string;
  description: string;
  residual: IbrResidualKind;
  detail: string;
  ibr: IncorporatedByReference;
}

export function classifyIbrResidual(e: ExhibitRef): IbrResidualCase {
  const ibr = e.ibr ?? {
    rawText: "",
    resolutionStatus: "UNRESOLVED" as const,
  };
  const base = {
    cik: e.cik,
    citingAccession: e.accessionNumber,
    exhibitType: e.exhibitType,
    description: e.description,
    ibr,
  };

  if (ibr.resolutionStatus === "RESOLVED" && ibr.resolvedSourceUri && ibr.resolvedFilename) {
    return { ...base, residual: "RESOLVED", detail: "accession + exhibit file URL resolved" };
  }

  const { form, date } = extractIbrFormAndDate(ibr.rawText);
  if (!ibr.resolvedAccessionNumber && !form && !date) {
    return {
      ...base,
      residual: "INCORRECT_CITATION_PARSING",
      detail: "No accession and no Form/date parseable from IBR prose",
    };
  }
  if (!ibr.resolvedAccessionNumber && (form || date)) {
    return {
      ...base,
      residual: "MISSING_ACCESSION",
      detail: `Form/date cited (${form ?? "?"}/${date ?? "?"}) but no matching filing in issuer submissions catalog`,
    };
  }
  if (ibr.resolvedAccessionNumber && !ibr.resolvedExhibitType) {
    return {
      ...base,
      residual: "MISSING_EXHIBIT_NUMBER",
      detail: "Accession known but exhibit number absent from citation",
    };
  }
  if (ibr.resolvedAccessionNumber && ibr.resolvedExhibitType && !ibr.resolvedFilename) {
    return {
      ...base,
      residual: "NEEDS_ORIGINAL_INDEX",
      detail: "Accession + exhibit type known; original filing index not yet yielding a prose exhibit filename",
    };
  }
  if (ibr.resolvedSourceUri && /index\.htm/i.test(ibr.resolvedSourceUri) && !ibr.resolvedFilename) {
    return {
      ...base,
      residual: "NEEDS_ORIGINAL_INDEX",
      detail: "Pointing at filing index rather than exhibit document",
    };
  }
  if (ibr.resolutionStatus === "UNRESOLVED") {
    return { ...base, residual: "UNAVAILABLE_SOURCE", detail: "IBR unresolved with no actionable citation fields" };
  }

  // Multiple parent hints without a concrete target.
  if (/see\s+note|various|among\s+others/i.test(ibr.rawText)) {
    return { ...base, residual: "AMBIGUOUS_PARENT", detail: "Citation language is ambiguous across multiple parents" };
  }

  return {
    ...base,
    residual: "NEEDS_ORIGINAL_INDEX",
    detail: `status=${ibr.resolutionStatus}`,
  };
}

export function summarizeIbrResiduals(exhibits: ExhibitRef[]): {
  totalIbr: number;
  byResidual: Record<IbrResidualKind, number>;
  cases: IbrResidualCase[];
} {
  const cases = exhibits.filter((e) => e.isIncorporatedByReference).map(classifyIbrResidual);
  const byResidual = {} as Record<IbrResidualKind, number>;
  for (const c of cases) {
    byResidual[c.residual] = (byResidual[c.residual] ?? 0) + 1;
  }
  return { totalIbr: cases.length, byResidual, cases };
}
