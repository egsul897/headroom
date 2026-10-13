/**
 * Consolidated EBITDA from underlying financial line items + operative
 * contractual adjustment definition — compiled to IR and evaluated with the
 * existing runtime. Not a separate computation engine.
 *
 * Does not treat a pre-collapsed EBITDA leaf as a build-up.
 */

import type { IRExpression } from "@/lib/contract-model/ir/types";
import {
  evaluateExpression,
  fixtureInputResolver,
  metricInput,
  money,
  rational,
  rationalFromNumber,
  toApproximateNumber,
  type FinancialSnapshot,
  type InputProvenance,
} from "@/lib/contract-model/north-star-bridge";
import { CAPACITY_DISCLAIMER } from "./disclaimer";
import { resolveEbitdaLineApproval } from "./evidence";
import { withLeverageExprId } from "./expr-id";
import type {
  ApprovedFinancialLineItem,
  ClassificationMethod,
  ContractualEligibility,
  DefinitionText,
  EbitdaBuildupSummary,
  FinancialInputAuthority,
} from "./types";

export interface EbitdaBuildupRequest {
  companyId: string;
  instrumentKey: string;
  ebitdaDefinition: DefinitionText;
  lineItems: ApprovedFinancialLineItem[];
  expectedPeriod?: string | null;
  /**
   * Snapshot status for Phase 4B approval resolution.
   * Reconstructions must be DRAFT or REVIEW_REQUIRED — never silently APPROVED.
   */
  evidenceSnapshotStatus?: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED";
  /** Persisted NS-4 APPROVED snapshots for binding / resolve. */
  ns4Snapshots?: FinancialSnapshot[];
  ns4SnapshotId?: string | null;
  /** Caller asserts definition-bound eligibility (default false). */
  contractualEligibilityBound?: boolean;
}

function parseNumeric(serialized: { type: string; amount?: string; value?: string } | null): number | null {
  if (!serialized) return null;
  const raw = serialized.type === "MONEY" ? serialized.amount : serialized.value;
  if (raw == null) return null;
  try {
    if (raw.includes("/")) {
      const [num, den] = raw.split("/");
      if (!num || !den) return null;
      return toApproximateNumber(rational(BigInt(num), BigInt(den)));
    }
    return toApproximateNumber(rationalFromNumber(Number(raw)));
  } catch {
    return null;
  }
}

type DefCategory =
  | "CNI"
  | "TAX"
  | "INTEREST"
  | "DA"
  | "SBC"
  | "RESTRUCTURING"
  | "NON_CASH"
  | "GAIN_SUBTRACT"
  | "OTHER";

function detectDefinitionCategories(text: string): Set<DefCategory> {
  const t = text.toLowerCase();
  const cats = new Set<DefCategory>(["CNI"]);
  if (/income\s+tax|tax\s+expense/.test(t)) cats.add("TAX");
  if (/interest/.test(t)) cats.add("INTEREST");
  if (/depreciation|amortization/.test(t)) cats.add("DA");
  if (/stock-based|share-based|stock\s+based|share\s+based/.test(t)) cats.add("SBC");
  if (/restructuring|integration|transaction\s+cost/.test(t)) cats.add("RESTRUCTURING");
  // General non-cash / impairment prongs — not the narrow "non-cash stock-based" SBC clause.
  if (
    /non-cash\s+(expenses?|charges?|losses?|items?|write)/.test(t) ||
    /\bimpairment\b/.test(t) ||
    /other\s+non-cash/.test(t)
  ) {
    cats.add("NON_CASH");
  }
  if (/minus\s+non-cash|minus\s+.*gain|less\s+.*gain|non-cash\s+items\s+increasing/.test(t)) cats.add("GAIN_SUBTRACT");
  return cats;
}

function detectRestructuringCapPct(text: string): number | null {
  const m = text.match(/cap\s+of\s+(\d+(?:\.\d+)?)\s*%\s+of\s+consolidated\s+ebitda/i);
  return m ? Number(m[1]) : null;
}

