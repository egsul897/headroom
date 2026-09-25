/**
 * GOLDEN CANONICAL MAP - a small hand-authored synthetic agreement + amendment, a scripted discovery population, a
 * scripted Pass A inventory, a scripted bounded semantic caller (fake provider client), a scripted verifier, and a
 * HAND-AUTHORED expected map. Zero provider calls. The expected structure is written down before the test runs; the
 * test does not read its expectations from the code under test.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
const sha256 = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
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
import { compileCovenantMap, validateCovenantMap, renderCovenantMapMarkdown, computeMapHash, type CovenantMapPackageInput, type CertifiedExecutionDeps } from "../../../lib/contract-model/covenant-map";

const MODEL = "deepseek/deepseek-v4-flash";
const CO = "golden-co", PKG = "golden-2026-credit-facility", INST = "instrument:golden-ca";
const CA = "golden-ca", AMEND = "golden-amend-1";

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
  "\"Subsidiary\" means any corporation or other entity of which more than 50% of the voting equity is owned by the Borrower.",
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

const DOCS = [{ documentId: CA, label: "Golden Credit Agreement (2026-01-15)", text: GOLDEN_AGREEMENT, role: "BASE" as const }, { documentId: AMEND, label: "Golden Amendment No. 1 (2026-06-01)", text: GOLDEN_AMENDMENT, role: "AMENDMENT" as const }];

// ---------------------------------------------------------------- scripted discovery (the population is an INPUT here)
function candidate(index: ReturnType<typeof buildTestIndex>, ref: string, families: DiscoveredCandidate["families"], role: DiscoveredCandidate["role"], description: string): DiscoveredCandidate {
  const res = index.resolveUniqueNodeByRef(CA, ref);
  if (res.status !== "UNIQUE") throw new Error(`golden fixture: ${ref} is ${res.status}`);
  return { discoveryId: `discovery-candidate:golden-${ref}`, documentId: CA, structuralNodeKeys: [res.node.nodeKey], structuralNodeIds: [res.node.nodeId], normalizedSourceRef: ref, families, role, roleRaw: role, roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: families, familiesNormalizationStatus: "VALID_CANONICAL", description, multipleRulesLikely: ref === "7.01", definedTermDependencyLikely: true, discoveryMethods: ["DETERMINISTIC_SIGNAL", "SEMANTIC_CLASSIFICATION"], evidenceSignals: ["shall not"], reviewStatus: "AUTO_ACCEPTED", confidence: 0.95, sourceCitation: `Section ${ref}`, discoveryRunVersion: "golden-discovery.v1" } as DiscoveredCandidate;
}

// ---------------------------------------------------------------- scripted Pass A (inventory) - excerpts are verbatim source
const INVENTORY: Record<string, { excerpt: string; role: string; materiality: string; proposition: string }[]> = {
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
function scriptedStageCaller(): StageCaller & { calls: { stage: string; chars: number }[] } {
  const calls: { stage: string; chars: number }[] = [];
  return {
    providerName: "scripted", model: MODEL, isSynthetic: false, calls,
    async call(schema, stage, _system, user) {
      calls.push({ stage, chars: user.length });
      if (stage === "semantic_inventory" && !(this as unknown as { firstUser?: string }).firstUser) (this as unknown as { firstUser?: string }).firstUser = user.slice(0, 1500);
      if (stage.startsWith("semantic_inventory")) {
        const items = Object.values(INVENTORY).flat().filter((i) => user.includes(i.excerpt)).map((i, n) => ({ localRef: `i${n + 1}`, semanticRole: i.role, proposition: i.proposition, excerpt: i.excerpt, materiality: i.materiality, ambiguity: "NONE" }));
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
function frozenIds(user: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+)/gm)].map((m) => m[1]!); }
function idsFor(user: string, needle: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+) [^\n]*"([^"]*)"\)$/gm)].filter((m) => m[2]!.includes(needle)).map((m) => m[1]!); }
const money = (amount: number, ids: string[], excerpt: string) => ({ kind: "MONEY", amount, currency: "USD", citation: "7.01", excerpt, inventoryItemIds: ids });
function submissionFor(user: string): unknown {
  const all = frozenIds(user);
  if (idsFor(user, "shall not create, incur or assume").length === 0) {
    return { rules: [{ localRef: "r1", sourceSectionRef: "7.02", covenantFamily: "LIENS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "INCUR_LIEN", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [{ description: "Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c)", permissionRef: null, conditions: [], citation: "7.02", excerpt: "except Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c)", inventoryItemIds: all }], dependsOn: [], sufficiency: "COMPLETE", citation: "7.02", excerpt: "The Borrower shall not create any Lien on any property", inventoryItemIds: all }], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
  }
  const prohibition = idsFor(user, "shall not create, incur or assume"), a = idsFor(user, "Loan Documents"), b = idsFor(user, "$25,000,000"), cond = idsFor(user, "no Default"), c = idsFor(user, "greater of $10,000,000");
  return {
    rules: [
      { localRef: "r0", sourceSectionRef: "7.01", covenantFamily: "INDEBTEDNESS", ruleType: "PROHIBITION", posture: "PROHIBITION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: null, conditions: [], exceptions: [{ description: "clause (a)", permissionRef: "r1", citation: "7.01(a)", excerpt: "(a) Indebtedness under the Loan Documents", inventoryItemIds: a }, { description: "clause (b)", permissionRef: "r2", citation: "7.01(b)", excerpt: "(b) other Indebtedness", inventoryItemIds: b }, { description: "clause (c)", permissionRef: "r3", citation: "7.01(c)", excerpt: "(c) Indebtedness of Subsidiaries", inventoryItemIds: c }], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01", excerpt: "The Borrower shall not create, incur or assume any Indebtedness", inventoryItemIds: prohibition },
      { localRef: "r1", sourceSectionRef: "7.01(a)", covenantFamily: "INDEBTEDNESS", ruleType: "QUALITATIVE_OBLIGATION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: { kind: "UNLIMITED_CAPACITY", citation: "7.01(a)", excerpt: "Indebtedness under the Loan Documents", inventoryItemIds: a }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01(a)", excerpt: "(a) Indebtedness under the Loan Documents", inventoryItemIds: a },
      { localRef: "r2", sourceSectionRef: "7.01(b)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["BORROWER"], capacityExpression: money(25_000_000, b, "not to exceed $25,000,000 at any time outstanding"), conditions: [{ conditionType: "NO_DEFAULT", expression: null, description: "no Default has occurred and is continuing at the time of incurrence", citation: "7.01(b)", excerpt: "provided that no Default has occurred and is continuing", inventoryItemIds: cond }], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01(b)", excerpt: "(b) other Indebtedness in an aggregate principal amount not to exceed $25,000,000", inventoryItemIds: b },
      { localRef: "r3", sourceSectionRef: "7.01(c)", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: ["NON_GUARANTOR_RS"], capacityExpression: { kind: "MAX", citation: "7.01(c)", excerpt: "the greater of $10,000,000 and 5.0% of Consolidated EBITDA", inventoryItemIds: c, operands: [money(10_000_000, c, "$10,000,000"), { kind: "MULTIPLY", citation: "7.01(c)", excerpt: "5.0% of Consolidated EBITDA", inventoryItemIds: c, operands: [{ kind: "PERCENT", value: 0.05, citation: "7.01(c)", excerpt: "5.0%", inventoryItemIds: c }, { kind: "DEFINED_TERM_REFERENCE", termName: "Consolidated EBITDA", valueType: "MONEY", citation: "1.01", excerpt: "Consolidated EBITDA", inventoryItemIds: c }] }] }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", citation: "7.01(c)", excerpt: "(c) Indebtedness of Subsidiaries", inventoryItemIds: c },
    ],
    definitions: [
      { localRef: "d1", termName: "Consolidated EBITDA", calculationExpression: { kind: "ADD", citation: "1.01", excerpt: "Consolidated Net Income for such period plus Interest Expense for such period", operands: [{ kind: "DEFINED_TERM_REFERENCE", termName: "Consolidated Net Income", valueType: "MONEY", citation: "1.01", excerpt: "Consolidated Net Income" }, { kind: "DEFINED_TERM_REFERENCE", termName: "Interest Expense", valueType: "MONEY", citation: "1.01", excerpt: "Interest Expense" }] }, dependsOnTerms: ["Consolidated Net Income", "Interest Expense"], sufficiency: "COMPLETE", citation: "1.01", excerpt: "\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus Interest Expense for such period." },
      { localRef: "d2", termName: "Consolidated Net Income", calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE", citation: "1.01", excerpt: "\"Consolidated Net Income\" means, for any period, the net income of the Borrower and its Subsidiaries" },
      { localRef: "d3", termName: "Interest Expense", calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE", citation: "1.01", excerpt: "\"Interest Expense\" means, for any period, total interest expense" },
    ],
    sharedCapacities: [], irExtensionCandidates: [], overallNotes: [],
  };
}
function fakeClient(): MinimalAnthropicClient & { requests: { system: string; user: string; messages: number }[] } {
  const requests: { system: string; user: string; messages: number }[] = [];
  return {
    requests,
    messages: { stream: (params) => ({ finalMessage: async () => {
      const user = String(params.messages[0]!.content);
      requests.push({ system: params.system, user, messages: params.messages.length });
      return { id: "msg", type: "message", role: "assistant", model: MODEL, content: [{ type: "tool_use", id: "tu", name: SUBMIT_TOOL_NAME, input: submissionFor(user) }], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 5000, output_tokens: 800, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message;
    } }) },
  };
}

// ---------------------------------------------------------------- hand-authored amendment effect (what the amendment pipeline would extract)
const AMENDMENT_EFFECTS: AmendmentEffectCandidate[] = [{
  effectId: "golden-effect-1", amendmentDocumentId: AMEND,
  target: { kind: "SECTION", targetDocumentId: CA, targetInstrumentKey: INST, targetStructuralNodeKey: null, targetSectionRef: "7.02", targetDefinedTermRef: null, targetHint: null },
  operation: "REPLACE_TEXT", effectiveDate: { date: "2026-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "dated as of June 1, 2026", reason: "explicit" },
  newText: "The Borrower shall not create any Lien on any property, except Liens securing Indebtedness permitted under Section 7.01(b) or Section 7.01(c).", oldText: null,
  sourceCitation: "Amendment No. 1, Section 1", sourceExcerpt: "Section 7.02 of the Credit Agreement is hereby amended and restated in its entirety", confidence: 0.98, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
} as AmendmentEffectCandidate];

export function buildPackage(): { pkg: CovenantMapPackageInput; index: ReturnType<typeof buildTestIndex> } {
  const index = buildTestIndex(DOCS);
  const packageGraph = buildPackageGraph(CO, PKG, DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })));
  const operativeState = computeOperativeContractState({ instrumentKey: INST, baseDocumentId: CA, asOfDate: "2026-09-01", index, allEffects: AMENDMENT_EFFECTS });
  const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: CA, state: operativeState }]);
  const candidates = [candidate(index, "7.01", ["INDEBTEDNESS"], "GENERAL_PROHIBITION", "debt covenant with baskets"), candidate(index, "7.02", ["LIENS"], "GENERAL_PROHIBITION", "lien covenant")];
  return { index, pkg: { companyId: CO, packageKey: PKG, instrumentKey: INST, asOfDate: "2026-09-01", documents: DOCS, index, packageGraph, exactTermsByDocument: buildExactTermsByDocument(DOCS), operativeState, amendmentEffects: AMENDMENT_EFFECTS, supersessionIndex, candidates, discoveryRunVersion: "golden-discovery.v1" } };
}
export function deps(client = fakeClient()): CertifiedExecutionDeps & { client: ReturnType<typeof fakeClient>; inventory: [ReturnType<typeof scriptedStageCaller>, ReturnType<typeof scriptedStageCaller>]; verifier: ReturnType<typeof scriptedStageCaller> } {
  const inventory: [ReturnType<typeof scriptedStageCaller>, ReturnType<typeof scriptedStageCaller>] = [scriptedStageCaller(), scriptedStageCaller()];
  const verifier = scriptedStageCaller();
  return { client, inventory, verifier, config: certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL, transportRetry: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 } }), semanticCaller: new BoundedSemanticCaller("fake", MODEL, client, { maxOutputTokens: 8000 }), inventoryPassCallers: inventory, inventoryCaller: null, reviewCaller: verifier, conditionSuspicionCaller: verifier, budget: new HardDispatchBudget({ ceilingUsd: 5, maxCalls: 100 }), concurrency: 1, cache: new InMemorySemanticCompilationCache() };
}

describe("golden canonical map", () => {
  it("structure -> scripted discovery -> certified compile (fake provider) -> verify -> map matches the hand-authored expectation; identical across runs", async () => {
    const { pkg } = buildPackage();
    const d = deps();
    const run = await compileCovenantMap(pkg, d);
    const map = run.map;
    const md = renderCovenantMapMarkdown(map);
    if (!map.completeness.complete) console.log(JSON.stringify({ candidates: map.candidates.map((c) => ({ ref: c.sectionRef, outcome: c.outcome, compile: c.compilationStatus, reasons: c.compilationFailureReasons, verify: c.verificationStatus, failure: c.failure })), unresolved: map.unresolved.map((u) => `${u.kind}: ${u.detail}`), issues: run.results.map((r) => r.compilation?.unresolvedIssues) }, null, 2));

    // ---- execution shape: ONE semantic conversation per candidate, single-message requests, two independent Pass A executions
    expect(d.client.requests.length).toBe(2);
    for (const r of d.client.requests) expect(r.messages).toBe(1);
    expect(d.inventory[0].calls.filter((c) => c.stage === "semantic_inventory").length).toBe(2);
    expect(d.inventory[1].calls.filter((c) => c.stage === "semantic_inventory").length).toBe(2);
    expect(run.stop).toBeNull();

    // ---- the hand-authored expectation
    expect(map.candidates.map((c) => [c.sectionRef, c.outcome])).toEqual([["7.01", "MAPPED"], ["7.02", "MAPPED"]]);
    expect(map.unresolved).toEqual([]);
    expect(map.completeness).toMatchObject({ candidatesDiscovered: 2, candidatesEligible: 2, candidatesMapped: 2, candidatesFailed: 0, candidatesUnserved: 0, nodesByKind: { RULE: 5, DEFINITION: 3, SHARED_CAPACITY: 0 }, unresolvedBlocking: 0, unresolvedReview: 0, nodesStrongIdentity: 8, complete: true, mappedFraction: 1 });
    // source order: three definitions (1.01, document order), then 7.01 chapeau, (a), (b), (c), then 7.02
    expect(map.nodes.map((n) => `${n.kind}:${n.termName ?? n.sectionRef}`)).toEqual(["DEFINITION:Consolidated EBITDA", "DEFINITION:Consolidated Net Income", "DEFINITION:Interest Expense", "RULE:7.01", "RULE:7.01(a)", "RULE:7.01(b)", "RULE:7.01(c)", "RULE:7.02"]);
    for (let i = 1; i < map.nodes.length; i++) expect(map.nodes[i]!.sourceOrder.charStart).toBeGreaterThanOrEqual(map.nodes[i - 1]!.sourceOrder.charStart);
    const byRef = (ref: string) => map.nodes.find((n) => n.kind === "RULE" && n.sectionRef === ref)!;
    const byTerm = (t: string) => map.nodes.find((n) => n.kind === "DEFINITION" && n.termName === t)!;
    const edge = (t: string, from: string, to: string) => map.edges.find((e) => e.edgeType === t && e.fromNodeId === from && e.toNodeId === to);
    // relationships
    expect(edge("RULE_MODIFIED_BY_EXCEPTION", byRef("7.01").nodeId, byRef("7.01(a)").nodeId)).toBeTruthy();
    expect(edge("RULE_MODIFIED_BY_EXCEPTION", byRef("7.01").nodeId, byRef("7.01(b)").nodeId)).toBeTruthy();
    expect(edge("RULE_MODIFIED_BY_EXCEPTION", byRef("7.01").nodeId, byRef("7.01(c)").nodeId)).toBeTruthy();
    for (const p of ["7.01(a)", "7.01(b)", "7.01(c)"]) expect(edge("RULE_SUBJECT_TO_GENERAL_PROHIBITION", byRef(p).nodeId, byRef("7.01").nodeId)).toBeTruthy();
    expect(edge("RULE_USES_DEFINITION", byRef("7.01(c)").nodeId, byTerm("Consolidated EBITDA").nodeId)).toBeTruthy();
    expect(edge("DEFINITION_USES_DEFINITION", byTerm("Consolidated EBITDA").nodeId, byTerm("Consolidated Net Income").nodeId)).toBeTruthy();
    expect(edge("DEFINITION_USES_DEFINITION", byTerm("Consolidated EBITDA").nodeId, byTerm("Interest Expense").nodeId)).toBeTruthy();
    expect(map.completeness.edgesByType).toMatchObject({ RULE_MODIFIED_BY_EXCEPTION: 3, RULE_SUBJECT_TO_GENERAL_PROHIBITION: 3, RULE_USES_DEFINITION: 1, DEFINITION_USES_DEFINITION: 2, RULE_DEPENDS_ON_RULE: 0, RULE_USES_SHARED_CAPACITY: 0 });
    // values
    const b = byRef("7.01(b)").unit as { capacityExpression: { kind: string; amount: number }; conditions: { conditionType: string }[] };
    expect(b.capacityExpression).toMatchObject({ kind: "MONEY", amount: 25_000_000 }); expect(b.conditions.map((c) => c.conditionType)).toEqual(["NO_DEFAULT"]);
    const c = byRef("7.01(c)").unit as { capacityExpression: { kind: string; operands: { kind: string; amount?: number }[] } };
    expect(c.capacityExpression.kind).toBe("MAX"); expect(c.capacityExpression.operands[0]).toMatchObject({ kind: "MONEY", amount: 10_000_000 });
    // amendment precedence: 7.02 is governed by the amendment; its operative record names the applied effect and the base node it supersedes
    const lien = byRef("7.02");
    expect(lien.operative).toMatchObject({ status: "OPERATIVE_STATE_RESOLVED", appliedEffectIds: ["golden-effect-1"], currentSourceDocumentId: AMEND });
    expect(byRef("7.01").operative).toBeNull();
    const lienCandidate = map.candidates.find((k) => k.sectionRef === "7.02")!;
    expect(lienCandidate.operativeSourceSha256).toBe(sha256(AMENDMENT_EFFECTS[0]!.newText!)); // the AMENDED text was compiled, not the superseded base text
    expect((lien.unit as { exceptions: { description: string }[] }).exceptions[0]!.description).toContain("7.01(c)");
    // every node: STRONG identity, sourceContentVersion populated, verified
    for (const n of map.nodes) { expect(n.identityStrength).toBe("STRONG"); expect(n.sourceContentVersion).toMatch(/^scv1:[0-9a-f]{64}$/); expect(n.verification.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND"); }
    expect(new Set(map.nodes.map((n) => n.sourceContentVersion)).size).toBe(2); // one version per candidate source
    // validation + hash
    const v = validateCovenantMap(map);
    expect(v.problems).toEqual([]); expect(v.ok).toBe(true);
    expect(map.mapHash).toMatch(/^[0-9a-f]{64}$/); expect(computeMapHash(map)).toBe(map.mapHash);
    expect(md).toContain("| 7.01(b) |"); expect(md).toContain("RULE_USES_DEFINITION");

    // ---- byte-identical across runs (fresh callers, fresh budget, fresh cache)
    const run2 = await compileCovenantMap(pkg, deps());
    expect(run2.map.mapHash).toBe(map.mapHash);
    expect(JSON.stringify({ ...run2.map, candidates: run2.map.candidates.map((k) => ({ ...k, telemetry: null })) })).toBe(JSON.stringify({ ...map, candidates: map.candidates.map((k) => ({ ...k, telemetry: null })) }));
    // telemetry is honest and separated: 1 semantic conversation, 0 refinements, priced usage
    for (const k of map.candidates) expect(k.telemetry).toMatchObject({ candidateAttempt: 1, semanticConversations: 1, refinementConversations: 0, transportAttempts: 1, shardAttempts: 0, inventoryCalls: 2, pricingStatus: "PRICED" });
  });
});
