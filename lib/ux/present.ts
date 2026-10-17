/**
 * Presentation contracts for the six UX surfaces.
 *
 * Callers pass only values the screen already has. These functions do not
 * fetch, infer a date, or invent a PASS. Null means the engine has not
 * supplied that field.
 *
 * Engine gaps (for the backend):
 * 1. Morning brief — last visit, a change feed, a needs-you count, and the next test date with days remaining.
 * 2. Proof — formula inputs with sources, clause text, page locator, and review status per figure.
 * 3. Certificate — period, required, actual, and headroom per covenant, plus an evaluated PASS or FAIL.
 * 4. Scenarios — server persistence. The browser store is a stand-in.
 * 5. Calendar — test dates, reporting deadlines, and cure-period end dates. Do not infer them.
 * 6. Thresholds — band cutoffs, the prior band, and a trend toward the next band.
 * 7. Key ratios — a distinct fixed-charge coverage figure. Gross, net, secured, and interest coverage come from generic position metrics when that position is loaded. Band cutoffs are not on those metrics.
 */

export type MorningBriefModel = {
  /** Display label the caller already formatted. Null when no visit is recorded. */
  lastVisitLabel: string | null;
  /** null = the change feed is not loaded. An empty list was loaded and is empty. */
  changes: readonly string[] | null;
  needsYou: { count: number; href: string } | null;
  nextTest: { label: string; daysLeft: number | null } | null;
};

export type BriefLine = { label: string; text: string; href?: string };

export const UNLOADED_BRIEF: MorningBriefModel = {
  lastVisitLabel: null,
  changes: null,
  needsYou: null,
  nextTest: null,
};

export function presentMorningBrief(model: MorningBriefModel): BriefLine[] {
  let since = "Needs input";
  if (model.changes != null && model.changes.length === 0) {
    since = model.lastVisitLabel ? `Nothing changed since ${model.lastVisitLabel}.` : "Last visit is not recorded.";
  } else if (model.changes != null && model.changes.length > 0) {
    since = model.changes.slice(0, 2).join(" ");
  }

  const needs =
    model.needsYou == null ? "Needs input" : model.needsYou.count === 1 ? "1 item" : `${model.needsYou.count} items`;

  let next = "Needs input";
  if (model.nextTest) {
    next =
      model.nextTest.daysLeft == null
        ? model.nextTest.label
        : `${model.nextTest.label} · ${model.nextTest.daysLeft} ${model.nextTest.daysLeft === 1 ? "day" : "days"}`;
  }

  return [
    { label: "Since your last visit", text: since },
    { label: "Needs you", text: needs, href: model.needsYou?.href },
    { label: "Next test", text: next },
  ];
}

export type ProofInput = {
  label: string;
  value: string | null;
  source: string | null;
};

export type FigureProof = {
  figure: string;
  value: string | null;
  inputs: readonly ProofInput[];
  clause: string | null;
  page: string | null;
  review: string | null;
};

/** Input names a proof can ask for. Values stay null until the engine sends them. */
export const FIGURE_INPUTS = {
  totalHeadroom: ["Secured incremental capacity", "Amount already drawn"],
  utilization: ["Amount drawn", "Commitment"],
  covenantsAtRisk: ["Covenant headroom", "Band threshold"],
  nextTest: ["Test date"],
  capacitySummary: ["Facility commitment", "Facility drawn"],
  headroomOverTime: ["Period-end headroom"],
  capacityRemaining: ["Maximum capacity", "Amount tested"],
  simulateRatio: ["Numerator", "Denominator"],
  driver: ["Driver amount"],
  statusHeadroom: ["Required level", "Actual level"],
} as const;

export function unloadedProof(
  figure: string,
  value: string | null,
  labels: readonly string[],
  extras?: Partial<Pick<FigureProof, "clause" | "page" | "review">>,
): FigureProof {
  return {
    figure,
    value,
    inputs: labels.map((label) => ({ label, value: null, source: null })),
    clause: extras?.clause ?? null,
    page: extras?.page ?? null,
    review: extras?.review ?? null,
  };
}

export function missingInputLabels(proof: FigureProof): string[] {
  return proof.inputs.filter((input) => input.value == null || input.value.trim() === "").map((input) => input.label);
}

export type CertificateLine = {
  name: string;
  required: string | null;
  actual: string | null;
  headroom: string | null;
  /** PASS or FAIL only when the engine already evaluated the line. */
  evaluated: "PASS" | "FAIL" | null;
  citation: string | null;
};

export type CertificateVerdict = "PASS" | "FAIL" | "NOT EVALUATED";

export type CertificateModel = {
  company: string;
  period: string | null;
  lines: readonly CertificateLine[];
};

export function presentVerdict(line: CertificateLine): CertificateVerdict {
  if (line.evaluated !== "PASS" && line.evaluated !== "FAIL") return "NOT EVALUATED";
  if (!line.required?.trim() || !line.actual?.trim()) return "NOT EVALUATED";
  return line.evaluated;
}

