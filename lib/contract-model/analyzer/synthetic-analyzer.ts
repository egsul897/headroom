/**
 * Deterministic, regex-based ContractAnalyzerProvider for Phase C0. Same
 * role as lib/extraction/synthetic-provider.ts plays for the old pipeline:
 * zero network calls, so tests/contract-model/analyzer-unseen-package.test.ts
 * can exercise the analyzer's WIRING (schema validation, section-reference
 * extraction, downstream evaluator/coverage code) in this sandbox, which has
 * no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY.
 *
 * This is NOT presented as a competitive baseline against a real LLM - it
 * only recognizes ONE surface pattern ("the greater of a fixed dollar amount
 * and a percentage of a named defined term," and a bare ratio-test sentence)
 * and cannot extract defined terms, conditions, entity scope, exceptions, or
 * relationships at all. Its low, honestly-reported recall against the human
 * ground truth (see docs/phase-c0-validation-spike.md) is itself evidence
 * for the report: pattern-matching alone is not a viable substitute for a
 * real LLM on this class of document, which is exactly why Phase B/C route
 * production extraction through Vercel AI Gateway / Claude in the first
 * place.
 */
import type { CandidateContractRule } from "../types";
import type { ContractAnalysisResult, ContractAnalyzerInput } from "./schema";
import type { ContractAnalyzerProvider } from "./provider";
import { findRatioTokens } from "../covenant-computation/covenant-levels";

const GROWER_BASKET_RE = /the greater of \$?([\d,]+(?:\.\d+)?)\s*(?:million|,000,000)?\s*and\s+(\d+(?:\.\d+)?)%\s+of\s+([A-Za-z][A-Za-z ’']*(?:EBITDA|EBITDAR|Net Income|Adjusted[A-Za-z ]*)?)/gi;
/**
 * The ratio-test FRAME this analyzer recognizes (unchanged), but the
 * level itself is read by the unified covenant-level tokenizer
 * (findRatioTokens): the old pattern only accepted "N.NN:1.00" and
 * silently missed "4.5:1", "4.50 to 1" and non-1 denominators.
 */
const RATIO_TEST_FRAME_RE = /shall not permit[^.]*?\bto (?:be greater than|exceed|be less than)\b/gi;
const SECTION_MARKER_RE = /Section (6\.\d{2})(?:\(([a-z])\))?/g;

function nearestPrecedingSection(text: string, index: number): string | null {
  let last: string | null = null;
  SECTION_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SECTION_MARKER_RE.exec(text)) !== null) {
    if (m.index > index) break;
    last = m[2] ? `${m[1]}(${m[2]})` : (m[1] ?? last);
  }
  return last;
}

function parseDollarAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Generic section-number -> CovenantFamily mapping, per this agreement's own article structure (not tuned to any one basket's dollar figures). */
const SECTION_TO_FAMILY: Record<string, string> = {
  "6.01": "INDEBTEDNESS",
  "6.02": "LIENS",
  "6.03": "AFFILIATE_TRANSACTIONS",
  "6.04": "RESTRICTED_PAYMENTS",
  "6.05": "INVESTMENTS",
  "6.06": "INVESTMENTS",
  "6.07": "FUNDAMENTAL_CHANGES",
  "6.08": "ASSET_SALES",
  "6.09": "AFFILIATE_TRANSACTIONS",
  "6.10": "FINANCIAL_COVENANTS",
};

function familyForSection(sourceSectionRef: string): string {
  const m = sourceSectionRef.match(/^(6\.\d{2})/);
  const key = m?.[1];
  return (key && SECTION_TO_FAMILY[key]) || "DEFINITIONS_CALCULATION_RULES";
}

export class SyntheticContractAnalyzer implements ContractAnalyzerProvider {
  async analyze(input: ContractAnalyzerInput): Promise<ContractAnalysisResult> {
    const rules: CandidateContractRule[] = [];
    const text = input.documentText;

    GROWER_BASKET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = GROWER_BASKET_RE.exec(text)) !== null) {
      n += 1;
      const sourceSectionRef = nearestPrecedingSection(text, m.index) ?? `unknown-${n}`;
      rules.push({
        covenantFamily: familyForSection(sourceSectionRef),
        ruleType: "CALCULATION_RULE",
        evaluationClass: "EXECUTABLE",
        action: "OTHER",
        entityScope: [],
        entityScopeExcluded: [],
        thresholdValue: parseDollarAmount(m[1] ?? "0"),
        thresholdUnit: "USD",
        formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        conditions: [],
        exceptions: [],
        sourceSectionRef,
        definedTermRefs: [(m[3] ?? "").trim()],
        notes: `synthetic pattern match: greater of $${m[1]} and ${m[2]}% of ${(m[3] ?? "").trim()}`,
      });
    }

    RATIO_TEST_FRAME_RE.lastIndex = 0;
    n = 0;
    while ((m = RATIO_TEST_FRAME_RE.exec(text)) !== null) {
      // The level is the first explicit (non-bare) ratio token after the
      // frame comparator, inside the same sentence — the frame regex
      // itself never crosses a period, and neither may the token search.
      const rest = text.slice(m.index, m.index + 600);
      const sentenceEnd = rest.search(/\.\s+[A-Z“"(]/);
      const window = sentenceEnd >= 0 ? rest.slice(0, sentenceEnd + 1) : rest;
      const token = findRatioTokens(window).find((t) => !t.bare);
      if (!token) continue;
      n += 1;
      const sourceSectionRef = nearestPrecedingSection(text, m.index) ?? `unknown-ratio-${n}`;
      rules.push({
        covenantFamily: "FINANCIAL_COVENANTS",
        ruleType: "RATIO_TEST",
        evaluationClass: "EXECUTABLE",
        action: "SATISFY_RATIO",
        entityScope: [],
        entityScopeExcluded: [],
        thresholdValue: token.numericValue,
        thresholdUnit: "RATIO",
        conditions: [],
        exceptions: [],
        sourceSectionRef,
        definedTermRefs: [],
        notes: "synthetic pattern match: bare ratio-test sentence",
      });
    }

    return { definedTerms: [], rules, references: [], relationships: [] };
  }
}
