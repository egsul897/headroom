import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeGraph } from "../../scripts/covenant-dependency-atlas/graph-analysis";
import {
  AtlasEdgeSchema,
  AtlasNodeSchema,
  type AtlasEdge,
  type AtlasNode,
} from "../../scripts/covenant-dependency-atlas/schema";

const FIXTURE_DIR = join(__dirname, "../fixtures/covenant-dependency-atlas/graph-fixtures");

function loadFixture(name: string): {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  expectedMotifs: Record<string, number>;
} {
  const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf-8")) as {
    nodes: unknown[];
    edges: unknown[];
    expectedMotifs: Record<string, number>;
  };
  return {
    nodes: raw.nodes.map((n) => AtlasNodeSchema.parse(n)),
    edges: raw.edges.map((e) => AtlasEdgeSchema.parse(e)),
    expectedMotifs: raw.expectedMotifs,
  };
}

describe("Covenant Dependency Atlas graph fixtures", () => {
  it("diamond-shared-basket is a shared dependency (diamond) and not a cycle", () => {
    const fx = loadFixture("diamond-shared-basket.json");
    const result = analyzeGraph(fx.nodes, fx.edges);
    expect(result.diamondCount).toBe(fx.expectedMotifs.DIAMOND_SHARED_DEPENDENCY);
    expect(result.cycleCount).toBe(fx.expectedMotifs.GENUINE_CYCLE);
    expect(result.motifs.every((m) => m.motifType === "DIAMOND_SHARED_DEPENDENCY")).toBe(true);
  });

  it("circular-definitions is a genuine cycle and not a shared-dependency diamond", () => {
    const fx = loadFixture("circular-definitions.json");
    const result = analyzeGraph(fx.nodes, fx.edges);
    expect(result.cycleCount).toBe(fx.expectedMotifs.GENUINE_CYCLE);
    expect(result.diamondCount).toBe(fx.expectedMotifs.DIAMOND_SHARED_DEPENDENCY);
    expect(result.motifs.some((m) => m.motifType === "GENUINE_CYCLE")).toBe(true);
    expect(result.motifs.some((m) => m.motifType === "DIAMOND_SHARED_DEPENDENCY")).toBe(false);
  });
});
