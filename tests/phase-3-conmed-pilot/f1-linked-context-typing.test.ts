/**
 * F1 — LINKED CONTEXT SOURCE-TYPING.
 *
 * R1 removed the linked parent from operativeSourceText, but context-retrieval still added every
 * linked structural node to the bundle as a second OPERATIVE_SOURCE item carrying its full subtree.
 * Paid validation showed the consequence: 7.2(k)(i), whose anchor is 54 characters, emitted a rule
 * asserting $150,000,000 and 10.0% — both present only in that operative-labelled parent item.
 *
 * Every assertion below states the POST-F1 invariant, so the file is RED before the change.
 */
import { describe, expect, it } from "vitest";
import { operativeSourceTextFor } from "../../lib/contract-model/compiler/candidate-span";
import { operativeTextFor } from "../../scripts/p3-conmed-pilot/pipeline";
import { prepare } from "../../scripts/p3-conmed-pilot/compile-run";
import { dedupExact } from "../../scripts/p3-conmed-pilot/dedup";
import type { ContextItem } from "../../lib/contract-model/compiler/context-retrieval/types";

const K_I = "discovery-candidate:abc8af03ac51f922f06ded82"; // 7.2(k)(i) — the demonstrated case

const fixture = await (async () => {
  const { stages, bundles, rehydrated } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  return { index: stages.index, bundles, keep, rehydrated };
})();

const itemsFor = (discoveryId: string): ContextItem[] => (fixture.bundles.get(discoveryId)?.items ?? []) as ContextItem[];
const operativeItems = (discoveryId: string) => itemsFor(discoveryId).filter((i) => i.type === "OPERATIVE_SOURCE");

describe("F1 — exactly one anchor may be typed OPERATIVE_SOURCE (§4)", () => {
  it("no candidate in the sealed population carries more than one OPERATIVE_SOURCE item", () => {
    const offenders = fixture.rehydrated
      .filter((c) => operativeItems(c.discoveryId).length > 1)
      .map((c) => ({ ref: String(c.normalizedSourceRef), operativeRefs: operativeItems(c.discoveryId).map((i) => i.normalizedRef) }));
    expect(offenders).toEqual([]);
  });

  it("the single OPERATIVE_SOURCE item is the anchor, structuralNodeIds[0], for every candidate", () => {
    for (const c of fixture.rehydrated) {
      const anchorId = c.structuralNodeIds[0];
      if (!anchorId) continue;
      const ops = operativeItems(c.discoveryId);
      expect(ops.length, String(c.normalizedSourceRef)).toBeLessThanOrEqual(1);
      for (const op of ops) expect(op.structuralNodeId, String(c.normalizedSourceRef)).toBe(anchorId);
    }
  });

  it("no item sourced from structuralNodeIds[1..] is typed OPERATIVE_SOURCE", () => {
    const bad: string[] = [];
    for (const c of fixture.rehydrated) {
      const linked = new Set(c.structuralNodeIds.slice(1));
      for (const i of operativeItems(c.discoveryId)) {
        if (i.structuralNodeId !== null && linked.has(i.structuralNodeId)) bad.push(`${String(c.normalizedSourceRef)} -> ${i.normalizedRef}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("F1 — no context loss (§6)", () => {
  it("every linked node is still present in the bundle, with its text and citation", () => {
    const dual = fixture.rehydrated.filter((c) => c.structuralNodeIds.length > 1);
    expect(dual.length).toBeGreaterThan(0);
    for (const c of dual) {
      for (const linkedId of c.structuralNodeIds.slice(1)) {
        const hit = itemsFor(c.discoveryId).find((i) => i.structuralNodeId === linkedId);
        expect(hit, `${String(c.normalizedSourceRef)} lost its linked node ${linkedId}`).toBeDefined();
        expect(hit!.excerptText.length, String(c.normalizedSourceRef)).toBeGreaterThan(0);
        expect(hit!.sourceCitation.length, String(c.normalizedSourceRef)).toBeGreaterThan(0);
        expect(hit!.type, String(c.normalizedSourceRef)).not.toBe("OPERATIVE_SOURCE");
      }
    }
  });

  it("a linked node that is an ancestor of the anchor is typed PARENT_SCOPE (§5)", () => {
    const dual = fixture.rehydrated.filter((c) => c.structuralNodeIds.length > 1);
    for (const c of dual) {
      const ancestors = new Set(fixture.index.getAncestors(c.structuralNodeIds[0]!).map((n) => n.nodeId));
      for (const linkedId of c.structuralNodeIds.slice(1)) {
        if (!ancestors.has(linkedId)) continue;
        const hit = itemsFor(c.discoveryId).find((i) => i.structuralNodeId === linkedId)!;
        expect(hit.type, String(c.normalizedSourceRef)).toBe("PARENT_SCOPE");
      }
    }
  });
});

describe("F1 — the demonstrated case, 7.2(k)(i) (§8)", () => {
  it("its only OPERATIVE_SOURCE item is the 54-character anchor, carrying neither parent value", () => {
    const ops = operativeItems(K_I);
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    const anchor = operativeSourceTextFor(fixture.rehydrated.find((c) => c.discoveryId === K_I)!, fixture.index);
    expect(op.excerptText).toBe(anchor);
    expect(op.excerptText.length).toBe(54);
    expect(op.excerptText).not.toContain("$150,000,000");
    expect(op.excerptText).not.toContain("10.0%");
  });

  it("the parent's values remain reachable, but only through a contextual item", () => {
    const items = itemsFor(K_I);
    const carriers = items.filter((i) => i.excerptText.includes("$150,000,000") || i.excerptText.includes("10.0%"));
    expect(carriers.length, "the parent text must not be deleted").toBeGreaterThan(0);
    for (const c of carriers) expect(c.type).not.toBe("OPERATIVE_SOURCE");
  });
});
