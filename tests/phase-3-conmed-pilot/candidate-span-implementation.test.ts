/**
 * CANDIDATE-SPAN CONTRACT R1 + R2 + R3 — the implementation's own red/green tests.
 *
 * Every assertion here states the TARGET contract, so the whole file is RED before the production
 * change and GREEN after it. Zero model calls: fixtures, the real structural index, the real context
 * bundles, and production source read as sentinels.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { buildConditionSuspicionInput } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { CONDITION_MARKERS } from "../../scripts/p3-conmed-pilot/condition-markers";
import { operativeTextFor } from "../../scripts/p3-conmed-pilot/pipeline";
import { prepare } from "../../scripts/p3-conmed-pilot/compile-run";
import { dedupExact } from "../../scripts/p3-conmed-pilot/dedup";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import type { ContextItem } from "../../lib/contract-model/compiler/context-retrieval/types";

const src = (f: string) => fs.readFileSync(f, "utf8");

/**
 * TWO POPULATIONS, deliberately.
 *
 * `keep` is the sealed 137-candidate population as the whole Phase-3 programme has defined it:
 * exact-text dedup computed under the PRE-CHANGE span rule. Every before/after figure is measured
 * over it, so the comparison against the design simulation is apples-to-apples.
 *
 * `keepUnderNewRule` re-runs the same harness dedup with the anchor-only text. It is SMALLER,
 * because two candidate pairs that shared an anchor but were handed different text before now
 * produce identical text and collapse. That is a real, deterministic consequence of the change and
 * is asserted below rather than smoothed over - see the "harness dedup" test.
 */
const preChangeSpan = (c: DiscoveredCandidate, index: Parameters<typeof operativeTextFor>[1]): string =>
  c.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\n\n");

const fixture = await (async () => {
  const { stages, bundles, rehydrated } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => preChangeSpan(c, stages.index));
  const { keep: keepUnderNewRule } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  return { index: stages.index, bundles, keep, keepUnderNewRule };
})();

const byId = (id: string) => fixture.keep.find((c) => c.discoveryId === id)!;
const FOCUS = {
  short_7_2_e: "discovery-candidate:31223fa50581f12fb594ec0d",
  long_7_2_e: "discovery-candidate:62512247bce898548b6f9b63",
  parent_7_2_k: "discovery-candidate:28d7bafd7a1fedde253333ef",
  long_7_2_k: "discovery-candidate:c9999a82a8a6c1c3a9648e22",
  k_i: "discovery-candidate:abc8af03ac51f922f06ded82",
  k_ii: "discovery-candidate:42316093889582e0874f69a6",
  medium_7_6: "discovery-candidate:42423b37324ac426d0f961e2",
};

// ---------------------------------------------------------------------------
// R1 - the operative span is the anchor's, and only the anchor's
// ---------------------------------------------------------------------------

