/**
 * Phase D — adversarial structural hardening suite (Headroom Structural
 * Intelligence Hardening Initiative).
 *
 * Every test parses a SYNTHETIC document through the real production
 * parser (`parseDocumentStructureWithTriage`) and asserts parentage
 * (`parentNodeId`) plus validator outcomes — never node counts, which
 * would be brittle to unrelated parser improvements. Parentage tests
 * assert the CORRECTED behavior (containment + ref-consistency), so each
 * one FAILS on the pre-fix behavior (nearest-preceding-article / rank
 * stack), which would e.g. parent a cross-article clause to the previous
 * article, merge two instruments' same-labelled sections, or re-parent
 * a section to a TOC entry.
 *
 * Two environment notes:
 * - The local Prisma client is stale (missing `.prisma/client/default`),
 *   and the parser chain reaches `lib/prisma` via hashing ->
 *   connectors/dedup. The parser path only needs `@prisma/client` enum
 *   *names*, so both modules are stubbed. On CI (real Prisma) the stubs
 *   are harmless: `vi.mock` replaces the modules for this file only.
 * - TOC entries are STILL emitted as SECTION nodes by the parser (D13,
 *   deliberately deferred: CONMED certification blesses TOC-as-node).
 *   The TOC test below therefore does NOT assert "no TOC node"; it
 *   asserts the body clause parents to the BODY section, never to a
 *   TOC node.
 */
import { describe, expect, it, vi } from "vitest";

const PRISMA_EXPORTS = [
  "PrismaClient", "Prisma", "Decimal",
  "OnboardingStatus", "CompanyTenantKind", "UserRole", "DocumentType", "FormulaType", "LedgerBasket", "LedgerDirection", "LedgerEntryStatus", "FeedQueueKind", "FeedQueueStatus", "DefinedTermStatus", "GoldenQueryType", "GoldenTestStatus", "GrantType", "AmountKind", "ModelingStatus", "MeasurementBasis", "StackingRelationshipType", "AggregationRule", "PriorityTier", "EntityClassTag", "RuleActivationEffect", "StatePredicateKind", "ExternalInputKind", "LegalReviewStatus", "ReviewedArtifactType", "PeriodType", "FacilityType", "CouponType", "DebtEventType", "ExtractionStageKind", "ExtractionStageStatus", "ExtractionCandidateKind", "ExtractionCandidateReviewStatus", "CandidateReviewAction", "ConnectorType", "ConnectionStatus", "SourceArtifactType", "IngestionJobKind", "IngestionStageKind", "IngestionStageStatus", "CovenantFamily", "ContractRuleType", "RuleEvaluationClass", "ContractRulePosture", "DocumentNodeType", "DocumentRelationshipType", "AmendmentEffectType", "DefinitionDependencyType", "ContractReferenceType", "ContractReferenceTargetType", "ContractRuleRelationshipType", "ContractConditionType", "InputRequirementState", "ObligationSatisfactionState", "ContractCoverageStatus", "UnresolvedContractItemType", "ContractCompilerStageKind", "ContractCompilerStageStatus", "ClaimReviewStatus", "ClaimReviewReasonCode", "ClaimReviewPipelineStage", "ClaimReviewDecisionAction", "AnalysisRunStatus", "SemanticTruthKind", "SemanticTruthTrustStatus", "KnowledgeRepresentationLevel", "KnowledgeDebtDocumentClass", "KnowledgeExtractionStatus", "KnowledgeUsageRightsStatus", "KnowledgeRelationshipKind", "KnowledgeRelationshipEvidenceStatus", "LearningKnowledgeState", "LearningCohort",
];
vi.mock("@prisma/client", () => {
  const store = new Map<string, unknown>();
  const dummy = new Proxy(
    {},
    {
      ownKeys() { return [...PRISMA_EXPORTS, "__esModule"]; },
      getOwnPropertyDescriptor(_t, prop) {
        if (typeof prop === "string" && (PRISMA_EXPORTS.includes(prop) || prop === "__esModule")) {
          return { enumerable: true, configurable: true };
        }
        return undefined;
      },
      get(_t, prop) {
        if (prop === "__esModule") return true;
        if (prop === "Prisma") return { Decimal: class Decimal { constructor(public v: unknown) {} valueOf() { return Number(this.v); } } };
        if (prop === "PrismaClient") return class PrismaClient {};
        if (prop === "Decimal") return class Decimal { constructor(public v: unknown) {} valueOf() { return Number(this.v); } };
        if (typeof prop === "string" && PRISMA_EXPORTS.includes(prop)) {
          if (!store.has(prop)) store.set(prop, new Proxy({}, { get(_tt, k) { return `${prop}.${String(k)}`; } }));
          return store.get(prop);
        }
        return undefined;
      },
    },
  );
  return dummy;
});
vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import { parseDocumentStructureWithTriage } from "../../lib/contract-model/compiler/stage-structure";
import {
  isRefDescendant,
  validateStructuralIntegrity,
} from "../../lib/contract-model/compiler/structural-integrity";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";

