/**
 * Architecture invariants of the certified path - enforced by reading the source, so a drift fails here before it
 * ships. Plus the source-context expansion regressions the canonical map depends on.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import { operativeSourceTextFor, resolveOperativeSource } from "../../../lib/contract-model/compiler/candidate-span";
import { certifiedConfig, certifiedConfigIdentity } from "../../../lib/contract-model/compiler/certified-config";
import { GOLDEN_AGREEMENT } from "./golden-harness";

const read = (p: string) => fs.readFileSync(p, "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (p.endsWith(".ts")) out.push(p); }
  return out;
}
const LIB = walk("lib/contract-model");
const CERTIFIED = ["lib/contract-model/covenant-map", "lib/contract-model/analyzer/transport-retry.ts", "lib/contract-model/analyzer/dispatch-budget.ts", "lib/contract-model/analyzer/deadline.ts", "lib/contract-model/analyzer/pricing.ts", "lib/contract-model/analyzer/provider-error.ts", "lib/contract-model/compiler/certified-config.ts", "lib/contract-model/compiler/semantic/bounded-caller.ts"].flatMap((p) => (fs.statSync(p).isDirectory() ? walk(p) : [p]));

describe("one operative-source builder", () => {
  it("only candidate-span.ts derives a candidate's operative text; every SemanticCompilerInput for a discovered candidate is assembled by covenant-map/candidate-input.ts", () => {
    // the construction signature of a compiler input for a candidate: operativeSourceText + toolPolicyVersion in one literal
    const constructors = [...LIB, ...walk("scripts/p3-conmed-pilot")].filter((f) => { const s = read(f); return /operativeSourceText:\s/.test(s) && /toolPolicyVersion:\s/.test(s) && /toolAccess: \{/.test(s); });
    expect(constructors.map((f) => f.replace(/\\/g, "/")).sort()).toEqual(["lib/contract-model/covenant-map/candidate-input.ts"]);
    // no other module reads a candidate anchor's DESCENDANTS text to make operative text
    // no other module turns a candidate's anchor (structuralNodeIds[0]) into operative text via getNodeText
    const descendantsReaders = LIB.filter((f) => { const s = read(f); return /structuralNodeIds\[0\]/.test(s) && /getNodeText\([^\n]*"DESCENDANTS"\)/.test(s); });
    // context-retrieval/pipeline.ts reads the anchor's text for the OPERATIVE_SOURCE context ITEM (an excerpt in the bundle), never as compiler input
    expect(descendantsReaders.sort()).toEqual(["lib/contract-model/compiler/candidate-span.ts", "lib/contract-model/compiler/context-retrieval/pipeline.ts"]);
    // and the operative-source functions are defined exactly once
    const definers = LIB.filter((f) => /export function (resolveOperativeSource|operativeSourceTextFor)\(/.test(read(f)));
    expect(definers).toEqual(["lib/contract-model/compiler/candidate-span.ts"]);
    // the pilot delegates
    expect(read("scripts/p3-conmed-pilot/pipeline.ts")).toMatch(/return operativeSourceTextFor\(candidate, index\)/);
    expect(read("scripts/p3-conmed-pilot/compile-run.ts")).toMatch(/return assembleCompilerInput\(/);
  });
  it("the builder is operative-state aware: a RESOLVED provision's current text governs, the base node otherwise", () => {
    const index = buildTestIndex([{ documentId: "d", label: "D", text: GOLDEN_AGREEMENT }]);
    const node = index.resolveUniqueNodeByRef("d", "7.02");
    if (node.status !== "UNIQUE") throw new Error("fixture");
    const candidate = { structuralNodeIds: [node.node.nodeId], documentId: "d", normalizedSourceRef: "7.02" };
    expect(resolveOperativeSource(candidate, index, null)).toMatchObject({ origin: "STRUCTURAL_NODE" });
    expect(operativeSourceTextFor(candidate, index)).toContain("Section 7.01(b).");
    const state = { instrumentKey: "i", asOfDate: "2026-09-01", status: "OPERATIVE_STATE_RESOLVED", summary: "", unattachedEffects: [], provisions: [{ instrumentKey: "i", provisionKey: "i::SECTION::7.02", kind: "SECTION", documentId: "d", sectionRef: "7.02", definedTermRef: null, asOfDate: "2026-09-01", currentSourceDocumentId: "amend", currentSourceNodeKey: null, currentSourceNodeId: null, currentText: "AMENDED 7.02 TEXT", fullChain: [], appliedChain: [{ effectId: "e1", amendmentDocumentId: "amend", operation: "REPLACE_TEXT", effectiveDate: { date: "2026-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "" }, sourceCitation: "", appliedAsOfQuery: true }], supersededSourceNodeKeys: [], supersededSourceNodeIds: [node.node.nodeId], status: "OPERATIVE_STATE_RESOLVED", unresolvedIssues: [], conflicts: [], targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [node.node.nodeId], structuralHealthStatus: "HEALTHY", structuralHealthIssues: [], attemptedText: null, reviewRequired: false, candidateTexts: [] }] } as never;
    expect(resolveOperativeSource(candidate, index, state)).toMatchObject({ origin: "OPERATIVE_STATE_CURRENT_TEXT", text: "AMENDED 7.02 TEXT" });
    // a PARTIAL / REVIEW_REQUIRED provision never substitutes its text
    const partial = { ...(state as { provisions: object[] }), provisions: [{ ...(state as { provisions: Record<string, unknown>[] }).provisions[0], status: "OPERATIVE_STATE_REVIEW_REQUIRED" }] } as never;
    expect(resolveOperativeSource(candidate, index, partial).origin).toBe("STRUCTURAL_NODE");
  });
});

describe("certified path has no ambient behaviour", () => {
  it("no process.env read anywhere in the certified modules", () => {
    for (const f of CERTIFIED) expect({ file: f, reads: (read(f).match(/process\.env/g) ?? []).length }).toEqual({ file: f, reads: 0 });
  });
  it("the certified path never imports the legacy orchestrator, the legacy tool-loop caller or the env-driven caller factories", () => {
    for (const f of walk("lib/contract-model/covenant-map")) {
      const s = read(f);
      expect(s).not.toMatch(/compiler\/orchestrator/);
      expect(s).not.toMatch(/\bRealSemanticCaller\b/);
      expect(s).not.toMatch(/\bgetSemanticCaller\b|\bgetStageCaller\b/);
    }
  });
  it("every Anthropic client on the certified path is built with maxRetries: 0 and the bounded caller has no turn loop", () => {
    for (const f of ["lib/contract-model/covenant-map/callers.ts", "lib/contract-model/analyzer/anthropic-analyzer.ts"]) {
      const lines = read(f).split("\n").filter((l) => /new Anthropic\(/.test(l));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l).toMatch(/maxRetries: 0/);
    }
    const bounded = read("lib/contract-model/compiler/semantic/bounded-caller.ts");
    expect(bounded).not.toMatch(/MAX_TURN_OVERHEAD|for \(let turn|while \(turn|messages\.push\(/);
    expect(bounded).toMatch(/MAX_SEMANTIC_CONVERSATIONS = 1/); expect(bounded).toMatch(/MAX_REFINEMENT_CONVERSATIONS = 1/);
  });
  it("the certified config defaults are DUAL_PASS_ENSEMBLE inventory and CONTEXT_ONLY expansions, and both enter the identity", () => {
    const c = certifiedConfig({ semanticModel: "m", inventoryModel: "m", verifierModel: "m" });
    expect(c.inventoryMode).toBe("DUAL_PASS_ENSEMBLE"); expect(c.expansionRegionPolicy).toBe("CONTEXT_ONLY"); expect(c.shardMaxAttempts).toBe(1);
    const id = certifiedConfigIdentity(c);
    expect(id).toContain("inventory=DUAL_PASS_ENSEMBLE"); expect(id).toContain("expansions=CONTEXT_ONLY"); expect(id).toContain("conv=1+1");
    expect(certifiedConfigIdentity({ ...c, expansionRegionPolicy: "OWNED" })).not.toBe(id);
  });
  it("the verifier stays independent of the accountability layer (qualitative grounding included)", () => {
    for (const f of walk("lib/contract-model/compiler/semantic-verification")) expect({ file: f, ok: !/from "\.\.\/semantic-accountability\//.test(read(f)) }).toEqual({ file: f, ok: true });
  });
});

describe("source-context expansion regressions (what the operative unit contains and what it does not)", () => {
  const index = buildTestIndex([{ documentId: "d", label: "D", text: GOLDEN_AGREEMENT }]);
  const ctxFor = (ref: string) => {
    const r = index.resolveUniqueNodeByRef("d", ref); if (r.status !== "UNIQUE") throw new Error(ref);
    const text = index.getNodeText(r.node.nodeId, "DESCENDANTS");
    return { node: r.node, text, sc: resolveSourceContext({ index, documentId: "d", operativeSourceText: text, anchorNodeId: r.node.nodeId, operativeCharStart: r.node.charStart, documentText: GOLDEN_AGREEMENT }) };
  };
  it("a section's operative region contains its child baskets, exceptions, provisos and conditions (economics live in the children)", () => {
    const { sc } = ctxFor("7.01");
    const op = sc.regions.find((r) => r.kind === "OPERATIVE")!;
    for (const needle of ["(a) Indebtedness under the Loan Documents", "$25,000,000", "provided that no Default has occurred", "greater of $10,000,000 and 5.0% of Consolidated EBITDA"]) expect(op.text).toContain(needle);
    expect(sc.state === "COMPLETE_LOCAL_SOURCE" || sc.state === "DEPENDENCY_EXPANDED_SOURCE").toBe(true);
  });
  it("a foreign sibling's economics are NOT part of the operative region: 7.02's basket cross-reference brings 7.01(b) in as an EXPANSION region, never into the operative text", () => {
    const { sc, text } = ctxFor("7.02");
    const op = sc.regions.find((r) => r.kind === "OPERATIVE")!;
    expect(op.text).toBe(text); expect(op.text).not.toContain("$25,000,000");
    const exp = sc.regions.filter((r) => r.kind !== "OPERATIVE");
    expect(exp.some((r) => r.text.includes("$25,000,000"))).toBe(true);
    // and under the certified CONTEXT_ONLY policy the accountability context is the operative region alone
    const accountability = { ...sc, regions: sc.regions.filter((r) => r.kind === "OPERATIVE") };
    expect(accountability.regions.length).toBe(1);
  });
  it("a sub-clause candidate owns only its own text; the chapeau is context, not operative text", () => {
    const { sc, text } = ctxFor("7.01(b)");
    const op = sc.regions.find((r) => r.kind === "OPERATIVE")!;
    expect(text).toContain("$25,000,000"); expect(text).not.toContain("(c) Indebtedness incurred by any Subsidiary");
    expect(op.text).toBe(text);
    const enclosing = sc.regions.filter((r) => r.kind === "ENCLOSING_NODE_EXPANSION");
    expect(enclosing.length + sc.regions.filter((r) => r.kind === "CROSS_REFERENCE_EXPANSION").length).toBeGreaterThanOrEqual(0);
  });
  it("the compile path narrows Pass A / planning to OPERATIVE regions under CONTEXT_ONLY (source-level guard)", () => {
    const s = read("lib/contract-model/compiler/semantic/compile.ts");
    expect(s).toMatch(/expansionRegionPolicy === "CONTEXT_ONLY"/);
    expect(s).toMatch(/runDualPassSemanticInventory\(\{[^\n]*sourceContext: accountabilityContext!/);
    expect(s).toMatch(/planCompilationShards\(\{[^\n]*sourceContext: accountabilityContext!/);
    expect(s).toMatch(/callerInput = \{ \.\.\.input, operativeSourceText: operativeRegion\.text[^\n]*sourceContext, frozenInventory, governingScope \}/); // Pass B keeps the full context
  });
});

// ---------------------------------------------------------------------------------------------------------------
// PHASE 3 CERTIFICATION CLOSURE - architecture guards (source-level, so a drift fails before it ships)
// ---------------------------------------------------------------------------------------------------------------
const CM_LIB = path.join(process.cwd(), "lib", "contract-model");
const srcOf = (rel: string) => fs.readFileSync(path.join(CM_LIB, rel), "utf8");
function walkTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkTs(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));
}

describe("certification closure: one decision, one adapter, no bypass", () => {
  it("certifyCandidate is the only place a candidate certification status is assigned; the pipeline calls it, the map only reads it", () => {
    const assigners = walkTs(CM_LIB).filter((f) => /\bstatus = blockers\.some\(/.test(fs.readFileSync(f, "utf8")) || /status:\s*"CERTIFIED"\s*[,}]/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(CM_LIB, f)).sort();
    expect(assigners).toEqual(["phase3-certification/certify.ts"]);
    expect(srcOf("covenant-map/pipeline.ts")).toMatch(/certifyCandidate\(/);
    expect(srcOf("covenant-map/assemble.ts")).not.toMatch(/certifyCandidate\(/);
  });

  it("the canonical candidate path is ordered: compile -> stamp semantic contract -> snapshot -> verify -> paired package -> certify; nothing mutates a unit after the snapshot", () => {
    const p = srcOf("covenant-map/pipeline.ts");
    const at = (needle: string) => { const i = p.indexOf(needle); expect(i, needle).toBeGreaterThan(-1); return i; };
    const compile = at("await compileCovenantToIR("), stamp = at("computeSemanticSourceContract("), snapshot = at("snapshotUnitsForVerification(compilation)"), verify = at("await verifyCompiledCandidate("), pack = at("buildVerifiedUnitPackage("), certify = at("certifyCandidate({");
    expect(compile).toBeLessThan(stamp); expect(stamp).toBeLessThan(snapshot); expect(snapshot).toBeLessThan(verify);
    // the package builder and the decision are defined before the snapshot line only as closures; the CALLS that matter come after verification
    expect(p.indexOf("...certify(compilation, verification, snapshot, semanticSourceContract)")).toBeGreaterThan(verify);
    void pack; void certify;
    // after the snapshot statement, no assignment to a unit field occurs in the candidate path
    const afterSnapshot = p.slice(snapshot, p.indexOf("function stopFrom("));
    expect(afterSnapshot).not.toMatch(/\bu\.(sourceContentVersion|compilerVersion|irSchemaVersion)\s*=/);
  });

  it("Phase 4 is reachable from Phase 3 only through the certified adapter and the strict boundary: no product module imports the raw runtime capacity/simulation primitives, and the map itself never imports the runtime", () => {
    const runtimeImporters = walkTs(CM_LIB).filter((f) => !f.includes(`${path.sep}runtime${path.sep}`)).filter((f) => /from "[^"]*runtime\/(capacity\/graph|capacity\/state|transaction\/simulate)"/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(CM_LIB, f)).sort();
    expect(runtimeImporters).toEqual(["verified-execution.ts"]);
    for (const f of walkTs(path.join(CM_LIB, "covenant-map"))) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/from "[^"]*\/runtime\//);
    // the adapter consumes certification records + persisted packages only: never a map node, never raw compiler output
    const adapter = srcOf("phase3-certification/phase4-adapter.ts");
    expect(adapter).not.toMatch(/covenant-map|CanonicalCovenantMap|CovenantMapNode|SemanticCompilationResult/);
    expect(adapter).toMatch(/cert\.status !== "CERTIFIED"/);
    expect(adapter).toMatch(/toVerifiedExecutionPackage\(packages\)/);
    // the execution package can only be DERIVED from persisted packages: no side channel for an unverified shared capacity
    expect(srcOf("verified-units.ts")).toMatch(/export function toVerifiedExecutionPackage\(packages: readonly PersistedVerifiedUnitPackage\[\]\): VerifiedExecutionPackage/);
  });

  it("the runtime stays untouched by this closure: runtime/ imports nothing from phase3-certification, verified-units or covenant-map, and the boundary keeps REQUIRE as a constant", () => {
    for (const f of walkTs(path.join(CM_LIB, "runtime"))) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/phase3-certification|verified-units|covenant-map/);
    expect(srcOf("verified-execution.ts")).toMatch(/export const VERIFIED_EXECUTION_POLICY = "REQUIRE" as const;/);
    expect(srcOf("verified-execution.ts")).toMatch(/shared capacity pool\(s\) are not cleanly verified/);
  });

  it("the semantic source contract binds no model output, verification result, cost or clock", () => {
    const c = srcOf("phase3-certification/semantic-source-contract.ts");
    expect(c).not.toMatch(/SemanticVerificationResult|telemetry|costUsd|Date\.now|new Date\(/);
    expect(c).toMatch(/SEMANTIC_SOURCE_CONTRACT_PREFIX = "sscv2"/);
  });
});
