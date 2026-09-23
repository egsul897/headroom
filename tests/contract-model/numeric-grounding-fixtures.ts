/**
 * FIX B (numeric grounding) - shared synthetic fixtures.
 *
 * One generic synthetic agreement plus the seven cases the remediation mission specifies. Nothing
 * here is real package text: the section numbering deliberately mirrors the forensic case
 * (§7.2(f)) because the mission asks for a reproduction of that exact CONDITION, but every word of
 * the agreement is synthetic and every figure is generic.
 *
 * Used by both the red-baseline evidence script (scripts/p3-conmed-pilot/numeric-grounding-red-
 * baseline.ts, which runs the UNFIXED verifier) and the test matrix, so the before and after
 * pictures are taken of exactly the same inputs.
 */
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { emptyContextBundle, testCompilerInput, TEST_COMPANY_ID, TEST_INSTRUMENT_KEY } from "./semantic-compiler/test-helpers";
import type { SemanticCompilationResult, ToolCallLogEntry } from "../../lib/contract-model/compiler/semantic/types";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { IRCondition, IRDefinition, IRExpression, IRRule, SourceProvenance } from "../../lib/contract-model/ir/types";

export const NG_DOC = "ng-doc";

/** A generic synthetic credit agreement: a definitions section, a qualitative permission with no figures of its own, and a neighbouring clause that DOES carry economics. */
export const NG_TEXT = [
  "SECTION 1.01. Defined Terms .",
  "“Convertible Notes” means the 2.25% convertible senior notes of the Parent Borrower in an aggregate principal amount of $800,000,000.",
  "“Unrelated Term” means a defined term with no economic content whatsoever.",
  "SECTION 7.1. Limitation on Indebtedness . The Parent Borrower shall not incur Indebtedness, except: (d) Indebtedness in respect of the Convertible Notes;",
  "SECTION 7.2. Limitation on Guarantees . The Parent Borrower shall not make Guarantees, except: (f) guarantees made in the ordinary course of business by the Parent Borrower or any of its Subsidiaries of obligations of any Subsidiary Guarantor; (k) guarantees of Indebtedness in an aggregate principal amount not to exceed $150,000,000 or 10.0% of Consolidated Total Assets, provided that no Default has occurred and is continuing.",
].join("\n");

/** The §7.2(f) anchor, verbatim in shape to the forensic case: a purely qualitative permission - no amount, no percentage, no denominator. */
export const ANCHOR_7_2_F = "(f) guarantees made in the ordinary course of business by the Parent Borrower or any of its Subsidiaries of obligations of any Subsidiary Guarantor;";
/** A §7.2(k)(i)-shaped child anchor: a bare condition whose governing economics live in the PARENT clause, never in the child. */
export const ANCHOR_CHILD_CONDITION = "(i) no Default has occurred and is continuing;";
/** A §7.1(d)-shaped anchor: the economics live in an authenticated DEFINITION, never in the anchor. */
export const ANCHOR_7_1_D = "(d) Indebtedness in respect of the Convertible Notes;";

export function ngIndex(): StructuralIndex {
  const doc = { documentId: NG_DOC, label: "CA", text: NG_TEXT };
  const nodes = parseDocumentStructure(doc);
  return buildStructuralIndex(
    new Map([[NG_DOC, { text: NG_TEXT, nodes }]]),
    detectStructuralDefinitions(NG_DOC, NG_TEXT, nodes),
    detectStructuralReferences(NG_DOC, NG_TEXT, nodes),
  );
}

let exprCounter = 0;
export const provenance = (sourceCitation: string, excerpt: string | null = null): SourceProvenance => ({ documentId: NG_DOC, sourceNodeKey: null, sourceCitation, excerpt });
export const percent = (value: number, citation = "§7.2(f)"): IRExpression => ({ exprId: `ng-e${++exprCounter}`, kind: "PERCENT", type: "PERCENT", value, provenance: provenance(citation) }) as unknown as IRExpression;

