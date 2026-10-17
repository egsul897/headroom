/**
 * H3 — definition-resolution honesty (customer pipeline).
 *
 * Pins the contract that replaced the excerpt-length proxy:
 *  - definition matching scans ALL of a document's definitions
 *    (no slice(0, 300), no 10-hit silent cap);
 *  - `resolved` means a detected definition occurrence backs the
 *    entry — a short genuine definition resolves, a long window
 *    with no definition behind it does not certify anything;
 *  - a term the provision uses but the document does not define
 *    is an explicit resolved:false entry, never an absence;
 *  - differing duplicate definitions are ambiguous, never a
 *    silent pick — and Rule 197 fails closed on them;
 *  - the per-provision listing bound, when hit, DISCLOSES
 *    incomplete coverage instead of silently dropping mentions;
 *  - cross-reference resolution reaches the summary item
 *    additively, with the structural layer's semantics (unique
 *    same-document target only; ambiguity never upgraded).
 */
import { describe, expect, it, vi } from "vitest";

// provision-graph imports lib/prisma, whose generated client is
// absent in some local environments (CI generates it). Stub it —
// the measured functions never call it (same pattern as the audit
// harness).
vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { resolveDefinedTermCap } from "../../lib/product/customer-intelligence/grant-types";
import { discoverProvisionEdgesFromItems } from "../../lib/product/legal-reasoning/provision-graph";
import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";

const SOURCE = "test:defs-honesty";

function node(nodeId: string, sectionRef: string, heading: string): StructuralNodeRecord {
  return {
    nodeId,
    sourceId: SOURCE,
    nodeType: "SECTION",
    sectionRef,
    heading,
    charStart: 0,
    charEnd: 100,
    ambiguous: false,
  };
}

function def(term: string, excerpt: string, nodeId = "n-defs"): DefinitionRecord {
  return { term, sourceId: SOURCE, nodeId, charStart: 10, charEnd: 10 + excerpt.length, excerpt };
}

function analyze(
  excerpt: string,
  definitions: DefinitionRecord[],
  crossReferences: CrossReferenceRecord[] = [],
) {
  const candidate: CovenantCandidateRecord = {
    candidateId: "c-defs",
    sourceId: SOURCE,
    nodeId: "n1",
    families: ["INDEBTEDNESS"],
    signals: [],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 8,
  };
  return analyzeProvision({
    sourceId: SOURCE,
    documentTitle: "Test Agreement",
    candidate,
    definitions,
    structuralNodes: [node("n1", "6.01", "Limitation on Indebtedness")],
    crossReferences,
  });
}

describe("definition coverage: the whole definitions article is scanned", () => {
  it("attaches and resolves a term defined beyond position 300", () => {
    const defs: DefinitionRecord[] = [];
    for (let i = 1; i <= 320; i++) {
      defs.push(def(`Filler Term ${String(i).padStart(3, "0")}`, `“Filler Term ${i}” means filler.`));
    }
    // Position 311 (index 310): unreachable under the old slice(0, 300).
    defs.splice(310, 0, def("Quantum Threshold Amount", "means $5."));
    const a = analyze(
      "The Borrower shall not incur Indebtedness in an amount not exceeding the Quantum Threshold Amount at any time.",
      defs,
    );
    const entry = a.applicableDefinitions.find((d) => d.term === "Quantum Threshold Amount");
    expect(entry).toBeDefined();
    // A SHORT genuine definition resolves: resolution is identity,
    // not excerpt length (the old proxy required > 20 chars).
    expect(entry!.resolved).toBe(true);
    expect(entry!.excerpt).toContain("$5");
  });

  it("attaches more than the old 10-hit cap when a provision uses many defined terms", () => {
    const terms = [
      "Alpha Amount", "Bravo Basket", "Charlie Cap", "Delta Debt", "Echo Equity",
      "Foxtrot Facility", "Golf Guarantee", "Hotel Indebtedness", "India Investment",
      "Juliet Lien", "Kilo Loan", "Lima Limit",
    ];
    const defs = terms.map((t) => def(t, `“${t}” means the amount so named.`));
    const excerpt = `The Borrower shall not exceed the ${terms.join(", the ")}.`;
    const a = analyze(excerpt, defs);
    for (const t of terms) {
      const entry = a.applicableDefinitions.find((d) => d.term === t);
      expect(entry, t).toBeDefined();
      expect(entry!.resolved).toBe(true);
    }
  });
});