const DOC = "doc";

function parse(text: string, documentId = DOC) {
  return parseDocumentStructureWithTriage({ documentId, label: documentId, text });
}

function nodesOfType(nodes: StructuralNode[], nodeType: StructuralNode["nodeType"]) {
  return nodes.filter((n) => n.nodeType === nodeType);
}

/** All nodes with a given (type, ref), in document order. */
function findAll(nodes: StructuralNode[], nodeType: StructuralNode["nodeType"], sectionRef: string) {
  return nodes.filter((n) => n.nodeType === nodeType && n.sectionRef === sectionRef);
}

function findOne(nodes: StructuralNode[], nodeType: StructuralNode["nodeType"], sectionRef: string) {
  const found = findAll(nodes, nodeType, sectionRef);
  expect(found, `expected exactly one ${nodeType} ${sectionRef}, got ${found.length}`).toHaveLength(1);
  return found[0]!;
}

function parentOf(nodes: StructuralNode[], child: StructuralNode): StructuralNode | null {
  if (child.parentNodeId === null) return null;
  const parent = nodes.find((n) => n.nodeId === child.parentNodeId);
  expect(parent, `parentNodeId ${child.parentNodeId} of ${child.sectionRef} must reference a real node`).toBeDefined();
  return parent!;
}

function violationCodes(
  nodes: readonly StructuralNode[],
  textLength: number,
): string[] {
  return validateStructuralIntegrity(nodes, textLength).violations.map(
    (v) => `${v.invariant}:${v.nodeId ?? "null"}`,
  );
}

function handNode(over: Partial<StructuralNode> & { nodeId: string }): StructuralNode {
  return {
    documentId: DOC,
    nodeType: "SECTION",
    heading: "Test",
    sectionRef: "7.01",
    nodeKey: `${DOC}::7.01`,
    charStart: 100,
    charEnd: 200,
    ordinal: 0,
    parentSectionRef: null,
    parentNodeId: null,
    ...over,
  };
}

// ===========================================================================
// 1. Article heading variants
// ===========================================================================
describe("article heading variants", () => {
  it("period form: ARTICLE VI. parents its sections", () => {
    const text = "ARTICLE VI. COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness except as permitted.\n\nSection 6.02 Liens. No Loan Party shall grant any Lien.\n";
    const { nodes } = parse(text);
    const article = findOne(nodes, "ARTICLE", "VI");
    for (const ref of ["6.01", "6.02"]) {
      expect(parentOf(nodes, findOne(nodes, "SECTION", ref))).toBe(article);
    }
    expect(validateStructuralIntegrity(nodes, text.length).valid).toBe(true);
  });

  it("no-period form: ARTICLE VI parents its sections", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness except as permitted.\n\nARTICLE VII EVENTS OF DEFAULT\n\nSection 7.01 Events of Default. Each of the following shall constitute an Event of Default.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(findOne(nodes, "ARTICLE", "VI"));
    expect(parentOf(nodes, findOne(nodes, "SECTION", "7.01"))).toBe(findOne(nodes, "ARTICLE", "VII"));
    expect(validateStructuralIntegrity(nodes, text.length).valid).toBe(true);
  });

  it("mixed-case title: Article VI Covenants parents its sections", () => {
    const text = "Article VI Covenants\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(findOne(nodes, "ARTICLE", "VI"));
  });

  it("all-caps title: ARTICLE VI COVENANTS parents its sections", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(findOne(nodes, "ARTICLE", "VI"));
  });

  it("heading + body on one line: article and section still parent correctly", () => {
    const text = "ARTICLE VI COVENANTS Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness except as permitted.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(findOne(nodes, "ARTICLE", "VI"));
  });

  it("heading split across a line break: ARTICLE / VI still parents its sections", () => {
    const text = "ARTICLE\nVI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(findOne(nodes, "ARTICLE", "VI"));
  });

  it("extra spacing: ARTICLE    VI    COVENANTS still parents its sections", () => {
    const text = "ARTICLE    VI    COVENANTS\n\nSection   6.01   Indebtedness. No Loan Party shall incur Indebtedness.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(findOne(nodes, "ARTICLE", "VI"));
  });
});

