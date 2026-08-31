/**
 * POST-3F.2 remediation - Unit A generic test gate (A1-A12). Every fact
 * pattern here is synthetic/invented (never Riot, Coinbase, or any
 * frozen-benchmark term/section number) so this gate proves the fix
 * generalizes, not that it was tuned to the exact cases that failed.
 */
import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { checkDefinitionCompleteness, detectQuotedDefinedTerms } from "../../../lib/contract-model/compiler/semantic/completeness-check";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { buildToolSet } from "../../../lib/contract-model/compiler/semantic/tools";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { buildSystemPrompt, buildFewShotExamplesBlock } from "../../../lib/contract-model/compiler/semantic/prompt";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../../lib/contract-model/compiler/structural-references";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";
import type { WireDefinition } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { testCompilerInput, TEST_DOCUMENT_ID } from "./test-helpers";

function wireDefinition(termName: string, overrides: Partial<WireDefinition> = {}): WireDefinition {
  return { localRef: `d-${termName}`, termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: "§1.01", excerpt: null, ...overrides };
}

function fakeMessage(content: Anthropic.ContentBlock[]): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content,
    model: "claude-sonnet-5",
    role: "assistant",
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage,
  } as Anthropic.Message;
}
function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}
function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient {
  let i = 0;
  return { messages: { stream: () => ({ finalMessage: async () => script[Math.min(i++, script.length - 1)]! }) } };
}

describe("POST-3F.2 Unit A1 - prompt exhaustiveness instruction", () => {
  it("the system prompt states a definitions-exhaustiveness requirement distinct from, but mirroring, the existing rules-exhaustiveness requirement", () => {
    const prompt = buildSystemPrompt({ irSchemaVersion: "v1", toolPolicyVersion: "v1" });
    expect(prompt).toMatch(/MULTIPLE RULES/);
    expect(prompt).toMatch(/MULTIPLE DEFINITIONS/i);
    expect(prompt.toLowerCase()).toMatch(/extract every materially relevant definition/);
  });

  it("the few-shot examples include a worked multi-sibling-definition example using invented terminology", () => {
    const examples = buildFewShotExamplesBlock();
    expect(examples).toMatch(/Zeta Threshold/);
    expect(examples).toMatch(/Zeta Measurement Period/);
    expect(examples).toMatch(/Zeta Excluded Assets/);
    // never a benchmark term
    expect(examples).not.toMatch(/Final Maturity Date|Collateral Documents|Security Confirmation|Day Count Fraction/);
  });
});

