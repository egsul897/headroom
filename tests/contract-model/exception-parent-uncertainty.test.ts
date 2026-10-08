/**
 * An "except" list whose next marker was left inside the parent is not a settled exception scope.
 * The clause tree is unchanged: admitting the comma markers would reparent Gibraltar and Chewy.
 */
import { describe, expect, it } from "vitest";
import { unparsedExceptionParentage } from "../../lib/contract-model/compiler/clause-hierarchy";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildDeterministicStages } from "../../scripts/p3-conmed-pilot/pipeline";
import { makeCandidate } from "./coverage-audit-test-utils";

const DOC = "doc";

function bundleFor(text: string, sectionRef: string) {
  const nodes = parseDocumentStructure({ documentId: DOC, label: "CA", text });
  const defs = detectStructuralDefinitions(DOC, text, nodes);
  const refs = detectStructuralReferences(DOC, text, nodes);
  const index = buildStructuralIndex(new Map([[DOC, { text, nodes }]]), defs, refs);
  const exactTermsByDocument = new Map([[DOC, new Map(defs.map((d) => [d.normalizedTerm, d.exactTerm] as const))]]);
  const resolution = index.resolveUniqueNodeByRef(DOC, sectionRef);
  if (resolution.status !== "UNIQUE") return { index, resolution, bundle: null };
  const node = resolution.node;
  const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: sectionRef });
  const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: "c", instrumentKey: null }, { index, packageGraph: null, exactTermsByDocument });
  return { index, resolution, bundle };
}

describe("unparsed exception parentage", () => {
  it("flags a comma list that an except leaves inside the opening limb", () => {
    const own = "(a) pay dividends, (b) make loans or (c) transfer assets, except for restrictions existing under (i)";
    expect(unparsedExceptionParentage(own, null)).toBe(true);
  });

  it("does not flag a parsed exception or a comma list with no except", () => {
    expect(unparsedExceptionParentage("(a) Dispositions of obsolete equipment not exceeding $1,000,000.", "(a) The Borrower shall not Dispose except ")).toBe(false);
    expect(unparsedExceptionParentage("(a) pay dividends, (b) make loans or (c) transfer assets.", null)).toBe(false);
  });

  it("keeps a line-start except list as current operative text", () => {
    const text = [
      "SECTION 7.01. Limitation on Indebtedness. The Borrower shall not incur Indebtedness, except:",
      "(a) Indebtedness under this Agreement in an aggregate principal amount not to exceed $10,000,000; and",
      "(b) purchase money Indebtedness in an aggregate principal amount not to exceed $5,000,000.",
    ].join("\n");
    const { bundle } = bundleFor(text, "7.01(a)");
    const operative = bundle?.items.find((item) => item.type === "OPERATIVE_SOURCE");
    expect(operative?.evidenceState?.isCurrentTruth).toBe(true);
    expect(bundle?.hasUnresolvedOperativeEvidence).toBe(false);
  });

  it("does not treat CONMED 7.14(a)(i) as the definitive exception parent", () => {
    const stages = buildDeterministicStages();
    const doc = "conmed-doc-a-eighth-ar-credit-agreement";
    expect(stages.index.resolveUniqueNodeByRef(doc, "7.14(b)").status).toBe("NOT_FOUND");
    expect(stages.index.resolveUniqueNodeByRef(doc, "7.14(c)").status).toBe("NOT_FOUND");
    expect(stages.index.resolveUniqueNodeByRef(doc, "7.14(i)").status).toBe("NOT_FOUND");
    const clause = stages.index.resolveUniqueNodeByRef(doc, "7.14(a)(i)");
    expect(clause.status).toBe("UNIQUE");
    if (clause.status !== "UNIQUE") return;
    const parent = clause.node.parentNodeId ? stages.index.getNodeById(clause.node.parentNodeId) : undefined;
    expect(parent?.sectionRef).toBe("7.14(a)");
    const owned = stages.index.getNodeText(clause.node.nodeId, "DESCENDANTS");
    expect(owned).toMatch(/\(ii\)/);
    expect(owned).toMatch(/\(iii\)/);

    const exactTermsByDocument = new Map<string, Map<string, string>>();
    for (const ref of ["7.14(a)", "7.14(a)(i)", "7.4(a)(iii)"] as const) {
      const resolution = stages.index.resolveUniqueNodeByRef(doc, ref);
      expect(resolution.status, ref).toBe("UNIQUE");
      if (resolution.status !== "UNIQUE") continue;
      const node = resolution.node;
      const candidate = makeCandidate({ documentId: doc, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: ref });
      const bundle = buildCovenantContextBundle(
        { candidate, packageKey: "conmed-2025-credit-facility", companyId: "conmed-pilot", instrumentKey: null },
        { index: stages.index, packageGraph: null, exactTermsByDocument },
      );
      const operative = bundle.items.find((item) => item.type === "OPERATIVE_SOURCE" && item.normalizedRef === ref);
      expect(operative?.excerptText.length, ref).toBeGreaterThan(0);
      if (ref.startsWith("7.14")) {
        expect(operative?.evidenceState?.status, ref).toBe("AMBIGUOUS_TARGET");
        expect(operative?.evidenceState?.isCurrentTruth, ref).toBe(false);
        expect(bundle.hasUnresolvedOperativeEvidence, ref).toBe(true);
      } else {
        expect(operative?.evidenceState?.isCurrentTruth, ref).toBe(true);
        expect(bundle.hasUnresolvedOperativeEvidence, ref).toBe(false);
      }
    }
  });
});
