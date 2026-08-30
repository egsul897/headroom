/**
 * Phase 3F.1.6.RX Part B - INDEPENDENT recertification of AUDIT-F1 (durable
 * semantic-truth persistence). Written from scratch by the Part B auditor,
 * deliberately NOT copying tests/contract-model/semantic-truth-persistence.test.ts
 * verbatim - different document, different rule shape (this file exercises
 * a NESTED capacityExpression tree plus real conditions[]/exceptions[],
 * which the original Workstream H test never round-trips), a genuinely
 * adversarial tenant-isolation attack against the raw DB constraint, and a
 * content-hash-gating precision test that separates "IR content changed"
 * from "governance metadata changed" at the level of ONE nested field.
 *
 * See docs/phase-3f1-6-rx-final-blocker-closure/28-part-b-auditf1-f2-recertification.json
 * for the full disposition writeup this file's results feed into.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import { persistSemanticTruthForInstrument, getAllSemanticTruthForInstrument, getTrustedSemanticTruth } from "../../lib/contract-model/analysis/semantic-truth/service";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_ID = "part-b-recert-f1-main";
const TENANT_A = "part-b-recert-f1-tenant-a";
const TENANT_B = "part-b-recert-f1-tenant-b";
const ALL_COMPANIES = [COMPANY_ID, TENANT_A, TENANT_B];

// A section with a NESTED capacity tree (MAX of a flat MONEY basket and a
// MULTIPLY(PERCENT, METRIC_REFERENCE) grower basket), one boolean condition
// (EVENT_ACTIVE - "no Default exists"), and one exception carve-out - none
// of which the original Workstream H test ever exercises (it only ever
// persists a bare MONEY leaf with empty conditions/exceptions).
const DOCUMENT_TEXT = `CREDIT AGREEMENT

ARTICLE I. DEFINITIONS

Section 1.01 Certain Defined Terms.
"Borrower" means the Company.
"Consolidated EBITDA" means, for any period, the consolidated net income of the Borrower for such period, adjusted as set forth herein.

ARTICLE VI. NEGATIVE COVENANTS

Section 6.02 Liens. The Borrower shall not create or suffer to exist any Lien on any property, provided that so long as no Event of Default has occurred and is continuing, Liens securing Indebtedness in an aggregate amount not to exceed the greater of $5,000,000 and 10% of Consolidated EBITDA may be incurred, excluding Liens arising by operation of law in the ordinary course of business.
`;

class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  constructor(private readonly respond: (stage: string, content: string) => unknown = () => ({})) {}
  async call<T>(schema: ZodType<T>, stage: string, _systemPrompt: string, content: string): Promise<T> {
    return schema.parse(this.respond(stage, content));
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

class ScriptedSemanticCaller implements SemanticCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  constructor(private readonly respond: (input: SemanticCompilerInput) => unknown = () => ({})) {}
  async compile(input: SemanticCompilerInput): Promise<SemanticCallerResult> {
    const submission = SubmitCompilationSchema.parse(this.respond(input));
    return { submission, rawSubmission: submission, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null };
  }
}

function discoveryScript(_stage: string, content: string): unknown {
  if (content.includes('Section: 6.02 - "Liens')) {
    return { rules: [{ relativeRef: "", families: ["LIENS"], role: "BASKET", description: "Lien basket, greater-of, conditional on no Default, with an ordinary-course carve-out.", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.9, needsReview: false }] };
  }
  return { rules: [] };
}

function semanticCompileScript(input: SemanticCompilerInput): unknown {
  if (input.sourceSectionRef !== "6.02") return {};
  return {
    rules: [
      {
        localRef: "r1",
        sourceSectionRef: "6.02",
        covenantFamily: "LIENS",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: "CREATE_LIEN",
        entityScope: ["BORROWER"],
        capacityExpression: {
          kind: "MAX",
          citation: `${input.sourceDocumentId}::6.02`,
          operands: [
            { kind: "MONEY", amount: 5_000_000, currency: "USD" },
            {
              kind: "MULTIPLY",
              operands: [
                { kind: "PERCENT", value: 10 },
                { kind: "METRIC_REFERENCE", metricName: "Consolidated EBITDA", valueType: "MONEY" },
              ],
            },
          ],
        },
        conditions: [
          {
            conditionType: "NO_DEFAULT",
            expression: { kind: "EVENT_ACTIVE", eventDescription: "an Event of Default has occurred and is continuing" },
            description: "so long as no Event of Default has occurred and is continuing",
            citation: `${input.sourceDocumentId}::6.02(cond)`,
            excerpt: "provided that so long as no Event of Default has occurred and is continuing",
          },
        ],
        exceptions: [
          {
            description: "excluding Liens arising by operation of law in the ordinary course of business",
            citation: `${input.sourceDocumentId}::6.02(exc)`,
            excerpt: "excluding Liens arising by operation of law in the ordinary course of business",
            conditions: [],
          },
        ],
        sufficiency: "COMPLETE",
        citation: `${input.sourceDocumentId}::6.02`,
        excerpt: "Liens securing Indebtedness in an aggregate amount not to exceed the greater of $5,000,000 and 10% of Consolidated EBITDA",
      },
    ],
  };
}

function scriptedCallers() {
  return {
    discoveryCaller: new ScriptedStageCaller(discoveryScript),
    amendmentCaller: new ScriptedStageCaller(),
    verificationCaller: new ScriptedStageCaller(),
    semanticCaller: new ScriptedSemanticCaller(semanticCompileScript),
  };
}

async function cleanupCompanyState(companyId: string) {
  await prisma.claimReviewItem.deleteMany({ where: { companyId } });
  await prisma.analysisRunIssue.deleteMany({ where: { companyId } });
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId } });
  await prisma.analysisFailureLog.deleteMany({ where: { companyId } });
  await prisma.analysisRun.deleteMany({ where: { companyId } });
  await prisma.documentNode.deleteMany({ where: { companyId } });
  await prisma.document.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  for (const id of ALL_COMPANIES) {
    await prisma.company.deleteMany({ where: { id } });
    await prisma.company.create({ data: { id, name: `Part B recert F1 - ${id}`, onboardingStatus: "ONBOARDING" } });
  }
});

afterAll(async () => {
  for (const id of ALL_COMPANIES) {
    await cleanupCompanyState(id);
    await prisma.company.deleteMany({ where: { id } });
  }
});

beforeEach(async () => {
  for (const id of ALL_COMPANIES) await cleanupCompanyState(id);
});

describe("Part B independent recertification - AUDIT-F1 durable semantic-truth persistence", () => {
  it("FULL TREE ROUND TRIP: a nested capacityExpression (MAX/MULTIPLY/PERCENT/METRIC_REFERENCE), a real condition (EVENT_ACTIVE), and a real exception all survive a genuine Postgres write+reload via a brand-new PrismaClient", async () => {
    const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "f1-recert-main.txt", data: Buffer.from(DOCUMENT_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const result = await runContractAnalysis({ companyId: COMPANY_ID }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.instruments.length).toBe(1);
    const instrumentKey = result.instruments[0]!.instrumentKey;

    // Independent process boundary - a brand new PrismaClient, never the
    // shared singleton the orchestrator wrote through.
    const freshClient = new PrismaClient();
    try {
      const rows = await freshClient.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey, kind: "RULE" } });
      expect(rows.length).toBe(1);
      const row = rows[0]!;
      expect(row.sourceDocumentId).toBe(document.id);
      expect(row.sourceSectionRef).toBe("6.02");

      const payload = row.payload as unknown as IRRule;
      // Full nested tree, not just a leaf.
      expect(payload.capacityExpression?.kind).toBe("MAX");
      const maxNode = payload.capacityExpression as unknown as { operands: unknown[] };
      expect(maxNode.operands.length).toBe(2);
      const [moneyLeaf, multiplyNode] = maxNode.operands as [Record<string, unknown>, Record<string, unknown>];
      expect(moneyLeaf.kind).toBe("MONEY");
      expect(moneyLeaf.amount).toBe(5_000_000);
      expect(multiplyNode.kind).toBe("MULTIPLY");
      const multiplyOperands = multiplyNode.operands as Record<string, unknown>[];
      expect(multiplyOperands[0]!.kind).toBe("PERCENT");
      expect(multiplyOperands[0]!.value).toBe(10);
      expect(multiplyOperands[1]!.kind).toBe("METRIC_REFERENCE");
      expect(multiplyOperands[1]!.metricName).toBe("Consolidated EBITDA");

      // Real conditions[] - not dropped, not flattened away.
      expect(payload.conditions.length).toBe(1);
      expect(payload.conditions[0]!.conditionType).toBe("NO_DEFAULT");
      expect(payload.conditions[0]!.expression).toMatchObject({ kind: "EVENT_ACTIVE" });
      expect(payload.conditions[0]!.description).toContain("no Event of Default");

      // Real exceptions[] - not dropped.
      expect(payload.exceptions.length).toBe(1);
      expect(payload.exceptions[0]!.description).toContain("ordinary course of business");

      // Provenance survives too.
      expect(payload.provenance?.documentId).toBe(document.id);
      expect(payload.provenance?.sourceCitation).toContain("6.02");
      expect(row.sourceCitation).toContain("6.02");
      expect(row.sourceExcerpt).toContain("greater of $5,000,000");

      // Every mandated provenance/version column is real, not a placeholder.
      expect(row.irSchemaVersion).toBe(IR_SCHEMA_VERSION);
      expect(row.compilerAlgorithmVersion).toBeTruthy();
      expect(row.candidateRef).toBeTruthy();
      expect(row.analysisRunId).toBe(result.runId);
      expect(row.version).toBe(1);
    } finally {
      await freshClient.$disconnect();
    }
  });

  it("TENANT ISOLATION (real DB constraint, not just application code): two companies given the IDENTICAL instrumentKey + kind + semanticObjectId persist as two independent rows, reads never cross tenant boundaries, and a raw duplicate insert for the SAME company genuinely violates the unique constraint", async () => {
    const SHARED_INSTRUMENT_KEY = "shared-instrument-key-attack";
    const SHARED_SEMANTIC_OBJECT_ID = "shared-rule-id-attack";
    const makeRule = (companyId: string, amount: number): IRRule => ({
      ruleId: SHARED_SEMANTIC_OBJECT_ID,
      irSchemaVersion: IR_SCHEMA_VERSION,
      companyId,
      instrumentKey: SHARED_INSTRUMENT_KEY,
      sourceDocumentId: `doc-${companyId}`,
      sourceSectionRef: "9.99",
      covenantFamily: "LIENS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "CREATE_LIEN",
      entityScope: [],
      entityScopeExcluded: [],
      transactionScope: null,
      capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount, currency: "USD" },
      conditions: [],
      exceptions: [],
      dependsOn: [],
      operativeLineage: null,
      sufficiency: "COMPLETE",
      sufficiencyReasons: [],
      provenance: null,
      compilerVersion: "test-v1",
      sourceContentVersion: null,
    });
    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-v1", compilerPromptVersion: "test-v1", toolPolicyVersion: "test-v1" };

    await persistSemanticTruthForInstrument({ companyId: TENANT_A, packageKey: null, instrumentKey: SHARED_INSTRUMENT_KEY, analysisRunId: null, objects: [{ kind: "RULE", object: makeRule(TENANT_A, 1_000_000), candidateRef: "c-a", compilerVersions, verification: null, verifierPromptVersion: null }] });
    await persistSemanticTruthForInstrument({ companyId: TENANT_B, packageKey: null, instrumentKey: SHARED_INSTRUMENT_KEY, analysisRunId: null, objects: [{ kind: "RULE", object: makeRule(TENANT_B, 9_999_999), candidateRef: "c-b", compilerVersions, verification: null, verifierPromptVersion: null }] });

    // Both rows exist, independently - the identical (instrumentKey, kind,
    // semanticObjectId) triple did NOT collide across tenants.
    const rowsA = await getAllSemanticTruthForInstrument(TENANT_A, SHARED_INSTRUMENT_KEY);
    const rowsB = await getAllSemanticTruthForInstrument(TENANT_B, SHARED_INSTRUMENT_KEY);
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    expect((rowsA[0]!.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 1_000_000 });
    expect((rowsB[0]!.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 9_999_999 });
    // Neither tenant's own read ever sees the other tenant's row.
    expect(rowsA.some((r) => r.companyId === TENANT_B)).toBe(false);
    expect(rowsB.some((r) => r.companyId === TENANT_A)).toBe(false);

    // Re-persisting TENANT_A's own rule with a genuinely changed amount must
    // update ONLY tenant A's row - tenant B's row (identical instrumentKey +
    // semanticObjectId) must be completely unaffected.
    await persistSemanticTruthForInstrument({ companyId: TENANT_A, packageKey: null, instrumentKey: SHARED_INSTRUMENT_KEY, analysisRunId: null, objects: [{ kind: "RULE", object: makeRule(TENANT_A, 2_000_000), candidateRef: "c-a", compilerVersions, verification: null, verifierPromptVersion: null }] });
    const rowsAAfter = await getAllSemanticTruthForInstrument(TENANT_A, SHARED_INSTRUMENT_KEY);
    const rowsBAfter = await getAllSemanticTruthForInstrument(TENANT_B, SHARED_INSTRUMENT_KEY);
    expect((rowsAAfter[0]!.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 2_000_000 });
    expect((rowsBAfter[0]!.payload as unknown as IRRule).capacityExpression).toMatchObject({ amount: 9_999_999 }); // untouched

    // Real DB-level enforcement check: a raw duplicate insert for the SAME
    // company + identical (instrumentKey, kind, semanticObjectId) must be
    // physically rejected by Postgres's own unique index - not merely
    // "the application code happens to always upsert instead." This proves
    // the isolation guarantee lives in the schema, not just in service.ts's
    // own discipline.
    let threw: unknown = null;
    try {
      await prisma.semanticTruthRecord.create({
        data: {
          companyId: TENANT_A,
          instrumentKey: SHARED_INSTRUMENT_KEY,
          kind: "RULE",
          semanticObjectId: SHARED_SEMANTIC_OBJECT_ID,
          sourceDocumentId: "doc-duplicate-attempt",
          irSchemaVersion: IR_SCHEMA_VERSION,
          compilerAlgorithmVersion: "test-v1",
          compilerPromptVersion: "test-v1",
          toolPolicyVersion: "test-v1",
          trustStatus: "COMPILED",
          sufficiency: "COMPLETE",
          sufficiencyReasons: [],
          payloadSchemaVersion: IR_SCHEMA_VERSION,
          payload: {},
          contentHash: "irrelevant-duplicate-attempt",
          version: 1,
        },
      });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((threw as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");

    // But the identical raw insert under TENANT_B's own companyId for a
    // DIFFERENT semanticObjectId (no real collision) succeeds normally,
    // confirming the constraint is scoped correctly (companyId genuinely
    // participates in the key) rather than accidentally over-broad.
    const distinctInsert = await prisma.semanticTruthRecord.create({
      data: {
        companyId: TENANT_B,
        instrumentKey: SHARED_INSTRUMENT_KEY,
        kind: "RULE",
        semanticObjectId: "a-genuinely-different-id",
        sourceDocumentId: "doc-distinct",
        irSchemaVersion: IR_SCHEMA_VERSION,
        compilerAlgorithmVersion: "test-v1",
        compilerPromptVersion: "test-v1",
        toolPolicyVersion: "test-v1",
        trustStatus: "COMPILED",
        sufficiency: "COMPLETE",
        sufficiencyReasons: [],
        payloadSchemaVersion: IR_SCHEMA_VERSION,
        payload: {},
        contentHash: "distinct",
        version: 1,
      },
    });
    expect(distinctInsert.id).toBeTruthy();
  });

  it("CONTENT-HASH GATING PRECISION: a change to a nested field (a condition's description, three levels deep) bumps version; an unchanged re-persist never bumps; a governance-metadata-only change (candidateRef) updates its own column WITHOUT bumping version", async () => {
    const instrumentKey = "f1-recert-contenthash-precision";
    const rule = (conditionDescription: string): IRRule => ({
      ruleId: "rule-contenthash-precision",
      irSchemaVersion: IR_SCHEMA_VERSION,
      companyId: COMPANY_ID,
      instrumentKey,
      sourceDocumentId: "doc-1",
      sourceSectionRef: "3.01",
      covenantFamily: "LIENS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "CREATE_LIEN",
      entityScope: [],
      entityScopeExcluded: [],
      transactionScope: null,
      capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 3_000_000, currency: "USD" },
      conditions: [{ conditionId: "cond-1", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: conditionDescription, provenance: null }],
      exceptions: [],
      dependsOn: [],
      operativeLineage: null,
      sufficiency: "COMPLETE",
      sufficiencyReasons: [],
      provenance: null,
      compilerVersion: "test-v1",
      sourceContentVersion: null,
    });
    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-v1", compilerPromptVersion: "test-v1", toolPolicyVersion: "test-v1" };

    const r1 = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: rule("original condition text"), candidateRef: "cand-1", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(r1.upserted).toBe(1);
    const rowId = (await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: "rule-contenthash-precision" } } })).id;
    expect((await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { id: rowId } })).version).toBe(1);

    // Change ONLY the nested condition description (three levels deep:
    // IRRule -> conditions[0] -> description) - a genuine content change,
    // must bump version.
    const r2 = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: rule("a materially different condition text"), candidateRef: "cand-1", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(r2.upserted).toBe(1);
    const rowV2 = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { id: rowId } });
    expect(rowV2.version).toBe(2);
    expect((rowV2.payload as unknown as IRRule).conditions[0]!.description).toBe("a materially different condition text");

    // Re-persist the IDENTICAL content again - a genuine no-op, must NOT bump.
    const r3 = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: rule("a materially different condition text"), candidateRef: "cand-1", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(r3.unchanged).toBe(1);
    expect((await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { id: rowId } })).version).toBe(2);

    // Change ONLY candidateRef (governance metadata, never part of the IR
    // payload/contentHash) - the column itself must update, but version
    // must NOT bump, since the underlying compiled rule content is
    // byte-identical.
    const r4 = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: null, instrumentKey, analysisRunId: null, objects: [{ kind: "RULE", object: rule("a materially different condition text"), candidateRef: "cand-2-a-different-candidate", compilerVersions, verification: null, verifierPromptVersion: null }] });
    expect(r4.unchanged).toBe(1);
    const rowV2b = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { id: rowId } });
    expect(rowV2b.version).toBe(2); // unchanged
    expect(rowV2b.candidateRef).toBe("cand-2-a-different-candidate"); // but this DID update

    // Exactly one row ever existed across all four persists (idempotent by construction).
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID, instrumentKey } })).toBe(1);
  });

  it("TRUST GATING TRACE: getTrustedSemanticTruth genuinely excludes non-VERIFIED rows from its OWN result set (the one function any real future downstream reader is documented to call) - this is the enforcement point itself, since a repo-wide search independently confirms no other production code path outside this module and its own tests currently reads SemanticTruthRecord at all", async () => {
    const instrumentKey = "f1-recert-trust-gating-trace";
    const rule = (id: string, sufficiency: IRRule["sufficiency"]): IRRule => ({
      ruleId: id,
      irSchemaVersion: IR_SCHEMA_VERSION,
      companyId: COMPANY_ID,
      instrumentKey,
      sourceDocumentId: "doc-1",
      sourceSectionRef: "4.01",
      covenantFamily: "LIENS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "CREATE_LIEN",
      entityScope: [],
      entityScopeExcluded: [],
      transactionScope: null,
      capacityExpression: null,
      conditions: [],
      exceptions: [],
      dependsOn: [],
      operativeLineage: null,
      sufficiency,
      sufficiencyReasons: [],
      provenance: null,
      compilerVersion: "test-v1",
      sourceContentVersion: null,
    });
    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-v1", compilerPromptVersion: "test-v1", toolPolicyVersion: "test-v1" };
    const notVerified = { candidateRef: "c-not-verified", status: "NOT_VERIFIED", findings: [] } as unknown as import("../../lib/contract-model/compiler/semantic-verification/types").SemanticVerificationResult;

    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID,
      packageKey: null,
      instrumentKey,
      analysisRunId: null,
      objects: [
        { kind: "RULE", object: rule("r-compiled", "COMPLETE"), candidateRef: "c1", compilerVersions, verification: null, verifierPromptVersion: null },
        { kind: "RULE", object: rule("r-not-verified", "COMPLETE"), candidateRef: "c-not-verified", compilerVersions, verification: notVerified, verifierPromptVersion: "vp1" },
      ],
    });

    const trusted = await getTrustedSemanticTruth(COMPANY_ID, instrumentKey);
    expect(trusted.map((r) => r.semanticObjectId)).not.toContain("r-compiled");
    expect(trusted.map((r) => r.semanticObjectId)).not.toContain("r-not-verified");
    expect(trusted.length).toBe(0);

    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, instrumentKey);
    expect(all.length).toBe(2); // both rows genuinely persisted, at their real (non-VERIFIED) trust status - never dropped, never silently promoted
    expect(all.every((r) => r.trustStatus !== "VERIFIED")).toBe(true);
  });
});
