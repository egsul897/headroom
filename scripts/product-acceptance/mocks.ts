/**
 * MOCKED provider stages for the offline acceptance runner.
 *
 * Nothing in this file is a model. Every function here is a scripted stand-in whose output is an INPUT to the
 * production deterministic layers (normalizer, source-coverage, provenance binding, Layer-1 verification,
 * certification). Results obtained through these mocks say nothing about model behaviour; they say what the
 * deterministic layers do with a given submission. Every report that includes a mocked stage must say so.
 *
 *  - mockInventoryCaller: a cooperative Pass A stand-in that lists verbatim propositions per slot (sentence /
 *    enumerated clause / proviso), with the values and references it can see. It is deliberately simple.
 *  - mockReviewerCaller: Layer-2 reviewer stand-in returning ZERO findings, and a condition-suspicion classifier
 *    stand-in returning NO_MATERIAL_CONDITION_SUSPECTED. Any rejection therefore comes from deterministic layers only.
 *  - mockSemanticClient: Pass B stand-in answering the single structured call with a scripted submission
 *    (see semantic-plan.ts). The plan is selected by matching the operative text in the prompt.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { SUBMIT_TOOL_NAME } from "../../lib/contract-model/compiler/semantic/bounded-caller";

/** A PRICED model id is required because the production HardDispatchBudget refuses any request it cannot price (observed: UNPRICEABLE_MODEL). The string is used only for the rate card; the client answering is the scripted stand-in below and no request leaves the process. */
export const MOCK_MODEL = "deepseek/deepseek-v4-flash";
export const MOCK_PROVIDER = "MOCKED";
export const ws = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * True when `haystack` carries `needle` as its own token. Money needles like
 * "$50,000,000" must not match inside "$150,000,000" (IPV-04 indenture 4.09
 * false positive after the grower basket is correctly spliced to $75,000,000).
 */
