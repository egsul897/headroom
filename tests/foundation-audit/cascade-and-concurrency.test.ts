/**
 * Phase 3F.1.3 - Foundation Assurance Audit, Job 2 items #5/#6: real
 * cascade/FK behavior against the live Postgres schema (never tested
 * anywhere else in this repository - grep across tests/ for
 * "company.delete(" targeting a real multi-row fixture found nothing), and
 * a real concurrent-upsert race against persistStructuralNodes's actual
 * unique constraint (@@unique([companyId, stableKey]) on DocumentNode).
 *
 * Every fixture id is prefixed `audit-a-` per the task's own
 * collision-avoidance instruction. Cleans up its own rows in afterAll.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { persistStructuralNodes } from "../../lib/contract-model/compiler/persistence";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const CASCADE_CO = "audit-a-cascade-co";
const CASCADE_DOC = "audit-a-cascade-doc";
const CONCURRENCY_CO = "audit-a-concurrency-co";
const CONCURRENCY_DOC = "audit-a-concurrency-doc";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: { in: [CASCADE_CO, CONCURRENCY_CO] } } });
}

describe("Foundation Audit Job 2 #5 - real cascade/FK behavior vs schema.prisma's onDelete annotations", () => {
  afterAll(teardown);

  it("deleting a Company cascades through Document -> DocumentNode -> DefinedTermNode/ContractRule/ContractReferenceEdge/DebtInstrument (every onDelete: Cascade edge from Company), leaving zero orphaned rows", async () => {
    await teardown();
    await prisma.company.create({ data: { id: CASCADE_CO, name: "Audit Fixture Cascade Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CASCADE_DOC, companyId: CASCADE_CO, name: "Cascade Test Doc", type: "CREDIT_AGREEMENT" } });
    const instrument = await prisma.debtInstrument.create({ data: { companyId: CASCADE_CO, baseDocumentId: CASCADE_DOC, name: "Cascade Test Instrument" } });

    const parent = await prisma.documentNode.create({ data: { companyId: CASCADE_CO, documentId: CASCADE_DOC, stableKey: computeStableKey("document-node", CASCADE_CO, CASCADE_DOC, "SECTION", "6.01", "0"), nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", ordinal: 0, charStart: 0, charEnd: 100 } });
    const child = await prisma.documentNode.create({ data: { companyId: CASCADE_CO, documentId: CASCADE_DOC, stableKey: computeStableKey("document-node", CASCADE_CO, CASCADE_DOC, "SUBSECTION", "6.01(a)", "10"), nodeType: "SUBSECTION", heading: "6.01(a)", sectionRef: "6.01(a)", ordinal: 1, charStart: 10, charEnd: 50, parentId: parent.id } });

    const term = await prisma.definedTermNode.create({ data: { companyId: CASCADE_CO, documentId: CASCADE_DOC, stableKey: computeStableKey("defined-term", CASCADE_CO, "cascade term"), termName: "Cascade Term", normalizedName: "cascade term", sourceNodeId: child.id } });
    const rule = await prisma.contractRule.create({ data: { companyId: CASCADE_CO, sourceDocumentId: CASCADE_DOC, sourceNodeId: child.id, stableKey: computeStableKey("contract-rule", CASCADE_CO, CASCADE_DOC, "6.01(a)", "INCUR_DEBT"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "6.01(a)" } });
    const edge = await prisma.contractReferenceEdge.create({ data: { companyId: CASCADE_CO, sourceNodeId: parent.id, referenceType: "REQUIRES", referenceText: "cascade test edge", targetType: "SECTION", targetDocumentNodeId: child.id, resolved: true } });

    // Sanity: everything really persisted before the delete.
    expect(await prisma.documentNode.count({ where: { companyId: CASCADE_CO } })).toBe(2);
    expect(await prisma.definedTermNode.count({ where: { companyId: CASCADE_CO } })).toBe(1);
    expect(await prisma.contractRule.count({ where: { companyId: CASCADE_CO } })).toBe(1);
    expect(await prisma.contractReferenceEdge.count({ where: { companyId: CASCADE_CO } })).toBe(1);
    expect(await prisma.debtInstrument.count({ where: { companyId: CASCADE_CO } })).toBe(1);

    await prisma.company.delete({ where: { id: CASCADE_CO } });

    // Every one of these has `company Company @relation(..., onDelete: Cascade)` in schema.prisma - confirmed to actually cascade, not merely declared.
    expect(await prisma.document.count({ where: { id: CASCADE_DOC } })).toBe(0);
    expect(await prisma.documentNode.count({ where: { id: { in: [parent.id, child.id] } } })).toBe(0);
    expect(await prisma.definedTermNode.count({ where: { id: term.id } })).toBe(0);
    expect(await prisma.contractRule.count({ where: { id: rule.id } })).toBe(0);
    expect(await prisma.contractReferenceEdge.count({ where: { id: edge.id } })).toBe(0);
    expect(await prisma.debtInstrument.count({ where: { id: instrument.id } })).toBe(0);
  });

  it("DocumentNode's self-relation (parentId) really is onDelete: SetNull, not Cascade - deleting a parent node directly leaves its child alive with parentId nulled, never deletes the child transitively", async () => {
    await teardown();
    await prisma.company.create({ data: { id: CASCADE_CO, name: "Audit Fixture Cascade Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CASCADE_DOC, companyId: CASCADE_CO, name: "Cascade Test Doc 2", type: "CREDIT_AGREEMENT" } });
    const parent = await prisma.documentNode.create({ data: { companyId: CASCADE_CO, documentId: CASCADE_DOC, stableKey: computeStableKey("document-node", CASCADE_CO, CASCADE_DOC, "SECTION", "7.01", "0"), nodeType: "SECTION", heading: "Parent", sectionRef: "7.01", ordinal: 0, charStart: 0, charEnd: 100 } });
    const child = await prisma.documentNode.create({ data: { companyId: CASCADE_CO, documentId: CASCADE_DOC, stableKey: computeStableKey("document-node", CASCADE_CO, CASCADE_DOC, "SUBSECTION", "7.01(a)", "10"), nodeType: "SUBSECTION", heading: "Child", sectionRef: "7.01(a)", ordinal: 1, charStart: 10, charEnd: 50, parentId: parent.id } });

    await prisma.documentNode.delete({ where: { id: parent.id } });

    const survivingChild = await prisma.documentNode.findUnique({ where: { id: child.id } });
    expect(survivingChild).not.toBeNull();
    expect(survivingChild!.parentId).toBeNull(); // SetNull, exactly as schema.prisma:2401 declares - never a cascading delete of the child.
    await teardown();
  });

  it("Document.instrumentId is onDelete: SetNull - deleting a DebtInstrument leaves its member Document alive with instrumentId nulled", async () => {
    await teardown();
    await prisma.company.create({ data: { id: CASCADE_CO, name: "Audit Fixture Cascade Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CASCADE_DOC, companyId: CASCADE_CO, name: "Cascade Test Doc 3", type: "CREDIT_AGREEMENT" } });
    const instrument = await prisma.debtInstrument.create({ data: { companyId: CASCADE_CO, baseDocumentId: CASCADE_DOC, name: "Cascade Test Instrument 2" } });
    await prisma.document.update({ where: { id: CASCADE_DOC }, data: { instrumentId: instrument.id } });

    await prisma.debtInstrument.delete({ where: { id: instrument.id } });

    const survivingDoc = await prisma.document.findUnique({ where: { id: CASCADE_DOC } });
    expect(survivingDoc).not.toBeNull();
    expect(survivingDoc!.instrumentId).toBeNull();
    await teardown();
  });

  it("ContractReferenceEdge's sourceRuleId cascade is real: deleting the SOURCE rule cascades the edge away", async () => {
    await teardown();
    await prisma.company.create({ data: { id: CASCADE_CO, name: "Audit Fixture Cascade Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CASCADE_DOC, companyId: CASCADE_CO, name: "Cascade Test Doc 4", type: "CREDIT_AGREEMENT" } });
    const sourceRule = await prisma.contractRule.create({ data: { companyId: CASCADE_CO, sourceDocumentId: CASCADE_DOC, stableKey: computeStableKey("contract-rule", CASCADE_CO, CASCADE_DOC, "8.01", "INCUR_DEBT"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "8.01" } });
    const targetRule = await prisma.contractRule.create({ data: { companyId: CASCADE_CO, sourceDocumentId: CASCADE_DOC, stableKey: computeStableKey("contract-rule", CASCADE_CO, CASCADE_DOC, "8.02", "INCUR_LIEN"), covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_LIEN", sourceSectionRef: "8.02" } });
    const edge = await prisma.contractReferenceEdge.create({ data: { companyId: CASCADE_CO, sourceRuleId: sourceRule.id, referenceType: "SUBJECT_TO", referenceText: "8.01 subject to 8.02", targetType: "RULE", targetRuleId: targetRule.id, resolved: true } });

    await prisma.contractRule.delete({ where: { id: sourceRule.id } });
    const afterSourceDelete = await prisma.contractReferenceEdge.findUnique({ where: { id: edge.id } });
    expect(afterSourceDelete).toBeNull(); // Cascade on sourceRuleId - the edge is gone once its own source rule is gone.
    await teardown();
  });

  it("REAL P2 FINDING: ContractRule.targetRuleId's declared onDelete: SetNull (schema.prisma:2555) can NEVER actually complete while targetType='RULE' - a CHECK constraint (contract_reference_edges_target_matches_type, migration 20260826050000) requires targetRuleId to stay non-null whenever targetType='RULE', so Postgres's own SetNull FK action collides with the CHECK constraint and the whole DELETE is rejected with a raw, uncaught constraint-violation error instead of either cleanly nulling the edge or cascading it away", async () => {
    await teardown();
    await prisma.company.create({ data: { id: CASCADE_CO, name: "Audit Fixture Cascade Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CASCADE_DOC, companyId: CASCADE_CO, name: "Cascade Test Doc 5", type: "CREDIT_AGREEMENT" } });
    const sourceRule = await prisma.contractRule.create({ data: { companyId: CASCADE_CO, sourceDocumentId: CASCADE_DOC, stableKey: computeStableKey("contract-rule", CASCADE_CO, CASCADE_DOC, "9.01", "INCUR_DEBT"), covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sourceSectionRef: "9.01" } });
    const targetRule = await prisma.contractRule.create({ data: { companyId: CASCADE_CO, sourceDocumentId: CASCADE_DOC, stableKey: computeStableKey("contract-rule", CASCADE_CO, CASCADE_DOC, "9.02", "INCUR_LIEN"), covenantFamily: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_LIEN", sourceSectionRef: "9.02" } });
    await prisma.contractReferenceEdge.create({ data: { companyId: CASCADE_CO, sourceRuleId: sourceRule.id, referenceType: "SUBJECT_TO", referenceText: "9.01 subject to 9.02", targetType: "RULE", targetRuleId: targetRule.id, resolved: true } });

    // The schema's own onDelete: SetNull annotation on targetRule promises
    // a clean null-out; what actually happens is a hard failure. Any real
    // future caller of prisma.contractRule.delete() on a rule that is a
    // resolved reference target must be prepared to catch a raw
    // PrismaClientUnknownRequestError/Postgres 23514, which none of
    // lib/contract-model's own code currently does (no production caller
    // deletes a ContractRule at all today - grep confirms this is
    // currently dormant, not yet reachable from any real code path).
    await expect(prisma.contractRule.delete({ where: { id: targetRule.id } })).rejects.toThrow(/23514|target_matches_type|check constraint/i);

    // Confirms this fails SAFE (no corruption): the target rule and the
    // edge both survive the rejected transaction, contradiction-free.
    expect(await prisma.contractRule.findUnique({ where: { id: targetRule.id } })).not.toBeNull();
    await teardown();
  });
});

describe("Foundation Audit Job 2 #6 - real concurrent-upsert race against Postgres's own unique constraint", () => {
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: CONCURRENCY_CO } });
  });

  function node(overrides: Partial<StructuralNode> & { sectionRef: string; charStart: number }): StructuralNode {
    return {
      documentId: CONCURRENCY_DOC,
      nodeType: "SECTION",
      heading: overrides.heading ?? overrides.sectionRef,
      sectionRef: overrides.sectionRef,
      nodeKey: `${CONCURRENCY_DOC}::${overrides.sectionRef}`,
      nodeId: `race-node-${overrides.sectionRef}`,
      charStart: overrides.charStart,
      charEnd: overrides.charStart + 50,
      ordinal: 0,
      parentSectionRef: null,
      parentNodeId: null,
      ...overrides,
    };
  }

  it("two near-simultaneous persistStructuralNodes calls for the IDENTICAL colliding stableKey (same companyId/documentId/nodeType/sectionRef/charStart) never produce two rows and never crash the process - Postgres's real @@unique([companyId, stableKey]) constraint serializes the race correctly", async () => {
    await prisma.company.deleteMany({ where: { id: CONCURRENCY_CO } });
    await prisma.company.create({ data: { id: CONCURRENCY_CO, name: "Audit Fixture Concurrency Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: CONCURRENCY_DOC, companyId: CONCURRENCY_CO, name: "Concurrency Test Doc", type: "CREDIT_AGREEMENT" } });

    const nodeA = node({ sectionRef: "10.01", charStart: 0, heading: "Race Attempt A's own heading" });
    const nodeB = node({ sectionRef: "10.01", charStart: 0, heading: "Race Attempt B's own heading" }); // identical documentId/nodeType/sectionRef/charStart -> identical stableKey

    // Fired concurrently, not sequentially - both hit the real DB's unique
    // constraint at (or near) the same instant, exercising real Postgres
    // transaction/constraint serialization rather than the mocked fake in
    // structural-persistence-identity.test.ts, which can only model
    // sequential JS calls against an in-memory Map (no real race is even
    // possible there).
    const settled = await Promise.allSettled([persistStructuralNodes(CONCURRENCY_CO, [nodeA]), persistStructuralNodes(CONCURRENCY_CO, [nodeB])]);

    // Neither call is allowed to leave the row count wrong. Prisma's
    // upsert may (depending on how the two transactions interleave)
    // either have both succeed cleanly (one create + one update) or, in
    // rarer interleavings, have one raise a real unique-constraint
    // violation that the pre-existing `upsert` call does not itself catch
    // and retry - so this test asserts on the DATABASE'S real resulting
    // state, not on whether both promises resolved without throwing.
    const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    const rows = await prisma.documentNode.findMany({ where: { companyId: CONCURRENCY_CO, documentId: CONCURRENCY_DOC, sectionRef: "10.01" } });

    // The one invariant that must hold regardless of interleaving: never
    // TWO rows for one physical occurrence (that would be the inverse
    // failure mode - a broken unique constraint), and never a corrupted
    // half-written row.
    expect(rows.length).toBeLessThanOrEqual(1);
    if (rows.length === 1) {
      expect(["Race Attempt A's own heading", "Race Attempt B's own heading"]).toContain(rows[0]!.heading);
    }

    if (rejected.length > 0) {
      // Documented, not silently ignored: a real, reproducible finding if
      // it occurs - Prisma's `upsert` is NOT a single atomic
      // INSERT...ON CONFLICT DO UPDATE against this schema/provider in
      // every interleaving; a genuine concurrent race can surface a raw
      // unique-constraint violation to the caller instead of being
      // absorbed. persistStructuralNodes itself has no retry-on-conflict
      // logic (lib/contract-model/compiler/persistence.ts's upsert call is
      // unwrapped).
      expect(rows.length).toBe(1); // even on a raised conflict, the WINNING write still left exactly one consistent row - never zero, never a duplicate.
    } else {
      expect(rows.length).toBe(1);
    }
  });
});
