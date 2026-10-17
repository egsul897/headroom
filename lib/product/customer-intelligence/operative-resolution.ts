/**
 * Resolve operative amendment language when evidence is sufficient.
 * Fail closed to UNRESOLVED_PRECEDENCE when anything material is missing.
 */

import type { KnowledgeSourceRecord } from "../../knowledge-factory/types";
import type { AmendmentPackageView } from "./amendment-package";
import type { AmendmentCompareRow, AmendmentCompareView } from "./amendment-compare";
import { articleOf } from "./amendment-compare";
import { isRestatementTitle } from "./restatement-title";
import { isValidIsoDate } from "../iso-date";

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

/** Classes that carry no precedence information (mirror of amendment-package rule 8). */
const UNCLASSIFIED_CLASSES = new Set(["UNKNOWN", "OTHER_DEBT_RELATED"]);

type InstrumentFamily = "CREDIT" | "INDENTURE";

/**
 * Coarse instrument family from title/class. Returns null when the
 * document does not name an instrument — unknown is not a mismatch.
 * CREDIT covers credit/loan/term/revolver/ABL facilities (one family:
 * a "Loan Agreement" restating a "Credit Agreement" is the same kind
 * of instrument). INDENTURE is a distinct instrument.
 */
function instrumentFamily(
  documentTitle: string | undefined,
  documentClass: string,
): InstrumentFamily | null {
  const t = (documentTitle || "").toLowerCase();
  if (/indenture/.test(t) || documentClass === "INDENTURE") return "INDENTURE";
  if (
    /credit agreement|loan agreement|term loan|revolv|abl|credit facility/.test(t) ||
    documentClass === "CREDIT_AGREEMENT" ||
    documentClass === "TERM_LOAN_AGREEMENT" ||
    documentClass === "REVOLVING_CREDIT_AGREEMENT" ||
    documentClass === "ABL_AGREEMENT"
  )
    return "CREDIT";
  return null;
}

/** Parse dates like "as of March 15, 2024" / "dated as of 2024-03-15" / ISO from titles. */
export function extractEffectiveDateHint(text: string): string | null {
  // Prefer a phrase-attached ISO date ("dated as of 2024-03-15").
  const phraseIso = text.match(/(?:dated\s+as\s+of|as\s+of|effective(?:\s+as\s+of)?)\s*(20\d{2}-\d{2}-\d{2})\b/i);
  if (phraseIso && isValidIsoDate(phraseIso[1]!)) return phraseIso[1]!;
  // Bare ISO: first ISO date NOT preceded by maturity language.
  // "Notes due 2031-06-01" is a maturity date, not an effective
  // date (rule 28 class: a maturity year/date mistaken for the
  // effective date corrupted chronology and as-of gating).
  for (const m of text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0).toLowerCase();
    if (/\b(due|maturing|maturity|redeemable|payable|expires?)\b/.test(before)) continue;
    if (isValidIsoDate(m[1]!)) return m[1]!;
  }
  const mdy = text.match(
    /\b(?:dated\s+as\s+of|as\s+of|effective\s+(?:as\s+of\s+)?)\s*([A-Z][a-z]+ \d{1,2},?\s+20\d{2})\b/i,
  );
  if (mdy) {
    const d = new Date(mdy[1]!);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // No bare-year fallback: a bare 4-digit year in a title is usually
  // a maturity year ("8.5% Notes due 2031"), a facility year, or a
  // fiscal year — not the effective date. Inventing Jan 1 of that
  // year corrupted chronology checks and as-of gating (a
  // restatement titled with a 2031 maturity year was treated as
  // "not yet effective" until 2031). Callers fall back to the
  // filing date (a real date) when this returns null.
  return null;
}

