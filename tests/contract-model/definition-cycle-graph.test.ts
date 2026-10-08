/**
 * A diamond is two paths to one definition. A cycle is a directed return
 * to a definition already on the path. The last definition must not swallow
 * the covenant that cites it.
 */
import { describe, expect, it } from "vitest";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { buildExactTermsByDocument, buildTestIndex, type TestDocument } from "./context-retrieval-test-utils";
import { makeCandidate } from "./coverage-audit-test-utils";

function cycles(text: string, sectionRef: string, docs: TestDocument[] = [{ documentId: "doc", label: "CA", text }]) {
  const index = buildTestIndex(docs);
  const node = index.resolveUniqueNodeByRef(docs[0]!.documentId, sectionRef);
  if (node.status !== "UNIQUE") return { index, cycles: [`unresolved section ${sectionRef} ${node.status}`], terms: [] as string[] };
  const candidate = makeCandidate({ documentId: docs[0]!.documentId, structuralNodeKeys: [node.node.sectionRef], structuralNodeIds: [node.node.nodeId], normalizedSourceRef: sectionRef });
  const bundle = buildCovenantContextBundle(
    { candidate, packageKey: "p", companyId: "c", instrumentKey: null },
    { index, packageGraph: docs.length > 1 ? buildPackageGraph("c", "p", docs) : null, exactTermsByDocument: buildExactTermsByDocument(docs) },
  );
  return {
    index,
    cycles: bundle.unresolvedDependencies.filter((item) => item.dependencyType === "DEFINITION_CYCLE").map((item) => item.attemptedResolution),
    terms: bundle.items.filter((item) => item.type === "DEFINITION" || item.type === "DEFINITION_DEPENDENCY").map((item) => item.normalizedRef),
  };
}

describe("definition dependency graph", () => {
  it("does not call a diamond a cycle, and does not let the last definition swallow the covenant", () => {
    const text = [
      '"Guarantor" means each Subsidiary that has executed the Guarantee.',
      '"Subsidiary" means any corporation or other entity that is controlled by the Borrower.',
      "SECTION 7.01 Indebtedness. The Borrower shall not permit any Subsidiary to incur Indebtedness, except:",
      "(b) other Indebtedness of the Borrower and any Guarantor in an aggregate principal amount not to exceed $10,000,000.",
    ].join("\n\n");
    const result = cycles(text, "7.01");
    expect(result.cycles).toEqual([]);
    expect(result.terms).toEqual(expect.arrayContaining(["Guarantor", "Subsidiary"]));
    const body = result.index.getDefinitionFullText("Subsidiary", "doc") ?? "";
    expect(body).toMatch(/controlled by the Borrower/);
    expect(body).not.toMatch(/SECTION 7.01/);
  });

  it("follows a chain and still reports a real directed cycle", () => {
    const chain = [
      '"Total Leverage Amount" means Consolidated EBITDA multiplied by 3.00.',
      '"Consolidated EBITDA" means Consolidated Net Income plus non-cash charges.',
      '"Consolidated Net Income" means net income of the Borrower.',
      "SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Total Leverage Amount.",
    ].join("\n\n");
    expect(cycles(chain, "6.01").cycles).toEqual([]);

    const loop = [
      '"Term Alpha" means an amount equal to Term Beta minus one dollar.',
      '"Term Beta" means an amount equal to Term Alpha plus one dollar.',
      "SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Term Alpha.",
    ].join("\n\n");
    expect(cycles(loop, "6.01").cycles.length).toBeGreaterThan(0);
  });

  it("does not invent a cycle for a missing term or a cross-document definition", () => {
    const missing = 'SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding the Applicable Threshold Amount.';
    expect(cycles(missing, "6.01").cycles).toEqual([]);

    const credit = [
      '"Subsidiary" means any entity controlled by the Borrower.',
      "SECTION 7.01 Indebtedness. The Borrower shall not permit any Guarantor to incur Indebtedness not to exceed $10,000,000.",
    ].join("\n\n");
    const guarantee = [
      "GUARANTEE AGREEMENT dated as of January 15, 2021.",
      '"Guarantor" means each Subsidiary that has executed this Guarantee.',
    ].join("\n\n");
    const docs: TestDocument[] = [
      { documentId: "credit", label: "Credit Agreement", text: credit },
      { documentId: "guarantee", label: "Guarantee", text: guarantee },
    ];
    const result = cycles(credit, "7.01", docs);
    expect(result.cycles).toEqual([]);
  });
});
