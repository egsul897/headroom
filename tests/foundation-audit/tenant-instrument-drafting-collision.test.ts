/**
 * Phase 3F.1.3 - Foundation Assurance Audit, Job 1: the required
 * "identical adversarial drafting" attack, run end-to-end against the
 * real Postgres database (no mocks), per docs/HEADROOM-ARCHITECTURE-INVARIANTS.md
 * invariants #19 (tenant isolation) and #20 (instrument isolation).
 *
 * Scenario (exactly as specified): two INDEPENDENTLY-authored documents,
 * each with a Section 6.01 headed "Payment Conditions", a subsection
 * 6.01(a), a defined term "Payment Conditions", and a $100,000,000
 * threshold - built once across two different COMPANIES (tenant-isolation
 * arm) and once across two different DOCUMENTS/DebtInstruments within ONE
 * company (instrument-isolation arm, "Facility Alpha" vs "Facility Beta").
 *
 * This file also directly exercises the real Prisma queries in
 * lib/contract-model/service.ts and lib/contract-model/validators.ts
 * against the collision fixtures above, since those are the real
 * production query paths a future caller would use to retrieve this data.
 *
 * Every fixture id is prefixed `audit-a-` (never colliding with any
 * existing seeded company). Cleans up its own rows in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { persistStructuralNodes, persistStructuralReferences, persistStructuralDefinitions } from "../../lib/contract-model/compiler/persistence";
import { validateTenantIsolation } from "../../lib/contract-model/validators";
import { getRulesByCovenantFamily, getAmendmentsForDocument, getDocumentsForInstrument } from "../../lib/contract-model/service";

// ---------------------------------------------------------------------------
// Fixture identifiers - every one prefixed `audit-a-` per the task's own
// collision-avoidance instruction.
// ---------------------------------------------------------------------------

const TENANT_A = "audit-a-tenant-a-co";
const TENANT_B = "audit-a-tenant-b-co";
const TENANT_A_DOC = "audit-a-tenant-a-doc";
const TENANT_B_DOC = "audit-a-tenant-b-doc";

const INSTR_CO = "audit-a-instrument-co";
const FACILITY_ALPHA_DOC = "audit-a-facility-alpha-doc";
const FACILITY_BETA_DOC = "audit-a-facility-beta-doc";

/**
 * Identical drafting, verbatim, used for BOTH tenants and BOTH facilities:
 * Section 6.01 headed "Payment Conditions", subsection (a), a defined term
 * "Payment Conditions", and a $100,000,000 threshold - exactly the required
 * adversarial scenario.
 */
function draftingText(): string {
  return (
    `SECTION 6.01. Payment Conditions. The Company shall not make any Restricted Payment unless: ` +
    `(a) no Default has occurred and the aggregate amount of all Restricted Payments made in reliance ` +
    `on this Section 6.01(a) does not exceed $100,000,000. ` +
    `"Payment Conditions" means the conditions set forth in this Section 6.01.`
  );
}

async function teardown() {
  await prisma.company.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B, INSTR_CO] } } });
}

/** Runs the real Phase 2A deterministic structural pipeline (parse -> references -> definitions -> persist) for one document, mirroring lib/contract-model/compiler/orchestrator.ts's own call sequence. Also persists one real ContractRule for the INDEBTEDNESS/RESTRICTED_PAYMENTS family under 6.01(a), the same way the task's own tenant-isolation.test.ts constructs its rule fixtures. */
async function ingestDocument(companyId: string, documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodeIndex = await persistStructuralNodes(companyId, nodes);
  const refs = detectStructuralReferences(documentId, text, nodes);
  await persistStructuralReferences(companyId, refs, nodeIndex);
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  await persistStructuralDefinitions(companyId, defs, nodeIndex);
  await prisma.contractRule.create({
    data: {
      companyId,
      sourceDocumentId: documentId,
      stableKey: computeStableKey("contract-rule", companyId, documentId, "6.01(a)", "RESTRICTED_PAYMENT"),
      covenantFamily: "RESTRICTED_PAYMENTS",
      ruleType: "QUANTITATIVE_PERMISSION",
      evaluationClass: "EXECUTABLE",
      action: "RESTRICTED_PAYMENT",
      sourceSectionRef: "6.01(a)",
      thresholdValue: 100_000_000,
      thresholdUnit: "USD",
    },
  });
  return { nodes, nodeIndex, defs };
}

