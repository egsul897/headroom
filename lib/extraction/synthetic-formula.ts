/**
 * Deterministic formula / dollar recognition for SyntheticExtractionProvider.
 * Company-agnostic regex over chunk text only — never invents baskets without
 * matching language in the source excerpt.
 */

export type RecognizedFormula =
  | {
      formulaType: "FLAT_AMOUNT";
      thresholdValue: number;
      params?: undefined;
      amountKind: "FIXED";
    }
  | {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA";
      thresholdValue: number;
      params: { pctEbitda: number };
      amountKind: "FIXED";
    }
  | {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS";
      thresholdValue: number;
      params: { pctTotalAssets: number };
      amountKind: "FIXED";
    };

const DOLLAR_RE = /\$([\d,]+(?:\.\d+)?)\s*(million|billion)?/i;

/**
 * Parses a dollar figure into the codebase's $-millions convention.
 * - "$50 million" → 50
 * - "$1 billion" → 1000
 * - "$786,000,000" (full-precision SEC style) → 786
 * Returns null when no figure is present (never fabricates).
 */
export function parseDollarAmount(text: string): number | null {
  const match = DOLLAR_RE.exec(text);
  if (!match?.[1]) return null;
  const raw = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(raw)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "billion") return raw * 1000;
  if (suffix === "million") return raw;
  // Full-precision absolute dollars (e.g. $786,000,000) → millions.
  if (raw >= 1_000_000) return raw / 1_000_000;
  // Small absolute figures without a suffix stay as-is (fixture "$50" rare; typical fixtures use "million").
  return raw;
}

const GROWER_EBITDA_RE =
  /greater\s+of\s+(?:\([ivx]+\)\s*)?\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?\s+and\s+(?:\([ivx]+\)\s*)?(\d+(?:\.\d+)?)\s*%\s+of\s+[^.]{0,120}?EBITDA/i;

const GROWER_ASSETS_RE =
  /greater\s+of\s+(?:\([ivx]+\)\s*)?\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?\s+and\s+(?:\([ivx]+\)\s*)?(\d+(?:\.\d+)?)\s*%\s+of\s+[^.]{0,120}?(?:total\s+)?(?:consolidated\s+)?(?:total\s+)?assets/i;

/**
 * Recognize flat vs greater-of grower formulas from authentic covenant prose.
 * Only emits grower types when both a dollar floor and a % of EBITDA/assets
 * limb are present in the text.
 */
export function recognizePermissionFormula(text: string): RecognizedFormula | null {
  const thresholdValue = parseDollarAmount(text);
  if (thresholdValue === null) return null;

  const ebitda = GROWER_EBITDA_RE.exec(text);
  if (ebitda?.[1]) {
    const pct = parseFloat(ebitda[1]);
    if (!Number.isNaN(pct) && pct > 0) {
      return {
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue,
        params: { pctEbitda: pct / 100 },
        amountKind: "FIXED",
      };
    }
  }

  const assets = GROWER_ASSETS_RE.exec(text);
  if (assets?.[1]) {
    const pct = parseFloat(assets[1]);
    if (!Number.isNaN(pct) && pct > 0) {
      return {
        formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
        thresholdValue,
        params: { pctTotalAssets: pct / 100 },
        amountKind: "FIXED",
      };
    }
  }

  return {
    formulaType: "FLAT_AMOUNT",
    thresholdValue,
    amountKind: "FIXED",
  };
}

/** Plural-aware Lien keyword; prefer LIEN when Liens and Indebtedness both appear. */
export function detectGrantType(text: string): "LIEN" | "DEBT_INCURRENCE" | null {
  const isLien = /\bliens?\b/i.test(text);
  const isIndebtedness = /\bindebtedness\b/i.test(text);
  if (!isLien && !isIndebtedness) return null;
  if (isLien) return "LIEN";
  return "DEBT_INCURRENCE";
}