function categorizeLine(item: ApprovedFinancialLineItem): DefCategory {
  const label = item.label.toLowerCase();
  const key = item.key.toLowerCase();
  if (/consolidated\s+net\s+income|net\s+earnings|net\s+income|^cni$/.test(label) || key === "cni") return "CNI";
  if (/gain\s+on\s+sale|gain\s+on\s+/.test(label)) return "GAIN_SUBTRACT";
  if (/income\s+tax\s+benefit|tax\s+benefit/.test(label)) return "TAX";
  if (/income\s+tax|tax\s+expense/.test(label)) return "TAX";
  if (/interest/.test(label)) return "INTEREST";
  if (/depreciation|amortization/.test(label)) return "DA";
  if (/stock-based|share-based|stock\s+based|share\s+based|compensation/.test(label) && /stock|share|sbc/.test(label + key))
    return "SBC";
  if (/restructuring|integration|transaction\s+cost/.test(label)) return "RESTRUCTURING";
  if (/impairment|write-down|write.?off|non-cash/.test(label)) return "NON_CASH";
  return "OTHER";
}

function roleForCategory(cat: DefCategory, item: ApprovedFinancialLineItem, definitionText: string): "BASE" | "ADD" | "SUBTRACT" | "UNKNOWN" {
  if (item.explicitRole) return item.explicitRole;
  if (cat === "CNI") return "BASE";
  if (cat === "GAIN_SUBTRACT") return "SUBTRACT";
  if (cat === "TAX") {
    if (/tax\s+benefit/i.test(item.label) && item.amountMillions > 0) return "SUBTRACT";
    return "ADD";
  }
  if (cat === "OTHER") return "UNKNOWN";
  if (["INTEREST", "DA", "SBC", "RESTRUCTURING", "NON_CASH"].includes(cat)) return "ADD";
  if (/minus\s+non-cash\s+items\s+increasing/i.test(definitionText) && /gain/.test(item.label.toLowerCase())) {
    return "SUBTRACT";
  }
  return "UNKNOWN";
}

function classificationMethodFor(item: ApprovedFinancialLineItem): ClassificationMethod {
  return item.explicitRole ? "EXPLICIT_BINDING" : "HEURISTIC_KEYWORD";
}

/**
 * Compile Consolidated EBITDA = CNI + Σ addbacks − Σ subtractions into IR ADD/SUBTRACT.
 */
export function compileEbitdaBuildupExpression(args: {
  companyId: string;
  instrumentKey: string;
  ebitdaDefinition: DefinitionText;
  classified: Array<{ item: ApprovedFinancialLineItem; role: "BASE" | "ADD" | "SUBTRACT"; category: DefCategory }>;
}): { expression: IRExpression; formulaDisplay: string } {
  const { companyId, instrumentKey, ebitdaDefinition } = args;
  const prov = {
    documentId: ebitdaDefinition.documentId,
    sourceNodeKey: null,
    sourceCitation: `${ebitdaDefinition.sectionRef} — ${ebitdaDefinition.termName}`,
    excerpt: ebitdaDefinition.fullText.slice(0, 400),
  };

  const metric = (key: string): IRExpression =>
    withLeverageExprId({
      kind: "METRIC_REFERENCE",
      type: "MONEY",
      metricName: key,
      companyId,
      instrumentKey,
      resolvedDefinitionId: null,
      provenance: prov,
    });

  const base = args.classified.find((c) => c.role === "BASE");
  if (!base) {
    throw new Error("compileEbitdaBuildupExpression requires a BASE (Consolidated Net Income) line");
  }

  let expr: IRExpression = metric(base.item.key);
  const parts = [`${base.item.label}`];

  for (const row of args.classified) {
    if (row.role === "BASE") continue;
    if (row.role === "ADD") {
      expr = withLeverageExprId({
        kind: "ADD",
        type: "MONEY",
        operands: [expr, metric(row.item.key)],
        provenance: prov,
      });
      parts.push(`+ ${row.item.label}`);
    } else {
      expr = withLeverageExprId({
        kind: "SUBTRACT",
        type: "MONEY",
        left: expr,
        right: metric(row.item.key),
        provenance: prov,
      });
      parts.push(`− ${row.item.label}`);
    }
  }

  return { expression: expr, formulaDisplay: parts.join(" ") };
}