export function condition(description: string, opts: { provenance?: SourceProvenance | null; expression?: IRExpression | null } = {}): IRCondition {
  return {
    conditionId: `ng-cond-${++exprCounter}`,
    conditionType: "OTHER",
    expression: opts.expression ?? null,
    referencesDefinitionId: null,
    description,
    provenance: opts.provenance ?? null,
  } as unknown as IRCondition;
}

export function ngRule(overrides: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: "ng-rule:1",
    irSchemaVersion: "v1",
    companyId: TEST_COMPANY_ID,
    instrumentKey: TEST_INSTRUMENT_KEY,
    sourceDocumentId: NG_DOC,
    sourceSectionRef: "7.2(f)",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUALITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "GUARANTEE",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: provenance("§7.2(f)"),
    compilerVersion: "v1",
    sourceContentVersion: null,
    ...overrides,
  } as unknown as IRRule;
}

export function ngDefinition(termName: string, overrides: Partial<IRDefinition> = {}): IRDefinition {
  return {
    definitionId: `ng-definition:${termName.toLowerCase().replace(/\s+/g, "-")}`,
    irSchemaVersion: "v1",
    companyId: TEST_COMPANY_ID,
    instrumentKey: TEST_INSTRUMENT_KEY,
    sourceDocumentId: NG_DOC,
    termName,
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    calculationExpression: null,
    dependsOnTerms: [],
    sufficiency: "PARTIAL",
    sufficiencyReasons: ["prose definition not formalized in this fixture"],
    provenance: provenance(`Definition of "${termName}"`),
    compilerVersion: "v1",
    sourceContentVersion: null,
    ...overrides,
  } as unknown as IRDefinition;
}

