/**
 * Proves the amplify bug (capped existing-ID scan) vs the fixed full-set skip logic
 * without writing Neon.
 */
import { describe, expect, it } from "vitest";
import {
  discoverProvisionEdgesFromItems,
  provisionEdgeDiscoveryId,
} from "../../lib/product/legal-reasoning/provision-graph";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(partial: {
  sourceId: string;
  sectionRef: string;
  term: string;
}): CovenantSummaryItem & { sourceId: string } {
  return {
    sourceId: partial.sourceId,
    sectionRef: partial.sectionRef,
    category: "DEFINITIONS",
    categoryLabel: "Definitions",
    heading: partial.sectionRef,
    posture: "RESTRICTIVE",
    plainEnglish: "x",
    restriction: null,
    permissions: [],
    coveredEntities: [],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: "",
    sourceCitation: partial.sectionRef,
    governingAgreement: "CA",
    families: [],
    relatedDefinedTerms: [partial.term],
    applicableDefinitions: [{ term: partial.term, excerpt: "", resolved: true }],
    entityScope: {
      borrower: true,
      guarantor: false,
      restrictedSubsidiary: false,
      unrestrictedSubsidiary: false,
      notes: [],
    },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "",
    unresolvedQuestions: [],
    analysis: {} as never,
  };
}

/**
 * Simulate persist skip logic: given an existing set, only insert missing IDs.
 * Caps on the *existing scan* reproduce the amplify bug when the set is incomplete.
 */
function simulatePersist(params: {
  edges: ReturnType<typeof discoverProvisionEdgesFromItems>;
  existingIds: Set<string>;
  /** Bug reproduction: only consider first N existing IDs when skipping */
  existingScanCap?: number;
}): { persisted: string[]; skipped: number; existingAfter: Set<string> } {
  const scanned =
    params.existingScanCap != null
      ? new Set([...params.existingIds].slice(0, params.existingScanCap))
      : new Set(params.existingIds);
  const persisted: string[] = [];
  let skipped = 0;
  for (const e of params.edges) {
    const id = provisionEdgeDiscoveryId(e);
    if (scanned.has(id)) {
      skipped += 1;
      continue;
    }
    persisted.push(id);
    scanned.add(id);
    params.existingIds.add(id);
  }
  return { persisted, skipped, existingAfter: params.existingIds };
}

describe("provision graph persist idempotence", () => {
  it("full existing-ID set yields zero inserts on second persist", () => {
    const edges = discoverProvisionEdgesFromItems([
      item({ sourceId: "a", sectionRef: "1.01", term: "Affiliate" }),
      item({ sourceId: "a", sectionRef: "7.01", term: "Indebtedness" }),
      item({ sourceId: "b", sectionRef: "1.01", term: "EBITDA" }),
    ]);
    expect(edges.length).toBeGreaterThanOrEqual(3);

    const store = new Set<string>();
    const first = simulatePersist({ edges, existingIds: store });
    expect(first.persisted.length).toBe(edges.length);

    const second = simulatePersist({ edges, existingIds: store });
    expect(second.persisted).toHaveLength(0);
    expect(second.skipped).toBe(edges.length);
    expect(store.size).toBe(edges.length);
  });

  it("capped existing scan (historical bug) re-inserts duplicates", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      item({ sourceId: "doc", sectionRef: `1.${i}`, term: `Term${i}` }),
    );
    const edges = discoverProvisionEdgesFromItems(many);
    const store = new Set<string>();
    simulatePersist({ edges, existingIds: store });
    expect(store.size).toBe(edges.length);

    // Cap smaller than population → second "batch" thinks IDs are new
    const buggy = simulatePersist({
      edges,
      existingIds: new Set(store),
      existingScanCap: 10,
    });
    expect(buggy.persisted.length).toBeGreaterThan(0);
    // Fixed path with no cap
    const fixed = simulatePersist({ edges, existingIds: new Set(store) });
    expect(fixed.persisted).toHaveLength(0);
  });
});
