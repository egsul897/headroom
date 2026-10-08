import { createHash } from "node:crypto";
import {
  DETERMINISTIC_EXTRACTION_VERSION,
  type DeterministicExtractionResult,
  type DeterministicFact,
  type FactKind,
  type SemanticHypothesis,
  type SourceSpan,
} from "./types";

export interface DeterministicExtractionInput {
  text: string;
  documentId?: string | null;
  candidateRef?: string | null;
  citation?: string | null;
  /** Optional discovery family labels already assigned deterministically upstream. */
  knownFamilies?: string[];
  /** Optional amendment edge labels (from package-graph / amendment operative state). */
  amendmentRelationships?: { from: string; to: string; kind: string }[];
  /** Optional defined-term names from the structural index. */
  knownDefinitions?: string[];
}

const FAMILY_PATTERNS: { family: string; re: RegExp }[] = [
  { family: "INDEBTEDNESS", re: /\b(?:Indebtedness|incur\s+any\s+Indebtedness)\b/gi },
  { family: "LIENS", re: /\b(?:Liens?|encumber)\b/gi },
  { family: "INVESTMENTS", re: /\bInvestments?\b/gi },
  { family: "RESTRICTED_PAYMENTS", re: /\bRestricted\s+Payments?\b/gi },
  { family: "ASSET_SALES", re: /\b(?:Asset\s+Sale|Dispose\s+of)\b/gi },
  { family: "AFFILIATE_TRANSACTIONS", re: /\bAffiliate\s+Transactions?\b/gi },
  { family: "FINANCIAL_COVENANTS", re: /\b(?:Financial\s+Covenant|Leverage\s+Ratio|Interest\s+Coverage)\b/gi },
  { family: "CHANGE_OF_CONTROL", re: /\bChange\s+of\s+Control\b/gi },
];

