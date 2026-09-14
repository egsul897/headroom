/**
 * F-4 (Phase 3 Chewy remediation) - VERIFIER AUTHENTICATED RETRIEVED-SOURCE EVIDENCE.
 *
 * Root cause under test (docs/phase-3-remediation-f4/00-diagnosis-and-reproduction.json): the compiler retrieved a
 * definition outside the candidate's operative window via its evidence tool, compiled its figures into IR, and the
 * verifier - which inventoried the window only and had no authenticated record of the retrieval - reported every
 * such figure IR_ONLY / UNSUPPORTED_IR_ADDITION (MATERIAL). Nothing here is specific to any term, section or
 * package: every fixture is synthetic and generic.
 *
 * Sections: mission §12 adversarial A-F, §13 synthetic A-F, §17 verifier independence, §18 package isolation,
 * §19 evidence-set identity, §25 compiler-side evidence record.
 */
import { describe, expect, it } from "vitest";
import { buildTestIndex } from "./context-retrieval-test-utils";
import { emptyContextBundle, testCompilerInput, TEST_COMPANY_ID, TEST_INSTRUMENT_KEY } from "./semantic-compiler/test-helpers";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildVerifierUserContent } from "../../lib/contract-model/compiler/semantic-verification/reviewer";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { buildIrInventory } from "../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { reconcileInventories } from "../../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildRetrievedEvidenceInventory, citationNamesDefinition, collectAdmissibleEvidence, packageDocumentIds } from "../../lib/contract-model/compiler/semantic-verification/retrieved-evidence";
import type { AdmissibleEvidenceSet, VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import { EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildToolSet, ToolRunner } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import type { RetrievedSourceRecord, SemanticCompilationResult, SemanticCompilerInput, ToolCallLogEntry } from "../../lib/contract-model/compiler/semantic/types";
import { computeSourceContentHash } from "../../lib/contract-model/compiler/hashing";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import type { PackageGraphResult } from "../../lib/contract-model/compiler/package-graph/types";
import type { IRDefinition, IRExpression, IRRule } from "../../lib/contract-model/ir/types";

// ---------------------------------------------------------------------------
// Generic synthetic fixtures
// ---------------------------------------------------------------------------

/** A base credit agreement: definitions in Article I (outside any covenant window), the covenant in Section 6.08. */
const BASE_DOC = [
  "SECTION 1.01. Defined Terms .",
  "“Consolidated EBITDA” means net income plus interest, taxes, depreciation and amortization, minus extraordinary gains not to exceed $2,000,000 in any fiscal year.",
  "“Threshold Amount” means the greater of (a) $100,000,000 and (b) 20% of Consolidated EBITDA for the most recently ended Test Period.",
  "“Unrelated Amount” means $5,000,000.",
  "SECTION 6.08. Restricted Payments . The Borrower shall not make any Restricted Payment unless no Default has occurred and the aggregate amount of such Restricted Payments does not exceed the Threshold Amount.",
  "SECTION 7.01. Reporting . The Borrower shall deliver financial statements within 90 days after each fiscal year.",
].join("\n");

const HOME = "doc-a";

function index(text = BASE_DOC, documentId = HOME, extra: { documentId: string; text: string }[] = []): StructuralIndex {
  return buildTestIndex([{ documentId, label: "CA", text }, ...extra.map((e) => ({ documentId: e.documentId, label: "X", text: e.text }))]);
}

let exprCounter = 0;
const provenance = (sourceCitation: string, documentId = HOME) => ({ documentId, sourceNodeKey: null, sourceCitation, excerpt: null });
const money = (amount: number, citation: string): IRExpression => ({ exprId: `e${++exprCounter}`, kind: "MONEY", type: "MONEY", amount, currency: "USD", provenance: provenance(citation) }) as unknown as IRExpression;
const percent = (value: number, citation: string): IRExpression => ({ exprId: `e${++exprCounter}`, kind: "PERCENT", type: "PERCENT", value, provenance: provenance(citation) }) as unknown as IRExpression;
const metric = (metricName: string): IRExpression => ({ exprId: `e${++exprCounter}`, kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: TEST_COMPANY_ID, instrumentKey: TEST_INSTRUMENT_KEY, resolvedDefinitionId: null }) as unknown as IRExpression;
const max = (...operands: IRExpression[]): IRExpression => ({ exprId: `e${++exprCounter}`, kind: "MAX", type: "MONEY", operands }) as unknown as IRExpression;
const multiply = (...operands: IRExpression[]): IRExpression => ({ exprId: `e${++exprCounter}`, kind: "MULTIPLY", type: "MONEY", operands }) as unknown as IRExpression;

function definition(termName: string, calculationExpression: IRExpression | null, opts: { id?: string; dependsOnTerms?: string[]; sufficiency?: string } = {}): IRDefinition {
  return {
    definitionId: opts.id ?? `ir-definition:${termName.toLowerCase().replace(/\s+/g, "-")}`,
    irSchemaVersion: "v1",
    companyId: TEST_COMPANY_ID,
    instrumentKey: TEST_INSTRUMENT_KEY,
    sourceDocumentId: HOME,
    termName,
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    calculationExpression,
    dependsOnTerms: opts.dependsOnTerms ?? [],
    sufficiency: opts.sufficiency ?? "COMPLETE",
    sufficiencyReasons: [],
    provenance: provenance(`Definition of "${termName}" (retrieved via tool)`),
    compilerVersion: "v1",
    sourceContentVersion: null,
  } as unknown as IRDefinition;
}

let ruleCounter = 0;
function rule(capacityExpression: IRExpression | null, sourceSectionRef = "6.08"): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:test-${ruleCounter}`,
    irSchemaVersion: "v1",
    companyId: TEST_COMPANY_ID,
    instrumentKey: TEST_INSTRUMENT_KEY,
    sourceDocumentId: HOME,
    sourceSectionRef,
    covenantFamily: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: provenance(`§${sourceSectionRef}`),
    compilerVersion: "v1",
    sourceContentVersion: null,
  } as unknown as IRRule;
}

/** A legacy (pre-F-4) tool-call log entry: the compiler's claim with no authenticable record - exactly the frozen Chewy shape. */
function legacyDefinitionCall(term: string, charsReturned = 100): ToolCallLogEntry {
  return { toolName: "getDefinition", input: { term }, outputSummary: `definition "${term}" (status OPERATIVE_STATE_RESOLVED, evidence CURRENT)`, charsReturned, timestamp: "2026-01-01T00:00:00.000Z", evidenceUnresolved: false, evidenceTruncated: false };
}

function compilation(overrides: Partial<SemanticCompilationResult>): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "k", compiledAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

/** Builds a VerificationInput whose operative window is exactly the OWN text of `sectionRef` in the home document of `idx`. */
function makeInput(idx: StructuralIndex, opts: { rules?: IRRule[]; definitions?: IRDefinition[]; toolCallLog?: ToolCallLogEntry[]; operativeState?: OperativeContractState | null; packageGraph?: PackageGraphResult | null; sectionRef?: string; sourceDocumentId?: string }): VerificationInput {
  const sectionRef = opts.sectionRef ?? "6.08";
  const sourceDocumentId = opts.sourceDocumentId ?? HOME;
  const node = idx.resolveUniqueNodeByRef(sourceDocumentId, sectionRef);
  if (node.status !== "UNIQUE") throw new Error(`fixture: section ${sectionRef} not unique in ${sourceDocumentId}`);
  const operativeSourceText = idx.getNodeText(node.node.nodeId, "OWN");
  const contextBundle = emptyContextBundle();
  const compilerInput: SemanticCompilerInput = testCompilerInput({
    sourceDocumentId,
    sourceSectionRef: sectionRef,
    operativeSourceText,
    operativeCharStart: node.node.charStart,
    contextBundle,
    toolAccess: { structuralIndex: idx, operativeState: opts.operativeState ?? null, packageGraph: opts.packageGraph ?? null, amendmentEffects: null, contextBundle },
  });
  return { compilerInput, compilationResult: compilation({ rules: opts.rules ?? [], definitions: opts.definitions ?? [], toolCallLog: opts.toolCallLog ?? [] }) };
}

function layer1(input: VerificationInput) {
  const { compilerInput, compilationResult } = input;
  const source = buildSourceInventory(compilerInput.candidateRef, compilerInput.operativeSourceText, compilerInput.sourceDocumentId, compilerInput.sourceSectionRef ?? "?", null);
  const ir = buildIrInventory(compilerInput.candidateRef, compilationResult.rules, compilationResult.definitions);
  const evidence = collectAdmissibleEvidence(input, ir, { supersessionIndex: EMPTY_SUPERSESSION_INDEX });
  const retrieved = buildRetrievedEvidenceInventory(compilerInput.candidateRef, evidence, compilationResult.definitions, EMPTY_SUPERSESSION_INDEX);
  const reconciliation = reconcileInventories(source, ir, retrieved);
  const before = reconcileInventories(source, ir, null);
  return { source, ir, evidence, retrieved, reconciliation, before };
}

const authenticText = (idx: StructuralIndex, term: string, documentId = HOME) => idx.getDefinitionFullText(term, documentId)!;

function thresholdDefinitionIr(): IRDefinition {
  return definition("Threshold Amount", max(money(100_000_000, "Definition of Threshold Amount"), multiply(percent(0.2, "Definition of Threshold Amount"), metric("Consolidated EBITDA"))), { dependsOnTerms: ["Consolidated EBITDA"] });
}

/** A Phase 2G DEFINITION view - the shape computeOperativeContractState produces; hand-built here exactly like the established tools tests do. */
function definitionView(term: string, currentText: string | null, status: OperativeProvisionView["status"], extra: Partial<OperativeProvisionView> = {}): OperativeProvisionView {
  return {
    instrumentKey: TEST_INSTRUMENT_KEY,
    provisionKey: `${TEST_INSTRUMENT_KEY}::DEFINITION::${term.toLowerCase()}`,
    kind: "DEFINITION",
    documentId: HOME,
    sectionRef: null,
    definedTermRef: term.toLowerCase(),
    asOfDate: "2026-01-01",
    currentSourceDocumentId: "doc-amend-1",
    currentSourceNodeKey: "doc-amend-1::2(a)",
    currentSourceNodeId: "amend-node-2a",
    currentText,
    fullChain: [{ effectId: "eff-1", amendmentDocumentId: "doc-amend-1", operation: "MODIFY_THRESHOLD", effectiveDate: { date: "2025-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "test", reason: "test" }, sourceCitation: "Amendment No. 1 Section 2(a)", appliedAsOfQuery: true }],
    appliedChain: [{ effectId: "eff-1", amendmentDocumentId: "doc-amend-1", operation: "MODIFY_THRESHOLD", effectiveDate: { date: "2025-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "test", reason: "test" }, sourceCitation: "Amendment No. 1 Section 2(a)", appliedAsOfQuery: true }],
    supersededSourceNodeKeys: [],
    supersededSourceNodeIds: [],
    status,
    unresolvedIssues: status === "OPERATIVE_STATE_RESOLVED" ? [] : ["two amendments make incompatible claims about this definition"],
    conflicts: [],
    targetResolutionStatus: "UNIQUE",
    targetResolutionReason: null,
    candidateSourceNodeIds: [],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: currentText,
    reviewRequired: status !== "OPERATIVE_STATE_RESOLVED",
    candidateTexts: [],
    ...extra,
  };
}

const state = (views: OperativeProvisionView[], status: OperativeContractState["status"] = "OPERATIVE_STATE_RESOLVED"): OperativeContractState => ({ instrumentKey: TEST_INSTRUMENT_KEY, asOfDate: "2026-01-01", provisions: views, status, summary: "test", unattachedEffects: [] });

const packageGraphWith = (instruments: { instrumentKey: string; documentIds: string[] }[]): PackageGraphResult => ({ instruments: instruments.map((i) => ({ instrumentKey: i.instrumentKey, name: i.instrumentKey, documentIds: i.documentIds, baseDocumentId: i.documentIds[0] ?? null, confidence: 1, reviewStatus: "RESOLVED" })) }) as unknown as PackageGraphResult;

const irOnlyValues = (r: ReturnType<typeof layer1>["reconciliation"]) => r.items.filter((i) => i.classification === "IR_ONLY").map((i) => i.irItems[0]!.numericValue);

// ---------------------------------------------------------------------------
// §13 synthetic generic scenarios (the fix, positively)
// ---------------------------------------------------------------------------

describe("F-4 §13 - authenticated retrieved-source evidence closes the false IR_ONLY on figures the IR correctly took from a retrieved definition", () => {
  it("A. the root-cause shape (legacy tool log, no record): a definition outside the window, compiled into IR, is re-resolved and authenticated by the verifier and its figures become ACCOUNTED_FOR - before the fix they were IR_ONLY", () => {
    const idx = index();
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const { evidence, reconciliation, before } = layer1(input);

    // BEFORE (local window only): both figures unsupported.
    expect(irOnlyValues(before).sort()).toEqual([0.2, 100_000_000]);

    // AFTER: the verifier's own resolution, authenticated A-G.
    const ev = evidence.authenticated.find((e) => e.requestKey === "Threshold Amount")!;
    expect(ev).toBeDefined();
    expect(ev.provenanceClass).toBe("AUTHENTICATED_RETRIEVED");
    expect(ev.provenanceOrigin).toBe("VERIFIER_INDEPENDENT_RESOLUTION");
    expect(ev.documentId).toBe(HOME);
    expect(ev.documentVersion).toBe("BASE_DOCUMENT");
    expect(ev.rawText).toBe(authenticText(idx, "Threshold Amount"));
    expect(ev.contentHash).toBe(computeSourceContentHash(ev.rawText));
    expect(idx.getDocumentText(HOME)!.slice(ev.charStart!, ev.charEnd!)).toBe(ev.rawText);
    expect(ev.sourceNodeId).not.toBeNull();
    expect(ev.checks.map((c) => c.code).sort()).toEqual(["A_DOCUMENT_IN_PACKAGE", "B_SPAN_RESOLVES", "C_RAW_TEXT_MATCH", "D_HASH_MATCH", "E_OPERATIVE_VERSION", "F_NOT_UNRELATED_DOCUMENT", "G_SPAN_IN_BOUNDS"]);
    expect(ev.checks.every((c) => c.passed)).toBe(true);
    expect(ev.role).toBe("REPRESENTED_DEFINITION");
    expect(ev.duplicatesLocalWindow).toBe(false);
    expect(ev.compilerRecord).toEqual({ present: false, matched: null, toolCallIndexes: [] });
    expect(ev.linkage.map((l) => l.origin)).toEqual(expect.arrayContaining(["COMPILER_TOOL_CALL", "IR_DEFINITION_TERM", "IR_PROVENANCE_CITATION"]));

    expect(irOnlyValues(reconciliation)).toEqual([]);
    const supported = reconciliation.items.filter((i) => i.classification === "ACCOUNTED_FOR" && i.evidence);
    expect(supported.map((i) => i.sourceItem!.numericValue).sort()).toEqual([0.2, 100_000_000]);
    for (const s of supported) {
      expect(s.sourceItem!.provenanceClass).toBe("AUTHENTICATED_RETRIEVED");
      expect(s.evidence).toMatchObject({ provenanceClass: "AUTHENTICATED_RETRIEVED", evidenceId: ev.evidenceId, documentId: HOME, contentHash: ev.contentHash, charStart: ev.charStart, charEnd: ev.charEnd });
      expect(s.reason).toContain("authenticated retrieved source");
    }
    // The compiler's summary string is never what supported the value.
    expect(JSON.stringify(reconciliation)).not.toContain("status OPERATIVE_STATE_RESOLVED, evidence CURRENT");
  });

  it("A (end to end). verifyCompiledCandidate no longer reports UNSUPPORTED_IR_ADDITION for the retrieved definition's figures, and exposes the evidence set", async () => {
    const idx = index();
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.findings.filter((f) => f.findingType === "UNSUPPORTED_IR_ADDITION")).toHaveLength(0);
    expect(result.admissibleEvidence?.authenticated.map((e) => e.requestKey)).toEqual(expect.arrayContaining(["Threshold Amount"]));
    expect(result.evidenceSetHash).toBe(result.admissibleEvidence?.evidenceSetHash);
    expect(result.status).not.toBe("MATERIAL_DISCREPANCY");
  });

  it("B. with a compiler RetrievedSourceRecord produced by the REAL evidence tool, the record is authenticated (present, matched) and the verifier's text still comes from its own resolution", () => {
    const idx = index();
    const access = { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
    const runner = new ToolRunner(buildToolSet(access, HOME, { current: 0 }, DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET);
    runner.run("getDefinition", { term: "Threshold Amount" });
    const entry = runner.log[0]!;
    expect(entry.retrievedSource).toBeDefined();
    expect(entry.retrievedSource!.rawText).toBe(authenticText(idx, "Threshold Amount"));

    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [entry] });
    const { evidence, reconciliation } = layer1(input);
    const ev = evidence.authenticated.find((e) => e.requestKey === "Threshold Amount")!;
    expect(ev.compilerRecord).toEqual({ present: true, matched: true, toolCallIndexes: [0] });
    expect(ev.checks.find((c) => c.code === "D_HASH_MATCH")!.passed).toBe(true);
    expect(ev.checks.find((c) => c.code === "F_NOT_UNRELATED_DOCUMENT")!.passed).toBe(true);
    expect(ev.linkage.find((l) => l.origin === "COMPILER_TOOL_CALL")!.compilerRecordedContentHash).toBe(entry.retrievedSource!.contentHash);
    expect(irOnlyValues(reconciliation)).toEqual([]);
  });

  it("C. amendment supersedes $100,000,000 -> $150,000,000: the verifier admits the AMENDED operative text (Phase 2G precedence reused); IR built from the amended figure is supported, IR built from the stale base figure is IR_ONLY and the amended figure is NOT_ACCOUNTED_FOR", () => {
    const idx = index();
    const amended = "“Threshold Amount” means the greater of (a) $150,000,000 and (b) 20% of Consolidated EBITDA for the most recently ended Test Period.";
    const operativeState = state([definitionView("Threshold Amount", amended, "OPERATIVE_STATE_RESOLVED")]);

    const current = makeInput(idx, { operativeState, definitions: [definition("Threshold Amount", max(money(150_000_000, "Definition of Threshold Amount"), multiply(percent(0.2, "Definition of Threshold Amount"), metric("Consolidated EBITDA"))))], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const c = layer1(current);
    const ev = c.evidence.authenticated.find((e) => e.requestKey === "Threshold Amount")!;
    expect(ev.documentVersion).toBe("AMENDED_OPERATIVE");
    expect(ev.rawText).toBe(amended);
    expect(ev.sourceNodeId).toBe("amend-node-2a");
    expect(ev.charStart).toBeNull();
    expect(ev.checks.find((x) => x.code === "E_OPERATIVE_VERSION")!.passed).toBe(true);
    expect(irOnlyValues(c.reconciliation)).toEqual([]);
    expect(c.reconciliation.items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR" && i.evidence)).toHaveLength(0);

    const stale = makeInput(idx, { operativeState, definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const s = layer1(stale);
    expect(irOnlyValues(s.reconciliation)).toEqual([100_000_000]);
    const missing = s.reconciliation.items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR" && i.evidence);
    expect(missing.map((i) => i.sourceItem!.numericValue)).toEqual([150_000_000]);
    expect(missing[0]!.reason).toContain("does not appear");
    // The base document's own (now superseded) $100,000,000 text is never admitted as a second evidence for the same term.
    expect(s.evidence.authenticated.filter((e) => e.scopeKey === "threshold amount")).toHaveLength(1);
  });

  it("D. two colliding physical definitions of the same term in one document are AMBIGUOUS - never guessed: no evidence is admitted, and because the compiler claimed the retrieval it becomes a review item", async () => {
    const twice = BASE_DOC + "\n“Threshold Amount” means $1.";
    const idx = index(twice);
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.authenticated.filter((e) => e.scopeKey === "threshold amount")).toHaveLength(0);
    const rejected = evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rejected.claimedByCompiler).toBe(true);
    expect(rejected.reason).toContain("distinct physical definitions");
    expect(irOnlyValues(reconciliation).sort()).toEqual([0.2, 100_000_000]);
    const review = reconciliation.items.filter((i) => i.classification === "AMBIGUOUS" && i.reason.includes("could not be authenticated"));
    expect(review).toHaveLength(1);
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.findings.some((f) => f.findingType === "PROVENANCE_MISMATCH")).toBe(true);
  });

  it("D'. the same term defined in two documents of the SAME instrument resolves to the home document first (the compiler's own search order) - one evidence, from the home document", () => {
    const sibling = "SECTION 1.01. Defined Terms .\n“Threshold Amount” means $77,000,000.";
    const idx = index(BASE_DOC, HOME, [{ documentId: "doc-b", text: sibling }]);
    const packageGraph = packageGraphWith([{ instrumentKey: TEST_INSTRUMENT_KEY, documentIds: [HOME, "doc-b"] }]);
    const input = makeInput(idx, { packageGraph, definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.packageDocumentIds).toEqual([HOME, "doc-b"]);
    const evs = evidence.authenticated.filter((e) => e.scopeKey === "threshold amount");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.documentId).toBe(HOME);
    expect(irOnlyValues(reconciliation)).toEqual([]);
  });

  it("E. greater-of $100,000,000 / 20% of EBITDA compiled as MAX(MONEY, MULTIPLY(PERCENT, METRIC)) - both leaves are supported by the one authenticated definition, each scoped through the owning definition", () => {
    const idx = index();
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [] }); // no tool log at all - the IR definition alone links the term
    const { evidence, reconciliation } = layer1(input);
    const ev = evidence.authenticated.find((e) => e.requestKey === "Threshold Amount")!;
    expect(ev.linkage.map((l) => l.origin)).not.toContain("COMPILER_TOOL_CALL");
    const supported = reconciliation.items.filter((i) => i.classification === "ACCOUNTED_FOR" && i.evidence?.requestKey === "Threshold Amount");
    expect(supported.flatMap((i) => i.irItems.map((x) => x.irPath)).sort()).toEqual(["definitions[0].calculationExpression.operands[0]", "definitions[0].calculationExpression.operands[1].operands[0]"]);
    expect(irOnlyValues(reconciliation)).toEqual([]);
  });

  it("F. multi-hop chain: definition A depends on definition B; both compiled; each figure is supported ONLY by its own definition's authenticated text, and B's linkage records the IR-derived hop", () => {
    const idx = index();
    const ebitda = definition("Consolidated EBITDA", money(2_000_000, "Definition of Consolidated EBITDA"), { id: "ir-definition:ebitda" });
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr(), ebitda], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const { evidence, reconciliation } = layer1(input);
    const evA = evidence.authenticated.find((e) => e.requestKey === "Threshold Amount")!;
    const evB = evidence.authenticated.find((e) => e.requestKey === "Consolidated EBITDA")!;
    expect(evA).toBeDefined();
    expect(evB).toBeDefined();
    expect(evB.linkage.map((l) => l.origin)).toEqual(expect.arrayContaining(["IR_DEFINITION_TERM", "IR_PROVENANCE_CITATION"]));
    expect(evB.linkage.map((l) => l.origin)).not.toContain("COMPILER_TOOL_CALL");
    const byEvidence = (key: string) => reconciliation.items.filter((i) => i.classification === "ACCOUNTED_FOR" && i.evidence?.requestKey === key).map((i) => i.sourceItem!.numericValue);
    expect(byEvidence("Threshold Amount").sort()).toEqual([0.2, 100_000_000]);
    expect(byEvidence("Consolidated EBITDA")).toEqual([2_000_000]);
    expect(irOnlyValues(reconciliation)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §12 adversarial scenarios (the fix must not create a new trust hole)
// ---------------------------------------------------------------------------

describe("F-4 §12 - adversarial: unauthenticated retrieved text is never admitted, and the verifier never falls back to compiler metadata", () => {
  function tamperedRecord(idx: StructuralIndex, rawText: string, overrides: Partial<RetrievedSourceRecord> = {}): ToolCallLogEntry {
    const authentic = idx.getDefinition("Threshold Amount", HOME)!;
    return { ...legacyDefinitionCall("Threshold Amount"), retrievedSource: { requestKind: "DEFINITION", requestKey: "Threshold Amount", documentId: HOME, sourceNodeId: authentic.sourceNodeId, sourceNodeKey: authentic.sourceNodeKey, charStart: authentic.charStart, charEnd: authentic.charStart + rawText.length, rawText, contentHash: computeSourceContentHash(rawText), textOrigin: "BASE_DOCUMENT_TEXT", evidenceStatus: "CURRENT", isCurrentTruth: true, ...overrides } };
  }

  it("A. a compiler record whose raw text was altered ($100,000,000 -> $900,000,000 with a consistent hash) is REJECTED under D_HASH_MATCH; the compiler's text supports nothing, the authentic text is not used to launder the claim, and the result is REVIEW_REQUIRED with a PROVENANCE_MISMATCH finding", async () => {
    const idx = index();
    const tampered = authenticText(idx, "Threshold Amount").replace("$100,000,000", "$900,000,000");
    const input = makeInput(idx, { definitions: [definition("Threshold Amount", max(money(900_000_000, "Definition of Threshold Amount"), multiply(percent(0.2, "Definition of Threshold Amount"), metric("Consolidated EBITDA"))))], toolCallLog: [tamperedRecord(idx, tampered)] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.authenticated.filter((e) => e.scopeKey === "threshold amount")).toHaveLength(0);
    const rej = evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rej.claimedByCompiler).toBe(true);
    expect(rej.checks.find((c) => c.code === "D_HASH_MATCH")!.passed).toBe(false);
    expect(rej.checks.find((c) => c.code === "C_RAW_TEXT_MATCH")!.passed).toBe(true); // the verifier's OWN resolution is fine - it is the compiler's claim that fails
    expect(irOnlyValues(reconciliation)).toContain(900_000_000);
    expect(JSON.stringify(reconciliation.items.filter((i) => i.classification === "ACCOUNTED_FOR"))).not.toContain("900,000,000");
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.status).toBe("MATERIAL_DISCREPANCY"); // the fabricated 900,000,000 is a real unsupported addition on a COMPLETE definition
    expect(result.findings.some((f) => f.findingType === "PROVENANCE_MISMATCH")).toBe(true);
    expect(result.findings.some((f) => f.findingType === "UNSUPPORTED_IR_ADDITION" && f.proposedIrEvidence.includes("900000000"))).toBe(true);
  });

  it("A'. a compiler record whose text was altered but whose IR happens to carry the AUTHENTIC figures still forces REVIEW_REQUIRED - a mismatched claim is a trust event even when the numbers reconcile", async () => {
    const idx = index();
    const tampered = authenticText(idx, "Threshold Amount") + " [TAMPERED]";
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [tamperedRecord(idx, tampered)] });
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(result.admissibleEvidence!.rejected.some((r) => r.claimedByCompiler && r.scopeKey === "threshold amount")).toBe(true);
    // The rejected claim admits nothing, so the figures stay unsupported (MATERIAL on a COMPLETE definition) and the
    // claim itself is a PROVENANCE_MISMATCH review item; the verifier never launders the claim with its own resolution.
    expect(result.status).not.toMatch(/^VERIFIED/);
    expect(["REVIEW_REQUIRED", "MATERIAL_DISCREPANCY"]).toContain(result.status);
    expect(result.findings.filter((f) => f.findingType === "UNSUPPORTED_IR_ADDITION")).toHaveLength(2);
    expect(result.findings.some((f) => f.findingType === "PROVENANCE_MISMATCH")).toBe(true);
  });

  it("B. a compiler record naming an unrelated document/node is REJECTED under F_NOT_UNRELATED_DOCUMENT even when the text and hash match the authentic definition", () => {
    const idx = index();
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: [tamperedRecord(idx, authenticText(idx, "Threshold Amount"), { documentId: "doc-other-company", sourceNodeId: "foreign-node" })] });
    const { evidence } = layer1(input);
    const rej = evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rej).toBeDefined();
    expect(rej.checks.find((c) => c.code === "F_NOT_UNRELATED_DOCUMENT")!.passed).toBe(false);
    expect(rej.checks.find((c) => c.code === "D_HASH_MATCH")!.passed).toBe(true);
  });

  it("C. stale source: the compiler recorded the BASE-document text of a term that a resolved amendment has since replaced - the claim is REJECTED (hash mismatch against the amended operative text) and only the amended text is admitted", () => {
    const idx = index();
    const amended = "“Threshold Amount” means the greater of (a) $150,000,000 and (b) 20% of Consolidated EBITDA for the most recently ended Test Period.";
    const operativeState = state([definitionView("Threshold Amount", amended, "OPERATIVE_STATE_RESOLVED")]);
    const input = makeInput(idx, { operativeState, definitions: [thresholdDefinitionIr()], toolCallLog: [tamperedRecord(idx, authenticText(idx, "Threshold Amount"))] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.authenticated.filter((e) => e.scopeKey === "threshold amount")).toHaveLength(0);
    const rej = evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rej.checks.find((c) => c.code === "D_HASH_MATCH")!.passed).toBe(false);
    expect(rej.checks.find((c) => c.code === "E_OPERATIVE_VERSION")!.passed).toBe(true); // the amended text itself IS current; the compiler's stale claim is what fails
    expect(irOnlyValues(reconciliation)).toContain(100_000_000);
  });

  it("D. superseded / conflicted operative state: a term whose amendment history is CONFLICTED is REJECTED under E_OPERATIVE_VERSION - its text (even the compiler's own matching record) is never admitted, and the compiler claim becomes a review item", async () => {
    const idx = index();
    const conflicted = "“Threshold Amount” means the greater of (a) $125,000,000 and (b) 20% of Consolidated EBITDA.";
    const operativeState = state([definitionView("Threshold Amount", conflicted, "OPERATIVE_STATE_CONFLICTED")], "OPERATIVE_STATE_CONFLICTED");
    const record: ToolCallLogEntry = { ...legacyDefinitionCall("Threshold Amount"), evidenceUnresolved: true, retrievedSource: { requestKind: "DEFINITION", requestKey: "Threshold Amount", documentId: HOME, sourceNodeId: "amend-node-2a", sourceNodeKey: null, charStart: null, charEnd: null, rawText: conflicted, contentHash: computeSourceContentHash(conflicted), textOrigin: "UNRESOLVED_AMENDED_TEXT", evidenceStatus: "OPERATIVE_STATE_UNRESOLVED", isCurrentTruth: false } };
    const input = makeInput(idx, { operativeState, definitions: [definition("Threshold Amount", max(money(125_000_000, "Definition of Threshold Amount"), multiply(percent(0.2, "Definition of Threshold Amount"), metric("Consolidated EBITDA"))))], toolCallLog: [record] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.authenticated.filter((e) => e.scopeKey === "threshold amount")).toHaveLength(0);
    const rej = evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rej.checks.find((c) => c.code === "E_OPERATIVE_VERSION")!.passed).toBe(false);
    expect(rej.checks.find((c) => c.code === "D_HASH_MATCH")!.passed).toBe(true); // matching a stale claim is not enough
    expect(irOnlyValues(reconciliation)).toContain(125_000_000);
    const result = await verifyCompiledCandidate(input, { skipSemanticReview: true });
    expect(["REVIEW_REQUIRED", "MATERIAL_DISCREPANCY"]).toContain(result.status);
    expect(result.status).not.toMatch(/^VERIFIED/);
  });

  it("E. cross-source collision: a figure that appears in an UNRELATED retrieved definition never supports an IR value scoped elsewhere (no global numeric pooling), while the same figure in the IR definition OF that term is supported", () => {
    const idx = index();
    // The rule cites §6.08 (local) but claims $5,000,000 - a figure the window never states; "Unrelated Amount" (retrieved by the compiler) happens to say $5,000,000.
    const r = rule(money(5_000_000, "§6.08"));
    const pooled = makeInput(idx, { rules: [r], toolCallLog: [legacyDefinitionCall("Unrelated Amount")] });
    const p = layer1(pooled);
    expect(p.evidence.authenticated.some((e) => e.requestKey === "Unrelated Amount")).toBe(true);
    expect(irOnlyValues(p.reconciliation)).toEqual([5_000_000]);
    expect(p.reconciliation.items.filter((i) => i.classification === "ACCOUNTED_FOR" && i.evidence)).toHaveLength(0);

    const scoped = makeInput(idx, { definitions: [definition("Unrelated Amount", money(5_000_000, "Definition of Unrelated Amount"))], toolCallLog: [legacyDefinitionCall("Unrelated Amount")] });
    const s = layer1(scoped);
    expect(irOnlyValues(s.reconciliation)).toEqual([]);
    expect(s.reconciliation.items.filter((i) => i.classification === "ACCOUNTED_FOR" && i.evidence?.requestKey === "Unrelated Amount")).toHaveLength(1);
  });

  it("E'. a bare mention of a term inside a longer citation never scopes evidence to it - only the explicit 'Definition of X' shapes do", () => {
    expect(citationNamesDefinition('Definition of "Threshold Amount" (retrieved via tool)', "threshold amount")).toBe(true);
    expect(citationNamesDefinition("Definition of Threshold Amount", "threshold amount")).toBe(true);
    expect(citationNamesDefinition("Threshold Amount (definition)", "threshold amount")).toBe(true);
    expect(citationNamesDefinition("§6.08(b)(3) (greater of $50,000,000 and 10% of Threshold Amount)", "threshold amount")).toBe(false);
    expect(citationNamesDefinition("Definition of Consolidated EBITDA", "threshold amount")).toBe(false);
  });

  it("F. span integrity: when the document text the verifier can see does not contain the resolved span (out of bounds) or differs at that span, the evidence is REJECTED under G/C - never admitted on the strength of the index alone", () => {
    const real = index();
    const truncated: StructuralIndex = { ...real, getDocumentText: (documentId) => (documentId === HOME ? real.getDocumentText(HOME)!.slice(0, 40) : real.getDocumentText(documentId)) };
    const outOfBounds = layer1(makeInput(truncated, { definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] }));
    const rejG = outOfBounds.evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rejG).toBeDefined();
    expect(rejG.checks.find((c) => c.code === "G_SPAN_IN_BOUNDS")!.passed).toBe(false);
    expect(irOnlyValues(outOfBounds.reconciliation)).toContain(100_000_000);

    const altered: StructuralIndex = { ...real, getDocumentText: (documentId) => (documentId === HOME ? real.getDocumentText(HOME)!.replace("$100,000,000", "$100,000,001") : real.getDocumentText(documentId)) };
    const mismatch = layer1(makeInput(altered, { definitions: [thresholdDefinitionIr()], toolCallLog: [legacyDefinitionCall("Threshold Amount")] }));
    const rejC = mismatch.evidence.rejected.find((r) => r.scopeKey === "threshold amount")!;
    expect(rejC).toBeDefined();
    expect(rejC.checks.find((c) => c.code === "C_RAW_TEXT_MATCH")!.passed).toBe(false);
  });

  it("G. an IR-derived request that simply does not resolve (a term the index never detected) is recorded as rejected but is NOT a compiler claim - no review item is manufactured from it", () => {
    const idx = index();
    const input = makeInput(idx, { definitions: [definition("Restricted Payments", null, { sufficiency: "PARTIAL" })], toolCallLog: [] });
    const { evidence, reconciliation } = layer1(input);
    const rej = evidence.rejected.find((r) => r.scopeKey === "restricted payments")!;
    expect(rej.claimedByCompiler).toBe(false);
    expect(reconciliation.items.filter((i) => i.reason.includes("could not be authenticated"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §18 package isolation
// ---------------------------------------------------------------------------

describe("F-4 §18 - package isolation: retrieval resolves only within this instrument's own documents", () => {
  const foreign = "SECTION 1.01. Defined Terms .\n“Threshold Amount” means $999,000,000.";

  it("a same-named definition in ANOTHER instrument's document is never admitted: with a package graph the foreign document is outside the instrument; without one, only the home document is searched", () => {
    const idx = index(BASE_DOC, HOME, [{ documentId: "doc-foreign", text: foreign }]);
    const irFromForeign = definition("Threshold Amount", money(999_000_000, "Definition of Threshold Amount"));
    const withGraph = makeInput(idx, { packageGraph: packageGraphWith([{ instrumentKey: TEST_INSTRUMENT_KEY, documentIds: [HOME] }, { instrumentKey: "other-instrument", documentIds: ["doc-foreign"] }]), definitions: [irFromForeign], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const g = layer1(withGraph);
    expect(g.evidence.packageDocumentIds).toEqual([HOME]);
    expect(g.evidence.authenticated.filter((e) => e.scopeKey === "threshold amount").map((e) => e.documentId)).toEqual([HOME]);
    expect(irOnlyValues(g.reconciliation)).toEqual([999_000_000]);

    const noGraph = layer1(makeInput(idx, { definitions: [irFromForeign], toolCallLog: [legacyDefinitionCall("Threshold Amount")] }));
    expect(noGraph.evidence.packageDocumentIds).toEqual([HOME]);
    expect(irOnlyValues(noGraph.reconciliation)).toEqual([999_000_000]);
  });

  it("a term defined ONLY in a foreign instrument's document resolves to nothing for this instrument (rejected, not borrowed)", () => {
    const home = BASE_DOC.replace("“Threshold Amount” means the greater of (a) $100,000,000 and (b) 20% of Consolidated EBITDA for the most recently ended Test Period.\n", "");
    const idx = index(home, HOME, [{ documentId: "doc-foreign", text: foreign }]);
    const input = makeInput(idx, { packageGraph: packageGraphWith([{ instrumentKey: TEST_INSTRUMENT_KEY, documentIds: [HOME] }, { instrumentKey: "other-instrument", documentIds: ["doc-foreign"] }]), definitions: [definition("Threshold Amount", money(999_000_000, "Definition of Threshold Amount"))], toolCallLog: [legacyDefinitionCall("Threshold Amount")] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.authenticated.filter((e) => e.scopeKey === "threshold amount")).toHaveLength(0);
    expect(evidence.rejected.find((r) => r.scopeKey === "threshold amount")!.claimedByCompiler).toBe(true);
    expect(irOnlyValues(reconciliation)).toEqual([999_000_000]);
  });

  it("packageDocumentIds mirrors the compiler tools' own scope rule: the instrument grouping that contains the home document, home first", () => {
    const graph = packageGraphWith([{ instrumentKey: "i1", documentIds: ["doc-b", HOME, "doc-c"] }, { instrumentKey: "i2", documentIds: ["doc-z"] }]);
    expect(packageDocumentIds({ packageGraph: graph }, HOME)).toEqual([HOME, "doc-b", "doc-c"]);
    expect(packageDocumentIds({ packageGraph: null }, HOME)).toEqual([HOME]);
  });
});

// ---------------------------------------------------------------------------
// §17 verifier independence
// ---------------------------------------------------------------------------

describe("F-4 §17 - verifier independence: only the verifier's own authenticated text reaches the reviewer; compiler claims never do", () => {
  it("the reviewer prompt carries the authenticated raw text with document/node/span/hash, and never the compiler's summary or a tampered compiler record", () => {
    const idx = index();
    const tampered = authenticText(idx, "Threshold Amount").replace("$100,000,000", "$900,000,000") + " [COMPILER-ONLY TEXT]";
    const authentic = idx.getDefinition("Threshold Amount", HOME)!;
    const entry: ToolCallLogEntry = { ...legacyDefinitionCall("Threshold Amount"), retrievedSource: { requestKind: "DEFINITION", requestKey: "Threshold Amount", documentId: HOME, sourceNodeId: authentic.sourceNodeId, sourceNodeKey: authentic.sourceNodeKey, charStart: authentic.charStart, charEnd: authentic.charStart + tampered.length, rawText: tampered, contentHash: computeSourceContentHash(tampered), textOrigin: "BASE_DOCUMENT_TEXT", evidenceStatus: "CURRENT", isCurrentTruth: true } };
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr(), definition("Unrelated Amount", money(5_000_000, "Definition of Unrelated Amount"))], toolCallLog: [entry, legacyDefinitionCall("Unrelated Amount")] });
    const { evidence, reconciliation } = layer1(input);
    const prompt = buildVerifierUserContent(input, reconciliation, null, evidence);

    expect(prompt).toContain("AUTHENTICATED RETRIEVED SOURCE");
    const unrelated = evidence.authenticated.find((e) => e.requestKey === "Unrelated Amount")!;
    expect(prompt).toContain(unrelated.rawText);
    expect(prompt).toContain(unrelated.contentHash);
    expect(prompt).toContain(`node ${unrelated.sourceNodeId}`);
    expect(prompt).toContain(`chars [${unrelated.charStart}, ${unrelated.charEnd})`);
    // The rejected claim is named, its text is not admitted.
    expect(prompt).toContain("REJECTED compiler retrieval claims");
    expect(prompt).not.toContain("[COMPILER-ONLY TEXT]");
    expect(prompt).not.toContain("900,000,000");
    expect(prompt).not.toContain("status OPERATIVE_STATE_RESOLVED, evidence CURRENT");
  });

  it("the verifier's evidence text is always its own resolution: with a matching compiler record, rawText equals the document slice; the record is compared, never copied", () => {
    const idx = index();
    const access = { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
    const runner = new ToolRunner(buildToolSet(access, HOME, { current: 0 }, DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET);
    runner.run("getDefinition", { term: "Threshold Amount" });
    const input = makeInput(idx, { definitions: [thresholdDefinitionIr()], toolCallLog: runner.log });
    const { evidence } = layer1(input);
    const ev = evidence.authenticated.find((e) => e.requestKey === "Threshold Amount")!;
    expect(ev.rawText).toBe(idx.getDocumentText(HOME)!.slice(ev.charStart!, ev.charEnd!));
    expect(ev.provenanceOrigin).toBe("VERIFIER_INDEPENDENT_RESOLUTION");
  });

  it("without any retrieval (no tool log, no IR definitions), the prompt says so and the evidence set is local-only", () => {
    const idx = index();
    const input = makeInput(idx, { rules: [rule(money(1, "§6.08"))] });
    const { evidence, reconciliation } = layer1(input);
    expect(evidence.authenticated).toEqual([]);
    expect(buildVerifierUserContent(input, reconciliation, null, evidence)).toContain("(none - every retrieval request either duplicated the operative window above or was rejected)");
  });
});

// ---------------------------------------------------------------------------
// §19 identity
// ---------------------------------------------------------------------------

describe("F-4 §19 - evidence-set identity changes with the admissible evidence", () => {
  const hashFor = (idx: StructuralIndex, opts: Parameters<typeof makeInput>[1]): AdmissibleEvidenceSet => layer1(makeInput(idx, opts)).evidence;

  it("is deterministic for identical inputs, equals a local-only identity when nothing is admitted, and changes when evidence is admitted or its text changes", () => {
    const idx = index();
    const localOnly = hashFor(idx, { rules: [rule(money(1, "§6.08"))] });
    const localOnlyAgain = hashFor(idx, { rules: [rule(money(1, "§6.08"))] });
    expect(localOnly.evidenceSetHash).toBe(localOnlyAgain.evidenceSetHash);
    expect(localOnly.localSourceHash).toBe(computeSourceContentHash(makeInput(idx, {}).compilerInput.operativeSourceText));

    const withEvidence = hashFor(idx, { definitions: [thresholdDefinitionIr()] });
    expect(withEvidence.evidenceSetHash).not.toBe(localOnly.evidenceSetHash);
    expect(withEvidence.localSourceHash).toBe(localOnly.localSourceHash);

    const changedText = index(BASE_DOC.replace("$100,000,000", "$101,000,000"));
    const withChanged = hashFor(changedText, { definitions: [thresholdDefinitionIr()] });
    expect(withChanged.evidenceSetHash).not.toBe(withEvidence.evidenceSetHash);

    const rejectedOnly = hashFor(idx, { definitions: [definition("No Such Term", money(1, "Definition of No Such Term"))] });
    expect(rejectedOnly.authenticated).toEqual([]);
    expect(rejectedOnly.evidenceSetHash).toBe(localOnly.evidenceSetHash); // rejected claims admit nothing, so the admissible set is unchanged
  });
});

// ---------------------------------------------------------------------------
// §25 compiler-side evidence record (narrow, evidence-only plumbing)
// ---------------------------------------------------------------------------

describe("F-4 §25 - the compiler's evidence tools record an authenticable RetrievedSourceRecord (evidence only, never interpretation)", () => {
  function tools() {
    const idx = index();
    const access = { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
    return { idx, runner: new ToolRunner(buildToolSet(access, HOME, { current: 0 }, DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET) };
  }

  it("getDefinition: document, physical node, span, full raw text and hash - and the text IS the document slice at that span", () => {
    const { idx, runner } = tools();
    runner.run("getDefinition", { term: "Threshold Amount" });
    const rec = runner.log[0]!.retrievedSource!;
    expect(rec.requestKind).toBe("DEFINITION");
    expect(rec.requestKey).toBe("Threshold Amount");
    expect(rec.documentId).toBe(HOME);
    expect(rec.sourceNodeId).toBe(idx.getDefinition("Threshold Amount", HOME)!.sourceNodeId);
    expect(idx.getDocumentText(HOME)!.slice(rec.charStart!, rec.charEnd!)).toBe(rec.rawText);
    expect(rec.contentHash).toBe(computeSourceContentHash(rec.rawText));
    expect(rec.textOrigin).toBe("BASE_DOCUMENT_TEXT");
    expect(rec.isCurrentTruth).toBe(true);
  });

  it("getReferencedProvision: the resolved section node's own text, span and hash", () => {
    const { idx, runner } = tools();
    runner.run("getReferencedProvision", { ref: "Section 7.01" });
    const rec = runner.log[0]!.retrievedSource!;
    expect(rec).toBeDefined();
    expect(rec.requestKind).toBe("PROVISION");
    expect(idx.getDocumentText(HOME)!.slice(rec.charStart!, rec.charEnd!)).toBe(rec.rawText);
    expect(rec.rawText).toContain("90 days");
    expect(rec.contentHash).toBe(computeSourceContentHash(rec.rawText));
  });

  it("a refusal records no retrieved source; a repeated request records none either", () => {
    const { runner } = tools();
    runner.run("getDefinition", { term: "No Such Term" });
    expect(runner.log[0]!.retrievedSource).toBeUndefined();
    runner.run("getDefinition", { term: "Threshold Amount" });
    runner.run("getDefinition", { term: "Threshold Amount" });
    expect(runner.log[1]!.retrievedSource).toBeDefined();
    expect(runner.log[2]!.retrievedSource).toBeUndefined();
    expect(runner.log[2]!.outputSummary).toContain("refused");
  });

  it("the record keeps the FULL text even when the model was shown a truncated result (so a later reader can recompute the same hash)", () => {
    const long = "SECTION 1.01. Defined Terms .\n“Long Term” means " + "the sum of $1,000 and ".repeat(400) + "$2,000.\nSECTION 6.08. Restricted Payments . The Borrower shall not make Restricted Payments in excess of the Long Term.";
    const idx = index(long);
    const access = { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
    const runner = new ToolRunner(buildToolSet(access, HOME, { current: 0 }, DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET);
    const result = runner.run("getDefinition", { term: "Long Term" }) as { truncated: boolean; text: string };
    expect(result.truncated).toBe(true);
    const rec = runner.log[0]!.retrievedSource!;
    expect(rec.rawText.length).toBeGreaterThan(result.text.length);
    expect(rec.rawText).toBe(idx.getDefinitionFullText("Long Term", HOME));
    expect(rec.contentHash).toBe(computeSourceContentHash(rec.rawText));
  });

  it("the source-reading tools carry a record for an AMENDED definition too (governing node from the operative view, no base-document span)", () => {
    const idx = index();
    const amended = "“Threshold Amount” means $150,000,000.";
    const access = { structuralIndex: idx, operativeState: state([definitionView("Threshold Amount", amended, "OPERATIVE_STATE_RESOLVED")]), packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
    const runner = new ToolRunner(buildToolSet(access, HOME, { current: 0 }, DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET);
    runner.run("getDefinition", { term: "Threshold Amount" });
    const rec = runner.log[0]!.retrievedSource!;
    expect(rec.textOrigin).toBe("AMENDED_CURRENT_TEXT");
    expect(rec.rawText).toBe(amended);
    expect(rec.sourceNodeId).toBe("amend-node-2a");
    expect(rec.charStart).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Structural bound on definition evidence
// ---------------------------------------------------------------------------

describe("F-4 - a definition's admitted evidence never extends beyond its enclosing section", () => {
  it("the LAST definition of the definitions section (whose index slice runs to the next detected definition, i.e. through later articles) is bounded to Section 1.01; a compiler record of the served (unbounded) text still authenticates", () => {
    const idx = index();
    const served = idx.getDefinitionFullText("Unrelated Amount", HOME)!;
    expect(served).toContain("SECTION 6.08"); // the index heuristic over-extends
    const access = { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
    const runner = new ToolRunner(buildToolSet(access, HOME, { current: 0 }, DEFAULT_TOOL_BUDGET), DEFAULT_TOOL_BUDGET);
    runner.run("getDefinition", { term: "Unrelated Amount" });
    const input = makeInput(idx, { definitions: [definition("Unrelated Amount", money(5_000_000, "Definition of Unrelated Amount"))], toolCallLog: runner.log });
    const { evidence, reconciliation } = layer1(input);
    const ev = evidence.authenticated.find((e) => e.requestKey === "Unrelated Amount")!;
    expect(ev).toBeDefined();
    expect(ev.rawText).toBe("“Unrelated Amount” means $5,000,000.\n");
    expect(ev.rawText).not.toContain("SECTION 6.08");
    expect(idx.getDocumentText(HOME)!.slice(ev.charStart!, ev.charEnd!)).toBe(ev.rawText);
    expect(ev.duplicatesLocalWindow).toBe(false);
    expect(ev.compilerRecord.matched).toBe(true);
    expect(ev.checks.find((c) => c.code === "D_HASH_MATCH")!.detail).toContain("bounded to its enclosing section");
    expect(irOnlyValues(reconciliation)).toEqual([]);
    // Nothing from Section 7.01 ("90 days") is attributed to the definition.
    expect(reconciliation.items.filter((i) => i.evidence && i.classification === "NOT_ACCOUNTED_FOR")).toHaveLength(0);
  });
});
