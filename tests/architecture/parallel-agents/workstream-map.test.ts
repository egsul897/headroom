import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Workstream = {
  workstreamId: string;
  name: string;
  bcId: string | null;
  exclusiveOwn?: string[];
  mustNotTouch?: string[];
  status?: string;
};

type WorkstreamMap = {
  artifact: string;
  version: number;
  status: string;
  baseMainSha: string;
  workstreams: Workstream[];
  ownershipInvariants: string[];
};

const MAP_PATH = resolve(
  process.cwd(),
  "docs/architecture/parallel-agents/01-workstream-map.json",
);

function loadMap(): WorkstreamMap {
  return JSON.parse(readFileSync(MAP_PATH, "utf8")) as WorkstreamMap;
}

/** Collapse trivial glob suffixes so `foo/**` and `foo` collide if both claimed. */
function normalizeExclusiveGlob(glob: string): string {
  return glob.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
}

function globsOverlap(a: string, b: string): boolean {
  const na = normalizeExclusiveGlob(a);
  const nb = normalizeExclusiveGlob(b);
  if (na === nb) return true;
  return na.startsWith(`${nb}/`) || nb.startsWith(`${na}/`);
}

describe("parallel-agent workstream map", () => {
  const map = loadMap();

  it("has required top-level identity fields", () => {
    expect(map.artifact).toBe("parallel-agent-workstream-map");
    expect(map.version).toBeGreaterThanOrEqual(1);
    expect(map.status).toBe("DRAFT_CONTRACT");
    expect(map.baseMainSha).toMatch(/^[0-9a-f]{40}$/);
    expect(map.workstreams.length).toBeGreaterThanOrEqual(4);
    expect(map.ownershipInvariants.length).toBeGreaterThan(0);
  });

  it("includes the four dispatched fleet workstreams plus two reserved slots", () => {
    const ids = map.workstreams.map((w) => w.workstreamId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "WS-PAR",
        "WS-CKF",
        "WS-VIC",
        "WS-CCA",
        "WS-RESERVE-5",
        "WS-RESERVE-6",
      ]),
    );
  });

  it("assigns known bcIds to the four live workstreams", () => {
    const byId = Object.fromEntries(map.workstreams.map((w) => [w.workstreamId, w]));
    expect(byId["WS-PAR"].bcId).toBe("bc-01a11d87-7950-77b8-8141-e448c7e00e3f");
    expect(byId["WS-CKF"].bcId).toBe("bc-01a11d83-6b3f-71e1-9438-3e157bb27327");
    expect(byId["WS-VIC"].bcId).toBe("bc-01a11d85-2531-7ae2-a5d5-cf7360ca6d1d");
    expect(byId["WS-CCA"].bcId).toBe("bc-01a11d86-98d9-7d04-9776-41cf098c3334");
    expect(byId["WS-RESERVE-5"].bcId).toBeNull();
    expect(byId["WS-RESERVE-6"].bcId).toBeNull();
  });

  it("keeps exclusiveOwn globs non-overlapping across assigned workstreams", () => {
    const claimed: Array<{ workstreamId: string; glob: string }> = [];
    for (const ws of map.workstreams) {
      if (ws.status === "UNASSIGNED") {
        expect(ws.exclusiveOwn ?? []).toEqual([]);
        continue;
      }
      for (const glob of ws.exclusiveOwn ?? []) {
        for (const prior of claimed) {
          expect(
            globsOverlap(prior.glob, glob),
            `overlap: ${prior.workstreamId}:${prior.glob} vs ${ws.workstreamId}:${glob}`,
          ).toBe(false);
        }
        claimed.push({ workstreamId: ws.workstreamId, glob });
      }
    }
    expect(claimed.length).toBeGreaterThan(0);
  });

  it("confines WS-PAR exclusive ownership to the parallel-agents pack", () => {
    const par = map.workstreams.find((w) => w.workstreamId === "WS-PAR");
    expect(par?.exclusiveOwn).toEqual([
      "docs/architecture/parallel-agents/**",
      "tests/architecture/parallel-agents/**",
    ]);
  });

  it("forbids WS-PAR from owning peer product trees", () => {
    const par = map.workstreams.find((w) => w.workstreamId === "WS-PAR");
    expect(par?.mustNotTouch).toEqual(
      expect.arrayContaining([
        "lib/connectors/**",
        "lib/extraction/**",
        "lib/covenant-knowledge/**",
        "scripts/compute-assessment/**",
      ]),
    );
  });
});
