/**
 * Phase 3F.1.2 - deterministic, DB-independent persistence-layer identity
 * tests for lib/contract-model/compiler/persistence.ts.
 *
 * DISCLOSED LIMITATION: this environment has no reachable Postgres instance
 * (`npx prisma db pull` fails with P1001 - connection refused to
 * localhost:5432), so the real round-trip coverage in
 * tests/contract-model/structural-persistence.test.ts (which exercises the
 * genuine Prisma client against a real test database and remains the
 * authoritative persistence test for any environment where a DB IS
 * reachable, e.g. CI) could not be executed as part of this remediation.
 * This file is NOT a replacement for that real-DB coverage - it is the
 * strongest DETERMINISTIC substitute available without one: a hand-rolled
 * in-memory fake standing in for `../../lib/prisma`'s `documentNode`
 * surface, reproducing the real unique-constraint semantics
 * (`@@unique([companyId, stableKey])`) that persistence.ts's own upsert
 * calls depend on. It specifically targets the ONE confirmed DB-level
 * defect this phase fixes (docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md
 * §2.4): persistStructuralNodes' stableKey formula previously omitted
 * charStart, so two distinct physical occurrences sharing
 * (companyId, documentId, nodeType, sectionRef) collided onto the SAME
 * unique-constrained row and the second upsert's `update` branch silently
 * overwrote the first occurrence's persisted fields. Never claims to prove
 * anything about real Postgres transaction semantics, constraint
 * enforcement, or concurrent-write behavior - only about the JS-level
 * stableKey/PersistedNodeIndex logic this fake can faithfully model.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import { computeStableKey } from "../../lib/contract-model/stable-keys";

interface FakeDocumentNodeRow {
  id: string;
  companyId: string;
  documentId: string;
  stableKey: string;
  nodeType: string;
  heading: string;
  sectionRef: string;
  ordinal: number;
  charStart: number;
  charEnd: number;
  parentId: string | null;
}

const state = vi.hoisted(() => ({
  documentNodeRows: new Map<string, FakeDocumentNodeRow>(),
  nextId: 1,
  upsertCallCount: 0,
}));

vi.mock("../../lib/prisma", () => {
  function findByCompanyStableKey(companyId: string, stableKey: string): FakeDocumentNodeRow | undefined {
    return [...state.documentNodeRows.values()].find((r) => r.companyId === companyId && r.stableKey === stableKey);
  }
  const documentNode = {
    upsert: vi.fn(async ({ where, create, update }: { where: { companyId_stableKey: { companyId: string; stableKey: string } }; create: Omit<FakeDocumentNodeRow, "id" | "parentId">; update: Partial<FakeDocumentNodeRow> }) => {
      state.upsertCallCount++;
      const { companyId, stableKey } = where.companyId_stableKey;
      const existing = findByCompanyStableKey(companyId, stableKey);
      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }
      const row: FakeDocumentNodeRow = { id: `node-${state.nextId++}`, parentId: null, ...create };
      state.documentNodeRows.set(row.id, row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeDocumentNodeRow> }) => {
      const row = state.documentNodeRows.get(where.id);
      if (!row) throw new Error(`fake documentNode.update: no row with id ${where.id}`);
      Object.assign(row, data);
      return { ...row };
    }),
    findMany: vi.fn(async ({ where }: { where: { companyId: string; documentId?: string; sectionRef?: string } }) => {
      return [...state.documentNodeRows.values()].filter((r) => r.companyId === where.companyId && (where.documentId === undefined || r.documentId === where.documentId) && (where.sectionRef === undefined || r.sectionRef === where.sectionRef));
    }),
  };
  return { prisma: { documentNode } };
});

// Imported AFTER vi.mock so persistence.ts picks up the faked prisma module.
const { persistStructuralNodes, resolveUniquePersistedNodeByRef } = await import("../../lib/contract-model/compiler/persistence");
const { prisma: fakePrisma } = await import("../../lib/prisma");

function node(overrides: Partial<StructuralNode> & { documentId: string; nodeType: StructuralNode["nodeType"]; sectionRef: string; charStart: number; charEnd: number }): StructuralNode {
  return {
    documentId: overrides.documentId,
    nodeType: overrides.nodeType,
    heading: overrides.heading ?? overrides.sectionRef,
    sectionRef: overrides.sectionRef,
    nodeKey: overrides.nodeKey ?? `${overrides.documentId}::${overrides.sectionRef}`,
    nodeId: overrides.nodeId ?? computeStableKey("structural-node", overrides.documentId, overrides.nodeType, String(overrides.charStart)),
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    ordinal: overrides.ordinal ?? 0,
    parentSectionRef: overrides.parentSectionRef ?? null,
    parentNodeId: overrides.parentNodeId ?? null,
  };
}

const COMPANY = "fake-company";

beforeEach(() => {
  state.documentNodeRows.clear();
  state.nextId = 1;
  state.upsertCallCount = 0;
  vi.clearAllMocks();
});

describe("persistStructuralNodes - stableKey now includes charStart (the confirmed DB-level collision fix)", () => {
  it("two distinct physical occurrences sharing (documentId, nodeType, sectionRef) persist as TWO distinct rows, not one silently overwritten", async () => {
    const a = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.04", charStart: 100, charEnd: 200, heading: "First physical occurrence" });
    const b = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.04", charStart: 900, charEnd: 1000, heading: "Second physical occurrence" });
    const nodeIndex = await persistStructuralNodes(COMPANY, [a, b]);

    expect(nodeIndex.idByNodeId.get(a.nodeId)).toBeDefined();
    expect(nodeIndex.idByNodeId.get(b.nodeId)).toBeDefined();
    expect(nodeIndex.idByNodeId.get(a.nodeId)).not.toBe(nodeIndex.idByNodeId.get(b.nodeId)); // I1 preserved at the DB layer.

    const rows = await fakePrisma.documentNode.findMany({ where: { companyId: COMPANY, documentId: "doc-1", sectionRef: "6.04" } });
    expect(rows).toHaveLength(2); // pre-3F.1.2 this would have been 1 (silent overwrite).
    expect(new Set(rows.map((r) => r.heading))).toEqual(new Set(["First physical occurrence", "Second physical occurrence"])); // the first occurrence's own fields were never clobbered.
  });

  it("idsByLegalRef carries BOTH persisted row ids for a shared legal reference, never collapsed to one", async () => {
    const a = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.04", charStart: 100, charEnd: 200 });
    const b = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.04", charStart: 900, charEnd: 1000 });
    const nodeIndex = await persistStructuralNodes(COMPANY, [a, b]);
    const candidates = nodeIndex.idsByLegalRef.get("doc-1::6.04");
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates)).toEqual(new Set([nodeIndex.idByNodeId.get(a.nodeId), nodeIndex.idByNodeId.get(b.nodeId)]));
  });

  it("resolveUniquePersistedNodeByRef returns undefined (never an arbitrary pick) when the persisted legal reference is ambiguous", async () => {
    const a = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.04", charStart: 100, charEnd: 200 });
    const b = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.04", charStart: 900, charEnd: 1000 });
    const nodeIndex = await persistStructuralNodes(COMPANY, [a, b]);
    expect(resolveUniquePersistedNodeByRef(nodeIndex, "doc-1", "6.04")).toBeUndefined();
  });

  it("resolveUniquePersistedNodeByRef returns the real row id for an unambiguous legal reference", async () => {
    const a = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.01", charStart: 100, charEnd: 200 });
    const nodeIndex = await persistStructuralNodes(COMPANY, [a]);
    expect(resolveUniquePersistedNodeByRef(nodeIndex, "doc-1", "6.01")).toBe(nodeIndex.idByNodeId.get(a.nodeId));
  });

  it("parent linking uses the real parentNodeId (physical occurrence), correctly attaching a child to the SPECIFIC same-labeled parent it actually belongs to", async () => {
    const parentA = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.06", charStart: 0, charEnd: 400 });
    const parentB = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.06", charStart: 500, charEnd: 900 }); // same label, different physical occurrence.
    const childOfB = node({ documentId: "doc-1", nodeType: "SUBSECTION", sectionRef: "6.06(a)", charStart: 550, charEnd: 560, parentNodeId: parentB.nodeId });
    const nodeIndex = await persistStructuralNodes(COMPANY, [parentA, parentB, childOfB]);

    const rows = await fakePrisma.documentNode.findMany({ where: { companyId: COMPANY, documentId: "doc-1" } });
    const persistedChild = rows.find((r) => r.id === nodeIndex.idByNodeId.get(childOfB.nodeId))!;
    expect(persistedChild.parentId).toBe(nodeIndex.idByNodeId.get(parentB.nodeId)); // the SPECIFIC physical parent, not an arbitrary same-labeled one.
    expect(persistedChild.parentId).not.toBe(nodeIndex.idByNodeId.get(parentA.nodeId));
  });

  it("idempotent replay: persisting the identical node set twice never duplicates rows and preserves the same nodeId->id mapping", async () => {
    const a = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.01", charStart: 100, charEnd: 200 });
    const first = await persistStructuralNodes(COMPANY, [a]);
    const countAfterFirst = (await fakePrisma.documentNode.findMany({ where: { companyId: COMPANY, documentId: "doc-1" } })).length;
    const second = await persistStructuralNodes(COMPANY, [a]);
    const countAfterSecond = (await fakePrisma.documentNode.findMany({ where: { companyId: COMPANY, documentId: "doc-1" } })).length;
    expect(countAfterSecond).toBe(countAfterFirst);
    expect(second.idByNodeId.get(a.nodeId)).toBe(first.idByNodeId.get(a.nodeId));
  });

  it("document isolation: two documents in the same company sharing an identical section number and charStart never collide (documentId is part of the stableKey)", async () => {
    const a = node({ documentId: "doc-1", nodeType: "SECTION", sectionRef: "6.01", charStart: 100, charEnd: 200 });
    const b = node({ documentId: "doc-2", nodeType: "SECTION", sectionRef: "6.01", charStart: 100, charEnd: 200 }); // identical type+charStart+sectionRef, different document.
    const nodeIndex = await persistStructuralNodes(COMPANY, [a, b]);
    expect(nodeIndex.idByNodeId.get(a.nodeId)).not.toBe(nodeIndex.idByNodeId.get(b.nodeId));
    const rows = await fakePrisma.documentNode.findMany({ where: { companyId: COMPANY } });
    expect(rows).toHaveLength(2);
  });
});