describe("POST-3F.2 Unit A2 - deterministic definition-completeness check (pure logic)", () => {
  it("A1: three sibling definitions, all present -> no false alert", () => {
    const source = '§1.01: "Gamma Amount" means $1,000,000. "Gamma Period" means the period from closing through the first anniversary. "Gamma Excluded Items" means items listed on Schedule A.';
    const compiled = [wireDefinition("Gamma Amount"), wireDefinition("Gamma Period"), wireDefinition("Gamma Excluded Items")];
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(false);
    expect(result.missingTermLabels).toHaveLength(0);
  });

  it("A2: 10+ sibling definitions are all representable and detected without any code change (schema already array-typed end to end)", () => {
    const terms = Array.from({ length: 12 }, (_, i) => `Delta Term ${i + 1}`);
    const source = terms.map((t) => `"${t}" means the value described in this Article.`).join(" ");
    const compiled = terms.map((t) => wireDefinition(t));
    const input = testCompilerInput();
    const normalized = normalizeSubmission({ rules: [], definitions: compiled, sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }, input);
    expect(normalized.definitions).toHaveLength(12);
    const check = checkDefinitionCompleteness(source, normalized.definitions);
    expect(check.fired).toBe(false); // all 12 represented
  });

  it("A3: deliberate omission of one sibling definition is detected", () => {
    const source = '"Epsilon Cap" means $5,000,000. "Epsilon Trigger" means the date of the first Drawdown. "Epsilon Carve-Out" means the exclusions on Schedule B.';
    const compiled = [wireDefinition("Epsilon Cap"), wireDefinition("Epsilon Trigger")]; // Epsilon Carve-Out omitted
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(true);
    expect(result.missingTermLabels).toEqual(["Epsilon Carve-Out"]);
  });

  it("A4: deliberate omission of multiple siblings is detected", () => {
    const terms = ["Zeta One", "Zeta Two", "Zeta Three", "Zeta Four", "Zeta Five"];
    const source = terms.map((t) => `"${t}" means a value defined for purposes of this Agreement.`).join(" ");
    const compiled = [wireDefinition("Zeta One"), wireDefinition("Zeta Two")]; // 3 of 5 omitted
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(true);
    expect(result.missingTermLabels).toHaveLength(3);
    expect(result.missingTermLabels).toEqual(expect.arrayContaining(["Zeta Three", "Zeta Four", "Zeta Five"]));
  });

  it("A5: one complex definition with a nested, undefined-elsewhere reference does not create a false missing-definition alert", () => {
    // "Vault Property" is REFERENCED inside the definition body but never itself declared with its own "X means" citation in this source - it must not be treated as a second missing top-level definition.
    const source = '"Eta Excluded Assets" means, collectively, (a) any Vault Property and (b) any asset subject to a Permitted Eta Lien, in each case as reasonably determined by the Administrative Agent.';
    const compiled = [wireDefinition("Eta Excluded Assets", { dependsOnTerms: ["Vault Property", "Permitted Eta Lien"] })];
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(false);
  });

  it("A6: arbitrary/invented terminology works without any code change - the detector is purely syntactic, never a term dictionary", () => {
    const source = '"Quixotic Reserve Amount" means $42,000. "Flibbertigibbet Trigger Date" shall mean the date on which the Widget Coverage Ratio first exceeds 3.00 to 1.00.';
    const compiled = [wireDefinition("Quixotic Reserve Amount")]; // Flibbertigibbet Trigger Date omitted
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(true);
    expect(result.missingTermLabels).toEqual(["Flibbertigibbet Trigger Date"]);
  });

  it("false-positive hardening: nested quotes inside a definition body", () => {
    const source = '"Theta Amount" means the amount described as the "Base Case Number" in the most recent Compliance Certificate.';
    // "Base Case Number" is a quoted phrase but is NOT followed by "means"/"shall mean" - must not be detected as its own citation.
    const detected = detectQuotedDefinedTerms(source);
    expect(detected.map((d) => d.rawLabel)).toEqual(["Theta Amount"]);
  });

  it("false-positive hardening: 'shall mean' phrasing is recognized identically to 'means'", () => {
    const source = '"Iota Threshold" shall mean an amount equal to 10% of Consolidated Assets.';
    const compiled = [wireDefinition("Iota Threshold")];
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(false);
  });

  it("false-positive hardening: multi-sentence definition body, semicolons, and a schedule/heading reference do not spuriously trigger", () => {
    const source = 'ARTICLE I\nDEFINITIONS\nSection 1.01. "Kappa Basket" means an amount not to exceed $2,000,000; provided that such amount shall be reduced dollar-for-dollar by any usage under Section 4.02. For purposes of this definition, "usage" means any incurrence of Indebtedness under such basket.';
    // Two genuine citations here: "Kappa Basket" and "usage" (both followed by "means").
    const compiled = [wireDefinition("Kappa Basket"), wireDefinition("usage")];
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(false);
  });

  it("case/whitespace-insensitive comparison never produces a false positive over trivial casing/spacing differences", () => {
    const source = '"Lambda   Reserve" means the amount set forth on Schedule C.';
    const compiled = [wireDefinition("lambda reserve")]; // different case, collapsed whitespace
    const result = checkDefinitionCompleteness(source, compiled);
    expect(result.fired).toBe(false);
  });

  it("zero detections in a rules-only section is a normal outcome, never treated as evidence of omission", () => {
    const source = "The Company may incur Indebtedness in an aggregate principal amount not to exceed $10,000,000 at any time outstanding.";
    const result = checkDefinitionCompleteness(source, []);
    expect(result.fired).toBe(false);
    expect(result.detectedSourceTermLabels).toHaveLength(0);
  });
});

