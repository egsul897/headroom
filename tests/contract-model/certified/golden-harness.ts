/**
 * GOLDEN HARNESS - a small hand-authored synthetic agreement + amendment, a scripted discovery population, a scripted
 * Pass A inventory, a scripted bounded semantic caller (fake provider client) and a scripted verifier. Zero provider
 * calls. Shared by the golden-map, certification, shared-capacity and Phase-4 boundary suites; every builder is
 * parametric so a suite can swap documents, candidates, inventory or the scripted submission without touching the
 * golden fixture itself.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { buildTestIndex, buildExactTermsByDocument } from "../context-retrieval-test-utils";
import { buildPackageGraph } from "../../../lib/contract-model/compiler/package-graph/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex } from "../../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate } from "../../../lib/contract-model/compiler/amendment/types";
import type { DiscoveredCandidate } from "../../../lib/contract-model/compiler/discovery/types";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import type { MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { BoundedSemanticCaller, SUBMIT_TOOL_NAME } from "../../../lib/contract-model/compiler/semantic/bounded-caller";
import { certifiedConfig } from "../../../lib/contract-model/compiler/certified-config";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import { HardDispatchBudget } from "../../../lib/contract-model/analyzer/dispatch-budget";
import { CERTIFIED_TRANSPORT_RETRY_POLICY } from "../../../lib/contract-model/analyzer/transport-retry";
import type { CovenantMapPackageInput, CertifiedExecutionDeps } from "../../../lib/contract-model/covenant-map";
import { sealDiscoveryPopulation, unsealedPopulation } from "../../../lib/contract-model/phase3-certification/discovery-population";

export const MODEL = "deepseek/deepseek-v4-flash";
export const CO = "golden-co", PKG = "golden-2026-credit-facility", INST = "instrument:golden-ca";
export const CA = "golden-ca", AMEND = "golden-amend-1";

export const GOLDEN_AGREEMENT = [
  "CREDIT AGREEMENT dated as of January 15, 2026, among Golden Holdings LLC, as Borrower, the Lenders party hereto and Agent Bank, as Administrative Agent.",
  "",
  "ARTICLE I DEFINITIONS",
  "",
  "SECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:",
  "",
  "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus Interest Expense for such period.",
  "",
  "\"Consolidated Net Income\" means, for any period, the net income of the Borrower and its Subsidiaries for such period determined on a consolidated basis.",
  "",
  "\"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money.",
  "",
  "\"Interest Expense\" means, for any period, total interest expense of the Borrower and its Subsidiaries for such period.",
  "",
  "\"Loan Documents\" means this Agreement, the Notes and the Security Documents.",
  "",
  "\"Subsidiary\" means any corporation or other entity that is controlled by the Borrower.",
  "",
  "SECTION 1.02 Terms Generally . The definitions of terms herein shall apply equally to the singular and plural forms of the terms defined.",
  "",
  "ARTICLE VII NEGATIVE COVENANTS",
  "",
  "SECTION 7.01 Indebtedness . The Borrower shall not create, incur or assume any Indebtedness, except:",
  "",
  "(a) Indebtedness under the Loan Documents;",
  "",
  "(b) other Indebtedness in an aggregate principal amount not to exceed $25,000,000 at any time outstanding; provided that no Default has occurred and is continuing at the time of incurrence; and",
  "",
  "(c) Indebtedness incurred by any Subsidiary in an aggregate principal amount not to exceed the greater of $10,000,000 and 5.0% of Consolidated EBITDA.",
  "",
  "SECTION 7.02 Liens . The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b).",
  "",
].join("\n");

export const GOLDEN_AMENDMENT = [
  "AMENDMENT NO. 1 dated as of June 1, 2026 to the Credit Agreement dated as of January 15, 2026, among Golden Holdings LLC, as Borrower, the Lenders party hereto and Agent Bank, as Administrative Agent.",
  "",
  "SECTION 1. Amendments . Section 7.02 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c).",
  "",
].join("\n");

export type GoldenDoc = { documentId: string; label: string; text: string; role: "BASE" | "AMENDMENT" };
export const DOCS: GoldenDoc[] = [{ documentId: CA, label: "Golden Credit Agreement (2026-01-15)", text: GOLDEN_AGREEMENT, role: "BASE" as const }, { documentId: AMEND, label: "Golden Amendment No. 1 (2026-06-01)", text: GOLDEN_AMENDMENT, role: "AMENDMENT" as const }];

// ---------------------------------------------------------------- scripted discovery (the population is an INPUT here)
export function candidate(index: ReturnType<typeof buildTestIndex>, ref: string, families: DiscoveredCandidate["families"], role: DiscoveredCandidate["role"], description: string, documentId = CA): DiscoveredCandidate {
  const res = index.resolveUniqueNodeByRef(documentId, ref);
  if (res.status !== "UNIQUE") throw new Error(`golden fixture: ${ref} is ${res.status}`);
  return { discoveryId: `discovery-candidate:golden-${ref}`, documentId: CA, structuralNodeKeys: [res.node.nodeKey], structuralNodeIds: [res.node.nodeId], normalizedSourceRef: ref, families, role, roleRaw: role, roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: families, familiesNormalizationStatus: "VALID_CANONICAL", description, multipleRulesLikely: ref === "7.01", definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL", "SEMANTIC_CLASSIFICATION"], evidenceSignals: ["shall not"], reviewStatus: "AUTO_ACCEPTED", confidence: 0.95, sourceCitation: `Section ${ref}`, discoveryRunVersion: "golden-discovery.v1" } as DiscoveredCandidate;
}

// ---------------------------------------------------------------- scripted Pass A (inventory) - excerpts are verbatim source
export type ScriptedInventory = Record<string, { excerpt: string; role: string; materiality: string; proposition: string }[]>;
export const DEFINITION_SENTENCES: Record<string, string> = {
  "Consolidated EBITDA": "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus Interest Expense for such period.",
  "Consolidated Net Income": "\"Consolidated Net Income\" means, for any period, the net income of the Borrower and its Subsidiaries for such period determined on a consolidated basis.",
  "Indebtedness": "\"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money.",
  "Interest Expense": "\"Interest Expense\" means, for any period, total interest expense of the Borrower and its Subsidiaries for such period.",
  "Loan Documents": "\"Loan Documents\" means this Agreement, the Notes and the Security Documents.",
  "Subsidiary": "\"Subsidiary\" means any corporation or other entity that is controlled by the Borrower.",
};
export const INVENTORY: ScriptedInventory = {
  // the definitions section is its OWN candidate: definitions are owned where they are defined, never by a covenant that merely uses them
  "1.01": [
    { excerpt: "As used in this Agreement, the following terms have the meanings specified below:", role: "OTHER", materiality: "MATERIAL", proposition: "definitions lead-in: the listed terms carry the stated meanings throughout the Agreement" },
    ...Object.entries(DEFINITION_SENTENCES).map(([term, excerpt]) => ({ excerpt, role: "FORMULA_COMPONENT", materiality: term === "Consolidated EBITDA" ? "CRITICAL" : "MATERIAL", proposition: `definition of ${term}` })),
  ],
  "7.01": [
    { excerpt: "The Borrower shall not create, incur or assume any Indebtedness, except:", role: "PROHIBITION", materiality: "CRITICAL", proposition: "general prohibition on Indebtedness" },
    { excerpt: "(a) Indebtedness under the Loan Documents;", role: "PERMISSION", materiality: "MATERIAL", proposition: "loan document debt permitted" },
    { excerpt: "(b) other Indebtedness in an aggregate principal amount not to exceed $25,000,000 at any time outstanding;", role: "PERMISSION", materiality: "CRITICAL", proposition: "general basket $25,000,000" },
    { excerpt: "provided that no Default has occurred and is continuing at the time of incurrence", role: "CONDITION", materiality: "MATERIAL", proposition: "no default condition on (b)" },
    { excerpt: "(c) Indebtedness incurred by any Subsidiary in an aggregate principal amount not to exceed the greater of $10,000,000 and 5.0% of Consolidated EBITDA.", role: "PERMISSION", materiality: "CRITICAL", proposition: "subsidiary basket greater of $10,000,000 and 5.0% of Consolidated EBITDA" },
  ],
  "7.02": [
    { excerpt: "The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c).", role: "PROHIBITION", materiality: "CRITICAL", proposition: "lien prohibition with a cross-referenced exception" },
  ],
};
export function scriptedStageCaller(inventory: ScriptedInventory = INVENTORY): StageCaller & { calls: { stage: string; chars: number }[] } {
  const calls: { stage: string; chars: number }[] = [];
  return {
    providerName: "scripted", model: MODEL, isSynthetic: false, calls,
    async call(schema, stage, _system, user) {
      calls.push({ stage, chars: user.length });
      if (stage === "semantic_inventory" && !(this as unknown as { firstUser?: string }).firstUser) (this as unknown as { firstUser?: string }).firstUser = user.slice(0, 1500);
      if (stage.startsWith("semantic_inventory")) {
        const items = Object.values(inventory).flat().filter((i) => user.includes(i.excerpt)).map((i, n) => ({ localRef: `i${n + 1}`, semanticRole: i.role, proposition: i.proposition, excerpt: i.excerpt, materiality: i.materiality, ambiguity: "NONE" }));
        return schema.parse({ items, uninventoriedValues: [], notes: [] });
      }
      if (stage === "condition_suspicion_classification") return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      if (stage === "semantic_verification") return schema.parse({ findings: [], overallNotes: ["scripted golden reviewer: no discrepancy"] });
      return schema.parse({});
    },
    lastTelemetry: () => ({ provider: "scripted", model: MODEL, promptVersion: "x", schemaVersion: "x", stage: "x", timestamp: new Date().toISOString(), inputTokens: 1000, outputTokens: 100, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: 1, providerCost: undefined, calculatedCostUsd: 0.000156 }),
  };
}

// ---------------------------------------------------------------- scripted Pass B (the fake provider answers the ONE structured call)
export function frozenIds(user: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+)/gm)].map((m) => m[1]!); }
export function idsFor(user: string, needle: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+) [^\n]*"([^"]*)"\)$/gm)].filter((m) => m[2]!.includes(needle)).map((m) => m[1]!); }
export const money = (amount: number, ids: string[], excerpt: string) => ({ kind: "MONEY", amount, currency: "USD", citation: "7.01", excerpt, inventoryItemIds: ids });
export type ScriptedSubmission = (user: string) => unknown;
/** Inventory item ids whose listed proposition contains `needle` (for excerpts that themselves contain quote characters). */
export function idsForProposition(user: string, needle: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+) ([^\n]*)$/gm)].filter((m) => m[2]!.includes(needle)).map((m) => m[1]!); }
export function submissionFor(user: string): unknown {
  const all = frozenIds(user);
  if (idsForProposition(user, "definition of Consolidated EBITDA").length > 0) {
    // the 1.01 definitions candidate: one WireDefinition per defined term, each consuming its own inventory item; the
    // lead-in sentence ("the following terms have the meanings specified below") governs every definition, so every
    // definition consumes it
    const leadIn = idsForProposition(user, "definitions lead-in");
    const defOf = (term: string, extra: Record<string, unknown>) => ({ localRef: `d-${term.replace(/\s+/g, "-").toLowerCase()}`, termName: term, covenantFamily: "DEFINITIONS_CALCULATION_RULES", sufficiency: "COMPLETE", citation: "1.01", excerpt: DEFINITION_SENTENCES[term], inventoryItemIds: [...idsForProposition(user, `definition of ${term}`), ...leadIn], ...extra });
    return {
      rules: [],
      definitions: [
        defOf("Consolidated EBITDA", { calculationExpression: { kind: "ADD", citation: "1.01", excerpt: "Consolidated Net Income for such period plus Interest Expense for such period", inventoryItemIds: idsForProposition(user, "definition of Consolidated EBITDA"), operands: [{ kind: "DEFINED_TERM_REFERENCE", termName: "Consolidated Net Income", valueType: "MONEY", citation: "1.01", excerpt: "Consolidated Net Income for such period" }, { kind: "DEFINED_TERM_REFERENCE", termName: "Interest Expense", valueType: "MONEY", citation: "1.01", excerpt: "Interest Expense for such period" }] }, dependsOnTerms: ["Consolidated Net Income", "Interest Expense"] }),
        defOf("Consolidated Net Income", { calculationExpression: null, dependsOnTerms: [] }),
        defOf("Indebtedness", { calculationExpression: null, dependsOnTerms: [] }),
        defOf("Interest Expense", { calculationExpression: null, dependsOnTerms: [] }),
        defOf("Loan Documents", { calculationExpression: null, dependsOnTerms: [] }),
        defOf("Subsidiary", { calculationExpression: null, dependsOnTerms: [] }),
      ],
      sharedCapacities: [], irExtensionCandidates: [], overallNotes: [],
    };
  }
  if (idsFor(user, "shall not create, incur or assume").length === 0) {
    return { rules: [{ localRef: "r1", sourceSectionRef: "7.02", covenantFamily: "LIENS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "CREATE_LIEN", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [{ description: "Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c)", permissionRef: null, conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesRuleTargets: [{ targetRef: "Section 7.01(b)" }, { targetRef: "Section 7.01(c)" }], targetCombination: "ANY_SATISFIED", referencesDefinitionId: null, description: "the secured Indebtedness is permitted under Section 7.01(b) or Section 7.01(c)", citation: "7.02", excerpt: "Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c)", inventoryItemIds: all }], citation: "7.02", excerpt: "except Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c)", inventoryItemIds: all }], dependsOn: [], sufficiency: "COMPLETE", citation: "7.02", excerpt: "The Borrower shall not create any Lien on any property", inventoryItemIds: all }], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
  }
  const prohibition = idsFor(user, "shall not create, incur or assume"), a = idsFor(user, "Loan Documents"), b = idsFor(user, "$25,000,000"), cond = idsFor(user, "no Default"), c = idsFor(user, "greater of $10,000,000");
  return {
    rules: [
      { localRef: "r0", sourceSectionRef: "7.01", covenantFamily: "INDEBTEDNESS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [{ description: "clause (a)", permissionRef: "r1", citation: "7.01(a)", excerpt: "(a) Indebtedness under the Loan Documents", inventoryItemIds: a }, { description: "clause (b)", permissionRef: "r2", citation: "7.01(b)", excerpt: "(b) other Indebtedness", inventoryItemIds: b }, { description: "clause (c)", permissionRef: "r3", citation: "7.01(c)", excerpt: "(c) Indebtedness incurred by any Subsidiary", inventoryItemIds: c }], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01", excerpt: "The Borrower shall not create, incur or assume any Indebtedness", inventoryItemIds: prohibition },
      { localRef: "r1", sourceSectionRef: "7.01(a)", covenantFamily: "INDEBTEDNESS", ruleType: "QUALITATIVE_OBLIGATION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: { kind: "UNLIMITED_CAPACITY", citation: "7.01(a)", excerpt: "Indebtedness under the Loan Documents", inventoryItemIds: a }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01(a)", excerpt: "(a) Indebtedness under the Loan Documents", inventoryItemIds: a },
      { localRef: "r2", sourceSectionRef: "7.01(b)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: money(25_000_000, b, "not to exceed $25,000,000 at any time outstanding"), conditions: [{ conditionType: "NO_DEFAULT", expression: null, description: "no Default has occurred and is continuing at the time of incurrence", citation: "7.01(b)", excerpt: "provided that no Default has occurred and is continuing", inventoryItemIds: cond }], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01(b)", excerpt: "(b) other Indebtedness in an aggregate principal amount not to exceed $25,000,000", inventoryItemIds: b },
      { localRef: "r3", sourceSectionRef: "7.01(c)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["NON_GUARANTOR_RS"], capacityExpression: { kind: "MAX", citation: "7.01(c)", excerpt: "the greater of $10,000,000 and 5.0% of Consolidated EBITDA", inventoryItemIds: c, operands: [money(10_000_000, c, "$10,000,000"), { kind: "MULTIPLY", citation: "7.01(c)", excerpt: "5.0% of Consolidated EBITDA", inventoryItemIds: c, operands: [{ kind: "PERCENT", value: 0.05, citation: "7.01(c)", excerpt: "5.0%", inventoryItemIds: c }, { kind: "DEFINED_TERM_REFERENCE", termName: "Consolidated EBITDA", valueType: "MONEY", citation: "1.01", excerpt: "Consolidated EBITDA", inventoryItemIds: c }] }] }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01(c)", excerpt: "(c) Indebtedness incurred by any Subsidiary", inventoryItemIds: c },
    ],
    // 7.01 USES Consolidated EBITDA (a DEFINED_TERM_REFERENCE inside 7.01(c)); the definition itself is owned by the 1.01 candidate
    definitions: [],
    sharedCapacities: [], irExtensionCandidates: [], overallNotes: [],
  };
}
export function fakeClient(submission: ScriptedSubmission = submissionFor): MinimalAnthropicClient & { requests: { system: string; user: string; messages: number }[] } {
  const requests: { system: string; user: string; messages: number }[] = [];
  return {
    requests,
    messages: { stream: (params) => ({ finalMessage: async () => {
      const user = String(params.messages[0]!.content);
      requests.push({ system: params.system, user, messages: params.messages.length });
      return { id: "msg", type: "message", role: "assistant", model: MODEL, content: [{ type: "tool_use", id: "tu", name: SUBMIT_TOOL_NAME, input: submission(user) }], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 5000, output_tokens: 800, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message;
    } }) },
  };
}

// ---------------------------------------------------------------- hand-authored amendment effect (what the amendment pipeline would extract)
export const AMENDMENT_EFFECTS: AmendmentEffectCandidate[] = [{
  effectId: "golden-effect-1", amendmentDocumentId: AMEND,
  target: { kind: "SECTION", targetDocumentId: CA, targetInstrumentKey: INST, targetStructuralNodeKey: null, targetSectionRef: "7.02", targetDefinedTermRef: null, targetHint: null },
  operation: "REPLACE_TEXT", effectiveDate: { date: "2026-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "dated as of June 1, 2026", reason: "explicit" },
  newText: "The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c).", oldText: null,
  sourceCitation: "Amendment No. 1, Section 1", sourceExcerpt: "Section 7.02 of the Credit Agreement is hereby amended and restated in its entirety", confidence: 0.98, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
} as AmendmentEffectCandidate];

export interface BuildPackageOptions {
  docs?: GoldenDoc[];
  /** [ref, families, role, description, documentId?] - defaults to the golden 7.01 / 7.02 population. */
  candidateSpecs?: [string, DiscoveredCandidate["families"], DiscoveredCandidate["role"], string, string?][];
  effects?: AmendmentEffectCandidate[];
  scope?: "COMPLETE" | "PARTIAL_TARGET_SET";
  /** false = hand the pipeline an UNSEALED population (what a benchmark subset caller does). */
  sealed?: boolean;
  asOfDate?: string;
}
export function buildPackageFrom(o: BuildPackageOptions = {}): { pkg: CovenantMapPackageInput; index: ReturnType<typeof buildTestIndex> } {
  const docs = o.docs ?? DOCS;
  const effects = o.effects ?? AMENDMENT_EFFECTS;
  const asOfDate = o.asOfDate ?? "2026-09-01";
  const index = buildTestIndex(docs);
  const packageGraph = buildPackageGraph(CO, PKG, docs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })));
  const operativeState = computeOperativeContractState({ instrumentKey: INST, baseDocumentId: CA, asOfDate, index, allEffects: effects });
  const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: CA, state: operativeState }]);
  const specs = o.candidateSpecs ?? [["1.01", ["DEFINITIONS_CALCULATION_RULES"], "DEFINITIONAL_DEPENDENCY_CANDIDATE", "defined terms"], ["7.01", ["INDEBTEDNESS"], "GENERAL_PROHIBITION", "debt covenant with baskets"], ["7.02", ["LIENS"], "GENERAL_PROHIBITION", "lien covenant"]];
  const candidates = specs.map(([ref, families, role, description, documentId]) => candidate(index, ref, families, role, description, documentId));
  const scope = o.scope ?? "COMPLETE";
  const discoveryPopulation = o.sealed === false ? unsealedPopulation(candidates, "golden-discovery.v1", scope) : sealDiscoveryPopulation({ documents: docs, discoveryVersion: "golden-discovery.v1", candidates, scope });
  return { index, pkg: { companyId: CO, packageKey: PKG, instrumentKey: INST, asOfDate, documents: docs, index, packageGraph, exactTermsByDocument: buildExactTermsByDocument(docs), operativeState, amendmentEffects: effects, supersessionIndex, candidates, discoveryRunVersion: "golden-discovery.v1", discoveryPopulation } };
}
export function buildPackage(): { pkg: CovenantMapPackageInput; index: ReturnType<typeof buildTestIndex> } { return buildPackageFrom(); }
export type GoldenDeps = CertifiedExecutionDeps & { client: ReturnType<typeof fakeClient>; inventory: [ReturnType<typeof scriptedStageCaller>, ReturnType<typeof scriptedStageCaller>]; verifier: ReturnType<typeof scriptedStageCaller> };
export function deps(client = fakeClient(), inventorySpec: ScriptedInventory = INVENTORY): GoldenDeps {
  const inventory: [ReturnType<typeof scriptedStageCaller>, ReturnType<typeof scriptedStageCaller>] = [scriptedStageCaller(inventorySpec), scriptedStageCaller(inventorySpec)];
  const verifier = scriptedStageCaller(inventorySpec);
  return { client, inventory, verifier, config: certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL, transportRetry: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 } }), semanticCaller: new BoundedSemanticCaller("fake", MODEL, client, { maxOutputTokens: 8000 }), inventoryPassCallers: inventory, inventoryCaller: null, reviewCaller: verifier, conditionSuspicionCaller: verifier, budget: new HardDispatchBudget({ ceilingUsd: 5, maxCalls: 100 }), concurrency: 1, cache: new InMemorySemanticCompilationCache() };
}

