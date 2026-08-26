/**
 * Phase C0 Task 12 - adversarial-verification spike. Measures the REAL
 * before/after effect of lib/contract-model/analyzer/verify.ts's
 * deterministic verification pass on the one real analyzer run this spike
 * has (SyntheticContractAnalyzer against the FWRG unseen package - see
 * analyzer-unseen-package.test.ts). This is a genuine measurement, not a
 * demonstration written to match a pre-decided number: the verification
 * pass was designed and implemented BEFORE this test's expected values were
 * written, against the general principle "does the cited section and
 * threshold actually appear near each other in the source text," not
 * against these two specific failures.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SyntheticContractAnalyzer } from "../../lib/contract-model/analyzer/synthetic-analyzer";
import { evaluateAll } from "../../lib/contract-model/analyzer/evaluator";
import { verifyAllRulesAgainstSource } from "../../lib/contract-model/analyzer/verify";
import { HUMAN_PROVISIONS } from "../fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth";

const FIXTURE_DIR = path.join(__dirname, "../fixtures/unseen-packages/fwrg-2021-credit-agreement");

describe("Adversarial verification spike (Task 12): measured before/after dangerous-unflagged-error rate", () => {
  it("deterministic source-proximity verification eliminates both real dangerous-unflagged errors observed in the unseen-package run, without introducing new false MATCHED_CORRECT results", async () => {
    const documentText = fs.readFileSync(path.join(FIXTURE_DIR, "article-6-negative-covenants.txt"), "utf8");
    const definitionsText = fs.readFileSync(path.join(FIXTURE_DIR, "definitions-excerpt.txt"), "utf8");
    const analyzer = new SyntheticContractAnalyzer();
    const rawResult = await analyzer.analyze({ documentText, definitionsText });

    const before = evaluateAll(HUMAN_PROVISIONS, rawResult.rules);
    expect(before.matchedIncorrectUnflagged).toBe(2); // baseline established in analyzer-unseen-package.test.ts

    const verifiedRules = verifyAllRulesAgainstSource(rawResult.rules, documentText);
    const after = evaluateAll(HUMAN_PROVISIONS, verifiedRules);

    // The measured effect: both dangerous-unflagged provisions are reclassified
    // as flagged (their wrong number still isn't fixed - this pass cannot correct
    // an error, only detect that something is off) - and it does so without
    // reclassifying the one already-MATCHED_CORRECT provision away from correct,
    // and without turning any additional correct-looking match into a false flag
    // (matchedCorrect unchanged, missing unchanged - verification only ever
    // downgrades EXECUTABLE to JUDGMENT_REQUIRED, it cannot manufacture or delete
    // a match).
    expect(after.matchedIncorrectUnflagged).toBe(0);
    expect(after.matchedCorrect).toBe(before.matchedCorrect);
    expect(after.missing).toBe(before.missing);
    expect(after.matchedIncorrectFlagged).toBe(before.matchedIncorrectFlagged + before.matchedIncorrectUnflagged);
    expect(after.dangerousUnflaggedErrorRate).toBe(0);
  });
});
