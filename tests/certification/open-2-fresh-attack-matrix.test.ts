/**
 * HEADROOM OPEN-2 (universal evidence-trust invariant) - Workstream OPEN-2's
 * own FRESH attack matrix (spec §20), independent of and in addition to
 * tests/certification/part-b-final-recert-fix2-independent.test.ts (the
 * auditor's own reproduction, updated in place to assert the fixed
 * behavior - not duplicated here). Every scenario below builds real
 * StructuralIndex/OperativeContractState/CovenantContextBundle objects via
 * the same production primitives the certification suite already uses
 * (parseDocumentStructure, detectStructuralDefinitions, buildStructuralIndex,
 * computeOperativeContractState, RealSemanticCaller, compileCovenantToIR) -
 * never a hand-mocked gate - and drives the tool-use loop through a scripted
 * fake Anthropic client so every scenario reaches a real
 * ToolCallLogEntry.evidenceUnresolved, not an execute()-level assertion
 * alone (those live in tests/contract-model/semantic-tools-operative-state-
 * discipline.test.ts's own "HEADROOM OPEN-2" describe block).
 *
 * Root cause under test throughout: getOperativeProvision's execute() used
 * to compute a real OperativeProvisionView.status but never translate it
 * into the machine-readable evidenceUnresolved flag compile.ts/verify.ts
 * actually gate on - metadata in the model-readable payload is not enough.
 * See docs/phase-3f1-human-architecture-decision/07-operative-provision-
 * fix.json for the full writeup.
 */
/**
 * NOTE (source-coverage repair): every compile in this file runs with `accountability: false`.
 * These are EVIDENCE-RESOLUTION certification tests - they assert what a tool call does to
 * `evidenceUnresolved` and to OPERATIVE_STATE_UNRESOLVED. Their scripted clients answer Pass B only, so
 * with source coverage on, each fixture is (correctly) REVIEW_REQUIRED for uninventoried source and the
 * evidence property under test would be masked by an unrelated failure reason. Source coverage has its own
 * suites: tests/contract-model/semantic-accountability/source-coverage*.test.ts.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildCovenantContextBundle, type PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { testCompilerInput, emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";
import { makeCandidate } from "../contract-model/coverage-audit-test-utils";

const COMPANY_ID = "open-2-attack-matrix-test";

const DATED = (date: string): EffectiveDateResult => ({ date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `effective as of ${date}`, reason: "explicit effective date clause" });

function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function definitionTarget(documentId: string, instrumentKey: string, term: string): AmendmentTarget {
  return { kind: "DEFINITION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: term, targetHint: null };
}
function baseEffect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentTarget }): AmendmentEffectCandidate {
  return {
    effectId: "effect",
    amendmentDocumentId: "amendment-doc",
    operation: "REPLACE_TEXT",
    effectiveDate: DATED("2021-01-01"),
    newText: null,
    oldText: null,
    sourceCitation: "amendment-doc::Section 2",
    sourceExcerpt: "excerpt",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}
function buildRealIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const definitions = detectStructuralDefinitions(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), definitions, []);
  return { index, nodes, definitions };
}
function exactTermsFor(documentId: string, definitions: ReturnType<typeof detectStructuralDefinitions>): Map<string, Map<string, string>> {
  const terms = new Map<string, string>();
  for (const d of definitions) terms.set(d.normalizedTerm, d.exactTerm);
  return new Map([[documentId, terms]]);
}
function fakeMessage(content: Anthropic.ContentBlock[], stopReason: Anthropic.Message["stop_reason"] = null): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content,
    model: "claude-sonnet-5",
    role: "assistant",
    stop_reason: stopReason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage,
  } as Anthropic.Message;
}
function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}
function submitRule(overrides: Record<string, unknown> = {}) {
  return toolUseBlock("submit", "submit_compilation", {
    rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via tool call"], ...overrides }],
    definitions: [],
  });
}
/** A scripted fake client that plays back a fixed sequence of tool_use/submit turns. */
function scriptedClient(turns: Anthropic.ContentBlock[][]): MinimalAnthropicClient {
  let turn = 0;
  return {
    messages: {
      stream: () => ({
        finalMessage: async () => {
          const content = turns[turn] ?? turns[turns.length - 1]!;
          turn++;
          return fakeMessage(content);
        },
      }),
    },
  };
}

