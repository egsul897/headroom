import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Specialist = {
  workstreamId: string;
  bcId: string;
  exclusiveOwn?: string[];
  mustNotTouch?: string[];
};

type FleetMap = {
  artifact: string;
  version: number;
  status: string;
  baseMainSha: string;
  specialists: Specialist[];
  validationLane?: { workstreamId: string; exclusiveOwn?: string[] };
  ownershipInvariants: string[];
};

type ProgressManifest = {
  schemaVersion: string;
  baseMainSha: string;
  paidInferenceCostUsd: number;
  autoMerge: boolean;
  workstreams: Record<string, { status: string }>;
  criticalBlockers: Array<{ id: string; severity: string }>;
};

const FLEET_PATH = resolve(
  process.cwd(),
  "docs/architecture/parallel-agents/16-product-specialist-fleet.json",
);
const MANIFEST_PATH = resolve(
  process.cwd(),
  "docs/architecture/parallel-agents/17-progress-manifest.json",
);

function normalizeExclusiveGlob(glob: string): string {
  return glob.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
}

function globsOverlap(a: string, b: string): boolean {
  const na = normalizeExclusiveGlob(a);
  const nb = normalizeExclusiveGlob(b);
  if (na === nb) return true;
  return na.startsWith(`${nb}/`) || nb.startsWith(`${na}/`);
}

describe("product specialist fleet map", () => {
  const fleet = JSON.parse(readFileSync(FLEET_PATH, "utf8")) as FleetMap;

  it("identifies eight specialists on current main", () => {
    expect(fleet.artifact).toBe("product-specialist-fleet-map");
    expect(fleet.version).toBeGreaterThanOrEqual(1);
    expect(fleet.status).toBe("ACTIVE_CONTRACT");
    expect(fleet.baseMainSha).toMatch(/^[0-9a-f]{40}$/);
    expect(fleet.specialists).toHaveLength(8);
    expect(fleet.specialists.map((s) => s.workstreamId)).toEqual(
      expect.arrayContaining([
        "WS-NEON",
        "WS-MECH",
        "WS-FIN",
        "WS-CAP",
        "WS-TXN",
        "WS-XDOC",
        "WS-RCV",
        "WS-UCP",
      ]),
    );
  });

  it("keeps exclusiveOwn globs non-overlapping across specialists + validation lane", () => {
    const claims: Array<{ id: string; glob: string }> = [];
    for (const s of fleet.specialists) {
      for (const g of s.exclusiveOwn ?? []) {
        claims.push({ id: s.workstreamId, glob: g });
      }
    }
    for (const g of fleet.validationLane?.exclusiveOwn ?? []) {
      claims.push({ id: fleet.validationLane!.workstreamId, glob: g });
    }
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        expect(
          globsOverlap(claims[i]!.glob, claims[j]!.glob),
          `${claims[i]!.id}:${claims[i]!.glob} overlaps ${claims[j]!.id}:${claims[j]!.glob}`,
        ).toBe(false);
      }
    }
  });

  it("forbids specialists from owning coordinator trees", () => {
    for (const s of fleet.specialists) {
      expect(s.mustNotTouch ?? []).toEqual(
        expect.arrayContaining(["docs/architecture/parallel-agents/**"]),
      );
    }
  });
});

describe("shared progress manifest", () => {
  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8"),
  ) as ProgressManifest;

  it("pins zero paid inference and no auto-merge", () => {
    expect(manifest.schemaVersion).toContain("progress-manifest");
    expect(manifest.baseMainSha).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.paidInferenceCostUsd).toBe(0);
    expect(manifest.autoMerge).toBe(false);
  });

  it("tracks all eight specialists plus elevated usage-zero blocker", () => {
    for (const id of [
      "WS-NEON",
      "WS-MECH",
      "WS-FIN",
      "WS-CAP",
      "WS-TXN",
      "WS-XDOC",
      "WS-RCV",
      "WS-UCP",
    ]) {
      expect(manifest.workstreams[id]?.status).toBeTruthy();
    }
    expect(manifest.criticalBlockers.map((b) => b.id)).toContain(
      "BLK-USAGE-ZERO",
    );
    expect(
      manifest.criticalBlockers.find((b) => b.id === "BLK-USAGE-ZERO")
        ?.severity,
    ).toBe("CRITICAL");
  });
});
