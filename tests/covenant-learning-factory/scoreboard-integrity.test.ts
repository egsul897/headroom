/**
 * Adversarial tests for scoreboard benchmark integrity (owner directive "BENCHMARK INTEGRITY", 2026-10-14):
 *  1 frozen membership, 2 comparability binding, 3 append-only history + recorded thresholds,
 *  4 UNSUPPORTED_SEMANTICS / per-source regressions under an improving aggregate.
 * Every test here attacks the gate with a change that the pre-change gate accepted.
 */
import { describe, expect, it } from "vitest";
import * as sb from "@/lib/covenant-learning-factory/scoreboard";
import type { DevManifest, ScoreboardReport, SourceScore } from "@/lib/covenant-learning-factory/scoreboard";
import { emptyRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";

const RULES = { rulesetVersion: 2, rulesetSha256: "r".repeat(64) };
const manifest: DevManifest = { description: "t", sourceIds: ["fixture:a"] };

function src(sourceId: string, cg: number, dg: number, us = 0, extra: Partial<SourceScore> = {}): SourceScore {
  const counts = { ...sb.emptyCounts(), COVERAGE_GAP: cg, DISCOVERY_GAP: dg, UNSUPPORTED_SEMANTICS: us };
  return {
    sourceId,
    split: sb.splitFor(sourceId, manifest),
    counts,
    total: cg + dg + us,
    contentSha256: `sha-${sourceId}`,
    issuerCik: sourceId.startsWith("fixture") ? null : `000000${sourceId.length}`,
    ticker: null,
    inputSha256: `in-${sourceId}`,
    ...extra,
  } as SourceScore;
}
const rep = (xs: SourceScore[], rules = RULES): ScoreboardReport =>
  sb.aggregate(xs, { mode: "snapshot", rulesetVersion: rules.rulesetVersion, rulesetSha256: rules.rulesetSha256 } as never);

const baseRows = () => [src("fixture:a", 3, 1), src("edgar:x", 2, 5), src("edgar:y", 0, 4, 1), src("edgar:zz", 10, 10)];
const base = rep(baseRows());

describe("1. frozen HELDOUT membership", () => {
  it("fails when a HELDOUT source is moved to DEV, even though HELDOUT errors drop", () => {
    const cur = rep(baseRows().map((s) => (s.sourceId === "edgar:zz" ? { ...s, split: "DEV" as const } : s)));
    expect(cur.totals.HELDOUT.total).toBeLessThan(base.totals.HELDOUT.total);
    const g = sb.compareToBaseline(base, cur);
    expect(g.pass).toBe(false);
    expect(g.reasons.join("\n")).toMatch(/edgar:zz: moved HELDOUT → DEV without an authorized HELDOUT_TO_DEV/);
  });

  it("fails when a HELDOUT source is re-marked as a duplicate (silent drop)", () => {
    const cur = rep(baseRows().map((s) => (s.sourceId === "edgar:zz" ? { ...s, duplicateOf: "edgar:x" } : s)));
    const g = sb.compareToBaseline(base, cur);
    expect(g.pass).toBe(false);
    expect(g.reasons.join("\n")).toMatch(/edgar:zz: dropped \(re-marked duplicate/);
  });

  it("fails when a frozen HELDOUT source's hash or issuer changes", () => {
    const cur = rep(baseRows().map((s) => (s.sourceId === "edgar:x" ? { ...s, contentSha256: "other", issuerCik: "999" } : s)));
    const g = sb.compareToBaseline(base, cur);
    expect(g.reasons.join("\n")).toMatch(/edgar:x: source hash changed/);
    expect(g.reasons.join("\n")).toMatch(/edgar:x: issuer \(CIK\/ticker\) changed/);
  });

  it("checks the committed membership file, not just the baseline, and honours only a complete migration record", () => {
    const membership = sb.membershipFromReport(base.perSource, "2026-10-14");
    const moved = [{ sourceId: "edgar:zz", split: "DEV" as const, contentSha256: "sha-edgar:zz", issuerCik: "00000008", ticker: null }];
    const others = base.perSource.filter((s) => s.sourceId !== "edgar:zz");
    const view = [...others, ...moved];
    expect(sb.checkMembership(membership, view, [])).toHaveLength(1);
    const incomplete = [{ id: "m1", date: "2026-10-14", change: "HELDOUT_TO_DEV", sourceIds: ["edgar:zz"], reason: "", approver: "" }];
    const r1 = sb.checkMembership(membership, view, incomplete as never);
    expect(r1.join("\n")).toMatch(/invalid: missing\/invalid reason, approver/);
    expect(r1.join("\n")).toMatch(/moved HELDOUT → DEV/);
    const wrongKind = [{ id: "m2", date: "2026-10-14", change: "DROP_HELDOUT", sourceIds: ["edgar:zz"], reason: "r", approver: "owner" }];
    expect(sb.checkMembership(membership, view, wrongKind as never).join("\n")).toMatch(/moved HELDOUT → DEV/);
    const ok = [{ id: "m3", date: "2026-10-14", change: "HELDOUT_TO_DEV", sourceIds: ["edgar:zz"], reason: "issuer has DEV fixtures", approver: "owner" }];
    expect(sb.checkMembership(membership, view, ok as never)).toEqual([]);
  });
});

describe("2. comparisons are bound to snapshot, source hashes and ruleset identity", () => {
  it("refuses a different ruleset content hash at the same version", () => {
    const cur = rep(baseRows(), { rulesetVersion: 2, rulesetSha256: "x".repeat(64) });
    expect(() => sb.compareToBaseline(base, cur)).toThrow(/incomparable evaluations.*ruleset hash/);
  });
  it("refuses a different ruleset version", () => {
    const cur = rep(baseRows(), { rulesetVersion: 3, rulesetSha256: RULES.rulesetSha256 });
    expect(() => sb.compareToBaseline(base, cur)).toThrow(/ruleset version 2 ≠ 3/);
  });
  it("refuses a different input snapshot (one source's inputs changed)", () => {
    const cur = rep(baseRows().map((s) => (s.sourceId === "edgar:y" ? { ...s, inputSha256: "in-tampered" } : s)));
    expect(() => sb.compareToBaseline(base, cur)).toThrow(/input snapshot .*1 source input hash\(es\) differ \(e\.g\. edgar:y\)/);
  });
  it("refuses a different scorer configuration (e.g. section-tree on vs off)", () => {
    const mk = (cfg: string) =>
      sb.aggregate(baseRows(), { mode: "snapshot", rulesetVersion: 2, rulesetSha256: RULES.rulesetSha256, scorerConfig: cfg } as never);
    expect(() => sb.compareToBaseline(mk("tree=on;mode=agree"), mk("tree=off"))).toThrow(/scorer config tree=on;mode=agree ≠ tree=off/);
  });
  it("refuses a baseline without an identity (legacy / hand-edited)", () => {
    const legacy = { ...base, identity: undefined } as ScoreboardReport;
    expect(() => sb.compareToBaseline(legacy, rep(baseRows()))).toThrow(/baseline has no evaluation identity/);
  });
  it("identity is a pure function of inputs and rules", () => {
    const input = { source: { sourceId: "edgar:t", contentSha256: "h" }, documentText: "Section 7.01 Indebtedness.", candidates: [], definitions: [], conditions: [] };
    const a = sb.scoreSource(input as never, emptyRuleSet(0), manifest);
    const b = sb.scoreSource({ ...input, documentText: "Section 7.01 Indebtedness!" } as never, emptyRuleSet(0), manifest);
    expect(a.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.inputSha256).not.toBe(b.inputSha256);
    expect(sb.rulesetIdentity(emptyRuleSet(0)).rulesetSha256).not.toBe(sb.rulesetIdentity(emptyRuleSet(1)).rulesetSha256);
  });
});

describe("3. append-only baseline history and recorded thresholds", () => {
  const files: Record<string, string> = { "b/1.json": "{\"v\":1}", "b/2.json": "{\"v\":2}" };
  const read = (f: string) => files[f] ?? null;
  const T = sb.DEFAULT_THRESHOLDS;
  function entry(seq: number, prev: sb.BaselineHistoryEntry | null, over: Partial<sb.BaselineHistoryEntry> = {}): sb.BaselineHistoryEntry {
    return {
      seq,
      recordedAt: "2026-10-14",
      file: `b/${seq}.json`,
      reportSha256: sb.sha256(files[`b/${seq}.json`]!),
      prevEntrySha256: prev ? sb.historyEntrySha256(prev) : null,
      legacy: false,
      identity: { rulesetVersion: 2, rulesetSha256: "r", snapshotSha256: "s" },
      heldout: { sources: 3, total: 100, UNSUPPORTED_SEMANTICS: 5 },
      thresholds: T,
      reason: "baseline",
      approver: "owner",
      ...over,
    };
  }
  function fx() {
    const e1 = entry(1, null);
    const e2 = entry(2, e1, { heldout: { sources: 3, total: 90, UNSUPPORTED_SEMANTICS: 5 } });
    return { e1, e2 };
  }
  const H = (entries: sb.BaselineHistoryEntry[]) => ({ schema: "clf-scoreboard-baseline-history/v1" as const, entries });

  it("accepts an intact chain whose latest file is baseline.json", () => {
    const { e1, e2 } = fx();
    expect(sb.verifyHistory(H([e1, e2]), read, { baselineText: files["b/2.json"] }).reasons).toEqual([]);
  });
  it("fails when baseline.json is overwritten without appending", () => {
    const { e1, e2 } = fx();
    expect(sb.verifyHistory(H([e1, e2]), read, { baselineText: "{\"v\":3}" }).reasons.join("\n")).toMatch(/not the latest history entry/);
  });
  it("fails when a previous baseline file is deleted or edited", () => {
    const { e1, e2 } = fx();
    expect(sb.verifyHistory(H([e1, e2]), (f) => (f === "b/1.json" ? null : read(f))).reasons.join("\n")).toMatch(/b\/1\.json is missing/);
    expect(sb.verifyHistory(H([e1, e2]), (f) => (f === "b/1.json" ? "{}" : read(f))).reasons.join("\n")).toMatch(/b\/1\.json was modified/);
  });
  it("fails when an earlier entry is rewritten or removed (hash chain / base-branch prefix)", () => {
    const { e1, e2 } = fx();
    const e1x = { ...e1, heldout: { ...e1.heldout, total: 999 } };
    expect(sb.verifyHistory(H([e1x, e2]), read).reasons.join("\n")).toMatch(/hash chain broken/);
    expect(sb.verifyHistory(H([e2]), read).reasons.join("\n")).toMatch(/seq must be 1/);
    expect(sb.verifyHistory(H([e1]), read, { baseHistory: H([e1, e2]) }).reasons.join("\n")).toMatch(/history shrank/);
  });
  it("fails when thresholds are silently relaxed; passes with a recorded thresholdMigration", () => {
    const { e1, e2 } = fx();
    const loose = { ...T, perSourceMaterialAbs: 50 };
    const bad = entry(2, e1, { thresholds: loose });
    expect(sb.verifyHistory(H([e1, bad]), read).reasons.join("\n")).toMatch(/thresholds changed without a recorded thresholdMigration/);
    const good = entry(2, e1, { thresholds: loose, thresholdMigration: { reason: "documented", approver: "owner" } });
    expect(sb.verifyHistory(H([e1, good]), read).reasons).toEqual([]);
    expect(sb.verifyHistory(H([e1, good]), read).thresholds.perSourceMaterialAbs).toBe(50);
  });
  it("fails when a rebaseline silently raises HELDOUT errors or UNSUPPORTED_SEMANTICS", () => {
    const { e1, e2 } = fx();
    const up = entry(2, e1, { heldout: { sources: 3, total: 120, UNSUPPORTED_SEMANTICS: 9 } });
    const r = sb.verifyHistory(H([e1, up]), read).reasons.join("\n");
    expect(r).toMatch(/HELDOUT baseline raised 100 → 120/);
    expect(r).toMatch(/UNSUPPORTED_SEMANTICS baseline raised 5 → 9/);
  });
  it("compareToBaseline uses the recorded thresholds it is given", () => {
    const cur = rep(baseRows().map((s) => (s.sourceId === "edgar:x" ? src("edgar:x", 2, 7) : s.sourceId === "edgar:zz" ? src("edgar:zz", 5, 10) : s)));
    expect(sb.compareToBaseline(base, cur).pass).toBe(false);
    expect(sb.compareToBaseline(base, cur, { thresholds: { ...T, perSourceMaterialAbs: 3 } }).pass).toBe(true);
  });
});

describe("4. HELDOUT UNSUPPORTED_SEMANTICS and per-source regressions fail under an improving aggregate", () => {
  it("fails on an aggregate HELDOUT UNSUPPORTED_SEMANTICS increase although total errors drop", () => {
    const cur = rep([src("fixture:a", 3, 1), src("edgar:x", 0, 0, 3), src("edgar:y", 0, 4, 1), src("edgar:zz", 10, 10)]);
    expect(cur.totals.HELDOUT.total).toBeLessThan(base.totals.HELDOUT.total);
    const g = sb.compareToBaseline(base, cur);
    expect(g.pass).toBe(false);
    expect(g.reasons.join("\n")).toMatch(/HELDOUT UNSUPPORTED_SEMANTICS increased 1 → 4/);
  });
  it("fails when one HELDOUT source gains UNSUPPORTED_SEMANTICS while another loses the same amount", () => {
    const cur = rep([src("fixture:a", 3, 1), src("edgar:x", 2, 4, 1), src("edgar:y", 0, 5, 0), src("edgar:zz", 10, 10)]);
    expect(cur.totals.HELDOUT.UNSUPPORTED_SEMANTICS).toBe(base.totals.HELDOUT.UNSUPPORTED_SEMANTICS);
    const g = sb.compareToBaseline(base, cur);
    expect(g.pass).toBe(false);
    expect(g.reasons.join("\n")).toMatch(/edgar:x UNSUPPORTED_SEMANTICS 0 → 1/);
  });
  it("fails on a material per-source regression hidden by a larger improvement elsewhere", () => {
    const cur = rep([src("fixture:a", 3, 1), src("edgar:x", 2, 7), src("edgar:y", 0, 4, 1), src("edgar:zz", 0, 0)]);
    expect(cur.totals.HELDOUT.total).toBeLessThan(base.totals.HELDOUT.total);
    const g = sb.compareToBaseline(base, cur);
    expect(g.pass).toBe(false);
    expect(g.reasons.join("\n")).toMatch(/material per-source regression: edgar:x 7 → 9 \(\+2 ≥ limit 2\)/);
  });
  it("documents the threshold: +1 on a small source and <10% on a large source pass", () => {
    expect(sb.materialRegressionLimit(0, sb.DEFAULT_THRESHOLDS)).toBe(2);
    expect(sb.materialRegressionLimit(50, sb.DEFAULT_THRESHOLDS)).toBe(5);
    const cur = rep([src("fixture:a", 3, 1), src("edgar:x", 2, 6), src("edgar:y", 0, 4, 1), src("edgar:zz", 9, 9)]);
    expect(sb.compareToBaseline(base, cur).pass).toBe(true);
  });
  it("DEV-only UNSUPPORTED_SEMANTICS movement does not trip the HELDOUT gate", () => {
    const cur = rep([src("fixture:a", 3, 1, 9), src("edgar:x", 2, 5), src("edgar:y", 0, 4, 1), src("edgar:zz", 10, 10)]);
    expect(sb.compareToBaseline(base, cur).pass).toBe(true);
  });
});
