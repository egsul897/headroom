/**
 * Activate source-backed v2 provision summaries into independently checkable
 * formula/threshold candidates — WITHOUT certification or Permission writes.
 *
 * Candidates are suitable for human/independent review when:
 * - Excerpt contains the claimed $ / % / ratio tokens
 * - Formula maps to an already-tested FormulaType
 * - Posture is a permission/exception (not bare prohibition noise)
 */

import type { CovenantSummaryItem } from "../../product/covenant-intelligence/summarize";
import { parseCounselFormulaForTest } from "../../product/customer-intelligence/compile-accepted";

export type ActivationReadiness =
  | "EXECUTABLE_FORMULA_CANDIDATE"
  | "NEEDS_DEFINITION_RESOLUTION"
  | "NEEDS_CROSS_REF_RESOLUTION"
  | "NEEDS_HUMAN_REVIEW"
  | "NOT_ACTIVATABLE";

export interface ActivatedProvisionCandidate {
  sourceId: string;
  sectionRef: string;
  heading: string;
  families: string[];
  posture: string;
  readiness: ActivationReadiness;
  formulaType: string | null;
  thresholdValue: number | null;
  params: Record<string, unknown> | null;
  excerptEvidence: string;
  independentChecks: Array<{ check: string; ok: boolean; detail: string }>;
  allChecksPassed: boolean;
  certificationStatus: "NOT_CERTIFIED";
  note: string;
}

function excerptHasMoney(excerpt: string, millions: number): boolean {
  // Accept raw dollars, $M labels, or millions notation approximating the parsed value.
  const raw = millions >= 1 && millions < 10_000 ? millions * 1_000_000 : millions;
  const asM = millions;
  const patterns = [
    new RegExp(`\\$${asM.toLocaleString("en-US").replace(/,/g, "[,]?")}`),
    new RegExp(`\\$${raw.toLocaleString("en-US").replace(/,/g, "[,]?")}`),
    new RegExp(`${asM}\\s*million`, "i"),
    new RegExp(`\\$${asM}\\b`),
  ];
  return patterns.some((re) => re.test(excerpt));
}

function excerptHasPct(excerpt: string, pct: number): boolean {
  const display = (pct * 100).toFixed(1).replace(/\.0$/, "");
  return new RegExp(`${display}\\s*%`).test(excerpt) || new RegExp(`${pct * 100}\\s*%`).test(excerpt);
}

export function activateSummaryItem(params: {
  sourceId: string;
  item: CovenantSummaryItem;
}): ActivatedProvisionCandidate {
  const item = params.item;
  const excerpt = [
    item.operativeLanguageExcerpt ?? "",
    ...(item.materialBasketsThresholds ?? []),
    ...(item.permissions ?? []),
  ].join("\n");

  const parsed = parseCounselFormulaForTest(item);
  const checks: ActivatedProvisionCandidate["independentChecks"] = [];

  const hasGreaterOf = /greater of/i.test(excerpt);
  const hasDollar = /\$\s*[\d,]+/.test(excerpt);
  const unresolvedDefs = (item.applicableDefinitions ?? []).filter((d) => d.resolved === false);

  if (parsed.modelingStatus === "KNOWN_NOT_MODELED" || !parsed.formulaType || parsed.thresholdValue == null) {
    let readiness: ActivationReadiness = "NOT_ACTIVATABLE";
    if (unresolvedDefs.length) readiness = "NEEDS_DEFINITION_RESOLUTION";
    else if ((item.crossReferences ?? []).length > 0 && !hasDollar) readiness = "NEEDS_CROSS_REF_RESOLUTION";
    else if (item.posture === "GENERAL_PROHIBITION" || item.posture === "UNRESOLVED") readiness = "NEEDS_HUMAN_REVIEW";
    return {
      sourceId: params.sourceId,
      sectionRef: item.sectionRef,
      heading: item.heading,
      families: item.families,
      posture: item.posture,
      readiness,
      formulaType: parsed.formulaType ?? null,
      thresholdValue: parsed.thresholdValue ?? null,
      params: null,
      excerptEvidence: (item.operativeLanguageExcerpt ?? "").slice(0, 400),
      independentChecks: [
        {
          check: "parseable_tested_formula",
          ok: false,
          detail: parsed.missingFields.join(", ") || "no modeled formula",
        },
      ],
      allChecksPassed: false,
      certificationStatus: "NOT_CERTIFIED",
      note: "Not activated — insufficient source-backed formula/threshold evidence.",
    };
  }

  checks.push({
    check: "parseable_tested_formula",
    ok: true,
    detail: `${parsed.formulaType} threshold=${parsed.thresholdValue}`,
  });

  const moneyOk = excerptHasMoney(excerpt, parsed.thresholdValue);
  checks.push({
    check: "threshold_tokens_in_excerpt",
    ok: moneyOk,
    detail: moneyOk ? "dollar/million tokens found in excerpt" : "parsed threshold not evidenced in excerpt",
  });

  const pct = (parsed.params as { pctEbitda?: number; pctTotalAssets?: number } | undefined)?.pctEbitda
    ?? (parsed.params as { pctTotalAssets?: number } | undefined)?.pctTotalAssets;
  if (pct != null) {
    const pctOk = excerptHasPct(excerpt, pct);
    checks.push({
      check: "pct_tokens_in_excerpt",
      ok: pctOk,
      detail: pctOk ? `${pct * 100}% evidenced` : "parsed pct not evidenced in excerpt",
    });
  }

  if (parsed.formulaType.startsWith("GREATER_OF")) {
    checks.push({
      check: "greater_of_language",
      ok: hasGreaterOf,
      detail: hasGreaterOf ? "greater-of language present" : "missing greater-of language",
    });
  }

  checks.push({
    check: "no_unresolved_blocking_defs",
    ok: unresolvedDefs.length === 0,
    detail: unresolvedDefs.length ? `unresolved: ${unresolvedDefs.map((d) => d.term).join(", ")}` : "ok",
  });

  const allOk = checks.every((c) => c.ok);
  return {
    sourceId: params.sourceId,
    sectionRef: item.sectionRef,
    heading: item.heading,
    families: item.families,
    posture: item.posture,
    readiness: allOk
      ? "EXECUTABLE_FORMULA_CANDIDATE"
      : unresolvedDefs.length
        ? "NEEDS_DEFINITION_RESOLUTION"
        : "NEEDS_HUMAN_REVIEW",
    formulaType: parsed.formulaType,
    thresholdValue: parsed.thresholdValue,
    params: (parsed.params as Record<string, unknown>) ?? null,
    excerptEvidence: (item.operativeLanguageExcerpt ?? "").slice(0, 400),
    independentChecks: checks,
    allChecksPassed: allOk,
    certificationStatus: "NOT_CERTIFIED",
    note: allOk
      ? "Source-backed formula candidate — independently checked against excerpt tokens; NOT certified; NOT written to Permission."
      : "Partial activation — failed independent checks; held for review.",
  };
}
