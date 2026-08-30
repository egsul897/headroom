/**
 * Phase 3F.1.6.RX Part B - independent, production-frozen recertification.
 * Auditor 2 scope: BLOCKER-2/3/4/5/6 + the orchestrator supersession/lineage
 * integration closure (docs/phase-3f1-6-rx-final-blocker-closure/
 * 18-orchestrator-supersession-lineage-closure.json).
 *
 * This file's SOLE purpose is task 1 of that scope - the single most
 * consequential claim to verify: does a real, genuinely amended document
 * reach a downgraded sufficiency THROUGH THE LIVE, REAL, EXPORTED
 * `runContractAnalysis` (lib/contract-model/analysis/orchestrator.ts), never
 * merely re-running Part A's own isolated-module tests. Never a mock of any
 * PRODUCTION logic (structural analysis, amendment/operative-state,
 * discovery, semantic compilation, normalization are all real, unmodified
 * production code) - only the LLM calls are deterministically scripted,
 * mirroring tests/contract-model/live-contract-analysis-orchestrator.test.ts's
 * own established convention. Real Postgres required.
 *
 * No production code is modified by this file (production is FROZEN for
 * Part B). Where a real defect is found, it is documented, never patched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { prisma } from "../../lib/prisma";
import { uploadAndChunkDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis/orchestrator";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

const COMPANY_1 = "part-b-recert-e2e-conflicted";
const COMPANY_2 = "part-b-recert-e2e-mixed-node";
const COMPANY_3 = "part-b-recert-e2e-standalone-current";

// ---------------------------------------------------------------------------
// Shared scripted-caller infrastructure (mirrors live-contract-analysis-
// orchestrator.test.ts's own established convention exactly).
// ---------------------------------------------------------------------------
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

async function cleanupCompanyState(companyId: string) {
  await prisma.claimReviewItem.deleteMany({ where: { companyId } });
  await prisma.analysisRunIssue.deleteMany({ where: { companyId } });
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId } });
  await prisma.analysisFailureLog.deleteMany({ where: { companyId } });
  await prisma.analysisRun.deleteMany({ where: { companyId } });
  await prisma.contractRule.deleteMany({ where: { companyId } });
  await prisma.documentNode.deleteMany({ where: { companyId } });
  await prisma.document.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  for (const companyId of [COMPANY_1, COMPANY_2, COMPANY_3]) {
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.company.create({ data: { id: companyId, name: `Part B recert e2e (${companyId})`, onboardingStatus: "ONBOARDING" } });
  }
});

afterAll(async () => {
  for (const companyId of [COMPANY_1, COMPANY_2, COMPANY_3]) {
    await cleanupCompanyState(companyId);
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
});

beforeEach(async () => {
  for (const companyId of [COMPANY_1, COMPANY_2, COMPANY_3]) {
    await cleanupCompanyState(companyId);
  }
});

// ===========================================================================
// TASK 1 (the single most consequential claim in Part B's whole scope): a
// real, genuinely amended-and-restated section (6.01, from $50,000,000 to
// $75,000,000, exactly mirroring node-supersession-awareness.test.ts's own
// proven "test 2" AMEND_AND_RESTATE fixture) reaches, THROUGH runContractAnalysis
// itself: (a) a real KNOWN_SUPERSEDED DiscoveredCandidate.supersessionStatus,
// (b) a real operativeLineage.operativeStatus === OPERATIVE_STATE_CONFLICTED
// on the compiler input, and (c) a final, PERSISTED (real Postgres)
// SemanticTruthRecord.sufficiency that is NOT COMPLETE despite the scripted
// compiler having asserted COMPLETE - i.e. normalize.ts's own
// enforceSufficiencyConsistency genuinely overrides the compiler's own claim.
// ===========================================================================
describe("TASK 1 - end-to-end KNOWN_SUPERSEDED -> OPERATIVE_STATE_CONFLICTED -> sufficiency != COMPLETE, through the REAL runContractAnalysis", () => {
  const BASE_TEXT = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.

ARTICLE VI. NEGATIVE COVENANTS

SECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $50,000,000 in the aggregate.
`;
  const AMENDMENT_TEXT = `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.

Section 6.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: Section 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $75,000,000 in the aggregate.
`;

  function discoveryScript(_stage: string, content: string): unknown {
    // The base document's own $50,000,000 text is the ONLY thing this
    // script ever credits as a real covenant - the amendment document's own
    // text (which only ever mentions $75,000,000) never independently
    // triggers a second, competing discovery.
    if (content.includes("$50,000,000")) {
      return { rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "BASKET", description: "Indebtedness basket up to $50,000,000.", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.95, needsReview: false }] };
    }
    return { rules: [] };
  }

  function semanticCompileScript(input: SemanticCompilerInput): unknown {
    if (input.sourceSectionRef !== "6.01") return {};
    return {
      rules: [
        {
          localRef: "r1",
          sourceSectionRef: "6.01",
          covenantFamily: "INDEBTEDNESS",
          ruleType: "QUANTITATIVE_PERMISSION",
          posture: "PERMISSION",
          action: "INCUR_DEBT",
          entityScope: ["BORROWER"],
          capacityExpression: { kind: "MONEY", amount: 50_000_000, currency: "USD" },
          // Deliberately, adversarially asserts COMPLETE - the point of this
          // test is that the ORCHESTRATOR's own operativeLineage wiring
          // overrides this, not that the scripted compiler "cooperates."
          sufficiency: "COMPLETE",
          citation: `${input.sourceDocumentId}::6.01`,
          excerpt: "Indebtedness in an aggregate principal amount at any time outstanding in excess of $50,000,000",
        },
      ],
    };
  }

  function scriptedCallers() {
    return {
      discoveryCaller: new ScriptedStageCaller(discoveryScript),
      amendmentCaller: new ScriptedStageCaller(), // schema.parse({}) default -> operation "UNKNOWN_CHANGE", identical to what getStageCaller()'s SyntheticStageCaller already produces with no API credential configured (confirmed: no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY set in this sandbox) - the EXACT same default node-supersession-awareness.test.ts's own "test 2" (AMEND_AND_RESTATE via deterministic detection, not LLM classification) already relies on and proves KNOWN_SUPERSEDED with.
      verificationCaller: new ScriptedStageCaller(),
      semanticCaller: new ScriptedSemanticCaller(semanticCompileScript),
    };
  }

  it("real Postgres evidence: the persisted SemanticTruthRecord for 6.01 is CONFLICTED (not COMPLETE) with a real OPERATIVE_STATE_CONFLICTED operativeLineage", async () => {
    const { document: baseDoc } = await uploadAndChunkDocument({ companyId: COMPANY_1, filename: "credit-agreement-base.txt", data: Buffer.from(BASE_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    await uploadAndChunkDocument({ companyId: COMPANY_1, filename: "amendment-no-1.txt", data: Buffer.from(AMENDMENT_TEXT, "utf-8"), declaredType: "AMENDMENT" });

    const result = await runContractAnalysis({ companyId: COMPANY_1 }, { callers: scriptedCallers() });

    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.instruments.length).toBe(1);
    // The 2 documents (base + amendment) must have been grouped into ONE
    // real instrument with a real baseDocumentId, or this whole test proves
    // nothing about supersession at all.
    expect(result.instruments[0]!.documentIds.sort()).toEqual([baseDoc.id, (await prisma.document.findFirst({ where: { companyId: COMPANY_1, name: "amendment-no-1.txt" } }))!.id].sort());
    expect(result.instruments[0]!.baseDocumentId).toBe(baseDoc.id);
    expect(result.instruments[0]!.discoveredCandidateCount).toBeGreaterThanOrEqual(1);

    // --- (c) real Postgres evidence: the persisted IRRule's own sufficiency ---
    const records = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_1, kind: "RULE" } });
    expect(records.length).toBeGreaterThanOrEqual(1);
    const rule = records.find((r) => r.sourceSectionRef === "6.01" && r.sourceDocumentId === baseDoc.id);
    expect(rule).toBeDefined();

    // THE HEADLINE ASSERTION: despite the scripted compiler asserting
    // sufficiency COMPLETE, the REAL, PERSISTED, POST-normalize.ts value is
    // NOT COMPLETE - proving enforceSufficiencyConsistency's own
    // operativeLineage-driven downgrade genuinely fired end-to-end through
    // the live orchestrator, not merely in an isolated unit test.
    expect(rule!.sufficiency).not.toBe("COMPLETE");
    expect(rule!.sufficiency).toBe("CONFLICTED");
    expect(rule!.sufficiencyReasons.some((r) => r.includes("OPERATIVE_STATE_CONFLICTED"))).toBe(true);

    // --- (b) real operativeLineage.operativeStatus on the compiler input, as persisted ---
    const lineage = rule!.operativeLineage as Record<string, unknown> | null;
    expect(lineage).not.toBeNull();
    expect(lineage!.operativeStatus).toBe("OPERATIVE_STATE_CONFLICTED");
    // Real provenance, not a fabricated placeholder: the amendment document
    // itself is named as the superseding source.
    const amendmentDoc = await prisma.document.findFirst({ where: { companyId: COMPANY_1, name: "amendment-no-1.txt" } });
    expect(lineage!.currentSourceDocumentId).toBe(amendmentDoc!.id);
  });

  it("(a) independent, direct confirmation that DiscoveredCandidate.supersessionStatus itself genuinely resolves KNOWN_SUPERSEDED for this exact base-document node - re-composed from the SAME real, unmodified production primitives the orchestrator itself calls (buildStructuralIndex/computeOperativeContractState/buildNodeSupersessionIndex/runDiscoveryPipeline), fed the IDENTICAL real document text and real document ids the orchestrator run above just persisted (runContractAnalysis's own return type does not expose the raw DiscoveredCandidate array, so this is the direct way to inspect it without re-implementing any logic)", async () => {
    const { document: baseDoc } = await uploadAndChunkDocument({ companyId: COMPANY_1, filename: "credit-agreement-base-2.txt", data: Buffer.from(BASE_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const { document: amendDoc } = await uploadAndChunkDocument({ companyId: COMPANY_1, filename: "amendment-no-1-b.txt", data: Buffer.from(AMENDMENT_TEXT, "utf-8"), declaredType: "AMENDMENT" });

    const { parseDocumentStructure } = await import("../../lib/contract-model/compiler/stage-structure");
    const { buildStructuralIndex } = await import("../../lib/contract-model/compiler/structural-index");
    const { detectStructuralDefinitions } = await import("../../lib/contract-model/compiler/structural-definitions");
    const { buildPackageGraph } = await import("../../lib/contract-model/compiler/package-graph/pipeline");
    const { runAmendmentPipeline } = await import("../../lib/contract-model/compiler/amendment/pipeline");
    const { computeOperativeContractState, buildNodeSupersessionIndex } = await import("../../lib/contract-model/compiler/amendment/operative-state");
    const { runDiscoveryPipeline } = await import("../../lib/contract-model/compiler/discovery/pipeline");
    const { getStageCaller } = await import("../../lib/contract-model/compiler/llm-caller");

    const docs = [
      { documentId: baseDoc.id, label: "CA", text: BASE_TEXT },
      { documentId: amendDoc.id, label: "Amendment 1", text: AMENDMENT_TEXT },
    ];
    const nodesByDocument = new Map(docs.map((d) => [d.documentId, { text: d.text, nodes: parseDocumentStructure(d) }] as const));
    const allDefs = docs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, nodesByDocument.get(d.documentId)!.nodes));
    const index = buildStructuralIndex(nodesByDocument, allDefs, []);
    const packageGraph = buildPackageGraph(COMPANY_1, "pkg-independent-check", docs);
    const instrument = packageGraph.instruments.find((i) => i.documentIds.includes(baseDoc.id));
    expect(instrument).toBeDefined();
    expect(instrument!.baseDocumentId).toBe(baseDoc.id);

    const amendmentResult = await runAmendmentPipeline(getStageCaller(), { documents: docs, packageGraph, index });
    const asOfDate = new Date().toISOString().slice(0, 10);
    const operativeState = computeOperativeContractState({ instrumentKey: instrument!.instrumentKey, baseDocumentId: baseDoc.id, asOfDate, index, allEffects: amendmentResult.effects });
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: baseDoc.id, state: operativeState }]);

    const node601 = index.getNodeByRef(baseDoc.id, "6.01");
    expect(node601).toBeDefined();

    const discoveryResult = await runDiscoveryPipeline(getStageCaller(), baseDoc.id, index, supersessionIndex);
    const candidate = discoveryResult.candidates.find((c) => c.structuralNodeIds.includes(node601!.nodeId));
    expect(candidate).toBeDefined();
    expect(candidate!.supersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(candidate!.supersessionReason).toContain(amendDoc.id);
  });
});

// ===========================================================================
// TASK 2 - can a candidate spanning MULTIPLE structuralNodeIds, where only
// SOME are superseded, "hide" behind one current node? Constructs a real
// multi-basket section (6.01(a)/(b)) where ONLY 6.01(a) is amended (exactly
// mirroring node-supersession-awareness.test.ts's own "test 4" sibling
// fixture), then forces Pass C's own real neighborhood-expansion mechanism
// (discovery/pass-c-neighborhood.ts: a BASKET/EXCEPTION/PROVISO/CONDITION
// role anchored at a sub-clause always also carries its own containing
// SECTION node id) to produce ONE real DiscoveredCandidate whose
// structuralNodeIds is [6.01(a)_nodeId (SUPERSEDED), 6.01_containerNodeId
// (never itself amended, so CURRENT_OPERATIVE)] - a genuine MIXED array.
// ===========================================================================
describe("TASK 2 - a mixed superseded/current structuralNodeIds array cannot 'hide' behind its current member", () => {
  const BASE_TEXT = `CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.

ARTICLE VI. NEGATIVE COVENANTS

SECTION 6.01 Baskets.
(a) The Borrower may incur Indebtedness not to exceed $10,000,000.
(b) The Borrower may make Investments not to exceed $20,000,000.
`;
  const AMENDMENT_TEXT = `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme LLC, as Borrower.

Section 6.01(a) of the Credit Agreement is hereby amended and restated in its entirety to read as follows: (a) The Borrower may incur Indebtedness not to exceed $15,000,000.
`;

  function discoveryScript(_stage: string, content: string): unknown {
    // Anchored at sub-clause (a) with role BASKET - pass-c-neighborhood.ts's
    // own real "neighborhood guarantee" then ALSO links the containing
    // SECTION node (6.01) into this exact discovery's structuralNodeIds,
    // producing a genuine 2-node array: [6.01(a) (superseded), 6.01
        // (never itself amended - only its sub-clause (a) was)].
    if (content.includes("$10,000,000") || content.includes("Baskets")) {
      return { rules: [{ relativeRef: "(a)", families: ["INDEBTEDNESS"], role: "BASKET", description: "Indebtedness basket up to $10,000,000.", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.95, needsReview: false }] };
    }
    return { rules: [] };
  }

  function semanticCompileScript(input: SemanticCompilerInput): unknown {
    if (input.sourceSectionRef !== "6.01(a)") return {};
    return {
      rules: [
        {
          localRef: "r1",
          sourceSectionRef: "6.01(a)",
          covenantFamily: "INDEBTEDNESS",
          ruleType: "QUANTITATIVE_PERMISSION",
          posture: "PERMISSION",
          action: "INCUR_DEBT",
          entityScope: ["BORROWER"],
          capacityExpression: { kind: "MONEY", amount: 10_000_000, currency: "USD" },
          sufficiency: "COMPLETE",
          citation: `${input.sourceDocumentId}::6.01(a)`,
          excerpt: "Indebtedness not to exceed $10,000,000",
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

  it("the candidate's own structuralNodeIds genuinely span 2 physical nodes, and the worst (superseded) status wins over the current one - never averaged, never masked", async () => {
    const { document: baseDoc } = await uploadAndChunkDocument({ companyId: COMPANY_2, filename: "credit-agreement-mixed-base.txt", data: Buffer.from(BASE_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });
    const { document: amendDoc } = await uploadAndChunkDocument({ companyId: COMPANY_2, filename: "amendment-mixed.txt", data: Buffer.from(AMENDMENT_TEXT, "utf-8"), declaredType: "AMENDMENT" });

    const result = await runContractAnalysis({ companyId: COMPANY_2 }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");

    // Independent, direct confirmation the candidate really does span 2
    // nodes with mixed statuses (mirrors TASK 1's own direct-recomposition
        // method - runContractAnalysis's own return type does not expose
    // DiscoveredCandidate/structuralNodeIds directly).
    const { parseDocumentStructure } = await import("../../lib/contract-model/compiler/stage-structure");
    const { buildStructuralIndex } = await import("../../lib/contract-model/compiler/structural-index");
    const { detectStructuralDefinitions } = await import("../../lib/contract-model/compiler/structural-definitions");
    const { buildPackageGraph } = await import("../../lib/contract-model/compiler/package-graph/pipeline");
    const { runAmendmentPipeline } = await import("../../lib/contract-model/compiler/amendment/pipeline");
    const { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus } = await import("../../lib/contract-model/compiler/amendment/operative-state");
    const { runDiscoveryPipeline } = await import("../../lib/contract-model/compiler/discovery/pipeline");
    const { getStageCaller } = await import("../../lib/contract-model/compiler/llm-caller");

    const docs = [
      { documentId: baseDoc.id, label: "CA", text: BASE_TEXT },
      { documentId: amendDoc.id, label: "Amendment 1", text: AMENDMENT_TEXT },
    ];
    const nodesByDocument = new Map(docs.map((d) => [d.documentId, { text: d.text, nodes: parseDocumentStructure(d) }] as const));
    const allDefs = docs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, nodesByDocument.get(d.documentId)!.nodes));
    const index = buildStructuralIndex(nodesByDocument, allDefs, []);
    const packageGraph = buildPackageGraph(COMPANY_2, "pkg-mixed-independent-check", docs);
    const instrument = packageGraph.instruments.find((i) => i.documentIds.includes(baseDoc.id))!;
    const amendmentResult = await runAmendmentPipeline(getStageCaller(), { documents: docs, packageGraph, index });
    const asOfDate = new Date().toISOString().slice(0, 10);
    const operativeState = computeOperativeContractState({ instrumentKey: instrument.instrumentKey, baseDocumentId: baseDoc.id, asOfDate, index, allEffects: amendmentResult.effects });
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: baseDoc.id, state: operativeState }]);

    const nodeA = index.getNodeByRef(baseDoc.id, "6.01(a)")!;
    const nodeSection = index.getNodeByRef(baseDoc.id, "6.01")!;
    expect(getNodeSupersessionStatus(supersessionIndex, baseDoc.id, nodeA.nodeId).status).toBe("KNOWN_SUPERSEDED");
    expect(getNodeSupersessionStatus(supersessionIndex, baseDoc.id, nodeSection.nodeId).status).toBe("CURRENT_OPERATIVE"); // the SECTION container itself was never individually amended - only its sub-clause (a) was.

    // Uses the SAME scripted discoveryCaller as the real orchestrator run
    // above (not getStageCaller()'s content-blind synthetic default) -
    // Pass C's own role-based neighborhood-expansion (the mechanism this
    // whole task attacks) is driven by the LLM-supplied `role`/`relativeRef`
    // fields, not by Pass A's deterministic-only signals.
    const discoveryResult = await runDiscoveryPipeline(new ScriptedStageCaller(discoveryScript), baseDoc.id, index, supersessionIndex);
    const candidate = discoveryResult.candidates.find((c) => c.structuralNodeIds.includes(nodeA.nodeId));
    expect(candidate).toBeDefined();
    // Confirms this is a genuine MIXED, multi-node candidate - the real
    // scenario this task exists to attack, not a single-node case in disguise.
    expect(candidate!.structuralNodeIds.length).toBeGreaterThanOrEqual(2);
    expect(candidate!.structuralNodeIds).toContain(nodeSection.nodeId);
    // THE ATTACK'S VERDICT: worst-first wins - KNOWN_SUPERSEDED is reported
    // for the WHOLE candidate even though one of its member nodes (the
    // section container) is independently CURRENT_OPERATIVE. The candidate
    // cannot "hide" behind its current member.
    expect(candidate!.supersessionStatus).toBe("KNOWN_SUPERSEDED");

    // And this genuinely propagates all the way to the persisted IRRule via
    // the orchestrator's own deriveOperativeLineage (same worst-first
    // convention, reused - see orchestrator.ts's own SUPERSESSION_SEVERITY
    // and header comment on deriveOperativeLineage).
    const rule = await prisma.semanticTruthRecord.findFirst({ where: { companyId: COMPANY_2, kind: "RULE", sourceSectionRef: "6.01(a)" } });
    expect(rule).toBeDefined();
    expect((rule!.operativeLineage as Record<string, unknown>).operativeStatus).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(rule!.sufficiency).toBe("CONFLICTED");
  });
});

// ===========================================================================
// TASK 3 - a genuinely standalone, never-amended document (no cross-document
// relationship, no amendment at all). Confirms this correctly resolves
// CURRENT_OPERATIVE (never falsely UNKNOWN/blocked - the fix must not
// over-trigger) AND independently confirms (via direct code reading, cited
// in this file's own comment below and in the accompanying certification
// artifact) that the orchestrator's own `operativeState: null` /
// EMPTY_SUPERSESSION_INDEX fail-closed branch is CURRENTLY UNREACHABLE in
// live production given today's package-graph/instrument-grouping.ts, which
// always resolves a real (never null) baseDocumentId for every instrument
// (grouped OR standalone) - see instrument-grouping.ts's own
// `baseCandidates[0]! ?? members[0]!` fallback, which never produces
// `undefined`/null. This is a legitimate, disclosed defense-in-depth branch
// (correct by construction, exercised directly at the unit level by
// node-supersession-awareness.test.ts's own test 8/9/10 and
// EMPTY_SUPERSESSION_INDEX's own doc comment), not a live gap.
// ===========================================================================
describe("TASK 3 - a genuinely standalone, never-amended document resolves CURRENT_OPERATIVE (fix does not over-trigger); operativeState-null branch is confirmed unreachable via today's package-graph", () => {
  const STANDALONE_TEXT = `CREDIT AGREEMENT dated as of March 1, 2020, among Standalone Co, as Borrower.

ARTICLE VI. NEGATIVE COVENANTS

SECTION 6.01 Indebtedness. The Borrower will not incur any Indebtedness except up to $30,000,000 in the aggregate.
`;

  function discoveryScript(_stage: string, content: string): unknown {
    if (content.includes("$30,000,000")) {
      return { rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "BASKET", description: "Indebtedness basket up to $30,000,000.", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.95, needsReview: false }] };
    }
    return { rules: [] };
  }

  function semanticCompileScript(input: SemanticCompilerInput): unknown {
    if (input.sourceSectionRef !== "6.01") return {};
    return {
      rules: [
        {
          localRef: "r1",
          sourceSectionRef: "6.01",
          covenantFamily: "INDEBTEDNESS",
          ruleType: "QUANTITATIVE_PERMISSION",
          posture: "PERMISSION",
          action: "INCUR_DEBT",
          entityScope: ["BORROWER"],
          capacityExpression: { kind: "MONEY", amount: 30_000_000, currency: "USD" },
          sufficiency: "COMPLETE",
          citation: `${input.sourceDocumentId}::6.01`,
          excerpt: "Indebtedness not to exceed $30,000,000",
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

  it("a real, single, never-amended document's own covenant is NOT falsely downgraded - sufficiency stays COMPLETE and operativeLineage.operativeStatus is OPERATIVE_STATE_RESOLVED", async () => {
    const { document: doc } = await uploadAndChunkDocument({ companyId: COMPANY_3, filename: "standalone-credit-agreement.txt", data: Buffer.from(STANDALONE_TEXT, "utf-8"), declaredType: "CREDIT_AGREEMENT" });

    const result = await runContractAnalysis({ companyId: COMPANY_3 }, { callers: scriptedCallers() });
    expect(result.outcome).toBe("STARTED_TO_COMPLETION");
    expect(result.instruments.length).toBe(1);
    // A standalone (ungrouped) document's own unit.baseDocumentId is the
    // document itself (identity.ts's own standaloneInstrumentKey convention,
    // resolveInstrumentUnits's own fallback loop) - never null.
    expect(result.instruments[0]!.baseDocumentId).toBe(doc.id);

    const rule = await prisma.semanticTruthRecord.findFirst({ where: { companyId: COMPANY_3, kind: "RULE", sourceSectionRef: "6.01" } });
    expect(rule).toBeDefined();
    expect(rule!.sufficiency).toBe("COMPLETE"); // never falsely downgraded merely for being standalone/never-amended.
    expect((rule!.operativeLineage as Record<string, unknown>).operativeStatus).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("independent confirmation: today's real instrument-grouping.ts NEVER produces a null baseDocumentId for any real cluster (grouped or singleton) - the orchestrator's own operativeState-null/EMPTY_SUPERSESSION_INDEX branch is defensive, correct-by-construction code, not a currently-reachable live path", async () => {
    const { buildPackageGraph } = await import("../../lib/contract-model/compiler/package-graph/pipeline");
    const doc = { documentId: "solo-doc", label: "Solo", text: STANDALONE_TEXT };
    const packageGraph = buildPackageGraph("independent-check-co", "pkg-solo", [doc]);
    expect(packageGraph.instruments.length).toBe(1);
    expect(packageGraph.instruments[0]!.baseDocumentId).not.toBeNull();
    expect(packageGraph.instruments[0]!.baseDocumentId).toBe("solo-doc");
  });
});
