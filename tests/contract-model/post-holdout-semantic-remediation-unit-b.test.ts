/**
 * POST-HOLDOUT-SEMANTIC-REMEDIATION Unit B synthetic test matrix
 * (docs/post-holdout-semantic-remediation/06-relationship-architecture-
 * decision.json). Covers the mission's own R1-R12 relationship-evidence-
 * retrieval scenarios, generically - every company/document name and date
 * below is invented for this test file (anti-enumeration: R11/R12 re-run
 * the same shape under renamed entities/numbers). Zero LLM calls -
 * buildPackageGraph is entirely deterministic.
 *
 * Targets: relationship-resolution.ts's resolvePreambleBoundary (structural/
 * recital-based preamble boundary replacing the fixed 4000/8000-char
 * window) and findRecitalBounds' new PRELIMINARY STATEMENTS recognition,
 * plus document-identity.ts's whitespace-tolerant execution-date regex.
 */
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

function doc(documentId: string, label: string, text: string): PackageDocumentInput {
  return { documentId, label, text };
}

/** A synthetic table-of-contents block long enough (dozens of short entries) to reproduce the real defect: a naive "earliest ARTICLE/SECTION node" heuristic would stop here, well before the real recital/body. */
function syntheticToc(articleCount: number): string {
  let toc = "Table of Contents\n\nPage\n\n";
  for (let i = 1; i <= articleCount; i++) {
    toc += `Article ${i}\n\nSynthetic Article Heading ${i}\n\nSECTION ${i}.01 Synthetic Section ${i}.01\n\n${i}\n\nSECTION ${i}.02 Synthetic Section ${i}.02\n\n${i + 1}\n\n`;
  }
  return toc;
}

function longFrontMatterAmendedAndRestatedDoc(originalAgreementDate: string, recitalHeading: "WHEREAS" | "PRELIMINARY STATEMENTS", partyName = "Zenith Fabrications Corp.") {
  const toc = syntheticToc(40); // deliberately large - well over the old fixed 4000-char window on its own
  const recital =
    recitalHeading === "WHEREAS"
      ? `WHEREAS, the Borrower has requested that the Lenders amend and restate that certain Credit Agreement, dated as of ${originalAgreementDate} (the "Original Credit Agreement"), among the Borrower and the lenders party thereto;\n\nNOW, THEREFORE, the parties agree as follows:\n\n`
      : `PRELIMINARY STATEMENTS\n\nThe Borrower has requested that the Lenders amend and restate that certain Credit Agreement, dated as of ${originalAgreementDate} (the "Original Credit Agreement"), among the Borrower and the lenders party thereto.\n\nNOW, THEREFORE, the parties agree as follows:\n\n`;
  const body = `Article 1\n\nDefinitions and Accounting Terms\n\nSECTION 1.01 Defined Terms. As used in this Agreement, the following terms have the meanings specified below.\n\n"Consolidated EBITDA" means, for ${partyName} and its Subsidiaries, for any period, Consolidated Net Income for such period.`;
  return `EXECUTION VERSION\n\nAMENDED AND RESTATED\nCREDIT AGREEMENT\nDated as of August 14, 2024,\n\namong\n${partyName.toUpperCase()},\nas the Borrower,\n\n${toc}${recital}${body}`;
}