describe("R1 — operative source text is anchor-only (§3A, §4, §8)", () => {
  it("no candidate's operative text extends beyond its own anchor node's span", () => {
    const offenders = fixture.keep.filter((c) => {
      const anchorId = (c.structuralNodeIds ?? [])[0];
      const anchorText = anchorId ? fixture.index.getNodeText(anchorId, "DESCENDANTS") : "";
      return operativeSourceTextFor(c, fixture.index) !== anchorText;
    });
    expect(offenders.map((c) => String(c.normalizedSourceRef))).toEqual([]);
  });

  it("a dual-key child no longer carries its linked parent's text", () => {
    const child = byId(FOCUS.k_i); // 7.2(k)(i): own text 54 chars, linked to section 7.2 (8,843)
    const parentId = child.structuralNodeIds[1]!;
    const parentOwnTail = fixture.index.getNodeText(parentId, "DESCENDANTS").slice(-400);
    const operative = operativeSourceTextFor(child, fixture.index);
    expect(child.structuralNodeIds).toHaveLength(2); // the link itself is untouched
    expect(operative).not.toContain(parentOwnTail);
    expect(operative).toBe(fixture.index.getNodeText(child.structuralNodeIds[0]!, "DESCENDANTS"));
  });

  it("collapses the manufactured focus spans to their true anchor spans", () => {
    const chars = (slot: keyof typeof FOCUS) => operativeSourceTextFor(byId(FOCUS[slot]), fixture.index).length;
    expect(chars("long_7_2_e")).toBe(200);
    expect(chars("long_7_2_k")).toBe(776);
    expect(chars("k_i")).toBe(54);
    expect(chars("k_ii")).toBe(455);
  });

  it("leaves single-key candidates byte-identical", () => {
    for (const slot of ["short_7_2_e", "parent_7_2_k", "medium_7_6"] as const) {
      const c = byId(FOCUS[slot]);
      expect(c.structuralNodeIds).toHaveLength(1);
      expect(operativeSourceTextFor(c, fixture.index)).toBe(preChangeSpan(c, fixture.index));
    }
    const singles = fixture.keep.filter((c) => (c.structuralNodeIds ?? []).length === 1);
    expect(singles.length).toBe(68);
    for (const c of singles) expect(operativeSourceTextFor(c, fixture.index)).toBe(preChangeSpan(c, fixture.index));
  });

  it("narrows the sealed population in aggregate, exactly as the design simulated", () => {
    expect(fixture.keep).toHaveLength(137);
    const before = fixture.keep.reduce((a, c) => a + preChangeSpan(c, fixture.index).length, 0);
    const total = fixture.keep.reduce((a, c) => a + operativeSourceTextFor(c, fixture.index).length, 0);
    expect(before).toBe(505889);
    expect(total).toBe(104459);
    expect(fixture.keep.filter((c) => operativeSourceTextFor(c, fixture.index).length > 4000)).toHaveLength(6);
    expect(fixture.keep.filter((c) => operativeSourceTextFor(c, fixture.index).length > 8000)).toHaveLength(1);
  });

  it("preserves the existing safe behaviour for a candidate with no structural node", () => {
    const empty = { ...byId(FOCUS.k_i), structuralNodeIds: [] } as DiscoveredCandidate;
    expect(operativeSourceTextFor(empty, fixture.index)).toBe("");
  });

  it("production reads the anchor only, and still does not touch structuralNodeIds", () => {
    const orch = src("lib/contract-model/analysis/orchestrator.ts");
    expect(orch).toContain("operativeSourceTextFor(candidate, index)");
    expect(orch).not.toContain('structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\\n\\n")');
    // the link itself must survive for every downstream consumer
    expect(orch).toContain("candidate.structuralNodeIds");
  });

  it("collapses exactly the two same-anchor pairs under the harness's exact-text dedup, and no others", () => {
    // The pilot harness dedups by operative text. Two candidates that share an anchor but differ in
    // discovered ROLE were handed different text before the change and identical text after it, so
    // the harness now sees them as one. Production candidate identity is NOT affected: discovery
    // reconciliation keys on `${anchor}::${role}::${fingerprint}` and never on the source text.
    expect(fixture.keep).toHaveLength(137);
    expect(fixture.keepUnderNewRule).toHaveLength(135);
    const dropped = fixture.keep.filter((c) => !fixture.keepUnderNewRule.some((k) => k.discoveryId === c.discoveryId));
    expect(dropped.map((c) => String(c.normalizedSourceRef)).sort()).toEqual(["7.2(e)", "7.2(k)"]);
    for (const c of dropped) {
      const twin = fixture.keep.find((k) => k.discoveryId !== c.discoveryId && k.structuralNodeIds[0] === c.structuralNodeIds[0])!;
      expect(twin).toBeDefined();
      expect(twin.role).not.toBe(c.role); // a different reading of the same clause, not a duplicate claim
      expect(operativeSourceTextFor(twin, fixture.index)).toBe(operativeSourceTextFor(c, fixture.index));
    }
    expect(fixture.keepUnderNewRule.reduce((a, c) => a + operativeSourceTextFor(c, fixture.index).length, 0)).toBe(103483);
  });

  it("contains no issuer-, section- or benchmark-specific logic", () => {
    const helper = src("lib/contract-model/compiler/candidate-span.ts");
    expect(helper).not.toMatch(/7\.2|6\.01|conmed|dsgr|lsb|fwrg/i);
  });
});

// ---------------------------------------------------------------------------
// R2 - the pilot harness derives the identical span
// ---------------------------------------------------------------------------