export function extractAmendedSectionRefs(text: string): string[] {
  const out = new Set<string>();
  // "of the Existing Credit Agreement" is the standard amendment
  // phrasing — the bridge must admit the adjectives drafters put
  // between "the" and the instrument noun, or explicit amendatory
  // language ("Section 1.01 of the Existing Credit Agreement is
  // hereby amended") is never detected.
  const ofThe = String.raw`(?:of\s+the\s+(?:Existing\s+|Amended\s+and\s+Restated\s+)?(?:20\d{2}\s+)?(?:Credit\s+Agreement|Indenture)\s+)?`;
  let m: RegExpExecArray | null;
  // Specific patterns first: the general singular regex would
  // otherwise grab the SECOND ref of a repeated/plural clause
  // before the list patterns see the first, scrambling order.
  const reRepeated = new RegExp(
    String.raw`\bSection\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))?)\s+and\s+Section\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))?)\s+` +
      ofThe +
      String.raw`(?:are)\s+hereby\s+(?:amended|deleted|restated)`,
    "gi",
  );
  while ((m = reRepeated.exec(text)) !== null) {
    out.add(m[1]!);
    out.add(m[2]!);
  }
  // Plural list: "Sections 6.01, 6.02 and 6.03 are hereby amended".
  // The list grammar only accepts refs, commas, and "and", so a
  // bare year elsewhere in the clause ("of the 2024 Credit
  // Agreement") cannot leak in as a ref.
  const refInList = /\d+(?:\.\d+)*(?:\([a-z0-9]+\))?/gi;
  const rePlural = new RegExp(
    String.raw`\bSections\s+((?:\d+(?:\.\d+)*(?:\([a-z0-9]+\))?\s*(?:,\s*|\s+and\s+))+\d+(?:\.\d+)*(?:\([a-z0-9]+\))?)\s+` +
      ofThe +
      String.raw`(?:are)\s+hereby\s+(?:amended|deleted|restated)`,
    "gi",
  );
  while ((m = rePlural.exec(text)) !== null) {
    for (const r of m[1]!.match(refInList) ?? []) out.add(r);
  }
  const re = new RegExp(
    String.raw`\bSection\s+(\d+(?:\.\d+)*)\s+` + ofThe + String.raw`(?:is|are)\s+hereby\s+(?:amended|deleted|restated)`,
    "gi",
  );
  while ((m = re.exec(text)) !== null) out.add(m[1]!);
  const re2 = /\bSection\s+(\d+(?:\.\d+)*)\s+is\s+amended\s+to\s+read/gi;
  while ((m = re2.exec(text)) !== null) out.add(m[1]!);
  // Rule 184: the amendatory family is wider than "hereby
  // amended". Real amendments write "the definition of X in
  // Section 1.01 is amended by deleting ...", "the second
  // sentence in Section 2.14(a) is replaced in its entirety",
  // "Section 1.01 is amended by deleting ..." — all without
  // "hereby". Without these, a pair like Solaris binds fourteen
  // instruction refs and zero real targets (1.01, 2.14(a)).
  const reBare = new RegExp(
    String.raw`\bSection\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))?)\s+is\s+(?:hereby\s+)?(?:amended|replaced|deleted|restated)\b`,
    "gi",
  );
  while ((m = reBare.exec(text)) !== null) out.add(m[1]!);
  const reIn = new RegExp(
    String.raw`\bin\s+Section\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))?)\s+is\s+(?:hereby\s+)?(?:amended|replaced|deleted|restated)\b`,
    "gi",
  );
  while ((m = reIn.exec(text)) !== null) out.add(m[1]!);
  // Definitions added TO a section ("The following definitions
  // are added in alphabetical order to Section 1.01") amend that
  // section. The tempered token excludes "pursuant to Section"
  // authority cites ("Commitments are added pursuant to Section
  // 2.14" names the authority, not an amended section).
  const reAdded = /(?:are\s+)?added\b(?:(?!pursuant)[^.]){0,80}?\bto\s+Section\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))?)/gi;
  while ((m = reAdded.exec(text)) !== null) out.add(m[1]!);
  // Schedules are amended too ("Schedule 2.01 ... is hereby
  // amended and restated") — return them as "Schedule N" targets.
  const reSched = /\bSchedule\s+(\d+(?:\.\d+)*)\b[^.]{0,80}\bis\s+(?:hereby\s+)?(?:amended|restated|replaced)\b/gi;
  while ((m = reSched.exec(text)) !== null) out.add(`Schedule ${m[1]!}`);
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
      // Rule 52: shared isRestatementTitle — an "Amendment ...
      // to [the Amended and Restated ...]" is an amendment to a
      // restated base, not itself a restatement. The old bare
      // title test treated such an amendment as a full
      // restatement superseding the entire base agreement.
      isRestatementTitle(s.documentTitle || ""),
  );
  const nonRestatementBases = ap.baseCandidates.filter((b) => b.documentClass !== "RESTATEMENT");

  // Gate: an unclassified sibling blocks EVERY resolution path. The
  // RESOLVED returns below must not discard the package-level
  // fail-closed signal (rule 8) by resetting unresolvedReasons to [].
  const unclassified = params.sources.filter((s) => UNCLASSIFIED_CLASSES.has(s.documentClass));
  if (unclassified.length > 0) {
    unresolved.push(
      "Operative resolution blocked: unclassified document(s) present (UNKNOWN / OTHER_DEBT_RELATED) — their relationship to the base agreement is unknown.",
    );
    return {
      status: "UNRESOLVED_PRECEDENCE",
      operativeDocumentSourceId: null,
      baseDocumentSourceId:
        nonRestatementBases.length === 1 ? nonRestatementBases[0]!.sourceId : null,
      effectiveDate: null,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: "Unclassified documents block operative resolution until classified.",
    };
  }

  // Full restatement / amended-and-restated supersession (RESTATEMENT is also a "base" class)
  // Rule 182: the restatement and the base must be DIFFERENT
  // documents. An Amended and Restated base agreement matches
  // isRestatementTitle on its own title — without the sourceId
  // check it "superseded itself" and the resolver returned
  // RESOLVED with the base as its own operative document.
  if (
    restatementSources.length === 1 &&
    nonRestatementBases.length === 1 &&
    restatementSources[0]!.sourceId !== nonRestatementBases[0]!.sourceId
  ) {
    const baseId = nonRestatementBases[0]!.sourceId;
    const restatement = restatementSources[0]!;
    const baseSource = params.sources.find((x) => x.sourceId === baseId);
    // The restatement must evidence it restates THIS base. A restatement
    // naming a different instrument (e.g. "Amended and Restated Credit
    // Agreement" beside a base Indenture) must not supersede it.
    const restatementFamily = instrumentFamily(restatement.documentTitle, restatement.documentClass);
    const baseFamily = instrumentFamily(baseSource?.documentTitle, baseSource?.documentClass ?? "");
    if (restatementFamily && baseFamily && restatementFamily !== baseFamily) {
      unresolved.push(
        `Restatement “${restatement.documentTitle}” appears to concern a different instrument than the base agreement — automatic supersession blocked.`,
      );
      return {
        status: "UNRESOLVED_PRECEDENCE",
        operativeDocumentSourceId: null,
        baseDocumentSourceId: baseId,
        effectiveDate: null,
        asOfDate: params.asOfDate ?? null,
        bindings: [],
        unresolvedReasons: unresolved,
        note: "Restatement instrument mismatch blocks automatic supersession.",
      };
    }
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
    // PAI-06: as-of before restatement effectiveness → predecessor remains operative.
    const asOf = params.asOfDate?.slice(0, 10) ?? null;
    if (asOf && eff && asOf < eff) {
      return {
        status: "UNRESOLVED_PRECEDENCE",
        operativeDocumentSourceId: baseId,
        baseDocumentSourceId: baseId,
        effectiveDate: eff,
        asOfDate: asOf,
        bindings: [],
        unresolvedReasons: [
          ...unresolved,
          `Restatement effective/filing ${eff} is not yet effective as of ${asOf} — predecessor remains governing.`,
        ],
        note: `As-of ${asOf} precedes restatement effectiveness ${eff}; base retained.`,
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
  // Multiple restatements must not silently pick one (Array.find order).
  if (restatementSources.length > 1) {
    unresolved.push(
      "Multiple restatements present — sequencing requires counsel review; no single restatement selected.",
    );
    return {
      status: "UNRESOLVED_PRECEDENCE",
      operativeDocumentSourceId: null,
      baseDocumentSourceId: baseId,
      effectiveDate: null,
      asOfDate: params.asOfDate ?? null,
      bindings: [],
      unresolvedReasons: unresolved,
      note: "Multiple restatements block automatic supersession.",
    };
  }
  const restatement = params.sources.find(
    (s) =>
      s.sourceId !== baseId &&
      (s.documentClass === "RESTATEMENT" || isRestatementTitle(s.documentTitle || "")),
  );
  if (restatement) {
    const restatementFamily = instrumentFamily(restatement.documentTitle, restatement.documentClass);
    const baseSource = params.sources.find((x) => x.sourceId === baseId);
    const baseFamily = instrumentFamily(baseSource?.documentTitle, baseSource?.documentClass ?? "");
    if (restatementFamily && baseFamily && restatementFamily !== baseFamily) {
      unresolved.push(
        `Restatement “${restatement.documentTitle}” appears to concern a different instrument than the base agreement — automatic supersession blocked.`,
      );
      return {
        status: "UNRESOLVED_PRECEDENCE",
        operativeDocumentSourceId: null,
        baseDocumentSourceId: baseId,
        effectiveDate: null,
        asOfDate: params.asOfDate ?? null,
        bindings: [],
        unresolvedReasons: unresolved,
        note: "Restatement instrument mismatch blocks automatic supersession.",
      };
    }
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
    // PAI-06 (second path): as-of before restatement effectiveness.
    const asOf = params.asOfDate?.slice(0, 10) ?? null;
    if (asOf && eff && asOf < eff) {
      return {
        status: "UNRESOLVED_PRECEDENCE",
        operativeDocumentSourceId: baseId,
        baseDocumentSourceId: baseId,
        effectiveDate: eff,
        asOfDate: asOf,
        bindings: [],
        unresolvedReasons: [
          ...unresolved,
          `Restatement effective/filing ${eff} is not yet effective as of ${asOf} — predecessor remains governing.`,
        ],
        note: `As-of ${asOf} precedes restatement effectiveness ${eff}; base retained.`,
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

  // Rule 183: an amendment document's sections are instructions
  // or amendment-internal scaffolding unless they demonstrably
  // restate a base section. Binding an ADDED row's own ref would
  // install the instruction/scaffolding as the operative section:
  // amendment §2.1 ("Section 1.01 ... is hereby amended") is NOT
  // the operative §2.1 (Commitments), and amendment §3 (Conditions
  // Precedent to the amendment's effectiveness) is NOT the
  // operative Article III (Representations). The REAL change is
  // bound via explicitSecs below (the TARGET section, §1.01).
  // Scaffolding articles come from the compare (derived from the
  // FULL pre-cap row list — the resolver only sees capped rows).
  const scaffoldingArticles = new Set<string>(params.compare.scaffoldingArticles ?? []);
  const isInstructionRow = (row: (typeof changed)[number]): boolean => {
    const excerpt = row.amendmentExcerpt ?? "";
    if (extractAmendedSectionRefs(excerpt).length > 0) return true;
    // Defined-term amendment: "The defined term "Maturity Date" is
    // amended and restated in its entirety..." (no Section ref).
    if (/\bdefined term\b[^.]{0,80}\bis\s+amended\b/i.test(excerpt)) return true;
    return false;
  };
  const bindings: OperativeSectionBinding[] = [];
  for (const row of changed) {
    if (row.changeKind === "ADDED_IN_AMENDMENT" && isInstructionRow(row)) continue;
    if (row.changeKind === "ADDED_IN_AMENDMENT") {
      if (scaffoldingArticles.has(articleOf(row.sectionRef))) continue;
    }
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
      rationale: `Explicit amendatory language naming ${sec}.`,
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
