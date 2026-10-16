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
    test: (c) => {
      const hay = `${c.title} ${c.description} ${c.headingSample}`;
      if (/\b(?:employment|bylaws?|certificate of incorporation|stock|equity incentive)\b/i.test(hay)) return false;
      return /\bamended\s+and\s+restated\b/i.test(hay) && /\b(?:credit|loan|facility|indenture|agreement)\b/i.test(hay);
    },
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
    test: (c) =>
      /\bcredit\s+agreement\b/i.test(c.title + " " + c.description + " " + c.headingSample) ||
      /\b(?:senior\s+secured\s+)?credit\s+facility\b/i.test(c.title + " " + c.description),
  },
  {
    documentClass: "TERM_LOAN_AGREEMENT",
    weight: 0.86,
    signal: "term_facility",
    test: (c) =>
      /\bterm\s+(?:loan\s+)?facility\b/i.test(c.title + " " + c.description) &&
      !/\brevolving\b/i.test(c.title + " " + c.description),
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
    test: (c) => {
      const hay = `${c.title} ${c.description} ${c.exhibitType}`;
      if (/\b(?:independent\s+registered\s+public\s+accounting|EX-23|pwc consent)\b/i.test(hay)) return false;
      return /\bconsent\b/i.test(hay) && /\b(?:credit|loan|facility|indenture|lender|amendment)\b/i.test(hay);
    },
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
    weight: 0.62,
    signal: "senior_notes_indenture_package",
    test: (c) =>
      /\b(?:senior\s+(?:secured\s+|unsecured\s+)?notes|notes\s+due\s+\d{4}|bridge\s+(?:credit\s+)?facility|commitment\s+letter)\b/i.test(
        c.title + " " + c.description,
      ),
  },
  {
    documentClass: "OTHER_DEBT_RELATED",
    weight: 0.55,
    signal: "debt_related_structural",
    test: (c) =>
      /\b(?:loan\s+agreement|facility\s+agreement|note\s+purchase|pledge\s+agreement|joinder|loan\s+and\s+security)\b/i.test(
        c.title + " " + c.description,
      ) ||
      (/\bArticle\s+(?:VI|VII|6|7)\b/i.test(c.headingSample) &&
        /\b(?:Indebtedness|Liens|Restricted Payments)\b/i.test(c.textSample)),
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

/** Expand truncated EDGAR filenames into title-like tokens for classification. */
function expandFilenameSignals(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  const hints: string[] = [];
  if (/creditagre|credit_agreement|creditagreement/.test(base)) hints.push("credit agreement");
  if (/termloan|term_loan/.test(base)) hints.push("term loan agreement");
  if (/revolvingcredit|revolver/.test(base)) hints.push("revolving credit agreement");
  if (/indenture/.test(base) && !/supplemental/.test(base)) hints.push("indenture");
  if (/supplemental.*indenture|supplementalindenture/.test(base)) hints.push("supplemental indenture");
  // EDGAR filenames often truncate "bylaws" to "byla".
  if (/bylaws?|byla$|articlesofinc|certificateofincorp/.test(base)) {
    hints.push("bylaws");
    return hints.join(" ");
  }
  if (/a(?:nd)?rcredit|amendedandrestatedcredit/.test(base)) {
    hints.push("amended and restated credit agreement");
  } else if (/amendedandrestat|amended_and_restated/.test(base) && /credit|loan|facility|indenture/.test(base)) {
    hints.push("amended and restated credit agreement");
  } else if (/amendedandrestat|amended_and_restated/.test(base)) {
    // Truncated restatement filenames without an instrument noun stay ambiguous.
    hints.push("amended and restated agreement");
  }
  if (/amendmentno|amendment_no|omnibusamend/.test(base)) {
    hints.push(
      /credit|loan|facility|indenture|term/.test(base)
        ? "amendment no. 1 to credit agreement"
        : "amendment no. 1",
    );
  }
  if (/securityagre|collateralagre/.test(base)) hints.push("security agreement");
  if (/intercreditor/.test(base)) hints.push("intercreditor agreement");
  if (/guarant(?:y|ee)/.test(base) && /agreement|agre/.test(base)) hints.push("guarantee agreement");
  return hints.join(" ");
}

export function classifyDebtDocument(input: ClassifyDebtDocumentInput): ClassificationResult {
  const textSample = input.textSample ?? "";
  const headingSample = extractHeadingSample(textSample);
  const filenameExpanded = expandFilenameSignals(input.filename ?? "");
  const ctx: ClassifyContext = {
    title: `${input.title ?? ""} ${filenameExpanded}`.trim(),
    description: `${input.description ?? ""} ${filenameExpanded}`.trim(),
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

  // Corporate governance exhibits are not financing documents.
  if (/\b(?:bylaws?|articles of incorporation|certificate of incorporation)\b/i.test(combinedMeta + " " + filenameExpanded)) {
    if (!/\b(?:credit|loan|indenture|facility)\b/i.test(`${input.title ?? ""} ${input.description ?? ""}`)) {
      return {
        documentClass: "UNKNOWN",
        confidence: 0.9,
        signals: ["non_financing_governance_exhibit"],
        rationale: "Filename/title indicates corporate governance exhibit, not a financing instrument.",
      };
    }
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

  if (!best || best.rule.signal === "debt_related_structural") {
    // Body-structure fallback (general rule from precedent evidence: 28%
    // of the public corpus sat at UNKNOWN because titles were generic
    // exhibit labels). Title/metadata silence + a covenant-structured body
    // with unambiguous party roles classifies at capped confidence.
    // It also overrides the weak "debt_related_structural"
    // OTHER_DEBT_RELATED heuristic (weight 0.55): unambiguous party roles
    // + ≥2 covenant-family headings are stronger evidence than an
    // "Article VII + Indebtedness" heuristic. It never overrides a
    // specific title rule (e.g. a Senior Notes title stays
    // OTHER_DEBT_RELATED even with Issuer/Trustee body language).
    const bodyFallback = classifyFromBodyStructure(ctx);
    if (bodyFallback) return bodyFallback;
    if (best) {
      return {
        documentClass: best.rule.documentClass,
        confidence: best.score,
        signals: fired,
        rationale: `Matched deterministic signal "${best.rule.signal}" (confidence ${best.score}). Classification is a discovery aid, not operative legal authority.`,
      };
    }
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

/**
 * Body-structure fallback: classify from covenant structure + party roles
 * when title/metadata are silent. Requires ≥2 DISTINCT covenant-family
 * headings (a single heading is not enough structure) AND unambiguous
 * party roles: Issuer + Trustee = indenture; Borrower + (Lender |
 * Administrative Agent) = credit agreement. Both/neither role sets, or
 * fewer than 2 family headings, stay UNKNOWN (fail-closed). Confidence is
 * capped at 0.6 and the fallback is recorded in signals — a discovery
 * aid, not operative authority.
 */
const BODY_FAMILY_HEADINGS: Array<[string, RegExp]> = [
  ["INDEBTEDNESS", /\bLimitation on (?:Indebtedness|Debt)\b/i],
  ["LIENS", /\b(?:Limitation on Liens|Negative Pledge)\b/i],
  ["RESTRICTED_PAYMENTS", /\bLimitation on Restricted Payments\b/i],
  ["ASSET_SALES", /\bLimitation on (?:Asset Sales|Dispositions)\b/i],
  ["INVESTMENTS", /\bLimitation on Investments\b/i],
  ["AFFILIATE_TRANSACTIONS", /\bLimitation on Affiliate Transactions\b/i],
  ["EVENTS_OF_DEFAULT", /\bEvents of Default\b/i],
  ["FUNDAMENTAL_CHANGES", /\b(?:Merger|Consolidation|Fundamental Changes)\b/i],
  ["SALE_LEASEBACK", /\bLimitation on Sale[-\s]?Leaseback\b/i],
];

/**
 * Bare covenant headings ("Section 7.01 Indebtedness") carry no
 * "Limitation on" phrasing, so they count only when operative
 * prohibition language follows within 200 chars — a definitions entry
 * ("'Indebtedness' means ...") has no such language. The Section/Article
 * prefix keeps stray body mentions from counting as headings.
 */
const BARE_FAMILY_HEADINGS: Array<[string, RegExp]> = [
  ["INDEBTEDNESS", /(?:Section|§|Article)\s+[\dA-Z.]+\s+Indebtedness\b[\s\S]{0,200}\bshall\s+not\b/i],
  ["LIENS", /(?:Section|§|Article)\s+[\dA-Z.]+\s+Liens?\b[\s\S]{0,200}\bshall\s+not\b/i],
  [
    "RESTRICTED_PAYMENTS",
    /(?:Section|§|Article)\s+[\dA-Z.]+\s+Restricted Payments?\b[\s\S]{0,200}\bshall\s+not\b/i,
  ],
  [
    "ASSET_SALES",
    /(?:Section|§|Article)\s+[\dA-Z.]+\s+(?:Asset Sales|Dispositions)\b[\s\S]{0,200}\bshall\s+not\b/i,
  ],
  [
    "INVESTMENTS",
    /(?:Section|§|Article)\s+[\dA-Z.]+\s+Investments?\b[\s\S]{0,200}\bshall\s+not\b/i,
  ],
  [
    "AFFILIATE_TRANSACTIONS",
    /(?:Section|§|Article)\s+[\dA-Z.]+\s+Affiliate Transactions?\b[\s\S]{0,200}\bshall\s+not\b/i,
  ],
];

function classifyFromBodyStructure(ctx: ClassifyContext): ClassificationResult | null {
  const hay = `${ctx.headingSample}\n${ctx.textSample}`;
  const found = new Set(
    [...BODY_FAMILY_HEADINGS, ...BARE_FAMILY_HEADINGS]
      .filter(([, re]) => re.test(hay))
      .map(([name]) => name),
  );
  if (found.size < 2) return null;
  const indenture = /\bIssuer\b/i.test(hay) && /\bTrustee\b/i.test(hay);
  const credit =
    /\bBorrower\b/i.test(hay) &&
    (/\bLenders?\b/i.test(hay) || /\bAdministrative Agent\b/i.test(hay));
  if (indenture === credit) return null;
  const documentClass: DebtDocumentClass = indenture ? "INDENTURE" : "CREDIT_AGREEMENT";
  const roles = indenture ? "Issuer + Trustee" : "Borrower + Lender/Administrative Agent";
  return {
    documentClass,
    confidence: 0.6,
    signals: ["body_covenant_structure_fallback"],
    rationale: `Title/metadata silent; body carries ${found.size} distinct covenant-family headings with unambiguous ${roles} party roles. Capped confidence; classification is a discovery aid, not operative legal authority.`,
  };
}

function extractHeadingSample(text: string): string {  const headings: string[] = [];
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
