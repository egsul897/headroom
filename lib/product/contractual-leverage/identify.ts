/**
 * Identify operative EBITDA + debt-metric roles from contractual definition text.
 *
 * Pattern-based and issuer-agnostic. Refuses unrecognized shapes rather than guessing.
 * Surfaces unsupported cash-cap / pro-forma mechanics so callers cannot silently
 * treat a partial model as an authoritative contractual answer.
 */

import type { DebtMetricBasis, DefinitionText, IdentifiedLeverageComponents } from "./types";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function findByName(definitions: DefinitionText[], candidates: string[]): DefinitionText | null {
  for (const candidate of candidates) {
    const want = normalize(candidate);
    const hit = definitions.find((d) => normalize(d.termName) === want);
    if (hit) return hit;
  }
  for (const candidate of candidates) {
    const want = normalize(candidate);
    const hit = definitions.find((d) => normalize(d.termName).includes(want));
    if (hit) return hit;
  }
  return null;
}

function detectDebtBasis(text: string, hint: DebtMetricBasis | null | undefined): DebtMetricBasis | null {
  const t = normalize(text);
  const secured =
    /\b(senior\s+secured|secured\s+net\s+leverage|consolidated\s+senior\s+secured|indebtedness\s+that\s+is\s+secured|secured\s+by\s+a\s+lien)\b/.test(
      t,
    );
  const total =
    /\b(total\s+net\s+leverage|consolidated\s+total\s+(net\s+)?leverage|consolidated\s+total\s+(debt|indebtedness)|consolidated\s+total\s+debt)\b/.test(
      t,
    );
  if (secured && !total) return "secured";
  if (total && !secured) return "total";
  if (secured && total) {
    if (/\b(that\s+is\s+secured|secured\s+by\s+a\s+lien|senior\s+secured)\b/.test(t)) return "secured";
  }
  if (hint) return hint;
  return null;
}

function detectCashNetting(text: string): boolean {
  return /\bless\s+(unrestricted\s+)?cash\b|\bminus\s+(unrestricted\s+)?cash\b|\bnet\s+of\s+(unrestricted\s+)?cash\b/i.test(
    text,
  );
}

/** Capped / lesser-of cash netting — we do not execute these mechanics. */
export function detectUnsupportedCashCap(text: string): boolean {
  return (
    /\blesser\s+of\b[\s\S]{0,120}\bcash\b/i.test(text) ||
    /\bcash\b[\s\S]{0,80}\blesser\s+of\b/i.test(text) ||
    /\bnot\s+to\s+exceed\b[\s\S]{0,80}\bcash\b/i.test(text) ||
    /\bcash\b[\s\S]{0,60}\b(capped|cap\s+of|maximum\s+netting)\b/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*%\s+of\b[\s\S]{0,40}\b(total\s+assets|consolidated\s+total\s+assets)\b[\s\S]{0,40}\bcash\b/i.test(
      text,
    )
  );
}

export function detectUnresolvedProForma(text: string): boolean {
  return /\bpro\s*forma\b|\bmaterial\s+acquisition\b|\brun[- ]rate\b|\bsynerg(?:y|ies)\b/i.test(text);
}

function detectDebtMetricName(text: string, basis: DebtMetricBasis): string {
  const securedMatch = text.match(
    /\b(Consolidated\s+(?:Senior\s+)?Secured\s+(?:Net\s+)?(?:Debt|Indebtedness)|Consolidated\s+Total\s+Indebtedness\s+that\s+is\s+secured(?:\s+by\s+a\s+Lien)?)/i,
  );
  const totalMatch = text.match(/\b(Consolidated\s+Total\s+(?:Debt|Indebtedness)|Consolidated\s+Total\s+Net\s+Debt)/i);
  if (basis === "secured") return securedMatch?.[1] ?? "Secured Debt";
  return totalMatch?.[1] ?? "Total Debt";
}

function detectEbitdaReference(text: string): string | null {
  const m = text.match(/\b(Consolidated\s+EBITDA|Adjusted\s+EBITDA|EBITDA)\b/i);
  return m?.[1] ?? null;
}