describe("Foundation Audit Job 1 - identical-drafting cross-tenant attack (invariant #19)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: TENANT_A, name: "Audit Fixture Tenant A (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: TENANT_B, name: "Audit Fixture Tenant B (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: TENANT_A_DOC, companyId: TENANT_A, name: "Tenant A Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: TENANT_B_DOC, companyId: TENANT_B, name: "Tenant B Credit Agreement", type: "CREDIT_AGREEMENT" } });
    // Independently created - same drafting, verbatim, no shared authorship.
    await ingestDocument(TENANT_A, TENANT_A_DOC, draftingText());
    await ingestDocument(TENANT_B, TENANT_B_DOC, draftingText());
  });
  afterAll(teardown);

  it("structural retrieval: Tenant A's DocumentNode rows for 6.01/6.01(a) never appear in Tenant B's company-scoped query, despite byte-identical headings/text", async () => {
    const nodesA = await prisma.documentNode.findMany({ where: { companyId: TENANT_A } });
    const nodesB = await prisma.documentNode.findMany({ where: { companyId: TENANT_B } });
    expect(nodesA.length).toBeGreaterThan(0);
    expect(nodesB.length).toBeGreaterThan(0);
    expect(nodesA.every((n) => n.companyId === TENANT_A)).toBe(true);
    expect(nodesB.every((n) => n.companyId === TENANT_B)).toBe(true);
    expect(new Set(nodesA.map((n) => n.id))).not.toEqual(new Set(nodesB.map((n) => n.id)));
    // Both sides really did parse the identical heading/sectionRef - the isolation being tested is real, not trivially true because the text differed.
    expect(nodesA.some((n) => n.sectionRef === "6.01" && n.heading?.includes("Payment Conditions"))).toBe(true);
    expect(nodesB.some((n) => n.sectionRef === "6.01" && n.heading?.includes("Payment Conditions"))).toBe(true);
  });

  it("definitions: Tenant A's 'payment conditions' DefinedTermNode is a completely separate row from Tenant B's, even though normalizedName is byte-identical (stableKey includes companyId)", async () => {
    const termA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: TENANT_A, normalizedName: "payment conditions" } });
    const termB = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: TENANT_B, normalizedName: "payment conditions" } });
    expect(termA.id).not.toBe(termB.id);
    expect(termA.documentId).toBe(TENANT_A_DOC);
    expect(termB.documentId).toBe(TENANT_B_DOC);
    const sourceNodeA = await prisma.documentNode.findUniqueOrThrow({ where: { id: termA.sourceNodeId! } });
    const sourceNodeB = await prisma.documentNode.findUniqueOrThrow({ where: { id: termB.sourceNodeId! } });
    expect(sourceNodeA.documentId).toBe(TENANT_A_DOC);
    expect(sourceNodeB.documentId).toBe(TENANT_B_DOC);
  });

  it("references: Tenant A's ContractReferenceEdge rows for the 6.01(a) self-reference never appear in Tenant B's company-scoped query", async () => {
    const edgesA = await prisma.contractReferenceEdge.findMany({ where: { companyId: TENANT_A } });
    const edgesB = await prisma.contractReferenceEdge.findMany({ where: { companyId: TENANT_B } });
    expect(edgesA.every((e) => e.companyId === TENANT_A)).toBe(true);
    expect(edgesB.every((e) => e.companyId === TENANT_B)).toBe(true);
    const idsA = new Set(edgesA.map((e) => e.id));
    const idsB = new Set(edgesB.map((e) => e.id));
    for (const id of idsA) expect(idsB.has(id)).toBe(false);
  });

  it("rules: getRulesByCovenantFamily(TENANT_A, RESTRICTED_PAYMENTS) never returns Tenant B's identically-thresholded rule", async () => {
    const rulesA = await getRulesByCovenantFamily(TENANT_A, "RESTRICTED_PAYMENTS");
    expect(rulesA).toHaveLength(1);
    expect(rulesA[0]!.companyId).toBe(TENANT_A);
    expect(Number(rulesA[0]!.thresholdValue)).toBe(100_000_000);
    const rulesB = await getRulesByCovenantFamily(TENANT_B, "RESTRICTED_PAYMENTS");
    expect(rulesB).toHaveLength(1);
    expect(rulesB[0]!.companyId).toBe(TENANT_B);
    expect(rulesA[0]!.id).not.toBe(rulesB[0]!.id);
  });

  it("validateTenantIsolation reports clean isolation for these two parallel, unconnected graphs", async () => {
    const result = await validateTenantIsolation(TENANT_A, TENANT_B);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("FIXED (P1-2 remediation): validateTenantIsolation now DOES check ContractReferenceEdge.targetDocumentNodeId/targetTermId for cross-tenant leakage - a deliberately injected cross-tenant reference to a DocumentNode/DefinedTermNode is caught, not silently missed", async () => {
    // Phase 3F.1.4 (P1-2 remediation) updated this test's own assertions:
    // lib/contract-model/validators.ts's validateTenantIsolation now checks
    // ContractReferenceEdge.targetTermId/targetDocumentNodeId (plus
    // targetDocumentId and several AmendmentEffect/DebtInstrument/Document
    // target-direction fields found by this fix's own mechanical schema
    // sweep - see that function's own header comment for the full coverage
    // table). Asserting the leak's continued presence after it has been
    // deliberately fixed would be asserting the wrong thing, not preserving
    // a real safety gate - matching the precedent set by
    // tests/contract-model/architecture-proposal-node-identity.test.ts's own
    // header comment for the same situation. The injected cross-tenant rows
    // themselves are unchanged; only the expected (now correct) outcome is.
    const termB = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: TENANT_B, normalizedName: "payment conditions" } });
    const nodeB = await prisma.documentNode.findFirstOrThrow({ where: { companyId: TENANT_B, sectionRef: "6.01" } });

    // Deliberately misconfigured: a Tenant A reference edge pointing at Tenant B's own DefinedTermNode and DocumentNode - exactly the cross-tenant leak invariant #19 forbids.
    await prisma.contractReferenceEdge.create({ data: { companyId: TENANT_A, referenceType: "SUBJECT_TO", referenceText: "deliberately cross-tenant (targetTermId)", targetType: "DEFINED_TERM", targetTermId: termB.id, resolved: true } });
    await prisma.contractReferenceEdge.create({ data: { companyId: TENANT_A, referenceType: "SUBJECT_TO", referenceText: "deliberately cross-tenant (targetDocumentNodeId)", targetType: "SECTION", targetDocumentNodeId: nodeB.id, resolved: true } });

    const result = await validateTenantIsolation(TENANT_A, TENANT_B);
    // FIXED: the validator now reports this leak - ok:false with issues
    // naming the offending ContractReferenceEdge rows.
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.message.includes("ContractReferenceEdge"))).toBe(true);

    // Prove the leak is real and independently queryable: Tenant A's
    // reference graph now genuinely resolves into Tenant B's term/node rows.
    const leakedEdges = await prisma.contractReferenceEdge.findMany({ where: { companyId: TENANT_A, targetTermId: termB.id } });
    expect(leakedEdges.length).toBeGreaterThan(0);

    // Clean up this test's own injected rows so later tests in this file (which query TENANT_A's full ContractReferenceEdge set) are not polluted by it.
    await prisma.contractReferenceEdge.deleteMany({ where: { companyId: TENANT_A, referenceText: { startsWith: "deliberately cross-tenant" } } });
  });
});

