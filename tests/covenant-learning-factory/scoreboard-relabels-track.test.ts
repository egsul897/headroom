import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { verifyHistory, type BaselineHistory } from "../../lib/covenant-learning-factory/scoreboard/integrity";
import { relabelLogSha256 } from "../../lib/covenant-learning-factory/scoreboard/reference-relabels";

const S = "scripts/covenant-learning-factory/scoreboard";
const hist = JSON.parse(readFileSync(`${S}/baseline-history.json`, "utf8")) as BaselineHistory;
const read = (p: string) => (existsSync(p) ? readFileSync(p) : null);

describe("baseline tracks (default vs --relabels)", () => {
  it("default gate still uses seq 7 via baseline.json", () => {
    const r = verifyHistory(hist, read, { baselineText: readFileSync(`${S}/baseline.json`), track: "default" });
    expect(r.reasons).toEqual([]);
    expect(r.latest?.seq).toBe(7);
  });
  it("--relabels gate uses seq 8 via baseline-relabels.json, bound to the committed log", () => {
    const r = verifyHistory(hist, read, { baselineText: readFileSync(`${S}/baseline-relabels.json`), track: "relabels" });
    expect(r.reasons).toEqual([]);
    expect(r.latest?.seq).toBe(8);
    const log = JSON.parse(readFileSync(`${S}/reference-relabels.json`, "utf8"));
    expect(r.latest?.relabels?.logSha256).toBe(relabelLogSha256(log));
    expect(JSON.parse(readFileSync(`${S}/baseline-relabels.json`, "utf8")).identity.scorerConfig).toBe(r.latest?.relabels?.scorerConfig);
  });
  it("refuses the wrong baseline for a track", () => {
    expect(verifyHistory(hist, read, { baselineText: readFileSync(`${S}/baseline.json`), track: "relabels" }).reasons.join()).toMatch(/latest relabels/);
    expect(verifyHistory(hist, read, { baselineText: readFileSync(`${S}/baseline-relabels.json`), track: "default" }).reasons.join()).toMatch(/baseline.json is not the latest history entry/);
  });
  it("seq 1-7 unchanged prefix: dropping seq 8 still verifies the default track", () => {
    const base = { ...hist, entries: hist.entries.slice(0, 7) };
    expect(verifyHistory(hist, read, { baseHistory: base, track: "default" }).reasons).toEqual([]);
  });
});