export function identifyLeverageComponents(args: {
  definitions: DefinitionText[];
  leverageTermCandidates: string[];
  ebitdaTermCandidates?: string[];
  debtBasisHint?: DebtMetricBasis | null;
}): IdentifiedLeverageComponents | { error: "MISSING_DEFINITIONS" | "UNSUPPORTED_DEFINITION_SHAPE"; missing: string[]; limitations: string[] } {
  const leverageTerm = findByName(args.definitions, args.leverageTermCandidates);
  if (!leverageTerm) {
    return {
      error: "MISSING_DEFINITIONS",
      missing: [`Leverage-ratio definition (${args.leverageTermCandidates.join(" | ")})`],
      limitations: [],
    };
  }

  const ebitdaRef = detectEbitdaReference(leverageTerm.fullText);
  const ebitdaCandidates = args.ebitdaTermCandidates?.length
    ? args.ebitdaTermCandidates
    : ebitdaRef
      ? [ebitdaRef, "Consolidated EBITDA", "Adjusted EBITDA", "EBITDA"]
      : ["Consolidated EBITDA", "Adjusted EBITDA", "EBITDA"];
  const ebitdaTerm = findByName(args.definitions, ebitdaCandidates);
  if (!ebitdaTerm) {
    return {
      error: "MISSING_DEFINITIONS",
      missing: [`EBITDA definition (${ebitdaCandidates.join(" | ")})`],
      limitations: [],
    };
  }

  const debtBasis = detectDebtBasis(leverageTerm.fullText, args.debtBasisHint);
  if (!debtBasis) {
    return {
      error: "UNSUPPORTED_DEFINITION_SHAPE",
      missing: [],
      limitations: [
        `Could not determine whether "${leverageTerm.termName}" tests total or secured indebtedness from the definition text.`,
      ],
    };
  }

  if (!/\bratio\s+of\b/i.test(leverageTerm.fullText) && !/\bmeans,?\s+as\s+of\b/i.test(leverageTerm.fullText)) {
    return {
      error: "UNSUPPORTED_DEFINITION_SHAPE",
      missing: [],
      limitations: [`"${leverageTerm.termName}" does not match a supported leverage-ratio definition shape.`],
    };
  }

  if (!ebitdaRef && !/\bebitda\b/i.test(leverageTerm.fullText)) {
    return {
      error: "UNSUPPORTED_DEFINITION_SHAPE",
      missing: [],
      limitations: [`"${leverageTerm.termName}" does not reference EBITDA as the denominator.`],
    };
  }

  const netsCash = detectCashNetting(leverageTerm.fullText);
  const hasUnsupportedCashCap = detectUnsupportedCashCap(leverageTerm.fullText);
  const combinedText = `${leverageTerm.fullText}\n${ebitdaTerm.fullText}`;
  const hasUnresolvedProForma = detectUnresolvedProForma(combinedText);
  const debtMetricName = detectDebtMetricName(leverageTerm.fullText, debtBasis);
  const formulaDisplay = netsCash
    ? `(${debtMetricName} − unrestricted cash & Cash Equivalents) / ${ebitdaTerm.termName}`
    : `${debtMetricName} / ${ebitdaTerm.termName}`;

  const limitations: string[] = [];
  if (hasUnsupportedCashCap) {
    limitations.push(
      "Cash-netting cap / lesser-of mechanics appear in the definition and are not executed — result cannot be an authoritative contractual answer.",
    );
  }
  if (hasUnresolvedProForma) {
    limitations.push(
      "Pro forma / acquisition / run-rate adjustments are referenced but not bound as approved inputs — not applied; result is not authoritative contractual.",
    );
  }
  if (netsCash && !hasUnsupportedCashCap) {
    limitations.push("Cash netting uses unrestricted cash & Cash Equivalents as supplied; no cash-cap mechanics detected in definition text.");
  }

  return {
    leverageTerm,
    ebitdaTerm,
    debtBasis,
    debtMetricName,
    netsCash,
    hasUnsupportedCashCap,
    hasUnresolvedProForma,
    formulaDisplay,
    citations: [
      `${leverageTerm.sectionRef} — ${leverageTerm.termName}`,
      `${ebitdaTerm.sectionRef} — ${ebitdaTerm.termName}`,
    ],
    limitations,
  };
}

export const DEFAULT_TOTAL_LEVERAGE_TERMS = [
  "Total Net Leverage Ratio",
  "Consolidated Total Net Leverage Ratio",
  "Consolidated Total Leverage Ratio",
];

export const DEFAULT_SECURED_LEVERAGE_TERMS = [
  "Secured Net Leverage Ratio",
  "Consolidated Senior Secured Net Leverage Ratio",
  "Consolidated Senior Secured Leverage Ratio",
  "Senior Secured Net Leverage Ratio",
];
