/** merge-shards refuses missing sources / shard indexes and binds the merged identity to the full snapshot hash. */
import { describe, expect, it } from "vitest";
import { snapshotIdentitySha256, verifyShardSet, type ShardInfo } from "@/lib/covenant-learning-factory/scoreboard";

const ids = ["a", "b", "c", "d"];
const info = (index: number, count = 2, snap = snapshotIdentitySha256(ids.map((i) => [i, `h${i}`] as const))): ShardInfo => ({ index, count, snapshotSha256: snap, snapshotSourceIds: ids });
const rep = (index: number, srcs: string[], over: Partial<ShardInfo> = {}) => ({ rulesetVersion: 2, mode: "snapshot", identity: { rulesetVersion: 2, rulesetSha256: "r", snapshotSha256: "x", sourceHashes: {} }, shard: { ...info(index), ...over }, perSource: srcs.map((sourceId) => ({ sourceId })) });

describe("verifyShardSet", () => {
  it("accepts a complete shard set", () => {
    expect(verifyShardSet([rep(0, ["a", "c"]), rep(1, ["b", "d"])]).count).toBe(2);
  });
  it("refuses a shard set missing a source", () => {
    expect(() => verifyShardSet([rep(0, ["a", "c"]), rep(1, ["b"])])).toThrow(/missing from the shards: d/);
  });
  it("refuses a missing shard index", () => {
    expect(() => verifyShardSet([rep(0, ["a", "b", "c", "d"])])).toThrow(/incomplete/);
  });
  it("refuses shards cut from different snapshots", () => {
    expect(() => verifyShardSet([rep(0, ["a", "c"]), rep(1, ["b", "d"], { snapshotSha256: "other" })])).toThrow(/different snapshots/);
  });
  it("refuses shard reports with no snapshot identity", () => {
    expect(() => verifyShardSet([{ ...rep(0, ["a", "c"]), shard: null }, rep(1, ["b", "d"])])).toThrow(/without shard/);
  });
});
