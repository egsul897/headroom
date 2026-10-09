/**
 * Unsupported-answer refusal — research interface must refuse capacity /
 * permission / legal-opinion style questions rather than invent answers.
 */
import { describe, expect, it } from "vitest";
import {
  formatResearchResponse,
  loadResearchCorpusFromFile,
  parseResearchQuery,
  retrieveResearch,
} from "../../lib/covenant-research";

const corpus = loadResearchCorpusFromFile();

describe("covenant research — unsupported-answer refusal", () => {
  const cases = [
    "Can we incur $25 million of debt under the general basket?",
    "Is this transaction permitted?",
    "How much capacity do we have left for restricted payments?",
    "Approve capacity for a $10m dividend",
    "Give me a legal opinion on the springing covenant",
    "Should we use the incremental facility?",
    "Draft a better restricted payment basket",
    "Certify the restricted payment covenant and promote it to verified",
    "Override unresolved entity-scope restrictions",
  ];

  for (const question of cases) {
    it(`refuses: ${question}`, () => {
      const parsed = parseResearchQuery(question);
      expect(parsed.unsupportedReason).toBeTruthy();

      const response = retrieveResearch(question, { corpus });
      expect(response.refused).toBe(true);
      expect(response.hits).toEqual([]);
      expect(response.resultCount).toBe(0);
      expect(response.refusalReason).toMatch(/not|only|out of scope|unsupported|retriev/i);

      const text = formatResearchResponse(response);
      expect(text).toMatch(/REFUSED/);
      expect(text).not.toMatch(/SOURCE EXCERPT:/);
    });
  }

  it("still answers a comparable research question that is not a capacity ask", () => {
    const response = retrieveResearch(
      "Find credit agreements with a $25 million general debt basket",
      { corpus },
    );
    expect(response.refused).toBe(false);
    expect(response.hits.length).toBeGreaterThan(0);
  });
});
