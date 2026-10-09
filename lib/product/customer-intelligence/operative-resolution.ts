/**
 * Resolve operative amendment language when evidence is sufficient.
 * Fail closed to UNRESOLVED_PRECEDENCE when anything material is missing.
 */

import type { KnowledgeSourceRecord } from "../../knowledge-factory/types";
import type { AmendmentPackageView } from "./amendment-package";
import type { AmendmentCompareRow, AmendmentCompareView } from "./amendment-compare";

export type OperativeResolutionStatus =
  | AmendmentPackageView["operativeResolution"]
  | "RESOLVED_PARTIAL";

export interface OperativeSectionBinding {
  sectionRef: string;
  operativeSourceId: string;
  baseSourceId: string;
  changeKind: AmendmentCompareRow["changeKind"];
  effectiveDate: string | null;
  rationale: string;
}

export interface OperativeResolutionView {
  status: OperativeResolutionStatus;
  operativeDocumentSourceId: string | null;
  baseDocumentSourceId: string | null;
  effectiveDate: string | null;
  asOfDate: string | null;
  bindings: OperativeSectionBinding[];
  unresolvedReasons: string[];
  note: string;
}

function filingDateOf(sources: KnowledgeSourceRecord[], sourceId: string): string | null {
  const s = sources.find((x) => x.sourceId === sourceId);
  return s?.filingDate?.slice(0, 10) ?? null;
}

/** Parse dates like "as of March 15, 2024" / "dated as of 2024-03-15" / ISO from titles. */
export function extractEffectiveDateHint(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1]!;
  const mdy = text.match(
    /\b(?:dated\s+as\s+of|as\s+of|effective\s+(?:as\s+of\s+)?)([A-Z][a-z]+ \d{1,2},?\s+20\d{2})\b/i,
  );
  if (mdy) {
    const d = new Date(mdy[1]!);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const bare = text.match(/\b(20\d{2})\b/);
  return bare ? `${bare[1]}-01-01` : null;
}

export function extractAmendedSectionRefs(text: string): string[] {
  const out = new Set<string>();
  const re =
    /\bSection\s+(\d+(?:\.\d+)*)\s+(?:of\s+the\s+(?:Credit\s+Agreement|Indenture)\s+)?(?:is|are)\s+hereby\s+(?:amended|deleted|restated)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1]!);
  const re2 = /\bSection\s+(\d+(?:\.\d+)*)\s+is\s+amended\s+to\s+read/gi;
  while ((m = re2.exec(text)) !== null) out.add(m[1]!);
  return [...out];
}

/**
 * When a single base + later amendment/restatement pair has concrete section
 * diffs (or restatement replacement), bind operative language to the later doc.
 */
