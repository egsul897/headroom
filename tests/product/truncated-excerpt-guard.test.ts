/**
 * Rule 192 (guard half) — a formula must not be minted from a
 * truncated excerpt. The candidate excerpt is capped at 4000
 * chars; when the operative span runs past the cap, tail
 * clauses are missing. Aon 6.11 minted a FLAT $5M LIEN
 * Permission from an early clause while the (t) greater-of
 * basket sat beyond the cap. The candidate carries
 * excerptTruncated, the analyzer discloses it, and the
 * compiler fails closed — except for EDITED items, where
 * counsel supplied the controlling text.
 */
import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function analyze(excerpt: string, excerptTruncated?: boolean) {
  const candidate: CovenantCandidateRecord = {
    candidateId: "c1",
    sourceId: "src",
    nodeId: undefined,
    families: ["INDEBTEDNESS"],
    signals: [],
    excerpt,
    excerptTruncated,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 5,
  };
  return analyzeProvision({
    sourceId: "src",
    documentTitle: "Indenture",
    candidate,
    definitions: [],
    structuralNodes: [],
  });
}

describe("Rule 192: truncated-excerpt guard (analyzer half)", () => {
  it("flags a truncated excerpt and discloses it", () => {
    const a = analyze(
      "Section 6.11. Liens. The Parent will not create any Lien except: (a) Liens for taxes; (b) Liens securing Indebtedness not to exceed $5,000,000.",
      true,
    );
    expect(a.operativeExcerptTruncated).toBe(true);
    expect(a.unresolved.some((u) => /truncated at 4000/i.test(u))).toBe(true);
  });

  it("leaves an untruncated excerpt unflagged", () => {
    const a = analyze(
      "Section 6.11. Liens. The Parent will not create any Lien except: (a) Liens for taxes.",
      false,
    );
    expect(a.operativeExcerptTruncated).toBe(false);
    expect(a.unresolved.some((u) => /truncated at 4000/i.test(u))).toBe(false);
  });
});
