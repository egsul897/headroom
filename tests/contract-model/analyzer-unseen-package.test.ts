/**
 * Phase C0 Task 5/8/9 - runs the analyzer vertical slice blind against the
 * real unseen FWRG package and grades it, per-provision, against the
 * independent human ground truth (human-ground-truth.ts, read ONLY here -
 * never by lib/contract-model/analyzer/**).
 *
 * HONESTY NOTE (see docs/phase-c0-validation-spike.md §H/§N for the full
 * account): this sandbox has neither AI_GATEWAY_API_KEY nor
 * ANTHROPIC_API_KEY, so this test exercises SyntheticContractAnalyzer - a
 * deterministic, single-pattern regex analyzer - NOT the real
 * AnthropicContractAnalyzer/VercelAIGatewayContractAnalyzer code path. That
 * real-LLM code path is written, type-checked, and reuses the exact same
 * transport convention already proven live in production for document
 * extraction (docs/vercel-ai-gateway-extraction.md), but was NOT executed
 * against this package in this session - doing so would require live
 * production credentials this task was not authorized to use. This test's
 * real, honestly-reported numbers below describe the deterministic
 * baseline's actual recall/error profile, not a claim about the real
 * model's - that is the central open question the final verdict must
 * reflect as unresolved, not paper over.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SyntheticContractAnalyzer } from "../../lib/contract-model/analyzer/synthetic-analyzer";
import { evaluateAll } from "../../lib/contract-model/analyzer/evaluator";
import { HUMAN_PROVISIONS, TOTAL_MATERIAL_PROVISIONS } from "../fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth";

const FIXTURE_DIR = path.join(__dirname, "../fixtures/unseen-packages/fwrg-2021-credit-agreement");

describe("Analyzer vertical slice run blind against the real unseen FWRG package (Task 5/8/9)", () => {
  it("SyntheticContractAnalyzer baseline: real, observed per-provision outcomes against the human ground truth - not assumed, not tuned to this test after the fact", async () => {
    const documentText = fs.readFileSync(path.join(FIXTURE_DIR, "article-6-negative-covenants.txt"), "utf8");
    const definitionsText = fs.readFileSync(path.join(FIXTURE_DIR, "definitions-excerpt.txt"), "utf8");

    const analyzer = new SyntheticContractAnalyzer();
    const result = await analyzer.analyze({ documentText, definitionsText });

    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.definedTerms.length).toBe(0); // SyntheticContractAnalyzer never attempts defined-term extraction - documented limitation.

    const summary = evaluateAll(HUMAN_PROVISIONS, result.rules);
    expect(summary.total).toBe(TOTAL_MATERIAL_PROVISIONS);

    // Real, observed numbers (docs/phase-c0-validation-spike.md §J carries the full
    // per-provision breakdown) - asserted exactly so a future change to the
    // synthetic analyzer, evaluator, or ontology mapping that shifts this baseline
    // is caught rather than silently drifting. This baseline is NOT tuned toward
    // these numbers after the fact: the only fixes ever applied once this test
    // first ran were (1) correcting a real bug (every match was mistagged with
    // the same covenantFamily via a hardcoded string) using a generic section-
    // to-family table, and (2) the Phase 1B ground-truth adjudication (see
    // human-ground-truth.ts's own fwrg-6.10-a comment) removing an incorrectly-
    // authored formulaRef expectation from a pure maintenance ratio test -
    // which is why fwrg-6.10-a now correctly resolves instead of being counted
    // dangerous-unflagged, moving one provision from unflagged to correct.
    expect(summary.matchedCorrect).toBe(2);
    expect(summary.matchedIncorrectFlagged).toBe(9);
    expect(summary.matchedIncorrectUnflagged).toBe(1);
    expect(summary.missing).toBe(6);

    // The remaining dangerous-unflagged case is the equity cure right
    // (fwrg-6.10-c, where a nearby ratio number is misread as this
    // provision's own threshold) - a real instance of
    // nearestPrecedingSection's naive "closest preceding marker" heuristic
    // mis-attributing a match to the wrong clause when the source text
    // contains internal cross-references - a generalizable risk for ANY
    // extractor (not only this toy one) working over densely cross-
    // referenced legal text, worth carrying into the Phase C architecture
    // decision (docs/phase-c0-validation-spike.md §R).
    const dangerousIds = summary.results.filter((r) => r.outcome === "MATCHED_INCORRECT_UNFLAGGED").map((r) => r.provisionId);
    expect(dangerousIds.sort()).toEqual(["fwrg-6.10-c"]);
  });

  it("blind evaluator itself correctly distinguishes a confidently-wrong (dangerous-unflagged) rule from a hedged (dangerous-flagged) one, given synthetic fixtures unrelated to the real ground truth", () => {
    const ground = [{ id: "t1", sourceSectionRef: "9.99(a)", realFigures: ["$5,000,000"], family: "INDEBTEDNESS", conditionTypes: [] }];

    const confidentlyWrong = evaluateAll(ground, [
      { covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], thresholdValue: 999, conditions: [], exceptions: [], sourceSectionRef: "9.99(a)", definedTermRefs: [] },
    ]);
    expect(confidentlyWrong.matchedIncorrectUnflagged).toBe(1);
    expect(confidentlyWrong.matchedIncorrectFlagged).toBe(0);

    const hedged = evaluateAll(ground, [
      { covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "JUDGMENT_REQUIRED", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], thresholdValue: 999, conditions: [], exceptions: [], sourceSectionRef: "9.99(a)", definedTermRefs: [] },
    ]);
    expect(hedged.matchedIncorrectFlagged).toBe(1);
    expect(hedged.matchedIncorrectUnflagged).toBe(0);
  });
});