// ===========================================================================
// 2. Roman numeral and decimal numbering
// ===========================================================================
describe("roman and decimal numbering", () => {
  it("ARTICLE VII + Section 7.01: roman article parents the section", () => {
    const text = "ARTICLE VII EVENTS OF DEFAULT\n\nSection 7.01 Events of Default. Each of the following shall constitute an Event of Default.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "7.01"))).toBe(findOne(nodes, "ARTICLE", "VII"));
    expect(isRefDescendant("VII", "ARTICLE", "7.01")).toBe(true);
  });

  it("ARTICLE 7 (arabic article) + Section 7.01: arabic article parents the section", () => {
    const text = "ARTICLE 7 COVENANTS\n\nSection 7.01 Liens. No Loan Party shall grant any Lien.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "7.01"))).toBe(findOne(nodes, "ARTICLE", "7"));
    expect(isRefDescendant("7", "ARTICLE", "7.01")).toBe(true);
  });

  it("articles beyond XX: ARTICLE XXI parents Section 21.01 (no roman-list cap)", () => {
    // Pre-fix, articleHeading re-derivation used a hard-coded Roman map
    // I–XX; articles XXI+ returned undefined. Parentage must not cap.
    const text = "ARTICLE XXI MISCELLANEOUS\n\nSection 21.01 Notices. All notices shall be in writing and delivered personally.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "21.01"))).toBe(findOne(nodes, "ARTICLE", "XXI"));
    expect(isRefDescendant("XXI", "ARTICLE", "21.01")).toBe(true);
  });

  it("articles beyond XX: ARTICLE XXV parents Section 25.01", () => {
    const text = "ARTICLE XXV FURTHER PROVISIONS\n\nSection 25.01 Amendments. No amendment shall be effective without consent.\n";
    const { nodes } = parse(text);
    expect(parentOf(nodes, findOne(nodes, "SECTION", "25.01"))).toBe(findOne(nodes, "ARTICLE", "XXV"));
    expect(isRefDescendant("XXV", "ARTICLE", "25.01")).toBe(true);
  });
});