describe("Foundation Audit Job 1 - identical-drafting cross-instrument attack, ONE company (invariant #20)", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: INSTR_CO } });
    await prisma.company.create({ data: { id: INSTR_CO, name: "Audit Fixture Instrument Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: FACILITY_ALPHA_DOC, companyId: INSTR_CO, name: "Facility Alpha Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: FACILITY_BETA_DOC, companyId: INSTR_CO, name: "Facility Beta Credit Agreement", type: "CREDIT_AGREEMENT" } });
    const alphaInstrument = await prisma.debtInstrument.create({ data: { companyId: INSTR_CO, baseDocumentId: FACILITY_ALPHA_DOC, name: "Facility Alpha" } });
    const betaInstrument = await prisma.debtInstrument.create({ data: { companyId: INSTR_CO, baseDocumentId: FACILITY_BETA_DOC, name: "Facility Beta" } });
    await prisma.document.update({ where: { id: FACILITY_ALPHA_DOC }, data: { instrumentId: alphaInstrument.id } });
    await prisma.document.update({ where: { id: FACILITY_BETA_DOC }, data: { instrumentId: betaInstrument.id } });

    // Independently drafted (in the real world, two entirely unrelated debt
    // instruments a company happens to have outstanding at once) - same
    // section number, same heading, same defined term, same $100,000,000
    // threshold, deliberately, per the task's exact adversarial scenario.
    // Facility Alpha ingested FIRST, Facility Beta SECOND (order matters for
    // the collision below).
    await ingestDocument(INSTR_CO, FACILITY_ALPHA_DOC, draftingText());
    await ingestDocument(INSTR_CO, FACILITY_BETA_DOC, draftingText());
  });
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: INSTR_CO } });
  });

  it("DocumentNode isolation HOLDS across instruments: Facility Alpha's and Beta's 6.01/6.01(a) nodes are two genuinely separate rows (stableKey includes documentId+charStart)", async () => {
    const rows601 = await prisma.documentNode.findMany({ where: { companyId: INSTR_CO, sectionRef: "6.01" } });
    expect(rows601).toHaveLength(2);
    expect(new Set(rows601.map((r) => r.documentId))).toEqual(new Set([FACILITY_ALPHA_DOC, FACILITY_BETA_DOC]));
  });

  it("ContractRule isolation HOLDS across instruments: each facility's own $100,000,000 rule under 6.01(a) is a separate row (stableKey includes sourceDocumentId)", async () => {
    const rules = await prisma.contractRule.findMany({ where: { companyId: INSTR_CO, sourceSectionRef: "6.01(a)" } });
    expect(rules).toHaveLength(2);
    expect(new Set(rules.map((r) => r.sourceDocumentId))).toEqual(new Set([FACILITY_ALPHA_DOC, FACILITY_BETA_DOC]));
  });

  // Phase 3F.1.4 (P0-2 remediation) updated this test's own assertions:
  // computeStableKey('defined-term', companyId, documentId, normalizedTerm)
  // now includes documentId (lib/contract-model/compiler/persistence.ts),
  // so DefinedTermNode isolates across instruments exactly the way
  // DocumentNode/ContractRule already correctly did immediately above.
  // Asserting the collision's continued presence after it has been
  // deliberately fixed would be asserting the wrong thing, not preserving a
  // real safety gate - matching the precedent set by
  // tests/contract-model/architecture-proposal-node-identity.test.ts's own
  // header comment for the same situation.
  it("FIXED (P0-2 remediation): DefinedTermNode now DOES isolate across instruments in the same company - Facility Alpha's and Beta's own 'Payment Conditions' definitions are two genuinely separate, internally-consistent rows (stableKey now includes documentId, matching DocumentNode/ContractRule's own disambiguators)", async () => {
    const rows = await prisma.definedTermNode.findMany({ where: { companyId: INSTR_CO, normalizedName: "payment conditions" }, orderBy: { documentId: "asc" } });
    // FIXED: two rows now exist, one per facility - matching the
    // DocumentNode/ContractRule isolation tests immediately above.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([FACILITY_ALPHA_DOC, FACILITY_BETA_DOC]));
    expect(new Set(rows.map((r) => r.id)).size).toBe(2); // two distinct row ids, never one row silently reused across facilities.

    // Each row is now internally CONSISTENT: its own documentId and its own
    // sourceNodeId's documentId always agree - the internal contradiction
    // this test originally documented (documentId frozen at Alpha while
    // sourceNodeId pointed into Beta) is structurally impossible now, since
    // each row belongs to exactly one document by construction.
    for (const row of rows) {
      const sourceNode = await prisma.documentNode.findUniqueOrThrow({ where: { id: row.sourceNodeId! } });
      expect(sourceNode.documentId).toBe(row.documentId);
    }

    // Concretely: a caller resolving Facility Alpha's own "Payment
    // Conditions" definition (e.g. by joining DefinedTermNode.sourceNodeId
    // -> DocumentNode) now genuinely receives FACILITY ALPHA's own
    // definition text/anchor, never Facility Beta's - invariant #20 ("no
    // debt instrument's ... state may be reachable through another
    // instrument's query path") now holds for this model too.
    const alphaRow = rows.find((r) => r.documentId === FACILITY_ALPHA_DOC)!;
    const betaRow = rows.find((r) => r.documentId === FACILITY_BETA_DOC)!;
    expect(alphaRow.id).not.toBe(betaRow.id);
  });

  it("generalized adversarial variant: a THIRD facility ('Facility Gamma', not just Alpha/Beta) also defining 'Payment Conditions' persists as a third genuinely separate row, never colliding with either of the first two", async () => {
    const FACILITY_GAMMA_DOC = "audit-a-facility-gamma-doc";
    await prisma.document.create({ data: { id: FACILITY_GAMMA_DOC, companyId: INSTR_CO, name: "Facility Gamma Credit Agreement", type: "CREDIT_AGREEMENT" } });
    const gammaInstrument = await prisma.debtInstrument.create({ data: { companyId: INSTR_CO, baseDocumentId: FACILITY_GAMMA_DOC, name: "Facility Gamma" } });
    await prisma.document.update({ where: { id: FACILITY_GAMMA_DOC }, data: { instrumentId: gammaInstrument.id } });
    try {
      await ingestDocument(INSTR_CO, FACILITY_GAMMA_DOC, draftingText()); // identical drafting, a THIRD independent facility

      const rows = await prisma.definedTermNode.findMany({ where: { companyId: INSTR_CO, normalizedName: "payment conditions" } });
      expect(rows).toHaveLength(3); // Alpha, Beta, AND Gamma - three genuinely separate rows.
      expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([FACILITY_ALPHA_DOC, FACILITY_BETA_DOC, FACILITY_GAMMA_DOC]));
      expect(new Set(rows.map((r) => r.id)).size).toBe(3);
      for (const row of rows) {
        const sourceNode = await prisma.documentNode.findUniqueOrThrow({ where: { id: row.sourceNodeId! } });
        expect(sourceNode.documentId).toBe(row.documentId); // every row still internally consistent, even at 3 instruments.
      }
    } finally {
      await prisma.contractReferenceEdge.deleteMany({ where: { companyId: INSTR_CO, sourceNode: { documentId: FACILITY_GAMMA_DOC } } });
      await prisma.definedTermNode.deleteMany({ where: { companyId: INSTR_CO, documentId: FACILITY_GAMMA_DOC } });
      await prisma.documentNode.deleteMany({ where: { companyId: INSTR_CO, documentId: FACILITY_GAMMA_DOC } });
      await prisma.contractRule.deleteMany({ where: { companyId: INSTR_CO, sourceDocumentId: FACILITY_GAMMA_DOC } });
      await prisma.debtInstrument.deleteMany({ where: { id: gammaInstrument.id } });
      await prisma.document.deleteMany({ where: { id: FACILITY_GAMMA_DOC } });
    }
  });

  it("query-layer gap: getRulesByCovenantFamily has no instrument-scoping parameter at all - a caller asking for INSTR_CO's RESTRICTED_PAYMENTS rules gets BOTH facilities' $100,000,000 baskets merged into one undifferentiated list", async () => {
    const rules = await getRulesByCovenantFamily(INSTR_CO, "RESTRICTED_PAYMENTS");
    expect(rules).toHaveLength(2);
    expect(new Set(rules.map((r) => r.sourceDocumentId))).toEqual(new Set([FACILITY_ALPHA_DOC, FACILITY_BETA_DOC]));
    // There is no getRulesByCovenantFamily(companyId, family, instrumentId)
    // overload, and ContractRule itself carries no instrumentId/instrumentKey
    // column (only sourceDocumentId) - a caller cannot ask this function for
    // "just Facility Alpha's restricted-payment rules" without re-deriving
    // the document->instrument mapping itself outside this service layer.
  });

  it("query-layer gap: getAmendmentsForDocument/getDocumentsForInstrument take a bare id with NO companyId/tenant parameter at all - documented as an architecture finding, not exploitable today only because Document/DebtInstrument ids are server-generated cuids in production (test fixtures above use explicit ids only for readability)", async () => {
    // Demonstrates the function's own contract: it happily returns a
    // result set scoped ONLY by the id argument's value, with no check that
    // the id even belongs to the company the caller believes it is
    // operating in. Since these ids are unpredictable server-generated
    // cuids in real (non-fixture) rows, this is not exploitable via
    // guessing today - but it is real evidence that these two functions
    // provide zero defense-in-depth of their own; they rely entirely on
    // the caller already having verified the id's tenant ownership
    // upstream, which invariant #19's "under any code path" language does
    // not carve out.
    const alphaMembers = await getDocumentsForInstrument((await prisma.debtInstrument.findFirstOrThrow({ where: { companyId: INSTR_CO, baseDocumentId: FACILITY_ALPHA_DOC } })).id);
    expect(alphaMembers.map((d) => d.id)).toEqual([FACILITY_ALPHA_DOC]);
    const amendments = await getAmendmentsForDocument(FACILITY_ALPHA_DOC);
    expect(amendments).toEqual([]); // no AMENDS edge exists in this fixture - confirms the function runs, not that it is safe.
  });
});

