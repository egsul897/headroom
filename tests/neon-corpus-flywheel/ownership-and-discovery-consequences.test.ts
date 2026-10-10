/**
 * Gate 4 — DSGR/Chewy ownership evidence + downstream Pass A discovery inputs.
 * Does NOT claim verified executable rules from hierarchy alone.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";

const DSGR_D =
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";
const CHWY =
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const CONMED_CURATED = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated";

describe("Gate 4 — DSGR Available Amount limb ownership", () => {
  it("limbs (i)–(viii) contain correct source text and exclude subsequent definitions", () => {
    const text = readFileSync(DSGR_D, "utf8");
    const nodes = parseDocumentStructure({ documentId: "dsgr-d", label: "DSGR", text });
    const defs = detectStructuralDefinitions("dsgr-d", text, nodes).filter((d) => !d.nested);
    const aa = defs.find((d) => d.normalizedTerm === "available amount")!;
    const next = defs[defs.findIndex((d) => d.normalizedTerm === "available amount") + 1]!;
    expect(next.normalizedTerm).toBe("availability");

    const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"] as const;
    const limbs = roman.map((r) =>
      nodes.find((n) => n.sectionRef === `1.01(${r})` && n.charStart > aa.charStart && n.charStart < next.charStart),
    );
    expect(limbs.every(Boolean)).toBe(true);
    for (let i = 0; i < limbs.length; i++) {
      const limb = limbs[i]!;
      const owned = text.slice(limb.charStart, limb.charEnd);
      expect(owned.startsWith(`(${roman[i]})`)).toBe(true);
      expect(limb.charEnd).toBeLessThanOrEqual(next.charStart);
      expect(owned).not.toContain(`“${next.exactTerm}”`);
      expect(owned).not.toMatch(/“Bail-In Action”/);
    }
    // Last limb must be small (pre-fix ~163k)
    expect(limbs[7]!.charEnd - limbs[7]!.charStart).toBeLessThan(8_000);
  });

  it("Pass A candidates on AA limbs cite the owning nodeIds (not later definitions)", () => {
    const text = readFileSync(DSGR_D, "utf8");
    const nodes = parseDocumentStructure({ documentId: "dsgr-d", label: "DSGR", text });
    const defs = detectStructuralDefinitions("dsgr-d", text, nodes);
    const refs = detectStructuralReferences("dsgr-d", text, nodes);
    const index = buildStructuralIndex(new Map([["dsgr-d", { text, nodes }]]), defs, refs);
    const candidates = runPassADeterministicSignals("dsgr-d", index);
    const aa = defs.find((d) => d.normalizedTerm === "available amount" && !d.nested)!;
    const next = defs.filter((d) => !d.nested)[defs.filter((d) => !d.nested).findIndex((d) => d.normalizedTerm === "available amount") + 1]!;
    const aaLimbCandidates = candidates.filter((c) => {
      const n = nodes.find((x) => x.nodeId === c.nodeId);
      return n && n.charStart >= aa.charStart && n.charEnd <= next.charStart;
    });
    expect(aaLimbCandidates.length).toBeGreaterThan(0);
    for (const c of aaLimbCandidates) {
      const n = nodes.find((x) => x.nodeId === c.nodeId)!;
      expect(n.charEnd).toBeLessThanOrEqual(next.charStart);
      // Citation identity is the physical nodeId / sectionRef — not a later term.
      expect(c.nodeId).toBe(n.nodeId);
      expect(c.sectionRef).toBe(n.sectionRef);
    }
    // Explicit: hierarchy correctness ≠ verified executable rule.
    expect(aaLimbCandidates.every((c) => c.signals.length > 0)).toBe(true);
  });
});

describe("Gate 4 — Chewy builder (a) ownership + discovery inputs", () => {
  it("builder (a) owns (A), (B), and Specified Event of Default proviso", () => {
    const text = readFileSync(CHWY, "utf8");
    const nodes = parseDocumentStructure({ documentId: "chwy", label: "CHWY", text });
    const a = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)")!;
    const b = nodes.find((n) => n.sectionRef === "6.08(a)(3)(b)")!;
    const A = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(A)")!;
    const B = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(B)")!;
    expect(A.parentNodeId).toBe(a.nodeId);
    expect(B.parentNodeId).toBe(a.nodeId);
    expect(a.charEnd).toBe(b.charStart);
    const owned = text.slice(a.charStart, a.charEnd);
    expect(owned).toContain("(A)");
    expect(owned).toContain("(B)");
    expect(owned).toMatch(/Specified\s+Event\s+of\s+Default/i);
  });

  it("Pass A cites builder (a); proviso is in DESCENDANTS (and child B), not OWN", () => {
    const text = readFileSync(CHWY, "utf8");
    const nodes = parseDocumentStructure({ documentId: "chwy", label: "CHWY", text });
    const defs = detectStructuralDefinitions("chwy", text, nodes);
    const refs = detectStructuralReferences("chwy", text, nodes);
    const index = buildStructuralIndex(new Map([["chwy", { text, nodes }]]), defs, refs);
    const candidates = runPassADeterministicSignals("chwy", index);
    const a = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)")!;
    const B = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(B)")!;
    const hit = candidates.find((c) => c.nodeId === a.nodeId);
    expect(hit).toBeDefined();
    expect(hit!.sectionRef).toBe("6.08(a)(3)(a)");
    expect(hit!.nodeId).toBe(a.nodeId);
    // OWN truncates at first child — proviso lives under (A)/(B). Structural
    // charEnd ownership is correct (DESCENDANTS), but Pass A reads OWN.
    expect(index.getNodeText(a.nodeId, "OWN")).not.toMatch(/Specified\s+Event\s+of\s+Default/i);
    expect(index.getNodeText(a.nodeId, "DESCENDANTS")).toMatch(/Specified\s+Event\s+of\s+Default/i);
    const hitB = candidates.find((c) => c.nodeId === B.nodeId);
    expect(hitB).toBeDefined();
    expect(hitB!.signals.length).toBeGreaterThan(0);
    // Hierarchy correctness ≠ verified executable rule.
    expect(hit!.signals.includes("builder_language")).toBe(true);
  });
});

describe("Gate 4 — CONMED missing-base refusal retained", () => {
  it("package graph keeps unresolved edges rather than inventing a missing Seventh A&R base", () => {
    const curated = CONMED_CURATED;
    const docs = readdirSync(curated)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .map((f) => ({
        documentId: f.replace(/\.txt$/, ""),
        label: f.replace(/\.txt$/, ""),
        text: readFileSync(join(curated, f), "utf8"),
      }));
    const graph = buildPackageGraph("offline:conmed", "conmed-2025", docs);
    expect(graph.performance.relationshipsUnresolved).toBeGreaterThan(0);
    const unresolved = graph.relationshipCandidates.filter((r) => r.status === "UNRESOLVED");
    expect(unresolved.length).toBeGreaterThan(0);
    // No fabricated targetDocumentId on unresolved edges.
    for (const r of unresolved) {
      expect(r.targetDocumentId).toBeNull();
    }
  });
});
