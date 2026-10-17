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
  it("--relabels gate uses the latest relabels entry (seq 9) via baseline-relabels.json, bound to the committed log", () => {
    const r = verifyHistory(hist, read, { baselineText: readFileSync(`${S}/baseline-relabels.json`), track: "relabels" });
    expect(r.reasons).toEqual([]);
    const relabelSeqs = hist.entries.filter((e) => e.relabels).map((e) => e.seq);
    expect(r.latest?.seq).toBe(Math.max(...relabelSeqs));
    expect(relabelSeqs).toEqual(expect.arrayContaining([8, 9]));
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

describe("seq 8 kept as evidence", () => {
  it("seq 8 file and entry unchanged; seq 9 chains from it and is built on seq 7 code", () => {
    const e8 = hist.entries[7]!, e9 = hist.entries[8]!;
    expect(e8.seq).toBe(8);
    expect(e8.reportSha256).toBe("296f79808fe82a6a751fd80732afb714d215419620543a0fc9eb46b1c59dd3ba");
    expect(e9.relabels?.entries).toBeGreaterThan(e8.relabels!.entries);
    expect(e9.sourceCommit).toBe("8ece66ee");
  });
});