function weakestAuthority(items: ApprovedFinancialLineItem[]): FinancialInputAuthority {
  if (items.some((i) => i.authority === "CALLER_SUPPLIED")) return "CALLER_SUPPLIED";
  if (items.some((i) => i.authority === "SEEDED_SNAPSHOT")) return "SEEDED_SNAPSHOT";
  return "APPROVED_PERIOD_MATCHED";
}

function emptySummary(partial: Partial<EbitdaBuildupSummary> & Pick<EbitdaBuildupSummary, "status">): EbitdaBuildupSummary {
  return {
    valueMillions: null,
    formulaDisplay: null,
    lineItems: [],
    numericalTrace: [],
    unresolvedComponents: [],
    approvalResolution: [],
    citations: [],
    missingRequirements: [],
    limitations: [],
    authority: "CALLER_SUPPLIED",
    contractualEligibility: "UNRESOLVED",
    heuristicClassification: true,
    runtimeStatus: null,
    period: null,
    definitionIdentity: null,
    ns4SnapshotId: null,
    ...partial,
  };
}

function resolveContractualEligibility(args: {
  unresolved: string[];
  heuristic: boolean;
  bound: boolean;
}): ContractualEligibility {
  if (args.unresolved.length > 0) return "UNRESOLVED";
  if (args.heuristic && !args.bound) return "PROVISIONAL_HEURISTIC";
  if (args.bound && !args.heuristic) return "DEFINITION_BOUND";
  if (args.bound && args.heuristic) return "PROVISIONAL_HEURISTIC";
  return "PROVISIONAL_HEURISTIC";
}

/**
 * Calculate Consolidated EBITDA from line items under the operative definition.
 */
