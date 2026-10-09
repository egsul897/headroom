/**
 * Structured analytical gap detection from exercise executions.
 * Distinguishes software defects from document-absent / customer-input-absent gaps.
 */

import type {
  AnalyticalGap,
  ExerciseDefinition,
  ExerciseExecutionResult,
  GapCategory,
  GapOrigin,
} from "./types";

function gap(
  category: GapCategory,
  origin: GapOrigin,
  message: string,
  extra?: Partial<AnalyticalGap>,
): AnalyticalGap {
  return { category, origin, message, ...extra };
}

export function diagnoseExerciseResult(params: {
  exercise: ExerciseDefinition;
  result: ExerciseExecutionResult;
  availableCategories: string[];
  hasFinancialSnapshot: boolean;
}): AnalyticalGap[] {
  const { exercise, result, availableCategories, hasFinancialSnapshot } = params;
  const gaps: AnalyticalGap[] = [...result.gaps];
  const sourceId = result.sourceId;

  if (result.outcome === "FAILED" && result.itemCountMatched === 0) {
    gaps.push(
      gap("DOCUMENT_PARSE_FAILURE", "SOFTWARE", "Exercise failed with no matched summary items", {
        exerciseId: exercise.exerciseId,
        sourceId,
      }),
    );
  }

  for (const cat of exercise.requiredCategories) {
    if (!availableCategories.includes(cat)) {
      // Category absent from the document model — not a retrieval bug.
      gaps.push(
        gap(
          "MISSING_COVENANT",
          "DOCUMENT_ABSENT",
          `No analyzed provisions in category ${cat} for this document`,
          { exerciseId: exercise.exerciseId, sourceId },
        ),
      );
    }
  }
  const requiredPresent = exercise.requiredCategories.filter((c) => availableCategories.includes(c));
  if (
    requiredPresent.length > 0 &&
    result.outcome !== "UNSUPPORTED" &&
    result.outcome !== "FAILED" &&
    result.restrictions.length === 0 &&
    result.permissions.length === 0 &&
    result.citations.length === 0
  ) {
    gaps.push(
      gap(
        "RETRIEVAL_MISS",
        "SOFTWARE",
        `Document has ${requiredPresent.join(", ")} but Ask returned no restrictions/permissions/citations`,
        { exerciseId: exercise.exerciseId, sourceId },
      ),
    );
  }

  if (result.citations.length === 0 && result.outcome !== "UNSUPPORTED") {
    gaps.push(
      gap("CITATION_MISMATCH", "SOFTWARE", "Substantive analysis produced without section citations", {
        exerciseId: exercise.exerciseId,
        sourceId,
      }),
    );
  }

  if (result.baskets.length === 0 && exercise.tags.some((t) => /basket|grower|fixed|builder|ratio/.test(t))) {
    if (availableCategories.some((c) => /DEBT|LIEN|RESTRICTED|BASKET/.test(c))) {
      gaps.push(
        gap("BASKET_NOT_EXTRACTED", "SOFTWARE", "Expected basket language was not segmented from matching provisions", {
          exerciseId: exercise.exerciseId,
          sourceId,
        }),
      );
    } else {
      gaps.push(
        gap("MISSING_COVENANT", "DOCUMENT_ABSENT", "Document lacks basket-bearing covenant categories for this exercise", {
          exerciseId: exercise.exerciseId,
          sourceId,
        }),
      );
    }
  }

  const needsDefs = /definition|ratio|leverage|coverage|builder|available amount|secured debt|ebitda/i.test(
    `${exercise.question} ${exercise.title}`,
  );
  if (needsDefs && result.definitions.length === 0 && result.itemCountMatched > 0) {
    gaps.push(
      gap("DEFINITION_NOT_RESOLVED", "SOFTWARE", "Material definitions were not attached to the exercise answer", {
        exerciseId: exercise.exerciseId,
        sourceId,
      }),
    );
  }

  for (const input of exercise.requiredFinancialInputs) {
    if (result.missingInputs.includes(input) || (!hasFinancialSnapshot && exercise.requiredFinancialInputs.length > 0)) {
      if (!gaps.some((g) => g.category === "FINANCIAL_INPUT_MISSING" && g.message.includes(input))) {
        gaps.push(
          gap(
            "FINANCIAL_INPUT_MISSING",
            "CUSTOMER_INPUT_ABSENT",
            `Financial input "${input}" absent — formula may be expressed conditionally`,
            { exerciseId: exercise.exerciseId, sourceId },
          ),
        );
      }
    }
  }

  if (
    exercise.tags.includes("shared") ||
    /shared capacity|shared basket|aggregate/i.test(exercise.question)
  ) {
    if (!/shared|aggregate/i.test(result.analysis + result.permissions.join(" "))) {
      gaps.push(
        gap("SHARED_CAPACITY_NOT_MODELED", "SOFTWARE", "Shared-capacity interactions not surfaced in analysis", {
          exerciseId: exercise.exerciseId,
          sourceId,
        }),
      );
    }
  }

  if (result.alternatives.length > 1) {
    gaps.push(
      gap("CONFLICTING_INTERPRETATIONS", "AMBIGUITY", "Multiple plausible interpretations identified for counsel selection", {
        exerciseId: exercise.exerciseId,
        sourceId,
      }),
    );
  }

  if (
    result.outcome === "CONDITIONAL" &&
    exercise.amountMillions != null &&
    !result.conditionalFormula &&
    result.missingInputs.length === 0 &&
    hasFinancialSnapshot
  ) {
    gaps.push(
      gap("CALCULATION_UNSUPPORTED", "SOFTWARE", "Amount-based exercise remained conditional despite financial snapshot", {
        exerciseId: exercise.exerciseId,
        sourceId,
      }),
    );
  }

  if (/amendment|precedence/i.test(exercise.question) && /unresolved|precedence/i.test(result.analysis)) {
    gaps.push(
      gap("AMENDMENT_PRECEDENCE_UNRESOLVED", "AMBIGUITY", "Amendment operative precedence remains unresolved", {
        exerciseId: exercise.exerciseId,
        sourceId,
      }),
    );
  }

  // Deduplicate by category+message
  const seen = new Set<string>();
  return gaps.filter((g) => {
    const k = `${g.category}|${g.message}|${g.exerciseId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function gapHistogram(gaps: AnalyticalGap[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const g of gaps) {
    h[g.category] = (h[g.category] ?? 0) + 1;
  }
  return h;
}

export function groupGapsByCause(gaps: AnalyticalGap[]): Array<{
  category: GapCategory;
  origin: GapOrigin;
  count: number;
  exerciseIds: string[];
  sourceIds: string[];
}> {
  const map = new Map<string, AnalyticalGap[]>();
  for (const g of gaps) {
    const k = `${g.category}|${g.origin}`;
    const arr = map.get(k) ?? [];
    arr.push(g);
    map.set(k, arr);
  }
  return [...map.entries()]
    .map(([, arr]) => ({
      category: arr[0]!.category,
      origin: arr[0]!.origin,
      count: arr.length,
      exerciseIds: [...new Set(arr.map((a) => a.exerciseId).filter(Boolean) as string[])],
      sourceIds: [...new Set(arr.map((a) => a.sourceId).filter(Boolean) as string[])],
    }))
    .sort((a, b) => b.count - a.count);
}