// ===========================================================================
// 3. Deeply nested subsections
// ===========================================================================
describe("deeply nested subsections", () => {
  const text =
    "ARTICLE VII EVENTS OF DEFAULT\n\nSection 7.01 Events of Default. Each of the following shall constitute an Event of Default: " +
    "(a) Nonpayment. The Borrower shall fail to pay any principal when due. " +
    "(i) Grace Period. A grace period of three days shall apply. " +
    "(A) Notice. Notice shall be given in writing. " +
    "(1) Form. The notice shall be in the prescribed form.\n";

  it("lowercase chain: each level parents to its immediate parent, ending at the 7.01 SECTION", () => {
    const { nodes } = parse(text);
    const section = findOne(nodes, "SECTION", "7.01");
    const sub = findOne(nodes, "SUBSECTION", "7.01(a)");
    const clause = findOne(nodes, "CLAUSE", "7.01(a)(i)");
    expect(parentOf(nodes, sub)).toBe(section);
    expect(parentOf(nodes, clause)).toBe(sub);
    expect(parentOf(nodes, section)).toBe(findOne(nodes, "ARTICLE", "VII"));
  });

  it("uppercase marker chain: 7.01(a)(i)(A) parents to 7.01(a)(i), and (A)(1) to (A)", () => {
    // KNOWN DEFECT (found by this suite): isRefDescendant's continuation
    // regex is `[a-z0-9]{1,3}`, which rejects the uppercase marker "(A)",
    // so 7.01(a)(i)(A) falls through to the ARTICLE VII parent instead of
    // its immediate CLAUSE parent, while its own child (A)(1) parents to
    // it — an incoherent chain that the validator cannot catch (the
    // article parent is ref-consistent by major number). This test
    // asserts the CORRECT chain and currently FAILS until the regex is
    // made case-insensitive.
    const { nodes } = parse(text);
    const clause = findOne(nodes, "CLAUSE", "7.01(a)(i)");
    const subclauseA = findOne(nodes, "SUBCLAUSE", "7.01(a)(i)(A)");
    const subclause1 = findOne(nodes, "SUBCLAUSE", "7.01(a)(i)(A)(1)");
    expect(parentOf(nodes, subclauseA)).toBe(clause);
    expect(parentOf(nodes, subclause1)).toBe(subclauseA);
  });
});

// ===========================================================================
// 4. Repeated section refs across documents in one text
// ===========================================================================
describe("repeated section refs across two agreements in one text", () => {
  it("each 5.01 parents to ITS OWN Article V (containment), never the other's", () => {
    const text =
      "CREDIT AGREEMENT\n\nARTICLE V REPRESENTATIONS AND WARRANTIES\n\nSection 5.01 Organization. The Borrower is duly organized.\n\n" +
      "GUARANTY\n\nARTICLE V REPRESENTATIONS AND WARRANTIES\n\nSection 5.01 Organization. The Guarantor is duly organized.\n";
    const { nodes } = parse(text);
    const articles = findAll(nodes, "ARTICLE", "V");
    const sections = findAll(nodes, "SECTION", "5.01");
    expect(articles).toHaveLength(2);
    expect(sections).toHaveLength(2);
    const [first501, second501] = sections;
    const [firstArt, secondArt] = articles;
    // Occurrence identity: distinct physical occurrences, never merged.
    expect(first501!.nodeId).not.toBe(second501!.nodeId);
    expect(first501!.parentNodeId).not.toBe(second501!.parentNodeId);
    // Containment: each section parents to the Article V that contains it.
    expect(parentOf(nodes, first501!)).toBe(firstArt);
    expect(parentOf(nodes, second501!)).toBe(secondArt);
    // The pre-fix nearest-preceding-article rule would ALSO give the
    // first 5.01 the first Article V; the discriminating assertion is
    // the SECOND 5.01, whose nearest preceding article is the second
    // Article V only by containment — and whose parent must not be the
    // first Article V (which a first-match-by-label lookup would return).
    expect(second501!.parentNodeId).not.toBe(firstArt!.nodeId);
    expect(validateStructuralIntegrity(nodes, text.length).valid).toBe(true);
  });
});

// ===========================================================================
// 5. Incorrectly ordered nodes
// ===========================================================================
describe("incorrectly ordered nodes", () => {
  it("shuffled nodes report a SORTED violation (never silently pass)", () => {
    const text =
      "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\nSection 6.02 Liens. No Loan Party shall grant any Lien.\n";
    const { nodes } = parse(text);
    expect(validateStructuralIntegrity(nodes, text.length).valid).toBe(true);
    const shuffled = [...nodes].reverse();
    const result = validateStructuralIntegrity(shuffled, text.length);
    expect(result.valid).toBe(false);
    expect(result.violations.map((v) => v.invariant)).toContain("SORTED");
  });
});