describe("R2 — production/pilot parity (§5)", () => {
  it("the harness delegates to the production rule rather than restating it", () => {
    const pipeline = src("scripts/p3-conmed-pilot/pipeline.ts");
    expect(pipeline).toContain("operativeSourceTextFor");
    expect(pipeline).not.toContain('candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\\n\\n")');
  });

  it("derives byte-identical text for every candidate shape in the sealed population", () => {
    const shapes: Record<string, DiscoveredCandidate | undefined> = {
      singleKey: fixture.keep.find((c) => c.structuralNodeIds.length === 1),
      dualKey: fixture.keep.find((c) => c.structuralNodeIds.length === 2),
      parent: byId(FOCUS.parent_7_2_k),
      child: byId(FOCUS.k_i),
      exception: fixture.keep.find((c) => c.role === "EXCEPTION" && c.structuralNodeIds.length === 2),
      basket: fixture.keep.find((c) => c.role === "BASKET" && c.structuralNodeIds.length === 2),
      proviso: fixture.keep.find((c) => c.role === "PROVISO" && c.structuralNodeIds.length === 2),
      condition: fixture.keep.find((c) => c.role === "CONDITION" && c.structuralNodeIds.length === 2),
    };
    for (const [shape, c] of Object.entries(shapes)) {
      expect(c, `no candidate of shape ${shape}`).toBeDefined();
      expect(operativeTextFor(c!, fixture.index), shape).toBe(operativeSourceTextFor(c!, fixture.index));
    }
    for (const c of fixture.keep) expect(operativeTextFor(c, fixture.index)).toBe(operativeSourceTextFor(c, fixture.index));
  });
});

// ---------------------------------------------------------------------------
// R3 - Gate 2 keeps seeing parent-level conditions, without owning parent economics
// ---------------------------------------------------------------------------

const item = (type: ContextItem["type"], text: string, ref = "7.2"): ContextItem =>
  ({ itemId: `i-${type}-${ref}`, type, documentId: "doc", structuralNodeKey: `doc::${ref}`, structuralNodeId: `node-${ref}`, normalizedRef: ref, sourceCitation: `Section ${ref}`, excerptText: text, reason: "test", retrievalDepth: 1, retrievalPath: [], retrievalMethod: "STRUCTURAL_TRAVERSAL", confidence: 1 }) as unknown as ContextItem;

const inputWith = (operative: string, items: ContextItem[]): SemanticCompilerInput =>
  ({ operativeSourceText: operative, contextBundle: { items } }) as unknown as SemanticCompilerInput;

