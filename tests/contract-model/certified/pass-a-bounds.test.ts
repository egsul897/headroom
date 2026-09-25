/**
 * PASS A OUTPUT EFFICIENCY (addendum A16). Provider-free. Proves that the code makes pathological Pass A consumption
 * impossible by construction: bounded request count, bounded item count, bounded output schema, explicit reasoning
 * policy on the wire, no generic 128k ceiling, no open-ended generation.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import { batchSlots, partitionSourceSlots } from "../../../lib/contract-model/compiler/semantic-accountability/slots";
import { runSemanticInventory, splitOversizedBatches } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { runDualPassSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/dual-pass";
import { CERTIFIED_INVENTORY_EXECUTION_POLICY, computeSlotSignals, deriveInventoryOutputBound, inventoryPolicyIdentity, maxPropositionsForSlot } from "../../../lib/contract-model/compiler/semantic-accountability/inventory-policy";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../../../lib/contract-model/compiler/semantic-accountability/prompt";
import { buildSubmitSemanticInventorySchema, SubmitSemanticInventorySchema, WireInventoryItemSchema } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { DEFAULT_MAX_TOKENS, VercelAIGatewayContractAnalyzer } from "../../../lib/contract-model/analyzer/anthropic-analyzer";
import { createRealStageCaller, type StageCallOptions, type StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import { certifiedConfig, certifiedConfigIdentity } from "../../../lib/contract-model/compiler/certified-config";
import { z } from "zod";

const MODEL = "deepseek/deepseek-v4-flash";
const POLICY = CERTIFIED_INVENTORY_EXECUTION_POLICY;

function agreement(clauses: number, clauseWords: number): string {
  const words = ["Indebtedness", "incurred", "by", "the", "Borrower", "in", "an", "aggregate", "principal", "amount", "not", "to", "exceed", "at", "any", "time", "outstanding", "so", "long", "as", "no", "Default", "has", "occurred"];
  const lines = ["CREDIT AGREEMENT dated as of January 1, 2026.", "", "ARTICLE VII NEGATIVE COVENANTS", "", "SECTION 7.01 Indebtedness . The Borrower shall not create, incur or assume any Indebtedness, except:", ""];
  for (let i = 0; i < clauses; i++) {
    const body = Array.from({ length: clauseWords }, (_, k) => words[(i * 7 + k) % words.length]).join(" ");
    lines.push(`(${String.fromCharCode(97 + (i % 26))}${i >= 26 ? i : ""}) ${body} $${(i + 1) * 1_000_000}${i % 3 === 0 ? " pursuant to Section 7.02" : ""};`, "");
  }
  lines.push("SECTION 7.02 Liens . The Borrower shall not create any Lien.", "");
  return lines.join("\n");
}
function unitFor(text: string, ref = "7.01") {
  const index = buildTestIndex([{ documentId: "d", label: "D", text }]);
  const r = index.resolveUniqueNodeByRef("d", ref); if (r.status !== "UNIQUE") throw new Error(ref);
  const op = index.getNodeText(r.node.nodeId, "DESCENDANTS");
  const sc = resolveSourceContext({ index, documentId: "d", operativeSourceText: op, anchorNodeId: r.node.nodeId, operativeCharStart: r.node.charStart, documentText: text });
  const accountability = { ...sc, regions: sc.regions.filter((x) => x.kind === "OPERATIVE") };
  return { index, op, sc: accountability };
}
interface Captured { stage: string; schema: ZodType<unknown>; system: string; user: string; options: StageCallOptions | undefined }
function scripted(items: (user: string) => unknown[] = () => []): StageCaller & { captured: Captured[] } {
  const captured: Captured[] = [];
  return { providerName: "scripted", model: MODEL, isSynthetic: false, captured,
    async call(schema, stage, system, user, options) { captured.push({ stage, schema: schema as ZodType<unknown>, system, user, options }); return schema.parse({ items: items(user) }); },
    lastTelemetry: () => ({ provider: "scripted", model: MODEL, promptVersion: "p", schemaVersion: "s", stage: "semantic_inventory", timestamp: "", inputTokens: 900, outputTokens: 350, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: 12, providerCost: undefined, calculatedCostUsd: 0.0002, stopReason: "end_turn", thinkingTokens: 0, visibleOutputTokens: 350 }) };
}

describe("Pass A is bounded by construction", () => {
  const sizes = { tiny: agreement(3, 20), medium: agreement(8, 24), large: agreement(28, 26) };
  for (const [name, text] of Object.entries(sizes)) {
    it(`${name} source: bounded request count, bounded items, bounded output schema, derived ceiling far below the generic 128k`, async () => {
      const { index, sc, op } = unitFor(text);
      const partition = partitionSourceSlots({ sourceContext: sc, structuralIndex: index });
      const batches = splitOversizedBatches(batchSlots(partition, sc, POLICY.batchChars), POLICY.maxBatchSlots);
      const caller = scripted();
      const inv = await runSemanticInventory({ candidateRef: `cand:${name}`, documentId: "d", sourceContext: sc, structuralIndex: index, caller, policy: POLICY });
      // request count: first-pass batches + at most one gap batch per first-pass batch, never above the policy ceiling
      const firstPass = caller.captured.filter((c) => c.stage === "semantic_inventory");
      expect(firstPass.length).toBe(batches.length);
      expect(caller.captured.length).toBeLessThanOrEqual(Math.min(POLICY.maxCallsPerPass, batches.length * 2));
      expect(batches.length).toBeLessThanOrEqual(Math.ceil(op.length / POLICY.batchChars) + Math.ceil(partition.slots.length / POLICY.maxBatchSlots));
      for (const [i, c] of firstPass.entries()) {
        const bound = deriveInventoryOutputBound(batches[i]!.slots, index, POLICY);
        // every request carries the derived ceiling and the explicit reasoning policy - never the generic analyzer default
        expect(c.options?.execution).toEqual({ purpose: "SEMANTIC_INVENTORY", maxOutputTokens: bound.maxOutputTokens, reasoning: "DISABLED" });
        expect(bound.maxOutputTokens).toBeLessThan(DEFAULT_MAX_TOKENS / 2);
        // the schema itself refuses more items than the slots allow and any over-long field
        expect(() => c.schema.parse({ items: Array.from({ length: bound.parseCeiling + 1 }, (_, k) => ({ localRef: `i${k}`, excerpt: "x" })) })).toThrow();
        expect(bound.parseCeiling).toBe(bound.maxItems * 2 + 8);
        expect(() => c.schema.parse({ items: [{ localRef: "i1", excerpt: "y".repeat(POLICY.bounds.excerptChars + 1) }] })).toThrow();
        expect(() => c.schema.parse({ items: [{ localRef: "i1", excerpt: "y", proposition: "p".repeat(POLICY.bounds.propositionChars + 1) }] })).toThrow();
        expect(c.schema.parse({ items: [], overallNotes: ["prose the system never reads"] })).toEqual({ items: [] }); // no free-form notes field survives
        // the allowance per slot is derived from the slot's own text and signals, capped
        for (const p of bound.perSlot) { const sl = batches[i]!.slots.find((s) => s.slotId === p.slotId)!; const sig = computeSlotSignals(sl, index); expect(p.maxPropositions).toBe(maxPropositionsForSlot(sig, POLICY)); expect(p.maxPropositions).toBeLessThanOrEqual(POLICY.perSlot.cap); }
        expect(bound.maxItems).toBe(bound.perSlot.reduce((n, p) => n + p.maxPropositions, 0) + POLICY.perSlot.unslottedPerCall);
        // the ceiling is a pure function of the serialized bound
        expect(bound.maxOutputTokens).toBe(Math.ceil(bound.maxSerializedChars * POLICY.outputTokensPerChar) + POLICY.envelopeTokens);
        expect(c.user).toContain(`at most ${bound.maxItems} items in total`);
        expect(c.user).toMatch(/SIGNALS: values \[/);
      }
      // the frozen inventory carries one record per call with the requested ceiling, the policy and the counts
      expect(inv.calls?.length).toBe(caller.captured.length);
      for (const rec of inv.calls ?? []) { expect(rec.requestedMaxOutputTokens).toBeGreaterThan(0); expect(rec.reasoningPolicy).toBe("DISABLED"); expect(rec.schemaOk).toBe(true); expect(rec.stopReason).toBe("end_turn"); expect(rec.slotIds.length).toBeGreaterThan(0); expect(rec.slotIds.length).toBeLessThanOrEqual(POLICY.maxBatchSlots); }
      expect(inv.executionPolicy).toBe(inventoryPolicyIdentity(POLICY));
    });
  }

  it("a 529-character clause cannot request anything near 116,913 tokens: the derived ceiling is a few thousand", () => {
    const clause = "(c) other Indebtedness of the Borrower or any Subsidiary in an aggregate principal amount not to exceed the greater of $10,000,000 and 5.0% of Consolidated EBITDA at any time outstanding; provided that no Default has occurred and is continuing at the time of incurrence and the Borrower is in pro forma compliance with Section 7.10; and provided further that the aggregate amount of such Indebtedness incurred by Subsidiaries that are not Loan Parties shall not exceed $2,500,000 at any time outstanding under this clause (b).";
    expect(clause.length).toBeGreaterThanOrEqual(500); expect(clause.length).toBeLessThanOrEqual(560);
    const text = ["CREDIT AGREEMENT dated as of January 1, 2026.", "", "ARTICLE VII NEGATIVE COVENANTS", "", "SECTION 7.02 Indebtedness . The Borrower shall not incur Indebtedness, except:", "", "(a) Indebtedness under the Loan Documents;", "", clause.replace("(c)", "(b)"), "", "SECTION 7.10 Financial Covenant . The Borrower shall maintain a ratio.", ""].join("\n");
    const { index, sc } = unitFor(text, "7.02(b)");
    const partition = partitionSourceSlots({ sourceContext: sc, structuralIndex: index });
    const bound = deriveInventoryOutputBound(partition.slots, index, POLICY);
    expect(bound.maxOutputTokens).toBeLessThan(12_000);
    expect(bound.maxOutputTokens * 9).toBeLessThan(116_913);
  });

  it("the gap pass is bounded by the affected slots alone, and a dual-pass ensemble runs both passes under the same policy with pass ids on every record", async () => {
    const { index, sc } = unitFor(agreement(6, 22));
    const p1 = scripted(), p2 = scripted();
    const r = await runDualPassSemanticInventory({ candidateRef: "cand:dual", documentId: "d", sourceContext: sc, structuralIndex: index, passCallers: [p1, p2], policy: POLICY });
    expect(p1.captured.length).toBe(p2.captured.length);
    const gaps = p1.captured.filter((c) => c.stage === "semantic_inventory_gap");
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) { const first = p1.captured.find((c) => c.stage === "semantic_inventory")!; expect(g.options?.execution?.maxOutputTokens).toBeLessThanOrEqual(first.options!.execution!.maxOutputTokens!); expect(g.options?.execution?.reasoning).toBe("DISABLED"); }
    const ids = new Set((r.inventory.calls ?? []).map((c) => c.passId));
    expect([...ids].sort()).toEqual(["pass-1", "pass-2"]);
    expect(r.inventory.calls?.length).toBe(p1.captured.length + p2.captured.length);
  });

  it("the prompt is short and mechanical: no open-ended exhortation, the task stated once", () => {
    const sys = buildInventorySystemPrompt(POLICY);
    expect(sys.length).toBeLessThan(2_500);
    for (const banned of ["exhaustively", "never omit", "at least twelve", "every material number", "EXAMPLE (synthetic"]) expect(sys.toLowerCase()).not.toContain(banned.toLowerCase());
    const { index, sc } = unitFor(agreement(3, 20));
    const partition = partitionSourceSlots({ sourceContext: sc, structuralIndex: index });
    const [batch] = batchSlots(partition, sc, POLICY.batchChars);
    const user = buildInventoryUserContent(sc, batch!, { bound: deriveInventoryOutputBound(batch!.slots, index, POLICY), signals: new Map(batch!.slots.map((s) => [s.slotId, computeSlotSignals(s, index)])) });
    expect(user).toMatch(/up to \d+ items/);
  });

  it("the wire schema is bounded in every field (P3-E12) and the default instance keeps the certified bounds", () => {
    const b = POLICY.bounds;
    const ok = WireInventoryItemSchema.parse({ localRef: "i1", excerpt: "Indebtedness", referencedTerms: ["A"], quantitativeValues: [{ kind: "MONEY", rawText: "$1", normalizedValue: 1, unit: "USD" }] });
    expect(ok.slotId).toBeUndefined();
    expect(() => WireInventoryItemSchema.parse({ localRef: "i1", excerpt: "x", referencedTerms: Array.from({ length: b.maxReferencedTerms + 1 }, () => "t") })).toThrow();
    expect(() => WireInventoryItemSchema.parse({ localRef: "i1", excerpt: "x", quantitativeValues: Array.from({ length: b.maxQuantitativeValues + 1 }, () => ({ kind: "MONEY", rawText: "$1" })) })).toThrow();
    expect(() => WireInventoryItemSchema.parse({ localRef: "i1", excerpt: "x", ambiguityReason: "r".repeat(b.ambiguityReasonChars + 1) })).toThrow();
    expect(() => SubmitSemanticInventorySchema.parse({ items: Array.from({ length: 401 }, (_, k) => ({ localRef: `i${k}`, excerpt: "x" })) })).toThrow();
    expect(buildSubmitSemanticInventorySchema(b, 3).parse({ items: [{ localRef: "a", excerpt: "x" }, { localRef: "b", excerpt: "y" }, { localRef: "c", excerpt: "z" }] }).items.length).toBe(3);
    expect(() => buildSubmitSemanticInventorySchema(b, 3).parse({ items: Array.from({ length: 4 }, (_, k) => ({ localRef: `i${k}`, excerpt: "x" })) })).toThrow();
  });

  it("the certified configuration carries the inventory policy in its identity", () => {
    const c = certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL });
    expect(c.inventory.reasoning).toBe("DISABLED");
    expect(certifiedConfigIdentity(c)).toContain("passA=phase3-inventory-execution.v1|reasoning=DISABLED");
    expect(certifiedConfigIdentity({ ...c, inventory: { ...c.inventory, reasoning: "PROVIDER_DEFAULT" } })).not.toBe(certifiedConfigIdentity(c));
  });
});

describe("request construction on the wire (fake fetch, no network)", () => {
  function capturingAnalyzer() {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const message = { id: "msg", type: "message", role: "assistant", model: MODEL, content: [{ type: "text", text: JSON.stringify({ items: [] }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens_details: { thinking_tokens: 0 } } };
      const events = [`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { ...message, content: [], usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`, `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`, `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify({ items: [] }) } })}\n\n`, `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`, `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5, output_tokens_details: { thinking_tokens: 0 } } })}\n\n`, `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`];
      return new Response(events.join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    // the SDK client is built by the analyzer; a custom fetch is injected through the SDK's global fetch override for this test
    const analyzer = new VercelAIGatewayContractAnalyzer({ apiKey: "test-key-not-a-credential", model: MODEL, baseURL: "https://gateway.invalid" });
    (analyzer as unknown as { client: { fetch?: typeof globalThis.fetch; _options?: { fetch?: typeof globalThis.fetch } } }).client.fetch = fetchImpl;
    return { analyzer, bodies };
  }
  it("Pass A execution overrides land on the wire: derived max_tokens, thinking disabled; PROVIDER_DEFAULT sends no thinking; MINIMAL sends a 1024 budget", async () => {
    const { analyzer, bodies } = capturingAnalyzer();
    const caller = createRealStageCaller("vercel-ai-gateway", MODEL, analyzer);
    const schema = z.object({ items: z.array(z.object({ localRef: z.string() })).max(3).default([]) });
    await caller.call(schema, "semantic_inventory", "sys", "user", { execution: { purpose: "SEMANTIC_INVENTORY", maxOutputTokens: 4321, reasoning: "DISABLED" } });
    await caller.call(schema, "semantic_inventory", "sys", "user", { execution: { maxOutputTokens: 2000, reasoning: "PROVIDER_DEFAULT" } });
    await caller.call(schema, "semantic_inventory", "sys", "user", { execution: { maxOutputTokens: 5000, reasoning: "MINIMAL" } });
    await caller.call(schema, "other_stage", "sys", "user");
    expect(bodies.length).toBe(4);
    expect(bodies[0]).toMatchObject({ model: MODEL, max_tokens: 4321, thinking: { type: "disabled" } });
    expect(bodies[1]!.max_tokens).toBe(2000); expect(bodies[1]!.thinking).toBeUndefined();
    expect(bodies[2]).toMatchObject({ max_tokens: 5000, thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(bodies[3]!.max_tokens).toBe(DEFAULT_MAX_TOKENS); // a stage WITHOUT an explicit policy still gets the generic ceiling - which is why Pass A must always pass one
    // The SDK's zodOutputFormat does NOT emit maxItems / maxLength into the provider-side JSON schema (Anthropic
    // structured outputs accept a subset; the bounds are folded into `description`). The MECHANICAL bound on the wire
    // is therefore max_tokens, and the item allowance is stated in the prompt; the parser re-enforces every bound.
    const wireSchema = (bodies[0] as { output_config: { format: { type: string; schema: { properties: { items: { maxItems?: number; description?: string } } } } } }).output_config.format;
    expect(wireSchema.type).toBe("json_schema");
    expect(wireSchema.schema.properties.items.maxItems).toBeUndefined();
    expect(wireSchema.schema.properties.items.description).toContain("maxItems: 3");
    const t = caller.lastTelemetry()!;
    expect(t.requestedMaxOutputTokens).toBe(DEFAULT_MAX_TOKENS); expect(t.stopReason).toBe("end_turn"); expect(t.thinkingTokens).toBe(0); expect(t.visibleOutputTokens).toBe(5);
  });
});
