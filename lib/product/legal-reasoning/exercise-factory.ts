/**
 * Generate structured hypothetical transaction exercises from authentic summaries.
 * Synthetic assumptions are explicit. AI answers are never ground truth.
 */

import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import type { ExerciseDefinition } from "../covenant-intelligence-loop/types";
import { inferTransactionKind, type TransactionKind } from "./transaction-deps";

export interface GeneratedExercise {
  exercise: ExerciseDefinition;
  sourceId: string;
  syntheticAssumptions: string[];
  groundedCategories: string[];
  note: string;
}

const AMOUNT_VARIANTS = [25, 50, 100, 250];

function baseEx(partial: Omit<ExerciseDefinition, "version"> & { version?: string }): ExerciseDefinition {
  return { version: partial.version ?? "generated.v1", ...partial };
}

function familyFor(kind: TransactionKind): ExerciseDefinition["family"] {
  switch (kind) {
    case "SECURED_DEBT":
    case "UNSECURED_DEBT":
    case "REFINANCING":
    case "LIABILITY_MANAGEMENT":
      return kind === "SECURED_DEBT" ? "LIENS" : "DEBT_INCURRENCE";
    case "RESTRICTED_PAYMENT":
      return "RESTRICTED_PAYMENTS";
    case "INVESTMENT":
    case "SUBSIDIARY_DESIGNATION":
      return "INVESTMENTS";
    case "ACQUISITION":
      return "MULTI_STEP";
    case "ASSET_SALE":
      return "ASSET_SALES";
    default:
      return "MULTI_STEP";
  }
}

/**
 * Build variant exercises grounded in categories present on an authentic source.
 */
export function generateExercisesFromSource(params: {
  sourceId: string;
  documentTitle: string;
  items: CovenantSummaryItem[];
  maxVariants?: number;
}): GeneratedExercise[] {
  const cats = [...new Set(params.items.map((i) => i.category))];
  const out: GeneratedExercise[] = [];
  const max = params.maxVariants ?? 8;

  const seeds: Array<{
    kind: TransactionKind;
    question: (amt: number) => string;
    required: string[];
    tags: string[];
    family?: ExerciseDefinition["family"];
    assumptions: (amt: number) => string[];
  }> = [
    {
      kind: "SECURED_DEBT",
      question: (amt) =>
        `As of a synthetic evaluation date 2024-12-31, can the Borrower incur $${amt} million of secured Indebtedness? Identify restrictions, lien permissions, ratio tests, and shared-capacity issues.`,
      required: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
      tags: ["generated", "secured", "synthetic-date"],
      assumptions: (amt) => [
        `SYNTHETIC: proposed principal = $${amt}000000`,
        "SYNTHETIC: evaluationDate = 2024-12-31",
        "SYNTHETIC: no Event of Default assumed unless document requires testing",
        "SYNTHETIC: prior basket usage unknown — remaining capacity not inventable",
      ],
    },
    {
      kind: "RESTRICTED_PAYMENT",
      question: (amt) =>
        `Can the Borrower make a $${amt} million Restricted Payment (dividend) using Available Amount / builder capacity? List conditions and definitions.`,
      required: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
      tags: ["generated", "rp", "builder"],
      assumptions: (amt) => [
        `SYNTHETIC: proposed RP = $${amt}000000`,
        "SYNTHETIC: cumulative net income / builder inputs not supplied",
      ],
    },
    {
      kind: "ACQUISITION",
      question: (amt) =>
        `Can a Restricted Subsidiary acquire a target for $${amt} million financed with acquisition Indebtedness and related Liens?`,
      required: ["DEBT_INCURRENCE", "RESTRICTED_PAYMENTS_INVESTMENTS", "LIENS_SECURED_DEBT"],
      tags: ["generated", "acquisition"],
      family: "MULTI_STEP",
      assumptions: (amt) => [
        `SYNTHETIC: purchase price = $${amt}000000`,
        "SYNTHETIC: target becomes Restricted Subsidiary unless designation analyzed",
      ],
    },
    {
      kind: "ASSET_SALE",
      question: () =>
        "If the Borrower sells a material business unit, what reinvestment / mandatory prepayment rules apply?",
      required: ["ASSET_SALES"],
      tags: ["generated", "asset-sale"],
      assumptions: () => ["SYNTHETIC: disposition is outside ordinary course", "SYNTHETIC: Net Proceeds amount unspecified"],
    },
    {
      kind: "LIABILITY_MANAGEMENT",
      question: () =>
        "Analyze an open-market repurchase / exchange of existing notes for new secured notes — debt, lien, and RP interactions.",
      required: ["DEBT_INCURRENCE", "LIENS_SECURED_DEBT"],
      tags: ["generated", "lme"],
      family: "MULTI_STEP",
      assumptions: () => [
        "SYNTHETIC: exchange is with existing creditors; terms differ from original notes",
        "SYNTHETIC: no stacking assumed without shared-capacity analysis",
      ],
    },
    {
      kind: "SUBSIDIARY_DESIGNATION",
      question: () =>
        "What investment capacity and conditions apply to designating a Restricted Subsidiary as Unrestricted?",
      required: ["RESTRICTED_PAYMENTS_INVESTMENTS"],
      tags: ["generated", "designation"],
      family: "INVESTMENTS",
      assumptions: () => ["SYNTHETIC: designation candidate is wholly owned Restricted Subsidiary"],
    },
    {
      kind: "REFINANCING",
      question: (amt) =>
        `Can the Borrower refinance $${amt} million of existing Indebtedness with new loans of equal principal?`,
      required: ["DEBT_INCURRENCE"],
      tags: ["generated", "refinance"],
      assumptions: (amt) => [
        `SYNTHETIC: refinanced principal = $${amt}000000`,
        "SYNTHETIC: maturity/pricing may differ — check refinancing definition",
      ],
    },
  ];

  for (const seed of seeds) {
    const present = seed.required.every((c) => cats.includes(c as CovenantSummaryItem["category"]));
    if (!present) continue;
    for (const amt of AMOUNT_VARIANTS) {
      if (out.length >= max) break;
      const q = seed.question(amt);
      // Skip amount variants for questions that ignore amount
      if (!q.includes(String(amt)) && amt !== AMOUNT_VARIANTS[0]) continue;
      const id = `gen.${params.sourceId.slice(0, 12)}.${seed.kind.toLowerCase()}.${amt}`;
      out.push({
        exercise: baseEx({
          exerciseId: id.slice(0, 80),
          family: seed.family ?? familyFor(seed.kind),
          title: `${seed.kind} $${amt}M — ${params.documentTitle.slice(0, 48)}`,
          question: q,
          amountMillions: amt,
          tags: seed.tags,
          requiredCategories: seed.required,
          requiredFinancialInputs: seed.kind.includes("DEBT") || seed.kind === "SECURED_DEBT"
            ? ["totalDebt", "ebitda"]
            : seed.kind === "RESTRICTED_PAYMENT"
              ? ["cumulativeNetIncome"]
              : [],
        }),
        sourceId: params.sourceId,
        syntheticAssumptions: seed.assumptions(amt),
        groundedCategories: seed.required.filter((c) => cats.includes(c as CovenantSummaryItem["category"])),
        note: "Generated from authentic categories. Expected answers are NOT ground truth — score retrieval/structure only.",
      });
    }
    if (out.length >= max) break;
  }

  // Ensure inferTransactionKind agrees with generated questions
  return out.filter((g) => {
    const inferred = inferTransactionKind(g.exercise.question);
    return inferred !== null;
  });
}
