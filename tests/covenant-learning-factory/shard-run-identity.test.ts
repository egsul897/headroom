import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shard-run.sh merges through the identity-checking merger", () => {
  const sh = readFileSync("scripts/covenant-learning-factory/scoreboard/shard-run.sh", "utf8");
  it("fails on any error and merges with merge-shards.ts (no ad-hoc total summing)", () => {
    expect(sh).toMatch(/set -euo pipefail/);
    expect(sh).toMatch(/merge-shards\.ts/);
    expect(sh).not.toMatch(/python3/);
  });
});
