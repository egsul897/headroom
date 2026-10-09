/**
 * Engineering improvement queue — aggregates recurring analytical failures.
 * Untrusted document content never becomes a development instruction.
 */

import { createHash } from "node:crypto";
import type { AnalyticalGap, EngineeringTask, ExerciseExecutionResult } from "./types";
import { groupGapsByCause } from "./diagnose";
import { loadEngineeringQueue, saveEngineeringQueue } from "./store";

const MODULE_HINTS: Record<string, string[]> = {
  DOCUMENT_PARSE_FAILURE: ["lib/knowledge-factory/pipeline", "lib/product/covenant-intelligence/summarize.ts"],
  SECTION_BOUNDARY_FAILURE: ["lib/knowledge-factory/pipeline/structural.ts"],
  MISSING_COVENANT: ["lib/knowledge-factory/pipeline/candidates.ts", "lib/product/covenant-intelligence/analyze-provision.ts"],
  DEFINITION_NOT_RESOLVED: ["lib/knowledge-factory/pipeline/structural.ts", "lib/product/covenant-intelligence/analyze-provision.ts"],
  CROSS_REFERENCE_NOT_RESOLVED: ["lib/knowledge-factory/pipeline/structural.ts"],
  BASKET_NOT_EXTRACTED: ["lib/product/covenant-intelligence/analyze-provision.ts", "lib/knowledge-factory/patterns/library.ts"],
  FORMULA_NOT_COMPILED: ["lib/covenant-compiler", "lib/product/customer-intelligence/capacity-readiness.ts"],
  ENTITY_SCOPE_UNRESOLVED: ["lib/product/covenant-intelligence/analyze-provision.ts"],
  AMENDMENT_PRECEDENCE_UNRESOLVED: ["lib/product/customer-intelligence/amendment-package.ts", "lib/product/customer-intelligence/operative-resolution.ts"],
  FINANCIAL_INPUT_MISSING: ["lib/product/customer-intelligence/capacity-readiness.ts"],
  SHARED_CAPACITY_NOT_MODELED: ["lib/product/covenant-intelligence/ask-retrieve.ts", "lib/knowledge-factory/patterns/library.ts"],
  RETRIEVAL_MISS: ["lib/product/covenant-intelligence/ask-retrieve.ts"],
  CITATION_MISMATCH: ["lib/product/covenant-intelligence/ask-retrieve.ts", "lib/product/covenant-intelligence/summarize.ts"],
  CALCULATION_UNSUPPORTED: ["lib/product/customer-intelligence/debt-intelligence.ts", "lib/covenant-compiler"],
  CONFLICTING_INTERPRETATIONS: ["lib/product/covenant-intelligence/analyze-provision.ts", "lib/product/customer-intelligence/reviewer-approvals.ts"],
  SOFTWARE_DEFECT: ["lib/product/covenant-intelligence-loop"],
  INFORMATION_ABSENT: [],
};

function taskIdFor(category: string, origin: string): string {
  return createHash("sha1").update(`${category}|${origin}`).digest("hex").slice(0, 12);
}

function priorityScore(count: number, origin: string, category: string): number {
  let p = count * 10;
  if (origin === "SOFTWARE") p += 50;
  if (origin === "AMBIGUITY") p += 10;
  if (origin === "CUSTOMER_INPUT_ABSENT") p -= 20; // not an extraction defect
  if (origin === "DOCUMENT_ABSENT") p -= 10;
  if (/secured|debt\.secured|SHARED|BASKET|RETRIEVAL|CITATION/.test(category)) p += 15;
  return p;
}