describe("used but not defined here: explicit unresolved entries", () => {
  it("flags an unquoted defined-term-shaped mention with no definition record", () => {
    const a = analyze(
      "Indebtedness not exceeding the Available Amount shall be permitted at any time.",
      [],
    );
    const entry = a.applicableDefinitions.find((d) => d.term === "Available Amount");
    expect(entry).toBeDefined();
    expect(entry!.resolved).toBe(false);
    expect(entry!.excerpt).toBe("");
    expect(a.unresolved).toContain("One or more controlling definitions lack resolved definition text");
    expect(a.plainEnglish).toContain("not resolved in-package");
  });

  it("flags a quoted mention with no definition record", () => {
    const a = analyze(
      "Liens securing the “Quantum Basket” shall be permitted.",
      [],
    );
    const entry = a.applicableDefinitions.find((d) => d.term === "Quantum Basket");
    expect(entry).toBeDefined();
    expect(entry!.resolved).toBe(false);
  });

  it("does not flag a capitalized phrase that is not in term-use position (party-name guard)", () => {
    const a = analyze(
      "Bank of America is the Administrative Agent under this Agreement.",
      [def("Administrative Agent", "“Administrative Agent” means Bank of America.")],
    );
    expect(a.applicableDefinitions.find((d) => d.term === "Bank of America")).toBeUndefined();
    expect(
      a.applicableDefinitions.find((d) => d.term === "Administrative Agent")!.resolved,
    ).toBe(true);
  });
});

describe("duplicate definitions: ambiguity, never a silent pick", () => {
  const capExcerpt = "Indebtedness not exceeding the Threshold Amount shall be permitted.";

  it("differing duplicates produce an ambiguous unresolved entry and Rule 197 fails closed", () => {
    const a = analyze(capExcerpt, [
      def("Threshold Amount", "“Threshold Amount” means $ 100,000."),
      def("Threshold Amount", "“Threshold Amount” means $ 200,000."),
    ]);
    const entry = a.applicableDefinitions.find((d) => d.term === "Threshold Amount");
    expect(entry).toBeDefined();
    expect(entry!.resolved).toBe(false);
    expect(entry!.ambiguous).toBe(true);
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: capExcerpt,
        applicableDefinitions: a.applicableDefinitions,
      }),
    ).toBeNull();
  });

  it("identical duplicates resolve, and Rule 197 resolves the bare-dollar cap as before", () => {
    const a = analyze(capExcerpt, [
      def("Threshold Amount", "“Threshold Amount” means $ 750,000."),
      def("Threshold Amount", "“Threshold Amount” means $ 750,000."),
    ]);
    const entry = a.applicableDefinitions.find((d) => d.term === "Threshold Amount");
    expect(entry!.resolved).toBe(true);
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: capExcerpt,
        applicableDefinitions: a.applicableDefinitions,
      }),
    ).toBe(0.75);
  });

  it("Rule 197 never takes a cap from an entry marked unresolved, even with a bare-dollar excerpt", () => {
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: capExcerpt,
        applicableDefinitions: [
          { term: "Threshold Amount", excerpt: "“Threshold Amount” means $ 750,000.", resolved: false },
        ],
      }),
    ).toBeNull();
  });
});

describe("listing bound: disclosed, never silent", () => {
  it("a pathological provision discloses incomplete definition coverage with the omitted count", () => {
    const terms = Array.from({ length: 105 }, (_, i) => `Term Number ${String(i + 1).padStart(3, "0")}`);
    const excerpt = `The following terms apply: ${terms.map((t) => `“${t}”`).join(", ")}.`;
    const a = analyze(excerpt, []);
    expect(a.applicableDefinitions.length).toBe(100);
    expect(a.definitionCoverageIncomplete).toBe(true);
    expect(a.definitionMentionsOmitted).toBe(5);
    expect(a.unresolved.some((u) => u.includes("Definition coverage incomplete"))).toBe(true);
  });
});