export function resolveOperativePrecedence(params: {
  sources: KnowledgeSourceRecord[];
  amendmentPackage: AmendmentPackageView;
  compare: AmendmentCompareView;
  asOfDate?: string | null;
}): OperativeResolutionView {
  const ap = params.amendmentPackage;
  const unresolved: string[] = [...ap.unresolvedReasons];

  if (ap.operativeResolution === "NO_DOCUMENTS" || ap.operativeResolution === "SINGLE_DOCUMENT") {
    return {
      status: ap.operativeResolution,
      operativeDocumentSourceId: ap.baseCandidates[0]?.sourceId ?? null,
      baseDocumentSourceId: ap.baseCandidates[0]?.sourceId ?? null,
      effectiveDate: null,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: ap.askGuidance,
    };
  }

  const restatementSources = params.sources.filter(
    (s) =>
      s.documentClass === "RESTATEMENT" ||
      /\bamended and restated\b|\brestate/i.test(s.documentTitle || ""),
  );
  const nonRestatementBases = ap.baseCandidates.filter((b) => b.documentClass !== "RESTATEMENT");

  // Full restatement / amended-and-restated supersession (RESTATEMENT is also a "base" class)
  if (restatementSources.length === 1 && nonRestatementBases.length === 1) {
    const baseId = nonRestatementBases[0]!.sourceId;
    const restatement = restatementSources[0]!;
    const baseDate = filingDateOf(params.sources, baseId);
    const eff =
      extractEffectiveDateHint(restatement.documentTitle || "") ||
      restatement.filingDate?.slice(0, 10) ||
      null;
    if (baseDate && eff && eff < baseDate) {
      unresolved.push("Restatement effective/filing date precedes base — chronology inconsistent.");
      return {
        status: "UNRESOLVED_PRECEDENCE",
        operativeDocumentSourceId: null,
        baseDocumentSourceId: baseId,
        effectiveDate: eff,
        asOfDate: params.asOfDate ?? null,
        bindings: [],
        unresolvedReasons: unresolved,
        note: "Chronology conflict blocks automatic supersession.",
      };
    }
    return {
      status: "RESOLVED",
      operativeDocumentSourceId: restatement.sourceId,
      baseDocumentSourceId: baseId,
      effectiveDate: eff,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: [],
      note: `Operative package language treated as superseded by restatement “${restatement.documentTitle}”${eff ? ` (effective/filing ${eff})` : ""}. Prior versions retained for history.`,
    };
  }

  if (nonRestatementBases.length !== 1) {
    unresolved.push("Operative resolution requires exactly one identified base agreement.");
    return {
      status: "UNRESOLVED_PRECEDENCE",
      operativeDocumentSourceId: null,
      baseDocumentSourceId: null,
      effectiveDate: null,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: "Multiple or zero bases — cannot select controlling document.",
    };
  }

  const baseId = nonRestatementBases[0]!.sourceId;
  const baseDate = filingDateOf(params.sources, baseId);

  // Additional restatement path when restatement is not classified as base candidate
  const restatement = params.sources.find(
    (s) =>
      s.sourceId !== baseId &&
      (s.documentClass === "RESTATEMENT" ||
        /\bamended and restated\b|\brestate/i.test(s.documentTitle || "")),
  );
  if (restatement) {
    const eff =
      extractEffectiveDateHint(restatement.documentTitle || "") ||
      restatement.filingDate?.slice(0, 10) ||
      null;
    if (baseDate && eff && eff < baseDate) {
      unresolved.push("Restatement effective/filing date precedes base — chronology inconsistent.");
      return {
        status: "UNRESOLVED_PRECEDENCE",
        operativeDocumentSourceId: null,
        baseDocumentSourceId: baseId,
        effectiveDate: eff,
        asOfDate: params.asOfDate ?? null,
        bindings: [],
        unresolvedReasons: unresolved,
        note: "Chronology conflict blocks automatic supersession.",
      };
    }
    return {
      status: "RESOLVED",
      operativeDocumentSourceId: restatement.sourceId,
      baseDocumentSourceId: baseId,
      effectiveDate: eff,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: [],
      note: `Operative package language treated as superseded by restatement “${restatement.documentTitle}”${eff ? ` (effective/filing ${eff})` : ""}. Prior versions retained for history.`,
    };
  }

  if (ap.amendmentDocuments.length === 0) {
    unresolved.push("No amendment documents identified for partial operative binding.");
    return {
      status: "UNRESOLVED_PRECEDENCE",
      operativeDocumentSourceId: null,
      baseDocumentSourceId: baseId,
      effectiveDate: null,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: "Need an amendment document with detectable section changes.",
    };
  }

  // Prefer latest amendment by filing date
  const amdSorted = [...ap.amendmentDocuments].sort((a, b) => {
    const da = filingDateOf(params.sources, a.sourceId) ?? "";
    const db = filingDateOf(params.sources, b.sourceId) ?? "";
    return db.localeCompare(da);
  });
  const amd = amdSorted[0]!;
  const amdSource = params.sources.find((s) => s.sourceId === amd.sourceId);
  const eff =
    extractEffectiveDateHint(amd.title || "") ||
    filingDateOf(params.sources, amd.sourceId) ||
    null;

  const changed = params.compare.rows.filter(
    (r) =>
      r.changeKind === "THRESHOLD_OR_TEXT_SHIFT" ||
      r.changeKind === "ADDED_IN_AMENDMENT",
  );

  // Also accept explicit "Section X is hereby amended" from amendment title / compare notes
  const explicitSecs = extractAmendedSectionRefs(
    `${amd.title}\n${params.compare.rows.map((r) => r.amendmentExcerpt ?? "").join("\n")}`,
  );

  if (changed.length === 0 && explicitSecs.length === 0) {
    unresolved.push(
      "No section-level threshold/text shifts or explicit “Section … is hereby amended” language detected — cannot bind operative text.",
    );
    return {
      status: "UNRESOLVED_PRECEDENCE",
      operativeDocumentSourceId: null,
      baseDocumentSourceId: baseId,
      effectiveDate: eff,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: "Amendment present but changed provisions not evidenced in analyses.",
    };
  }

  if (baseDate && eff && eff < baseDate) {
    unresolved.push("Amendment effective/filing date precedes base agreement.");
    return {
      status: "UNRESOLVED_PRECEDENCE",
      operativeDocumentSourceId: null,
      baseDocumentSourceId: baseId,
      effectiveDate: eff,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: "Chronology conflict.",
    };
  }

  const bindings: OperativeSectionBinding[] = [];
  for (const row of changed) {
    bindings.push({
      sectionRef: row.sectionRef,
      operativeSourceId: amd.sourceId,
      baseSourceId: baseId,
      changeKind: row.changeKind,
      effectiveDate: eff,
      rationale: `Amendment “${amd.title}” ${row.changeKind}; later document controls this section subject to stated effectiveness.`,
    });
  }
  for (const sec of explicitSecs) {
    if (bindings.some((b) => b.sectionRef === sec)) continue;
    bindings.push({
      sectionRef: sec,
      operativeSourceId: amd.sourceId,
      baseSourceId: baseId,
      changeKind: "THRESHOLD_OR_TEXT_SHIFT",
      effectiveDate: eff,
      rationale: `Explicit amendatory language naming Section ${sec}.`,
    });
  }

  // Unamended base-only sections remain governed by base (not listed as bindings)
  const status: OperativeResolutionStatus =
    params.compare.rows.some((r) => r.changeKind === "PRESENT_IN_BASE_ONLY") ||
    ap.amendmentDocuments.length > 1
      ? "RESOLVED_PARTIAL"
      : "RESOLVED";

  return {
    status,
    operativeDocumentSourceId: amd.sourceId,
    baseDocumentSourceId: baseId,
    effectiveDate: eff,
    asOfDate: params.asOfDate ?? null,
    bindings,
    unresolvedReasons:
      status === "RESOLVED_PARTIAL"
        ? [
            "Partial resolution: listed sections follow the amendment; unlisted base sections remain on the base agreement pending further amendatory evidence.",
            ...(ap.amendmentDocuments.length > 1
              ? ["Multiple amendments present — only the latest filing-date amendment was bound; earlier amendments need counsel sequencing review."]
              : []),
          ]
        : [],
    note: `Supported operative bindings for ${bindings.length} section(s) under amendment “${amd.title}”${eff ? ` (effective/filing ${eff})` : ""}. ${amdSource ? "" : ""}Historical base language retained.`,
  };
}