export function calculateEbitdaBuildup(req: EbitdaBuildupRequest): EbitdaBuildupSummary {
  const def = req.ebitdaDefinition;
  const limitations: string[] = [];
  const missing: string[] = [];
  const unresolved: string[] = [];
  const defCats = detectDefinitionCategories(def.fullText);
  const capPct = detectRestructuringCapPct(def.fullText);
  const definitionIdentity = `${def.documentId}::${def.sectionRef}::${def.termName}`;
  const period = req.expectedPeriod ?? req.lineItems[0]?.period ?? null;

  if (!/\b(consolidated\s+net\s+income|net\s+income|net\s+earnings)\b/i.test(def.fullText)) {
    return emptySummary({
      status: "UNSUPPORTED_DEFINITION_SHAPE",
      citations: [`${def.sectionRef} — ${def.termName}`],
      limitations: [
        `EBITDA definition does not clearly start from Consolidated Net Income — build-up refused (${CAPACITY_DISCLAIMER})`,
      ],
      definitionIdentity,
      period,
    });
  }

  // Discretionary prongs without matching line items
  if (/\brun[- ]rate|synerg(?:y|ies)|extraordinary|non-recurring/i.test(def.fullText)) {
    const hasMatching = req.lineItems.some((i) => /synerg|run[- ]rate|extraordinary|non-recurring/i.test(i.label));
    if (!hasMatching) {
      unresolved.push(
        "Definition contemplates run-rate/synergy/extraordinary add-backs — no matching source-backed line items supplied",
      );
    }
  }

  if (capPct != null) {
    unresolved.push(
      `Restructuring/integration add-back is subject to a ${capPct}% of Consolidated EBITDA cap — contractual cap eligibility unresolved (heuristic application is provisional)`,
    );
  }

  limitations.push(
    "Adjustment classification uses HEURISTIC_KEYWORD matching unless explicitRole is supplied — keyword matching is not verified legal interpretation.",
  );

  // Gains: include when evidence supplies them (common reconstruction), even if CA text is silent —
  // but mark unresolved vs definition when definition lacks an explicit subtract-gains prong.
  if (!defCats.has("GAIN_SUBTRACT") && req.lineItems.some((i) => categorizeLine(i) === "GAIN_SUBTRACT")) {
    unresolved.push(
      "Gain subtraction line items present in evidence but not explicitly named in the operative EBITDA definition text — applied as reconstruction schedule, not as definition-certified adjustments",
    );
  }
  if (!defCats.has("NON_CASH") && req.lineItems.some((i) => categorizeLine(i) === "NON_CASH")) {
    unresolved.push(
      "Non-cash / impairment line items present in evidence but not explicitly named in the operative EBITDA definition text — applied as reconstruction schedule",
    );
  }

  const classified: Array<{
    item: ApprovedFinancialLineItem;
    role: "BASE" | "ADD" | "SUBTRACT";
    category: DefCategory;
    classificationMethod: ClassificationMethod;
  }> = [];

  for (const item of req.lineItems) {
    if (req.expectedPeriod && item.period !== req.expectedPeriod) {
      missing.push(`Period mismatch for ${item.label}: got ${item.period}, expected ${req.expectedPeriod}`);
      unresolved.push(`Period mismatch for ${item.label}: got ${item.period}, expected ${req.expectedPeriod}`);
      continue;
    }
    const category = categorizeLine(item);
    let role = roleForCategory(category, item, def.fullText);
    const method = classificationMethodFor(item);

    // Allow reconstruction schedule items (gains / impairment) when evidence is the public-filing schedule
    if (role === "UNKNOWN" && (category === "GAIN_SUBTRACT" || category === "NON_CASH")) {
      role = category === "GAIN_SUBTRACT" ? "SUBTRACT" : "ADD";
    }

    if (role === "UNKNOWN") {
      missing.push(`Unrecognized line item role for "${item.label}" under the EBITDA definition`);
      continue;
    }
    classified.push({ item, role, category, classificationMethod: method });
  }

  if (!classified.some((c) => c.role === "BASE")) {
    missing.push("Consolidated Net Income (BASE)");
  }

  const heuristicClassification = classified.some((c) => c.classificationMethod === "HEURISTIC_KEYWORD");

  // Phase 4B approval resolution — never invent APPROVED
  const evidenceStatus = req.evidenceSnapshotStatus ?? "REVIEW_REQUIRED";
  const approval = req.lineItems.length
    ? resolveEbitdaLineApproval({
        companyId: req.companyId,
        instrumentKey: req.instrumentKey,
        lineItems: req.lineItems,
        snapshotStatus: evidenceStatus,
        ns4Snapshots: req.ns4Snapshots,
      })
    : { approvals: [], anyApproved: false, authority: "CALLER_SUPPLIED" as const };

  if (!approval.anyApproved && req.lineItems.length > 0) {
    unresolved.push(
      `Phase 4B resolve (APPROVED-only): evidence snapshot status is ${evidenceStatus} — financial inputs are NOT_APPROVED`,
    );
  }

  const toTrace = (c: (typeof classified)[number]) => ({
    key: c.item.key,
    label: c.item.label,
    amountMillions: c.item.amountMillions,
    role: c.role,
    definitionMatch: c.category,
    classificationMethod: c.classificationMethod,
    ns4SnapshotId: c.item.ns4SnapshotId ?? req.ns4SnapshotId ?? null,
  });

  if (missing.length > 0) {
    const eligibility = resolveContractualEligibility({
      unresolved,
      heuristic: heuristicClassification,
      bound: Boolean(req.contractualEligibilityBound),
    });
    return emptySummary({
      status: "MISSING_INPUTS",
      lineItems: classified.map(toTrace),
      unresolvedComponents: unresolved,
      approvalResolution: approval.approvals,
      citations: [`${def.sectionRef} — ${def.termName}`],
      missingRequirements: missing,
      limitations,
      authority: req.lineItems.length ? weakestAuthority(req.lineItems) : "CALLER_SUPPLIED",
      contractualEligibility: eligibility,
      heuristicClassification,
      period,
      definitionIdentity,
      ns4SnapshotId: req.ns4SnapshotId ?? null,
    });
  }

  // Optional restructuring cap: if over pre-cap base × pct, clamp and disclose
  let working = classified;
  if (capPct != null) {
    const restructuring = classified.find((c) => c.category === "RESTRUCTURING");
    if (restructuring) {
      const preCap = classified
        .filter((c) => c !== restructuring)
        .reduce((s, c) => {
          if (c.role === "BASE" || c.role === "ADD") return s + c.item.amountMillions;
          return s - c.item.amountMillions;
        }, 0);
      const cap = (capPct / 100) * preCap;
      if (restructuring.item.amountMillions > cap) {
        working = classified.map((c) =>
          c === restructuring
            ? { ...c, item: { ...c.item, amountMillions: cap, label: `${c.item.label} (capped at ${capPct}%)` } }
            : c,
        );
        limitations.push(
          `Restructuring add-back capped at ${capPct}% of pre-cap EBITDA base (${cap.toFixed(3)} $M).`,
        );
      }
    }
  }

  const { expression, formulaDisplay } = compileEbitdaBuildupExpression({
    companyId: req.companyId,
    instrumentKey: req.instrumentKey,
    ebitdaDefinition: def,
    classified: working,
  });

  const authority = approval.anyApproved ? "APPROVED_PERIOD_MATCHED" : weakestAuthority(working.map((c) => c.item));
  const provenance: InputProvenance = {
    source:
      authority === "APPROVED_PERIOD_MATCHED"
        ? "approved-period-matched-line-items"
        : authority === "SEEDED_SNAPSHOT"
          ? "seeded-snapshot-line-items"
          : "caller-supplied-line-items",
    sourceVersion: "contractual-leverage.ebitda-buildup.v1",
    selectionMethod: "EXACT_CALLER_SUPPLIED",
    identityStrength: "CONTRACT_NAME_ONLY",
    currency: "USD",
    note: `Line-item authority: ${authority}; definition=${definitionIdentity}`,
  };

  const metrics = working.map((c) =>
    metricInput(
      c.item.key,
      money(rationalFromNumber(c.item.amountMillions), "USD", { exprId: null, inputKeys: [c.item.key] }),
      provenance,
    ),
  );

  const ev = evaluateExpression({
    expression,
    inputs: fixtureInputResolver({ metrics }),
    context: { companyId: req.companyId, instrumentKey: req.instrumentKey },
  });

  const lineItems = working.map(toTrace);
  const eligibility = resolveContractualEligibility({
    unresolved,
    heuristic: heuristicClassification,
    bound: Boolean(req.contractualEligibilityBound),
  });

  if (ev.status !== "EXECUTABLE" || !ev.value) {
    return emptySummary({
      status: "MISSING_INPUTS",
      formulaDisplay,
      lineItems,
      unresolvedComponents: unresolved,
      approvalResolution: approval.approvals,
      citations: [`${def.sectionRef} — ${def.termName}`, ...ev.provenance.sourceCitations],
      missingRequirements: ev.missingInputKeys.length ? ev.missingInputKeys : ev.diagnostics.map((d) => d.message),
      limitations,
      authority,
      contractualEligibility: eligibility,
      heuristicClassification,
      runtimeStatus: ev.status,
      period,
      definitionIdentity,
      ns4SnapshotId: req.ns4SnapshotId ?? null,
    });
  }

  const valueMillions = parseNumeric(ev.value as { type: string; amount?: string });
  const numericalTrace: Array<{ label: string; amountMillions: number; sign: "+" | "−" | "=" }> = working.map(
    (c) => ({
      label: c.item.label,
      amountMillions: c.item.amountMillions,
      sign: (c.role === "SUBTRACT" ? "−" : "+") as "+" | "−",
    }),
  );
  if (valueMillions != null) {
    numericalTrace.push({ label: "Consolidated EBITDA (build-up)", amountMillions: valueMillions, sign: "=" });
  }

  limitations.push(CAPACITY_DISCLAIMER);

  return {
    status: "COMPUTED",
    valueMillions,
    formulaDisplay,
    lineItems,
    numericalTrace,
    unresolvedComponents: unresolved,
    approvalResolution: approval.approvals,
    citations: [...new Set([`${def.sectionRef} — ${def.termName}`, ...ev.provenance.sourceCitations])],
    missingRequirements: [],
    limitations,
    authority,
    contractualEligibility: eligibility,
    heuristicClassification,
    runtimeStatus: ev.status,
    period,
    definitionIdentity,
    ns4SnapshotId: req.ns4SnapshotId ?? null,
  };
}