export function textCarries(haystack: string, needle: string): boolean {
  const h = ws(haystack);
  const n = ws(needle);
  if (!n) return false;
  if (/^\$?[\d,]+(?:\.\d+)?$/.test(n) || /^EUR [\d,]+(?:\.\d+)?$/.test(n)) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\d])${escaped}(?![\\d])`).test(h);
  }
  return h.includes(n);
}

interface MockItem { localRef: string; slotId: string; semanticRole: string; proposition: string; excerpt: string; quantitativeValues: { kind: string; rawText: string; normalizedValue: number | null; unit: string | null }[]; referencedTerms: string[]; referencedSections: string[]; parentRef: string | null; relatedRefs: string[]; materiality: string; ambiguity: string; ambiguityReason: string | null; operative: string }

const MONEY_RE = /(?:\$|EUR )[\d,]+(?:\.\d+)?/g;
const PERCENT_RE = /\d+(?:\.\d+)?%/g;
const RATIO_RE = /\d+\.\d{2} to 1\.00/g;
const REF_RE = /\b(?:Section|Sections|clause|clauses)\s+(?:[0-9]+(?:\.[0-9]+)*(?:\([a-zA-Z0-9]+\))*|\([a-zA-Z0-9]+\)(?:\s+and\s+\([a-zA-Z0-9]+\))?)/g;

function values(text: string): MockItem["quantitativeValues"] {
  const out: MockItem["quantitativeValues"] = [];
  for (const m of text.match(MONEY_RE) ?? []) out.push({ kind: "MONEY", rawText: m, normalizedValue: Number(m.replace(/[^0-9.]/g, "")), unit: m.startsWith("EUR") ? "EUR" : "USD" });
  for (const m of text.match(PERCENT_RE) ?? []) out.push({ kind: "PERCENT", rawText: m, normalizedValue: Number(m.replace("%", "")), unit: "%" });
  for (const m of text.match(RATIO_RE) ?? []) out.push({ kind: "RATIO", rawText: m, normalizedValue: Number(m.split(" ")[0]), unit: null });
  return out.slice(0, 8);
}

function roleFor(text: string, isProviso: boolean, isDefinition: boolean): string {
  if (isDefinition) return "FORMULA_COMPONENT";
  if (isProviso) return "CONDITION";
  if (/together with/.test(text) || /clauses \([a-z]\) and \([a-z]\)/.test(text)) return "SHARED_CAP";
  if (/shall not|shall maintain|shall prepay/.test(text)) return "PROHIBITION";
  if (/^\(?[a-zA-Z0-9]+\)/.test(text) || /not to exceed|may incur|may be secured/.test(text)) return "PERMISSION";
  if (/reclassify/.test(text)) return "RECLASSIFICATION";
  if (/^If /.test(text)) return "TRIGGER";
  return "OTHER";
}

/** Splits one slot's text into verbatim propositions: lines, then provisos inside a line. */
export function propositionsOf(slotText: string): { excerpt: string; isProviso: boolean; isDefinition: boolean }[] {
  const out: { excerpt: string; isProviso: boolean; isDefinition: boolean }[] = [];
  for (const rawLine of slotText.split("\n")) {
    let line = rawLine.trim();
    if (!line || /^ARTICLE [IVXLC]+/.test(line) || /^TABLE OF CONTENTS/.test(line) || /\.{5}/.test(line) || /^\[REMAINDER/.test(line)) continue;
    const heading = line.match(/^SECTION \S+ [^.]*\.\s*/);
    if (heading) line = line.slice(heading[0].length).trim();
    if (!line) continue;
    const isDefinition = /^"[^"]+" means/.test(line);
    const parts = line.split(/(?=\bprovided(?: further)? that\b)/);
    parts.forEach((p, i) => {
      const excerpt = p.replace(/^[;,]\s*/, "").replace(/\s*(?:; and|;|and)\s*$/, "").trim();
      if (excerpt.length < 4) return;
      out.push({ excerpt: excerpt.slice(0, 400), isProviso: i > 0 || /^provided/.test(excerpt), isDefinition });
    });
  }
  return out;
}

export interface MockCallRecord { stage: string; chars: number; itemsReturned?: number }

/** `linkProvisos` (default true) mirrors a cooperative model that sets parentRef on a proviso; false emits provisos as independent items. */
export function mockInventoryCaller(opts: { linkProvisos?: boolean } = {}): StageCaller & { calls: MockCallRecord[] } {
  const linkProvisos = opts.linkProvisos ?? true;
  const calls: MockCallRecord[] = [];
  return {
    // isSynthetic must be false: the production inventory stage skips synthetic callers outright (INVENTORY_SKIPPED_NO_PROVIDER); the provider name still says MOCKED.
    providerName: MOCK_PROVIDER, model: MOCK_MODEL, isSynthetic: false, calls,
    async call(schema, stage, _system, user) {
      const rec: MockCallRecord = { stage, chars: user.length };
      calls.push(rec);
      if (stage === "semantic_inventory" || stage === "semantic_inventory_gap") {
        const maxItems = Number(user.match(/at most (\d+) items in total/)?.[1] ?? 200);
        const items: MockItem[] = [];
        let n = 0;
        const slotRe = /^SLOT (\S+) \(([^)]*)\)([^\n]*)\n([\s\S]*?)(?=\n\nSLOT \S+ \(|\n\nUNACCOUNTED|$)/gm;
        for (const m of user.matchAll(slotRe)) {
          const slotId = m[1]!, meta = m[2]!, sig = m[3]!, text = m[4]!.replace(/\nUNACCOUNTED STRETCH[\s\S]*$/, "");
          const allowance = Number(meta.match(/up to (\d+) items/)?.[1] ?? 50);
          const definedTerms = (sig.match(/defined terms \[([^\]]*)\]/)?.[1] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
          let parentRef: string | null = null;
          let inSlot = 0;
          for (const p of propositionsOf(text)) {
            if (inSlot >= allowance || items.length >= maxItems) break;
            const localRef = `i${++n}`;
            const vals = values(p.excerpt);
            const role = roleFor(p.excerpt, p.isProviso, p.isDefinition);
            items.push({ localRef, slotId, semanticRole: role, proposition: ws(p.excerpt).slice(0, 110), excerpt: p.excerpt, quantitativeValues: vals, referencedTerms: definedTerms.filter((t) => p.excerpt.includes(t)).slice(0, 6), referencedSections: [...new Set((p.excerpt.match(REF_RE) ?? []).map((r) => r.replace(/^(Sections?|clauses?)\s+/, "")))].slice(0, 6).map((r) => r.slice(0, 40)), parentRef: p.isProviso && linkProvisos ? parentRef : null, relatedRefs: [], materiality: vals.length > 0 ? "CRITICAL" : "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: p.isDefinition ? "DEFINITIONAL" : "OPERATIVE" });
            if (!p.isProviso) parentRef = localRef;
            inSlot += 1;
          }
        }
        rec.itemsReturned = items.length;
        return schema.parse({ items });
      }
      if (stage === "condition_suspicion_classification") return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      if (stage === "semantic_verification") return schema.parse({ findings: [], overallNotes: ["MOCKED reviewer: zero findings by construction; deterministic layers only"] });
      if (stage === "amendment_interpretation") return schema.parse({ operation: "UNKNOWN_CHANGE", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: [], confidence: 0, unresolvedQuestions: ["MOCKED"] });
      return schema.parse({});
    },
    lastTelemetry: () => ({ provider: MOCK_PROVIDER, model: MOCK_MODEL, promptVersion: "mock", schemaVersion: "mock", stage: "mock", timestamp: new Date().toISOString(), inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: 0, providerCost: undefined, calculatedCostUsd: 0 }),
  } as StageCaller & { calls: MockCallRecord[] };
}

/** Inventory ids listed in a Pass B prompt whose excerpt overlaps `needle` (both whitespace-collapsed). */
export function inventoryIdsFor(user: string, needle: string): string[] {
  const n = ws(needle);
  const out: string[] = [];
  for (const line of user.split("\n")) {
    const m = line.match(/^- (inv-item:[0-9a-f]+) (.*)$/);
    if (!m) continue;
    const tail = m[2]!;
    const q = tail.lastIndexOf(': "');
    if (q < 0) continue;
    const excerpt = tail.slice(q + 3).replace(/"\)$/, "");
    if (excerpt.length >= 12 && (excerpt.includes(n.slice(0, 150)) || n.includes(excerpt))) out.push(m[1]!);
  }
  return out;
}
/** The (whitespace-collapsed, 160-char) excerpt the Pass B prompt shows for an inventory id. */
export function excerptOfInventoryId(user: string, id: string): string {
  const line = user.split("\n").find((l) => l.startsWith(`- ${id} `)) ?? "";
  const q = line.lastIndexOf(': "');
  return q < 0 ? "" : line.slice(q + 3).replace(/"\)$/, "");
}
export function allInventoryIds(user: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+) /gm)].map((m) => m[1]!); }
export function inventoryIdsWithValues(user: string): string[] { return [...user.matchAll(/^- (inv-item:[0-9a-f]+) [^\n]*values=\{/gm)].map((m) => m[1]!); }

export type SubmissionPlan = (user: string) => unknown;

export function mockSemanticClient(plan: SubmissionPlan): MinimalAnthropicClient & { requests: { system: string; user: string }[] } {
  const requests: { system: string; user: string }[] = [];
  return {
    requests,
    messages: { stream: (params) => ({ finalMessage: async () => {
      const user = String(params.messages[0]!.content);
      requests.push({ system: params.system, user });
      return { id: "msg-mock", type: "message", role: "assistant", model: MOCK_MODEL, content: [{ type: "tool_use", id: "tu-mock", name: SUBMIT_TOOL_NAME, input: plan(user) }], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message;
    } }) },
  };
}