const CROSS_REF_RE = /\b(?:Section|§)\s*(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)/gi;
const EXCEPTION_RE = /\b(?:except\s+(?:that|for|as)|provided\s+that|provided,?\s+however|notwithstanding)\b/gi;
const PROVISO_RE = /\bprovided\s+that\b/gi;
const THRESHOLD_RE = /(?:\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?)|(?:\b\d+(?:\.\d+)?\s*%)|(?:\b\d+(?:\.\d+)?\s*to\s*1(?:\.0+)?\b)/gi;
const RATIO_RE = /\b(?:Consolidated\s+)?(?:Total\s+|Secured\s+|First\s+Lien\s+)?(?:Net\s+)?Leverage\s+Ratio\b|\bInterest\s+Coverage\s+Ratio\b|\bFixed\s+Charge\s+Coverage\s+Ratio\b/gi;
const ENTITY_RE = /\b(?:the\s+Borrower|the\s+Company|Restricted\s+Subsidiaries|Loan\s+Parties|Guarantors)\b/gi;
const SHARED_CAP_RE = /\b(?:shared\s+(?:basket|cap|capacity)|in\s+the\s+aggregate(?:\s+together\s+with)?|Combined\s+Cap)\b/gi;
const DEFINITION_RE = /[“"]([A-Z][^”"]{1,80})[”"]\s+means\b/g;

function factId(kind: FactKind, excerpt: string, idx: number): string {
  return createHash("sha256").update(`${kind}|${excerpt}|${idx}`).digest("hex").slice(0, 16);
}

function span(input: DeterministicExtractionInput, excerpt: string, start: number): SourceSpan {
  return {
    documentId: input.documentId ?? null,
    startOffset: start,
    endOffset: start + excerpt.length,
    citation: input.citation ?? null,
    excerpt: excerpt.slice(0, 240),
  };
}

function pushFact(
  facts: DeterministicFact[],
  input: DeterministicExtractionInput,
  kind: FactKind,
  value: Record<string, unknown>,
  excerpt: string,
  start: number,
  confidence: DeterministicFact["confidence"] = "MEDIUM"
): void {
  facts.push({
    factId: factId(kind, excerpt, facts.length),
    kind,
    value,
    confidence,
    source: span(input, excerpt, start),
    doesNotImplyPermission: true,
    doesNotImplyOperativeAuthority: true,
  });
}

/**
 * Deterministic extraction over a text window (and optional upstream signals).
 * Never emits a permission verdict. Thresholds are facts only.
 */
export function extractDeterministicCovenantFacts(input: DeterministicExtractionInput): DeterministicExtractionResult {
  const text = input.text ?? "";
  const facts: DeterministicFact[] = [];
  const hypotheses: SemanticHypothesis[] = [];

  for (const fam of input.knownFamilies ?? []) {
    pushFact(facts, input, "COVENANT_FAMILY_SIGNAL", { family: fam, origin: "UPSTREAM" }, fam, 0, "HIGH");
  }
  for (const pat of FAMILY_PATTERNS) {
    pat.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.re.exec(text)) !== null) {
      pushFact(facts, input, "COVENANT_FAMILY_SIGNAL", { family: pat.family, matchedText: m[0] }, m[0], m.index, "MEDIUM");
    }
  }

  for (const term of input.knownDefinitions ?? []) {
    pushFact(facts, input, "DEFINITION", { termName: term, origin: "STRUCTURAL_INDEX" }, term, 0, "HIGH");
  }
  DEFINITION_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = DEFINITION_RE.exec(text)) !== null) {
      pushFact(facts, input, "DEFINITION", { termName: m[1], origin: "INLINE_MEANS" }, m[0], m.index, "HIGH");
    }
  }

  CROSS_REF_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = CROSS_REF_RE.exec(text)) !== null) {
      pushFact(facts, input, "CROSS_REFERENCE", { sectionRef: m[1], matchedText: m[0] }, m[0], m.index, "HIGH");
    }
  }

  EXCEPTION_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = EXCEPTION_RE.exec(text)) !== null) {
      pushFact(facts, input, "EXCEPTION_MARKER", { marker: m[0] }, m[0], m.index, "MEDIUM");
    }
  }

  PROVISO_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = PROVISO_RE.exec(text)) !== null) {
      pushFact(facts, input, "PROVISO_MARKER", { marker: m[0] }, m[0], m.index, "MEDIUM");
    }
  }

  THRESHOLD_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = THRESHOLD_RE.exec(text)) !== null) {
      pushFact(
        facts,
        input,
        "NUMERICAL_THRESHOLD",
        {
          raw: m[0],
          // SAFETY: numerical threshold ≠ permission.
          interpretation: "THRESHOLD_FACT_ONLY",
        },
        m[0],
        m.index,
        "HIGH"
      );
    }
  }

  RATIO_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = RATIO_RE.exec(text)) !== null) {
      pushFact(facts, input, "FINANCIAL_RATIO", { ratioName: m[0] }, m[0], m.index, "HIGH");
    }
  }

  ENTITY_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = ENTITY_RE.exec(text)) !== null) {
      pushFact(facts, input, "ENTITY_SCOPE_SIGNAL", { entityPhrase: m[0] }, m[0], m.index, "MEDIUM");
    }
  }

  SHARED_CAP_RE.lastIndex = 0;
  {
    let m: RegExpExecArray | null;
    while ((m = SHARED_CAP_RE.exec(text)) !== null) {
      pushFact(facts, input, "SHARED_CAPACITY_SIGNAL", { phrase: m[0] }, m[0], m.index, "MEDIUM");
    }
  }

  for (const edge of input.amendmentRelationships ?? []) {
    pushFact(
      facts,
      input,
      "AMENDMENT_RELATIONSHIP",
      { from: edge.from, to: edge.to, kind: edge.kind },
      `${edge.kind}:${edge.from}->${edge.to}`,
      0,
      "HIGH"
    );
  }

  // Explicit unresolved semantic hypotheses — never auto-promoted to facts.
  const thresholdFacts = facts.filter((f) => f.kind === "NUMERICAL_THRESHOLD");
  if (thresholdFacts.length > 0) {
    hypotheses.push({
      hypothesisId: factId("NUMERICAL_THRESHOLD", "perm-guess", 0),
      kind: "PERMISSION_GUESS",
      claim: "A numerical threshold was observed; permission/prohibition remains unresolved pending semantic compilation and verification.",
      status: "UNRESOLVED",
      requiresVerification: true,
      relatedFactIds: thresholdFacts.map((f) => f.factId),
      source: thresholdFacts[0]?.source ?? null,
    });
  }
  if (facts.some((f) => f.kind === "COVENANT_FAMILY_SIGNAL")) {
    // Family/signal recognition alone is SEMANTIC uncertainty — not amendment-chain
    // precedence. Genuine amendment-authority issues require amendment-operation
    // evidence (see AMENDMENT_OPERATION_SIGNAL below) or the amendment pipeline.
    hypotheses.push({
      hypothesisId: factId("COVENANT_FAMILY_SIGNAL", "auth-guess", 1),
      kind: "OPERATIVE_AUTHORITY_GUESS",
      claim:
        "Covenant-family/signal recognition is not a verified operative prohibition or permission; semantic compilation and independent verification are required.",
      status: "UNRESOLVED",
      requiresVerification: true,
      relatedFactIds: facts.filter((f) => f.kind === "COVENANT_FAMILY_SIGNAL").map((f) => f.factId),
      source: null,
    });
  }

  const amendmentOpFacts = facts.filter((f) => f.kind === "AMENDMENT_RELATIONSHIP");
  if (amendmentOpFacts.length > 0) {
    hypotheses.push({
      hypothesisId: factId("AMENDMENT_RELATIONSHIP", "amend-auth", 2),
      kind: "AMENDMENT_AUTHORITY_GUESS",
      claim:
        "Amendment relationship evidence was observed; operative precedence, effective date, and parent-agreement identity remain unresolved pending the amendment pipeline and independent verification.",
      status: "UNRESOLVED",
      requiresVerification: true,
      relatedFactIds: amendmentOpFacts.map((f) => f.factId),
      source: amendmentOpFacts[0]?.source ?? null,
    });
  }

  const ofKind = (k: FactKind) => facts.filter((f) => f.kind === k).map((f) => String(f.value.family ?? f.value.termName ?? f.value.sectionRef ?? f.value.raw ?? f.value.ratioName ?? f.value.entityPhrase ?? f.value.phrase ?? f.value.marker ?? f.factId));

  return {
    version: DETERMINISTIC_EXTRACTION_VERSION,
    documentId: input.documentId ?? null,
    candidateRef: input.candidateRef ?? null,
    facts,
    hypotheses,
    inventory: {
      covenantFamilySignals: [...new Set(ofKind("COVENANT_FAMILY_SIGNAL"))],
      definitions: [...new Set(ofKind("DEFINITION"))],
      crossReferences: [...new Set(ofKind("CROSS_REFERENCE"))],
      exceptions: [...new Set(ofKind("EXCEPTION_MARKER"))],
      provisos: [...new Set(ofKind("PROVISO_MARKER"))],
      numericalThresholds: [...new Set(ofKind("NUMERICAL_THRESHOLD"))],
      financialRatios: [...new Set(ofKind("FINANCIAL_RATIO"))],
      entityScopeSignals: [...new Set(ofKind("ENTITY_SCOPE_SIGNAL"))],
      sharedCapacitySignals: [...new Set(ofKind("SHARED_CAPACITY_SIGNAL"))],
    },
  };
}
