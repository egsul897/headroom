/**
 * Structured 10-step transaction analysis checklist.
 * Produces AI-proposed interpretation scaffolding; executable authority stays gated.
 */

import {
  inferTransactionKind,
  retrieveTransactionDependencies,
  type TaggedProvision,
  type TransactionDependencyBundle,
  type TransactionKind,
} from "./transaction-deps";
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";

export interface AnalysisChecklistStep {
  step: number;
  name: string;
  status: "ADDRESSED" | "PARTIAL" | "MISSING";
  findings: string[];
}

export interface TransactionAnalysisScaffold {
  transactionKind: TransactionKind;
  steps: AnalysisChecklistStep[];
  dependencyBundle: TransactionDependencyBundle;
  supportedPathwayHints: string[];
  alternativeInterpretations: string[];
  limitations: string[];
  /** Always 0 — scaffold is never certified executable authority. */
  promotedToLegalTruth: 0;
}

type ItemRef = CovenantSummaryItem & { sourceId: string; documentTitle: string };

function step(
  n: number,
  name: string,
  status: AnalysisChecklistStep["status"],
  findings: string[],
): AnalysisChecklistStep {
  return { step: n, name, status, findings };
}

function byRole(provisions: TaggedProvision[], role: TaggedProvision["role"]): TaggedProvision[] {
  return provisions.filter((p) => p.role === role);
}

/**
 * Run the 10-step analysis over workspace summary items for a contemplated transaction.
 */
export function buildTransactionAnalysisScaffold(params: {
  question: string;
  transactionKind?: TransactionKind;
  items: ItemRef[];
}): TransactionAnalysisScaffold | null {
  const kind = params.transactionKind ?? inferTransactionKind(params.question);
  if (!kind) return null;

  const bundle = retrieveTransactionDependencies({
    transactionKind: kind,
    items: params.items,
  });

  const restrictions = byRole(bundle.provisions, "RESTRICTION_CANDIDATE");
  const permissions = byRole(bundle.provisions, "PERMISSION_CANDIDATE");
  const definitions = byRole(bundle.provisions, "DEFINITION");
  const withConditions = bundle.provisions.filter((p) =>
    params.items.some(
      (i) =>
        i.sectionRef === p.sectionRef &&
        ((i.conditions?.length ?? 0) > 0 || (i.exceptions?.length ?? 0) > 0),
    ),
  );
  const multiDoc = new Set(bundle.provisions.map((p) => p.sourceId)).size > 1;
  const financialPatterns = bundle.patternHits.filter((p) =>
    /ratio|available-amount|builder|greater-of|incremental|cure/.test(p),
  );
  const usagePatterns = bundle.patternHits.filter((p) => /shared-capacity|reclassification|builder/.test(p));

  const steps: AnalysisChecklistStep[] = [
    step(
      1,
      "Identify potentially applicable restrictions",
      restrictions.length ? "ADDRESSED" : bundle.missingCategories.length ? "MISSING" : "PARTIAL",
      restrictions.slice(0, 8).map((p) => `${p.documentTitle} §${p.sectionRef} (${p.category})`),
    ),
    step(
      2,
      "Retrieve relevant permissions and exceptions",
      permissions.length ? "ADDRESSED" : "PARTIAL",
      permissions.slice(0, 8).map((p) => `${p.documentTitle} §${p.sectionRef} patterns=${p.patternIds.join(",") || "—"}`),
    ),
    step(
      3,
      "Resolve controlling definitions",
      definitions.length ? "ADDRESSED" : "PARTIAL",
      definitions.length
        ? definitions.slice(0, 6).map((p) => `§${p.sectionRef} ${p.heading}`)
        : ["No definition-role provisions retrieved — check definedTermsSample on summaries."],
    ),
    step(
      4,
      "Identify conditions and provisos",
      withConditions.length ? "ADDRESSED" : "PARTIAL",
      withConditions.slice(0, 6).map((p) => `§${p.sectionRef}`),
    ),
    step(
      5,
      "Resolve cross-document restrictions",
      multiDoc ? "ADDRESSED" : "PARTIAL",
      multiDoc
        ? [`${new Set(bundle.provisions.map((p) => p.sourceId)).size} documents in dependency closure`]
        : ["Single-document closure — confirm amendment package completeness separately."],
    ),
    step(
      6,
      "Determine required financial tests",
      financialPatterns.length ? "ADDRESSED" : "MISSING",
      financialPatterns.length
        ? financialPatterns.map((p) => `Pattern ${p}`)
        : ["No ratio/builder/incremental pattern hits — financial tests may still exist in unsummarized text."],
    ),
    step(
      7,
      "Identify historical usage dependencies",
      usagePatterns.length ? "ADDRESSED" : "PARTIAL",
      usagePatterns.length
        ? usagePatterns.map((p) => `Pattern ${p} — requires ledger for remaining capacity`)
        : ["No shared-capacity/reclassification pattern hits in retrieved text."],
    ),
    step(
      8,
      "Enumerate supported contractual pathways",
      permissions.length ? "PARTIAL" : "MISSING",
      permissions.slice(0, 5).map(
        (p) => `Hypothesis pathway via §${p.sectionRef} (${p.patternIds.join(", ") || "unpatterned"}) — counsel review required`,
      ),
    ),
    step(
      9,
      "Identify alternative interpretations",
      permissions.length > 1 || restrictions.length > 0 ? "PARTIAL" : "MISSING",
      [
        permissions.length > 1
          ? "Multiple permission candidates — do not assume stacking without shared-capacity analysis."
          : "Limited alternative paths from retrieved permissions.",
        ...bundle.limitations.slice(0, 2),
      ],
    ),
    step(
      10,
      "Explain limitations and missing information",
      "ADDRESSED",
      [
        ...bundle.limitations,
        ...(bundle.missingCategories.length
          ? [`Missing seed categories: ${bundle.missingCategories.join(", ")}`]
          : []),
      ],
    ),
  ];

  return {
    transactionKind: kind,
    steps,
    dependencyBundle: bundle,
    supportedPathwayHints: steps[7]!.findings,
    alternativeInterpretations: steps[8]!.findings,
    limitations: steps[9]!.findings,
    promotedToLegalTruth: 0,
  };
}