export function unevaluatedLine(name: string, citation: string | null): CertificateLine {
  return { name, required: null, actual: null, headroom: null, evaluated: null, citation };
}

export function certificateCsv(model: CertificateModel): string {
  const header = ["Company", "Period", "Covenant", "Required", "Actual", "Headroom", "Result", "Citation"];
  const period = model.period ?? "";
  const rows = model.lines.map((line) => [
    model.company,
    period,
    line.name,
    line.required ?? "",
    line.actual ?? "",
    line.headroom ?? "",
    presentVerdict(line),
    line.citation ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export type CalendarKind = "test" | "reporting" | "cure";

export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  label: string;
  /** YYYY-MM-DD supplied by the engine. Null is not a date. */
  date: string | null;
};

export function isIsoDate(value: string | null): value is string {
  return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function datedItems(items: readonly CalendarItem[]): CalendarItem[] {
  return items.filter((item) => isIsoDate(item.date));
}

export type KeyRatioId = "gross" | "net" | "secured" | "interest" | "fccr";

export type KeyRatioModel = {
  id: KeyRatioId;
  label: string;
  /** Null when the position did not return a finite ratio. */
  value: number | null;
  /** Already worded, for example "4.00x max". Null when no covenant limit is on the row. */
  limitLabel: string | null;
  thresholds: BandCutoffs | null;
  clause: string | null;
  source: string | null;
};

export function formatRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Missing input";
  return `${value.toFixed(2)}x`;
}

export function keyRatioProof(ratio: KeyRatioModel): FigureProof {
  const shown = formatRatio(ratio.value);
  return {
    figure: ratio.label,
    value: shown === "Missing input" ? null : shown,
    inputs: [
      { label: ratio.label, value: shown === "Missing input" ? null : shown, source: ratio.source },
      { label: "Covenant limit", value: ratio.limitLabel, source: ratio.clause },
      {
        label: "Band thresholds",
        value: ratio.thresholds ? ratio.thresholds.limitLabel : null,
        source: ratio.thresholds ? "Cutoffs supplied with this ratio." : null,
      },
    ],
    clause: ratio.clause,
    page: null,
    review: ratio.thresholds ? null : "Band thresholds not set",
  };
}

const KEY_RATIO_LABEL: Record<KeyRatioId, string> = {
  gross: "Gross leverage",
  net: "Net leverage",
  secured: "Secured leverage",
  interest: "Interest coverage",
  fccr: "Fixed charge coverage",
};

export function emptyKeyRatio(id: KeyRatioId): KeyRatioModel {
  return {
    id,
    label: KEY_RATIO_LABEL[id],
    value: null,
    limitLabel: null,
    thresholds: null,
    clause: null,
    source: null,
  };
}

export const UNLOADED_KEY_RATIOS: readonly KeyRatioModel[] = (
  ["gross", "net", "secured", "interest", "fccr"] as const
).map(emptyKeyRatio);

export type BandName = "Healthy" | "Moderate" | "Danger";

export type BandCutoffs = {
  direction: "lower-is-safer" | "higher-is-safer";
  healthyUntil: number;
  moderateUntil: number;
  limit: number;
  limitLabel: string;
};

export type BandReading = {
  name: string;
  actual: number | null;
  actualLabel: string | null;
  thresholds: BandCutoffs | null;
  previousBand: BandName | null;
  trendingToward: BandName | null;
};

export function currentBand(reading: BandReading): BandName | null {
  const thresholds = reading.thresholds;
  if (!thresholds || reading.actual == null || !Number.isFinite(reading.actual)) return null;
  const value = reading.actual;
  if (thresholds.direction === "lower-is-safer") {
    if (value <= thresholds.healthyUntil) return "Healthy";
    if (value <= thresholds.moderateUntil) return "Moderate";
    return "Danger";
  }
  if (value >= thresholds.healthyUntil) return "Healthy";
  if (value >= thresholds.moderateUntil) return "Moderate";
  return "Danger";
}

export function bandSentence(reading: BandReading): string | null {
  if (!reading.thresholds) return null;
  const band = currentBand(reading);
  if (!band) return null;
  if (reading.previousBand && reading.previousBand !== band && reading.actualLabel) {
    return `${reading.name} moved ${reading.previousBand} → ${band} (${reading.actualLabel} of ${reading.thresholds.limitLabel}).`;
  }
  if (reading.trendingToward && reading.trendingToward !== band) {
    return `${reading.name} is trending toward ${reading.trendingToward}.`;
  }
  return null;
}

export type ScenarioLine = { label: string; value: string };

export type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  lines: readonly ScenarioLine[];
};

function numericToken(value: string): number | null {
  const stripped = value.replace(/[$,]/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Numeric delta between two saved display strings. Null when either side is not a plain number. */
export function scenarioDelta(base: string, next: string): string | null {
  const a = numericToken(base);
  const b = numericToken(next);
  if (a == null || b == null) return null;
  const diff = Math.round((b - a) * 100) / 100;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : String(diff);
}
