/**
 * Independent legal-correctness audit of formula candidates against
 * OPERATIVE source text (not summary token overlap).
 *
 * Epistemic: DISCOVERED ≠ VERIFIED ≠ CERTIFIED. This auditor never certifies.
 */

export type FormulaMechanic =
  | "FLAT_AMOUNT"
  | "BUILDER_BASKET"
  | "GREATER_OF_FLAT_OR_PCT_EBITDA"
  | "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS"
  | "LEVERAGE_RATIO_ROOM"
  | "OTHER";

export interface CandidateForAudit {
  sourceId: string;
  sectionRef: string;
  heading: string;
  formulaType: string;
  thresholdValue: number | null;
  params: Record<string, unknown> | null;
  posture: string;
  families: string[];
  excerptEvidence: string;
  issuerTicker?: string | null;
  documentClass?: string | null;
  documentTitle?: string | null;
}

export interface FieldVerdict {
  field: string;
  ok: boolean | null; // null = not evaluable / unlabeled
  detail: string;
}

export type AuditDisposition =
  | "REVIEW_READY_EXECUTABLE"
  | "REVIEW_READY_WITH_GAPS"
  | "FALSE_EXECUTABLE"
  | "REQUIRES_HUMAN_REVIEW"
  | "INSUFFICIENT_OPERATIVE_TEXT";

export interface IndependentAuditResult {
  sourceId: string;
  sectionRef: string;
  formulaType: string;
  mechanic: FormulaMechanic;
  disposition: AuditDisposition;
  sufficientForExecutableEvaluation: boolean;
  falseExecutableClassification: boolean;
  fields: FieldVerdict[];
  materialOmissions: string[];
  independentFormula: string | null;
  independentThresholdMillions: number | null;
  operativeWindowChars: number;
  operativeWindowPreview: string;
  certificationStatus: "NOT_CERTIFIED";
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTocLike(window: string): boolean {
  // Table-of-contents rows pack many "SECTION x.y Title …. 92" lines with page numbers.
  const sectionHits = (window.match(/\b(?:Section|SECTION|§)\s*\d/g) ?? []).length;
  const pageNumRows = (window.match(/\b\d{1,3}\s+(?:SECTION|Section|ARTICLE)\b/g) ?? []).length;
  const dollarHits = (window.match(/\$\s*[\d,]+/g) ?? []).length;
  if (dollarHits === 0 && sectionHits >= 4) return true;
  if (pageNumRows >= 2 && dollarHits === 0) return true;
  // Dense short lines of headings without operative verbs
  if (dollarHits === 0 && !/\b(?:shall not|may not|not to exceed|greater of|lesser of|Indebtedness|Liens)\b/i.test(window)) {
    if (sectionHits >= 3) return true;
  }
  return false;
}

function scoreOperativeWindow(window: string): number {
  let score = 0;
  if (/\$\s*[\d,]+/.test(window)) score += 5;
  if (/\bgreater of\b|\blesser of\b/i.test(window)) score += 4;
  if (/\b(?:shall not|may not|not to exceed|provided that)\b/i.test(window)) score += 3;
  if (/\b(?:Indebtedness|Liens|Restricted Payments|Investments)\b/i.test(window)) score += 2;
  if (isTocLike(window)) score -= 10;
  score += Math.min(3, Math.floor(window.length / 400));
  return score;
}

/** Slice a covenant window from a section heading start index. */
function windowFromStart(text: string, startIdx: number): string {
  const from = text.slice(startIdx, startIdx + 4500);
  // Skip past opening heading token, cut at next Section/ARTICLE heading.
  const afterHeading = from.search(/(?<=\n|\.\s)/);
  const scanFrom = afterHeading > 0 && afterHeading < 80 ? afterHeading : Math.min(24, from.length);
  const next = from.slice(scanFrom).search(/\b(?:Section|SECTION|ARTICLE)\s+\d+/i);
  if (next >= 0 && scanFrom + next >= 24) return from.slice(0, scanFrom + next);
  return from;
}

/**
 * Locate an operative window for a section ref inside full document text.
 * Prefers body covenants over TOC/index hits. Optional excerptHint anchors
 * into the document without trusting the candidate's formula classification.
 */
export function extractOperativeWindow(
  fullText: string,
  sectionRef: string,
  excerptHint?: string,
): string {
  const text = stripHtml(fullText);
  if (!text || text.length < 80) return "";

  // 1) Anchor via excerpt evidence when present (operative text location, not formula trust)
  if (excerptHint && excerptHint.trim().length >= 48) {
    const rawNeedle = excerptHint.trim().slice(0, 120);
    const variants = [
      rawNeedle,
      rawNeedle.replace(/\s+/g, " "),
      rawNeedle.slice(0, 64).replace(/\s+/g, " "),
    ];
    for (const needle of variants) {
      if (needle.length < 32) continue;
      const idx = text.indexOf(needle);
      if (idx < 0) {
        const collapsed = text.replace(/\s+/g, " ");
        const j = collapsed.indexOf(needle.replace(/\s+/g, " "));
        if (j >= 0) {
          const win = collapsed.slice(Math.max(0, j - 80), j + 2800);
          if (scoreOperativeWindow(win) >= 4) return win.slice(0, 4500);
        }
      } else {
        const win = text.slice(Math.max(0, idx - 80), idx + 2800);
        if (scoreOperativeWindow(win) >= 3) return win.slice(0, 4500);
      }
    }
  }

  const ref = sectionRef.trim().replace(/^§\s*/, "");
  if (!ref) return "";
  const baseRef = ref.replace(/\([^)]*\)\s*$/, "").trim();
  const startIdxs = new Set<number>();