describe("HEADROOM OPEN-2 fresh attack matrix (spec §20)", () => {
  describe("1. getOperativeProvision on a CURRENT section (never amended) - baseline, must COMPLETE", () => {
    const DOC = "attack-doc-current";
    const INSTRUMENT = "instrument:attack-current";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 6.99 Indebtedness Detail . The Borrower may incur up to $5,000,000 of additional Indebtedness under this basket.`;

    it("a real getOperativeProvision('6.99') tool call on a never-amended section sets evidenceUnresolved falsy and the attempt COMPLETES", async () => {
      const { index } = buildRealIndex(DOC, TEXT);
      // A real, computed-but-empty OperativeContractState (zero effects ever
      // recorded for this instrument) - NOT a bare `null` toolAccess.operativeState
      // (which means "no amendment computation was ever run for this
      // instrument at all" and, per getNodeSupersessionStatus's own
      // documented fail-closed default, correctly reports every node
      // UNKNOWN_SUPERSESSION_STATUS rather than assuming safety). Every real
      // production caller that HAS run the amendment pipeline for a
      // genuinely never-amended instrument gets exactly this shape.
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [] });
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.99" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog).toHaveLength(1);
      expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true);
      expect(result.failureReasons).not.toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("COMPLETED");
    });
  });

  describe("2. getOperativeProvision on a genuinely CONFLICTED section (fresh fixture, independent of the certification reproduction) - must fail closed", () => {
    const DOC = "attack-doc-conflicted";
    const INSTRUMENT = "instrument:attack-conflicted";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 7.50 Restricted Payments Basket . The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;

    function buildState() {
      const { index } = buildRealIndex(DOC, TEXT);
      const effectA = baseEffect({ effectId: "eff-a", amendmentDocumentId: "amd-a", target: sectionTarget(DOC, INSTRUMENT, "7.50"), newText: "Section 7.50 . up to $9,000,000 (Amendment No. 1).", effectiveDate: DATED("2021-06-01") });
      const effectB = baseEffect({ effectId: "eff-b", amendmentDocumentId: "amd-b", target: sectionTarget(DOC, INSTRUMENT, "7.50"), newText: "Section 7.50 . up to $15,000,000 (competing restatement).", effectiveDate: DATED("2021-06-01") });
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      return { index, state, access };
    }

    it("SETUP CHECK: section 7.50 is genuinely OPERATIVE_STATE_CONFLICTED", () => {
      const { state } = buildState();
      expect(state.provisions.find((p) => p.sectionRef === "7.50")!.status).toBe("OPERATIVE_STATE_CONFLICTED");
    });

    it("a real getOperativeProvision('7.50') tool call sets evidenceUnresolved=true and the attempt fails closed to REVIEW_REQUIRED, never COMPLETED", async () => {
      const { index, state, access } = buildState();
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      expect(bundle.hasUnresolvedOperativeEvidence).toBe(false); // isolates the tool-call path from the context-bundle path.

      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "7.50" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true);
      expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("REVIEW_REQUIRED");
    });
  });

  describe("3. getOperativeProvision on a PARTIAL-amendment section (target NOT_FOUND) - must fail closed", () => {
    const DOC = "attack-doc-partial";
    const INSTRUMENT = "instrument:attack-partial";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;

    it("an amendment claiming to target a section that does not exist in the base document produces OPERATIVE_STATE_PARTIAL, and a real tool call reaching it sets evidenceUnresolved=true", async () => {
      const { index } = buildRealIndex(DOC, TEXT);
      // Targets "9.99" - never present in TEXT at all - so the amendment's
      // own base reference cannot be confirmed to exist (NOT_FOUND ->
      // OPERATIVE_STATE_PARTIAL per buildProvisionView).
      const effect = baseEffect({ effectId: "eff-partial", amendmentDocumentId: "amd-partial", target: sectionTarget(DOC, INSTRUMENT, "9.99"), newText: "Section 9.99 . a provision that does not exist in the base document.", effectiveDate: DATED("2021-06-01") });
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effect] });
      expect(state.provisions.find((p) => p.sectionRef === "9.99")!.status).toBe("OPERATIVE_STATE_PARTIAL");

      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "9.99" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog[0]!.outputSummary).toContain("OPERATIVE_STATE_PARTIAL");
      expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true);
      expect(result.status).toBe("REVIEW_REQUIRED");
    });
  });

  describe("4. getOperativeProvision on an UNRESOLVED-target (AMBIGUOUS) section - two colliding physical occurrences sharing the same section number - must fail closed", () => {
    const DOC = "attack-doc-ambiguous";
    const INSTRUMENT = "instrument:attack-ambiguous";
    // A real, malformed-numbering drafting defect: two distinct physical
    // sections both labeled "6.50" (a genuine, if rare, real-world
    // occurrence - duplicate/renumbered sections in a heavily-amended
    // credit agreement).
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 6.50 Liens . First occurrence of this section number.\n\nSection 6.50 Liens . Second, colliding occurrence of this same section number.`;

    it("SETUP CHECK: section 6.50 genuinely resolves AMBIGUOUS at the structural-index level", () => {
      const { index } = buildRealIndex(DOC, TEXT);
      const resolution = index.resolveUniqueNodeByRef(DOC, "6.50");
      expect(resolution.status).toBe("AMBIGUOUS");
    });

    it("a real getOperativeProvision('6.50') tool call refuses honestly (never a guessed answer) and the refusal itself is never usable as COMPLETE evidence", async () => {
      const { index } = buildRealIndex(DOC, TEXT);
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: null };
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.50" })], [submitRule({ sufficiency: "COMPLETE" })]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      // A refusal returns ok:false and no evidence at all - evidenceUnresolved
      // must never be fabricated true for a refusal (there is nothing to
      // mistrust), but the refusal reason itself is disclosed, never silently
      // dropped.
      expect(result.toolCallLog[0]!.outputSummary).toContain("refused");
      expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true);
    });
  });

  describe("5. getOperativeProvision raw base-document fallback reaching a KNOWN_SUPERSEDED physical occurrence - must fail closed", () => {
    const DOC = "attack-doc-superseded";
    const INSTRUMENT = "instrument:attack-superseded";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 6.60 Liens . Original, now-superseded physical text of this section.`;

    it("a section physical occurrence independently known-superseded (via supersessionIndex, never individually targeted by a SECTION-kind amendment on its own current ref) sets evidenceUnresolved=true through the raw fallback branch", async () => {
      const { index } = buildRealIndex(DOC, TEXT);
      const node601 = index.getNodeByRef(DOC, "6.01")!;
      const node660 = index.getNodeByRef(DOC, "6.60")!;
      // Modeling a real restatement: a view keyed under a DIFFERENT section
      // label ("9.01", not physically present in this fixture's own text)
      // records 6.60's own physical nodeId as superseded - the same
      // real-world shape as a renumbering amendment. getOperativeProvision's
      // own findProvisionView will not match "6.60" against this view's
      // sectionRef, so the raw base-document fallback is exercised end to
      // end through the real tool-use loop, not merely unit-executed.
      const state = {
        instrumentKey: INSTRUMENT,
        asOfDate: "2026-01-01",
        provisions: [
          {
            instrumentKey: INSTRUMENT,
            provisionKey: "prov-9.01",
            kind: "SECTION" as const,
            documentId: DOC,
            sectionRef: "9.01",
            definedTermRef: null,
            asOfDate: "2026-01-01",
            currentSourceDocumentId: "amd-restatement",
            currentSourceNodeKey: "amd-restatement::9.01",
            currentSourceNodeId: "id-amd-restatement-9-01",
            currentText: "Section 9.01 Liens (restated) . New consolidated liens covenant text.",
            fullChain: [],
            appliedChain: [{ effectId: "eff-restate", amendmentDocumentId: "amd-restatement", operation: "REPLACE_TEXT" as const, effectiveDate: DATED("2023-01-01"), sourceCitation: "amd-restatement::9.01", appliedAsOfQuery: true }],
            supersededSourceNodeKeys: [node660.nodeKey],
            supersededSourceNodeIds: [node660.nodeId],
            status: "OPERATIVE_STATE_RESOLVED" as const,
            unresolvedIssues: [],
            conflicts: [],
            targetResolutionStatus: "UNIQUE" as const,
            targetResolutionReason: null,
            candidateSourceNodeIds: [],
            structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT" as const,
            structuralHealthIssues: [],
            attemptedText: null,
            reviewRequired: false,
            candidateTexts: [],
          },
        ],
        status: "OPERATIVE_STATE_RESOLVED" as const,
        summary: "test",
        unattachedEffects: [],
      };
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node601.nodeKey], structuralNodeIds: [node601.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node601.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.60" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog[0]!.outputSummary).toContain("KNOWN_SUPERSEDED");
      expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true);
      expect(result.status).toBe("REVIEW_REQUIRED");
    });
  });

  describe("6. historical-request path (getPriorVersion) - deliberately historical-by-design, must NOT force REVIEW_REQUIRED merely because history was requested", () => {
    const DOC = "attack-doc-prior-version";
    const INSTRUMENT = "instrument:attack-prior-version";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;

    it("a real getPriorVersion('6.01') tool call on a cleanly-resolved (RESOLVED) amendment chain never sets evidenceUnresolved, and the attempt COMPLETES", async () => {
      const { index } = buildRealIndex(DOC, TEXT);
      const effect = baseEffect({ effectId: "eff-prior", amendmentDocumentId: "amd-prior", target: sectionTarget(DOC, INSTRUMENT, "6.01"), oldText: "Section 6.01 . prior limit of $2,000,000.", newText: "Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.", effectiveDate: DATED("2021-06-01") });
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effect] });
      expect(state.provisions.find((p) => p.sectionRef === "6.01")!.status).toBe("OPERATIVE_STATE_RESOLVED");

      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getPriorVersion", { ref: "6.01" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog[0]!.toolName).toBe("getPriorVersion");
      expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true);
      expect(result.failureReasons).not.toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("COMPLETED");
    });
  });

  describe("7. getDefinition CURRENT (fresh fixture) - contrast/regression baseline", () => {
    const DOC = "attack-doc-def-current";
    const INSTRUMENT = "instrument:attack-def-current";
    const TEXT = `Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means net income plus interest, taxes, depreciation and amortization.\n\nSection 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;

    it("a real getDefinition tool call on a never-amended term sets evidenceUnresolved falsy and the attempt COMPLETES", async () => {
      const { index, definitions } = buildRealIndex(DOC, TEXT);
      // See scenario 1's own comment: a real, computed-but-empty
      // OperativeContractState, not a bare `null`.
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [] });
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getDefinition", { term: "Consolidated EBITDA" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true);
      expect(result.status).toBe("COMPLETED");
    });
  });

  describe("8. context-bundle CURRENT text vs UNRESOLVED text (zero tool calls) - already fixed by a prior phase, reconfirmed here rather than re-fixed", () => {
    it("a bundle whose own hasUnresolvedOperativeEvidence is false COMPLETES with zero tool calls", async () => {
      const bundle = emptyContextBundle({ hasUnresolvedOperativeEvidence: false, unresolvedEvidenceItemIds: [] });
      const compilerInput = testCompilerInput({ contextBundle: bundle });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });
      expect(result.toolCallLog).toHaveLength(0);
      expect(result.inputHasUnresolvedOperativeEvidence).toBe(false);
      expect(result.failureReasons).not.toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("COMPLETED");
    });

    it("a bundle whose own hasUnresolvedOperativeEvidence is true fails closed with zero tool calls (reconfirmation, not a re-fix)", async () => {
      const bundle = emptyContextBundle({ hasUnresolvedOperativeEvidence: true, unresolvedEvidenceItemIds: ["item-1"] });
      const compilerInput = testCompilerInput({ contextBundle: bundle });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });
      expect(result.toolCallLog).toHaveLength(0);
      expect(result.inputHasUnresolvedOperativeEvidence).toBe(true);
      expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).not.toBe("COMPLETED");
    });
  });

  describe("9. sequence: ONE tool call returns CURRENT and a LATER call in the SAME attempt returns UNRESOLVED - the aggregate signal must OR across the whole attempt, never last-call-wins", () => {
    const DOC = "attack-doc-sequence";
    const INSTRUMENT = "instrument:attack-sequence";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 7.60 Restricted Payments Basket . The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;

    function buildState() {
      const { index } = buildRealIndex(DOC, TEXT);
      const effectA = baseEffect({ effectId: "eff-seq-a", amendmentDocumentId: "amd-seq-a", target: sectionTarget(DOC, INSTRUMENT, "7.60"), newText: "Section 7.60 . up to $9,000,000 (Amendment No. 1).", effectiveDate: DATED("2021-06-01") });
      const effectB = baseEffect({ effectId: "eff-seq-b", amendmentDocumentId: "amd-seq-b", target: sectionTarget(DOC, INSTRUMENT, "7.60"), newText: "Section 7.60 . up to $15,000,000 (competing).", effectiveDate: DATED("2021-06-01") });
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      return { index, state, access };
    }

    it("CURRENT call FIRST, then UNRESOLVED call SECOND - the first (safe) call never masks the second", async () => {
      const { index, state, access } = buildState();
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller(
        "test",
        "test-model",
        scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.01" })], [toolUseBlock("t2", "getOperativeProvision", { sectionRef: "7.60" })], [submitRule()]])
      );
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog).toHaveLength(2);
      expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true); // 6.01: current.
      expect(result.toolCallLog[1]!.evidenceUnresolved).toBe(true); // 7.60: conflicted.
      expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("REVIEW_REQUIRED");
    });

    it("UNRESOLVED call FIRST, then CURRENT call SECOND - the later (safe) call never erases the earlier unresolved one (rules out last-call-wins)", async () => {
      const { index, state, access } = buildState();
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller(
        "test",
        "test-model",
        scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "7.60" })], [toolUseBlock("t2", "getOperativeProvision", { sectionRef: "6.01" })], [submitRule()]])
      );
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.toolCallLog).toHaveLength(2);
      expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true); // 7.60: conflicted, called first.
      expect(result.toolCallLog[1]!.evidenceUnresolved).not.toBe(true); // 6.01: current, called last.
      // THE KEY ASSERTION: even though the LAST call was safe, the aggregate
      // signal (compile.ts's own `.some()` over the whole toolCallLog) still
      // fires - proving this is a real OR-across-the-attempt, not
      // last-call-wins.
      expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("REVIEW_REQUIRED");
    });
  });

  describe("10. scripted model ignores an unresolved warning and submits sufficiency COMPLETE anyway - must still fail closed", () => {
    const DOC = "attack-doc-ignored-warning";
    const INSTRUMENT = "instrument:attack-ignored-warning";
    const TEXT = `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 7.70 Restricted Payments Basket . The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;

    it("the model explicitly claims COMPLETE/high-confidence sufficiency despite having just read a CONFLICTED status in the tool response - the fail-closed gate does not depend on the model's own self-assessment", async () => {
      const { index } = buildRealIndex(DOC, TEXT);
      const effectA = baseEffect({ effectId: "eff-ignore-a", amendmentDocumentId: "amd-ignore-a", target: sectionTarget(DOC, INSTRUMENT, "7.70"), newText: "Section 7.70 . up to $9,000,000 (Amendment No. 1).", effectiveDate: DATED("2021-06-01") });
      const effectB = baseEffect({ effectId: "eff-ignore-b", amendmentDocumentId: "amd-ignore-b", target: sectionTarget(DOC, INSTRUMENT, "7.70"), newText: "Section 7.70 . up to $15,000,000 (competing).", effectiveDate: DATED("2021-06-01") });
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
      const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
      const node = index.getNodeByRef(DOC, "6.01")!;
      const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
      const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        candidateRef: candidate.discoveryId,
        operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller(
        "test",
        "test-model",
        scriptedClient([
          [toolUseBlock("t1", "getOperativeProvision", { sectionRef: "7.70" })],
          [submitRule({ sufficiency: "COMPLETE", sufficiencyReasons: ["I reviewed the conflicting amendments and am confident $5,000,000 is correct regardless"] })],
        ])
      );
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.rules[0]?.sufficiency).toBe("COMPLETE"); // the model's own self-report, unmodified.
      // But the ATTEMPT-level status/failureReasons - what a downstream
      // consumer actually gates on - is never overridden by the model's own
      // claimed confidence.
      expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.status).not.toBe("COMPLETED");
    });
  });

  describe("11. tool-only path with an EMPTY context bundle (the exact new exploit shape) - zero pre-loaded items, evidence reached purely via tool call", () => {
    const DOC = "attack-doc-empty-bundle";
    const INSTRUMENT = "instrument:attack-empty-bundle";

    it("an entirely empty (non-auto-populated) context bundle plus a CONFLICTED-section tool call still fails closed, and the empty bundle itself never appears safe by omission", async () => {
      const { index } = buildRealIndex(DOC, `Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 8.10 Liens Basket . Liens permitted up to $5,000,000 under this basket.`);
      const effectA = baseEffect({ effectId: "eff-empty-a", amendmentDocumentId: "amd-empty-a", target: sectionTarget(DOC, INSTRUMENT, "8.10"), newText: "Section 8.10 . up to $9,000,000 (Amendment No. 1).", effectiveDate: DATED("2021-06-01") });
      const effectB = baseEffect({ effectId: "eff-empty-b", amendmentDocumentId: "amd-empty-b", target: sectionTarget(DOC, INSTRUMENT, "8.10"), newText: "Section 8.10 . up to $15,000,000 (competing).", effectiveDate: DATED("2021-06-01") });
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });

      // A genuinely EMPTY bundle - zero items, zero edges - never built via
      // buildCovenantContextBundle at all, unlike every other scenario in
      // this file. This is the exact "tool-only, no pre-loaded evidence"
      // shape the spec calls out as the residual exploit surface.
      const bundle = emptyContextBundle({ originatingDocumentId: DOC, hasUnresolvedOperativeEvidence: false, unresolvedEvidenceItemIds: [] });
      const compilerInput = testCompilerInput({
        companyId: COMPANY_ID,
        instrumentKey: INSTRUMENT,
        sourceDocumentId: DOC,
        sourceSectionRef: "6.01",
        contextBundle: bundle,
        toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
      });
      const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUseBlock("t1", "getOperativeProvision", { sectionRef: "8.10" })], [submitRule()]]));
      const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache(), accountability: false });

      expect(result.inputHasUnresolvedOperativeEvidence).toBe(false); // the bundle itself is fully "clean" - confirms this is NOT the already-fixed bundle-level gap.
      expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true); // caught purely by the tool-call-path fix.
      expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
      expect(result.status).toBe("REVIEW_REQUIRED");
    });
  });
});