describe("Unit B (R1-R12) - structural relationship-evidence-retrieval matrix", () => {
  it("R1 (the real holdout defect, reproduced synthetically): a long-front-matter Amended and Restated document with a real TOC + WHEREAS recital surfaces the RESTATES relationship, which the OLD fixed 4000-char window missed entirely", () => {
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of December 15, 2022, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const restated = doc("restated", "Amended and Restated Credit Agreement", longFrontMatterAmendedAndRestatedDoc("December 15, 2022", "WHEREAS"));
    const graph = buildPackageGraph("test-co", "pkg-r1", [original, restated]);
    const rel = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.relationshipType === "RESTATES");
    expect(rel).toBeDefined();
    expect(rel!.targetDocumentId).toBe("orig"); // surfaced as a real candidate, not silently absent - the CRITICAL dangerous-silence class this whole unit fixes
  });

  it("R2 (PRELIMINARY STATEMENTS recital recognition, the specific real-world gap this unit closes): the SAME long-front-matter shape, but with a PRELIMINARY STATEMENTS heading instead of WHEREAS, still surfaces the relationship", () => {
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of March 3, 2020, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const restated = doc("restated", "Amended and Restated Credit Agreement", longFrontMatterAmendedAndRestatedDoc("March 3, 2020", "PRELIMINARY STATEMENTS"));
    const graph = buildPackageGraph("test-co", "pkg-r2", [original, restated]);
    const rel = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.relationshipType === "RESTATES");
    expect(rel).toBeDefined();
    expect(rel!.targetDocumentId).toBe("orig");
  });

  it("R3 (TOC immunity): the earliest ARTICLE/SECTION node in the restated document is INSIDE its own table of contents, well before the real recital - the fix must not stop at the TOC and must still reach the recital", () => {
    const text = longFrontMatterAmendedAndRestatedDoc("June 6, 2019", "PRELIMINARY STATEMENTS");
    const tocFirstArticleIdx = text.indexOf("Article 1\n\nSynthetic Article Heading 1");
    const recitalIdx = text.indexOf("PRELIMINARY STATEMENTS");
    expect(tocFirstArticleIdx).toBeGreaterThan(0);
    expect(tocFirstArticleIdx).toBeLessThan(recitalIdx); // confirms the TOC genuinely precedes the recital in this fixture, reproducing the real hazard
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of June 6, 2019, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const restated = doc("restated", "Amended and Restated Credit Agreement", text);
    const graph = buildPackageGraph("test-co", "pkg-r3", [original, restated]);
    const rel = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.relationshipType === "RESTATES");
    expect(rel!.targetDocumentId).toBe("orig"); // NOT null/UNRESOLVED - the TOC did not blind the search
  });

  it("R4 (existing REVIEW_REQUIRED confidence rule preserved, not force-resolved to RESOLVED): the surfaced RESTATES relationship stays at recital-only confidence (0.6, REVIEW_REQUIRED) - widening the window changes WHERE evidence is found, never HOW STRONG it must be to auto-resolve", () => {
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of January 1, 2021, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const restated = doc("restated", "Amended and Restated Credit Agreement", longFrontMatterAmendedAndRestatedDoc("January 1, 2021", "WHEREAS"));
    const graph = buildPackageGraph("test-co", "pkg-r4", [original, restated]);
    const rel = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.relationshipType === "RESTATES")!;
    expect(rel.status).toBe("REVIEW_REQUIRED");
    expect(rel.confidence).toBeLessThanOrEqual(0.6);
  });

  it("R5 (no relationship manufactured from mere mention): a document whose ONLY reference to another agreement is a background/cross-default mention deep past the old window stays UNRESOLVED, even with the widened structural boundary", () => {
    const other = doc("other", "Indenture", `INDENTURE dated as of May 5, 2018, among Zenith Fabrications Corp., as Issuer.\n\nARTICLE 1\n\nDefinitions.`);
    const toc = syntheticToc(30);
    const amendment = doc(
      "amend",
      "Second Amendment",
      `EXECUTION VERSION\n\nSECOND AMENDMENT TO CREDIT AGREEMENT\nDated as of July 7, 2023,\n\namong\nZENITH FABRICATIONS CORP.,\nas the Borrower,\n\n${toc}WHEREAS, for the avoidance of doubt, this Amendment has no effect on that certain Indenture, dated as of May 5, 2018, which continues in full force and effect;\n\nNOW, THEREFORE, the parties agree as follows:\n\nArticle 1\n\nAmendment. Section 6.01 of the Credit Agreement is hereby amended.`
    );
    const graph = buildPackageGraph("test-co", "pkg-r5", [other, amendment]);
    const relToOther = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "amend" && r.targetDocumentId === "other");
    expect(relToOther).toBeUndefined(); // never manufactured as a relationship target from a background mention
  });

  it("R6 (fallback path, no recital at all - the common single-target-amendment case, must keep working unchanged): a plain amendment with no WHEREAS/PRELIMINARY STATEMENTS still resolves via the ARTICLE/SECTION structural fallback", () => {
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of February 2, 2021, among Zenith Fabrications Corp., as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except up to $10,000,000.`);
    const amendment = doc("amend", "Amendment No. 1", `AMENDMENT NO. 1 dated as of March 3, 2022 to the Credit Agreement dated as of February 2, 2021, among Zenith Fabrications Corp., as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated to increase the debt basket to $15,000,000.`);
    const graph = buildPackageGraph("test-co", "pkg-r6", [base, amendment]);
    const rel = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "amend" && r.relationshipType === "AMENDS");
    expect(rel!.targetDocumentId).toBe("base");
  });

  it("R7 (fallback path, no recital and no ARTICLE/SECTION node at all): a minimal, malformed-shape document still resolves via the fixed-window fallback rather than crashing or silently failing open", () => {
    const base = doc("base", "Credit Agreement", `CREDIT AGREEMENT dated as of April 4, 2021, among Zenith Fabrications Corp., as Borrower. Section 6.01 Indebtedness limit $5,000,000.`);
    const amendment = doc("amend", "Amendment No. 1", `Amendment No. 1 dated as of May 5, 2022 to the Credit Agreement dated as of April 4, 2021, among Zenith Fabrications Corp.`);
    const graph = buildPackageGraph("test-co", "pkg-r7", [base, amendment]);
    const rel = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "amend" && r.relationshipType === "AMENDS");
    expect(rel).toBeDefined();
    expect(rel!.targetDocumentId).toBe("base");
  });

  it("R8 (document-identity.ts whitespace-tolerant execution date - a second, independently-discovered occurrence of the same defect class Mission 2 fixed in the classifier): a caption using multiple spaces/line-wrap between 'dated' and 'as of' still extracts the execution date", () => {
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated  as   of\nJune 6, 2020, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const graph = buildPackageGraph("test-co", "pkg-r8", [original]);
    const identity = graph.identities.find((i) => i.documentId === "orig")!;
    expect(identity.executionDate).toContain("June 6, 2020");
  });

  it("R9 (whitespace-tolerant date does not regress the plain single-space case): a normal single-space caption still extracts correctly", () => {
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of July 7, 2021, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const graph = buildPackageGraph("test-co", "pkg-r9", [original]);
    const identity = graph.identities.find((i) => i.documentId === "orig")!;
    expect(identity.executionDate).toContain("July 7, 2021");
  });

  it("R10 (bounded window, no unbounded growth): a document with a WHEREAS recital but no NOW,THEREFORE close does not scan to end-of-document unboundedly", () => {
    const toc = syntheticToc(5);
    const hugeTrailer = "filler text ".repeat(5000); // ~60,000 chars past the recital, with no NOW,THEREFORE
    const text = `EXECUTION VERSION\n\nAMENDED AND RESTATED\nCREDIT AGREEMENT\nDated as of August 8, 2024,\n\namong\nZENITH FABRICATIONS CORP.,\nas the Borrower,\n\n${toc}WHEREAS, the Borrower has requested that the Lenders amend and restate that certain Credit Agreement, dated as of August 8, 2020 (the "Original Credit Agreement");\n\n${hugeTrailer}\n\nUnrelated Indenture, dated as of January 1, 2099, mentioned only deep in filler text.`;
    const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of August 8, 2020, among Zenith Fabrications Corp., as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
    const restated = doc("restated", "Amended and Restated Credit Agreement", text);
    const graph = buildPackageGraph("test-co", "pkg-r10", [original, restated]);
    const relToOrig = graph.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.targetDocumentId === "orig");
    expect(relToOrig).toBeDefined(); // the real, near-recital reference is still found
    const relCount = graph.relationshipCandidates.filter((r) => r.sourceDocumentId === "restated").length;
    expect(relCount).toBeLessThan(5); // the unbounded filler text past the recital was not exhaustively scanned into many spurious candidates
  });

  it("R11/R12 (anti-enumeration): the exact R1 shape re-run under completely different, invented company names and dates produces the SAME structural outcome - zero production code branches on entity identity", () => {
    const runWith = (party: string, date: string) => {
      const original = doc("orig", "Credit Agreement", `CREDIT AGREEMENT dated as of ${date}, among ${party}, as Borrower.\n\nARTICLE 1\n\nDefinitions.`);
      const restated = doc("restated", "Amended and Restated Credit Agreement", longFrontMatterAmendedAndRestatedDoc(date, "PRELIMINARY STATEMENTS", party));
      const graph = buildPackageGraph("test-co", `pkg-r11-${party}`, [original, restated]);
      return graph.relationshipCandidates.find((r) => r.sourceDocumentId === "restated" && r.relationshipType === "RESTATES");
    };
    const runA = runWith("Quixotic Aerospace Holdings, Inc.", "September 9, 2021");
    const runB = runWith("Meridian Foundry Systems LLC", "October 10, 2022");
    expect(runA!.targetDocumentId).toBe("orig");
    expect(runB!.targetDocumentId).toBe("orig");
    expect(runA!.status).toBe(runB!.status);
    expect(runA!.confidence).toBe(runB!.confidence);
  });
});
