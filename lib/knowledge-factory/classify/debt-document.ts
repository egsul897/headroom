/**
 * Deterministic first-pass debt-document classifier.
 * Preserves UNKNOWN when unsupported. Never promotes classification into
 * operative legal authority.
 */

import type { ClassificationResult, DebtDocumentClass } from "../types";

interface Rule {
  documentClass: DebtDocumentClass;
  weight: number;
  signal: string;
  test: (ctx: ClassifyContext) => boolean;
}

interface ClassifyContext {
  title: string;
  description: string;
  exhibitType: string;
  filename: string;
  headingSample: string;
  textSample: string;
}

const RULES: Rule[] = [
  {
    documentClass: "RESTATEMENT",
    weight: 0.95,
    signal: "amended_and_restated",
    test: (c) => /\bamended\s+and\s+restated\b/i.test(c.title + " " + c.description + " " + c.headingSample),
  },
  {
    documentClass: "SUPPLEMENTAL_INDENTURE",
    weight: 0.93,
    signal: "supplemental_indenture",
    test: (c) => /\bsupplemental\s+indenture\b/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "INDENTURE",
    weight: 0.9,
    signal: "indenture_title",
    test: (c) => /\bindenture\b/i.test(c.title + " " + c.description) && !/\bsupplemental\b/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "ABL_AGREEMENT",
    weight: 0.9,
    signal: "abl",
    test: (c) => /\b(?:ABL|asset[-\s]?based\s+(?:revolving\s+)?(?:credit|loan))\b/i.test(c.title + " " + c.description + " " + c.headingSample),
  },
  {
    documentClass: "REVOLVING_CREDIT_AGREEMENT",
    weight: 0.88,
    signal: "revolving_credit",
    test: (c) => /\brevolving\s+credit\s+agreement\b/i.test(c.title + " " + c.description + " " + c.headingSample),
  },
  {
    documentClass: "TERM_LOAN_AGREEMENT",
    weight: 0.88,
    signal: "term_loan",
    test: (c) => /\bterm\s+loan\s+(?:credit\s+)?(?:and\s+guarant(?:y|ee)\s+)?agreement\b/i.test(c.title + " " + c.description + " " + c.headingSample),
  },
  {
    documentClass: "CREDIT_AGREEMENT",
    weight: 0.85,
    signal: "credit_agreement",
    test: (c) => /\bcredit\s+agreement\b/i.test(c.title + " " + c.description + " " + c.headingSample),
  },
  {
    documentClass: "INTERCREDITOR_AGREEMENT",
    weight: 0.9,
    signal: "intercreditor",
    test: (c) => /\bintercreditor\b/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "SECURITY_AGREEMENT",
    weight: 0.85,
    signal: "security_agreement",
    test: (c) => /\b(?:security|collateral)\s+agreement\b/i.test(c.title + " " + c.description) && !/\bguarant/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "GUARANTEE_AGREEMENT",
    weight: 0.85,
    signal: "guarantee",
    test: (c) => /\bguarant(?:y|ee)(?:\s+and\s+collateral)?\s+agreement\b/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "WAIVER",
    weight: 0.8,
    signal: "waiver",
    test: (c) => /\bwaiver\b/i.test(c.title + " " + c.description) && !/\bcredit\s+agreement\b/i.test(c.title),
  },
  {
    documentClass: "CONSENT",
    weight: 0.78,
    signal: "consent",
    test: (c) => /\bconsent\b/i.test(c.title + " " + c.description) && !/\bcredit\s+agreement\b/i.test(c.title),
  },
  {
    documentClass: "SIDE_LETTER",
    weight: 0.85,
    signal: "side_letter",
    test: (c) => /\bside\s+letter\b/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "AMENDMENT",
    weight: 0.75,
    signal: "amendment",
    test: (c) => {
      const hay = `${c.title} ${c.description}`;
      if (!/\bamendment\b/i.test(hay)) return false;
      // Exclude common non-debt "amendment" false positives (corporate governance).
      if (/\b(?:tax\s+benefit|rights\s+plan|stockholder|shareholder|bylaw|certificate\s+of\s+incorporation|employment)\b/i.test(hay)) {
        return false;
      }
      // Numbered/omnibus amendments are debt-package amendments even when the
      // base instrument noun is omitted from the short exhibit title — but only
      // when debt/facility cues exist in title, description, or heading sample.
      const debtCue = /\b(?:credit|loan|facility|indenture|agreement|omnibus)\b/i.test(`${hay} ${c.headingSample}`);
      if (
        debtCue &&
        (/\b(?:omnibus\s+)?amendment\s+no\.?\s*\d+/i.test(hay) ||
          /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+(?:omnibus\s+)?amendment\b/i.test(hay))
      ) {
        return true;
      }
      return /\b(?:credit|loan|facility|indenture|agreement)\b/i.test(hay);
    },
  },
  {
    documentClass: "OTHER_DEBT_RELATED",
    weight: 0.55,
    signal: "debt_related_structural",
    test: (c) =>
      /\b(?:loan\s+agreement|facility\s+agreement|note\s+purchase|pledge\s+agreement|joinder)\b/i.test(c.title + " " + c.description) ||
      (/\bArticle\s+(?:VI|VII|6|7)\b/i.test(c.headingSample) && /\b(?:Indebtedness|Liens|Restricted Payments)\b/i.test(c.textSample)),
  },
];

