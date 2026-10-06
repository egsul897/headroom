import { describe, expect, it } from "vitest";
import { computeEligibilityBlockers } from "../../scripts/stratified-cert/lib/emit-pin-packet";

describe("computeEligibilityBlockers (packet honesty)", () => {
  const clean = {
    identityOk: true,
    interimBHit: false,
    governingReview: false,
    hasUnresolvedOperativeEvidence: false,
    directMentions: [] as { directlyReferencedBySection: boolean; definedTermMentionedInOperativeText: boolean }[],
  };

  it("eligible path: empty blockers", () => {
    const blockers = computeEligibilityBlockers(clean);
    expect(blockers).toEqual([]);
    expect(blockers.length === 0).toBe(true);
  });

  it("mention-hit → PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE and not eligible", () => {
    const blockers = computeEligibilityBlockers({
      ...clean,
      directMentions: [
        { directlyReferencedBySection: true, definedTermMentionedInOperativeText: false },
      ],
    });
    expect(blockers).toContain("PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE");
    expect(blockers.length).toBeGreaterThan(0);
    // Invariant used by emitter after identityOk: eligible === (blockers.length === 0)
    const eligible = blockers.length === 0;
    expect(eligible).toBe(false);
  });

  it("defined-term mention-hit also blocks", () => {
    const blockers = computeEligibilityBlockers({
      ...clean,
      directMentions: [
        { directlyReferencedBySection: false, definedTermMentionedInOperativeText: true },
      ],
    });
    expect(blockers).toEqual(["PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE"]);
  });

  it("eligible === (blockers.length === 0) across predicates", () => {
    const cases = [
      clean,
      { ...clean, interimBHit: true },
      { ...clean, governingReview: true },
      { ...clean, hasUnresolvedOperativeEvidence: true },
      {
        ...clean,
        directMentions: [{ directlyReferencedBySection: true, definedTermMentionedInOperativeText: false }],
      },
      { ...clean, identityOk: false },
    ];
    for (const c of cases) {
      const blockers = computeEligibilityBlockers(c);
      const eligible = blockers.length === 0;
      expect(eligible).toBe(blockers.length === 0);
      if (!c.identityOk || c.interimBHit || c.governingReview || c.hasUnresolvedOperativeEvidence || c.directMentions.some((m) => m.directlyReferencedBySection || m.definedTermMentionedInOperativeText)) {
        expect(eligible).toBe(false);
        expect(blockers.length).toBeGreaterThan(0);
      }
    }
  });
});
