import { describe, expect, it } from "vitest";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";
import ruleset from "@/scripts/covenant-learning-factory/scoreboard/ruleset.json";

describe("learned phrase-pattern captures", () => {
  it("cite the operative occurrence as well as a table-of-contents one", () => {
    const rules = {
      ...(ruleset as any),
      rules: [{ kind: "PHRASE_PATTERN", flags: "i", state: "MECHANICALLY_REPLAYED", effect: { family: "FUNDAMENTAL_CHANGES" }, ruleId: "lr:test", version: 1, metrics: {}, provenance: {}, pattern: "Consolidation, Merger and Sale of Assets" }],
    };
    const text = "TABLE OF CONTENTS Section 4.01 Payment of Notes 30 Section 5.01 Consolidation, Merger and Sale of Assets 33 Section 5.02 Successor Substituted 34 Section 6.01 Events of Default 35\n\n"
      + "x ".repeat(400) + "\n\nSection 5.01 Consolidation, Merger and Sale of Assets. The Company shall not consolidate with or merge into any other Person unless the successor assumes the Notes.";
    const cites = extractBasketClauses({ documentId: "d", text, rules }).filter((c) => c.sectionRef === "learned:PHRASE_PATTERN:lr:test").map((c) => c.operativeText);
    expect(cites.length).toBe(2);
    expect(cites.some((c) => /shall not consolidate/.test(c))).toBe(true);
  });
});
