/**
 * The sweep ledger is selfCheckComputation, not the extractor-local proviso scan.
 * A citation that grew a heading or an "except:" still reflects a precedent limb
 * whose text sits at the marker. The prefix-only check misses that limb.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCovenantComputation } from "@/lib/contract-model/covenant-computation";
import { HIGH_REFUSAL_COVERAGE_MARKER } from "@/lib/covenant-learning-factory/evaluation";
import { buildComputationPackage } from "@/lib/covenant-learning-factory/sweep/build-package";
import {
  COVERAGE_GAP_CONDITION_PREFIX,
  COVERAGE_GAP_OMISSION_PREFIX,
  excerptReflectedByPrefixOnly,
  canonicalFamily,
  sectionNumberOf,
  selfCheckComputation,
} from "@/lib/covenant-learning-factory/sweep/self-check";

function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const FWRG = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt";
const CHWY = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const MTN = "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/doc-b-indenture-2024.txt";
const LSB = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt";
const MHK = "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt";

function sweep(sourceId: string, text: string, candidates: { candidateId: string; excerpt: string; family?: string; sectionRef?: string | null }[], conditions: { conditionId: string; kind: string; excerpt: string }[] = []) {
  const source = { sourceId, ticker: sourceId, companyId: sourceId };
  const rows = candidates.map((c) => ({ family: "DEBT_INCURRENCE", sectionRef: null, ...c, sourceId }));
  const pkg = buildComputationPackage({ source, documentText: text, candidates: rows });
  const result = runCovenantComputation(pkg, { createdAt: "1970-01-01T00:00:00.000Z" });
  const errors = selfCheckComputation({
    packageKey: pkg.packageKey,
    runId: "sweep-metric",
    sourceId,
    result,
    candidates: rows,
    definitions: [],
    conditions: conditions.map((c) => ({ ...c, sourceId })),
    now: "1970-01-01T00:00:00.000Z",
  });
  return { result, errors };
}

/** Precedent row that starts outside the citation and continues at a marker inside it. */
function markerCandidates(sourceId: string, text: string) {
  const { result } = sweep(sourceId, text, []);
  const cites = result.baskets.map((b) => norm(b.citationExcerpt));
  const out: { candidateId: string; excerpt: string; family: string; sectionRef: string }[] = [];
  for (const [bi, cite] of cites.entries()) {
    // Strict matcher: a candidate derived from a basket carries that basket's section and family.
    const basket = result.baskets[bi]!;
    // Structureless "proviso"/OTHER baskets fail closed under the strict matcher (no section, no family).
    if (sectionNumberOf(basket.sectionRef, cite) == null && canonicalFamily(basket.covenantFamily) == null) continue;
    const match = /\([0-9a-z]{1,6}\)\s+/i.exec(cite.slice(0, 240));
    if (!match || match.index == null || match.index < 40) continue;
    const limb = cite.slice(match.index, match.index + 120);
    if (limb.length < 40) continue;
    const excerpt = `stored precedent chapeau before the extracted marker. ${limb}`;
    if (cites.some((other) => excerptReflectedByPrefixOnly(excerpt, other))) continue;
    out.push({ candidateId: `${sourceId}-${out.length}`, excerpt, family: basket.covenantFamily, sectionRef: basket.sectionRef });
    if (out.length >= 8) break;
  }
  return out;
}

describe("sweep self-check metric", () => {
  it("reflects marker limbs the prefix-only check misses, on a credit agreement and an indenture", () => {
    for (const [sourceId, path] of [
      ["fwrg", FWRG],
      ["chwy", CHWY],
      ["mtn-ind-2024", MTN],
    ] as const) {
      const text = readFileSync(path, "utf8");
      const candidates = markerCandidates(sourceId, text);
      expect(candidates.length).toBeGreaterThan(0);
      const { result, errors } = sweep(sourceId, text, candidates);
      const prefixMisses = candidates.filter(
        (c) => !result.baskets.some((b) => excerptReflectedByPrefixOnly(norm(c.excerpt), norm(b.citationExcerpt))),
      ).length;
      const discovery = errors.filter((e) => e.class === "DISCOVERY_GAP").length;
      expect(prefixMisses).toBe(candidates.length);
      expect(discovery).toBe(0);
      expect(discovery).toBeLessThan(prefixMisses);
    }
  });

  it("still records a candidate that no citation contains, and does not add discovery on LSB or MHK clause text", () => {
    const fwrg = readFileSync(FWRG, "utf8");
    const absent = sweep("fwrg", fwrg, [
      {
        candidateId: "absent",
        excerpt: "zz-unmatched precedent limb about underwater baskets not to exceed $1",
      },
    ]);
    expect(absent.errors.some((e) => e.class === "DISCOVERY_GAP" && e.message.startsWith("precedent candidate absent"))).toBe(true);

    for (const [sourceId, path] of [
      ["lsb", LSB],
      ["mhk", MHK],
    ] as const) {
      const text = readFileSync(path, "utf8");
      const { result } = sweep(sourceId, text, []);
      const candidates = result.baskets
        .filter((b) => norm(b.citationExcerpt).length >= 24)
        .slice(0, 12)
        .map((b, i) => ({ candidateId: `${sourceId}-cite-${i}`, excerpt: b.citationExcerpt, family: b.covenantFamily, sectionRef: b.sectionRef }));
      const { errors } = sweep(sourceId, text, candidates);
      expect(errors.filter((e) => e.class === "DISCOVERY_GAP").length).toBe(0);
    }
  });

  it("splits COVERAGE_GAP into the omission emitter and the unbound-exception emitter", () => {
    const omitted = buildComputationPackage({
      source: { sourceId: "omit-src" },
      documentText: null,
      candidates: [{ candidateId: "tiny", sourceId: "omit-src", excerpt: "too short" }],
    });
    const omittedResult = runCovenantComputation(omitted, { createdAt: "1970-01-01T00:00:00.000Z" });
    const omissionErrors = selfCheckComputation({
      packageKey: omitted.packageKey,
      runId: "omit",
      sourceId: "omit-src",
      result: omittedResult,
      candidates: [],
      definitions: [],
      conditions: [],
      now: "1970-01-01T00:00:00.000Z",
    });
    expect(omissionErrors.filter((e) => e.class === "COVERAGE_GAP").map((e) => e.message)[0]).toMatch(
      new RegExp(`^${COVERAGE_GAP_OMISSION_PREFIX}`),
    );

    const text = readFileSync(LSB, "utf8");
    const unbound = sweep("lsb", text, [], [
      {
        conditionId: "cond-missing",
        kind: "proviso",
        excerpt: "zz-unmatched proviso that is long enough to be a self-check condition excerpt",
      },
      {
        conditionId: "cond-present",
        kind: "exception",
        excerpt: "",
      },
    ]);
    const present = sweep("lsb", text, []);
    const cite = present.result.baskets.find((b) => norm(b.citationExcerpt).length >= 40);
    expect(cite).toBeTruthy();
    const bound = sweep("lsb", text, [], [
      { conditionId: "cond-bound", kind: "carve-out", excerpt: cite!.citationExcerpt.slice(0, 80) },
    ]);
    const unboundGaps = unbound.errors.filter((e) => e.message.startsWith(COVERAGE_GAP_CONDITION_PREFIX));
    const boundGaps = bound.errors.filter((e) => e.message.startsWith(COVERAGE_GAP_CONDITION_PREFIX));
    expect(unboundGaps.length).toBe(1);
    expect(boundGaps.length).toBe(0);
    expect(HIGH_REFUSAL_COVERAGE_MARKER).toContain("refused executable");
  });
});