describe("Phase 3F.1.4 (P1-2 remediation) - validateTenantIsolation's mechanical schema-sweep additions: AmendmentEffect.targetRuleId/targetTermId/targetDocumentNodeId, DebtInstrument.baseDocumentId, Document.instrumentId", () => {
  const P2_TENANT_A = "audit-a-p12-tenant-a";
  const P2_TENANT_B = "audit-a-p12-tenant-b";
  const P2_A_DOC = "audit-a-p12-tenant-a-doc";
  const P2_B_DOC = "audit-a-p12-tenant-b-doc";
  const P2_AMEND_DOC_A = "audit-a-p12-tenant-a-amend-doc";

  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [P2_TENANT_A, P2_TENANT_B] } } });
    await prisma.company.create({ data: { id: P2_TENANT_A, name: "P1-2 Fixture Tenant A (test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: P2_TENANT_B, name: "P1-2 Fixture Tenant B (test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: P2_A_DOC, companyId: P2_TENANT_A, name: "Tenant A base doc", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: P2_B_DOC, companyId: P2_TENANT_B, name: "Tenant B base doc", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: P2_AMEND_DOC_A, companyId: P2_TENANT_A, name: "Tenant A amendment doc", type: "AMENDMENT" } });
    const nodesA = parseDocumentStructure({ documentId: P2_A_DOC, label: "CA", text: draftingText() });
    const nodeIndexA = await persistStructuralNodes(P2_TENANT_A, nodesA);
    const nodesB = parseDocumentStructure({ documentId: P2_B_DOC, label: "CA", text: draftingText() });
    const nodeIndexB = await persistStructuralNodes(P2_TENANT_B, nodesB);
    await persistStructuralDefinitions(P2_TENANT_A, detectStructuralDefinitions(P2_A_DOC, draftingText(), nodesA), nodeIndexA);
    await persistStructuralDefinitions(P2_TENANT_B, detectStructuralDefinitions(P2_B_DOC, draftingText(), nodesB), nodeIndexB);
    await prisma.contractRule.create({
      data: {
        companyId: P2_TENANT_B,
        sourceDocumentId: P2_B_DOC,
        stableKey: computeStableKey("contract-rule", P2_TENANT_B, P2_B_DOC, "6.01(a)", "RESTRICTED_PAYMENT"),
        covenantFamily: "RESTRICTED_PAYMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        evaluationClass: "EXECUTABLE",
        action: "RESTRICTED_PAYMENT",
        sourceSectionRef: "6.01(a)",
        thresholdValue: 100_000_000,
        thresholdUnit: "USD",
      },
    });
  });
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [P2_TENANT_A, P2_TENANT_B] } } });
  });

  it("positive control: with no cross-tenant edges injected, validateTenantIsolation reports clean isolation for this fixture", async () => {
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("FIXED: AmendmentEffect.targetTermId pointing at Company B's own DefinedTermNode is now caught (previously unchecked - not one of the two fields the audit happened to name, found by this fix's own mechanical sweep)", async () => {
    const termB = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: P2_TENANT_B, normalizedName: "payment conditions" } });
    await prisma.amendmentEffect.create({ data: { companyId: P2_TENANT_A, amendmentDocumentId: P2_AMEND_DOC_A, effectType: "MODIFY_DEFINITION", description: "deliberately cross-tenant (targetTermId)", targetTermId: termB.id } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("AmendmentEffect"))).toBe(true);
    await prisma.amendmentEffect.deleteMany({ where: { companyId: P2_TENANT_A, description: { startsWith: "deliberately cross-tenant" } } });
  });

  it("FIXED: AmendmentEffect.targetDocumentNodeId pointing at Company B's own DocumentNode is now caught", async () => {
    const nodeB = await prisma.documentNode.findFirstOrThrow({ where: { companyId: P2_TENANT_B, sectionRef: "6.01" } });
    await prisma.amendmentEffect.create({ data: { companyId: P2_TENANT_A, amendmentDocumentId: P2_AMEND_DOC_A, effectType: "REPLACE_TEXT", description: "deliberately cross-tenant (targetDocumentNodeId)", targetDocumentNodeId: nodeB.id } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("AmendmentEffect"))).toBe(true);
    await prisma.amendmentEffect.deleteMany({ where: { companyId: P2_TENANT_A, description: { startsWith: "deliberately cross-tenant" } } });
  });

  it("FIXED: AmendmentEffect.targetRuleId pointing at Company B's own ContractRule is now caught", async () => {
    const ruleB = await prisma.contractRule.findFirstOrThrow({ where: { companyId: P2_TENANT_B } });
    await prisma.amendmentEffect.create({ data: { companyId: P2_TENANT_A, amendmentDocumentId: P2_AMEND_DOC_A, effectType: "MODIFY_THRESHOLD", description: "deliberately cross-tenant (targetRuleId)", targetRuleId: ruleB.id } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("AmendmentEffect"))).toBe(true);
    await prisma.amendmentEffect.deleteMany({ where: { companyId: P2_TENANT_A, description: { startsWith: "deliberately cross-tenant" } } });
  });

  it("FIXED: ContractReferenceEdge.targetDocumentId pointing at Company B's own Document is now caught (the third target-direction field on this model, found by this fix's own mechanical sweep alongside the two the audit named)", async () => {
    await prisma.contractReferenceEdge.create({ data: { companyId: P2_TENANT_A, referenceType: "SUBJECT_TO", referenceText: "deliberately cross-tenant (targetDocumentId)", targetType: "DOCUMENT", targetDocumentId: P2_B_DOC, resolved: true } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("ContractReferenceEdge"))).toBe(true);
    await prisma.contractReferenceEdge.deleteMany({ where: { companyId: P2_TENANT_A, referenceText: { startsWith: "deliberately cross-tenant" } } });
  });

  it("FIXED: DebtInstrument.baseDocumentId pointing at Company B's own Document is now caught", async () => {
    await prisma.debtInstrument.create({ data: { companyId: P2_TENANT_A, baseDocumentId: P2_B_DOC, name: "deliberately cross-tenant instrument" } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("DebtInstrument"))).toBe(true);
    await prisma.debtInstrument.deleteMany({ where: { companyId: P2_TENANT_A, name: "deliberately cross-tenant instrument" } });
  });

  it("FIXED: Document.instrumentId pointing at Company B's own DebtInstrument is now caught", async () => {
    const instrumentB = await prisma.debtInstrument.create({ data: { companyId: P2_TENANT_B, name: "Tenant B's own instrument" } });
    await prisma.document.update({ where: { id: P2_AMEND_DOC_A }, data: { instrumentId: instrumentB.id } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Document"))).toBe(true);
    await prisma.document.update({ where: { id: P2_AMEND_DOC_A }, data: { instrumentId: null } });
    await prisma.debtInstrument.deleteMany({ where: { id: instrumentB.id } });
  });

  it("negative control: a LEGITIMATE same-tenant AmendmentEffect (targeting Company A's OWN rule/term/node) is never flagged", async () => {
    const termA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: P2_TENANT_A, normalizedName: "payment conditions" } });
    await prisma.amendmentEffect.create({ data: { companyId: P2_TENANT_A, amendmentDocumentId: P2_AMEND_DOC_A, effectType: "MODIFY_DEFINITION", description: "legitimate same-tenant effect", targetTermId: termA.id } });
    const result = await validateTenantIsolation(P2_TENANT_A, P2_TENANT_B);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    await prisma.amendmentEffect.deleteMany({ where: { companyId: P2_TENANT_A, description: "legitimate same-tenant effect" } });
  });
});