export function upsertEngineeringTasks(params: {
  gaps: AnalyticalGap[];
  results: ExerciseExecutionResult[];
  customerImportantExerciseIds?: string[];
}): EngineeringTask[] {
  const existing = loadEngineeringQueue().filter((t) => {
    // Drop legacy document-absent / customer-input tasks — not engineering defects.
    if (t.category === "FINANCIAL_INPUT_MISSING" || t.category === "MISSING_COVENANT" || t.category === "INFORMATION_ABSENT") {
      return false;
    }
    return true;
  });
  const byId = new Map(existing.map((t) => [t.taskId, t]));
  // Only software defects (and recurring ambiguity) enter the engineering queue.
  const groups = groupGapsByCause(params.gaps).filter(
    (g) => g.origin === "SOFTWARE" || (g.origin === "AMBIGUITY" && g.count >= 3),
  );

  const important = new Set(params.customerImportantExerciseIds ?? ["debt.secured.100", "rp.dividend.50"]);
  const now = new Date().toISOString();

  for (const g of groups) {
    if (g.origin === "CUSTOMER_INPUT_ABSENT" || g.origin === "DOCUMENT_ABSENT") continue;

    const id = taskIdFor(g.category, g.origin);
    const sampleResults = params.results.filter(
      (r) => g.exerciseIds.includes(r.exerciseId) && g.sourceIds.includes(r.sourceId),
    );
    const impBonus = g.exerciseIds.some((e) => important.has(e)) ? 25 : 0;
    const priority = priorityScore(g.count, g.origin, g.category) + impBonus;

    const prev = byId.get(id);
    const task: EngineeringTask = {
      taskId: id,
      category: g.category,
      priority,
      title: `[${g.category}] ${g.origin.toLowerCase().replace(/_/g, " ")} — ${g.count} occurrence(s)`,
      affectedSourceIds: [...new Set([...(prev?.affectedSourceIds ?? []), ...g.sourceIds])].slice(0, 40),
      affectedExerciseIds: [...new Set([...(prev?.affectedExerciseIds ?? []), ...g.exerciseIds])].slice(0, 40),
      occurrenceCount: (prev?.occurrenceCount ?? 0) + g.count,
      expectedImprovement: expectedImprovement(g.category),
      relevantModules: MODULE_HINTS[g.category] ?? ["lib/product/covenant-intelligence-loop"],
      reproductionNotes: sampleResults
        .slice(0, 3)
        .map(
          (r) =>
            `exercise=${r.exerciseId} source=${r.sourceId} outcome=${r.outcome} matched=${r.itemCountMatched}`,
        )
        .join(" | "),
      status: prev?.status === "FIXED" ? "OPEN" : prev?.status ?? "OPEN",
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    byId.set(id, task);
  }

  const tasks = [...byId.values()].sort((a, b) => b.priority - a.priority);
  saveEngineeringQueue(tasks);
  return tasks;
}

function expectedImprovement(category: string): string {
  switch (category) {
    case "BASKET_NOT_EXTRACTED":
      return "Segment fixed/grower/ratio baskets from matching provisions with citations.";
    case "RETRIEVAL_MISS":
      return "Improve Ask scoring so required covenant categories surface for the exercise family.";
    case "CITATION_MISMATCH":
      return "Ensure every substantive exercise answer carries sectionRef + excerpt citations.";
    case "SHARED_CAPACITY_NOT_MODELED":
      return "Detect and explain shared debt/lien/RP aggregate caps in exercise output.";
    case "DEFINITION_NOT_RESOLVED":
      return "Attach applicable defined terms from summary items to exercise results.";
    case "FORMULA_NOT_COMPILED":
      return "Compile conditional formulas when basket language is present but financials are absent.";
    case "CALCULATION_UNSUPPORTED":
      return "When financial snapshot exists, produce supported or explicitly blocked calculation paths.";
    default:
      return "Reduce recurrence of this analytical failure class across the corpus.";
  }
}

/** Mark tasks fixed after a targeted improvement + regression pass. */
export function markTasksFixed(taskIds: string[]): EngineeringTask[] {
  const tasks = loadEngineeringQueue().map((t) =>
    taskIds.includes(t.taskId)
      ? { ...t, status: "FIXED" as const, updatedAt: new Date().toISOString() }
      : t,
  );
  saveEngineeringQueue(tasks);
  return tasks;
}