// ===========================================================================
// 6. Missing parent headings
// ===========================================================================
describe("missing parent headings", () => {
  it("Section 7.01 with NO Article VII heading has parent NULL, never Article VI", () => {
    const text =
      "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\n" +
      "Section 7.01 Events of Default. Each of the following shall constitute an Event of Default.\n";
    const { nodes } = parse(text);
    const section701 = findOne(nodes, "SECTION", "7.01");
    // Pre-fix: nearest preceding ARTICLE (VI) became the parent, and the
    // Representations guard / articleHeading then used the wrong article.
    expect(section701.parentNodeId).toBeNull();
    expect(section701.parentSectionRef).toBeNull();
    const articleVI = findOne(nodes, "ARTICLE", "VI");
    expect(section701.parentNodeId).not.toBe(articleVI.nodeId);
    const result = validateStructuralIntegrity(nodes, text.length);
    expect(result.violations.map((v) => v.invariant)).toContain("ROOT_VALIDITY");
    expect(result.violations.some((v) => v.invariant === "ROOT_VALIDITY" && v.nodeId === section701.nodeId)).toBe(true);
  });
});

// ===========================================================================
// 7. Exhibits / schedules
// ===========================================================================
describe("exhibits and schedules", () => {
  it("exhibit article-like headings never parent to a main-body article", () => {
    const text =
      "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\n" +
      "EXHIBIT A\n\nFORM OF ASSIGNMENT AND ACCEPTANCE\n\n" +
      "1.1 Assignor. The Assignor hereby assigns its rights.\n\n1.2 Assignee. The Assignee hereby accepts such assignment.\n";
    const { nodes } = parse(text);
    const articleVI = findOne(nodes, "ARTICLE", "VI");
    for (const ref of ["1.1", "1.2"]) {
      const exhibitSection = findOne(nodes, "SECTION", ref);
      // The main-body Article VI span bleeds to EOF and CONTAINS the
      // exhibit sections; only the ref-consistency check (major 1 != VI)
      // stops a containment-only parentage from claiming them.
      expect(exhibitSection.parentNodeId).not.toBe(articleVI.nodeId);
      const parent = parentOf(nodes, exhibitSection);
      if (parent !== null) {
        // If a future parser groups exhibit sections, the parent must be
        // another exhibit node, never a main-body article.
        expect(parent.charStart).toBeGreaterThanOrEqual(text.indexOf("EXHIBIT A"));
      }
    }
    // The real body section still parents to its article.
    expect(parentOf(nodes, findOne(nodes, "SECTION", "6.01"))).toBe(articleVI);
  });
});

// ===========================================================================
// 8. Amendments / restatements
// ===========================================================================
describe("amendments and restatements", () => {
  const text =
    "CREDIT AGREEMENT\n\nARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness in excess of $10,000,000.\n\n" +
    "AMENDMENT NO. 1\n\nSection 6.01 Indebtedness. Section 6.01 of the Credit Agreement is hereby amended to permit Indebtedness in excess of $25,000,000.\n";

  it("base and amendment 6.01 are distinct occurrences (different nodeIds)", () => {
    const { nodes } = parse(text);
    const sections = findAll(nodes, "SECTION", "6.01");
    expect(sections).toHaveLength(2);
    expect(sections[0]!.nodeId).not.toBe(sections[1]!.nodeId);
    expect(sections[0]!.charStart).not.toBe(sections[1]!.charStart);
  });

  it("discovery does not dedup the two 6.01s: one candidate per occurrence", () => {
    const { nodes } = parse(text);
    const records: StructuralNodeRecord[] = nodes.map((n) => ({
      nodeId: n.nodeId,
      sourceId: "src",
      nodeType: n.nodeType,
      sectionRef: n.sectionRef,
      heading: n.heading,
      charStart: n.charStart,
      charEnd: n.charEnd,
      parentNodeId: n.parentNodeId ?? undefined,
      ambiguous: n.ambiguous,
    }));
    const candidates = discoverCovenantCandidates("src", text, records);
    const sections = findAll(nodes, "SECTION", "6.01");
    const sectionNodeIds = new Set(sections.map((s) => s.nodeId));
    const matches = candidates.filter((c) => c.nodeId !== undefined && sectionNodeIds.has(c.nodeId));
    // Pre-fix D9: same-ref + contained excerpt dedup dropped the second
    // occurrence as a "duplicate" of the first.
    expect(matches).toHaveLength(2);
    const excerpts = matches.map((c) => c.excerpt);
    expect(excerpts.some((e) => e.includes("$10,000,000"))).toBe(true);
    expect(excerpts.some((e) => e.includes("$25,000,000"))).toBe(true);
  });
});