describe("POST-3F.2 Unit A2/A9/A11 - wired into compileCovenantToIR's safe-failure routing", () => {
  it("A9 (no regression): a clean multi-rule compilation with no missing sibling definitions still reaches COMPLETED", async () => {
    const client = scriptedClient([
      fakeMessage([
        toolUseBlock("t1", "submit_compilation", {
          rules: [
            { localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 }, sufficiency: "COMPLETE" },
            { localRef: "r2", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "PAY_DIVIDEND", capacityExpression: { kind: "MONEY", amount: 2 }, sufficiency: "COMPLETE" },
          ],
          definitions: [],
          sharedCapacities: [],
          irExtensionCandidates: [],
          overallNotes: [],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const input = testCompilerInput({ operativeSourceText: "§9.01: incur Indebtedness up to $1; pay dividends up to $2." });
    const result = await compileCovenantToIR(input, { caller });
    expect(result.status).toBe("COMPLETED"); // multiple independent rules still compile cleanly - no regression from Unit A
    expect(result.rules).toHaveLength(2);
    expect(result.definitionCompletenessCheck).toBeNull(); // zero quoted-term citations in this rules-only source - correctly silent
  });

  it("A9b (no regression): a correctly-complete definitions batch (source and compiled output match exactly) never fires the completeness check", async () => {
    const client = scriptedClient([
      fakeMessage([
        toolUseBlock("t1", "submit_compilation", {
          rules: [],
          definitions: [{ localRef: "d1", termName: "Omega Amount", sufficiency: "COMPLETE" }, { localRef: "d2", termName: "Omega Period", sufficiency: "COMPLETE" }],
          sharedCapacities: [],
          irExtensionCandidates: [],
          overallNotes: [],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const input = testCompilerInput({ operativeSourceText: '"Omega Amount" means $1,000,000. "Omega Period" means the twelve months following the Closing Date.' });
    const result = await compileCovenantToIR(input, { caller });
    expect(result.definitionCompletenessCheck).toBeNull();
    expect(result.failureReasons).not.toContain("DEFINITION_COMPLETENESS_SUSPECT");
  });

  it("A3/A11 (routes through existing safe-failure machinery, never a new status kind): a fired completeness check forces at least REVIEW_REQUIRED, never COMPLETED, and never manufactures the missing definition's content", async () => {
    const client = scriptedClient([
      fakeMessage([
        toolUseBlock("t1", "submit_compilation", {
          rules: [],
          definitions: [{ localRef: "d1", termName: "Nu Cap", sufficiency: "COMPLETE" }],
          sharedCapacities: [],
          irExtensionCandidates: [],
          overallNotes: [],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const input = testCompilerInput({ operativeSourceText: '"Nu Cap" means $1,000,000. "Nu Excluded Category" means the items on Schedule D.' });
    const result = await compileCovenantToIR(input, { caller });
    expect(result.status).not.toBe("COMPLETED");
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.failureReasons).toContain("DEFINITION_COMPLETENESS_SUSPECT");
    expect(result.definitionCompletenessCheck?.fired).toBe(true);
    expect(result.definitionCompletenessCheck?.missingTermLabels).toEqual(["Nu Excluded Category"]);
    // never fabricated - the actually-compiled definitions array is untouched
    expect(result.definitions.map((d) => d.termName)).toEqual(["Nu Cap"]);
  });

  it("A8 (no regression): a definition with a real but incompletely-represented qualifier (sufficiency PARTIAL) is never upgraded to COMPLETED merely because the completeness check found no missing SIBLING definitions", async () => {
    const client = scriptedClient([
      fakeMessage([
        toolUseBlock("t1", "submit_compilation", {
          rules: [],
          definitions: [{ localRef: "d1", termName: "Xi Fraction", sufficiency: "PARTIAL", sufficiencyReasons: ["a qualifying proviso could not be structurally represented"] }],
          sharedCapacities: [],
          irExtensionCandidates: [],
          overallNotes: [],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    // Only one defined term in source, and it WAS compiled - the completeness check (which only detects missing SIBLINGS) correctly finds nothing missing...
    const input = testCompilerInput({ operativeSourceText: '"Xi Fraction" means a fraction, subject to a proviso described elsewhere in this Section.' });
    const result = await compileCovenantToIR(input, { caller });
    expect(result.definitionCompletenessCheck).toBeNull(); // ...confirming the completeness check is silent here...
    expect(result.status).not.toBe("COMPLETED"); // ...yet the pre-existing sufficiency-based safe-failure gate still correctly withholds COMPLETED.
    expect(result.status).toBe("REVIEW_REQUIRED");
  });
});

describe("POST-3F.2 Unit A3/A7 - truncation integrity (traced root cause: model-generated/tool-truncation ellipsis, not a backend post-processing bug)", () => {
  function buildLongSectionIndex() {
    const longBody = "This is a long operative clause. ".repeat(200); // > MAX_TEXT_RESULT_CHARS (4000)
    const node: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "SECTION", heading: "Long Section", sectionRef: "9.09", nodeKey: `${TEST_DOCUMENT_ID}::9.09`, nodeId: `n-${TEST_DOCUMENT_ID}-9.09`, charStart: 0, charEnd: longBody.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
    const nodes = [node];
    const definitions = detectStructuralDefinitions(TEST_DOCUMENT_ID, longBody, nodes);
    const references = detectStructuralReferences(TEST_DOCUMENT_ID, longBody, nodes);
    const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: longBody, nodes }]]), definitions, references);
    return { index, node, longBody };
  }

  it("A7a (tool-level, direct): getSourceSpan on a >4000-char node sets both the JSON `truncated` flag AND the structured evidenceTruncated outcome field", () => {
    const { index, node } = buildLongSectionIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: (testCompilerInput().contextBundle) }, TEST_DOCUMENT_ID, charsUsed, { maxToolCalls: 8, maxRecursionDepth: 3, maxAdditionalSourceChars: 100_000 });
    const outcome = tools.find((t) => t.name === "getSourceSpan")!.execute({ nodeId: node.nodeId });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { truncated: boolean }).truncated).toBe(true);
    expect(outcome.evidenceTruncated).toBe(true); // structured signal - not just JSON text the model could ignore
  });

  it("A7b (end to end): a compile attempt whose tool evidence was truncated can never be silently treated as complete - TRUNCATED_EVIDENCE_USED forces at least REVIEW_REQUIRED", async () => {
    const { index, node } = buildLongSectionIndex();
    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "getSourceSpan", { nodeId: node.nodeId })]),
      fakeMessage([
        toolUseBlock("t2", "submit_compilation", {
          rules: [{ localRef: "r1", sourceSectionRef: "9.09", covenantFamily: "OTHER", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 }, sufficiency: "COMPLETE" }],
          definitions: [],
          sharedCapacities: [],
          irExtensionCandidates: [],
          overallNotes: [],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const input = testCompilerInput({
      sourceSectionRef: "9.09",
      operativeSourceText: "(short initial text - the model must fetch the long span via getSourceSpan)",
      toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: testCompilerInput().contextBundle },
    });
    const result = await compileCovenantToIR(input, { caller });
    expect(result.toolCallLog.some((e) => e.evidenceTruncated)).toBe(true);
    expect(result.failureReasons).toContain("TRUNCATED_EVIDENCE_USED");
    expect(result.status).not.toBe("COMPLETED");
  });
});

describe("POST-3F.2 Unit A12 - no benchmark-specific strings in production logic", () => {
  it("prompt.ts, completeness-check.ts, and compile.ts contain no Riot/Coinbase/frozen-benchmark-specific content", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "lib/contract-model/compiler/semantic/prompt.ts",
      "lib/contract-model/compiler/semantic/completeness-check.ts",
      "lib/contract-model/compiler/semantic/compile.ts",
    ];
    const banned = /Riot|Coinbase|Final Maturity Date|Collateral Documents|Security Confirmation|Day Count Fraction/i;
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      expect(content).not.toMatch(banned);
    }
  });
});
