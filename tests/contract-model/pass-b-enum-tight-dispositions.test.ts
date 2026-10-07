/**
 * P3-R1 Pass B enum-tight dispositions.
 * ADR-2: docs/architecture/MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md
 *
 * Illegal inventoryDisposition strings are MODEL_CONTRACT_VIOLATION at the
 * wire/emit boundary. The raw label is not quiet-mapped to UNSUPPORTED.
 * Pass C remains the backstop and is not required for the diagnostic.
 * Zero provider calls.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  PASS_B_DISPOSITION_CLOSED_VOCABULARY_CLAUSE,
  PASS_B_LEGAL_INVENTORY_DISPOSITIONS,
  SubmitCompilationSchema,
  findIllegalInventoryDispositions,
} from "../../lib/contract-model/compiler/semantic/wire-schema";
import { normalizeSubmission } from "../../lib/contract-model/compiler/semantic/normalize";
import { compileBoundedComposition, determineStatus } from "../../lib/contract-model/compiler/semantic/bounded-composition";
import { buildSystemPrompt } from "../../lib/contract-model/compiler/semantic/prompt";
import { renderAccountabilityContext, type SemanticCaller } from "../../lib/contract-model/compiler/semantic/caller";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { SEMANTIC_COMPILER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../../lib/contract-model/compiler/semantic/shard-stitcher";
import { classifyShardStatus } from "../../lib/contract-model/compiler/semantic/shard-execution";
import { buildChapeauCorpus, emitRulesForShard, CO, DOC, INST } from "./f7a-synthetic-corpus";

const rule = {
  localRef: "r1",
  sourceSectionRef: "9.01",
  covenantFamily: "INDEBTEDNESS",
  ruleType: "QUANTITATIVE_PERMISSION",
  posture: "PERMISSION",
  action: "INCUR_DEBT",
  capacityExpression: { kind: "MONEY", amount: 1_000_000, currency: "USD", citation: "§9.01" },
  sufficiency: "COMPLETE",
};

function submission(disposition: string, inventoryItemId = "inv-item:abc") {
  return SubmitCompilationSchema.parse({
    rules: [rule],
    inventoryDispositions: [{ inventoryItemId, disposition, note: "note" }],
  });
}

describe("Pass B enum-tight inventory dispositions (ADR-2)", () => {
  it("cites the closed vocabulary and does not treat transport parse as a quiet success", () => {
    expect(PASS_B_LEGAL_INVENTORY_DISPOSITIONS).toEqual(["INTENTIONALLY_NON_COMPUTATIONAL", "UNSUPPORTED", "AMBIGUOUS"]);
    expect(SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION).toBe("semantic-accountability.v8");
    expect(SEMANTIC_COMPILER_PROMPT_VERSION).toBe("semantic-accountability-compiler-prompt.v8");
    const parsed = SubmitCompilationSchema.parse({
      inventoryDispositions: [{ inventoryItemId: "inv-item:abc", disposition: "CONSUMED_IN_EXPRESSION", note: "folded" }],
    });
    expect(parsed.inventoryDispositions?.[0]?.disposition).toBe("CONSUMED_IN_EXPRESSION");
    const schema = JSON.stringify(z.toJSONSchema(SubmitCompilationSchema));
    expect(schema).toContain(PASS_B_DISPOSITION_CLOSED_VOCABULARY_CLAUSE);
  });

  it("illegal non-vocabulary and self-declared REPRESENTED are MODEL_CONTRACT_VIOLATION; legal labels are not", () => {
    const illegal = findIllegalInventoryDispositions({
      inventoryDispositions: [
        { inventoryItemId: "inv-item:oov", disposition: "CONSUMED_IN_EXPRESSION" },
        { inventoryItemId: "inv-item:self", disposition: "REPRESENTED" },
        { inventoryItemId: "inv-item:missing-label", disposition: "MISSING_FROM_COMPOSITION" },
        { inventoryItemId: "inv-item:blank", disposition: "   " },
        { inventoryItemId: "inv-item:legal", disposition: "intentionally non-computational" },
        { inventoryItemId: "inv-item:unsupported", disposition: "UNSUPPORTED" },
        { inventoryItemId: "inv-item:ambiguous", disposition: "AMBIGUOUS" },
      ],
    });
    expect(illegal).toEqual([
      {
        code: "MODEL_CONTRACT_VIOLATION",
        reason: "UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION",
        rawLabel: "CONSUMED_IN_EXPRESSION",
        contractRef: expect.stringContaining("docs/architecture/MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md"),
        inventoryItemId: "inv-item:oov",
      },
      {
        code: "MODEL_CONTRACT_VIOLATION",
        reason: "SELF_DECLARED_REPRESENTED",
        rawLabel: "REPRESENTED",
        contractRef: expect.stringContaining("ADR"),
        inventoryItemId: "inv-item:self",
      },
      {
        code: "MODEL_CONTRACT_VIOLATION",
        reason: "UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION",
        rawLabel: "MISSING_FROM_COMPOSITION",
        contractRef: expect.stringContaining("MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md"),
        inventoryItemId: "inv-item:missing-label",
      },
    ]);
    expect(findIllegalInventoryDispositions({ inventoryDispositions: [{ inventoryItemId: "inv-item:legal", disposition: "INTENTIONALLY_NON_COMPUTATIONAL" }] })).toEqual([]);
    expect(findIllegalInventoryDispositions({ inventoryDispositions: [] })).toEqual([]);
  });

  it("normalize persists the raw illegal label and the violation diagnostic, and does not rewrite it to UNSUPPORTED", () => {
    const illegal = normalizeSubmission(submission("CONSUMED_IN_EXPRESSION"), testCompilerInput());
    expect(illegal.inventoryDispositions[0]!.disposition).toBe("CONSUMED_IN_EXPRESSION");
    expect(illegal.inventoryDispositions[0]!.disposition).not.toBe("UNSUPPORTED");
    expect(illegal.modelContractViolations).toEqual([
      expect.objectContaining({
        code: "MODEL_CONTRACT_VIOLATION",
        reason: "UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION",
        rawLabel: "CONSUMED_IN_EXPRESSION",
        inventoryItemId: "inv-item:abc",
      }),
    ]);

    const selfDeclared = normalizeSubmission(submission("REPRESENTED", "inv-item:self"), testCompilerInput());
    expect(selfDeclared.inventoryDispositions[0]!.disposition).toBe("REPRESENTED");
    expect(selfDeclared.modelContractViolations[0]).toMatchObject({
      code: "MODEL_CONTRACT_VIOLATION",
      reason: "SELF_DECLARED_REPRESENTED",
      rawLabel: "REPRESENTED",
    });

    for (const legal of ["INTENTIONALLY_NON_COMPUTATIONAL", "UNSUPPORTED", "AMBIGUOUS", "intentionally-non-computational"]) {
      const out = normalizeSubmission(submission(legal), testCompilerInput());
      expect(out.inventoryDispositions[0]!.disposition).toBe(legal);
      expect(out.modelContractViolations).toEqual([]);
    }
  });

  it("emit records MODEL_CONTRACT_VIOLATION with Pass C off, so the backstop is not the only defense", async () => {
    const input = testCompilerInput();
    const caller = (disposition: string): SemanticCaller => ({
      providerName: "scripted",
      model: "scripted-offline",
      isSynthetic: true,
      async compile() {
        return {
          submission: submission(disposition),
          rawSubmission: { inventoryDispositions: [{ disposition }] },
          toolCallLog: [],
          telemetry: null,
          failureReason: null,
          failureDetail: null,
        };
      },
    });
    const illegal = await compileBoundedComposition(input, input, {
      caller: caller("CONSUMED_IN_EXPRESSION"),
      cacheKey: "p3-r1-illegal",
      evidenceFlags: { inputHasUnresolvedOperativeEvidence: false, unresolvedEvidenceItemIds: [] },
      accountability: { sourceContext: null, frozenInventory: null, inventoryMode: null, inventoryPasses: null },
    });
    expect(illegal.result.accountability).toBeNull();
    expect(illegal.result.status).not.toBe("COMPLETED");
    expect(illegal.result.failureReasons).toContain("MODEL_CONTRACT_VIOLATION");
    expect(illegal.result.modelContractViolations).toEqual([
      expect.objectContaining({
        code: "MODEL_CONTRACT_VIOLATION",
        rawLabel: "CONSUMED_IN_EXPRESSION",
        inventoryItemId: "inv-item:abc",
        contractRef: expect.stringContaining("MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md"),
      }),
    ]);
    expect(illegal.inventoryDispositions[0]!.disposition).toBe("CONSUMED_IN_EXPRESSION");
    expect(illegal.result.unresolvedIssues.join("\n")).toMatch(/MODEL_CONTRACT_VIOLATION/);
    expect(determineStatus(["MODEL_CONTRACT_VIOLATION"], 1, false, false)).toBe("REVIEW_REQUIRED");
    expect(determineStatus(["MODEL_CONTRACT_VIOLATION"], 0, false, false)).toBe("FAILED");

    const legal = await compileBoundedComposition(input, input, {
      caller: caller("UNSUPPORTED"),
      cacheKey: "p3-r1-legal",
      evidenceFlags: { inputHasUnresolvedOperativeEvidence: false, unresolvedEvidenceItemIds: [] },
      accountability: { sourceContext: null, frozenInventory: null, inventoryMode: null, inventoryPasses: null },
    });
    expect(legal.result.failureReasons).not.toContain("MODEL_CONTRACT_VIOLATION");
    expect(legal.result.modelContractViolations).toBeUndefined();
    expect(legal.inventoryDispositions[0]!.disposition).toBe("UNSUPPORTED");
  });

  it("Pass B prompts state the closed vocabulary and do not invite invented labels", () => {
    const system = buildSystemPrompt({ irSchemaVersion: "test-v1", toolPolicyVersion: "test-v1" });
    expect(system).toContain(PASS_B_DISPOSITION_CLOSED_VOCABULARY_CLAUSE);
    expect(system).toMatch(/Do not invent labels/);
    expect(system).toMatch(/Do not self-declare REPRESENTED/);
    const user = renderAccountabilityContext(testCompilerInput({
      frozenInventory: {
        candidateRef: "candidate-1",
        items: [{
          inventoryItemId: "inv-item:abc",
          sourceSpan: { sourceCitation: "§9.01", excerpt: "one million dollars", regionId: "operative", charStart: 0, charEnd: 18, documentId: "doc-1" },
          semanticRole: "VALUE",
          proposition: "a cap",
          quantitativeValues: [],
          referencedTerms: [],
          referencedSections: [],
          parentItemId: null,
          relatedItemIds: [],
          materiality: "MATERIAL",
          ambiguity: "NONE",
          ambiguityReason: null,
          operative: "OPERATIVE",
          detectionMethod: "MODEL",
        }],
        uninventoriedValues: [],
        unaccountedSource: [],
        sourceCoverage: { spans: [], unaccounted: [], countsByDisposition: {}, charsByDisposition: {}, coverageFraction: 1, unaccountedValues: [] },
        gapReinventory: null,
        inventoryStatus: "INVENTORY_OK",
        inventoryStatusReason: "test",
        rejectedUnverifiableItems: 0,
        rejectedDuplicateItems: 0,
        sourceContextState: "SOURCE_CONTEXT_SUFFICIENT",
        frozenContentHash: "abc",
        frozenAt: "2026-10-07T00:00:00.000Z",
        algorithmVersion: "semantic-accountability.v8",
        promptVersion: "test",
        provider: "scripted",
        model: "scripted",
        telemetryCostUsd: null,
      } as never,
    }));
    expect(user).toContain(PASS_B_DISPOSITION_CLOSED_VOCABULARY_CLAUSE);
    expect(user).toMatch(/Do not invent labels/);
  });

  it("a completed shard still carries MODEL_CONTRACT_VIOLATION to the stitched unit", () => {
    expect(classifyShardStatus("REVIEW_REQUIRED", ["MODEL_CONTRACT_VIOLATION"])).toBe("SHARD_COMPLETE");
    const corpus = buildChapeauCorpus(4);
    const candidateRef = "cand:p3-r1";
    const plan = planCompilationShards({
      candidateRef,
      companyId: CO,
      instrumentKey: INST,
      documentId: DOC,
      sourceContext: corpus.sourceContext,
      frozenInventory: corpus.frozenInventory,
      structuralIndex: corpus.index,
      budget: { targetPrimaryChars: 1_200, maxPrimaryChars: 2_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 16 },
      generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" },
    });
    const owner = plan.shards.find((s) => s.ownedItemIds.length > 0)!;
    const ownedItem = owner.ownedItemIds[0]!;
    const results = plan.shards.map((s) => {
      const composition = emitRulesForShard(corpus, plan, s, candidateRef);
      if (s.shardId === owner.shardId) {
        composition.inventoryDispositions.push({ inventoryItemId: ownedItem, disposition: "CONSUMED_IN_EXPRESSION", note: "illegal emit" });
      }
      return {
        shardId: s.shardId,
        shardHash: s.shardHash,
        status: "SHARD_COMPLETE" as const,
        composition,
        failureReasons: s.shardId === owner.shardId ? ["MODEL_CONTRACT_VIOLATION" as const] : [],
        unresolvedIssues: [],
        reusedFromHash: false,
        attempts: 1,
        telemetry: null,
        ...(s.shardId === owner.shardId
          ? {
              normalization: {
                diagnostics: [],
                dependencyProseDiagnostics: [],
                contextOnlyEmissions: [],
                invalidWireKinds: [],
                modelContractViolations: [{
                  shardId: s.shardId,
                  code: "MODEL_CONTRACT_VIOLATION" as const,
                  reason: "UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION" as const,
                  rawLabel: "CONSUMED_IN_EXPRESSION",
                  contractRef: "Pass B inventoryDisposition vocabulary: INTENTIONALLY_NON_COMPUTATIONAL | UNSUPPORTED | AMBIGUOUS; ADR: docs/architecture/MODEL-CONTRACT-VIOLATION-VS-UNSUPPORTED-ADR.md",
                  inventoryItemId: ownedItem,
                }],
              },
            }
          : {}),
      };
    });
    const stitched = stitchShardResults({
      plan,
      results,
      frozenInventory: corpus.frozenInventory,
      sourceContextState: "COMPLETE_LOCAL_SOURCE",
      companyId: CO,
      instrumentKey: INST,
      candidateRef,
    });
    expect(stitched.status).not.toBe("COMPLETED");
    expect(stitched.failureReasons).toContain("MODEL_CONTRACT_VIOLATION");
    expect(stitched.normalization?.modelContractViolations?.[0]).toMatchObject({
      code: "MODEL_CONTRACT_VIOLATION",
      rawLabel: "CONSUMED_IN_EXPRESSION",
      inventoryItemId: ownedItem,
    });
    expect(stitched.unresolvedIssues.join("\n")).toMatch(/MODEL_CONTRACT_VIOLATION/);
    expect(stitched.inventoryDispositions.find((d) => d.inventoryItemId === ownedItem)?.disposition).toBe("CONSUMED_IN_EXPRESSION");
  });
});