describe("R3 — verifier Gate-2 condition safety (§3C, §6)", () => {
  it("a condition living only in the parent chapeau stays inside the Gate-2 window", () => {
    const operative = "Indebtedness of any Foreign Subsidiary to the Parent Borrower.";
    const chapeau = "The Borrower shall not incur Indebtedness so long as no Default has occurred and is continuing, except:";
    const built = buildConditionSuspicionInput(inputWith(operative, [item("PARENT_SCOPE", chapeau)]));
    expect(built).toContain(operative);
    expect(built).toContain("so long as no Default has occurred");
  });

  it("does NOT widen the window to arbitrary sibling or other context material", () => {
    const operative = "Indebtedness of any Foreign Subsidiary to the Parent Borrower.";
    const built = buildConditionSuspicionInput(inputWith(operative, [
      item("PARENT_SCOPE", "chapeau text: unless a Default has occurred"),
      item("SIBLING_CONTEXT", "SIBLING ONLY: other permitted Indebtedness up to $99,000,000", "7.2(z)"),
      item("CROSS_REFERENCE", "CROSS REF ONLY: see Section 7.1", "7.1"),
      item("DEFINITION", "DEFINITION ONLY: 'Default' means ...", "1.1"),
      item("CHILD_RULE", "CHILD ONLY: subclause text", "7.2(k)(i)"),
      item("OPERATIVE_SOURCE", "LINKED OPERATIVE ONLY: the whole parent section body", "7.2"),
    ]));
    expect(built).toContain("chapeau text");
    for (const foreign of ["SIBLING ONLY", "CROSS REF ONLY", "DEFINITION ONLY", "CHILD ONLY", "LINKED OPERATIVE ONLY"]) {
      expect(built, foreign).not.toContain(foreign);
    }
  });

  it("does not make parent economics part of the candidate's own operative source", () => {
    const operative = "Indebtedness of any Foreign Subsidiary to the Parent Borrower.";
    const input = inputWith(operative, [item("PARENT_SCOPE", "chapeau, not to exceed $150,000,000 in aggregate")]);
    // Gate 2's window may see the parent's words...
    expect(buildConditionSuspicionInput(input)).toContain("$150,000,000");
    // ...but the operative source the rest of the verifier reconciles against must not.
    expect(input.operativeSourceText).not.toContain("$150,000,000");
    expect(input.operativeSourceText).toBe(operative);
  });

  it("is a no-op when there is no parent scope, and tolerates an absent bundle", () => {
    const operative = "Plain operative text.";
    expect(buildConditionSuspicionInput(inputWith(operative, []))).toBe(operative);
    expect(buildConditionSuspicionInput({ operativeSourceText: operative } as unknown as SemanticCompilerInput)).toBe(operative);
  });

  it("verify.ts routes Gate 2 through the builder rather than the raw operative text", () => {
    const v = src("lib/contract-model/compiler/semantic-verification/verify.ts");
    expect(v).toContain("classifyConditionSuspicion(buildConditionSuspicionInput(compilerInput)");
    // the reconciliation's own source side must still be the operative text alone
    expect(v).toContain("buildSourceInventory(compilerInput.candidateRef, compilerInput.operativeSourceText,");
  });

  it("covers the real candidates whose condition language is parent-only", () => {
    const parentOnly = fixture.keep.filter((c) => {
      if ((c.structuralNodeIds ?? []).length < 2) return false;
      const anchor = operativeSourceTextFor(c, fixture.index).toLowerCase();
      const scopes = (fixture.bundles.get(c.discoveryId)?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");
      return scopes.some((i) => CONDITION_MARKERS.some((m) => i.excerptText.toLowerCase().includes(m) && !anchor.includes(m)));
    });
    expect(parentOnly.length).toBe(15); // recorded RED in 02-red-baseline.json
    for (const c of parentOnly) {
      const scopes = (fixture.bundles.get(c.discoveryId)?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");
      const built = buildConditionSuspicionInput(inputWith(operativeSourceTextFor(c, fixture.index), scopes as ContextItem[]));
      const marker = CONDITION_MARKERS.find((m) => scopes.some((i) => i.excerptText.toLowerCase().includes(m)))!;
      expect(built.toLowerCase(), String(c.normalizedSourceRef)).toContain(marker);
    }
  });
});

// ---------------------------------------------------------------------------
// §7 context retention, §9 false-credit isolation, §13 determinism
// ---------------------------------------------------------------------------

describe("§7 — linked context must remain", () => {
  it("every dual-key candidate keeps its link, its parent context and its coverage inputs", () => {
    const dual = fixture.keep.filter((c) => (c.structuralNodeIds ?? []).length > 1);
    expect(dual).toHaveLength(67);
    let retained = 0;
    for (const c of dual) {
      const bundle = fixture.bundles.get(c.discoveryId);
      const linked = new Set(c.structuralNodeIds.slice(1));
      expect(bundle?.originatingStructuralNodeIds).toEqual(c.structuralNodeIds); // coverage input unchanged
      const scopes = (bundle?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");
      expect(scopes.length).toBeGreaterThan(0);
      if (scopes.some((i) => i.structuralNodeId !== null && linked.has(i.structuralNodeId))) retained++;
    }
    expect(retained).toBe(67);
  });
});

describe("§9 — a child can no longer use a sibling's economics as its own", () => {
  it("child owns one amount, parent/sibling owns another: only the child's is operative", () => {
    const child = byId(FOCUS.k_ii);
    const operative = operativeSourceTextFor(child, fixture.index);
    const parentId = child.structuralNodeIds[1]!;
    const parentText = fixture.index.getNodeText(parentId, "DESCENDANTS");
    const amounts = (t: string) => [...new Set(t.match(/\$[\d,]{4,}/g) ?? [])];
    const parentOnlyAmounts = amounts(parentText).filter((a) => !operative.includes(a));
    expect(parentOnlyAmounts.length).toBeGreaterThan(0);
    for (const a of parentOnlyAmounts) expect(operative).not.toContain(a);
    // and the parent's own text is still reachable as context for interpretation
    expect(fixture.index.getNodeText(parentId, "DESCENDANTS")).toContain(parentOnlyAmounts[0]!);
    expect(child.structuralNodeIds).toContain(parentId);
  });
});

describe("§13 — determinism", () => {
  it("two derivations over identical fixtures are byte-identical", () => {
    const once = fixture.keep.map((c) => operativeSourceTextFor(c, fixture.index));
    const twice = fixture.keep.map((c) => operativeSourceTextFor(c, fixture.index));
    expect(twice).toEqual(once);
  });
});

// ---------------------------------------------------------------------------
// §11 coverage invariance (F3) and §15 downstream interface shapes
// ---------------------------------------------------------------------------

describe("§11 — coverage invariance (F3)", () => {
  it("every coverage consumer reads the node array, which the change never writes to", () => {
    expect(src("lib/contract-model/compiler/coverage-audit/pipeline.ts")).toContain("const discoveredNodeIds = new Set(input.candidates.flatMap((c) => c.structuralNodeIds));");
    expect(src("lib/contract-model/compiler/coverage-audit/discovery-comparison.ts")).toContain("candidates.filter((c) => c.structuralNodeIds.includes(nodeId))");
    expect(src("lib/contract-model/compiler/semantic-coverage/reconciliation.ts")).toContain("c.structuralNodeIds.some((id) => id === anchor.structuralNodeId || ancestorIds.has(id))");
    // the span rule must not read or write anything but the anchor
    const helper = src("lib/contract-model/compiler/candidate-span.ts");
    expect(helper).toContain("candidate.structuralNodeIds[0]");
    expect(helper).not.toMatch(/\.slice\(|\.map\(|\.join\(|push\(/);
  });

  it("discoveredNodeIds, the covered-unit set and the bundle inputs are identical before and after", () => {
    const nodeIds = (cs: DiscoveredCandidate[]) => JSON.stringify([...new Set(cs.flatMap((c) => c.structuralNodeIds))].sort());
    const units = (cs: DiscoveredCandidate[]) => JSON.stringify(cs.map((c) => ({ id: c.discoveryId, nodes: [...c.structuralNodeIds].sort() })).sort((a, b) => a.id.localeCompare(b.id)));
    // "before" and "after" are the same computation over the same array precisely because the change
    // does not touch it; this pins that, so a future edit that starts rewriting the array fails here.
    expect(nodeIds(fixture.keep)).toBe(nodeIds(fixture.keep.map((c) => ({ ...c }))));
    expect(units(fixture.keep)).toBe(units(fixture.keep.map((c) => ({ ...c }))));
    expect([...new Set(fixture.keep.flatMap((c) => c.structuralNodeIds))]).toHaveLength(133);
    for (const c of fixture.keep) {
      expect(fixture.bundles.get(c.discoveryId)?.originatingStructuralNodeIds).toEqual(c.structuralNodeIds);
    }
  });

  it("every appended parent section is itself a candidate anchor, so its proposition never goes uncovered", () => {
    const anchors = new Set(fixture.keep.map((c) => c.structuralNodeIds[0]));
    const parents = [...new Set(fixture.keep.filter((c) => c.structuralNodeIds.length > 1).map((c) => c.structuralNodeIds[1]!))];
    expect(parents.length).toBeGreaterThan(0);
    expect(parents.filter((p) => anchors.has(p))).toHaveLength(parents.length);
  });
});

describe("§15 — downstream interfaces unchanged", () => {
  it("no compiler, bundle, IR or provenance type was touched", () => {
    const provenance = src("lib/contract-model/ir/types.ts");
    expect(provenance).toContain("export interface SourceProvenance {");
    expect(provenance).not.toContain('role?: "OPERATIVE"'); // F2 deliberately NOT implemented here
    // the compiler input still carries exactly one operative-source field, fed by the new rule
    expect(src("lib/contract-model/compiler/semantic/types.ts")).toContain("operativeSourceText");
    // context-retrieval is untouched: the linked node is still retrieved (F1 deliberately deferred)
    expect(src("lib/contract-model/compiler/context-retrieval/pipeline.ts")).toContain("for (const extraNodeId of candidate.structuralNodeIds.slice(1))");
  });
});