export function ngCompilation(overrides: Partial<SemanticCompilationResult> = {}): SemanticCompilationResult {
  return { status: "REVIEW_REQUIRED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {}, provider: "test", model: "test-model", telemetry: null, cacheKey: "ng", compiledAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

/** A compiler tool-call record for a provision the compiler really retrieved - the ONLY channel through which a neighbouring section becomes authenticated evidence (retrieved-evidence.ts builds PROVISION requests from tool calls alone). Unchanged by this mission. */
export function provisionCall(sectionRef: string, charsReturned = 400): ToolCallLogEntry {
  return { toolName: "getOperativeProvision", input: { sectionRef }, outputSummary: `provision ${sectionRef} (status OPERATIVE_STATE_RESOLVED, evidence CURRENT)`, charsReturned, timestamp: "2026-01-01T00:00:00.000Z", evidenceUnresolved: false, evidenceTruncated: false };
}

export function ngInput(opts: { operativeSourceText: string; sectionRef?: string; rules?: IRRule[]; definitions?: IRDefinition[]; toolCallLog?: ToolCallLogEntry[] }): VerificationInput {
  const idx = ngIndex();
  const contextBundle = emptyContextBundle();
  return {
    compilerInput: testCompilerInput({
      sourceDocumentId: NG_DOC,
      sourceSectionRef: opts.sectionRef ?? "7.2(f)",
      operativeSourceText: opts.operativeSourceText,
      contextBundle,
      toolAccess: { structuralIndex: idx, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle },
    }),
    compilationResult: ngCompilation({ rules: opts.rules ?? [], definitions: opts.definitions ?? [], toolCallLog: opts.toolCallLog ?? [] }),
  };
}

// ---------------------------------------------------------------------------
// The seven cases.
// ---------------------------------------------------------------------------

/** §10 / §3-A. The forensic reproduction: qualitative anchor, no 100% anywhere in source, a free-text rule assertion that states one, a VALID §7.2(f) citation, otherwise well-formed. */
export const caseA_unsupportedProsePercentage = (): VerificationInput =>
  ngInput({
    operativeSourceText: ANCHOR_7_2_F,
    rules: [ngRule({ conditions: [condition("The guarantee may cover up to 100% of the guaranteed obligations of the Subsidiary Guarantor.", { provenance: provenance("§7.2(f)") })] })],
  });

/** §3-B. The same shape, but the anchor itself states the figure - the fix must be able to tell these two apart. */
export const caseB_supportedProsePercentage = (): VerificationInput =>
  ngInput({
    operativeSourceText: `${ANCHOR_7_2_F} Each such guarantee may cover up to 100% of the obligations guaranteed.`,
    rules: [ngRule({ conditions: [condition("The guarantee may cover up to 100% of the guaranteed obligations of the Subsidiary Guarantor.", { provenance: provenance("§7.2(f)") })] })],
  });

/** §3-C. The already-correct STRUCTURED path: a PERCENT literal of 1 (i.e. 100%) with no supporting source figure must keep producing a structured IR_ONLY item. */
export const caseC_structuredNumericControl = (): VerificationInput =>
  ngInput({
    operativeSourceText: ANCHOR_7_2_F,
    rules: [ngRule({ capacityExpression: percent(1) as never })],
  });

/** §11. The 7.1(d)-modeled control: the figures are absent from the anchor and present in an authenticated DEFINITION the IR itself represents. Must stay grounded. */
export const caseD_supportedContextControl = (): VerificationInput =>
  ngInput({
    operativeSourceText: ANCHOR_7_1_D,
    sectionRef: "7.1",
    rules: [ngRule({ sourceSectionRef: "7.1", provenance: provenance("§7.1"), conditions: [condition("Permitted only in respect of the 2.25% Convertible Notes in an aggregate principal amount of $800,000,000.", { provenance: provenance("§7.1") })] })],
    definitions: [ngDefinition("Convertible Notes")],
  });

/** §12. The closed 7.2(k)(i) case as a control: a child clause whose free-text assertion DISCUSSES the parent's economics, with the parent section authenticated as context. Numeric grounding must say GROUNDED_CONTEXT; whether the child OWNS those economics is the separate attribution dimension the candidate-span/F1 work governs, and must stay separately inspectable. */
export const caseE_parentEconomicsInContext = (): VerificationInput =>
  ngInput({
    operativeSourceText: ANCHOR_CHILD_CONDITION,
    sectionRef: "7.2",
    rules: [ngRule({ sourceSectionRef: "7.2", provenance: provenance("§7.2"), conditions: [condition("This condition qualifies the guarantee basket of $150,000,000 or 10.0% of Consolidated Total Assets established by the parent clause.", { provenance: provenance("§7.2") })] })],
    toolCallLog: [provisionCall("7.2")],
  });

/** §13. A fabricated provenance excerpt: a model-generated "quotation" of source text that states a figure the authenticated source never states. */
export const caseF_fabricatedExcerpt = (): VerificationInput =>
  ngInput({
    operativeSourceText: ANCHOR_7_2_F,
    rules: [ngRule({ provenance: provenance("§7.2(f)", "guarantees ... of up to 100% of the obligations of any Subsidiary Guarantor") })],
  });

/** §13. Section numbering must never become a numeric assertion. */
export const caseG_citationNumbering = (): VerificationInput =>
  ngInput({
    operativeSourceText: ANCHOR_7_2_F,
    rules: [ngRule({ conditions: [condition("Permitted as provided in Section 7.2(f), subject to Article 10.1 and clause (iii) of Section 6.01(b), as of December 31, 2029.", { provenance: provenance("§7.2(f)") })] })],
  });

export const NG_CASES: Readonly<Record<string, () => VerificationInput>> = {
  A_unsupported_prose_percentage: caseA_unsupportedProsePercentage,
  B_supported_prose_percentage: caseB_supportedProsePercentage,
  C_structured_numeric_control: caseC_structuredNumericControl,
  D_supported_context_control: caseD_supportedContextControl,
  E_parent_economics_in_context: caseE_parentEconomicsInContext,
  F_fabricated_excerpt: caseF_fabricatedExcerpt,
  G_citation_numbering: caseG_citationNumbering,
};
