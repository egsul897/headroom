import type { BandReading, CalendarItem, CertificateModel, FigureProof, MorningBriefModel, SavedScenario } from "@/lib/ux/present";

/** Illustrations for /dev/sample only. Every string says it is a sample. */

export const SAMPLE_BRIEF: MorningBriefModel = {
  lastVisitLabel: "Oct 16",
  changes: ["Sample headroom illustration moved."],
  needsYou: { count: 2, href: "/dev/sample?screen=covenants" },
  nextTest: { label: "Dec 31, 2024", daysLeft: 75 },
};

export const SAMPLE_HEADROOM_PROOF: FigureProof = {
  figure: "Total headroom",
  value: "$86 million sample",
  inputs: [
    { label: "Sample capacity", value: "$200 million", source: "Sample illustration. No source document is attached." },
    { label: "Sample amount drawn", value: "$114 million", source: "Sample illustration. No source document is attached." },
    { label: "Prior period headroom", value: null, source: null },
  ],
  clause: "Sample agreement §4.09. Sample language, not an operative clause.",
  page: "Sample page 42",
  review: "Sample review. Not a company result.",
};

export const SAMPLE_CERTIFICATE: CertificateModel = {
  company: "Sample Holdings",
  period: "Sample period ending Dec 31, 2024",
  lines: [
    {
      name: "Sample net leverage",
      required: "4.0x max",
      actual: "3.1x",
      headroom: "0.9x",
      evaluated: "PASS",
      citation: "Sample agreement §7.01. Not an operative clause.",
    },
    {
      name: "Sample interest coverage",
      required: "2.0x min",
      actual: "1.8x",
      headroom: "−0.2x",
      evaluated: "FAIL",
      citation: "Sample agreement §7.02. Not an operative clause.",
    },
    {
      name: "Sample capital expenditure",
      required: null,
      actual: null,
      headroom: null,
      evaluated: null,
      citation: "Sample agreement §7.03. Not an operative clause.",
    },
  ],
};

export const SAMPLE_CALENDAR: CalendarItem[] = [
  { id: "test", kind: "test", label: "Sample net leverage test", date: "2026-10-28" },
  { id: "report", kind: "reporting", label: "Sample compliance certificate", date: "2026-12-01" },
  { id: "cure", kind: "cure", label: "Sample cure period", date: "2026-12-30" },
  { id: "missing", kind: "test", label: "Sample capital expenditure test", date: null },
];

export const SAMPLE_BANDS: BandReading[] = [
  {
    name: "Net leverage",
    actual: 3.1,
    actualLabel: "3.1x",
    thresholds: {
      direction: "lower-is-safer",
      healthyUntil: 2.5,
      moderateUntil: 3.5,
      limit: 4,
      limitLabel: "4.0x max",
    },
    previousBand: "Healthy",
    trendingToward: null,
  },
  {
    name: "Interest coverage",
    actual: 2.4,
    actualLabel: "2.4x",
    thresholds: {
      direction: "higher-is-safer",
      healthyUntil: 3,
      moderateUntil: 2.25,
      limit: 2,
      limitLabel: "2.0x min",
    },
    previousBand: "Moderate",
    trendingToward: "Danger",
  },
  {
    name: "Capital expenditure",
    actual: null,
    actualLabel: null,
    thresholds: null,
    previousBand: null,
    trendingToward: null,
  },
];

export const SAMPLE_SCENARIOS: SavedScenario[] = [
  {
    id: "base",
    name: "Sample base",
    savedAt: "2026-10-16T12:00:00.000Z",
    lines: [
      { label: "Action", value: "Debt incurrence" },
      { label: "Amount", value: "80" },
    ],
  },
  {
    id: "upsize",
    name: "Sample upsize",
    savedAt: "2026-10-16T12:05:00.000Z",
    lines: [
      { label: "Action", value: "Debt incurrence" },
      { label: "Amount", value: "140" },
    ],
  },
  {
    id: "dividend",
    name: "Sample dividend",
    savedAt: "2026-10-16T12:10:00.000Z",
    lines: [
      { label: "Action", value: "Dividend / buyback" },
      { label: "Amount", value: "40" },
    ],
  },
];