  for (const tryRef of [...new Set([ref, baseRef])]) {
    if (!tryRef) continue;
    const escaped = tryRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Non-greedy start finders only — do not consume the body in the match.
    const patterns = [
      new RegExp(`(?:Section|SECTION|§)\\s*${escaped}\\b`, "gi"),
      new RegExp(`(?:^|\\s)(${escaped})\\s*[.(]`, "gi"),
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(text)) != null && guard < 16) {
        guard += 1;
        startIdxs.add(m.index + (m[0].startsWith(" ") || m[0].startsWith("\n") ? 1 : 0));
      }
    }
  }

  const candidates: string[] = [];
  for (const idx of startIdxs) {
    const body = windowFromStart(text, idx);
    if (body.length > 40) candidates.push(body);
  }

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => scoreOperativeWindow(b) - scoreOperativeWindow(a));
  const best = candidates[0]!;
  if (scoreOperativeWindow(best) < 2) return ""; // refuse TOC-only / empty hits
  return best;
}

function parseMoneyMillions(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?/i);
  if (!m) return null;
  let n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/billion/i.test(m[2] ?? "")) n *= 1000;
  else if (!m[2] && n >= 1_000_000) n = n / 1_000_000;
  else if (!m[2] && n > 10_000) n = n / 1_000_000;
  return n;
}

function parsePct(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]) / 100;
  return Number.isFinite(n) ? n : null;
}

/**
 * Independent formula classification from operative window only.
 * When preferThresholdMillions is set, prefer a money figure near that value
 * so multi-basket sections are scored against the claimed basket's dollars —
 * still derived from operative text, not from trusting formulaType.
 */