// ===========================================================================
// 9. Cross-references are not parent relationships
// ===========================================================================
describe("cross-references are not parent relationships", () => {
  it("'subject to Article V' before Section 7.01 does not make Article V its parent", () => {
    const text =
      "ARTICLE V REPRESENTATIONS AND WARRANTIES\n\nSection 5.01 Organization. The Borrower is duly organized.\n\n" +
      "ARTICLE VII EVENTS OF DEFAULT\n\nSection 7.01 Events of Default. Subject to Article V, each of the following shall constitute an Event of Default.\n";
    const { nodes } = parse(text);
    const articleV = findOne(nodes, "ARTICLE", "V");
    const section701 = findOne(nodes, "SECTION", "7.01");
    expect(parentOf(nodes, section701)).toBe(findOne(nodes, "ARTICLE", "VII"));
    expect(section701.parentNodeId).not.toBe(articleV.nodeId);
  });
});

// ===========================================================================
// 10. Malformed numbering
// ===========================================================================
describe("malformed numbering", () => {
  it("OCR 'Section 7.0l' (lowercase L) normalizes to 7.01 and parents to Article VII", () => {
    const text = "ARTICLE VII EVENTS OF DEFAULT\n\nSection 7.0l Events of Default. Each of the following shall constitute an Event of Default.\n";
    const { nodes } = parse(text);
    const section = findOne(nodes, "SECTION", "7.01");
    expect(parentOf(nodes, section)).toBe(findOne(nodes, "ARTICLE", "VII"));
  });

  it("'Section 7.011' is NOT a child of 7.01 (string-prefix trap)", () => {
    const text =
      "ARTICLE VII COVENANTS\n\nSection 7.01 Liens. No Loan Party shall grant any Lien.\n\nSection 7.011 Additional Liens. Extra text about additional liens here.\n";
    const { nodes } = parse(text);
    const section701 = findOne(nodes, "SECTION", "7.01");
    const section7011 = findOne(nodes, "SECTION", "7.011");
    // 7.011 is a sibling section under Article VII, not a clause of 7.01.
    expect(parentOf(nodes, section7011)).toBe(findOne(nodes, "ARTICLE", "VII"));
    expect(section7011.parentNodeId).not.toBe(section701.nodeId);
    expect(isRefDescendant("7.01", "SECTION", "7.011")).toBe(false);
  });
});

// ===========================================================================
// 11. Ambiguous structural boundaries
// ===========================================================================
describe("ambiguous structural boundaries", () => {
  it("an inline heading triages ambiguous but still anchors: its clauses parent to it", () => {
    // The 7.01 heading sits on the same line as preceding prose, so it
    // triages AMBIGUOUS — but it becomes a real node (ambiguous=true)
    // that anchors its clauses, instead of the clauses falling through
    // to the article or the previous section.
    const text =
      "ARTICLE VII EVENTS OF DEFAULT\n\nThe Borrower agrees as follows. Section 7.01 Events of Default. " +
      "Each of the following shall constitute an Event of Default: (a) Nonpayment. The Borrower fails to pay any principal when due.\n";
    const { nodes, ambiguousCandidates } = parse(text);
    expect(ambiguousCandidates.some((c) => c.candidateType === "SECTION" && c.candidateNumber === "7.01")).toBe(true);
    const section = findOne(nodes, "SECTION", "7.01");
    expect(section.ambiguous).toBe(true);
    expect(parentOf(nodes, section)).toBe(findOne(nodes, "ARTICLE", "VII"));
    const clause = findOne(nodes, "SUBSECTION", "7.01(a)");
    expect(parentOf(nodes, clause)).toBe(section);
    expect(validateStructuralIntegrity(nodes, text.length).valid).toBe(true);
  });
});