describe("cross-reference resolutions reach the summary additively", () => {
  const excerpt =
    "Subject to Section 6.02 and Section 6.03, and notwithstanding Section 6.04 or Section 9.99, the Borrower shall not incur Indebtedness.";
  const xrefs: CrossReferenceRecord[] = [
    {
      sourceId: SOURCE, fromNodeId: "n1", rawReference: "Section 6.02",
      charStart: 10, charEnd: 22, resolved: true, targetNodeId: "n9", targetSectionRef: "6.02",
    },
    {
      sourceId: SOURCE, fromNodeId: "n1", rawReference: "Section 6.03",
      charStart: 27, charEnd: 39, resolved: false, targetAmbiguous: true,
      targetSectionRef: "6.03", unresolvedReason: "AMBIGUOUS_TARGET",
    },
    {
      sourceId: SOURCE, fromNodeId: "n1", rawReference: "Section 6.04",
      charStart: 60, charEnd: 72, resolved: false, unresolvedReason: "TARGET_NOT_FOUND",
    },
  ];

  it("carries resolved / ambiguous / not-found / text-only states without upgrading any", () => {
    const a = analyze(excerpt, [], xrefs);
    const byRef = new Map((a.crossReferenceResolutions ?? []).map((r) => [r.ref, r]));
    expect(byRef.get("Section 6.02")).toMatchObject({ resolved: true, targetNodeId: "n9", targetSectionRef: "6.02" });
    expect(byRef.get("Section 6.03")).toMatchObject({ resolved: false, ambiguous: true });
    expect(byRef.get("Section 6.04")).toMatchObject({ resolved: false, reason: "TARGET_NOT_FOUND" });
    expect(byRef.get("Section 9.99")).toMatchObject({ resolved: false, reason: "NO_STRUCTURAL_RECORD" });
    // The legacy string[] is preserved and consistent.
    expect(a.crossReferences).toEqual(
      expect.arrayContaining(["Section 6.02", "Section 6.03", "Section 6.04", "Section 9.99"]),
    );
  });

  it("flows through buildDocumentCovenantSummary onto the item", () => {
    const candidate: CovenantCandidateRecord = {
      candidateId: "c-defs",
      sourceId: SOURCE,
      nodeId: "n1",
      families: ["INDEBTEDNESS"],
      signals: [],
      excerpt,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 8,
    };
    const summary = buildDocumentCovenantSummary({
      sourceId: SOURCE,
      documentTitle: "Test Agreement",
      issuerCik: "0000123456",
      documentClass: "CREDIT_AGREEMENT",
      candidates: [candidate],
      definitions: [],
      structuralNodes: [node("n1", "6.01", "Limitation on Indebtedness")],
      crossReferences: xrefs,
    });
    const item = summary.items.find((i) => i.sectionRef === "6.01")!;
    expect(item.crossReferenceResolutions).toBeDefined();
    expect(item.crossReferenceResolutions!.some((r) => r.resolved && r.targetNodeId === "n9")).toBe(true);
    expect(item.crossReferenceResolutions!.some((r) => r.ambiguous === true)).toBe(true);
  });
});

describe("legacy shapes keep reading", () => {
  it("provision-graph falls back to string parsing for items without resolutions, and Rule 197 accepts unflagged entries", () => {
    const legacyItem = {
      sourceId: SOURCE,
      sectionRef: "6.01",
      heading: "Limitation on Indebtedness",
      plainEnglish: "",
      category: "DEBT_INCURRENCE",
      posture: "ENUMERATED_PERMISSION",
      applicableDefinitions: [{ term: "Threshold Amount", excerpt: "“Threshold Amount” means $ 750,000." }],
      crossReferences: ["Section 6.02"],
      exceptions: [],
      conditions: [],
      materialBasketsThresholds: [],
    } as unknown as Parameters<typeof discoverProvisionEdgesFromItems>[0][number];
    const edges = discoverProvisionEdgesFromItems([legacyItem]);
    const xrefEdge = edges.find((e) => e.kind === "PROVISION_CROSS_REFERENCE");
    expect(xrefEdge).toBeDefined();
    expect(xrefEdge!.toSectionRef).toBe("6.02");
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: "Indebtedness not exceeding the Threshold Amount.",
        applicableDefinitions: legacyItem.applicableDefinitions,
      }),
    ).toBe(0.75);
  });

  it("provision-graph links a structurally resolved xref to its target item by nodeId", () => {
    const from = {
      sourceId: SOURCE,
      sectionRef: "6.01",
      nodeId: "n1",
      heading: "Limitation on Indebtedness",
      plainEnglish: "",
      category: "DEBT_INCURRENCE",
      posture: "ENUMERATED_PERMISSION",
      applicableDefinitions: [],
      crossReferences: ["Section 6.02"],
      crossReferenceResolutions: [
        { ref: "Section 6.02", resolved: true, targetNodeId: "n9", targetSectionRef: "6.02" },
        { ref: "Section 6.03", resolved: false, ambiguous: true, targetSectionRef: "6.03" },
      ],
      exceptions: [],
      conditions: [],
      materialBasketsThresholds: [],
    } as unknown as Parameters<typeof discoverProvisionEdgesFromItems>[0][number];
    const target = {
      ...from,
      sectionRef: "6.02",
      nodeId: "n9",
      crossReferences: [],
      crossReferenceResolutions: [],
    } as unknown as Parameters<typeof discoverProvisionEdgesFromItems>[0][number];
    const edges = discoverProvisionEdgesFromItems([from, target]);
    const resolved = edges.find(
      (e) => e.kind === "PROVISION_CROSS_REFERENCE" && e.toSectionRef === "6.02",
    );
    expect(resolved).toBeDefined();
    expect(resolved!.confidence).toBe(0.75);
    expect(resolved!.rationale).toContain("structurally resolved");
    const ambiguous = edges.find(
      (e) => e.kind === "PROVISION_CROSS_REFERENCE" && e.toSectionRef === "6.03",
    );
    expect(ambiguous).toBeDefined();
    expect(ambiguous!.confidence).toBe(0.3);
    expect(ambiguous!.rationale).toContain("ambiguous");
  });
});
