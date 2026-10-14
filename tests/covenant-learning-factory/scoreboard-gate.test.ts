/**
 * Scoreboard gate: an injected HELDOUT regression fails; no change passes;
 * DEV-only movement does not trip the HELDOUT gate; dropped HELDOUT sources fail closed.
 */
import { describe, expect, it } from "vitest";
import {
  aggregate,
  compareToBaseline,
  emptyCounts,
  scoreSource,
  splitFor,
  type DevManifest,
  type SourceScore,
} from "@/lib/covenant-learning-factory/scoreboard";
import { emptyRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";

const manifest: DevManifest = { description: "test", sourceIds: ["fixture:a"] };

function s(sourceId: string, cg: number, dg: number, us = 0): SourceScore {
  const counts = { ...emptyCounts(), COVERAGE_GAP: cg, DISCOVERY_GAP: dg, UNSUPPORTED_SEMANTICS: us };
  return { sourceId, split: splitFor(sourceId, manifest), counts, total: cg + dg + us };
}
const rep = (xs: SourceScore[]) => aggregate(xs, { mode: "snapshot", rulesetVersion: 0 });

describe("clf scoreboard gate", () => {
  const base = rep([s("fixture:a", 3, 1), s("edgar:x", 2, 5), s("edgar:y", 0, 4, 1)]);

  it("splits by manifest and totals by class", () => {
    expect(base.totals.DEV).toMatchObject({ sources: 1, total: 4, COVERAGE_GAP: 3 });
    expect(base.totals.HELDOUT).toMatchObject({ sources: 2, total: 12, DISCOVERY_GAP: 9, UNSUPPORTED_SEMANTICS: 1 });
  });

  it("passes when nothing changes", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 3, 1), s("edgar:x", 2, 5), s("edgar:y", 0, 4, 1)]));
    expect(g.pass).toBe(true);
    expect(g.deltas).toEqual([]);
  });

  it("fails on an injected HELDOUT regression and reports the per-source delta", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 3, 1), s("edgar:x", 2, 6), s("edgar:y", 0, 4, 1)]));
    expect(g.pass).toBe(false);
    expect(g.reasons[0]).toMatch(/HELDOUT errors increased 12 → 13/);
    expect(g.deltas).toEqual([
      expect.objectContaining({ sourceId: "edgar:x", split: "HELDOUT", delta: 1, byClass: { DISCOVERY_GAP: 1 } }),
    ]);
  });

  it("passes on a HELDOUT improvement even if DEV moves", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 9, 1), s("edgar:x", 1, 5), s("edgar:y", 0, 4, 1)]));
    expect(g.pass).toBe(true);
    expect(g.heldoutAfter).toBe(11);
  });

  it("fails closed when a HELDOUT source disappears", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 3, 1), s("edgar:x", 2, 5)]));
    expect(g.pass).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/missing/);
  });

  it("scoreSource is deterministic on a tiny real input", () => {
    const input = {
      source: { sourceId: "edgar:t", contentSha256: null },
      documentText:
        "Section 7.01 Indebtedness. The Borrower shall not incur any Indebtedness, except: (a) Indebtedness in an aggregate principal amount not to exceed $25,000,000; and (b) other Indebtedness not to exceed the greater of $10,000,000 and 5% of Total Assets.",
      candidates: [{ candidateId: "c1", sourceId: "edgar:t", family: "DEBT", excerpt: "a covenant limb that appears nowhere in the citations at all" }],
      definitions: [],
      conditions: [],
    };
    const a = scoreSource(input, emptyRuleSet(0), manifest);
    const b = scoreSource(input, emptyRuleSet(0), manifest);
    expect(a).toEqual(b);
    expect(a.split).toBe("HELDOUT");
    expect(a.counts.DISCOVERY_GAP).toBeGreaterThanOrEqual(1);
  });
});

describe("issuer split + duplicates (reviewer notes on #364)", () => {
  const m: DevManifest = {
    description: "t",
    sourceIds: ["fixture:chwy"],
    devIssuerCiks: [
      { cik: "0000816956", issuer: "CNMD", evidence: "t" },
      { cik: "0000703604", issuer: "DSGR", evidence: "t" },
    ],
    duplicates: [{ sourceId: "edgar:chwy-doc-a", duplicateOf: "fixture:chwy", evidence: "same doc" }],
  };
  it("splits by CIK: null-ticker rows of a DEV issuer are DEV (the 3 reviewer leaks)", () => {
    expect(splitFor("edgar:0001193125-21-217426:d170717dex101.htm", m, "0000816956")).toBe("DEV");
    expect(splitFor("edgar:0001193125-22-169336:d320648dex1025.htm", m, "816956")).toBe("DEV");
    expect(splitFor("edgar:0001193125-23-163984:d511994dex101.htm", m, "0000703604")).toBe("DEV");
    expect(splitFor("fixture:anything", m, "0000000000")).toBe("DEV");
    expect(splitFor("research:y", m, "0000000000")).toBe("HELDOUT");
    expect(splitFor("edgar:z", m, "0000051143")).toBe("HELDOUT");
  });
  it("lists duplicates but excludes them from totals", () => {
    const r = aggregate(
      [
        { sourceId: "fixture:chwy", split: "DEV", counts: { ...emptyCounts(), DISCOVERY_GAP: 2 }, total: 2 },
        { sourceId: "edgar:chwy-doc-a", split: "DEV", duplicateOf: "fixture:chwy", counts: { ...emptyCounts(), DISCOVERY_GAP: 9 }, total: 9 },
      ],
      { mode: "snapshot", rulesetVersion: 2 },
    );
    expect(r.totals.DEV.total).toBe(2);
    expect(r.duplicates).toEqual([{ sourceId: "edgar:chwy-doc-a", duplicateOf: "fixture:chwy", total: 9 }]);
  });
});

describe("fetchDocumentText surfaces Neon errors", () => {
  it("throws (redacted) instead of returning null on executor failure; null only when the row is absent", async () => {
    const { fetchDocumentText } = await import("@/lib/covenant-learning-factory/sweep/neon-load");
    const failing = { execute: async () => { throw new Error("boom postgresql://u:p@host/db"); } } as never;
    await expect(fetchDocumentText(failing, { sourceId: "s", contentSha256: "h" })).rejects.toThrow(/fetchDocumentText\(s\) failed: boom \[URL\]/);
    const empty = { execute: async () => [] } as never;
    await expect(fetchDocumentText(empty, { sourceId: "s", contentSha256: "h" })).resolves.toBeNull();
  });
});

describe("SEC backfill linkage (fetchDocumentText)", () => {
  it("falls back to backfilled text only for BYTES_VERIFIED/TEXT_VERIFIED unless CLF_UNVERIFIED_TEXT=1", async () => {
    const { fetchDocumentText } = await import("../../lib/covenant-learning-factory/sweep/neon-load");
    const calls: { sql: string; params?: unknown[] }[] = [];
    const ex = {
      execute: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return sql.includes("kf_source_text_backfill") ? [{ text: "body" }] : [];
      },
    };
    const src = { sourceId: "s", contentSha256: "h" };
    delete process.env.CLF_UNVERIFIED_TEXT;
    expect(await fetchDocumentText(ex, src)).toBe("body");
    expect(calls[1]!.params![1]).toEqual(["BYTES_VERIFIED", "TEXT_VERIFIED"]);
    process.env.CLF_UNVERIFIED_TEXT = "1";
    await fetchDocumentText(ex, src);
    expect(calls[3]!.params![1]).toContain("UNVERIFIED_TEXT");
    delete process.env.CLF_UNVERIFIED_TEXT;
  });
});