// ===========================================================================
// 12. Long documents
// ===========================================================================
describe("long documents", () => {
  it("200-section document: every section parents to its own article, no containment/ref violations", () => {
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
    let text = "";
    for (let a = 1; a <= 20; a++) {
      text += `ARTICLE ${roman[a - 1]} TITLE ${a}\n\n`;
      for (let s = 1; s <= 10; s++) {
        const ref = `${a}.${String(s).padStart(2, "0")}`;
        text += `Section ${ref} Heading ${ref}. Body text for section ${ref} with substantive content about covenants and restrictions.\n\n`;
      }
    }
    const { nodes } = parse(text);
    const sections = nodesOfType(nodes, "SECTION");
    expect(sections).toHaveLength(200);
    const articlesById = new Map(nodesOfType(nodes, "ARTICLE").map((n) => [n.nodeId, n]));
    for (const section of sections) {
      const parent = parentOf(nodes, section);
      expect(parent).not.toBeNull();
      expect(parent!.nodeType).toBe("ARTICLE");
      expect(articlesById.get(parent!.nodeId)).toBe(parent);
    }
    // Spot-checks: first, middle, last.
    const byRef = new Map(sections.map((s) => [s.sectionRef, s]));
    expect(parentOf(nodes, byRef.get("1.01")!)?.sectionRef).toBe("I");
    expect(parentOf(nodes, byRef.get("10.05")!)?.sectionRef).toBe("X");
    expect(parentOf(nodes, byRef.get("20.10")!)?.sectionRef).toBe("XX");
    const result = validateStructuralIntegrity(nodes, text.length);
    expect(result.violations.map((v) => v.invariant)).not.toContain("PARENT_CONTAINMENT");
    expect(result.violations.map((v) => v.invariant)).not.toContain("REF_CONSISTENCY");
    expect(result.valid).toBe(true);
  });
});

// ===========================================================================
// 13. Incorrect source offsets
// ===========================================================================
describe("incorrect source offsets", () => {
  it("charStart > charEnd and charEnd beyond text length report OFFSETS_VALID", () => {
    const nodes = [
      handNode({ nodeId: "inverted", charStart: 500, charEnd: 400 }),
      handNode({ nodeId: "overflow", charStart: 600, charEnd: 1500 }),
    ];
    const result = validateStructuralIntegrity(nodes, 1000);
    expect(result.valid).toBe(false);
    const flagged = result.violations.filter((v) => v.invariant === "OFFSETS_VALID").map((v) => v.nodeId);
    expect(flagged).toContain("inverted");
    expect(flagged).toContain("overflow");
  });
});

// ===========================================================================
// 14. Duplicate / overlapping nodes
// ===========================================================================
describe("duplicate and overlapping nodes", () => {
  it("two nodes sharing (documentId, nodeType, charStart) report OCCURRENCE_IDENTITY", () => {
    const nodes = [
      handNode({ nodeId: "first", charStart: 100, charEnd: 200 }),
      handNode({ nodeId: "second", charStart: 100, charEnd: 300 }),
    ];
    const result = validateStructuralIntegrity(nodes, 1000);
    expect(result.violations.map((v) => v.invariant)).toContain("OCCURRENCE_IDENTITY");
  });

  it("a parent cycle (A parents to B, B parents to A) reports ACYCLIC", () => {
    const nodes = [
      handNode({ nodeId: "a", nodeType: "SECTION", sectionRef: "7.01", charStart: 0, charEnd: 100, parentNodeId: "b" }),
      handNode({ nodeId: "b", nodeType: "SUBSECTION", sectionRef: "7.01(a)", charStart: 0, charEnd: 100, parentNodeId: "a" }),
    ];
    const result = validateStructuralIntegrity(nodes, 1000);
    expect(result.violations.map((v) => v.invariant)).toContain("ACYCLIC");
  });
});

