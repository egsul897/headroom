import { describe, expect, it } from "vitest";
import { detectPatternsInText } from "../../lib/knowledge-factory/patterns/library";
import {
  hasAggregateCeilingLanguage,
  hasAntiStackingLanguage,
  hasSharedCapacityRelationship,
  isSharedCapacityLanguage,
} from "../../lib/knowledge-factory/patterns/shared-capacity";
import { classifyFamiliesFromText } from "../../lib/knowledge-factory/taxonomy/families";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";

function indexFor(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  return buildStructuralIndex(nodesByDocument, [], []);
}

describe("shared-capacity vs aggregate-ceiling separation", () => {
  const ordinaryCeiling =
    "Section 7.01. Indebtedness. The Borrower shall not incur Indebtedness of Restricted Subsidiaries that are not Loan Parties in an aggregate amount not to exceed $30,000,000.";
  const sharedPool =
    'Section 1.01. Definitions. "Consolidated EBITDA" means … provided that the aggregate amount of adjustments made pursuant to this clause (v) (combined with the aggregate amount of adjustments made pursuant to clauses (e)(i), (g), (u) and (w) of this definition) shall not exceed 30.0% of Consolidated EBITDA.';
  const antiStack =
    "Section 7.01. Indebtedness. Amounts incurred under this clause (a) without duplication of amounts incurred under clause (b) shall not exceed the Shared Cap.";

  it("does not treat bare aggregate amount as shared capacity", () => {
    expect(hasAggregateCeilingLanguage(ordinaryCeiling)).toBe(true);
    expect(hasSharedCapacityRelationship(ordinaryCeiling)).toBe(false);
    expect(isSharedCapacityLanguage(ordinaryCeiling)).toBe(false);
    const patterns = detectPatternsInText(ordinaryCeiling);
    expect(patterns).toContain("aggregate-ceiling");
    expect(patterns).not.toContain("shared-capacity");
  });

  it("detects combined-with shared capacity across clauses", () => {
    expect(isSharedCapacityLanguage(sharedPool)).toBe(true);
    const patterns = detectPatternsInText(sharedPool);
    expect(patterns).toContain("shared-capacity");
    expect(patterns).toContain("grower-basket");
  });

  it("detects anti-stacking language", () => {
    expect(hasAntiStackingLanguage(antiStack)).toBe(true);
    expect(detectPatternsInText(antiStack)).toContain("anti-stacking");
  });

  it("detects multi-clause pursuant-to aggregate caps (Superior-style)", () => {
    const superiorStyle =
      "provided that the aggregate amount of any amounts added back pursuant to clauses (f), (m) and (n) shall not exceed 10% of Consolidated EBITDA";
    expect(isSharedCapacityLanguage(superiorStyle)).toBe(true);
    expect(hasAggregateCeilingLanguage(ordinaryCeiling)).toBe(true);
    expect(isSharedCapacityLanguage(ordinaryCeiling)).toBe(false);
  });

  it("does not classify ordinary ceilings into SHARED_CAPACITY_PROVISIONS family", () => {
    const families = classifyFamiliesFromText(ordinaryCeiling, "Section 7.01 Indebtedness");
    expect(families).not.toContain("SHARED_CAPACITY_PROVISIONS");
  });

  it("Pass A emits aggregate_ceiling without shared_cap for ordinary ceilings", () => {
    const documentId = "doc-ceiling";
    const index = indexFor(documentId, ordinaryCeiling);
    const candidates = runPassADeterministicSignals(documentId, index);
    expect(candidates.length).toBeGreaterThan(0);
    const allSignals = new Set(candidates.flatMap((c) => c.signals));
    expect(allSignals.has("aggregate_ceiling")).toBe(true);
    expect(allSignals.has("shared_cap")).toBe(false);
  });

  it("Pass A emits shared_cap for combined-with relationship language", () => {
    const documentId = "doc-shared";
    const index = indexFor(documentId, sharedPool);
    const candidates = runPassADeterministicSignals(documentId, index);
    const allSignals = new Set(candidates.flatMap((c) => c.signals));
    expect(allSignals.has("shared_cap")).toBe(true);
  });
});