export function independentFormulaFromOperative(
  operative: string,
  preferThresholdMillions?: number | null,
): {
  formulaType: FormulaMechanic | null;
  thresholdMillions: number | null;
  pct: number | null;
  comparator: "GREATER_OF" | "LESSER_OF" | "FLAT" | "RATIO" | "BUILDER" | null;
} {
  const moneyMatches = [...operative.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?/gi)];
  const moneyAmounts: number[] = [];
  for (const m of moneyMatches) {
    let n = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (/billion/i.test(m[2] ?? "")) n *= 1000;
    else if (!m[2] && n >= 1_000_000) n = n / 1_000_000;
    else if (!m[2] && n > 10_000) n = n / 1_000_000;
    moneyAmounts.push(n);
  }

  let money: number | null = moneyAmounts[0] ?? null;
  let moneyIdx = 0;
  if (preferThresholdMillions != null && moneyAmounts.length) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < moneyAmounts.length; i++) {
      const d = Math.abs(moneyAmounts[i]! - preferThresholdMillions);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    // Only retarget when within 15% or $2M absolute — else first dollar stands
    if (bestD <= Math.max(2, preferThresholdMillions * 0.15)) {
      money = moneyAmounts[bestI]!;
      moneyIdx = bestI;
    }
  }

  // Local window around chosen money for greater/lesser/base classification
  let local = operative;
  if (moneyMatches[moneyIdx]) {
    const at = moneyMatches[moneyIdx]!.index ?? 0;
    local = operative.slice(Math.max(0, at - 220), Math.min(operative.length, at + 420));
  }

  const greater = /\bgreater of\b/i.test(local) || /\bgreater of\b/i.test(operative.slice(0, 800));
  const lesser = /\blesser of\b/i.test(local);
  const builder = /\bAvailable Amount\b|\bbuilder basket\b|\bCumulative Credit\b|\bBuilder Basket\b/i.test(
    operative,
  );
  const ebitda = /\bEBITDA\b/i.test(local) || /\bEBITDA\b/i.test(operative.slice(0, 1200));
  const assets =
    /\b(?:Consolidated\s+)?Total Assets\b/i.test(local) ||
    /\btotal consolidated assets\b/i.test(local) ||
    /\bConsolidated Total Tangible Assets\b/i.test(local) ||
    /\b(?:Consolidated\s+)?Total Assets\b/i.test(operative.slice(0, 1200));
  const ratio = /\b(?:Leverage|Coverage)\s+Ratio\b|\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.0+)?/i.test(local);
  const pct = parsePct(local) ?? parsePct(operative);

  if (lesser && money != null) {
    return { formulaType: null, thresholdMillions: money, pct, comparator: "LESSER_OF" };
  }
  if (greater && money != null && ebitda && pct != null && !assets) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdMillions: money,
      pct,
      comparator: "GREATER_OF",
    };
  }
  if (greater && money != null && assets && pct != null) {
    // Prefer assets when both words appear near grower; EBITDA-only growers handled above
    const assetsNear = /\b(?:Total Assets|total consolidated assets|Total Tangible Assets)\b/i.test(local);
    const ebitdaNear = /\bEBITDA\b/i.test(local);
    if (assetsNear && !ebitdaNear) {
      return {
        formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
        thresholdMillions: money,
        pct,
        comparator: "GREATER_OF",
      };
    }
    if (ebitdaNear && !assetsNear) {
      return {
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdMillions: money,
        pct,
        comparator: "GREATER_OF",
      };
    }
    if (assetsNear) {
      return {
        formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
        thresholdMillions: money,
        pct,
        comparator: "GREATER_OF",
      };
    }
    if (ebitda) {
      return {
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdMillions: money,
        pct,
        comparator: "GREATER_OF",
      };
    }
  }
  if (greater && money != null && ebitda && pct != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdMillions: money,
      pct,
      comparator: "GREATER_OF",
    };
  }
  if (builder && money != null) {
    return { formulaType: "BUILDER_BASKET", thresholdMillions: money, pct, comparator: "BUILDER" };
  }
  if (ratio && !greater && !builder) {
    return { formulaType: "LEVERAGE_RATIO_ROOM", thresholdMillions: money, pct, comparator: "RATIO" };
  }
  if (money != null) {
    return { formulaType: "FLAT_AMOUNT", thresholdMillions: money, pct, comparator: "FLAT" };
  }
  return { formulaType: null, thresholdMillions: null, pct: null, comparator: null };
}

function nearEqual(a: number, b: number, tol = 0.051): boolean {
  return Math.abs(a - b) <= tol || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= 0.02;
}

function mechanicOf(ft: string): FormulaMechanic {
  if (
    ft === "FLAT_AMOUNT" ||
    ft === "BUILDER_BASKET" ||
    ft === "GREATER_OF_FLAT_OR_PCT_EBITDA" ||
    ft === "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS" ||
    ft === "LEVERAGE_RATIO_ROOM"
  ) {
    return ft;
  }
  return "OTHER";
}

