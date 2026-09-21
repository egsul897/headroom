/**
 * Phase 3 residual forensics — the I27 "Notwithstanding" false gap.
 *
 * An override operator strands a residual fragment at Pass A. The frozen
 * behaviour left EVERY such fragment UNACCOUNTED_SOURCE, on the stated
 * ground that an override's complement — the provision being disapplied —
 * "lives elsewhere in the agreement", so covering the text that follows the
 * operator does not account for the override.
 *
 * That reasoning is right in general and wrong in the one case where the
 * disapplied provision is NAMED in the immediately following, already-
 * inventoried span. Then the override relationship is accounted for: both
 * operands are present and inventoried.
 *
 * These tests pin the distinction. The safety property — a dangling override
 * whose target is not named stays a review gap — is asserted alongside the
 * fix so it cannot be lost later.
 */
import { describe, expect, it } from "vitest";

import { computeSourceCoverage, isBareOverrideOperator } from "../../../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { CORPUS } from "./corpus";
import { buildScenario } from "./harness";

describe("override-operator ownership (I27 residual)", () => {
  it("REGRESSION: an override operator whose disapplied provision is named in the next inventoried span is accounted for", async () => {
    const scenario = CORPUS.find((s) => s.id === "I27")!;
    const built = await buildScenario(scenario);
    const inv = built.inventory as unknown as { inventoryStatus: string; unaccountedSource: { excerpt: string }[] };
    expect(inv.unaccountedSource.map((u) => u.excerpt)).toEqual([]);
    expect(inv.inventoryStatus).toBe("INVENTORY_OK");
  });

  it("the override operator is dispositioned explicitly, not silently dropped", async () => {
    const scenario = CORPUS.find((s) => s.id === "I27")!;
    const built = await buildScenario(scenario);
    const cov = (built.inventory as unknown as { sourceCoverage: { countsByDisposition: Record<string, number> } }).sourceCoverage;
    expect(cov.countsByDisposition.UNACCOUNTED_SOURCE).toBe(0);
    expect(cov.countsByDisposition.COVERED_BY_OVERRIDE_OPERATOR_OWNERSHIP).toBeGreaterThan(0);
  });
});

/**
 * Unit-level probes over invented text. These never touch a real package and
 * use section numbers that appear in no fixture.
 */
describe("override-operator ownership — generic behaviour", () => {
  const dispositionOf = (text: string, covered: { start: number; end: number }[], fragment: string) => {
    const result = computeSourceCoverage({
      regions: [{ regionId: "operative", documentId: "synthetic-doc", sourceNodeId: "n1", sectionRef: "44.44", charStart: 0, charEnd: text.length, text, kind: "OPERATIVE" }],
      spans: covered.map((c) => ({ regionId: "operative", charStart: c.start, charEnd: c.end, materiality: "CRITICAL" })),
    } as never) as unknown as { spans: { excerpt: string; disposition: string }[] };
    return result.spans.find((sp) => sp.excerpt.trim() === fragment)?.disposition ?? `(no span; saw ${JSON.stringify(result.spans.map((x) => x.excerpt))})`;
  };

  it("discharges the operator when the complement names a provision", () => {
    const text = "Notwithstanding any failure to comply with Section 44.40, the Borrower may cure.";
    expect(dispositionOf(text, [{ start: 16, end: 56 }], "Notwithstanding")).toBe("COVERED_BY_OVERRIDE_OPERATOR_OWNERSHIP");
  });

  it("SAFETY: leaves the operator unaccounted when the complement names no provision", () => {
    const text = "Notwithstanding anything to the contrary, the Borrower may cure.";
    expect(dispositionOf(text, [{ start: 16, end: 40 }], "Notwithstanding")).toBe("UNACCOUNTED_SOURCE");
  });

  it("SAFETY: nothing is discharged when the complement is not inventoried at all", () => {
    const text = "Notwithstanding any failure to comply with Section 44.40, the Borrower may cure.";
    expect(dispositionOf(text, [], text)).toBe("UNACCOUNTED_SOURCE");
  });

  it("SAFETY: a fragment carrying its own provision reference is not a bare operator", () => {
    const text = "Notwithstanding Section 44.40 the Borrower may cure.";
    expect(dispositionOf(text, [{ start: 30, end: 51 }], "Notwithstanding Section 44.40")).toBe("UNACCOUNTED_SOURCE");
  });

  it("SAFETY: the fragment guards reject anything that carries content of its own", () => {
    const none: never[] = [];
    expect(isBareOverrideOperator("Notwithstanding", none)).toBe(true);
    expect(isBareOverrideOperator("Regardless", none)).toBe(true);
    // carries its own provision reference
    expect(isBareOverrideOperator("Notwithstanding Section 44.40", none)).toBe(false);
    // carries a figure
    expect(isBareOverrideOperator("Notwithstanding 5", none)).toBe(false);
    // carries a quoted defined term
    expect(isBareOverrideOperator('Notwithstanding "Permitted Liens"', none)).toBe(false);
    // carries a located quantitative value
    expect(isBareOverrideOperator("Notwithstanding", [{ charStart: 0, charEnd: 1 }] as never)).toBe(false);
    // is not an override operator at all
    expect(isBareOverrideOperator("provided that", none)).toBe(false);
    expect(isBareOverrideOperator("the Borrower", none)).toBe(false);
  });

  it("SAFETY: the operator stays a gap when its complement names no provision", () => {
    const text = "Notwithstanding anything to the contrary, the Borrower may cure.";
    expect(dispositionOf(text, [{ start: 16, end: 40 }], "Notwithstanding")).toBe("UNACCOUNTED_SOURCE");
  });

  it("behaves identically on an unseen identifier shape", () => {
    const a = "Notwithstanding any failure to comply with Section 44.40, the Borrower may cure.";
    const b = "Notwithstanding any failure to comply with Clause qq.zz, the Borrower may cure.";
    expect(dispositionOf(b, [{ start: 16, end: 55 }], "Notwithstanding")).toBe(dispositionOf(a, [{ start: 16, end: 56 }], "Notwithstanding"));
  });
});
