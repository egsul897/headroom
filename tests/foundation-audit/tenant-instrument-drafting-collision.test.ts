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

  it("REAL FINDING: validateTenantIsolation does NOT check ContractReferenceEdge.targetDocumentNodeId/targetTermId for cross-tenant leakage - a deliberately injected cross-tenant reference to a DocumentNode/DefinedTermNode is silently missed (see lib/contract-model/validators.ts:128-162, which only checks targetRuleId, DocumentRelationshipEdge, and AmendmentEffect)", async () => {
    const termB = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: TENANT_B, normalizedName: "payment conditions" } });
    const nodeB = await prisma.documentNode.findFirstOrThrow({ where: { companyId: TENANT_B, sectionRef: "6.01" } });

    // Deliberately misconfigured: a Tenant A reference edge pointing at Tenant B's own DefinedTermNode and DocumentNode - exactly the cross-tenant leak invariant #19 forbids.
    await prisma.contractReferenceEdge.create({ data: { companyId: TENANT_A, referenceType: "SUBJECT_TO", referenceText: "deliberately cross-tenant (targetTermId)", targetType: "DEFINED_TERM", targetTermId: termB.id, resolved: true } });
    await prisma.contractReferenceEdge.create({ data: { companyId: TENANT_A, referenceType: "SUBJECT_TO", referenceText: "deliberately cross-tenant (targetDocumentNodeId)", targetType: "SECTION", targetDocumentNodeId: nodeB.id, resolved: true } });

    const result = await validateTenantIsolation(TENANT_A, TENANT_B);
    // This is the honest, adversarial result: the validator's own cross-tenant
    // check set (rules, DocumentRelationshipEdge, AmendmentEffect) does not
    // include ContractReferenceEdge.targetTermId/targetDocumentNodeId, so it
    // reports ok:true even though a real cross-tenant leak now exists in the
    // graph. This is the actual, reproduced defect - not a hypothetical.
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);

    // Prove the leak is real and independently queryable: Tenant A's
    // reference graph now genuinely resolves into Tenant B's term/node rows.
    const leakedEdges = await prisma.contractReferenceEdge.findMany({ where: { companyId: TENANT_A, targetTermId: termB.id } });
    expect(leakedEdges.length).toBeGreaterThan(0);
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

  it("P0 REAL FINDING: DefinedTermNode does NOT isolate across instruments in the same company - Facility Beta's 'Payment Conditions' definition silently OVERWRITES Facility Alpha's persisted row (stableKey = computeStableKey('defined-term', companyId, normalizedTerm) has NO documentId/instrument disambiguator - lib/contract-model/compiler/persistence.ts:156/171)", async () => {
    const rows = await prisma.definedTermNode.findMany({ where: { companyId: INSTR_CO, normalizedName: "payment conditions" } });
    // The defect, reproduced: ONE row exists for BOTH facilities' "Payment
    // Conditions" definitions, not two. Contrast with the DocumentNode/
    // ContractRule isolation tests immediately above, which correctly
    // persist two independent rows for the exact same drafting.
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    const sourceNode = await prisma.documentNode.findUniqueOrThrow({ where: { id: row.sourceNodeId! } });

    // The corruption is not merely "one row instead of two" - it is an
    // internally CONTRADICTORY row: `documentId` is frozen at whichever
    // facility ingested FIRST (Alpha, via the upsert's `create` branch),
    // while `sourceNodeId` (the actual citation anchor every real lookup
    // uses - see structural-persistence.test.ts's own established pattern)
    // was silently overwritten to point at whichever facility ingested
    // SECOND (Beta, via the upsert's `update` branch, which touches
    // sourceNodeId/definitionTextRef but never documentId).
    expect(row.documentId).toBe(FACILITY_ALPHA_DOC);
    expect(sourceNode.documentId).toBe(FACILITY_BETA_DOC);
    expect(row.documentId).not.toBe(sourceNode.documentId); // the contradiction itself, made explicit.

    // Concretely: any caller resolving Facility Alpha's own "Payment
    // Conditions" definition (e.g. by joining DefinedTermNode.sourceNodeId
    // -> DocumentNode, the pattern this codebase's own tests already use)
    // silently receives FACILITY BETA'S definition text/anchor instead,
    // with no error, no REVIEW_REQUIRED flag, and no indication anything
    // was lost - a direct violation of invariant #20 ("no debt instrument's
    // ... state may be reachable through another instrument's query path")
    // and, in effect, of invariant #13 (silent wrong-but-confident state).
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
