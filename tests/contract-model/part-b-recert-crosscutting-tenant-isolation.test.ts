/**
 * Phase 3F.1.6.RX Part B (Auditor 8 - cross-cutting recertification).
 *
 * Independent, fresh adversarial test (not a rerun of any Workstream H
 * test) proving tenant isolation for the two NEW tables this phase's
 * Workstream H added that carry the most safety-critical, cross-company
 * exposure risk: SemanticTruthRecord (the durable "trusted contract truth"
 * store, AUDIT-F1) and AnalysisRunIssue (the durable per-instrument-failure
 * store, AUDIT-F3).
 *
 * The adversarial construction: two independent, synthetic companies each
 * produce a row whose NON-TENANT key columns are BYTE-IDENTICAL strings
 * (same instrumentKey, same SemanticTruthKind, same semanticObjectId /
 * same runId-shaped instrumentKey collision for AnalysisRunIssue) —
 * deliberately defeating any isolation that relied on those values being
 * globally unique in practice. IRRule.ruleId's own doc comment
 * (lib/contract-model/ir/types.ts) claims it is "derived from
 * companyId+instrumentKey+sourceSectionRef+a discriminator" — this test
 * does NOT trust that claim; it constructs the collision directly at the
 * SemanticTruthRecord persistence layer so isolation is proven by the
 * table's own companyId column and the service functions' own query
 * filters, not by an upstream identity-derivation promise this test cannot
 * see the internals of.
 *
 * Covers both the WRITE path (persistSemanticTruthForInstrument's own
 * upsert-by-companyId-scoped-key; recordAnalysisRunIssue's own upsert) and
 * the READ path (getTrustedSemanticTruth / getAllSemanticTruthForInstrument
 * / getAnalysisRunIssues).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { persistSemanticTruthForInstrument, getTrustedSemanticTruth, getAllSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { recordAnalysisRunIssue, getAnalysisRunIssues } from "../../lib/contract-model/analysis/service";
import type { IRMoneyLiteral, IRRule, SourceProvenance } from "../../lib/contract-model/ir/types";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";

const COMPANY_X = "part-b-recert-crosscutting-tenant-x";
const COMPANY_Y = "part-b-recert-crosscutting-tenant-y";
const DOC_X = "part-b-recert-crosscutting-tenant-x-doc";
const DOC_Y = "part-b-recert-crosscutting-tenant-y-doc";

// Deliberately identical across both companies - the whole point of the test.
const COLLIDING_INSTRUMENT_KEY = "shared-instrument-key-collision";
const COLLIDING_RULE_ID = "shared-rule-id-collision-not-company-namespaced";

function makeRule(companyId: string, sourceDocumentId: string, capacityAmount: number): IRRule {
  const provenance: SourceProvenance = { documentId: sourceDocumentId, sourceNodeKey: null, sourceCitation: `${sourceDocumentId}::6.01`, excerpt: `synthetic excerpt for ${companyId}` };
  return {
    ruleId: COLLIDING_RULE_ID, // <-- the forced collision
    irSchemaVersion: IR_SCHEMA_VERSION,
    companyId,
    instrumentKey: COLLIDING_INSTRUMENT_KEY, // <-- the forced collision
    sourceDocumentId,
    sourceSectionRef: "6.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: { exprId: "expr-1", kind: "MONEY", type: "MONEY", amount: capacityAmount, currency: "USD" },
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance,
    compilerVersion: "test-v1",
    sourceContentVersion: null,
  };
}

async function cleanup() {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: { in: [COMPANY_X, COMPANY_Y] } } });
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: { in: [COMPANY_X, COMPANY_Y] } } });
  await prisma.analysisRun.deleteMany({ where: { companyId: { in: [COMPANY_X, COMPANY_Y] } } });
  await prisma.document.deleteMany({ where: { companyId: { in: [COMPANY_X, COMPANY_Y] } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_X, COMPANY_Y] } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.company.createMany({ data: [{ id: COMPANY_X, name: "Tenant X" }, { id: COMPANY_Y, name: "Tenant Y" }] });
  await prisma.document.createMany({
    data: [
      { id: DOC_X, companyId: COMPANY_X, name: "Tenant X doc", type: "CREDIT_AGREEMENT" },
      { id: DOC_Y, companyId: COMPANY_Y, name: "Tenant Y doc", type: "CREDIT_AGREEMENT" },
    ],
  });
});

afterAll(cleanup);

describe("Part B cross-cutting recertification: tenant isolation under colliding non-tenant-key values", () => {
  describe("SemanticTruthRecord (AUDIT-F1)", () => {
    it("WRITE path: persistSemanticTruthForInstrument for two companies with the identical instrumentKey+ruleId does not error and does not cross-write", async () => {
      const ruleX = makeRule(COMPANY_X, DOC_X, 10_000_000);
      const ruleY = makeRule(COMPANY_Y, DOC_Y, 99_000_000); // different content, same identity-key fields

      // Both companies persist a rule under the EXACT same instrumentKey+kind+semanticObjectId (ruleId).
      // If tenant isolation were broken (e.g. the upsert's WHERE key omitted companyId), the second
      // call would silently overwrite the first company's row instead of creating a distinct one.
      const summaryX = await persistSemanticTruthForInstrument({
        companyId: COMPANY_X,
        packageKey: "test-pkg",
        instrumentKey: COLLIDING_INSTRUMENT_KEY,
        analysisRunId: null,
        objects: [{ kind: "RULE", object: ruleX, candidateRef: null, compilerVersions: { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "v1", compilerPromptVersion: "v1", toolPolicyVersion: "v1" }, verification: null, verifierPromptVersion: null }],
      });
      const summaryY = await persistSemanticTruthForInstrument({
        companyId: COMPANY_Y,
        packageKey: "test-pkg",
        instrumentKey: COLLIDING_INSTRUMENT_KEY,
        analysisRunId: null,
        objects: [{ kind: "RULE", object: ruleY, candidateRef: null, compilerVersions: { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "v1", compilerPromptVersion: "v1", toolPolicyVersion: "v1" }, verification: null, verifierPromptVersion: null }],
      });

      expect(summaryX.upserted).toBe(1);
      expect(summaryY.upserted).toBe(1); // NOT "unchanged" - proves this was a genuine second CREATE, not an update-in-place of X's row.

      const rowsX = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_X, instrumentKey: COLLIDING_INSTRUMENT_KEY, semanticObjectId: COLLIDING_RULE_ID } });
      const rowsY = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_Y, instrumentKey: COLLIDING_INSTRUMENT_KEY, semanticObjectId: COLLIDING_RULE_ID } });
      expect(rowsX).toHaveLength(1);
      expect(rowsY).toHaveLength(1);
      expect(rowsX[0]!.id).not.toBe(rowsY[0]!.id);
      const payloadX = rowsX[0]!.payload as unknown as IRRule;
      const payloadY = rowsY[0]!.payload as unknown as IRRule;
      expect((payloadX.capacityExpression as IRMoneyLiteral | null)?.amount).toBe(10_000_000);
      expect((payloadY.capacityExpression as IRMoneyLiteral | null)?.amount).toBe(99_000_000);
    });

    it("READ path: getTrustedSemanticTruth/getAllSemanticTruthForInstrument never returns the other tenant's colliding row", async () => {
      // trustStatus defaults to COMPILED here (no verification supplied) - force one VERIFIED for the getTrustedSemanticTruth check.
      await prisma.semanticTruthRecord.updateMany({ where: { companyId: COMPANY_X, instrumentKey: COLLIDING_INSTRUMENT_KEY }, data: { trustStatus: "VERIFIED" } });
      await prisma.semanticTruthRecord.updateMany({ where: { companyId: COMPANY_Y, instrumentKey: COLLIDING_INSTRUMENT_KEY }, data: { trustStatus: "VERIFIED" } });

      const trustedX = await getTrustedSemanticTruth(COMPANY_X, COLLIDING_INSTRUMENT_KEY);
      const trustedY = await getTrustedSemanticTruth(COMPANY_Y, COLLIDING_INSTRUMENT_KEY);
      expect(trustedX).toHaveLength(1);
      expect(trustedY).toHaveLength(1);
      expect(trustedX[0]!.companyId).toBe(COMPANY_X);
      expect(trustedY[0]!.companyId).toBe(COMPANY_Y);
      expect((trustedX[0]!.payload as unknown as IRRule).sourceDocumentId).toBe(DOC_X);
      expect((trustedY[0]!.payload as unknown as IRRule).sourceDocumentId).toBe(DOC_Y);

      const allX = await getAllSemanticTruthForInstrument(COMPANY_X, COLLIDING_INSTRUMENT_KEY);
      const allY = await getAllSemanticTruthForInstrument(COMPANY_Y, COLLIDING_INSTRUMENT_KEY);
      expect(allX.every((r) => r.companyId === COMPANY_X)).toBe(true);
      expect(allY.every((r) => r.companyId === COMPANY_Y)).toBe(true);
    });

    it("the DB-level @@unique constraint is scoped to include companyId, not a bare (instrumentKey, kind, semanticObjectId) global key", async () => {
      // Direct proof independent of the service layer: a raw prisma.create with the identical
      // (instrumentKey, kind, semanticObjectId) under a THIRD company must succeed (no unique
      // violation), confirming companyId is part of the real unique index, not merely convention.
      const COMPANY_Z = "part-b-recert-crosscutting-tenant-z";
      await prisma.company.deleteMany({ where: { id: COMPANY_Z } });
      await prisma.company.create({ data: { id: COMPANY_Z, name: "Tenant Z" } });
      try {
        await expect(
          prisma.semanticTruthRecord.create({
            data: {
              companyId: COMPANY_Z,
              instrumentKey: COLLIDING_INSTRUMENT_KEY,
              kind: "RULE",
              semanticObjectId: COLLIDING_RULE_ID,
              sourceDocumentId: DOC_X,
              irSchemaVersion: IR_SCHEMA_VERSION,
              compilerAlgorithmVersion: "v1",
              compilerPromptVersion: "v1",
              toolPolicyVersion: "v1",
              trustStatus: "COMPILED",
              sufficiency: "COMPLETE",
              sufficiencyReasons: [],
              payloadSchemaVersion: IR_SCHEMA_VERSION,
              payload: { synthetic: true },
              contentHash: "z-hash",
            },
          }),
        ).resolves.toBeDefined();
      } finally {
        await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_Z } });
        await prisma.company.deleteMany({ where: { id: COMPANY_Z } });
      }
    });
  });

  describe("AnalysisRunIssue (AUDIT-F3)", () => {
    it("WRITE + READ path: two companies' runs sharing the same instrumentKey never leak issues across tenants", async () => {
      const runX = await prisma.analysisRun.create({ data: { companyId: COMPANY_X, packageKey: "pkg-x", documentIds: [DOC_X], analysisAlgorithmVersion: "v1", status: "RUNNING" } });
      const runY = await prisma.analysisRun.create({ data: { companyId: COMPANY_Y, packageKey: "pkg-y", documentIds: [DOC_Y], analysisAlgorithmVersion: "v1", status: "RUNNING" } });

      // Same instrumentKey string on both runs - runId itself cannot collide (globally unique cuid),
      // but this proves recordAnalysisRunIssue/getAnalysisRunIssues do not accidentally widen their
      // filter to instrumentKey alone anywhere in the call chain.
      await recordAnalysisRunIssue({ runId: runX.id, companyId: COMPANY_X, instrumentKey: COLLIDING_INSTRUMENT_KEY, documentIds: [DOC_X], failedStage: "SEMANTIC_COMPILE", errorClass: "TestError", message: "tenant X failure" });
      await recordAnalysisRunIssue({ runId: runY.id, companyId: COMPANY_Y, instrumentKey: COLLIDING_INSTRUMENT_KEY, documentIds: [DOC_Y], failedStage: "SEMANTIC_COMPILE", errorClass: "TestError", message: "tenant Y failure" });

      const issuesX = await getAnalysisRunIssues(runX.id);
      const issuesY = await getAnalysisRunIssues(runY.id);
      expect(issuesX).toHaveLength(1);
      expect(issuesY).toHaveLength(1);
      expect(issuesX[0]!.companyId).toBe(COMPANY_X);
      expect(issuesX[0]!.message).toBe("tenant X failure");
      expect(issuesY[0]!.companyId).toBe(COMPANY_Y);
      expect(issuesY[0]!.message).toBe("tenant Y failure");

      // Direct DB-level cross-check: querying ClaimReviewItem-style by instrumentKey+companyId only
      // ever returns that company's own row, even though instrumentKey collides.
      const crossCheckX = await prisma.analysisRunIssue.findMany({ where: { companyId: COMPANY_X, instrumentKey: COLLIDING_INSTRUMENT_KEY } });
      const crossCheckY = await prisma.analysisRunIssue.findMany({ where: { companyId: COMPANY_Y, instrumentKey: COLLIDING_INSTRUMENT_KEY } });
      expect(crossCheckX).toHaveLength(1);
      expect(crossCheckX[0]!.runId).toBe(runX.id);
      expect(crossCheckY).toHaveLength(1);
      expect(crossCheckY[0]!.runId).toBe(runY.id);
    });

    it("DISCLOSED (defense-in-depth observation, not a live defect): getAnalysisRunIssues(runId)/getSemanticTruthForRun(analysisRunId) are NOT themselves companyId-scoped - they trust a real, already-tenant-verified runId/analysisRunId from the caller. Confirms this is safe ONLY because both of this repo's real call sites (app/[companyId]/onboarding/documents/page.tsx; zero call sites for getSemanticTruthForRun) resolve the run via a companyId-scoped query first.", async () => {
      // Demonstrates the mechanism, not a live leak: given a runId that legitimately belongs to
      // company Y, the bare function happily returns it regardless of which "tenant" is asking -
      // by design, because runId already uniquely determines a single company via the FK. The
      // safety property this test documents is: no currently-shipped caller ever supplies a
      // cross-tenant runId, not that the helper function enforces it itself.
      const runY = await prisma.analysisRun.findFirst({ where: { companyId: COMPANY_Y } });
      expect(runY).toBeDefined();
      const issues = await getAnalysisRunIssues(runY!.id);
      expect(issues.every((i) => i.companyId === COMPANY_Y)).toBe(true);
    });
  });
});
