/**
 * Amendment-aware operative classification for research retrieval.
 * Distinguishes operative / superseded / unknown effective date / missing
 * amendment authority / unresolved operative state. Never invents current
 * legal truth.
 */

import type { OperativeVersionStatus, ResearchCorpusEntry } from "./types";

export interface OperativeClassification {
  status: OperativeVersionStatus;
  uncertaintyNotes: string[];
  includeInOperativeOnly: boolean;
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/**
 * Classify an entry relative to an optional as-of date.
 * When asOfDate is null, returns the entry's stored operative status with
 * uncertainty if unknown.
 */
export function classifyOperativeAsOf(
  entry: ResearchCorpusEntry,
  asOfDate: string | null | undefined,
): OperativeClassification {
  const stored = entry.operativeVersion.status;
  const notes: string[] = [];
  const from = dateOnly(entry.operativeVersion.effectiveFrom);
  const to = dateOnly(entry.operativeVersion.effectiveTo);
  const asOf = dateOnly(asOfDate ?? null);

  if (stored === "UNRESOLVED_OPERATIVE_STATE") {
    return {
      status: "UNRESOLVED_OPERATIVE_STATE",
      uncertaintyNotes: ["Operative state unresolved in source lineage; not treated as current."],
      includeInOperativeOnly: false,
    };
  }
  if (stored === "MISSING_AMENDMENT_AUTHORITY") {
    return {
      status: "MISSING_AMENDMENT_AUTHORITY",
      uncertaintyNotes: ["Amendment authority missing; cannot confirm operative status."],
      includeInOperativeOnly: false,
    };
  }

  if (!asOf) {
    if (stored === "CURRENT_OPERATIVE") {
      return { status: stored, uncertaintyNotes: [], includeInOperativeOnly: true };
    }
    if (stored === "SUPERSEDED" || stored === "HISTORICAL" || stored === "AMENDED") {
      return {
        status: stored,
        uncertaintyNotes: ["No as-of date supplied; stored non-current status preserved."],
        includeInOperativeOnly: false,
      };
    }
    notes.push("Effective dating unknown or incomplete; not asserted as current operative text.");
    return {
      status: stored === "UNKNOWN" ? "UNKNOWN_EFFECTIVE_DATE" : stored,
      uncertaintyNotes: notes,
      includeInOperativeOnly: false,
    };
  }

  // As-of date supplied — use effective window when present.
  if (from && asOf < from) {
    return {
      status: "UNKNOWN_EFFECTIVE_DATE",
      uncertaintyNotes: [`As-of ${asOf} is before effectiveFrom ${from}; not treated as operative.`],
      includeInOperativeOnly: false,
    };
  }
  if (to && asOf >= to) {
    return {
      status: "SUPERSEDED",
      uncertaintyNotes: [`As-of ${asOf} is on/after effectiveTo ${to}; treated as superseded for this query.`],
      includeInOperativeOnly: false,
    };
  }
  if (from && (!to || asOf < to)) {
    if (stored === "SUPERSEDED" && !to) {
      return {
        status: "MISSING_AMENDMENT_AUTHORITY",
        uncertaintyNotes: [
          "Entry marked superseded but lacks effectiveTo; amendment authority/window incomplete.",
        ],
        includeInOperativeOnly: false,
      };
    }
    return {
      status: "CURRENT_OPERATIVE",
      uncertaintyNotes:
        stored === "CURRENT_OPERATIVE" || stored === "UNKNOWN" || stored === "UNKNOWN_EFFECTIVE_DATE"
          ? []
          : [`Stored status was ${stored}; window check relative to as-of ${asOf} permits operative inclusion.`],
      includeInOperativeOnly: true,
    };
  }

  if (!from && !to) {
    return {
      status: "UNKNOWN_EFFECTIVE_DATE",
      uncertaintyNotes: ["No effectiveFrom/effectiveTo; cannot assert operative status for as-of query."],
      includeInOperativeOnly: false,
    };
  }

  return {
    status: stored,
    uncertaintyNotes: notes,
    includeInOperativeOnly: stored === "CURRENT_OPERATIVE",
  };
}

/** Hard filter: when operativeOnly or asOfDate present, drop silently-current misreads. */
export function passesAmendmentAwareFilter(
  entry: ResearchCorpusEntry,
  opts: { asOfDate?: string | null; operativeOnly?: boolean },
): { pass: boolean; classification: OperativeClassification } {
  const classification = classifyOperativeAsOf(entry, opts.asOfDate);
  if (opts.operativeOnly || opts.asOfDate) {
    // Never silently treat superseded/unknown as current.
    if (!classification.includeInOperativeOnly) {
      // Still allow non-operative hits when operativeOnly is false and asOf is set,
      // but callers must surface classification — retrieve includes them with notes
      // unless operativeOnly is true.
      if (opts.operativeOnly) return { pass: false, classification };
    }
  }
  return { pass: true, classification };
}
