import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import {
  EXERCISE_LIBRARY,
  diagnoseExerciseResult,
  executeExerciseOnSource,
  buildContextFromSummary,
  seedDraftingPatterns,
  gapHistogram,
  upsertEngineeringTasks,
  LOOP_STAGES,
} from "../../lib/product/covenant-intelligence-loop";

const CONMED_VII = readFileSync(
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  "utf8",
);

function conmedSummary() {
  const sourceId = "fixture:conmed-article-vii-loop";
  const structural = extractStructure(sourceId, CONMED_VII);
  const definitions = discoverDefinitions(sourceId, CONMED_VII, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, CONMED_VII);
  const candidates = discoverCovenantCandidates(sourceId, CONMED_VII, structural.nodes);
  return buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "CONMED Eighth A&R Credit Agreement (Article VII curated)",
    issuerName: "CONMED Corporation",
    issuerCik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });
}

describe("covenant intelligence loop", () => {
  it("ships the required initial exercise library size", () => {
    expect(EXERCISE_LIBRARY.length).toBeGreaterThanOrEqual(45);
    expect(EXERCISE_LIBRARY.some((e) => e.exerciseId === "debt.secured.100")).toBe(true);
    expect(LOOP_STAGES).toEqual([
      "INGEST",
      "STRUCTURE",
      "INTERPRET",
      "COMPILE",
      "EXERCISE",
      "DIAGNOSE",
      "IMPROVE",
      "REEXERCISE",
      "PUBLISH",
    ]);
  });

  it("executes the $100M secured-debt vertical slice on CONMED fixture", () => {
    const summary = conmedSummary();
    const exercise = EXERCISE_LIBRARY.find((e) => e.exerciseId === "debt.secured.100")!;
    const ctx = buildContextFromSummary({
      sourceId: summary.sourceId,
      summary,
      hasFinancialSnapshot: false,
    });
    const result = executeExerciseOnSource({
      exercise,
      ctx,
      runId: "test-vertical-slice",
    });

    expect(["SUBSTANTIVE", "CONDITIONAL"]).toContain(result.outcome);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.analysis.toLowerCase()).toMatch(/lien|indebtedness|secured|prohibit|except/);
    expect(result.missingInputs).toEqual(expect.arrayContaining(["totalDebt", "securedDebt", "ebitda"]));
    expect(result.conditionalFormula || result.supportedAmountNote).toBeTruthy();
    expect(result.gaps.some((g) => g.category === "FINANCIAL_INPUT_MISSING")).toBe(true);
    expect(result.gaps.every((g) => g.category !== "FINANCIAL_INPUT_MISSING" || g.origin === "CUSTOMER_INPUT_ABSENT")).toBe(
      true,
    );
  });

  it("diagnoses gaps and seeds drafting patterns without treating missing financials as software defects", () => {
    const summary = conmedSummary();
    const exercise = EXERCISE_LIBRARY.find((e) => e.exerciseId === "debt.secured.100")!;
    const ctx = buildContextFromSummary({ sourceId: summary.sourceId, summary });
    const result = executeExerciseOnSource({ exercise, ctx, runId: "test-diagnose" });
    const gaps = diagnoseExerciseResult({
      exercise,
      result,
      availableCategories: Object.keys(summary.countsByCategory),
      hasFinancialSnapshot: false,
    });
    const hist = gapHistogram(gaps);
    expect(hist.FINANCIAL_INPUT_MISSING).toBeGreaterThan(0);
    const patterns = seedDraftingPatterns();
    expect(patterns.length).toBeGreaterThan(10);
    expect(patterns.some((p) => p.patternId === "greater-of-basket")).toBe(true);

    const tasks = upsertEngineeringTasks({
      gaps,
      results: [result],
      customerImportantExerciseIds: ["debt.secured.100"],
    });
    // Missing financial inputs must not become OPEN software tasks by origin alone
    expect(
      tasks.every(
        (t) => t.category !== "FINANCIAL_INPUT_MISSING" || t.occurrenceCount === 0 || t.status === "WONTFIX",
      ) || !tasks.some((t) => t.category === "FINANCIAL_INPUT_MISSING"),
    ).toBe(true);
  });

  it("runs multiple library families against CONMED without custom per-exercise logic", () => {
    const summary = conmedSummary();
    const ctx = buildContextFromSummary({ sourceId: summary.sourceId, summary });
    const sample = EXERCISE_LIBRARY.filter((e) =>
      ["debt.unsecured.50", "lien.secure_new_debt", "rp.dividend.50", "ratio.total_leverage", "sale.division"].includes(
        e.exerciseId,
      ),
    );
    const results = sample.map((exercise) =>
      executeExerciseOnSource({ exercise, ctx, runId: "test-multi" }),
    );
    expect(results.every((r) => r.analysis.length > 40)).toBe(true);
    expect(results.some((r) => r.citations.length > 0)).toBe(true);
  });
});
