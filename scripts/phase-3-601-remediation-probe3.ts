/**
 * Zero-cost forensic probe 3 (PHASE 3 / 6.01 trust-failure remediation §5-§9): executes the REAL production tool set
 * against the identical tool access the paid shards had, for every context request the two failed shards reported
 * as missing, via every retrieval route the model could have used. No model calls. Output: probe3.json.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildSection601 } from "./phase-3-601-preflight";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { validateFrozenInventoryResume } from "../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { planCompilationShards, buildShardCompilerInput } from "../lib/contract-model/compiler/semantic/shard-planner";
import { resolveReferenceTarget } from "../lib/contract-model/compiler/semantic-accountability/reference-resolver";
import { buildToolSet } from "../lib/contract-model/compiler/semantic/tools";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilerInput, type SemanticToolAccess } from "../lib/contract-model/compiler/semantic/types";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const built = buildSection601();
const idx = built.chewy.index;
const doc = idx.getDocumentText("doc-a") ?? "";
const inv = JSON.parse(readFileSync(`${RAW}/frozen-inventory.json`, "utf8")) as FrozenSemanticInventory;
const ctx = resolveSourceContext({ index: idx, documentId: "doc-a", operativeSourceText: built.input.operativeSourceText, anchorNodeId: built.input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: built.input.operativeCharStart ?? null, documentText: doc });
const dec = validateFrozenInventoryResume({ candidateRef: built.candidateRef, sourceDocumentId: "doc-a", frozenInventory: inv, sourceContext: ctx, structuralIndex: idx });
if (!dec.ok) throw new Error("resume failed");
const plan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: ctx, frozenInventory: dec.inventory, structuralIndex: idx, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
const byId = new Map(inv.items.map((i) => [i.inventoryItemId, i]));
const access = built.input.toolAccess as SemanticToolAccess;

type Route = { tool: string; input: Record<string, unknown> };
function run(acc: SemanticToolAccess, r: Route) {
  const tools = buildToolSet(acc, "doc-a", { current: 0 }, DEFAULT_TOOL_BUDGET);
  const t = tools.find((x) => x.name === r.tool)!;
  const o = t.execute(r.input);
  const res = o.result as Record<string, unknown>;
  return { tool: r.tool, input: r.input, ok: o.ok, evidenceUnresolved: o.evidenceUnresolved ?? null, evidenceTruncated: o.evidenceTruncated ?? null, charsReturned: o.charsReturned, summary: o.outputSummary.slice(0, 260), status: (res?.status ?? res?.supersessionStatus ?? res?.resolution ?? null) as unknown, error: o.ok ? null : String((res as { error?: string })?.error ?? "").slice(0, 260) };
}
const nodeOf = (ref: string) => resolveReferenceTarget(idx, "doc-a", ref).node;
const b1 = idx.findNodesByRef("doc-a", "6.01(b)(1)").sort((a, b) => a.charStart - b.charStart)[0]!;
const b3 = nodeOf("6.01(b)(3)"); const b12 = nodeOf("6.01(b)(12)"); const b32 = nodeOf("6.01(b)(32)"); const b14 = nodeOf("6.01(b)(14)"); const b22 = nodeOf("6.01(b)(22)"); const b33 = nodeOf("6.01(b)(33)");

interface Req { key: string; kind: "SECTION" | "TERM" | "EXTERNAL_DOCUMENT"; shard: 0 | 1; requestedBy: string; whyNeeded: string; ownedItems: string[]; fromNodeId?: string | null }
const reqs: Req[] = [
  { key: "2.18", kind: "SECTION", shard: 0, requestedBy: "ir-rule:f8040ca894957f7bb7a0121c §6.01(b)(1)(X) [MISSING_CONTEXT]", whyNeeded: "Loan Documents basket 'including pursuant to Section 2.18, 2.19 and 2.22' - the facility mechanics the model wanted to size the permission", ownedItems: [], fromNodeId: b1.nodeId },
  { key: "2.19", kind: "SECTION", shard: 0, requestedBy: "ir-rule:f8040ca894957f7bb7a0121c §6.01(b)(1)(X) [MISSING_CONTEXT]", whyNeeded: "same as 2.18", ownedItems: [], fromNodeId: b1.nodeId },
  { key: "2.22", kind: "SECTION", shard: 0, requestedBy: "ir-rule:f8040ca894957f7bb7a0121c §6.01(b)(1)(X) [MISSING_CONTEXT]", whyNeeded: "same as 2.18", ownedItems: [], fromNodeId: b1.nodeId },
  { key: "6.01(b)(1)", kind: "SECTION", shard: 0, requestedBy: "ir-rule:487a86ed915f18f337fe04e1 §6.01(b)(3) [AMBIGUOUS]", whyNeeded: "carve-out 'other than Indebtedness described in Section 6.01(b)(1)'", ownedItems: [], fromNodeId: b3?.nodeId ?? null },
  { key: "Permitted Ratio Debt", kind: "TERM", shard: 0, requestedBy: "rules r1a/r2/r3/r4 (unresolved cross-unit dependency), definition d1", whyNeeded: "the ratio baskets are collectively defined as 'Permitted Ratio Debt' inline in 6.01(a)", ownedItems: [] },
  { key: "Fixed Incremental Amount", kind: "TERM", shard: 0, requestedBy: "ir-rule:dd8291b9cbac4044a9c24f04 §6.01(b)(1)(Z) [PARTIAL], definition d2", whyNeeded: "capacity of clause (Z) equals the Fixed Incremental Amount", ownedItems: [] },
  { key: "General Lien Basket Reallocated Amount", kind: "TERM", shard: 0, requestedBy: "definition d2 Fixed Incremental Amount [PARTIAL]", whyNeeded: "additive component of Fixed Incremental Amount", ownedItems: [] },
  { key: "Available RP Capacity Amount", kind: "TERM", shard: 0, requestedBy: "definition d2 Fixed Incremental Amount [PARTIAL]", whyNeeded: "additive component of Fixed Incremental Amount", ownedItems: [] },
  { key: "Incremental Facilities", kind: "TERM", shard: 0, requestedBy: "definition d2 Fixed Incremental Amount [PARTIAL]", whyNeeded: "subtractive prior-usage component", ownedItems: [] },
  { key: "Incremental Facility", kind: "TERM", shard: 0, requestedBy: "(singular form of the same request)", whyNeeded: "subtractive prior-usage component", ownedItems: [] },
  { key: "Incremental Equivalent Debt", kind: "TERM", shard: 0, requestedBy: "definition d2 Fixed Incremental Amount [PARTIAL]; ir-rule:24d3f241cead64be62a2019c §6.01(b)(33) [PARTIAL]", whyNeeded: "subtractive prior-usage component / clause (33) basket", ownedItems: [] },
  { key: "Loan Documents", kind: "TERM", shard: 0, requestedBy: "ir-rule:f8040ca894957f7bb7a0121c §6.01(b)(1)(X)", whyNeeded: "umbrella term the (X) basket is sized by", ownedItems: [] },
  { key: "ABL Credit Agreement", kind: "EXTERNAL_DOCUMENT", shard: 0, requestedBy: "ir-rule:5bf474b6ae440e22e62b168e §6.01(b)(1)(Y) [COMPLETE, unresolved cross-unit dep]", whyNeeded: "'Borrowing Base' is defined in the ABL Credit Agreement, a document outside this instrument", ownedItems: [] },
  { key: "Borrowing Base", kind: "TERM", shard: 0, requestedBy: "ir-rule:5bf474b6ae440e22e62b168e §6.01(b)(1)(Y)", whyNeeded: "the (Y) cap is the greater of a fixed amount and the Borrowing Base", ownedItems: [] },
  { key: "Available Amount", kind: "TERM", shard: 1, requestedBy: "ir-rule:aebc09fce0c0397c1d57ff37 §6.01(b)(32) [MISSING_CONTEXT]", whyNeeded: "the clause (32) basket is sized as 'the Available Amount that is Not Otherwise Applied'", ownedItems: [] },
  { key: "Not Otherwise Applied", kind: "TERM", shard: 1, requestedBy: "ir-rule:aebc09fce0c0397c1d57ff37 §6.01(b)(32) [MISSING_CONTEXT]", whyNeeded: "qualifier of the clause (32) basket", ownedItems: [] },
  { key: "6.08(a)(3)", kind: "SECTION", shard: 1, requestedBy: "(forwarding target of 'Available Amount')", whyNeeded: "the forwarding definition points here; the inline definition lives in this clause", ownedItems: [], fromNodeId: b32?.nodeId ?? null },
  { key: "6.08(a)(3)(b)", kind: "SECTION", shard: 1, requestedBy: "ir-rule:dc232af10c47ae17c479fac7 §6.01(b)(12)(a) [PARTIAL]", whyNeeded: "counted contributions determined per 6.08(a)(3)(b)/(c)", ownedItems: [], fromNodeId: b12?.nodeId ?? null },
  { key: "6.08(a)(3)(c)", kind: "SECTION", shard: 1, requestedBy: "ir-rule:dc232af10c47ae17c479fac7 §6.01(b)(12)(a) [PARTIAL]", whyNeeded: "same", ownedItems: [], fromNodeId: b12?.nodeId ?? null },
  { key: "6.08(b)", kind: "SECTION", shard: 1, requestedBy: "ir-rule:dc232af10c47ae17c479fac7 §6.01(b)(12)(a) [PARTIAL]", whyNeeded: "no-double-counting cross-reference", ownedItems: [], fromNodeId: b12?.nodeId ?? null },
  { key: "6.08(b)(4)", kind: "SECTION", shard: 1, requestedBy: "ir-rule:ace8a49182ef7336eb6fe566 §6.01(b)(22) [PARTIAL]", whyNeeded: "scope of Parent Entity equity purchases", ownedItems: [], fromNodeId: b22?.nodeId ?? null },
  { key: "6.01(a)", kind: "SECTION", shard: 1, requestedBy: "ir-rule:63c803fd30a19edd679fc7ee §6.01(b)(14)(a)-(c) [PARTIAL]; ir-rule:682fedbe08ac3985f898943d §6.01(b)(13)", whyNeeded: "'$1.00 of additional Indebtedness permitted under the Section 6.01(a) ratio test' - the ratio thresholds", ownedItems: [], fromNodeId: b14?.nodeId ?? null },
  { key: "6.01", kind: "SECTION", shard: 1, requestedBy: "ir-rule:991acb3b933f4da5666ed3f2 §6.01(b) closing paragraph [PARTIAL]", whyNeeded: "borrows capacity from whichever basket under Section 6.01 was used", ownedItems: [], fromNodeId: b33?.nodeId ?? null },
  { key: "6.01(b)(13)", kind: "SECTION", shard: 1, requestedBy: "ir-rule:ba94defd3335602af0c396f6 §6.01(b)(4)(a) SHARES_CAPACITY_WITH", whyNeeded: "refinancing debt counts against the clause (4) cap - same compilation unit", ownedItems: [], fromNodeId: nodeOf("6.01(b)(4)")?.nodeId ?? null },
  { key: "Incremental Cap", kind: "TERM", shard: 1, requestedBy: "ir-rule:24d3f241cead64be62a2019c §6.01(b)(33) [PARTIAL]", whyNeeded: "Incremental Equivalent Debt is capped by the Incremental Cap", ownedItems: [] },
  { key: "Voluntary Prepayment Incremental Amount", kind: "TERM", shard: 1, requestedBy: "ir-rule:24d3f241cead64be62a2019c §6.01(b)(33) [PARTIAL]", whyNeeded: "component of the Incremental Cap", ownedItems: [] },
  { key: "Ratio Incremental Amount", kind: "TERM", shard: 1, requestedBy: "ir-rule:24d3f241cead64be62a2019c §6.01(b)(33) [PARTIAL]", whyNeeded: "component of the Incremental Cap", ownedItems: [] },
  { key: "Extension Amount", kind: "TERM", shard: 1, requestedBy: "ir-rule:24d3f241cead64be62a2019c §6.01(b)(33) [PARTIAL]", whyNeeded: "component of the Incremental Cap", ownedItems: [] },
  { key: "Interest Coverage Ratio", kind: "TERM", shard: 1, requestedBy: "ir-rule:63c803fd30a19edd679fc7ee §6.01(b)(14) [PARTIAL]", whyNeeded: "ratio test threshold", ownedItems: [] },
  { key: "Total Leverage Ratio", kind: "TERM", shard: 1, requestedBy: "ir-rule:63c803fd30a19edd679fc7ee §6.01(b)(14) [PARTIAL]", whyNeeded: "ratio test threshold", ownedItems: [] },
];

const defForms = (term: string) => {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const q = `[“"]\\s*${esc}\\s*[”"]`;
  const forms: Record<string, boolean> = {
    means: new RegExp(`${q}\\s*(means|shall mean|shall have the meaning)`, "i").test(doc),
    forwarding: new RegExp(`${q}\\s*has the meaning (assigned|set forth|specified|given)`, "i").test(doc),
    parentheticalInline: new RegExp(`referred to (herein )?as (the )?${q}`, "i").test(doc),
    anyQuotedDeclaration: new RegExp(q).test(doc),
  };
  const fwd = new RegExp(`${q}\\s*has the meaning (?:assigned to such term |assigned to it |set forth |specified )?(?:set forth )?in Section ([0-9][0-9.()a-zA-Z]*)`, "i").exec(doc);
  return { forms, forwardingTarget: fwd ? fwd[1]!.replace(/\.$/, "") : null, occurrences: (doc.match(new RegExp(esc, "g")) ?? []).length };
};

const shardOf = (n: 0 | 1) => plan.shards[n]!;
const ctxState = (n: 0 | 1, kind: "term" | "section", key: string) => {
  const s = shardOf(n);
  const k = kind === "term" ? `term:${key.toLowerCase().replace(/\s+/g, " ")}` : `section:${key.replace(/\s+/g, "")}`;
  const supplied = s.context.find((c) => c.contextKey === k);
  if (supplied) return { plannerSupplied: true, contextKind: supplied.kind, chars: supplied.chars, truncated: supplied.truncated };
  const u = s.unresolvedContext.find((x) => x.key === k || x.key === key.toLowerCase().replace(/\s+/g, " ") || x.key === key.replace(/\s+/g, ""));
  return { plannerSupplied: false, unresolvedReason: u?.reason ?? "NOT_REQUESTED_BY_PASS_A_ITEMS", detail: u?.detail ?? null };
};

const dependencyTable = reqs.map((r) => {
  if (r.kind === "SECTION") {
    const res = resolveReferenceTarget(idx, "doc-a", r.key);
    const nodes = idx.findNodesByRef("doc-a", r.key.replace(/\s+/g, ""));
    const routes = [run(access, { tool: "getOperativeProvision", input: { sectionRef: r.key } }), run(access, { tool: "getReferencedProvision", input: { ref: `Section ${r.key}` } }), ...(r.fromNodeId ? [run(access, { tool: "getReferencedProvision", input: { ref: `Section ${r.key}`, fromNodeId: r.fromNodeId } })] : [])];
    return { ...r, existsInSource: { physicalNodes: nodes.map((n) => ({ nodeId: n.nodeId, charStart: n.charStart, chars: idx.getNodeText(n.nodeId, "OWN").length, heading: n.heading.slice(0, 60) })), genericResolver: res.status, note: res.note }, planner: ctxState(r.shard, "section", r.key), routes, malformed: false };
  }
  if (r.kind === "TERM") {
    const d = idx.getDefinition(r.key, "doc-a");
    const full = idx.getDefinitionFullText(r.key, "doc-a");
    const routes = [run(access, { tool: "getDefinition", input: { term: r.key } }), run(access, { tool: "getDefinitionDependencies", input: { term: r.key } })];
    return { ...r, existsInSource: { ...defForms(r.key), indexedByDetector: !!d, indexedExactTerm: d?.exactTerm ?? null, indexedFullChars: full?.length ?? null, indexedText: full?.slice(0, 200) ?? null }, planner: ctxState(r.shard, "term", r.key), routes, malformed: false };
  }
  return { ...r, existsInSource: { inPackage: false, note: "the Chewy package contains one document (doc-a); the ABL Credit Agreement is not a package document" }, planner: { plannerSupplied: false, unresolvedReason: "EXTERNAL_DOCUMENT" }, routes: [run(access, { tool: "getInstrumentDocuments", input: {} })], malformed: false };
});

// §9 - OPERATIVE_STATE_UNRESOLVED: identical tool call with operativeState null (as run) vs a computed operative state for the never-amended instrument.
const computedState = computeOperativeContractState({ instrumentKey: built.input.instrumentKey, baseDocumentId: "doc-a", asOfDate: "2026-06-23", index: idx, allEffects: [] });
const accessWithState: SemanticToolAccess = { ...access, operativeState: computedState };
const opProbe = ["getDefinition:Fixed Incremental Amount", "getDefinition:Existing Indebtedness", "getReferencedProvision:Section 6.01(a)", "getOperativeProvision:6.08(b)", "getParentClause:" + b1.nodeId, "getSiblingClauses:" + b1.nodeId].map((spec) => {
  const [tool, arg] = spec.split(/:(.*)/s) as [string, string];
  const input = tool === "getDefinition" ? { term: arg } : tool === "getReferencedProvision" ? { ref: arg } : tool === "getOperativeProvision" ? { sectionRef: arg } : { nodeId: arg };
  return { spec, asRun_operativeStateNull: run(access, { tool, input }), withComputedOperativeState: run(accessWithState, { tool, input }) };
});

// §5 - shard inputs and hashes
const region0 = ctx.regions[0]!;
const base: SemanticCompilerInput = { ...(built.input as SemanticCompilerInput), operativeSourceText: region0.text, operativeCharStart: region0.charStart, sourceContext: ctx, frozenInventory: dec.inventory };
const shardInputs = plan.shards.map((s) => { const si = buildShardCompilerInput(base, plan, s); const canonical = JSON.stringify({ candidateRef: si.candidateRef, operativeSourceText: si.operativeSourceText, operativeCharStart: si.operativeCharStart, regions: si.sourceContext?.regions.map((r) => ({ id: r.regionId, text: r.text, charStart: r.charStart })), unresolved: si.sourceContext?.unresolvedReferences.map((u) => u.referenceText), items: si.frozenInventory?.items.map((i) => i.inventoryItemId).sort() }); return { ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, operativeChars: si.operativeSourceText.length, operativeCharStart: si.operativeCharStart, absRange: [region0.charStart + s.primaryCharStart, region0.charStart + s.primaryCharEnd], primaryTextSha256: sha(si.operativeSourceText), contextRegions: (si.sourceContext?.regions.length ?? 1) - 1, contextChars: s.contextChars, unresolvedReferencesInInput: si.sourceContext?.unresolvedReferences.length ?? 0, ownedItems: si.frozenInventory?.items.length ?? 0, ownedMaterial: s.ownedMaterialItemIds.length, canonicalInputSha256: sha(canonical), estimate: s.estimate, oversized: s.oversized, endsMidSentence: !/[.;:]\s*$/.test(si.operativeSourceText.trimEnd()), lastChars: si.operativeSourceText.slice(-80) }; });

// PARENT_ITEM starvation (shard 0): where do the parents live?
const s0 = shardOf(0);
const parentEntries = s0.context.filter((c) => c.kind === "PARENT_ITEM").map((c) => { const pid = c.contextKey.replace("parent-item:", ""); const p = byId.get(pid)!; const children = s0.ownedItemIds.filter((id) => byId.get(id)?.parentItemId === pid).map((id) => { const it = byId.get(id)!; return { id, role: it.semanticRole, cite: it.sourceSpan.sourceCitation, span: [it.sourceSpan.charStart, it.sourceSpan.charEnd] }; }); return { parentId: pid, parentRole: p.semanticRole, parentMateriality: p.materiality, parentSpan: [p.sourceSpan.charStart, p.sourceSpan.charEnd], parentOwnerShard: plan.itemOwnerShard[pid], chars: c.chars, children }; });

// Oversized shard: must-link groups and what member-only closure would yield
const ordinalOf = new Map(plan.units.map((u) => [u.unitKey, u.ordinal]));
const groups = plan.mustLinkGroups.map((g) => { const ords = g.unitKeys.map((k) => ordinalOf.get(k)!).sort((a, b) => a - b); return { members: ords, span: [ords[0], ords[ords.length - 1]], rangeSize: ords[ords.length - 1]! - ords[0]! + 1, memberChars: ords.reduce((a, o) => a + plan.units[o]!.chars, 0), rangeChars: plan.units.slice(ords[0], ords[ords.length - 1]! + 1).reduce((a, u) => a + u.chars, 0), links: g.links.map((l) => ({ kind: l.kind, from: ordinalOf.get(l.fromUnitKey), to: ordinalOf.get(l.toUnitKey), itemRole: l.itemId ? byId.get(l.itemId)?.semanticRole : null, itemCite: l.itemId ? byId.get(l.itemId)?.sourceSpan.sourceCitation : null, toUnitRef: plan.units[ordinalOf.get(l.toUnitKey)!]?.sectionRef })) }; });
const s1 = shardOf(1);
const s1units = s1.ownedUnitKeys.map((k) => plan.units[ordinalOf.get(k)!]!);
const oversized = { shard: s1.shardId, units: s1units.length, primaryChars: s1.primaryChars, unitsInAnyGroup: s1units.filter((u) => plan.mustLinkGroups.some((g) => g.unitKeys.includes(u.unitKey))).length, unitsForcedOnlyByRangeClosure: s1units.filter((u) => !plan.mustLinkGroups.some((g) => g.unitKeys.includes(u.unitKey))).length, charsForcedOnlyByRangeClosure: s1units.filter((u) => !plan.mustLinkGroups.some((g) => g.unitKeys.includes(u.unitKey))).reduce((a, u) => a + u.chars, 0), groups };

const out = { planHash: plan.planHash, planMatches: plan.planHash === "eab77c1aad1d941440f0d412e20578902c6744a5e100a0306153ea02e1720552", toolBudget: DEFAULT_TOOL_BUDGET, operativeStateAsRun: access.operativeState, computedOperativeState: { status: computedState.status, provisions: computedState.provisions.length, summary: computedState.summary }, shardInputs, dependencyTable, operativeStateProbe: opProbe, parentEntries: { count: parentEntries.length, chars: parentEntries.reduce((a, p) => a + p.chars, 0), entries: parentEntries }, oversized };
process.stdout.write(JSON.stringify(out, null, 1));
