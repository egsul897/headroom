/**
 * Phase 3F.1.3 - Foundation Assurance Audit, Job 2 item #4 (the specific
 * gap this test closes): tests/contract-model/structural-persistence.test.ts
 * (the real-DB suite) proves document-level and company-level isolation
 * against real Postgres, but none of its 7 cases reproduce the EXACT
 * defect Phase 3F.1.2 fixed - TWO PHYSICALLY DISTINCT occurrences of the
 * SAME section label WITHIN ONE document (only
 * tests/contract-model/structural-persistence-identity.test.ts's mocked
 * fake proves that, per its own "two distinct physical occurrences sharing
 * (documentId, nodeType, sectionRef) persist as TWO distinct rows" case).
 * This is the missing real-DB equivalent of that exact mocked case,
 * against the genuine `@@unique([companyId, stableKey])` constraint.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { persistStructuralNodes } from "../../lib/contract-model/compiler/persistence";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const COMPANY = "audit-a-dup-occurrence-co";
const DOC = "audit-a-dup-occurrence-doc";

function node(overrides: Partial<StructuralNode> & { sectionRef: string; charStart: number; heading: string }): StructuralNode {
  return {
    documentId: DOC,
    nodeType: "SECTION",
    sectionRef: overrides.sectionRef,
    heading: overrides.heading,
    nodeKey: `${DOC}::${overrides.sectionRef}`,
    nodeId: `dup-occ-${overrides.heading.replace(/\s+/g, "-")}`,
    charStart: overrides.charStart,
    charEnd: overrides.charStart + 100,
    ordinal: 0,
    parentSectionRef: null,
    parentNodeId: null,
    ...overrides,
  };
}

describe("Foundation Audit Job 2 #4 - real-Postgres proof of the exact Phase 3F.1.2 defect scenario (missing from structural-persistence.test.ts)", () => {
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: COMPANY } });
  });

  it("two physically distinct occurrences sharing the identical (documentId, nodeType, sectionRef) label, in the SAME document, persist as TWO real DB rows against the genuine unique constraint - not one silently overwritten (the real-DB analogue of structural-persistence-identity.test.ts's mocked case)", async () => {
    await prisma.company.deleteMany({ where: { id: COMPANY } });
    await prisma.company.create({ data: { id: COMPANY, name: "Audit Fixture Duplicate-Occurrence Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOC, companyId: COMPANY, name: "Duplicate Occurrence Doc", type: "CREDIT_AGREEMENT" } });

    // A real, disclosed-as-normal drafting reality (per the Phase 3F.1.2
    // ADR's own I2 finding): a cross-reference sentence or malformed
    // renumbering can produce TWO physically distinct "SECTION 6.04"
    // occurrences in one document.
    const first = node({ sectionRef: "6.04", charStart: 0, heading: "First physical occurrence of 6.04" });
    const second = node({ sectionRef: "6.04", charStart: 5000, heading: "Second physical occurrence of 6.04" });

    const nodeIndex = await persistStructuralNodes(COMPANY, [first, second]);
    expect(nodeIndex.idByNodeId.get(first.nodeId)).not.toBe(nodeIndex.idByNodeId.get(second.nodeId));

    const rows = await prisma.documentNode.findMany({ where: { companyId: COMPANY, documentId: DOC, sectionRef: "6.04" } });
    // Pre-3F.1.2 (stableKey without charStart), this would be 1 row with
    // whichever heading upserted LAST silently winning. Against the real
    // unique constraint, it is genuinely 2.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.heading))).toEqual(new Set(["First physical occurrence of 6.04", "Second physical occurrence of 6.04"]));

    await prisma.company.deleteMany({ where: { id: COMPANY } });
  });
});