// ===========================================================================
// 15. Property / metamorphic
// ===========================================================================
describe("property / metamorphic", () => {
  const base =
    "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness.\n\nSection 6.02 Liens. No Loan Party shall grant any Lien.\n";

  it("(a) inserting blank lines / extra whitespace between sections does not change any parentage", () => {
    const padded = base.replaceAll("\n\nSection", "\n\n\n\n\nSection").replaceAll("Section 6.01", "Section   6.01");
    const before = parse(base).nodes;
    const after = parse(padded).nodes;
    const rel = (nodes: StructuralNode[]) =>
      nodes.map((n) => {
        const parent = n.parentNodeId === null ? null : nodes.find((p) => p.nodeId === n.parentNodeId)?.sectionRef ?? "MISSING";
        return `${n.nodeType}:${n.sectionRef}->${parent}`;
      });
    // NodeIds shift with offsets, so compare parent relationships by ref.
    expect(rel(after)).toEqual(rel(before));
  });

  it("(b) reordering the node array does not change the violation SET (only adds SORTED)", () => {
    const { nodes } = parse(base);
    const sortedCodes = new Set(violationCodes(nodes, base.length));
    const reordered = [...nodes].reverse();
    const result = validateStructuralIntegrity(reordered, base.length);
    expect(result.violations.map((v) => v.invariant)).toContain("SORTED");
    const nonSorted = new Set(
      result.violations.filter((v) => v.invariant !== "SORTED").map((v) => `${v.invariant}:${v.nodeId ?? "null"}`),
    );
    expect(nonSorted).toEqual(sortedCodes);
  });

  it("(c) appending an unrelated second document does not change the first document's parent relationships", () => {
    const doc2 = "\nSECOND AGREEMENT\n\nARTICLE I DEFINITIONS\n\nSection 1.01 Defined Terms. Terms have meanings given here.\n";
    const before = parse(base).nodes;
    const after = parse(base + doc2).nodes;
    // The first document is a strict prefix, so its nodes keep their
    // offsets and nodeIds; compare parentage node-for-node.
    const beforeById = new Map(before.map((n) => [n.nodeId, n]));
    for (const node of after.filter((n) => n.charStart < base.length)) {
      const original = beforeById.get(node.nodeId);
      expect(original, `combined parse must preserve first-doc node ${node.nodeId}`).toBeDefined();
      expect(node.parentNodeId).toBe(original!.parentNodeId);
      expect(node.sectionRef).toBe(original!.sectionRef);
    }
    expect(after.filter((n) => n.charStart < base.length)).toHaveLength(before.length);
  });
});

// ===========================================================================
// 16. Table of contents
// ===========================================================================
describe("table of contents", () => {
  it("TOC entries must not parent body clauses: body 6.01(a) parents to the BODY 6.01", () => {
    const text =
      "TABLE OF CONTENTS\n\nSECTION 6.01 Indebtedness ..... 62\nSECTION 6.02 Liens ..... 65\n\n" +
      "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness. No Loan Party shall incur Indebtedness except as permitted. " +
      "(a) Basket. Indebtedness under this basket shall not exceed the limit.\n";
    const { nodes } = parse(text);
    const toc601 = nodesOfType(nodes, "SECTION").find((n) => n.sectionRef === "6.01" && n.charStart < text.indexOf("ARTICLE VI"));
    const body601 = nodesOfType(nodes, "SECTION").find((n) => n.sectionRef === "6.01" && n.charStart > text.indexOf("ARTICLE VI"));
    expect(toc601).toBeDefined();
    expect(body601).toBeDefined();
    expect(toc601!.nodeId).not.toBe(body601!.nodeId);
    // The body section itself parents to the article, not to the TOC row.
    expect(parentOf(nodes, body601!)).toBe(findOne(nodes, "ARTICLE", "VI"));
    // The discriminating assertion: the body's clause parents to the BODY
    // section. A label-keyed parent lookup (pre-fix D8/D11) would attach
    // it to whichever 6.01 node came first — the TOC entry.
    const clause = findOne(nodes, "SUBSECTION", "6.01(a)");
    expect(clause.parentNodeId).toBe(body601!.nodeId);
    expect(clause.parentNodeId).not.toBe(toc601!.nodeId);
  });
});