export interface ClassifyDebtDocumentInput {
  title?: string;
  description?: string;
  exhibitType?: string;
  filename?: string;
  /** First ~4k chars of normalized text for heading/structural signals. */
  textSample?: string;
}

export function classifyDebtDocument(input: ClassifyDebtDocumentInput): ClassificationResult {
  const textSample = input.textSample ?? "";
  const headingSample = extractHeadingSample(textSample);
  const ctx: ClassifyContext = {
    title: input.title ?? "",
    description: input.description ?? "",
    exhibitType: input.exhibitType ?? "",
    filename: input.filename ?? "",
    headingSample,
    textSample: textSample.slice(0, 8000),
  };

  const combinedMeta = `${ctx.title} ${ctx.description} ${ctx.filename} ${ctx.exhibitType}`.trim();
  if (!combinedMeta && !textSample) {
    return {
      documentClass: "UNKNOWN",
      confidence: 0,
      signals: [],
      rationale: "No title, exhibit metadata, or text sample available — preserving UNKNOWN.",
    };
  }

  let best: { rule: Rule; score: number } | null = null;
  const fired: string[] = [];
  for (const rule of RULES) {
    if (rule.test(ctx)) {
      fired.push(rule.signal);
      // Title-level amendment/restatement/waiver signals outrank body-only
      // "credit agreement" mentions (amendment bodies quote the base agreement).
      let score = rule.weight;
      const titleHay = `${ctx.title} ${ctx.description}`;
      if (rule.documentClass === "AMENDMENT" && /\bamendment\b/i.test(titleHay)) score += 0.2;
      if (rule.documentClass === "RESTATEMENT" && /\bamended\s+and\s+restated\b/i.test(titleHay)) score += 0.15;
      if (
        (rule.documentClass === "CREDIT_AGREEMENT" ||
          rule.documentClass === "REVOLVING_CREDIT_AGREEMENT" ||
          rule.documentClass === "TERM_LOAN_AGREEMENT" ||
          rule.documentClass === "ABL_AGREEMENT") &&
        /\bamendment\b/i.test(titleHay) &&
        !/\bamended\s+and\s+restated\b/i.test(titleHay)
      ) {
        score -= 0.25;
      }
      if (!best || score > best.score) best = { rule, score };
    }
  }

  if (!best) {
    // Exhibit 10 alone is insufficient.
    if (/^EX-10/i.test(ctx.exhibitType)) {
      return {
        documentClass: "UNKNOWN",
        confidence: 0.2,
        signals: ["exhibit_10_without_debt_title"],
        rationale: "Material contract exhibit type without debt-document title signals — UNKNOWN (do not assume Exhibit 10 is a credit agreement).",
      };
    }
    return {
      documentClass: "UNKNOWN",
      confidence: 0,
      signals: fired,
      rationale: "No deterministic debt-document class supported by titles/metadata/headings.",
    };
  }

  return {
    documentClass: best.rule.documentClass,
    confidence: best.score,
    signals: fired,
    rationale: `Matched deterministic signal "${best.rule.signal}" (confidence ${best.score}). Classification is a discovery aid, not operative legal authority.`,
  };
}

function extractHeadingSample(text: string): string {
  const headings: string[] = [];
  const re = /\b(?:ARTICLE|Article|SECTION|Section)\s+[A-Z0-9.]+[^\n.]{0,80}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && headings.length < 40) {
    headings.push(m[0]!);
  }
  return headings.join(" | ");
}

/** Anti-overfitting: classification must not depend on company names or fixture IDs. */
export function stripIdentityTokens(text: string): string {
  return text
    .replace(/\b(?:CIK|cik)\s*:?\s*\d+\b/g, " ")
    .replace(/\b[A-Z]{1,5}\b(?=\s+(?:Inc|Corp|Corporation|LLC|Ltd)\b)/g, "ISSUER")
    .replace(/\b\d{10}-\d{2}-\d{6}\b/g, "ACCESSION");
}
