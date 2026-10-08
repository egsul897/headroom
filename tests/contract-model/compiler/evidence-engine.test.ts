/**
 * Offline evidence engine. No provider call.
 * Cache reuse is not certification. Five dollars is a proposed cap, not an authorization.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { priceUsage } from "../../../lib/contract-model/analyzer/pricing";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";
import {
  ContentAddressedEvidenceStore,
  PROPOSED_DEVELOPMENT_EXPERIMENT_CEILING_USD,
  assessStoredRecord,
  assembleLegalContext,
  authorizeDispatch,
  evidenceKey,
  incrementalCosts,
  openAuthorizedBudget,
  planInvalidation,
  planVerification,
  preflight,
  resolveSpendAuthorization,
  routeTask,
  settleUnbilledRetry,
  structuralKindForPreflight,
  type ContextFragment,
  type EvidenceDependencyGraph,
  type EvidenceReuseContract,
  type RetainedCostAttempt,
} from "../../../lib/contract-model/compiler/evidence-engine";

const MODEL = "deepseek/deepseek-v4-flash";
const HAIKU = "anthropic/claude-haiku-4.5";

function contract(over: Partial<EvidenceReuseContract> = {}): EvidenceReuseContract {
  return {
    sourceContentSha256: "a".repeat(64),
    documentId: "doc-1",
    operativeVersionId: "operative-v1",
    dependencyHashes: { "definition:ebitda": "b".repeat(64) },
    promptVersion: "prompt-v1",
    schemaVersion: "schema-v1",
    modelId: MODEL,
    inferenceConfigHash: "cfg-1",
    stage: "semantic-compile",
    compilerVersion: "compiler-v1",
    artifactKind: "SEMANTIC_IR",
    ...over,
  };
}

function fragment(over: Partial<ContextFragment> = {}): ContextFragment {
  return {
    role: "OPERATIVE_CLAUSE",
    id: "clause-7.02",
    text: "The Borrower shall not create any Lien.",
    contentHash: "c".repeat(64),
    required: true,
    estimatedTokens: 20,
    ...over,
  };
}

function policy() {
  return {
    modelByClass: {
      STRAIGHTFORWARD_EXTRACTION: MODEL,
      AMBIGUOUS_SEMANTIC: MODEL,
      HIGH_RISK_CONCLUSION: MODEL,
    },
  };
}

function ready<T>(over: Record<string, unknown> = {}) {
  const opened = openAuthorizedBudget({ kind: "FOUNDER_AUTHORIZED", ceilingUsd: PROPOSED_DEVELOPMENT_EXPERIMENT_CEILING_USD, authorizationId: "grant-test" });
  const store = new ContentAddressedEvidenceStore();
  const request = {
    structuralIdentityPresent: true,
    structuralKind: "OPERATIVE_OCCURRENCE" as const,
    sourceComplete: true,
    contract: contract(),
    contextFragments: [fragment(), fragment({ role: "DEFINITION", id: "def-ebitda", text: "\"EBITDA\" means net income.", required: true, estimatedTokens: 10 })],
    tokenBudget: 100,
    estimate: { stage: "semantic-compile", maxInputTokens: 1_000, maxOutputTokens: 1_000 },
    taskClass: "STRAIGHTFORWARD_EXTRACTION" as const,
    policy: policy(),
    authorization: opened.decision,
    budget: opened.budget,
    store,
    duplicateInFlight: false,
    ...over,
  };
  return { request, store, budget: opened.budget };
}

describe("evidence engine", () => {
  it("returns the cached output for an identical contract and does not certify it", () => {
    const { request, store, budget } = ready();
    store.put(request.contract, { rules: 1 }, "COMPLETE");
    const decision = preflight(request);
    expect(decision.disposition).toBe("REUSE");
    expect(decision.advancesCertification).toBe(false);
    expect(decision.paidCall).toBe(false);
    if (decision.disposition === "REUSE" && decision.read.status === "HIT") {
      expect(decision.read.record.payload).toEqual({ rules: 1 });
      expect(decision.read.advancesCertification).toBe(false);
    }
    expect(budget.snapshot().calls).toBe(0);
    const certification = store.put(contract({ artifactKind: "CERTIFICATION_EVIDENCE" }), { note: "diagnostic" }, "COMPLETE");
    expect(store.read(certification.contract).advancesCertification).toBe(false);
  });

  it("invalidates the changed clause and the definition's dependents, and keeps an unrelated clause", () => {
    const graph: EvidenceDependencyGraph = {
      nodes: [
        { id: "clause-a", kind: "CLAUSE" },
        { id: "clause-b", kind: "CLAUSE" },
        { id: "def", kind: "DEFINITION" },
        { id: "prompt", kind: "PROMPT" },
        { id: "parser", kind: "PARSER" },
        { id: "out-a", kind: "STAGE_OUTPUT" },
        { id: "out-b", kind: "STAGE_OUTPUT" },
        { id: "out-prompted", kind: "STAGE_OUTPUT" },
        { id: "out-unparsed", kind: "STAGE_OUTPUT" },
      ],
      edges: [
        { from: "clause-a", to: "out-a" },
        { from: "def", to: "out-a" },
        { from: "clause-b", to: "out-b" },
        { from: "prompt", to: "out-prompted" },
        { from: "parser", to: "out-a" },
        { from: "parser", to: "out-b" },
        { from: "parser", to: "out-prompted" },
      ],
    };
    const previous = new Map(graph.nodes.filter((node) => node.kind !== "STAGE_OUTPUT").map((node) => [node.id, "h1"]));
    const clauseChange = new Map(previous);
    clauseChange.set("clause-a", "h2");
    const afterClause = planInvalidation({ graph, previousHashByNode: previous, currentHashByNode: clauseChange });
    expect(afterClause.invalidated).toEqual(["out-a"]);
    expect(afterClause.preserved).toEqual(expect.arrayContaining(["out-b", "out-prompted", "out-unparsed"]));
    const definitionChange = new Map(previous);
    definitionChange.set("def", "h2");
    const afterDefinition = planInvalidation({ graph, previousHashByNode: previous, currentHashByNode: definitionChange });
    expect(afterDefinition.invalidated).toEqual(["out-a"]);
    expect(afterDefinition.preserved).toContain("out-b");
    const promptChange = new Map(previous);
    promptChange.set("prompt", "h2");
    const afterPrompt = planInvalidation({ graph, previousHashByNode: previous, currentHashByNode: promptChange });
    expect(afterPrompt.invalidated).toEqual(["out-prompted"]);
    expect(afterPrompt.preserved).toEqual(expect.arrayContaining(["out-a", "out-b", "out-unparsed"]));
    const parserChange = new Map(previous);
    parserChange.set("parser", "h2");
    const afterParser = planInvalidation({ graph, previousHashByNode: previous, currentHashByNode: parserChange });
    expect(afterParser.invalidated).toEqual(expect.arrayContaining(["out-a", "out-b", "out-prompted"]));
    expect(afterParser.preserved).toEqual(["out-unparsed"]);
    const uncertain = planInvalidation({
      graph: { ...graph, nodes: graph.nodes.map((node) => node.id === "def" ? { ...node, uncertain: true } : node) },
      previousHashByNode: previous,
      currentHashByNode: previous,
    });
    expect(uncertain.blockedUncertain).toEqual(["out-a"]);
    expect(uncertain.preserved).toContain("out-b");
  });

  it("does not present another model's cached output as the new model's evidence", () => {
    const store = new ContentAddressedEvidenceStore();
    const original = contract({ modelId: MODEL });
    store.put(original, { rules: 2 }, "COMPLETE");
    const changed = contract({ modelId: "claude-sonnet-5" });
    expect(evidenceKey(original)).not.toBe(evidenceKey(changed));
    expect(store.read(changed).status).toBe("MISS");
    const reread = store.read(original);
    expect(reread.status).toBe("HIT");
    if (reread.status === "HIT") expect(reread.record.contract.modelId).toBe(MODEL);
  });

  it("refuses a contents listing before any reservation", () => {
    const text = "Section 7.04 Asset Dispositions 233\n";
    const node: StructuralNode = {
      documentId: "doc", nodeId: "toc", nodeType: "SECTION", sectionRef: "7.04", heading: "", nodeKey: "doc::7.04",
      ordinal: 0, parentSectionRef: null, parentNodeId: null, charStart: 0, charEnd: text.length,
    };
    const index = buildStructuralIndex(new Map([["doc", { text, nodes: [node] }]]), [], []);
    const kind = structuralKindForPreflight(index.getNodeById("toc")!, index);
    expect(kind).toBe("CONTENTS_LISTING");
    const { request, budget } = ready({ structuralKind: kind });
    const decision = preflight(request);
    expect(decision.disposition).toBe("REJECT");
    if (decision.disposition === "REJECT") expect(decision.reason).toBe("OPERATIVE_AUTHORITY_REFUSED");
    expect(budget.snapshot().calls).toBe(0);
    expect(decision.advancesCertification).toBe(false);
  });

  it("fails closed when required legal context is missing or does not fit", () => {
    const missing = assembleLegalContext([fragment({ role: "DEFINITION", id: "def", required: true })], 100);
    expect(missing.status).toBe("NEEDS_CONTEXT");
    const tooBig = assembleLegalContext([
      fragment({ estimatedTokens: 30 }),
      fragment({ role: "DEFINITION", id: "def", required: true, estimatedTokens: 80, text: "\"EBITDA\" means net income for the period." }),
    ], 100);
    expect(tooBig.status).toBe("NEEDS_CONTEXT");
    if (tooBig.status === "NEEDS_CONTEXT") expect(tooBig.missing).toContain("def");
    const { request } = ready({ contextFragments: [fragment({ role: "DEFINITION", id: "only-def", required: true })] });
    const decision = preflight(request);
    expect(decision.disposition).toBe("NEEDS_CONTEXT");
    expect(decision.paidCall).toBe(false);
  });

  it("refuses dispatch when the default is no paid calls, the cap is exceeded, or the model cannot be priced", () => {
    expect(resolveSpendAuthorization().reason).toBe("NO_PAID_CALLS_DEFAULT");
    expect(resolveSpendAuthorization().proposedCeilingIsAuthorization).toBe(false);
    expect(PROPOSED_DEVELOPMENT_EXPERIMENT_CEILING_USD).toBe(5);
    const blocked = openAuthorizedBudget({ kind: "NO_PAID_CALLS" });
    const { request } = ready({ authorization: blocked.decision, budget: blocked.budget });
    expect(preflight(request).disposition).toBe("REJECT");
    expect(blocked.budget.snapshot().calls).toBe(0);
    expect(resolveSpendAuthorization({ kind: "DEVELOPMENT_EXPERIMENT", ceilingUsd: 5 }).paidCallsAllowed).toBe(false);
    expect(resolveSpendAuthorization({ kind: "DEVELOPMENT_EXPERIMENT", ceilingUsd: 5 }).reason).toBe("DEVELOPMENT_EXPERIMENT_IS_NOT_AUTHORIZATION");
    expect(resolveSpendAuthorization({ kind: "DEVELOPMENT_EXPERIMENT", ceilingUsd: 5.01 }).paidCallsAllowed).toBe(false);
    expect(resolveSpendAuthorization({ kind: "FOUNDER_AUTHORIZED", ceilingUsd: 20, authorizationId: "  " }).paidCallsAllowed).toBe(false);
    expect(resolveSpendAuthorization({ kind: "FOUNDER_AUTHORIZED", ceilingUsd: 20, authorizationId: "grant-1" }).paidCallsAllowed).toBe(true);
    const haiku = ready({ policy: { modelByClass: { STRAIGHTFORWARD_EXTRACTION: HAIKU } } });
    const refused = preflight(haiku.request);
    expect(refused.disposition).toBe("REJECT");
    if (refused.disposition === "REJECT") expect(refused.reason).toContain("UNPRICEABLE_MODEL");
    expect(priceUsage({ inputTokens: 1, outputTokens: 1 }, HAIKU).pricingStatus).toBe("UNKNOWN_MODEL");
  });

  it("refuses experiment mode, including the proposed five-dollar ceiling, and does not reserve", () => {
    for (const ceilingUsd of [PROPOSED_DEVELOPMENT_EXPERIMENT_CEILING_USD, 0.001]) {
      const opened = openAuthorizedBudget({ kind: "DEVELOPMENT_EXPERIMENT", ceilingUsd });
      expect(opened.decision.paidCallsAllowed).toBe(false);
      expect(opened.decision.proposedCeilingIsAuthorization).toBe(false);
      expect(opened.decision.ceilingUsd).toBe(0);
      const dispatch = authorizeDispatch(opened.budget, opened.decision, { stage: "semantic-compile", model: MODEL, maxInputTokens: 4_000, maxOutputTokens: 1_000 });
      expect(dispatch.allowed).toBe(false);
      if (!dispatch.allowed) expect(dispatch.reason).toBe("DEVELOPMENT_EXPERIMENT_IS_NOT_AUTHORIZATION");
      expect(opened.budget.snapshot().calls).toBe(0);
      expect(opened.budget.snapshot().outstandingUsd).toBe(0);
    }
  });

  it("keeps an unbilled retry reserved and stops a second outstanding founder-authorized dispatch from crossing the ceiling", () => {
    const opened = openAuthorizedBudget({ kind: "FOUNDER_AUTHORIZED", ceilingUsd: 0.001, authorizationId: "grant-concurrent" });
    const estimate = { stage: "semantic-compile", model: MODEL, maxInputTokens: 4_000, maxOutputTokens: 1_000 };
    const first = authorizeDispatch(opened.budget, opened.decision, estimate);
    expect(first.allowed).toBe(true);
    if (!first.allowed) return;
    const parallel = authorizeDispatch(opened.budget, opened.decision, estimate);
    expect(parallel.allowed).toBe(false);
    if (!parallel.allowed) expect(parallel.reason).toContain("HARD_CEILING");
    expect(opened.budget.snapshot().outstandingUsd).toBeGreaterThan(0);
    settleUnbilledRetry(opened.budget, first.ticket);
    const retry = authorizeDispatch(opened.budget, opened.decision, estimate);
    expect(retry.allowed).toBe(false);
    expect(opened.budget.snapshot().retainedUsd).toBeGreaterThan(0);
    expect(opened.budget.snapshot().exactUsd).toBe(0);
  });

  it("detects a corrupted payload and does not treat a partial record as complete", () => {
    const store = new ContentAddressedEvidenceStore();
    const record = store.put(contract(), { rules: 1 }, "COMPLETE");
    const corrupt = assessStoredRecord({ ...record, payload: { rules: 99 } }, contract());
    expect(corrupt.status).toBe("CORRUPT");
    store.put(contract({ stage: "partial-stage" }), { rules: 1 }, "PARTIAL");
    const partial = store.read(contract({ stage: "partial-stage" }));
    expect(partial.status).toBe("PARTIAL");
    if (partial.status === "PARTIAL") expect(partial.usableAsComplete).toBe(false);
    const { request } = ready({ contract: contract({ stage: "partial-stage" }), store });
    const decision = preflight(request);
    expect(decision.disposition).toBe("DEFER");
    if (decision.disposition === "DEFER") expect(decision.reason).toBe("PARTIAL_OUTPUT_NOT_COMPLETE");
  });

  it("routes deterministic work to no model and does not substitute a dearer model", () => {
    expect(routeTask("DETERMINISTIC_ONLY", policy()).paid).toBe(false);
    expect(routeTask("UNSUPPORTED", policy()).unsupported).toBe(true);
    const missing = routeTask("AMBIGUOUS_SEMANTIC", { modelByClass: { STRAIGHTFORWARD_EXTRACTION: MODEL } });
    expect(missing.modelId).toBeNull();
    expect(missing.paid).toBe(false);
    expect(missing.reason).toContain("not substituted");
    const risk = routeTask("HIGH_RISK_CONCLUSION", policy());
    expect(risk.legalCorrectnessProven).toBe(false);
    expect(risk.reviewRequired).toBe(true);
    const sameCases = ["DETERMINISTIC_ONLY", "STRAIGHTFORWARD_EXTRACTION", "UNSUPPORTED"] as const;
    const cheap = sameCases.map((task) => routeTask(task, policy()).modelId);
    const alsoCheap = sameCases.map((task) => routeTask(task, { modelByClass: { STRAIGHTFORWARD_EXTRACTION: MODEL, AMBIGUOUS_SEMANTIC: "claude-opus-5" } }).modelId);
    expect(cheap).toEqual(alsoCheap);
  });

  it("ranks false permissions ahead of other risks and does not certify a sample", () => {
    const plan = planVerification([
      { id: "cross", risks: ["HIGH_IMPACT_CROSS_DOCUMENT"] },
      { id: "permission", risks: ["FALSE_PERMISSION"] },
      { id: "unlimited", risks: ["UNSUPPORTED_UNLIMITED_CAPACITY"] },
    ], "SAMPLE_DIAGNOSTIC", 1);
    expect(plan.orderedIds).toEqual(["permission"]);
    expect(plan.exhaustive).toBe(false);
    expect(plan.advancesCertification).toBe(false);
    const all = planVerification([
      { id: "permission", risks: ["FALSE_PERMISSION"] },
      { id: "amendment", risks: ["INCORRECT_AMENDMENT_PRECEDENCE"] },
    ], "EXHAUSTIVE_CERTIFICATION", null);
    expect(all.orderedIds).toEqual(["permission", "amendment"]);
    expect(all.advancesCertification).toBe(false);
  });

  it("reads the sealed Gibraltar verification record without treating refusals as zero-priced sections", () => {
    const raw = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/verification.json", "utf8")) as {
      spend: { exactSpendUsd: number };
      attempts: { normalizedSourceRef: string; operativeChars: number; committedUsd: number; compile: { inputTokens: number; outputTokens: number; rules: number }; verify: { status: string | null; costUsd: number } }[];
    };
    const rows: RetainedCostAttempt[] = raw.attempts.map((attempt) => ({
      ref: attempt.normalizedSourceRef,
      operativeChars: attempt.operativeChars,
      committedUsd: attempt.committedUsd,
      inputTokens: attempt.compile.inputTokens,
      outputTokens: attempt.compile.outputTokens,
      rules: attempt.compile.rules,
      verifyStatus: attempt.verify?.status ?? null,
      verifyCostUsd: attempt.verify?.costUsd ?? null,
    }));
    const costs = incrementalCosts(rows);
    const exact = costs.filter((row) => row.billing === "EXACT");
    const refusals = costs.filter((row) => row.billing === "ZERO_TOKEN_REFUSAL");
    const spent = Number(exact.reduce((sum, row) => sum + (row.incrementalUsd ?? 0), 0).toFixed(6));
    expect(raw.spend.exactSpendUsd).toBe(8.777854);
    expect(spent).toBe(8.777854);
    expect(exact).toHaveLength(16);
    expect(refusals).toHaveLength(35);
    expect(exact.reduce((sum, row) => sum + (row.rules ?? 0), 0)).toBe(74);
    expect(exact.some((row) => row.verifyStatus === "VERIFIED_NO_MATERIAL_GAP_FOUND")).toBe(false);
    const contents = exact.filter((row) => (row.ref === "7.04" && row.operativeChars === 39) || (row.ref === "7.05" && row.operativeChars === 40));
    expect(Number(contents.reduce((sum, row) => sum + (row.incrementalUsd ?? 0), 0).toFixed(6))).toBe(1.72644);
    const execution = JSON.parse(readFileSync("tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/execution.json", "utf8")) as { passB: { inputTokens: number; outputTokens: number; modelCalls: number } };
    expect(execution.passB.inputTokens).toBe(433957);
    expect(execution.passB.outputTokens).toBe(172238);
    expect(execution.passB.modelCalls).toBe(140);
    expect(priceUsage({ inputTokens: execution.passB.inputTokens, outputTokens: execution.passB.outputTokens }, HAIKU).pricingStatus).toBe("UNKNOWN_MODEL");
  });
});
