/**
 * CFO compliance / capacity report — shared shapes.
 *
 * Rule for every line: a number is emitted ONLY with a source (document +
 * section, or the named engine computation). No source ⇒ value null and
 * status NEEDS_INPUT or NOT_DETERMINABLE. Nothing here computes a covenant
 * figure; every value is read from an existing engine output.
 */
export type LineStatus = "COMPUTED" | "NEEDS_INPUT" | "NOT_DETERMINABLE" | "UNMODELED";

export interface SourceRef {
  /** "DOCUMENT" = a provision in an uploaded agreement; "ENGINE" = a named engine computation over sourced inputs. */
  kind: "DOCUMENT" | "ENGINE";
  documentName?: string;
  sectionRef?: string;
  engine?: string;
}

/**
 * Proof payload per figure (read-only). Only what the engine output already
 * carries: the formula as the engine describes it and the governing
 * citation. Step-by-step arithmetic and per-input source locators are not
 * exposed by the current engine output, so they are NEEDS_INPUT (owned by
 * the formula/compute lane) — never reconstructed here.
 */
export interface FigureProof {
  formula: string | null;
  citation: SourceRef | null;
  steps: "NEEDS_INPUT";
  inputs: "NEEDS_INPUT";
  note: string;
}

export interface ReportLine {
  section: string;
  key: string;
  label: string;
  documentName: string | null;
  sectionRef: string | null;
  /** The figure, or null when not sourced/determinable. */
  value: number | null;
  unit: "USD" | "x" | "%";
  unlimited?: boolean;
  status: LineStatus;
  /** Engine's own binding/publication labels, passed through verbatim. */
  engineState: string | null;
  reviewState: string | null;
  source: SourceRef | null;
  reason: string | null;
  proof: FigureProof;
}

/** Certificate payload: required vs actual per tested covenant. */
export interface CertificateRow {
  key: string;
  covenant: string;
  documentName: string;
  sectionRef: string;
  comparison: "at_or_below" | "at_or_above";
  required: number;
  actual: number | null;
  headroom: number | null;
  /** IN_COMPLIANCE / NOT_IN_COMPLIANCE only when actual is computed; otherwise NOT_DETERMINABLE. */
  result: "IN_COMPLIANCE" | "NOT_IN_COMPLIANCE" | "NOT_DETERMINABLE";
  status: LineStatus;
  reviewState: string;
  citation: SourceRef;
  reason: string | null;
}

export interface ComplianceReport {
  reportVersion: 1;
  companyId: string;
  companyName: string | null;
  asOfDate: string | null;
  generatedAt: string;
  status: "OK" | "NOT_DETERMINABLE";
  /** Why the whole report could not be produced (status NOT_DETERMINABLE). */
  blocker: string | null;
  authority: "SYSTEM_COMPUTED_NOT_COUNSEL_VERIFIED";
  disclaimer: string;
  lines: ReportLine[];
  certificate: CertificateRow[];
  counts: { computed: number; needsInput: number; notDeterminable: number; unmodeled: number };
  warnings: string[];
}

export const REPORT_DISCLAIMER =
  "System-computed from the uploaded agreements and the financial inputs on file. Not a signed compliance certificate and not counsel-verified unless a row's review state says so. Figures marked NEEDS INPUT or NOT DETERMINABLE were not computed and must not be read as zero.";