export function auditCandidateAgainstOperative(params: {
  candidate: CandidateForAudit;
  fullDocumentText: string;
}): IndependentAuditResult {
  const c = params.candidate;
  const operative = extractOperativeWindow(
    params.fullDocumentText,
    c.sectionRef,
    c.excerptEvidence,
  );
  const fields: FieldVerdict[] = [];
  const omissions: string[] = [];

  fields.push({
    field: "governing_section_locatable",
    ok: operative.length > 40,
    detail: operative.length > 40 ? `window ${operative.length} chars` : "section not found in source bytes",
  });

  if (operative.length <= 40) {
    return {
      sourceId: c.sourceId,
      sectionRef: c.sectionRef,
      formulaType: c.formulaType,
      mechanic: mechanicOf(c.formulaType),
      disposition: "INSUFFICIENT_OPERATIVE_TEXT",
      sufficientForExecutableEvaluation: false,
      falseExecutableClassification: true,
      fields,
      materialOmissions: ["operative_section_not_located_in_source_bytes"],
      independentFormula: null,
      independentThresholdMillions: null,
      operativeWindowChars: 0,
      operativeWindowPreview: "",
      certificationStatus: "NOT_CERTIFIED",
    };
  }

  const indep = independentFormulaFromOperative(operative, c.thresholdValue);

  // Formula precision
  const formulaOk =
    indep.comparator === "LESSER_OF"
      ? false // candidate claimed greater-of/flat while operative is lesser-of → fail
      : indep.formulaType != null && indep.formulaType === c.formulaType;
  fields.push({
    field: "formula",
    ok: indep.comparator === "LESSER_OF" ? false : formulaOk,
    detail: `candidate=${c.formulaType} independent=${indep.formulaType ?? "null"} comparator=${indep.comparator}`,
  });
  if (indep.comparator === "LESSER_OF") {
    omissions.push("incorrect_greater_of_vs_lesser_of");
  }

  // Threshold precision
  let thresholdOk: boolean | null = null;
  if (c.thresholdValue != null && indep.thresholdMillions != null) {
    thresholdOk = nearEqual(c.thresholdValue, indep.thresholdMillions);
  } else if (c.thresholdValue != null && indep.thresholdMillions == null) {
    thresholdOk = false;
  }
  fields.push({
    field: "threshold",
    ok: thresholdOk,
    detail: `candidate=${c.thresholdValue} independent=${indep.thresholdMillions}`,
  });

  // Pct param for growers
  const candPct =
    (c.params?.pctEbitda as number | undefined) ?? (c.params?.pctTotalAssets as number | undefined) ?? null;
  if (c.formulaType.startsWith("GREATER_OF") || c.formulaType === "BUILDER_BASKET") {
    const pctOk = candPct != null && indep.pct != null ? nearEqual(candPct, indep.pct, 0.005) : candPct == null && indep.pct == null;
    fields.push({
      field: "grower_pct",
      ok: pctOk,
      detail: `candidatePct=${candPct} independentPct=${indep.pct}`,
    });
  }

  // Conditions / exceptions / shared capacity / entity scope — presence checks in operative text
  const hasCondition = /\b(?:provided that|so long as|subject to|no Default|Event of Default)\b/i.test(operative);
  const summaryMissedCondition =
    hasCondition && !/\b(?:provided that|so long as|subject to|no Default)\b/i.test(c.excerptEvidence ?? "");
  fields.push({
    field: "conditions_present_in_operative",
    ok: true, // presence observation
    detail: hasCondition ? "condition/proviso language present" : "no obvious condition language in window",
  });
  if (summaryMissedCondition) {
    omissions.push("missed_condition_language");
    fields.push({ field: "condition_captured_in_candidate_evidence", ok: false, detail: "operative has conditions; candidate evidence lacks them" });
  } else {
    fields.push({ field: "condition_captured_in_candidate_evidence", ok: !hasCondition ? null : true, detail: hasCondition ? "evidenced" : "n/a" });
  }

  const hasException = /\b(?:except|Permitted (?:Indebtedness|Liens|Investments)|provided,? however)\b/i.test(operative);
  fields.push({
    field: "exceptions_present_in_operative",
    ok: true,
    detail: hasException ? "exception language present" : "no obvious exception language",
  });

  const hasShared = /\b(?:combined with|shared (?:capacity|basket)|together with\b[\s\S]{0,120}?\b(?:pursuant to|under)\s+(?:Section|clause)|without duplication|pursuant to clauses?\s*\()/i.test(
    operative,
  );
  fields.push({
    field: "shared_capacity_in_operative",
    ok: true,
    detail: hasShared ? "shared-capacity / multi-clause language present" : "no shared-capacity language in window",
  });
  if (hasShared && !/\b(?:combined with|shared|without duplication|pursuant to clauses?)\b/i.test(c.excerptEvidence ?? "")) {
    omissions.push("missed_shared_capacity_dependency");
    fields.push({ field: "shared_capacity_captured", ok: false, detail: "operative shared-cap missed in candidate evidence" });
  }

  const entityHit = /\b(?:Borrower|Loan Part(?:y|ies)|Restricted Subsidiar|Guarantor|Parent)\b/i.test(operative);
  fields.push({
    field: "entity_scope_language",
    ok: entityHit,
    detail: entityHit ? "entity nouns present" : "entity scope not explicit in window",
  });
  if (!entityHit) omissions.push("entity_scope_unresolved");

  const defHit = /\b(?:as defined|Available Amount|Consolidated EBITDA|Consolidated Total Assets)\b/i.test(operative);
  fields.push({
    field: "defined_term_dependencies",
    ok: defHit ? true : null,
    detail: defHit ? "definitional dependencies referenced" : "no clear defined-term hooks in window",
  });

  const needsFin =
    c.formulaType.includes("EBITDA") ||
    c.formulaType.includes("TOTAL_ASSETS") ||
    c.formulaType === "LEVERAGE_RATIO_ROOM" ||
    c.formulaType === "BUILDER_BASKET";
  fields.push({
    field: "required_financial_inputs",
    ok: true,
    detail: needsFin
      ? "requires approved financial snapshot (EBITDA/assets/leverage as applicable)"
      : "flat basket — threshold only (utilization still required for remaining capacity)",
  });
  fields.push({
    field: "historical_utilization_required",
    ok: true,
    detail: "remaining capacity requires ledger/utilization — not asserted by formula alone",
  });

  const materialFieldFails = fields.filter(
    (f) =>
      f.ok === false &&
      ["formula", "threshold", "grower_pct", "governing_section_locatable", "shared_capacity_captured", "condition_captured_in_candidate_evidence"].includes(
        f.field,
      ),
  );
  const formulaThresholdOk = formulaOk && thresholdOk === true;
  const falseExecutable = !formulaThresholdOk;
  const sufficient =
    formulaThresholdOk &&
    !omissions.includes("missed_shared_capacity_dependency") &&
    operative.length > 40;

  let disposition: AuditDisposition;
  if (falseExecutable) disposition = "FALSE_EXECUTABLE";
  else if (sufficient && omissions.length === 0) disposition = "REVIEW_READY_EXECUTABLE";
  else if (sufficient) disposition = "REVIEW_READY_WITH_GAPS";
  else disposition = "REQUIRES_HUMAN_REVIEW";

  return {
    sourceId: c.sourceId,
    sectionRef: c.sectionRef,
    formulaType: c.formulaType,
    mechanic: mechanicOf(c.formulaType),
    disposition,
    sufficientForExecutableEvaluation: sufficient,
    falseExecutableClassification: falseExecutable,
    fields,
    materialOmissions: omissions,
    independentFormula: indep.formulaType,
    independentThresholdMillions: indep.thresholdMillions,
    operativeWindowChars: operative.length,
    operativeWindowPreview: operative.slice(0, 320),
    certificationStatus: "NOT_CERTIFIED",
  };
}

/** Wilson score interval for a binomial proportion (approx 95%). */
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number; p: number } {
  if (n <= 0) return { low: 0, high: 0, p: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    p,
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  };
}
